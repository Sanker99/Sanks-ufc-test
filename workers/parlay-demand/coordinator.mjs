import {TOUCHDOWN_SCHEMA} from './touchdowns.mjs';
import compiledIdentities from './identities.mjs';
import baseCatalog from './catalog.mjs';
import {rosterAdditions} from '../../parlay/roster-additions.mjs';
import {buildDemandIdentities} from './build-identities.mjs';
import {validateIdentities,validateMatch,mapBoxscore,mapMoneylines,providerRequest,SOURCE} from './provider.mjs';
export const LEASE_MS=15*60000;
const catalog={...baseCatalog,players:{...baseCatalog.players,...Object.fromEntries(rosterAdditions.map(p=>[p.id,{team:p.team,position:p.position}]))}};
const verifiedPlayers={'00-0035700':{providerId:'8d8746c9-2a7a-4a04-a207-c664a7f8a083',name:'Josh Jacobs',team:'GB',position:'RB',teamId:'7ac6b53f-ce40-423d-ae8f-b90fadce1fe3',evidence:'Authenticated Packers provider roster matches exact name, position and team; verified Packers roster',verifiedAt:'2026-11-09T12:00:00Z'}};
const DAY=86400000,utcDay=n=>new Date(n).toISOString().slice(0,10),resetAt=n=>(Math.floor(n/DAY)+1)*DAY;
export function freshState(){return {version:1,day:null,used:0,limit:250,minute:0,minuteUsed:0,blockedUntil:0,games:{}};}
export function rollBudget(state,now){
 if(state.day!==utcDay(now)){state.day=utcDay(now);state.used=0;state.limit=250;state.blockedUntil=0;}
 if(state.minute!==Math.floor(now/60000)){state.minute=Math.floor(now/60000);state.minuteUsed=0;}
}
export function intervalFor(state,games,now){
 const remaining=Math.max(0,state.limit-state.used);
 // Two routes per cycle: box score plus independently checked match/status/score.
 const reserve=8+games.length*6;
 const minutes=games.reduce((sum,g)=>sum+Math.min(240,Math.max(30,(Date.parse(g.kickoff)+240*60000-Math.max(now,Date.parse(g.kickoff)))/60000)),0);
 const usable=Math.max(0,remaining-reserve);
 if(!usable)return Math.max(900000,resetAt(now)-now);
 const needed=minutes*2/usable*60000;
 return needed<=180000?180000:needed<=300000?300000:Math.ceil(needed/60000)*60000;
}
export function applyHeaders(state,headers,now){
 const day=Number(headers.get('x-ratelimit-limit-day'));
 // A higher allowance is enabled ONLY by the provider's authenticated day-cap header.
 if(day===500)state.limit=500;
 if(Number.isInteger(day)&&day>0&&day<state.limit)state.limit=day;
 const dayRemaining=headers.get('x-ratelimit-remaining-day'),remaining=dayRemaining===null?null:Number(dayRemaining);
 if(Number.isInteger(remaining)&&remaining>=0)state.used=Math.max(state.used,state.limit-remaining);
 // Remaining may describe the tighter bucket. Stopping at zero is conservative.
 if(headers.get('x-ratelimit-remaining')==='0'){
  const reset=Number(headers.get('x-ratelimit-reset'))*1000;
  if(Number.isFinite(reset)&&reset>now)state.blockedUntil=Math.max(state.blockedUntil,reset);
 }
 const retry=headers.get('retry-after');
 if(retry){const value=/^\d+$/.test(retry)?now+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(value))state.blockedUntil=Math.max(state.blockedUntil,value);}
}
function reportFor(id,g,now,interval,reason){
 const report=g?.report;
 const stale=!report||report.stale||now-Date.parse(report.observedAt)>Math.max(300000,interval*1.5);
 const display=report?{...report,observations:report.observations.map(({providerGameId,providerId,...observation})=>observation)}:null;
 return {...(display??{gameId:id,season:catalog.season,source:SOURCE,observations:[],observedAt:null,gameStatus:'unavailable',finalResultsEnabled:false}),
  stale,nextPollMs:interval,reason:reason??g?.error??null,checkedAt:g?.checkedAt??null,leaseExpiresAt:g?.expiresAt??null};
}
export class DemandCoordinator{
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.queue=Promise.resolve();
  this.now=()=>Date.now();this.fetcher=(...args)=>fetch(...args);
 }
 exclusive(fn){const job=this.queue.then(fn);this.queue=job.catch(()=>{});return job;}
 async state(){const s=await this.ctx.storage.get('state')??freshState();rollBudget(s,this.now());return s;}
 async save(s){await this.ctx.storage.put('state',s);}
 identities(s){try{return validateIdentities(this.env.BBS_IDENTITIES?JSON.parse(this.env.BBS_IDENTITIES):{...compiledIdentities,players:{...verifiedPlayers,...compiledIdentities.players},games:{...s?.discoveredGames,...compiledIdentities.games}},catalog);}catch{return null;}}
 canDiscover(id,maps){return !this.env.BBS_IDENTITIES&&!!maps&&!maps.games[id]&&!!catalog.games[id];}
 async discoverGames(s,maps,now){
  s.scheduleRetry??={};
  for(const [date,at] of Object.entries(s.scheduleRetry))if(now-at>7*DAY)delete s.scheduleRetry[date];
  const dates=[...new Set(Object.entries(s.games).filter(([id,g])=>g.expiresAt>now&&this.canDiscover(id,maps)).map(([id])=>catalog.games[id].date))];
  for(const date of dates.filter(d=>(s.scheduleRetry[d]??0)<=now).slice(0,2)){
   if(s.limit-s.used<=8+6*this.active(s,maps,now).length||s.minuteUsed>=80||s.blockedUntil>now){s.scheduleRetry[date]=Math.max(now+60000,s.blockedUntil,s.used>=s.limit-8?resetAt(now):0);continue;}
   s.scheduleRetry[date]=now+30*60000;
   try{
    const payload=await this.request(s,'/v1/matches?sport=american_football&league=nfl&date='+date+'&tz=America%2FNew_York&season=2026&limit=200');
    if(payload?.error||!Array.isArray(payload?.data))continue;
    const found=buildDemandIdentities({catalog,roster:[],matches:payload.data,players:[],verifiedAt:new Date(now).toISOString()}).manifest.games;
    const additions=Object.fromEntries(Object.entries(found).filter(([id,g])=>catalog.games[id].date===date&&!maps.games[id]&&!Object.values(maps.games).some(old=>old.providerId===g.providerId)));
    validateIdentities({...maps,games:{...maps.games,...additions}},catalog);
    s.discoveredGames={...s.discoveredGames,...additions};
    maps=this.identities(s);
   }catch(error){
    if(error.status===401||error.status===403)s.blockedUntil=Math.max(s.blockedUntil,now+3600000);
   }
  }
  return maps;
 }
 prune(s,now){
  for(const [id,g] of Object.entries(s.games)){
   if(g.expiresAt<=now&&!g.report)delete s.games[id];
   else if(g.expiresAt<=now&&now-(g.checkedAt??0)>7*DAY)delete s.games[id];
  }
 }
 async schedule(s,maps,now){
  const pending=Object.entries(s.games).filter(([id,g])=>g.expiresAt>now&&(maps?.games[id]||this.canDiscover(id,maps))&&!g.stopped&&(!g.confirmed||!g.correctionDone));
  if(!this.env.BBS_API_KEY||!pending.length){await this.ctx.storage.deleteAlarm();return;}
  const next=Math.min(...pending.map(([id,g])=>Math.min(g.expiresAt,Math.max(now+1000,g.nextAt??now,maps.games[id]?Date.parse(maps.games[id].kickoff):s.scheduleRetry?.[catalog.games[id].date]??now))));
  await this.ctx.storage.setAlarm(next);
 }
 async fetch(request){
  return this.exclusive(async()=>{
   const now=this.now(),s=await this.state(),maps=this.identities(s),url=new URL(request.url);this.prune(s,now);
   if(url.pathname==='/health')return json({configured:!!this.env.BBS_API_KEY,identitiesValid:!!maps,mappedGames:Object.keys(maps?.games??{}).length,mappedPlayers:Object.keys(maps?.players??{}).length,allowance:s.limit,used:s.used,resetAt:new Date(resetAt(now)).toISOString(),mode:'demand',source:SOURCE});
   // Private Worker only: Pages never forwards this route and workers_dev is disabled.
   if(url.pathname==='/diagnostics'&&request.method==='GET'){
    const date=url.searchParams.get('date'),auth=url.searchParams.get('check')==='auth',kind=url.searchParams.get('kind'),id=url.searchParams.get('id');
    const offset=url.searchParams.get('offset');
    const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id??'');
    let path;
    if(offset&&!['200','400'].includes(offset))return json({error:'Unsupported discovery offset'},400);
    if(auth)path='/v1/user/me';
    else if(validId&&kind==='players')path='/v1/players?sport=american_football&league=nfl&teamId='+id.toLowerCase()+'&limit=200'+(offset?'&offset='+offset:'');
    else if(validId&&kind==='profile')path='/v1/players/'+id.toLowerCase()+'/profile';
    else if(validId&&kind==='box')path='/v1/live-stats/american_football/'+id.toLowerCase()+'/players';
    else if(validId&&kind==='events')path='/v1/matches/'+id.toLowerCase()+'/events?type=goals&sport=american_football';
    else if(validId&&kind==='match')path='/v1/matches/'+id.toLowerCase()+'?sport=american_football';
    else if(!kind&&date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&Math.abs(Date.parse(date+'T12:00:00Z')-now)<=7*DAY)
     path='/v1/matches?sport=american_football&league=nfl&date='+date+'&tz=America%2FNew_York&season=2026&limit=200';
    else return json({error:'Nearby date or allowlisted NFL identity required'},400);
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(this.env.BBS_API_KEY??'')))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const cacheKey=path;s.diagnostics??={};const cached=s.diagnostics[cacheKey];
    const display=result=>url.searchParams.get('view')==='encoded'?json({authenticated:result.authenticated,encoded:btoa(Array.from(new TextEncoder().encode(JSON.stringify(result)),v=>String.fromCharCode(v)).join(''))}):json(result);
    if(cached?.day===s.day&&cached.fingerprint===fingerprint){
     const result=cached.result??(cached.storageKey?await this.ctx.storage.get(cached.storageKey):null);
     if(result)return display({...result,cached:true});
    }
    if(s.discoveryDay!==s.day){s.discoveryDay=s.day;s.discoveryUsed=0;}
    if(s.discoveryUsed>=64||s.limit-s.used<=16)return json({error:'Discovery budget paused'},429);
    s.discoveryUsed++;await this.save(s);
    try{
     const payload=await this.request(s,path),result=auth?{authenticated:true,plan:payload?.data?.plan,paused:payload?.data?.paused,limits:payload?.data?.limits}:{authenticated:true,payload};
     const storageKey='discovery:'+s.day+':'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path+fingerprint)))).map(v=>v.toString(16).padStart(2,'0')).join('');
     if(new TextEncoder().encode(JSON.stringify(result)).length<100000){await this.ctx.storage.put(storageKey,result);s.diagnostics[cacheKey]={day:s.day,fingerprint,storageKey};}
     for(const [key,value] of Object.entries(s.diagnostics))if(value.day!==s.day){if(value.storageKey)await this.ctx.storage.delete?.(value.storageKey);delete s.diagnostics[key];}
     await this.save(s);return display(result);
    }catch(error){return json({authenticated:false,error:error.status===401?'Provider authentication failed':error.status===403?'Provider access denied':'Provider response unavailable',status:error.status??503,providerCode:error.providerCode??null,providerMessage:error.providerMessage??null},error.status??503);}
   }
   if(url.pathname==='/register'&&request.method==='POST'){
    const raw=await request.text();if(raw.length>4096)return json({error:'Registration too large'},413);
    let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid registration'},400);}
    if(!Array.isArray(body.games)||body.games.length>24||Object.keys(body).some(k=>k!=='games')||body.games.some(id=>typeof id!=='string'||!Object.hasOwn(catalog.games,id)))return json({error:'Unknown game registration'},400);
    for(const id of new Set(body.games)){
     const date=Date.parse(catalog.games[id].date+'T12:00:00Z');
     if(Math.abs(now-date)>7*DAY)continue;
     s.games[id]??={expiresAt:0,nextAt:now,failures:0};s.games[id].expiresAt=now+LEASE_MS;
     if(s.games[id].report&&s.games[id].refreshSchema!==4&&(s.games[id].report.touchdownSchema!==TOUCHDOWN_SCHEMA||s.games[id].report.identitySchema!==4)){s.games[id].refreshSchema=4;s.games[id].failures=0;s.games[id].confirmed=false;s.games[id].correctionDone=false;delete s.games[id].finalCandidate;s.games[id].nextAt=now;}
    }
    await this.save(s);await this.schedule(s,maps,now);
    return json({expiresAt:new Date(now+LEASE_MS).toISOString(),refreshAfterMs:60000});
   }
   if(url.pathname==='/game'&&request.method==='GET'){
    const id=url.searchParams.get('gameId');if(!Object.hasOwn(catalog.games,id))return json({error:'Unknown game'},404);
    const active=this.active(s,maps,now),interval=intervalFor(s,active,now);
    const reason=!this.env.BBS_API_KEY?'Provider key not configured':!maps?'Identity configuration invalid':!maps.games[id]?(this.canDiscover(id,maps)&&s.games[id]?.expiresAt>now?'Waiting for a verified game match':'Game identity not verified'):!s.games[id]?'No active registration':null;
    await this.save(s);
    const game=maps?.games[id];
    return json({...reportFor(id,s.games[id],now,interval,reason),scheduledFor:game?.kickoff??null,identityCoverage:{playerIds:Object.entries(maps?.players??{}).filter(([,p])=>game&&[game.home,game.away].includes(p.team)&&(!p.gameIds||p.gameIds.includes(id))).map(([id])=>id),unsupportedCategories:[]}});
   }
   return json({error:'Not found'},404);
  });
 }
 active(s,maps,now){return Object.entries(s.games).filter(([id,g])=>g.expiresAt>now&&maps?.games[id]&&!g.stopped&&!g.confirmed).map(([id])=>maps.games[id]);}
 async request(s,path){
  const now=this.now();rollBudget(s,now);
  if(s.used>=s.limit||s.minuteUsed>=80||s.blockedUntil>now)throw Error('Request budget paused');
  // Persist reservation BEFORE I/O. A crash burns a slot instead of duplicating it.
  s.used++;s.minuteUsed++;await this.save(s);
  const response=await providerRequest(path,this.env.BBS_API_KEY,this.fetcher);
  applyHeaders(s,response.headers,this.now());await this.save(s);
  if(!response.ok){const e=Error(response.status===429?'Provider rate limited':'Provider unavailable');e.status=response.status;e.providerCode=/^[a-zA-Z_]{1,40}$/.test(response.payload?.error?.code??'')?response.payload.error.code:null;e.providerMessage=['missing API key','invalid API key'].includes(response.payload?.error?.message)?response.payload.error.message:null;throw e;}
  return response.payload;
 }
 alarm(){return this.exclusive(()=>this.collect());}
 async collect(){
  const s=await this.state(),now=this.now();let maps=this.identities(s);this.prune(s,now);
  if(!maps||!this.env.BBS_API_KEY){await this.save(s);await this.ctx.storage.deleteAlarm();return;}
  if(Object.keys(s.games).some(id=>this.canDiscover(id,maps)))maps=await this.discoverGames(s,maps,now);
  const active=this.active(s,maps,now),interval=intervalFor(s,active,now);
  const due=Object.entries(s.games).filter(([id,g])=>g.expiresAt>now&&maps.games[id]&&!g.stopped&&(!g.confirmed||!g.correctionDone)&&(g.nextAt??0)<=now&&Date.parse(maps.games[id].kickoff)<=now).sort((a,b)=>(a[1].lastAttempt??0)-(b[1].lastAttempt??0));
  for(const [id,g] of due){
   const game=maps.games[id],liveReserve=8+active.length*6,finalWindow=!!g.finalCandidate||now>Date.parse(game.kickoff)+150*60000;
   if(g.reserveDay!==s.day){g.reserveDay=s.day;g.reserveUsed=0;}
   const usingReserve=s.limit-s.used<=liveReserve;
   if(s.limit-s.used<2||s.minuteUsed>78||s.blockedUntil>this.now()||(!finalWindow&&usingReserve)||(usingReserve&&g.reserveUsed>=6)){
    g.nextAt=Math.max(now+60000,s.blockedUntil,s.used>=s.limit-1||(usingReserve&&g.reserveUsed>=6)?resetAt(now):now+interval);g.error='Free request budget protecting finals';continue;
   }
   if(usingReserve)g.reserveUsed+=2;
   g.lastAttempt=now;g.nextAt=now+interval;
   // Recovery alarm and nextAt persist before any upstream read.
   await this.save(s);await this.ctx.storage.setAlarm(now+60000);
   try{
    const matchPayload=await this.request(s,'/v1/matches/'+game.providerId+'?sport=american_football'),match=validateMatch(matchPayload,game,{now:this.now()});
    if(['postponed','canceled','cancelled','suspended'].includes(match.status)){
     g.stopped=true;g.error='Game '+match.status+'; awaiting verified schedule/settlement';continue;
    }
    const payload=await this.request(s,'/v1/live-stats/american_football/'+game.providerId+'/players');
    const box=mapBoxscore(payload,{gameId:id,game,players:maps.players,match,now:this.now()});
    const matchFinal=['finished','final'].includes(match.status),final=matchFinal&&box.status==='final';
    if(matchFinal!==(box.status==='final'))throw Error('Game/box score final status disagreement');
    // A match read alone cannot advance player source time.
    const observations=[...box.observations,...mapMoneylines(match,{gameId:id,game,observedAt:new Date(now).toISOString()})];
    const fingerprint=JSON.stringify(observations.map(o=>({...o,observedAt:undefined})));
    const prior=g.finalCandidate;
    const confirmed=final&&prior?.fingerprint===fingerprint&&now-prior.at>=300000;
    if(final&&!confirmed){g.finalCandidate=prior?.fingerprint===fingerprint?prior:{fingerprint,at:now};g.nextAt=now+300000;}
    if(!final)delete g.finalCandidate;
    const wasConfirmed=g.confirmed;g.confirmed=!!confirmed;
    if(confirmed){g.nextAt=now+600000;g.correctionDone=!!wasConfirmed;}
    if(wasConfirmed&&!confirmed)g.correctionDone=false;
    for(const o of observations)o.finalVerified=!!confirmed&&o.status==='final';
    // Failed or regressed upstream timestamps never erase a newer report.
    if(g.report&&Date.parse(box.observedAt)<Date.parse(g.report.observedAt))throw Error('Older provider statistics');
    g.report={gameId:id,season:game.season,identitySchema:4,touchdownSchema:TOUCHDOWN_SCHEMA,touchdownCoverage:box.touchdownCoverage,source:SOURCE,observations,observedAt:box.observedAt,gameStatus:box.status,stale:box.stale,notes:box.notes,finalResultsEnabled:!!confirmed,finalSettlementEnabled:false};
    g.checkedAt=this.now();g.failures=0;g.error=null;
   }catch(error){
    g.failures=Math.min(8,(g.failures??0)+1);
    g.nextAt=Math.max(now+Math.min(3600000,60000*2**g.failures),s.blockedUntil);
    g.error=error.status===403?'Provider access denied':error.status===401?'Provider authentication failed':error.message==='Request budget paused'?'Free request budget paused':'Provider response unavailable or unverified';
    if(error.status===401||error.status===403){s.blockedUntil=now+3600000;g.nextAt=s.blockedUntil;}
   }finally{await this.save(s);}
  }
  await this.save(s);await this.schedule(s,maps,this.now());
 }
}
export function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
