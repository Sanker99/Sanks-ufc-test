import {normalizeUfcEvents} from '../../../parlay/ufc.mjs';
import {feedRequest} from '../../../parlay/demand-gateway.mjs';

const day=86400000;
const maxBytes=8000000;
export async function ufcResponse(request,{now=Date.now(),fetchSource=fetch}={}){
 const query=new URL(request.url).searchParams;
 const date=query.get('date');
 const center=date===null?now:Date.parse(date+'T12:00:00Z');
 if((date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(center)||new Date(center).toISOString().slice(0,10)!==date))||
  center<now-370*day||center>now+95*day)return Response.json({error:'Choose a UFC event date within the past year or next 90 days'},{status:400});
 // Default to a rolling catalog. An exact date is narrowly queried for older slips.
 const from=date===null?now-30*day:center-day,to=date===null?now+60*day:center+day;
 const stamp=time=>new Date(time).toISOString().slice(0,10).replaceAll('-','');
 const source='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates='+stamp(from)+'-'+stamp(to);
 try{
  const response=await fetchSource(source,{signal:AbortSignal.timeout(10000),cf:{cacheEverything:true,cacheTtl:60}});
  if(!response.ok||Number(response.headers.get('Content-Length'))>maxBytes)throw Error();
  const raw=await response.text();
  if(raw.length>maxBytes)throw Error();
  const payload=JSON.parse(raw);
  if(!Array.isArray(payload.events))throw Error();
  return Response.json({fights:normalizeUfcEvents(payload,new Date(now).toISOString())});
 }catch{return Response.json({error:'UFC fight data is temporarily unavailable'},{status:503});}
}
export const onRequestGet=context=>feedRequest(context,'/ufc',ufcResponse);
export const onRequestOptions=context=>feedRequest(context,'/ufc',ufcResponse);
