import {normalizeUfcEvents,UFC_FIGHTER_STATS} from '../../../parlay/ufc.mjs';
import {feedRequest} from '../../../parlay/demand-gateway.mjs';

const day=86400000;
const maxBytes=8000000;
const espnCore='https://sports.core.api.espn.com';
async function fighterStats(fetchSource,eventId,boutId,fighterId){
 const path='/v2/sports/mma/leagues/ufc/events/'+eventId+'/competitions/'+boutId+'/competitors/'+fighterId+'/statistics';
 try{
  const response=await fetchSource(espnCore+path,{signal:AbortSignal.timeout(5000),cf:{cacheEverything:true,cacheTtl:12}});
  if(!response.ok)return null;
  const raw=await response.text();
  if(raw.length>250000)return null;
  const payload=JSON.parse(raw), ref=new URL(payload.$ref);
  if(ref.hostname!=='sports.core.api.espn.com'||![path,path+'/0'].includes(ref.pathname))return null;
  const stats=payload.splits?.categories?.find(c=>c.name==='general')?.stats??[];
  const totals={};
  for(const [category,name] of Object.entries(UFC_FIGHTER_STATS)){
   const matches=stats.filter(s=>s.name===name);
   if(matches.length===1&&Number.isSafeInteger(matches[0].value)&&matches[0].value>=0)totals[category]=matches[0].value;
  }
  return Object.keys(totals).length?totals:null;
 }catch{return null;}
}
export async function ufcResponse(request,{now=Date.now(),fetchSource=fetch}={}){
 const query=new URL(request.url).searchParams;
 const date=query.get('date'),fightId=query.get('fightId');
 if(fightId!==null&&(!date||!/^ufc:\d{1,15}:\d{1,15}$/.test(fightId)))return Response.json({error:'A valid UFC bout and date are required'},{status:400});
 const center=date===null?now:Date.parse(date+'T12:00:00Z');
 if((date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(center)||new Date(center).toISOString().slice(0,10)!==date))||
  center<now-370*day||center>now+95*day)return Response.json({error:'Choose a UFC event date within the past year or next 90 days'},{status:400});
 // Default to a rolling catalog. An exact date is narrowly queried for older slips.
 const from=date===null?now-30*day:center-day,to=date===null?now+60*day:center+day;
 const stamp=time=>new Date(time).toISOString().slice(0,10).replaceAll('-','');
 const source='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates='+stamp(from)+'-'+stamp(to);
 try{
  const response=await fetchSource(source,{signal:AbortSignal.timeout(10000),cf:{cacheEverything:true,cacheTtl:fightId?12:60}});
  if(!response.ok||Number(response.headers.get('Content-Length'))>maxBytes)throw Error();
  const raw=await response.text();
  if(raw.length>maxBytes)throw Error();
  const payload=JSON.parse(raw);
  if(!Array.isArray(payload.events))throw Error();
  const fights=normalizeUfcEvents(payload,new Date(now).toISOString());
  if(!fightId)return Response.json({fights});
  const fight=fights.find(f=>f.gameId===fightId);
  if(!fight)return Response.json({fights:[]});
  if(['live','final'].includes(fight.outcome)){
   const [,eventId,boutId]=fightId.split(':');
   await Promise.all(fight.fighters.map(async fighter=>{
    const stats=await fighterStats(fetchSource,eventId,boutId,fighter.id);
    if(stats)fighter.stats=stats;
   }));
  }
  return Response.json({fights:[fight]});
 }catch{return Response.json({error:'UFC fight data is temporarily unavailable'},{status:503});}
}
export const onRequestGet=context=>feedRequest(context,'/ufc',ufcResponse);
export const onRequestOptions=context=>feedRequest(context,'/ufc',ufcResponse);
