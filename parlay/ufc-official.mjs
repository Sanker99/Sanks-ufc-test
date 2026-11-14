import {officialEvents} from './ufc-official-events.mjs';
export const UFC_OFFICIAL_SOURCE='UFC official fight feed';
const origin='https://d29dxerjsp82wz.cloudfront.net/api/v3';
const key=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const fullName=p=>[p.Name?.FirstName,p.Name?.LastName].filter(Boolean).join(' ');
const date=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const sameDate=(event,fight)=>Number.isFinite(Date.parse(event.StartTime))&&date(event.StartTime)===date(fight.date);
const validId=id=>Number.isSafeInteger(id)&&id>0;
// Explicit spelling differences verified against both event cards, opponents,
// date, and source IDs. Scoped to these bouts; never used as fuzzy aliases.
const aliases=[
 ['ufc:600062700:401933605','5013686','Matthieu Letho Duclos',4202,'Matthieu Duclos'],
 ['ufc:600062700:401933604','5345640','Mehemmedeli Osmanli',4661,'Mahammadali Osmanli']
];
const identityMatches=(local,row,fight)=>key(fullName(row))===key(local.name)||aliases.some(([game,id,localName,providerId,providerName])=>
 game===fight.gameId&&id===local.id&&key(localName)===key(local.name)&&row.FighterId===providerId&&key(fullName(row))===key(providerName));
function pairMatches(rows,fight){
 return Array.isArray(rows)&&rows.length===2&&new Set(rows.map(p=>p.FighterId)).size===2&&rows.every(p=>validId(p.FighterId))&&
  fight.fighters.length===2&&new Set(fight.fighters.map(p=>key(p.name))).size===2&&fight.fighters.every(p=>rows.filter(row=>identityMatches(p,row,fight)).length===1);
}
export function officialBout(event,fight){
 if(!event||!validId(event.EventId)||!sameDate(event,fight)||!Array.isArray(event.FightCard))return null;
 const matches=event.FightCard.filter(b=>validId(b.FightId)&&pairMatches(b.Fighters,fight));
 return matches.length===1?matches[0]:null;
}
export function applyOfficialFight(fight,payload,{eventId,fightId,now=Date.now()}={}){
 const d=payload?.LiveFightDetail;
 if(!d||d.FightId!==fightId||d.Event?.EventId!==eventId||!sameDate(d.Event,fight)||!pairMatches(d.Fighters,fight)||
  !['Upcoming','Live','Over','Final'].includes(d.Status)||![3,5].includes(d.RuleSet?.PossibleRounds)||
  (fight.rounds&&fight.rounds!==d.RuleSet.PossibleRounds))return null;
 if(['Live','Over','Final'].includes(d.Status)&&Date.parse(d.Event.StartTime)>now+60000)return null;
 const wins=d.Fighters.filter(p=>p.Outcome?.Outcome==='Win'), losses=d.Fighters.filter(p=>p.Outcome?.Outcome==='Loss');
 const final=d.Status==='Final'&&wins.length===1&&losses.length===1;
 if(d.Status==='Final'&&!final)return null;
 const winner=final?fight.fighters.find(p=>identityMatches(p,wins[0],fight)):null;
 const method=d.Result?.Method;
 const mappedMethod=/^(?:KO\/TKO|TKO|KO|TKO - Doctor['’]s Stoppage)$/i.test(method??'')?'ko':/^submission$/i.test(method??'')?'submission':/^(?:(?:(?:unanimous|split|majority) )?decision|decision - (?:unanimous|split|majority))$/i.test(method??'')?'decision':null;
 const round=d.Result?.EndingRound,time=d.Result?.EndingTime?.match(/^([0-5]):([0-5]\d)$/);
 const length=final&&Number.isInteger(round)&&round>=1&&round<=d.RuleSet.PossibleRounds&&time&&(Number(time[1])<5||Number(time[2])===0)?(round-1)*300+Number(time[1])*60+Number(time[2]):null;
 const outcome=final?'final':d.Status==='Upcoming'?'pregame':'live';
 const result={...fight,rounds:d.RuleSet.PossibleRounds,outcome,winnerId:winner?.id??null,method:final?mappedMethod:null,
  length,finishRound:final&&mappedMethod&&mappedMethod!=='decision'&&length!==null?round:null,
  officialEventId:eventId,officialFightId:fightId,checkedAt:new Date(now).toISOString(),source:UFC_OFFICIAL_SOURCE,
  fighters:fight.fighters.map(p=>({id:p.id,name:p.name}))};
 if(outcome==='pregame')return result;
 const counts=row=>{
  const fields=['SigStrikesLanded','SigStrikesAttempted','TakedownsLanded','TakedownsAttempted'];
  if(!row||fields.some(k=>!Number.isSafeInteger(row[k])||row[k]<0)||row.SigStrikesLanded>row.SigStrikesAttempted||row.TakedownsLanded>row.TakedownsAttempted)return null;
  if(row.TotalStrikesLanded!=null&&(!Number.isSafeInteger(row.TotalStrikesLanded)||row.TotalStrikesLanded<row.SigStrikesLanded))return null;
  return {ufc_sig_strikes:row.SigStrikesLanded,ufc_takedowns:row.TakedownsLanded};
 };
 const stats=d.FightStats;
 if(!Array.isArray(stats)||stats.length!==2)return result;
 for(const p of result.fighters){
  const identity=d.Fighters.find(f=>identityMatches(p,f,fight));
  const rows=stats.filter(row=>row.FighterId===identity.FighterId),totals=rows.length===1?counts(rows[0]):null;
  if(!totals)continue;
  let complete=final&&d.OfficialStats===true&&length!==null;
  if(complete){
   const entries=d.RoundStats?.filter(row=>row.FighterId===identity.FighterId)??[];
   const rounds=entries.length===1?entries[0].Rounds:[];
   complete=rounds.length===round&&new Set(rounds.map(r=>r.RoundNumber)).size===round&&rounds.every(r=>Number.isInteger(r.RoundNumber)&&r.RoundNumber>=1&&r.RoundNumber<=round&&counts(r));
   if(complete)for(const metric of Object.keys(totals))if(rounds.reduce((sum,r)=>sum+counts(r)[metric],0)!==totals[metric])complete=false;
  }
  p.stats=totals;p.statsSource=UFC_OFFICIAL_SOURCE;p.statsFinalVerified=!!complete;
 }
 return result;
}
const cache=new Map();
async function read(fetchSource,url,ttl){
 const old=cache.get(url),now=Date.now();
 if(old&&old.expires>now)return old.promise;
 const promise=(async()=>{
  const response=await fetchSource(url,{signal:AbortSignal.timeout(6500),cf:{cacheEverything:true,cacheTtl:ttl}});
  if(!response.ok)throw Error('Official UFC feed unavailable');
  const raw=await response.text();if(raw.length>2000000)throw Error('Official UFC response too large');
  return JSON.parse(raw);
 })().catch(e=>{cache.delete(url);throw e;});
 cache.set(url,{expires:now+ttl*1000,promise});return promise;
}
// Server-side discovery keeps later events working beyond the verified seed
// directory. Only links published on UFC's own event directory are followed.
export async function attachUfcOfficialEvents(fights,fetchSource=fetch){
 let directory;
 const resolved=new Map();
 for(const fight of fights){
  const seed=officialEvents.filter(e=>e.date===fight.date.slice(0,10));
  if(seed.length===1){fight.officialEventId=seed[0].eventId;continue;}
  const eventKey=fight.date.slice(0,10)+'|'+fight.title;
  if(resolved.has(eventKey)){if(resolved.get(eventKey))fight.officialEventId=resolved.get(eventKey);continue;}
  resolved.set(eventKey,null);
  try{
   directory??=await(await fetchSource('https://www.ufc.com/events',{signal:AbortSignal.timeout(6500),cf:{cacheEverything:true,cacheTtl:3600}})).text();
   if(directory.length>2000000)continue;
   const paths=[...new Set([...directory.matchAll(/href="(\/event\/[a-z0-9-]+)"/g)].map(m=>m[1]))];
   const numbered=fight.title?.match(/\bUFC\s+(\d+)\b/i)?.[1];
   const day=new Date(fight.date),month=day.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase();
   const suffix=numbered?'ufc-'+numbered:'ufc-fight-night-'+month+'-'+String(day.getUTCDate()).padStart(2,'0')+'-'+day.getUTCFullYear();
   const matches=paths.filter(p=>p.endsWith('/'+suffix)||p.endsWith('-'+suffix));
   if(matches.length!==1)continue;
   const response=await fetchSource('https://www.ufc.com'+matches[0],{signal:AbortSignal.timeout(6500),cf:{cacheEverything:true,cacheTtl:3600}});
   if(!response.ok)continue;
   const html=await response.text();if(html.length>2000000)continue;
   const raw=html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/)?.[1];
   if(!raw)continue;
   const settings=JSON.parse(raw),eventId=Number(settings.eventLiveStats?.event_fmid);
   if(!validId(eventId)||settings.ufcLiveStatsApi?.baseUrl!==origin)continue;
   const event=(await read(fetchSource,origin+'/event/live/'+eventId+'.json',10)).LiveEventDetail;
   if(event.EventId===eventId&&officialBout(event,fight)){fight.officialEventId=eventId;resolved.set(eventKey,eventId);}
  }catch{/* ESPN remains available if event discovery is temporarily unavailable. */}
 }
 return fights;
}
export async function fetchUfcOfficialFight(fight,fetchSource=fetch){
 const ids=Number.isSafeInteger(fight.officialEventId)?[fight.officialEventId]:officialEvents.filter(e=>e.date===fight.date.slice(0,10)||date(e.date+'T12:00Z')===date(fight.date)).map(e=>e.eventId);
 for(const eventId of ids){
  const event=(await read(fetchSource,origin+'/event/live/'+eventId+'.json',10)).LiveEventDetail;
  const bout=officialBout(event,fight);if(!bout)continue;
  const detail=await read(fetchSource,origin+'/fight/live/'+bout.FightId+'.json',5);
  const mapped=applyOfficialFight(fight,detail,{eventId,fightId:bout.FightId});
  if(mapped)return mapped;
 }
 return null;
}

