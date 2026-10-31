import compiledIdentities from './identities.mjs';
import catalog from './catalog.mjs';
import {validateIdentities,validateMatch,mapBoxscore,mapMoneylines,providerRequest,SOURCE} from './provider.mjs';
export const LEASE_MS=15*60000;
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
 identities(){try{return validateIdentities(this.env.BBS_IDENTITIES?JSON.parse(this.env.BBS_IDENTITIES):compiledIdentities,catalog);}catch{return null;}}
 prune(s,now){
  for(const [id,g] of Object.entries(s.games)){
   if(g.expiresAt<=now&&!g.report)delete s.games[id];
   else if(g.expiresAt<=now&&now-(g.checkedAt??0)>7*DAY)delete s.games[id];
  }
 }
 async schedule(s,maps,now){
  const pending=Object.entries(s.games).filter(([id,g])=>g.expiresAt>now&&maps?.games[id]&&!g.stopped&&(!g.confirmed||!g.correctionDone));
  if(!this.env.BBS_API_KEY||!pending.length){await this.ctx.storage.deleteAlarm();return;}
  const next=Math.min(...pending.map(([id,g])=>Math.min(g.expiresAt,Math.max(now+1000,g.nextAt??now,Date.parse(maps.games[id].kickoff)))));
  await this.ctx.storage.setAlarm(next);
 }
 async fetch(request){
  return this.exclusive(async()=>{
   const now=this.now(),s=await this.state(),maps=this.identities(),url=new URL(request.url);this.prune(s,now);
   if(url.pathname==='/health')return json({configured:!!this.env.BBS_API_KEY,identitiesValid:!!maps,mappedGames:Object.keys(maps?.games??{}).length,allowance:s.limit,used:s.used,resetAt:new Date(resetAt(now)).toISOString(),mode:'demand',source:SOURCE});
   // Private Worker only: Pages never forwards this route and workers_dev is disabled.
   if(url.pathname==='/diagnostics'&&request.method==='GET'){
    const date=url.searchParams.get('date');
    if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||Math.abs(Date.parse(date+'T12:00:00Z')-now)>7*DAY)return json({error:'Nearby date required'},400);
    const path='/v1/matches?sport=american_football&league=nfl&date='+date+'&tz=America%2FNew_York&season=2026&limit=200';
    s.diagnostics??={};const cached=s.diagnostics[date];
    if(cached?.day===s.day)return json({...cached.result,cached:true});
    if(Object.values(s.diagnostics).filter(v=>v.day===s.day).length>=4||s.limit-s.used<=16)return json({error:'Discovery budget paused'},429);
    try{
     const payload=await this.request(s,path),result={authenticated:true,payload};
     s.diagnostics[date]={day:s.day,result};
     for(const [key,value] of Object.entries(s.diagnostics))if(value.day!==s.day)delete s.diagnostics[key];
     await this.save(s);return json(result);
    }catch(error){return json({authenticated:false,error:error.status===401?'Provider authentication failed':error.status===403?'Provider access denied':'Provider response unavailable',status:error.status??503,providerCode:error.providerCode??null,keyLength:this.env.BBS_API_KEY?.length??0},error.status??503);}
   }
   if(url.pathname==='/register'&&request.method==='POST'){
    const raw=await request.text();if(raw.length>4096)return json({error:'Registration too large'},413);
    let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid registration'},400);}
    if(!Array.isArray(body.games)||body.games.length>24||Object.keys(body).some(k=>k!=='games')||body.games.some(id=>typeof id!=='string'||!Object.hasOwn(catalog.games,id)))return json({error:'Unknown game registration'},400);
    for(const id of new Set(body.games)){
     const date=Date.parse(catalog.games[id].date+'T12:00:00Z');
     if(Math.abs(now-date)>7*DAY)continue;
     s.games[id]??={expiresAt:0,nextAt:now,failures:0};s.games[id].expiresAt=now+LEASE_MS;
    }
    await this.save(s);await this.schedule(s,maps,now);
    return json({expiresAt:new Date(now+LEASE_MS).toISOString(),refreshAfterMs:60000});
   }
   if(url.pathname==='/game'&&request.method==='GET'){
    const id=url.searchParams.get('gameId');if(!Object.hasOwn(catalog.games,id))return json({error:'Unknown game'},404);
    const active=this.active(s,maps,now),interval=intervalFor(s,active,now);
    const reason=!this.env.BBS_API_KEY?'Provider key not configured':!maps?'Identity configuration invalid':!maps.games[id]?'Game identity not verified':!s.games[id]?'No active registration':null;
    await this.save(s);
    return json(reportFor(id,s.games[id],now,interval,reason));
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
  if(!response.ok){const e=Error(response.status===429?'Provider rate limited':'Provider unavailable');e.status=response.status;e.providerCode=/^[A-Z_]{1,40}$/.test(response.payload?.error?.code??'')?response.payload.error.code:null;throw e;}
  return response.payload;
 }
 alarm(){return this.exclusive(()=>this.collect());}
 async collect(){
  const s=await this.state(),maps=this.identities(),now=this.now();this.prune(s,now);
  if(!maps||!this.env.BBS_API_KEY){await this.save(s);await this.ctx.storage.deleteAlarm();return;}
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
    const matchPayload=await this.request(s,'/v1/matches/'+game.providerId+'?sport=american_football'),match=validateMatch(matchPayload,game);
    if(['postponed','canceled','cancelled','suspended'].includes(match.status)){
     g.stopped=true;g.error='Game '+match.status+'; awaiting verified schedule/settlement';continue;
    }
    const payload=await this.request(s,'/v1/live-stats/american_football/'+game.providerId+'/players');
    const box=mapBoxscore(payload,{gameId:id,game,players:maps.players,now:this.now()});
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
    g.report={gameId:id,season:game.season,source:SOURCE,observations,observedAt:box.observedAt,gameStatus:box.status,stale:box.stale,notes:box.notes,finalResultsEnabled:!!confirmed,finalSettlementEnabled:false};
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

