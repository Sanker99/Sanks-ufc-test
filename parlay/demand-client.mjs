import {feedOrigin} from './feed-config.mjs';
export function demandGames(parlays){
 return [...new Set(parlays.filter(p=>p.lockedAt&&p.result?.status!=='won'&&p.result?.status!=='lost'&&p.result?.status!=='voided').flatMap(p=>p.legs.filter((leg,i)=>!p.result?.legs?.[i]?.resolved).map(l=>l.gameId)).filter(Boolean))].sort();
}
export function createDemandRegistration({fetcher=fetch,now=Date.now}={}){
 let nextAt=0,previous='';
 return async games=>{
  const key=JSON.stringify(games);
  if(now()<nextAt&&key===previous)return;
  const response=await fetcher(feedOrigin()+'/api/parlay/demand',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games}),signal:AbortSignal.timeout(10000)});
  if(!response.ok){nextAt=now()+60000;previous=key;throw Error('Shared game registration unavailable');}
  nextAt=now()+60000;previous=key;
 };
}
export function feedLabel(feed,progress,now=Date.now(),leg=null){
 const interval=Number(feed?.nextPollMs)||180000;
 const at=Date.parse(progress?.observedAt??feed?.observedAt),age=Number.isFinite(at)?Math.max(0,now-at):null;
 const frequency='checks every '+Math.max(1,Math.ceil(interval/60000))+' min';
 if(!progress?.available&&leg){
  if(feed?.identityCoverage?.unsupportedCategories?.includes(leg.category))return 'UNAVAILABLE — touchdown scorer coverage is not verified';
  if(leg.category!=='moneyline'&&feed?.identityCoverage&&!feed.identityCoverage.playerIds.includes(leg.playerId))return 'UNAVAILABLE — live stats are not verified for this player';
  if(Date.parse(feed?.scheduledFor)>now)return 'SCHEDULED — statistics begin after kickoff';
 }
 if(!progress?.available)return 'UNAVAILABLE — '+(feed?.reason||'No verified statistics');
 const minutes=age===null?'unknown':Math.floor(age/60000);
 if(String(progress.state).startsWith('Final '))return 'FINAL — verified reported stats · updated '+minutes+' min ago';
 if(feed?.gameStatus==='final')return 'FINAL — awaiting verification · updated '+minutes+' min ago · '+frequency;
 const stale=(feed?.source&&progress?.source!==feed.source)||feed?.stale!==false||feed?.reason||age===null||age>Math.max(300000,interval*1.5);
 return (stale?'DELAYED':'LIVE')+' — updated '+minutes+' min ago · '+frequency;
}
