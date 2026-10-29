import {json,cookie,pseudonym} from './security.mjs';
export const DAY=86400000;
export const kinds=new Set(['page','section','player','fighter','game','team','conference','matchup','card','statistic','streak','search','filter','error','location']);
export function period(range,now=Date.now()){
  const today=Date.parse(new Date(now).toISOString().slice(0,10));
  const start=range==='today'?today:range==='year'?Date.UTC(new Date(now).getUTCFullYear(),0,1):range==='all'?0:today-({'7':6,'30':29,'90':89}[range]??29)*DAY;
  const previousStart=range==='today'?start-DAY:start-(now-start);
  const previousEnd=range==='today'?now-DAY:start;
  return {start,end:now,previousStart,previousEnd};
}
export function cleanEvent(body){
  if(!body||!kinds.has(body.kind)||!['NFL','NCAA','UFC','LAB'].includes(body.sport)||!['home','games','players','streaks','ufc','athlete','teams','conferences'].includes(body.section))return null;
  const entity=typeof body.entity==='string'&&/^[a-zA-Z0-9_.:| -]{1,100}$/.test(body.entity)?body.entity:'';
  // Searches and errors carry no free-form values, URLs, messages or stack traces.
  return {kind:body.kind,sport:body.sport,section:body.section,entity:body.kind==='search'?(entity==='tits-mcgee-match'?'tits-mcgee-match':''):['error','filter'].includes(body.kind)?'':entity};
}

export async function collect(request,env){
  const origin=request.headers.get('Origin')||'';
  const publicOrigin=typeof env.PUBLIC_ORIGIN==='string'?env.PUBLIC_ORIGIN:'';
  const endpoint= new URL(request.url);
  const endpointOrigin=typeof env.ADMIN_ORIGIN==='string'&&env.ADMIN_ORIGIN?env.ADMIN_ORIGIN:publicOrigin;
  const endpointIsPublic=endpoint.origin===publicOrigin;
  const originAllowed=origin===publicOrigin&&endpoint.origin===endpointOrigin;
  const corsHeaders=originAllowed?{'Access-Control-Allow-Origin':publicOrigin,'Vary':'Origin'}:{};
  const respond=response=>{
    if(!originAllowed)return response;
    const h=new Headers(response.headers);
    for(const [key,value] of Object.entries(corsHeaders))h.set(key,value);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
  };
  if(request.method==='OPTIONS'){
    const requestedMethod=request.headers.get('Access-Control-Request-Method');
    const requestedHeaders=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(!originAllowed||requestedMethod!=='POST'||requestedHeaders.some(x=>x!=='content-type'))return json({error:'Origin denied'},403);
    return respond(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Cache-Control':'no-store'}}));
  }
  if(!env.ANALYTICS||!env.ANALYTICS_SECRET||env.ANALYTICS_SECRET.length<32)return respond(json({error:'Collection unavailable'},503));
  if(request.method!=='POST')return respond(json({error:'Method not allowed'},405));
  if(!originAllowed)return json({error:'Origin denied'},403);
  const fetchSite=request.headers.get('Sec-Fetch-Site');
  if(fetchSite&&(endpointIsPublic?fetchSite!=='same-origin':!['same-site','cross-site'].includes(fetchSite)))return json({error:'Origin denied'},403);
  if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|spider|crawler|headless/i.test(request.headers.get('User-Agent')||''))return respond(new Response(null,{status:204}));
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond(json({error:'JSON required'},415));
  const reader=request.body?.getReader();if(!reader)return respond(json({error:'JSON required'},400));
  let raw='',bytes=0;const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2048){await reader.cancel();return respond(json({error:'Payload too large'},413))}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode();
  let body;try{body=JSON.parse(raw)}catch{return respond(json({error:'Invalid JSON'},400))}
  const e=cleanEvent(body);if(!e)return respond(json({error:'Invalid event'},400));
  const shared=e.kind==='location'&&body.consent===true&&typeof body.lat==='number'&&typeof body.lon==='number'&&Number.isFinite(body.lat)&&Number.isFinite(body.lon)&&typeof body.accuracy==='number'&&Number.isFinite(body.accuracy)&&body.accuracy>=0&&body.accuracy<=100&&body.lat>=24&&body.lat<=50&&body.lon>=-125&&body.lon<=-66&&Math.abs(body.lat*10-Math.round(body.lat*10))<1e-7&&Math.abs(body.lon*10-Math.round(body.lon*10))<1e-7;
  if(e.kind==='location'&&!shared)return respond(json({error:'Location must be explicitly shared with a browser accuracy reading of 100 meters or better'},400));
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10),db=env.ANALYTICS;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const submitted=typeof body.visitorId==='string'&&uuid.test(body.visitorId)?body.visitorId:null;
  const old=cookie(request,'__Host-sanks_v'),v=submitted||(uuid.test(old||'')?old:crypto.randomUUID());
  const id=await pseudonym(v,env.ANALYTICS_SECRET);
  const budget=await db.prepare('INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window WHERE window!=excluded.window OR count<2500 RETURNING count').bind('site-budget',Math.floor(now/DAY)).first();
  if(!budget){await db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').bind('collection_capped_'+day,String(now)).run();return respond(json({error:'Daily collection budget reached'},429))}
  // Per-visitor rate limiting is bounded and atomic; IP addresses are never read.
  const gate=await db.prepare('INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window WHERE window!=excluded.window OR count<30 RETURNING count').bind(id,Math.floor(now/60000)).first();
  if(!gate)return respond(json({error:'Rate limited'},429));
  const sid=crypto.randomUUID();
  const country=shared?'US':'ZZ';
  // Never derive or persist geographic data from the visitor IP.
  const state=shared?'BR':'--';
  const areaCity=shared?'Browser-shared area':null;
  const areaState=state;
  const areaLat=shared?body.lat:null,areaLon=shared?body.lon:null;
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
    ...(shared?[db.prepare('INSERT INTO event_cities(event_id,city,state,country,lat,lon) VALUES(?,?,?,?,?,?)').bind(eventId,areaCity,areaState,country,areaLat,areaLon)]:[]),
    db.prepare("INSERT INTO activity_totals(day,category,label,state,count) VALUES(?,?,?,?,1) ON CONFLICT(day,category,label,state) DO UPDATE SET count=count+1").bind(day,'event',e.kind,''),
    ...(e.kind==='search'&&e.entity==='tits-mcgee-match'?[db.prepare("INSERT INTO activity_totals(day,category,label,state,count) VALUES(?,?,?,?,1) ON CONFLICT(day,category,label,state) DO UPDATE SET count=count+1").bind(day,'named_search','tits-mcgee','')]:[]),
    
    db.prepare('DELETE FROM event_cities WHERE event_id IN (SELECT id FROM events WHERE ts < ?)').bind(now-90*DAY),
    db.prepare('DELETE FROM events WHERE ts < ?').bind(now-90*DAY),
    db.prepare('DELETE FROM sessions WHERE last_seen < ?').bind(now-DAY),
    db.prepare("DELETE FROM limits WHERE key!='site-budget' AND window < ?").bind(Math.floor(now/60000)-60)
  ]);
  const responseHeaders={'Cache-Control':'no-store'};
  if(!submitted)responseHeaders['Set-Cookie']=`__Host-sanks_v=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000`;
  return respond(new Response(null,{status:204,headers:responseHeaders}));
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
  const [states,countries,devices,sources,popularity,pagePopularity,recent,active,visits,peaks,cities]=await Promise.all([
    Promise.resolve([]),
    Promise.resolve([]),
    all('SELECT device label,COUNT(DISTINCT visitor) visitors FROM events WHERE ts>=? GROUP BY device ORDER BY visitors DESC',detailStart),
    all("SELECT source label,COUNT(*) views FROM events WHERE ts>=? AND kind='page' GROUP BY source ORDER BY views DESC LIMIT 20",detailStart),
    all("SELECT sport,kind,entity label,COUNT(*) events FROM events WHERE ts>=? AND kind NOT IN ('page','error') GROUP BY sport,kind,entity ORDER BY events DESC LIMIT 100",detailStart),
    all("SELECT sport,section label,COUNT(*) views,COUNT(DISTINCT visitor) visitors FROM events WHERE ts>=? AND kind='page' GROUP BY sport,section ORDER BY views DESC LIMIT 50",detailStart),
    all('SELECT ts,section,state,country,kind FROM events WHERE ts>=? ORDER BY ts DESC LIMIT 20',now-5*60000),
    one('SELECT COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=?',now-5*60000),
    one('SELECT COUNT(DISTINCT session) visits FROM events WHERE ts>=? AND kind=\'page\'',detailStart),
    all("SELECT strftime('%H',ts/1000,'unixepoch') label,COUNT(*) views FROM events WHERE ts>=? AND kind='page' GROUP BY label ORDER BY label",detailStart),
    all("SELECT c.city label,c.state state,c.country country,c.lat lat,c.lon lon,\n COUNT(DISTINCT e.visitor) visitors,COUNT(DISTINCT e.session) visits\n FROM events e JOIN event_cities c ON c.event_id=e.id\n WHERE e.ts>=? AND e.kind='location' AND c.country='US' AND c.state='BR' AND c.city='Browser-shared area' AND c.lat IS NOT NULL AND c.lon IS NOT NULL\n GROUP BY c.city,c.state,c.country,c.lat,c.lon ORDER BY visits DESC,visitors DESC LIMIT 100",detailStart)
  ]);
  const locationDiagnostics=[];
  // A red dot implies an opted-in approximate area, not a potentially distant IP city.
  // Match a consented area only to a search in the same session within 15 minutes.
  const flaggedCities=await all("WITH matches AS (SELECT e.id,e.visitor,e.session,e.ts FROM events e WHERE e.kind='search' AND e.entity='tits-mcgee-match' AND e.ts>=?), opted AS (SELECT m.id,c.city,c.state,c.lat,c.lon,ROW_NUMBER() OVER(PARTITION BY m.id ORDER BY loc.ts DESC) priority FROM matches m JOIN events loc ON loc.visitor=m.visitor AND loc.session=m.session AND loc.kind='location' AND ABS(loc.ts-m.ts)<=900000 JOIN event_cities c ON c.event_id=loc.id WHERE c.country='US' AND c.state='BR' AND c.lat IS NOT NULL AND c.lon IS NOT NULL) SELECT city label,state,lat,lon,COUNT(*) matches FROM opted WHERE priority=1 GROUP BY city,state,lat,lon ORDER BY matches DESC LIMIT 100",detailStart);
  const specialSearch=await one("SELECT COALESCE(SUM(count),0) matches FROM activity_totals WHERE category='named_search' AND label='tits-mcgee' AND day>=?",since);
  const historicalCities=[]; // Historical city totals were IP estimates and are intentionally excluded.
  const calendar={};for(const key of ['today','7','30','year','all']){const s=new Date(period(key,now).start).toISOString().slice(0,10);calendar[key]=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',s)).visitors}
  const month=new Date(now).toISOString().slice(0,7)+'-01';calendar.month=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',month)).visitors;
  const week=new Date(now);week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));calendar.week=(await one('SELECT COUNT(DISTINCT visitor) visitors FROM days WHERE day>=?',week.toISOString().slice(0,10))).visitors;
  const comparisonAvailable=p.start>0&&p.previousStart>=started&&p.previousStart>=now-90*DAY;
  const capped=await all("SELECT substr(key,19) day FROM meta WHERE key LIKE 'collection_capped_%' ORDER BY key DESC LIMIT 90");
  const sections=await all('SELECT section label,COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=? GROUP BY section ORDER BY visitors DESC',now-5*60000);
  return {available:true,empty:false,trackingStarted:started,asOf:now,range,aggregation,summary,previous:comparisonAvailable?previous:null,history,states,cities,flaggedCities,locationDiagnostics,historicalCities,specialSearch,countries,devices,sources,popularity,pagePopularity,recent,active:active.visitors,visits:visits.visits,peaks,calendar,detailStart,detailTruncated:detailStart>p.start,comparisonAvailable,collectionCappedDays:capped.map(x=>x.day),sections};
}
export async function liveReport(env){
  if(!env.ANALYTICS)return {available:false};
  const since=Date.now()-5*60000,db=env.ANALYTICS;
  const active=await db.prepare('SELECT COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=?').bind(since).first();
  const recent=(await db.prepare('SELECT ts,section,state,country,kind FROM events WHERE ts>=? ORDER BY ts DESC LIMIT 20').bind(since).all()).results;
  const sections=(await db.prepare('SELECT section label,COUNT(DISTINCT visitor) visitors FROM sessions WHERE last_seen>=? GROUP BY section ORDER BY visitors DESC').bind(since).all()).results;
  return {available:true,asOf:Date.now(),active:active.visitors,recent,sections};
}
