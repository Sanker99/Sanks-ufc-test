import identities from './live-identities.mjs';
import {mapEspnSummary,mapEspnMoneylines} from './stats.mjs';
const canonical=team=>({LAR:'LA',JAC:'JAX',WSH:'WAS'})[team]??team;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):null;
const pending=new Map();
const idMap=Object.fromEntries(Object.entries(identities.players).map(([id,p])=>[p.providerId,id]));
export function validateSummary(payload,game){
 const competition=payload.header?.competitions?.[0];
 if(String(payload.header?.id)!==game.providerId||payload.header?.season?.year!==game.season||!competition)throw Error('Game identity mismatch');
 const teams=competition.competitors;
 if(!Array.isArray(teams)||teams.length!==2||!['home','away'].every(side=>teams.some(t=>t.homeAway===side&&canonical(t.team?.abbreviation)===game[side])))throw Error('Game matchup mismatch');
 const date=new Date(competition.date);
 if(!Number.isFinite(date.getTime())||new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)!==game.date)throw Error('Game date mismatch');
 return competition;
}
export function participationEvidence(payload,map=idMap){
 const result={};
 const counts={passing:['C/ATT','CMP-ATT'],rushing:['CAR'],receiving:['REC','TGTS'],kickReturns:['NO'],puntReturns:['NO'],defensive:['TOT']};
 for(const team of payload.boxscore?.players??[])for(const group of team.statistics??[])for(const row of group.athletes??[]){
  const provider=String(row.athlete?.id??''),id=Object.hasOwn(map,provider)?map[provider]:null;if(!id||row.didNotPlay===true)continue;
  for(const label of counts[group.name]??[]){
   const index=group.labels?.indexOf(label);if(index<0)continue;
   const raw=row.stats?.[index],value=/^(?:C\/ATT|CMP-ATT)$/.test(label)?numeric(String(raw).split(/[/-]/)[1]):numeric(raw);
   if(value!==null&&value>0)result[id]=true;
  }
 }
 return result;
}
// Resolve explicit full scorer names only within this event's ID-bearing box-score rows.
// Require complete, monotonic scoring coverage matching both current scoreboard totals.
export function scoringTouchdowns(payload){
 const competition=payload.header?.competitions?.[0],events=payload.scoringPlays;
 if(!competition||!Array.isArray(events))return null;
 const competitors=competition.competitors??[],home=competitors.find(t=>t.homeAway==='home'),away=competitors.find(t=>t.homeAway==='away');
 if(!home||!away)return null;
 const finalHome=numeric(home.score),finalAway=numeric(away.score);
 if(!Number.isInteger(finalHome)||!Number.isInteger(finalAway))return null;
 const players=new Map(),counts=new Map(),seen=new Set();
 for(const team of payload.boxscore?.players??[])for(const group of team.statistics??[])for(const row of group.athletes??[]){
  const id=String(row.athlete?.id??''),name=row.athlete?.displayName;
  if(id&&typeof name==='string'&&name)players.set(id,{id,name,teamId:String(team.team?.id)});
 }
 let previousHome=0,previousAway=0;
 for(const event of events){
  if(!event.id||seen.has(event.id))return null;seen.add(event.id);
  const h=numeric(event.homeScore),a=numeric(event.awayScore);
  if(!Number.isInteger(h)||!Number.isInteger(a)||h<previousHome||a<previousAway)return null;
  const hd=h-previousHome,ad=a-previousAway,delta=hd+ad,type=event.scoringType?.name;
  if((hd>0)===(ad>0)||String(event.team?.id)!==String(hd>0?home.id:away.id))return null;
  const allowed=type==='touchdown'?[6,7,8]:type==='field-goal'?[3]:type==='safety'?[2]:type==='extra-point'?[1]:type==='two-point-conversion'?[2]:[];
  if(!allowed.includes(delta))return null;
  if(type==='touchdown'){
   const matches=[...players.values()].filter(p=>p.teamId===String(event.team.id)&&typeof event.text==='string'&&event.text.startsWith(p.name+' '));
   if(matches.length!==1)return null;
   counts.set(matches[0].id,(counts.get(matches[0].id)||0)+1);
  }
  previousHome=h;previousAway=a;
 }
 if(previousHome!==finalHome||previousAway!==finalAway)return null;
 return new Map([...players.keys()].map(id=>[id,counts.get(id)||0]));
}


function refPath(ref){try{const url=new URL(ref);return url.hostname==='sports.core.api.espn.com'?url.pathname:null;}catch{return null;}}
export function mapCoreStats(payload,{game,playerId,providerId,teamId,team,status,observedAt,participated}){
 const base='/v2/sports/football/leagues/nfl/';
 if(refPath(payload.athlete?.$ref)!==base+'seasons/'+game.season+'/athletes/'+providerId||refPath(payload.competition?.$ref)!==base+'events/'+game.providerId+'/competitions/'+game.providerId||refPath(payload.$ref)!==base+'events/'+game.providerId+'/competitions/'+game.providerId+'/competitors/'+teamId+'/roster/'+providerId+'/statistics/0')throw Error('Player identity mismatch');
 const categories=Object.fromEntries((payload.splits?.categories??[]).map(c=>[c.name,Object.fromEntries((c.stats??[]).map(s=>[s.name,numeric(s.value)]))]));
 const fields={passing:{passingYards:'passing_yards',passingTouchdowns:'passing_tds',completions:'completions',passingAttempts:'attempts',interceptions:'interceptions'},rushing:{rushingYards:'rushing_yards',rushingAttempts:'carries',rushingTouchdowns:'rushing_tds'},receiving:{receivingYards:'receiving_yards',receptions:'receptions',receivingTouchdowns:'receiving_tds'}},metrics={};
 for(const [group,mapping] of Object.entries(fields))for(const [source,target] of Object.entries(mapping)){const value=categories[group]?.[source];if(typeof value==='number')metrics[target]=value;}
 const scored=categories.scoring?.totalScoringTouchdowns,total=categories.passing?.totalTouchdowns,passing=categories.passing?.passingTouchdowns;
 // ESPN totalTouchdowns includes passing TDs. Use scoring TDs, or subtract the passing total.
 const touchdowns=typeof scored==='number'?scored:typeof total==='number'&&typeof passing==='number'?total-passing:null;
 if(Number.isInteger(touchdowns)&&touchdowns>=0)metrics.anytime_tds=touchdowns;
 if(['rushing_yards','receiving_yards'].every(k=>Object.hasOwn(metrics,k)))metrics.rush_receive_yards=metrics.rushing_yards+metrics.receiving_yards;
 return {gameId:game.id,providerGameId:game.providerId,season:game.season,playerId,providerId,team,status,observedAt,participated:participated===true?true:null,verified:true,finalVerified:false,metrics,source:'ESPN · experimental'};
}
async function readBounded(response){
 if(Number(response.headers.get('content-length'))>2_000_000)throw Error('Response too large');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw Error('Response too large');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});}
}
export async function cachedJSON({url,key,cache,fetcher,validate,ttl=30,now=Date.now}){
 const hit=await cache?.match(key);
 if(hit){const saved=await hit.json();if(saved.failureStatus){const error=Error('Upstream unavailable');error.status=saved.failureStatus;throw error;}validate(saved.payload);return {...saved,cacheHit:true};}
 if(pending.has(key.url))return pending.get(key.url);
 const task=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetcher(url,{signal:controller.signal,redirect:'manual'});
   if(!response.ok){if(cache&&response.status===403)await cache.put(key,new Response(JSON.stringify({failureStatus:403}),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}}));const error=Error('Upstream unavailable');error.status=response.status;throw error;}
   const payload=await readBounded(response);validate(payload);
   const saved={payload,observedAt:new Date(now()).toISOString()};
   const seconds=typeof ttl==='function'?ttl(payload):ttl;
   if(cache)await cache.put(key,new Response(JSON.stringify(saved),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+seconds}}));
   return {...saved,cacheHit:false};
  }finally{clearTimeout(timer);}
 })().finally(()=>pending.delete(key.url));
 pending.set(key.url,task);return task;
}
export async function gameResponse(request,{cache=globalThis.caches?.default,fetcher=(url,options)=>globalThis.fetch(url,options),now=Date.now}={}){
 const url=new URL(request.url),gameId=url.searchParams.get('gameId'),game=Object.hasOwn(identities.games,gameId)?identities.games[gameId]:null;
 if(!game)return json({error:'This game has no verified source mapping.'},404);
 const requestedDetails=[...new Set((url.searchParams.get('details')||'').split(',').filter(Boolean))].sort();
 if(requestedDetails.length>12||requestedDetails.some(id=>!/^00-\d{7}$/.test(id)||(Object.hasOwn(identities.players,id)&&![game.home,game.away].includes(identities.players[id].team))))return json({error:'Invalid player selection.'},400);
 const details=requestedDetails.filter(id=>Object.hasOwn(identities.players,id));
 const key=path=>new Request(new URL('/api/parlay/_cache/'+path,url.origin));
 try{
  const summary=await cachedJSON({url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+game.providerId,key:key('summary/'+game.providerId),cache,fetcher,now,validate:p=>validateSummary(p,game),ttl:p=>p.header.competitions[0].status?.type?.completed?300:30});
  const competition=validateSummary(summary.payload,game),participation=participationEvidence(summary.payload);
  const status=competition.status?.type?.completed?'final':competition.status?.type?.state==='in'?'live':competition.status?.type?.state==='pre'?'pregame':'unavailable';
  const observations=mapEspnSummary(summary.payload,{gameId:game.id,providerGameId:game.providerId,season:game.season,idMap,participation,observedAt:summary.observedAt}).map(s=>({...s,team:canonical(s.team),source:'ESPN · experimental'}));
  const touchdowns=scoringTouchdowns(summary.payload);for(const observation of observations)if(touchdowns?.has(observation.providerId))observation.metrics.anytime_tds=touchdowns.get(observation.providerId);
  const notes=requestedDetails.filter(id=>!Object.hasOwn(identities.players,id)).map(playerId=>({playerId,reason:'Exact player mapping unavailable.'}));let hits=summary.cacheHit;const started=now();
  // At most 12 player detail calls per request; each has its own shared cache.
  for(let start=0;start<details.length;start+=3){
   if(now()-started>10000){for(const playerId of details.slice(start))notes.push({playerId,reason:'Detail request deferred.'});break;}
   await Promise.all(details.slice(start,start+3).map(async playerId=>{
    const existing=observations.find(s=>s.playerId===playerId);if(url.searchParams.get('fullDetails')!=='1'&&typeof existing?.metrics.anytime_tds==='number')return;
    const player=identities.players[playerId],competitor=competition.competitors.find(c=>canonical(c.team.abbreviation)===player.team),teamId=String(competitor.id);
    const options={game,playerId,providerId:player.providerId,teamId,team:player.team,status,observedAt:summary.observedAt,participated:participation[playerId]};
    try{
     const detail=await cachedJSON({url:'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/'+game.providerId+'/competitions/'+game.providerId+'/competitors/'+teamId+'/roster/'+player.providerId+'/statistics/0',key:key('player/'+game.providerId+'/'+player.providerId),cache,fetcher,now,validate:p=>mapCoreStats(p,options),ttl:status==='final'?300:30});
     hits=hits&&detail.cacheHit;
     options.observedAt=[summary.observedAt,detail.observedAt].sort()[0];
     const observation=mapCoreStats(detail.payload,options),index=observations.findIndex(s=>s.playerId===playerId);
     if(index>=0)observations[index]=observation;else observations.push(observation);
    }catch(error){hits=false;notes.push({playerId,reason:'Additional stat coverage unavailable.',code:error.status?'upstream-'+error.status:error.name==='AbortError'?'timeout':/identity/i.test(error.message)?'identity-mismatch':'invalid-response'});}
   }));
  }
  observations.push(...mapEspnMoneylines(summary.payload,{gameId:game.id,providerGameId:game.providerId,season:game.season,game:{schedule_id:game.id,home:game.home,away:game.away},observedAt:summary.observedAt}));
  return json({experimental:true,source:'ESPN (unofficial)',gameId:game.id,season:game.season,gameStatus:status,observedAt:summary.observedAt,nextPollMs:status==='final'?300000:30000,observations:observations.map(s=>({...s,finalVerified:status==='final'&&s.status==='final'&&s.verified===true})),notes,finalResultsEnabled:true,finalSettlementEnabled:false},200,hits?'HIT':'MISS');
 }catch(error){return json({error:error.status===429?'Source rate limited. Saved stats were kept.':'Stats temporarily unavailable. Saved stats were kept.',retryAfterMs:error.status===429?120000:60000},503);}
}
function json(body,status=200,cache='NONE'){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Parlay-Cache':cache,'X-Content-Type-Options':'nosniff'}});}
