export const UFC_MARKETS = {
 ufc_win:'Fight winner', ufc_ko:'Win by KO/TKO', ufc_submission:'Win by submission',
 ufc_decision:'Win by decision', ufc_round:'Win in round',
 ufc_distance:'Goes the distance', ufc_rounds:'Total rounds'
};
export const UFC_SOURCE='ESPN UFC FightCenter';
export const isUfcLeg=leg=>Object.hasOwn(UFC_MARKETS,leg?.category);
const id=value=>typeof value==='string'&&/^\d{1,15}$/.test(value);
const dateKey=(date,timeZone)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
const nameKey=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function normalizeUfcEvents(payload,checkedAt){
 const fights=new Map(), duplicates=new Set();
 for(const event of payload?.events??[]){
  if(!id(event.id)||!Number.isFinite(Date.parse(event.date))||typeof event.name!=='string')continue;
  for(const bout of event.competitions??[]){
   if(!id(bout.id))continue;
   const fighters=(bout.competitors??[]).map(f=>({id:f.id,name:f.athlete?.displayName??f.athlete?.fullName,won:f.winner===true}));
   if(fighters.length!==2||fighters.some(f=>!id(f.id)||typeof f.name!=='string'||!f.name.trim())||fighters[0].id===fighters[1].id)continue;
   const gameId='ufc:'+event.id+':'+bout.id;
   if(fights.has(gameId)){duplicates.add(gameId);continue;}
   const type=bout.status?.type??{}, winners=fighters.filter(f=>f.won);
   const final=type.state==='post'&&type.completed===true&&type.name==='STATUS_FINAL'&&winners.length===1;
   const outcome=final?'final':type.state==='pre'?'pregame':type.state==='in'?'live':'unavailable';
   const methods={'20':'submission','21':'ko','22':'decision'};
   const known=[...new Set((bout.details??[]).filter(d=>/^Unofficial Winner\b/i.test(d.type?.text??'')).map(d=>methods[d.type.id]??null))];
   const method=final&&known.length===1?known[0]:null;
   const round=bout.status?.period, planned=bout.format?.regulation?.periods;
   const clock=bout.status?.displayClock?.match(/^(\d):([0-5]\d)$/);
   const elapsed=clock?Number(clock[1])*60+Number(clock[2]):null;
   const length=final&&[3,5].includes(planned)&&Number.isInteger(round)&&round>=1&&round<=planned&&elapsed!==null&&elapsed<=300
    ?(round-1)*300+elapsed:null;
   fights.set(gameId,{gameId,title:event.name,date:event.date,scheduledFor:Number.isFinite(Date.parse(bout.date))?bout.date:event.date,
    season:Number(event.date.slice(0,4)),fighters:fighters.map(({id,name})=>({id,name})),rounds:[3,5].includes(planned)?planned:null,
    outcome,winnerId:final?winners[0].id:null,method,finishRound:length!==null&&method&&method!=='decision'?round:null,
    length,checkedAt});
  }
 }
 return [...fights.values()].filter(f=>!duplicates.has(f.gameId)).sort((a,b)=>a.date.localeCompare(b.date));
}
export function ufcFightDate(fight,timeZone){return dateKey(fight.date,timeZone);}
export function makeUfcLeg(fight,category,fighterId,operator,target,timeZone){
 const fightMarket=['ufc_distance','ufc_rounds'].includes(category);
 const fighter=fightMarket?null:fight?.fighters.find(f=>f.id===fighterId);
 return {kind:'ufc',category,gameId:fight?.gameId??null,season:fight?.season??null,team:'UFC',
  playerId:fightMarket?'fight':fighter?.id??null,playerName:fightMarket?(fight?.fighters.map(f=>f.name).join(' vs ')??'Choose a fight'):fighter?.name??null,
  eventDate:fight?ufcFightDate(fight,timeZone):null,eventTitle:fight?.title??null,
  matchup:fight?.fighters.map(f=>f.name).join(' vs ')??null,
  operator:category==='ufc_rounds'?operator:'>=',target:['ufc_rounds','ufc_round','ufc_distance'].includes(category)?target:1,
  verificationStatus:'review',confidence:1,reviewReason:'Confirm the exact UFC bout and market'};
}
export function validUfcLeg(leg){
 if(leg.kind!=='ufc'||leg.team!=='UFC'||!/^ufc:\d{1,15}:\d{1,15}$/.test(leg.gameId)||!/^\d{4}-\d{2}-\d{2}$/.test(leg.eventDate)||!Number.isFinite(Date.parse(leg.eventDate))||typeof leg.matchup!=='string'||!leg.matchup||typeof leg.playerName!=='string'||!leg.playerName)return false;
 if(leg.category==='ufc_rounds')return leg.playerId==='fight'&&['>','<'].includes(leg.operator)&&Number.isFinite(leg.target)&&leg.target>0&&leg.target<5&&leg.target%1===0.5;
 if(leg.category==='ufc_distance')return leg.playerId==='fight'&&leg.operator==='>='&&[0,1].includes(leg.target);
 return id(leg.playerId)&&leg.operator==='>='&&(leg.category==='ufc_round'?Number.isInteger(leg.target)&&leg.target>=1&&leg.target<=5:leg.target===1);
}
export function ufcObservationReport(fight){
 if(!fight)return null;
 const final=fight.outcome==='final', observedAt=final?fight.checkedAt:null;
 const report={gameId:fight.gameId,season:fight.season,gameStatus:fight.outcome,observedAt,
  scheduledFor:fight.scheduledFor,nextPollMs:final?300000:60000,finalResultsEnabled:final,observations:[]};
 if(!final)return report;
 for(const fighter of fight.fighters){
  const win=fighter.id===fight.winnerId;
  const metrics={ufc_win:Number(win)};
  for(const method of ['ko','submission','decision'])if(fight.method||!win)metrics['ufc_'+method]=Number(win&&fight.method===method);
  if(!win||fight.method==='decision'||fight.finishRound)metrics.ufc_round=win&&fight.finishRound?fight.finishRound:0;
  report.observations.push({metrics,playerId:fighter.id});
 }
 const metrics={};
 if(fight.length!==null&&fight.rounds){
  if(fight.length<fight.rounds*300)metrics.ufc_distance=0;
  else if(fight.method==='decision')metrics.ufc_distance=1;
 }
 if(fight.length!==null)metrics.ufc_rounds=fight.length/300;
 if(Object.keys(metrics).length)report.observations.push({playerId:'fight',metrics});
 report.observations=report.observations.map(o=>({...o,gameId:fight.gameId,season:fight.season,team:'UFC',source:UFC_SOURCE,status:'final',verified:true,finalVerified:true,participated:true,observedAt}));
 return report;
}
export function ufcComparison(leg){
 if(leg.category==='ufc_round')return value=>value===leg.target;
 if(leg.category==='ufc_distance')return value=>value===leg.target;
 return null;
}
export function ufcSelection(leg){
 if(leg.category==='ufc_round')return 'Win in round '+leg.target;
 if(leg.category==='ufc_rounds')return (leg.operator==='>'?'Over':'Under')+' '+leg.target+' rounds';
 if(leg.category==='ufc_distance')return leg.target===0?'Does not go the distance':'Goes the distance';
 return UFC_MARKETS[leg.category];
}
export function parseUfcSelections(text,fights,{date,timeZone}){
 const unsupported=line=>({category:'unsupported',playerName:line,unsupportedMarket:'UFC special market',operator:null,target:null,verificationStatus:'review',reviewReason:'This UFC market requires separate settlement rules. Remove it explicitly before confirming.'});
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),legs=[];
 const available=date?fights.filter(f=>ufcFightDate(f,timeZone)===date):[];
 const markets=[
  ['ufc_round',/\b(?:to )?win (?:in )?(?:round|rd)\.?\s*([1-5])\b/i],
  ['ufc_ko',/\b(?:to )?win by (?:ko(?:\s*\/\s*tko)?|tko|knockout)\b/i],
  ['ufc_submission',/\b(?:to )?win by submission\b/i],
  ['ufc_decision',/\b(?:to )?win by decision\b/i],
  ['ufc_distance',/\b(?:does not go|will not go|goes|to go|go) (?:the )?distance\b/i],
  ['ufc_rounds',/\b(over|under)\s*(\d+(?:\.\d+)?)\s*rounds?\b/i],
  ['ufc_win',/\b(?:money\s*line|fight winner|to win)\b/i]
 ];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/\b(?:significant strikes|takedowns|double chance|round betting combinations)\b/i.test(line)||/\bwin by\b/i.test(line)&&!markets.slice(1,4).some(([,re])=>re.test(line))){legs.push(unsupported(line));continue;}
  const market=markets.find(([,re])=>re.test(line));if(!market)continue;
  const [category,re]=market,match=line.match(re);
  if(/^\s*(?:or|and|\+)\b/i.test(line.slice(match.index+match[0].length))){legs.push(unsupported(line));continue;}
  const near=[line,lines[i-1]??'',lines[i+1]??''];
  const textKey=near.map(nameKey), selection=nameKey((line.slice(0,match.index).trim()||near[1]).replace(/\s+[+-]\d{2,6}\s*$/,''));
  const matchFighters=f=>f.fighters.filter(p=>selection===nameKey(p.name));
  const matches=available.filter(f=>['ufc_distance','ufc_rounds'].includes(category)
   ?f.fighters.every(p=>textKey.some(line=>(' '+line+' ').includes(' '+nameKey(p.name)+' ')))
   :matchFighters(f).length===1);
  const fight=matches.length===1?matches[0]:null;
  const fighter=fight?matchFighters(fight)[0]:null;
  const target=category==='ufc_rounds'?Number(match[2]):category==='ufc_round'?Number(match[1]):1;
  const leg=makeUfcLeg(fight,category,fighter?.id,match[1]?.toLowerCase()==='over'?'>':'<',target,timeZone);
  if(category==='ufc_distance'&&(/\bnot\b/i.test(match[0])||/^(?:\s*[-:])?\s*no\b/i.test(line.slice(match.index+match[0].length))))leg.target=0;
  if(!fight){leg.eventDate=date||null;leg.playerName=line;leg.reviewReason='Select the exact bout and fighter from the event date';}
  legs.push(leg);
 }
 return legs;
}
