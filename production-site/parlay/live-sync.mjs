import {fetchUfcArchiveStats} from './ufc-archive.mjs';
import {isUfcLeg,isUfcStat,ufcObservationReport} from './ufc.mjs?v=ufc-stats-2';
import {sameObservation} from './moneyline.mjs?v=ufc-stats-2';
import {feedOrigin} from './feed-config.mjs';
import {demandGames} from './demand-client.mjs?v=ufc-stats-2';
import {recordObservations,evaluateParlay,canPromoteFinal} from './core.mjs?v=ufc-stats-2';
export function trackedGames(parlays,{now=Date.now(),gameDate=()=>null}={}){
 const groups=new Map();
 for(const parlay of parlays){
  if(!parlay.lockedAt||parlay.manualOutcome)continue;
  if(['won','lost','voided'].includes(parlay.result?.status)&&!parlay.legs.some(l=>{const date=Date.parse(gameDate(l.gameId)+'T00:00:00Z');return Number.isFinite(date)&&now-date<7*86400000;}))continue;
  for(const leg of parlay.legs){
   const key=leg.season+'|'+leg.gameId;
   if(!groups.has(key))groups.set(key,{key,gameId:leg.gameId,season:leg.season,...(isUfcLeg(leg)?{ufcDate:leg.eventDate}:{}),details:new Set(),fullDetails:false});
   if(isUfcStat(leg.category))groups.get(key).ufcStats=true;
   if(leg.category==='rush_receive_yards')groups.get(key).fullDetails=true;
   if(['anytime_tds','rush_receive_yards'].includes(leg.category))groups.get(key).details.add(leg.playerId);
  }
 }
 return [...groups.values()].map(g=>({...g,details:[...g.details].filter(Boolean).sort().slice(0,12)}));
}
export function createLiveSync({repository,isVisible,fetchGame,onState=()=>{},now=Date.now,gameDate=()=>null,registerGames=async()=>{},onGame=()=>{}}){
 let busy=false;const next=new Map();
 async function refresh(force=false){
  if(busy||!isVisible())return;
  busy=true;let registrationError=null;
  const reportState=state=>onState(registrationError?{...state,status:'registration-error',reason:registrationError}:state);
  try{
   try{await registerGames(demandGames(repository.list()));}catch(error){registrationError=error.message;}
   const groups=trackedGames(repository.list(),{now:now(),gameDate}),due=groups.filter(g=>force||(next.get(g.key)||0)<=now()).sort((a,b)=>(next.get(a.key)??0)-(next.get(b.key)??0)).slice(0,6);
   if(!groups.length){reportState({status:'idle'});return;}
   if(!due.length)return;
   reportState({status:'loading'});
   let succeeded=0,failed=0,partial=false,checkedAt=null;
   for(let start=0;start<due.length;start+=3){
    if(!isVisible())break;
    await Promise.all(due.slice(start,start+3).map(async group=>{
     try{
      const data=await fetchGame(group);
      onGame(data,group);
      if(data.gameId!==group.gameId||data.season!==group.season||!Array.isArray(data.observations))throw Error('Invalid source response');
      const kickoff=Date.parse(data.scheduledFor);
      if(data.observedAt==null&&data.observations.length===0&&kickoff>now()){
       next.set(group.key,now()+Math.max(30000,Math.min(kickoff-now(),Number(data.nextPollMs)||180000)));succeeded++;return;
      }
      if(data.observedAt==null&&data.observations.length===0){
       next.set(group.key,now()+30000);partial=true;succeeded++;return;
      }
      if(!Number.isFinite(Date.parse(data.observedAt)))throw Error('Invalid source response');
      const observations=data.observations.filter(s=>s.gameId===group.gameId&&s.season===group.season&&Number.isFinite(Date.parse(s.observedAt))&&(s.finalVerified!==true||(data.finalResultsEnabled===true&&data.gameStatus==='final'&&s.status==='final'&&s.verified===true)));
      // Only update matching locked legs. Missing/failed source reads never become zero.
      for(const parlay of repository.list()){
       if(!parlay.lockedAt||parlay.manualOutcome)continue;
       const matching=observations.filter(s=>parlay.legs.some(l=>sameObservation(l,s)&&l.team===s.team));
       const newer=parlay.legs.some((leg,index)=>matching.some(s=>sameObservation(leg,s)&&s.team===leg.team&&Date.parse(s.observedAt)>(Date.parse(parlay.result?.legs[index]?.observedAt)||0)));
       const finalPromotion=matching.length&&evaluateParlay(parlay,matching).legs.some((row,index)=>canPromoteFinal(parlay.result?.legs[index],row,parlay.legs[index]));
       if(matching.length&&(newer||finalPromotion))recordObservations(repository,parlay,matching,new Date(now()));
      }
      next.set(group.key,now()+Math.max(30000,Math.min(86400000,Number(data.nextPollMs)||30000)));
      succeeded++;partial=partial||!!data.notes?.length;
      if(!checkedAt||data.observedAt>checkedAt)checkedAt=data.observedAt;
     }catch(error){
      failed++;next.set(group.key,now()+Math.max(60000,Math.min(900000,error.retryAfterMs||60000)));
     }
    }));
   }
   if(succeeded||failed)reportState({status:failed?'error':partial?'partial':'ready',checkedAt,succeeded,failed});
  }catch{reportState({status:'error'});}finally{busy=false;}
 }
 return {refresh};
}
export async function fetchLiveGame(group){
 const params=new URLSearchParams({gameId:group.gameId});
 const response=await fetch(feedOrigin()+'/api/parlay/game?'+params,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 const data=await response.json();
 if(!response.ok){const error=Error(data.error||'Stats unavailable');error.retryAfterMs=data.retryAfterMs;throw error;}
 return data;
}

const ufcCache=new Map();
export function fetchUfcFights(date=''){
 const previous=ufcCache.get(date);
 if(previous&&Date.now()<previous.expiresAt)return previous.promise;
 const params=date?'?'+new URLSearchParams({date}):'';
 const promise=fetch(feedOrigin()+'/api/parlay/ufc'+params,{signal:AbortSignal.timeout(15000)})
  .then(async response=>{
   const data=await response.json();
   if(!response.ok||!Array.isArray(data.fights))throw Error(data.error||'UFC fight data unavailable');
   return data.fights;
  }).catch(error=>{ufcCache.delete(date);throw error;});
 ufcCache.set(date,{promise,expiresAt:Date.now()+45000});
 return promise;
}
export async function fetchTrackerGame(group){
 if(!group.ufcDate)return fetchLiveGame(group);
 let fights;
 if(group.ufcStats){
  const query=new URLSearchParams({date:group.ufcDate,fightId:group.gameId});
  const response=await fetch(feedOrigin()+'/api/parlay/ufc?'+query,{cache:'no-store',signal:AbortSignal.timeout(32000)});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.fights))throw Error(data.error||'UFC statistics unavailable');
  fights=data.fights;
 }else fights=await fetchUfcFights(group.ufcDate);
 const fight=fights.find(f=>f.gameId===group.gameId);
 if(group.ufcStats&&fight?.outcome==='final'&&fight.fighters.some(f=>Object.keys(f.stats??{}).length<2)){
  const archived=await fetchUfcArchiveStats(fight,fetch).catch(()=>null);
  if(archived)for(const fighter of fight.fighters){
   fighter.stats=archived.totals[fighter.id];
   fighter.statsSource=archived.source;
  }
 }
 return ufcObservationReport(fight)??{gameId:group.gameId,season:group.season,observations:[],observedAt:null,gameStatus:'unavailable',reason:'UFC bout unavailable or changed'};
}
