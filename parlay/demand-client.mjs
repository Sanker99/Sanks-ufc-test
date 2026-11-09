import {feedOrigin} from './feed-config.mjs';
export function demandGames(parlays){
 return [...new Set(parlays.filter(p=>p.lockedAt&&!p.manualOutcome&&p.result?.status!=='won'&&p.result?.status!=='lost'&&p.result?.status!=='voided').flatMap(p=>p.legs.filter((leg,i)=>!p.result?.legs?.[i]?.resolved).map(l=>l.gameId)).filter(Boolean))].sort();
}
export function createDemandRegistration({fetcher=fetch,now=Date.now}={}){
 let nextAt=0,previous='',failure=null,receipt=null;
 return async games=>{
  const key=JSON.stringify(games);
  if(!games.length){previous=key;failure=null;receipt=null;nextAt=0;return null;}
  if(now()<nextAt&&key===previous){if(failure)throw failure;return receipt;}
  previous=key;
  try{
   const response=await fetcher(feedOrigin()+'/api/parlay/demand',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Game registration failed (HTTP '+response.status+').');
   const data=await response.json();if(!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now())throw Error('Game registration was not acknowledged.');
   receipt=data;failure=null;nextAt=now()+Math.max(15000,Math.min(60000,Number(data.refreshAfterMs)||60000));return receipt;
  }catch(error){failure=Error(error.message?.startsWith('Game registration')?error.message:'Game registration could not connect.');nextAt=now()+60000;throw failure;}
 };
}
export function feedLabel(feed,progress,now=Date.now(),leg=null){
 const interval=Number(feed?.nextPollMs)||180000;
 const at=Date.parse(progress?.observedAt??feed?.observedAt),age=Number.isFinite(at)?Math.max(0,now-at):null;
 const frequency='checks every '+Math.max(1,Math.ceil(interval/60000))+' min';
 if(!progress?.available&&leg){
  if(feed?.reason==='Waiting for a verified game match')return 'PENDING — finding the game in the stats feed';
  if(feed?.identityCoverage?.unsupportedCategories?.includes(leg.category))return 'UNAVAILABLE — touchdown scorer coverage is not verified';
  if(!['moneyline','spread','game_total_points'].includes(leg.category)&&feed?.identityCoverage&&!feed.identityCoverage.playerIds.includes(leg.playerId))return 'UNAVAILABLE — live stats are not verified for this player';
  if(Date.parse(feed?.scheduledFor)>now)return 'SCHEDULED — statistics begin after kickoff';
 }
 if(!progress?.available&&leg?.category==='anytime_tds'&&feed?.touchdownSchema===1&&!feed.reason&&['live','final'].includes(feed.gameStatus))return 'PENDING — waiting for verified TD totals or participation';
 if(!progress?.available)return 'UNAVAILABLE — '+(feed?.reason||'No verified statistics');
 if(progress.state==='Push / Settlement pending')return 'FINAL — exactly on the line · awaiting sportsbook settlement';
 const minutes=age===null?'unknown':Math.floor(age/60000);
 if(String(progress.state).startsWith('Final '))return 'FINAL — verified reported stats · updated '+minutes+' min ago';
 if(feed?.gameStatus==='final')return 'FINAL — awaiting verification · updated '+minutes+' min ago · '+frequency;
 const stale=(feed?.source&&progress?.source!==feed.source)||feed?.stale!==false||feed?.reason||age===null||age>Math.max(300000,interval*1.5);
 return (stale?'DELAYED':'LIVE')+' — updated '+minutes+' min ago · '+frequency;
}
