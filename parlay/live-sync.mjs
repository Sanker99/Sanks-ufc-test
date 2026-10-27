import {recordObservations,evaluateParlay,canPromoteFinal} from './core.mjs?v=results-2';
export function trackedGames(parlays,{now=Date.now(),gameDate=()=>null}={}){
 const groups=new Map();
 for(const parlay of parlays){
  if(!parlay.lockedAt)continue;
  if(['won','lost','voided'].includes(parlay.result?.status)&&!parlay.legs.some(l=>{const date=Date.parse(gameDate(l.gameId)+'T00:00:00Z');return Number.isFinite(date)&&now-date<7*86400000;}))continue;
  for(const leg of parlay.legs){
   const key=leg.season+'|'+leg.gameId;
   if(!groups.has(key))groups.set(key,{key,gameId:leg.gameId,season:leg.season,details:new Set(),fullDetails:false});
   if(leg.category==='rush_receive_yards')groups.get(key).fullDetails=true;
   if(['anytime_tds','rush_receive_yards'].includes(leg.category))groups.get(key).details.add(leg.playerId);
  }
 }
 return [...groups.values()].map(g=>({...g,details:[...g.details].filter(Boolean).sort().slice(0,12)}));
}
export function createLiveSync({repository,isVisible,fetchGame,onState=()=>{},now=Date.now,gameDate=()=>null}){
 let busy=false;const next=new Map();
 async function refresh(force=false){
  if(busy||!isVisible())return;
  busy=true;
  try{
   const groups=trackedGames(repository.list(),{now:now(),gameDate}),due=groups.filter(g=>force||(next.get(g.key)||0)<=now()).slice(0,6);
   if(!groups.length){onState({status:'idle'});return;}
   if(!due.length)return;
   onState({status:'loading'});
   let succeeded=0,failed=0,partial=false,checkedAt=null;
   for(let start=0;start<due.length;start+=3){
    if(!isVisible())break;
    await Promise.all(due.slice(start,start+3).map(async group=>{
     try{
      const data=await fetchGame(group);
      if(data.gameId!==group.gameId||data.season!==group.season||!Array.isArray(data.observations)||!Number.isFinite(Date.parse(data.observedAt)))throw Error('Invalid source response');
      const observations=data.observations.filter(s=>s.gameId===group.gameId&&s.season===group.season&&Number.isFinite(Date.parse(s.observedAt))&&(s.finalVerified!==true||(data.finalResultsEnabled===true&&data.gameStatus==='final'&&s.status==='final'&&s.verified===true)));
      // Only update matching locked legs. Missing/failed source reads never become zero.
      for(const parlay of repository.list()){
       if(!parlay.lockedAt)continue;
       const matching=observations.filter(s=>parlay.legs.some(l=>l.gameId===s.gameId&&l.season===s.season&&l.team===s.team&&(l.category==='moneyline'?s.kind==='team'&&s.playerId==null:l.playerId===s.playerId&&s.kind!=='team')));
       const newer=parlay.legs.some((leg,index)=>matching.some(s=>s.gameId===leg.gameId&&s.season===leg.season&&s.team===leg.team&&(leg.category==='moneyline'?s.kind==='team'&&s.team===leg.team:s.playerId===leg.playerId)&&Date.parse(s.observedAt)>(Date.parse(parlay.result?.legs[index]?.observedAt)||0)));
       const finalPromotion=matching.length&&evaluateParlay(parlay,matching).legs.some((row,index)=>canPromoteFinal(parlay.result?.legs[index],row));
       if(matching.length&&(newer||finalPromotion))recordObservations(repository,parlay,matching,new Date(now()));
      }
      next.set(group.key,now()+Math.max(30000,Math.min(900000,Number(data.nextPollMs)||30000)));
      succeeded++;partial=partial||!!data.notes?.length;
      if(!checkedAt||data.observedAt>checkedAt)checkedAt=data.observedAt;
     }catch(error){
      failed++;next.set(group.key,now()+Math.max(60000,Math.min(900000,error.retryAfterMs||60000)));
     }
    }));
   }
   if(succeeded||failed)onState({status:failed?'error':partial?'partial':'ready',checkedAt,succeeded,failed});
  }catch{onState({status:'error'});}finally{busy=false;}
 }
 return {refresh};
}
export async function fetchLiveGame(group){
 const params=new URLSearchParams({gameId:group.gameId});
 if(group.details.length)params.set('details',group.details.join(','));
 if(group.fullDetails)params.set('fullDetails','1');
 const response=await fetch('/api/parlay/game?'+params,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 const data=await response.json();
 if(!response.ok){const error=Error(data.error||'Stats unavailable');error.retryAfterMs=data.retryAfterMs;throw error;}
 return data;
}
