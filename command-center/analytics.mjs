import {json,cookie,pseudonym} from './security.mjs';
export const DAY=86400000;
export const kinds=new Set(['page','section','player','fighter','game','team','conference','matchup','card','statistic','streak','search','filter','error','location']);
export function period(range,now=Date.now()){
  const today=Date.parse(new Date(now).toISOString().slice(0,10));
  const start=range==='today'?today:range==='year'?Date.UTC(new Date(now).getUTCFullYear(),0,1):range==='all'?0:today-({'7':6,'30':29,'90':89}[range]??29)*DAY;
  return {start,end:now,previousStart:start-(now-start),previousEnd:start};
}
export function cleanEvent(body){
  if(!body||!kinds.has(body.kind)||!['NFL','NCAA','UFC','LAB'].includes(body.sport)||!['home','games','players','streaks','ufc','athlete','teams','conferences'].includes(body.section))return null;
  const entity=typeof body.entity==='string'&&/^[a-zA-Z0-9_.:| -]{1,100}$/.test(body.entity)?body.entity:'';
  // Searches and errors carry no free-form values, URLs, messages or stack traces.
  return {kind:body.kind,sport:body.sport,section:body.section,entity:body.kind==='search'?(entity==='tits-mcgee-match'?'tits-mcgee-match':''):['error','filter'].includes(body.kind)?'':entity};
}

// Server-side reverse geocoding: coarse 0.1-degree points only.
// Cache names in the existing metadata table, never raw GPS coordinates.
async function nearbyTown(env,lat,lon){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const key='nearest-town-v3:'+lat.toFixed(1)+','+lon.toFixed(1);
 const db=env.ANALYTICS;
 const saved=await db.prepare('SELECT value FROM meta WHERE key=?').bind(key).first();
 if(saved?.value)return saved.value;
 if(env.PUBLIC_ORIGIN==='https://example.com')return null;
 let name=null;
 try{
  // Find an actual named settlement near the coarse point, not the containing county.
  const query='[out:json][timeout:8];node(around:25000,'+lat+','+lon+')['+'"place"~"^(city|town|village|hamlet)$"'+']['+'"name"'+'];out body 100;';
  const response=await fetch('https://overpass.kumi.systems/api/interpreter',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(10000)
  });
  if(response.ok){
   const data=await response.json();
   const points=(data.elements||[]).filter(p=>p.type==='node'&&typeof p.tags?.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
   const radians=n=>n*Math.PI/180;
   const distance=p=>{const a=radians(p.lat-lat),b=radians(p.lon-lon),x=Math.sin(a/2)**2+Math.cos(radians(lat))*Math.cos(radians(p.lat))*Math.sin(b/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(x)))};
   points.sort((x,y)=>distance(x)-distance(y));
   if(points.length)name=points[0].tags.name.slice(0,80)+' (nearest town, approx.)';
  }
 }catch{}
 // Never cache failures; third-party availability can vary.
 if(name)await db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').bind(key,name).run();
 return name;
}
export async function collect(request,env){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!env.ANALYTICS||!env.ANALYTICS_SECRET||env.ANALYTICS_SECRET.length<32)return json({error:'Collection unavailable'},503);
  if(new URL(request.url).origin!==env.PUBLIC_ORIGIN||request.headers.get('Origin')!==env.PUBLIC_ORIGIN||request.headers.get('Sec-Fetch-Site')!=='same-origin')return json({error:'Origin denied'},403);
  if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|spider|crawler|headless/i.test(request.headers.get('User-Agent')||''))return new Response(null,{status:204});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'JSON required'},400);
  let raw='',bytes=0;const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2048){await reader.cancel();return json({error:'Payload too large'},413)}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode();
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  const e=cleanEvent(body);if(!e)return json({error:'Invalid event'},400);
  const shared=e.kind==='location'&&body.consent===true&&typeof body.lat==='number'&&typeof body.lon==='number'&&Number.isFinite(body.lat)&&Number.isFinite(body.lon)&&body.lat>=24&&body.lat<=50&&body.lon>=-125&&body.lon<=-66&&Math.abs(body.lat*10-Math.round(body.lat*10))<1e-7&&Math.abs(body.lon*10-Math.round(body.lon*10))<1e-7;
  if(e.kind==='location'&&!shared)return json({error:'Invalid coarse location'},400);
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10),db=env.ANALYTICS;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const old=cookie(request,'__Host-sanks_v'),v=uuid.test(old||'')?old:crypto.randomUUID();
  const id=await pseudonym(v,env.ANALYTICS_SECRET);
  const budget=await db.prepare('INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window WHERE window!=excluded.window OR count<2500 RETURNING count').bind('site-budget',Math.floor(now/DAY)).first();
  if(!budget){await db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').bind('collection_capped_'+day,String(now)).run();return json({error:'Daily collection budget reached'},429)}
  // Per-visitor rate limiting is bounded and atomic; IP addresses are never read.
  const gate=await db.prepare('INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window WHERE window!=excluded.window OR count<30 RETURNING count').bind(id,Math.floor(now/60000)).first();
  if(!gate)return json({error:'Rate limited'},429);
  const sid=crypto.randomUUID();
  const country=shared?'US':/^[A-Z]{2}$/.test(request.cf?.country||'')?request.cf.country:'ZZ';
  const state=country==='US'&&/^[A-Z]{2}$/.test(request.cf?.regionCode||'')?request.cf.regionCode:'--';
  const rawCity=String(request.cf?.city||'').normalize('NFKC').trim();
  const city=rawCity.length<=80&&/^[\p{L}\p{N} .,'-]+$/u.test(rawCity)?rawCity:'Unknown';
  const rawLat=Number(request.cf?.latitude),rawLon=Number(request.cf?.longitude);
  const lat=country==='US'&&request.cf?.latitude!=null&&Number.isFinite(rawLat)&&Math.abs(rawLat)<=90?Math.round(rawLat*10)/10:null;
  const lon=country==='US'&&request.cf?.longitude!=null&&Number.isFinite(rawLon)&&Math.abs(rawLon)<=180?Math.round(rawLon*10)/10:null;
  const areaCity=shared?'Browser-shared area':city;
  const areaState=shared?'BR':state;
  const areaLat=shared?body.lat:lat,areaLon=shared?body.lon:lon;
  const device=/iPad|Tablet/i.test(request.headers.get('User-Agent')||'')?'tablet':/Mobile|Android|iPhone/i.test(request.headers.get('User-Agent')||'')?'mobile':'desktop';
  let source='direct';try{const ref=new URL(body.referrer);source=ref.origin===env.PUBLIC_ORIGIN?'internal':ref.hostname.slice(0,100)}catch{}
  const eventId=crypto.randomUUID();
  const binds=[eventId,now,id,id,e.kind,e.sport,e.section,e.entity,country,state,device,source];
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('tracking_started',?)").bind(String(now)),
    db.prepare('INSERT INTO visitors VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(id,now,now),
    db.prepare('INSERT INTO days(day,visitor,views,is_returning) VALUES(?,?,?,CASE WHEN (SELECT first_seen FROM visitors WHERE id=?) < ? THEN 1 ELSE 0 END) ON CONFLICT(day,visitor) DO UPDATE SET views=views+excluded.views,is_returning=MAX(is_returning,excluded.is_returning)').bind(day,id,e.kind==='page'?1:0,id,Date.parse(day)),
    db.prepare('INSERT INTO sessions(id,visitor,started,last_seen,section,country,state) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE visitor=? AND last_seen>?)').bind(sid,id,now,now,e.section,country,state,id,now-30*60000),
    db.prepare('UPDATE sessions SET last_seen=?,section=?,country=?,state=? WHERE id=(SELECT id FROM sessions WHERE visitor=? ORDER BY last_seen DESC LIMIT 1)').bind(now,e.section,country,state,id),
    db.prepare('INSERT INTO events VALUES(?,?,?,(SELECT id FROM sessions WHERE visitor=? ORDER BY last_seen DESC LIMIT 1),?,?,?,?,?,?,?,?)').bind(...binds),
    db.prepare('INSERT INTO event_cities(event_id,city,state,country,lat,lon) VALUES(?,?,?,?,?,?)').bind(eventId,areaCity,areaState,country,areaLat,areaLon),
    db.prepare("INSERT INTO activity_totals(day,category,label,state,count) VALUES(?,?,?,?,1) ON CONFLICT(day,category,label,state) DO UPDATE SET count=count+1").bind(day,'event',e.kind,''),
    ...(e.kind==='search'&&e.entity==='tits-mcgee-match'?[db.prepare("INSERT INTO activity_totals(day,category,label,state,count) VALUES(?,?,?,?,1) ON CONFLICT(day,category,label,state) DO UPDATE SET count=count+1").bind(day,'named_search','tits-mcgee','')]:[]),
    ...(country==='US'&&!shared&&areaCity!=='Unknown'?[db.prepare("INSERT INTO activity_totals(day,category,label,state,count) VALUES(?,?,?,?,1) ON CONFLICT(day,category,label,state) DO UPDATE SET count=count+1").bind(day,'city',areaCity,areaState)]:[]),
    db.prepare('DELETE FROM event_cities WHERE event_id IN (SELECT id FROM events WHERE ts < ?)').bind(now-90*DAY),
    db.prepare('DELETE FROM events WHERE ts < ?').bind(now-90*DAY),
    db.prepare('DELETE FROM sessions WHERE last_seen < ?').bind(now-DAY),
    db.prepare("DELETE FROM limits WHERE key!='site-budget' AND window < ?").bind(Math.floor(now/60000)-60)
  ]);
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store','Set-Cookie':`__Host-sanks_v=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000`}});
}
export async function report(env,range,aggregation){
  const db=env.ANALYTICS;if(!db)return {available:false,reason:'D1 binding has not been configured.'};
  const now=Date.now(),p=period(range,now),since=new Date(p.start).toISOString().slice(0,10);
  const first=await db.prepare("SELECT value FROM meta WHERE key='tracking_started'").first();
  if(!first)return {available:true,trackingStarted:null,empty:true};
  const started=Number(first.value);
  const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
  const one=async(sql,...args)=>await db.prepare(sql).bind(...args).first();
  const summary=await one('SELECT COUNT(DISTINCT visitor) visitors,COALESCE(SUM(views),0) views,COUNT(DISTINCT CASE WHEN is_returning=1 THEN visitor END) "returning" FROM days WHERE day>=?',since);
  const previous=await one('SELECT COUNT(DISTINCT visitor) visitors,COUNT(*) views FROM events WHERE kind=\'page\' AND ts>=? AND ts<?',p.previousStart,p.previousEnd);
  // Distinct daily identifiers are unioned in SQL, never summed as unique visitors.
  const expr={daily:'day',weekly:"date(day, '-' || ((CAST(strftime('%w',day) AS INTEGER)+6)%7) || ' days')",monthly:"substr(day,1,7)",yearly:"substr(day,1,4)"}[aggregation]||'day';
  const history=await all(`SELECT ${expr} bucket,COUNT(DISTINCT visitor) visitors,SUM(views) views,COUNT(DISTINCT CASE WHEN is_returning=1 THEN visitor END) "returning" FROM days WHERE day>=? GROUP BY bucket ORDER BY bucket`,since);
  const detailStart=Math.max(p.start,now-90*DAY);
  const [states,countries,devices,sources,popularity,recent,active,visits,peaks,cities]=await Promise.all([
    all("SELECT state label,COUNT(DISTINCT visitor) visitors,COUNT(*) events FROM events WHERE ts>=? AND country='US' GROUP BY state ORDER BY visitors DESC",detailStart),
    all("SELECT country label,COUNT(DISTINCT visitor) visitors FROM events WHERE ts>=? AND country!='US' GROUP BY country ORDER BY visitors DESC",detailStart),
    all('SELECT device label,COUNT(DISTINCT visitor) visitors FROM events WHERE ts>=? GROUP BY device ORDER BY visitors DESC',detailStart),
    all("SELECT source label,COUNT(*) views FROM events WHERE ts>=? AND kind='page' GROUP BY source ORDER BY views DESC LIMIT 20",detailStart),
    all("SELECT sport,kind,entity label,COUNT(*) events FROM events WHERE ts>=? AND kind NOT IN ('page','error') GROUP BY sport,kind,entity ORDER BY events DESC LIMIT 100",detailStart),
    all('SELECT ts,section,state,country,kind FROM events WHERE ts>=? ORDER BY ts DESC LIMIT 20',now-5*60000),
    one('SELECT COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=?',now-5*60000),
    one('SELECT COUNT(DISTINCT session) visits FROM events WHERE ts>=? AND kind=\'page\'',detailStart),
    all("SELECT strftime('%H',ts/1000,'unixepoch') label,COUNT(*) views FROM events WHERE ts>=? AND kind='page' GROUP BY label ORDER BY label",detailStart),
    all("WITH preferred AS (\n SELECT e.visitor,c.city,c.state,c.country,c.lat,c.lon,\n ROW_NUMBER() OVER(PARTITION BY e.visitor ORDER BY CASE WHEN c.state='BR' THEN 0 ELSE 1 END,e.ts DESC) AS priority\n FROM events e JOIN event_cities c ON c.event_id=e.id\n WHERE e.ts>=? AND c.country='US' AND c.city!='Unknown'\n), selected AS (\n SELECT visitor,city,state,country,lat,lon FROM preferred WHERE priority=1\n), page_visits AS (\n SELECT visitor,COUNT(DISTINCT session) visits FROM events WHERE ts>=? AND kind='page' GROUP BY visitor\n)\nSELECT s.city label,s.state state,s.country country,s.lat lat,s.lon lon,\n COUNT(*) visitors,COALESCE(SUM(p.visits),0) visits\n FROM selected s LEFT JOIN page_visits p ON p.visitor=s.visitor\n GROUP BY s.city,s.state,s.country,s.lat,s.lon ORDER BY visits DESC,visitors DESC LIMIT 100",detailStart,detailStart)
  ]);
  // Resolve a bounded number of browser-shared areas; IP city names stay as supplied.
  // Avoid excessive third-party calls: no more than one uncached lookup per report.
  let geocoded=0;
  for(const row of cities){
    if(row.state!=='BR')continue;
    const key='nearest-town-v3:'+Number(row.lat).toFixed(1)+','+Number(row.lon).toFixed(1);
    const cached=await env.ANALYTICS.prepare('SELECT value FROM meta WHERE key=?').bind(key).first();
    let town=cached?.value||null;
    if(!town&&geocoded<1){geocoded++;town=await nearbyTown(env,Number(row.lat),Number(row.lon))}
    row.label=town&&town!=='unavailable'?town:'Browser-shared area (town unavailable)';
  }
  const specialSearch=await one("SELECT COALESCE(SUM(count),0) matches FROM activity_totals WHERE category='named_search' AND label='tits-mcgee' AND day>=?",since);
  const historicalCities=await all("SELECT label,state,SUM(count) visits FROM activity_totals WHERE category='city' AND day>=? GROUP BY label,state ORDER BY visits DESC LIMIT 100",since);
  const calendar={};for(const key of ['today','7','30','year','all']){const s=new Date(period(key,now).start).toISOString().slice(0,10);calendar[key]=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',s)).visitors}
  const month=new Date(now).toISOString().slice(0,7)+'-01';calendar.month=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',month)).visitors;
  const week=new Date(now);week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));calendar.week=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',week.toISOString().slice(0,10))).visitors;
  const comparisonAvailable=p.start>0&&p.previousStart>=started&&p.previousStart>=now-90*DAY;
  const capped=await all("SELECT substr(key,19) day FROM meta WHERE key LIKE 'collection_capped_%' ORDER BY key DESC LIMIT 90");
  const sections=await all('SELECT section label,COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=? GROUP BY section ORDER BY visitors DESC',now-5*60000);
  return {available:true,empty:false,trackingStarted:started,asOf:now,range,aggregation,summary,previous:comparisonAvailable?previous:null,history,states,cities,historicalCities,specialSearch,countries,devices,sources,popularity,recent,active:active.visitors,visits:visits.visits,peaks,calendar,detailStart,detailTruncated:detailStart>p.start,comparisonAvailable,collectionCappedDays:capped.map(x=>x.day),sections};
}
export async function liveReport(env){
  if(!env.ANALYTICS)return {available:false};
  const since=Date.now()-5*60000,db=env.ANALYTICS;
  const active=await db.prepare('SELECT COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=?').bind(since).first();
  const recent=(await db.prepare('SELECT ts,section,state,country,kind FROM events WHERE ts>=? ORDER BY ts DESC LIMIT 20').bind(since).all()).results;
  const sections=(await db.prepare('SELECT section label,COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=? GROUP BY section ORDER BY visitors DESC').bind(since).all()).results;
  return {available:true,asOf:Date.now(),active:active.visitors,recent,sections};
}
