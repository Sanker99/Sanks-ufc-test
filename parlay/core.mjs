import {matchTeam,teamName,isTeamLeg,sameObservation,moneylineScores} from './moneyline.mjs';
export const CATEGORIES = {moneyline:'Moneyline',unsupported:'Unsupported market — review',passing_yards:'Passing yards',passing_tds:'Passing touchdowns',completions:'Passing completions',attempts:'Passing attempts',interceptions:'Interceptions',rushing_yards:'Rushing yards',carries:'Rushing attempts',rushing_tds:'Rushing touchdowns',receiving_yards:'Receiving yards',receptions:'Receptions',receiving_tds:'Receiving touchdowns',anytime_tds:'Anytime touchdown',rush_receive_yards:'Rushing + receiving yards'};
const patterns = [
 ['moneyline',/\bmoney\s*line\b/i],
 ['rush_receive_yards',/(?:rush(?:ing)?\s*(?:\+|and|&)\s*rec(?:eiving)?|combined rushing and receiving)\s*(?:yds|yards)/i],
 ['anytime_tds',/(?:any\s*time\s*(?:touchdown|td)(?:\s*scorer)?|to score (?:a |an )?touchdown|(?:touchdown|td)\s*scorer)/i],
 ['passing_yards',/pass(?:ing)?\s*(?:yds|yards)/i],['passing_tds',/pass(?:ing)?\s*(?:touchdowns?|tds?)/i],
 ['completions',/(?:pass(?:ing)?\s*)?completions?/i],['attempts',/pass(?:ing)?\s*attempts?/i],['interceptions',/interceptions?(?:\s*thrown)?/i],
 ['rushing_yards',/rush(?:ing)?\s*(?:yds|yards)/i],['carries',/(?:rush(?:ing)?\s*attempts?|carries)/i],['rushing_tds',/rush(?:ing)?\s*(?:touchdowns?|tds?)/i],
 ['receiving_yards',/rec(?:eiving)?\s*(?:yds|yards)/i],['receptions',/receptions?/i],['receiving_tds',/rec(?:eiving)?\s*(?:touchdowns?|tds?)/i]];
export function categoryOf(text){for(const [key,re] of patterns){const match=text.match(re);if(match)return {key,match};}return null;}
export const normalizeName = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/0/g,'o').replace(/1/g,'l').replace(/[’']/g,'').replace(/[^a-z\s]/g,' ').replace(/\b(jr|sr|ii|iii|iv|ill|lll)\b/g,'').replace(/\s+/g,' ').trim();
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]!==b[j-1]));row=next;}return row[b.length];}
export function matchPlayer(raw,roster,context={}){
 const name=normalizeName(raw),tokens=name.split(' ');
 if(!name||tokens.length<2)return {player:null,confidence:0,candidates:[],reason:'Full or abbreviated name required'};
 const scores=roster.filter(p=>(!context.team||p.team===context.team)&&(!context.season||p.season===context.season)).map(player=>{
  const n=normalizeName(player.name),t=n.split(' ');let score=1-distance(name,n)/Math.max(name.length,n.length);
  if(tokens[0].length===1&&tokens[0]===t[0][0]&&tokens.slice(1).join(' ')===t.slice(1).join(' '))score=.94;
  return {player,score};}).sort((a,b)=>b.score-a.score);
 const best=scores[0],ok=best&&best.score>=.84&&best.score-(scores[1]?.score??0)>=.07;
 return {player:ok?best.player:null,confidence:best?.score??0,candidates:scores.slice(0,3).filter(x=>x.score>=.55).map(x=>({id:x.player.id,name:x.player.name,team:x.player.team,score:x.score})),reason:ok?'Roster match; confirm game and target':'Ambiguous or unknown player; choose manually'};
}
export function thresholdOf(text,category){
 if(category==='moneyline')return {operator:'win',target:null};
 const hits=[...text.replace(/[−–]/g,'-').matchAll(/\b(over|under)\s*(\d+(?:\.\d+)?)(?![\w.])|([<>]=?)\s*(\d+(?:\.\d+)?)(?![\w.])|(?<![\w.+-])(\d+(?:\.\d+)?)\s*\+/gi)].map(m=>({operator:m[1]?(m[1].toLowerCase()==='over'?'>':'<'):m[3]||'>=',target:Number(m[2]??m[4]??m[5])}));
 const unique=[...new Map(hits.map(x=>[JSON.stringify(x),x])).values()];
 if(unique.length===1)return unique[0];if(!unique.length&&category==='anytime_tds')return {operator:'>=',target:1};return {operator:null,target:null};
}
const junk=/(?:\b(?:odds|promo|boost|wager|payout|stake|profit|balance|bonus|account|ticket|bet id|total charged|total payout|bet protect|rewards)\b|\$|https?:|\S+@\S+)/i;
export function deduplicate(legs){const seen=new Set();return legs.filter(l=>{if(isTeamLeg(l)){if(!l.team)return true;const key=JSON.stringify(['team',l.team,l.gameId,l.season]);if(seen.has(key))return false;seen.add(key);return true;}if(!l.playerId||l.target===null)return true;const key=JSON.stringify([l.playerId,l.gameId,l.season,l.category,l.operator,l.target]);if(seen.has(key))return false;seen.add(key);return true;});}
function selectionName(raw,roster,context){
 let clean=raw.replace(/\s*[+-]\d{2,8}(?:\.\d+)?\s*$/,'');
 const target=clean.search(/\b(?:over|under)\s*\d|\d+(?:\.\d+)?\s*\+/i);if(target>=0)clean=clean.slice(0,target);
 clean=clean.replace(/\b(?:alternate|alt|player)\b/gi,'').replace(/^(?:to record|to have)\s*/i,'').replace(/[^\p{L}\p{N}\s.'’,-]/gu,' ').replace(/[-,:]+/g,' ').replace(/\s+/g,' ').trim();
 const words=clean.split(' '),candidates=[clean];
 // Small leading OCR/logo fragments may precede a name; roster confidence still decides.
 for(let drop=1;drop<=2&&drop<words.length-1;drop++){if(words.slice(0,drop).every(w=>w.length<=3))candidates.push(words.slice(drop).join(' '));}
 const scored=candidates.map(name=>({name,...matchPlayer(name,roster,context)})).sort((a,b)=>Number(!!b.player)-Number(!!a.player)||b.confidence-a.confidence);
 return scored[0]??{name:clean,player:null,confidence:0,candidates:[],reason:'Unknown player'};
}
export function parseSlip(text,roster,context={}){return parseSlipDetailed(text,roster,context).legs;}
export function parseSlipDetailed(text,roster,context={}){
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),legs=[];let pending=null,last=null;
 const declared=[...String(text).matchAll(/^\s*(\d{1,2})\s*leg\s*parlay\b/gim)].map(m=>Number(m[1]));
 for(let i=0;i<lines.length;i++){
  let line=lines[i];if(junk.test(line))continue;
  // Compact receipt summaries repeat selections and can contain several categories.
  if((line.includes(',')&&categoryOf(line))||/\.\.\.|…/.test(line))continue;
  if(/\b(?:passing|rushing|receiving)\s*$/i.test(line)&&/^(?:yds|yards|tds|touchdowns?)$/i.test(lines[i+1]??''))line+=' '+lines[++i];
  if(/\bmoney\s*line\b/i.test(line)){
   const index=line.search(/money\s*line/i),rawTeam=line.slice(0,index).trim()||pending?.name||'',selected=matchTeam(rawTeam);
   legs.push({kind:'team',playerId:null,playerName:null,team:selected?.code??null,teamName:selected?.name??(rawTeam||'Choose a team'),season:context.season??null,gameId:context.gameId??resolveGame(selected?{team:selected.code}:null,context.games??[],context.gameDate,text)?.schedule_id??null,category:'moneyline',operator:'win',target:null,confidence:Math.min(selected?1:0,context.ocrConfidence??1),verificationStatus:'review',reviewReason:selected?'Team matched; confirm the moneyline selection and game':'Choose the exact NFL team and game'});pending=null;last=null;continue;
  }
  if(/\b(?:point spread|total points)\b/i.test(line)){
   const market=line.match(/money\s*line|point spread|total points/i)[0];
   legs.push({playerId:null,playerName:pending?.name||'Team selection',team:null,season:context.season??null,gameId:null,category:'unsupported',operator:null,target:null,confidence:0,verificationStatus:'review',unsupportedMarket:market,reviewReason:market+' is not supported. Remove this leg explicitly to build a player-props-only parlay.'});pending=null;last=null;continue;
  }
  const cat=categoryOf(line);
  if(!cat){
   const found=selectionName(line,roster,context);
   if(!found.player&&/@|\bvs\.?\b|\b(?:AM|PM)\s*(?:CT|ET|PT|MT)?\b/i.test(line)){pending=null;last=null;continue;}
   if(found.player||(found.name.split(/\s+/).length>=2&&found.name.split(/\s+/).length<=5&&!/\b(?:open|settled|bets|leg parlay|home|live)\b/i.test(found.name))){pending={...found,threshold:thresholdOf(line)};last=null;}
   continue;
  }
  const prefix=line.slice(0,cat.match.index),inline=selectionName(prefix,roster,context);
  const noiseOnly=!inline.player&&(inline.name.replace(/[^\p{L}]/gu,'').length<=3||/^(?:any|time)$/i.test(inline.name));
  const chosen=inline.player?inline:noiseOnly?(pending??inline):inline;
  let threshold=thresholdOf(line,cat.key);
  if(pending?.player&&inline.player?.id===pending.player.id&&pending.threshold.target!==null&&threshold.target!==null&&JSON.stringify(pending.threshold)!==JSON.stringify(threshold))threshold={operator:null,target:null,conflict:true};
  if(!threshold.conflict&&threshold.target===null&&pending?.threshold.target!==null&&pending?.threshold.target!==undefined&&(!inline.player||inline.player.id===pending.player?.id))threshold=pending.threshold;
  if(!threshold.conflict&&threshold.target===null&&/^(?:(?:over|under|[<>]=?)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*\+)$/i.test(lines[i+1]??''))threshold=thresholdOf(lines[i+1],cat.key);
  // A title and its detailed category describe the same card, not two selections.
  if(last&&chosen.player?.id===last.playerId&&cat.key===last.category&&thresholdOf(line,cat.key).target===null){pending=null;continue;}
  const player=chosen.player;
  const leg={playerId:player?.id??null,playerName:player?.name??chosen.name,team:player?.team??null,season:context.season??null,gameId:context.gameId??resolveGame(player,context.games??[],context.gameDate,text)?.schedule_id??null,category:cat.key,...threshold,confidence:Math.min(chosen.confidence??0,context.ocrConfidence??1),verificationStatus:'review',candidates:chosen.candidates??[],reviewReason:threshold.target===null?'Missing or conflicting explicit target':chosen.reason};
  legs.push(leg);pending=null;last=leg;
 }
 const unique=deduplicate(legs),warnings=[];
 if(new Set(declared).size>1)warnings.push('Different parlay leg totals were found. Check that these screenshots belong to the same parlay.');
 if(declared.length&&new Set(declared).size===1&&declared[0]!==unique.length)warnings.push('The slip header says '+declared[0]+' legs, but '+unique.length+' selections were recognized. Compare with your original slip before locking.');
 return {legs:unique,warnings,declaredLegCount:declared.length?declared[0]:null};
}
export function validateLeg(l){
 if(!l||!l.gameId||!Number.isInteger(l.season)||l.verificationStatus!=='confirmed')return false;
 if(isTeamLeg(l))return !!(teamName(l.team)&&l.teamName===teamName(l.team)&&l.playerId==null&&l.operator==='win'&&l.target===null);
 return !!(l.category!=='unsupported'&&l.playerId&&l.playerName&&l.team&&Object.hasOwn(CATEGORIES,l.category)&&['>','>=','<','<='].includes(l.operator)&&typeof l.target==='number'&&Number.isFinite(l.target)&&l.target>=0);
}
// Both individual and bulk review use the same identity and completeness checks.
export function confirmLegs(legs,{roster,games,season}){
 const unresolved=[];
 const reviewed=legs.map((leg,index)=>{
  const player=roster.find(p=>p.id===leg?.playerId&&p.team===leg?.team&&p.season===leg?.season);
  const game=games.find(g=>g.schedule_id===leg?.gameId);
  const teamLeg=leg?.category==='moneyline';
  const candidate={...leg,verificationStatus:'confirmed'};
  if(player&&!teamLeg)candidate.playerName=player.name;
  if(teamLeg)candidate.teamName=teamName(leg.team);
  if(leg?.season!==season||!game||![game.home,game.away].includes(leg?.team)||(!teamLeg&&!player)||!validateLeg(candidate)){
   const reason=leg?.category==='unsupported'?'This market is not supported.':!game?'Choose a game for this leg.':leg?.season!==season?'Choose a player and game from the current season.':![game.home,game.away].includes(leg.team)?'This game does not include the selected team.':(!teamLeg&&!player)?'Choose a matching roster player.':'Choose a valid comparison and numeric target.';
   unresolved.push({index,reason});return {...leg,verificationStatus:'review'};
  }
  return candidate;
 });
 return {legs:reviewed,confirmedCount:reviewed.length-unresolved.length,unresolved};
}
export function lockParlay(p,confirmed,now=new Date().toISOString()){if(p.lockedAt)throw Error('Locked parlays cannot be edited');if(p.importWarnings?.length)throw Error('Reconcile the import warning against your original slip before locking');if(p.legs.some(l=>l.category==='unsupported'))throw Error('Remove unsupported markets explicitly before locking a player-props parlay');if(deduplicate(p.legs).length!==p.legs.length)throw Error('Remove duplicate selections before locking');if(!confirmed||!p.legs.length||!p.legs.every(validateLeg))throw Error('Confirm every selection and its game before locking');return {...structuredClone(p),lockedAt:now,updatedAt:now};}
export function compare(v,op,t){return ({'>':()=>v>t,'>=':()=>v>=t,'<':()=>v<t,'<=':()=>v<=t}[op])?.()??false;}
export function evaluateLeg(l,s){
 if(!sameObservation(l,s))return 'Pending';
 if(s.voided===true&&s.settlementConfirmed===true)return 'Voided / Unavailable';
 if(['postponed','canceled','suspended'].includes(s.status))return 'Voided / Unavailable';
 if(s.status==='pregame')return 'Pending';
 if(!['live','final'].includes(s.status))return 'Voided / Unavailable';
 let hit;
 if(isTeamLeg(l)){const scores=moneylineScores(s);if(!s.verified||!scores)return 'Voided / Unavailable';if(scores.selected===scores.opponent)return s.status==='final'?'Voided / Unavailable':'Live';hit=scores.selected>scores.opponent;}
 else{const value=s.metrics?.[l.category];if(!s.verified||s.participated!==true||typeof value!=='number'||!Number.isFinite(value))return 'Voided / Unavailable';hit=compare(value,l.operator,l.target);}
 if(s.status==='final'&&s.finalVerified===true)return hit?'Final Hit':'Final Missed';
 if(['live','final'].includes(s.status))return hit?'Provisionally Hit':'Provisionally Missed';return 'Live';
}
export function legProgress(l,s){
 const state=evaluateLeg(l,s),base={available:false,percent:0,current:null,target:l.target,state,tone:'waiting',label:'Waiting for verified stats',source:null,observedAt:sameObservation(l,s)&&Number.isFinite(Date.parse(s.observedAt))?s.observedAt:null};
 if(!sameObservation(l,s)||!s.verified||['Pending','Voided / Unavailable'].includes(state))return base;
 if(isTeamLeg(l)){const scores=moneylineScores(s);if(!scores)return base;const hit=scores.selected>scores.opponent;return {...base,available:true,percent:100,current:scores.selected,opponent:scores.opponent,opponentTeam:s.opponentTeam??null,hit,tone:hit?'green':'red',label:scores.selected===scores.opponent?'Tied':hit?'Leading':'Trailing',source:s.source??null};}
 const value=s.metrics?.[l.category];if(s.participated!==true||typeof value!=='number'||!Number.isFinite(value))return base;
 const hit=compare(value,l.operator,l.target),percent=l.target>0?Math.max(0,Math.min(100,value/l.target*100)):hit?100:0;
 return {...base,available:true,percent,current:value,hit,tone:hit?'green':'red',label:hit?'Target currently met':'Target not yet met',source:s.source??null};
}
export function evaluateParlay(p,snapshots=[]){
 const legs=p.legs.map(l=>{const s=snapshots.filter(s=>sameObservation(l,s)&&Number.isFinite(Date.parse(s.observedAt))).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0],state=evaluateLeg(l,s);return {state,resolved:state.startsWith('Final ')||(s?.voided===true&&s?.settlementConfirmed===true),observedAt:s?.observedAt??null,progress:legProgress(l,s)};});
 return resultFromLegs(p,legs);
}
function resultFromLegs(p,legs){return {status:!p.lockedAt||!legs.length||!legs.every(l=>l.resolved)?'active':legs.some(l=>l.state==='Final Missed')?'lost':legs.every(l=>l.state==='Voided / Unavailable')?'voided':'won',legs};}
export function dayKey(date=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function parlayBucket(result){return ['won','lost'].includes(result.status)?result.status:'active';}
// Adapter contract permits a later D1 implementation without changing domain logic.
export class BrowserRepository{
 constructor(storage,key='sanks.parlays.v1'){this.storage=storage;this.key=key;}
 restore(raw){const incoming=parseBackup(raw).parlays,existing=this.list(),byId=new Map(existing.map(p=>[p.id,p]));for(const p of incoming){const old=byId.get(p.id);if(old&&JSON.stringify(old)!==JSON.stringify(p))throw Error('Backup conflicts with an existing parlay. Existing history was preserved.');}const added=incoming.filter(p=>!byId.has(p.id));this.storage.setItem(this.key,JSON.stringify({version:1,parlays:[...existing,...added]}));return added.length;}
 list(){const raw=this.storage.getItem(this.key);if(raw===null)return [];return parseBackup(raw).parlays;}
 save(p){parseBackup({version:1,parlays:[p]});const all=this.list(),old=all.find(x=>x.id===p.id);if(old?.lockedAt&&JSON.stringify({...old,result:undefined,resolvedDay:undefined})!==JSON.stringify({...p,result:undefined,resolvedDay:undefined}))throw Error('Locked parlays cannot be edited');const next=all.filter(x=>x.id!==p.id);next.push(structuredClone(p));this.storage.setItem(this.key,JSON.stringify({version:1,parlays:next}));return p;}
}

// Called by a future verified-source integration; selections remain immutable.
export function canPromoteFinal(previous,row){
 if(!previous||previous.resolved||!row.resolved||!['Final Hit','Final Missed'].includes(row.state)||previous.state!==row.state.replace('Final','Provisionally'))return false;
 if(!Number.isFinite(Date.parse(row.observedAt))||Date.parse(row.observedAt)!==Date.parse(previous.observedAt))return false;
 const a=previous.progress,b=row.progress;if(!a?.available||!b?.available)return false;
 return ['current','target','percent','hit','opponent','opponentTeam','source'].every(key=>a[key]===b[key]);
}
export function recordObservations(repository,parlay,snapshots,now=new Date()){
 const current=repository.list().find(p=>p.id===parlay.id)??parlay;
 if(!current.lockedAt)throw Error('Lock the parlay before recording observations');
 const proposed=evaluateParlay(current,snapshots);
 // A poll may cover only some games. Older batches cannot erase other legs.
 const legs=proposed.legs.map((row,i)=>{
  const previous=current.result?.legs[i];
  if(!previous)return row;
  if(!row.observedAt)return previous;
  const previousAt=Date.parse(previous.observedAt??previous.progress?.observedAt);
  return Number.isFinite(previousAt)&&Date.parse(row.observedAt)<=previousAt&&!canPromoteFinal(previous,row)?previous:row;
 });
 const result=resultFromLegs(current,legs);
 const resolvedDay=result.status==='active'?null:(current.resolvedDay||dayKey(now,current.timeZone));
 const record={...current,result,resolvedDay};repository.save(record);if(typeof window!=='undefined')window.dispatchEvent(new Event('sanks:parlays-updated'));return record;
}

// Dates must be supplied explicitly; an undated slip never inherits today's game.
export function resolveGame(player,games,date,text=''){
 if(!player||!/^\d{4}-\d{2}-\d{2}$/.test(date??''))return null;
 const aliases={LAR:'LA',JAC:'JAX',WSH:'WAS'};
 const pairs=[...text.toUpperCase().matchAll(/\b([A-Z]{2,3})\s*(?:@|VS\.?|V\.)\s*([A-Z]{2,3})\b/g)].map(m=>[aliases[m[1]]??m[1],aliases[m[2]]??m[2]]);
 const matches=games.filter(g=>g.date===date&&[g.home,g.away].includes(player.team)&&(!pairs.length||pairs.some(pair=>pair.includes(g.home)&&pair.includes(g.away))));
 return matches.length===1?matches[0]:null;
}
export function parseBackup(raw){
 let data;try{data=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);}catch{throw Error('Saved data is unreadable; existing storage was preserved');}
 const fail=()=>{throw Error('Unsupported or invalid backup; existing storage was preserved');};
 if(!data||data.version!==1||!Array.isArray(data.parlays)||data.parlays.length>1000)fail();
 const ids=new Set(),states=['Pending','Live','Provisionally Hit','Provisionally Missed','Final Hit','Final Missed','Voided / Unavailable'];
 for(const p of data.parlays){
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>200||ids.has(p.id)||!Array.isArray(p.legs)||p.legs.length>100||(p.name!==undefined&&(typeof p.name!=='string'||p.name.length>200)))fail();ids.add(p.id);
  if(p.importWarnings!==undefined&&(!Array.isArray(p.importWarnings)||p.importWarnings.some(w=>typeof w!=='string'||w.length>2000)))fail();
  if(p.timeZone!==undefined){try{new Intl.DateTimeFormat('en',{timeZone:p.timeZone});}catch{fail();}}
  for(const date of ['createdAt','updatedAt','lockedAt'])if(p[date]!=null&&!Number.isFinite(Date.parse(p[date])))fail();
  for(const l of p.legs){if(!l||typeof l!=='object'||!Object.hasOwn(CATEGORIES,l.category)||!['review','confirmed'].includes(l.verificationStatus)||!['>','>=','<','<=','win',null].includes(l.operator)||!(l.target===null||typeof l.target==='number'&&Number.isFinite(l.target)&&l.target>=0))fail();if(l.verificationStatus==='confirmed'&&!validateLeg(l))fail();}
  if(p.lockedAt&&(!p.legs.length||!p.legs.every(validateLeg)||deduplicate(p.legs).length!==p.legs.length))fail();
  if(p.result&&(!['active','won','lost','voided'].includes(p.result.status)||!Array.isArray(p.result.legs)||p.result.legs.length!==p.legs.length||!p.result.legs.every(l=>l&&states.includes(l.state)&&typeof l.resolved==='boolean')))fail();
  if(p.result){
   for(let i=0;i<p.result.legs.length;i++){const row=p.result.legs[i];if(row.observedAt!=null&&!Number.isFinite(Date.parse(row.observedAt)))fail();const progress=row.progress;if(progress===undefined)continue;if(!progress||typeof progress.available!=='boolean'||!Number.isFinite(progress.percent)||progress.percent<0||progress.percent>100||progress.state!==p.result.legs[i].state)fail();if(progress.observedAt!=null&&(!Number.isFinite(Date.parse(progress.observedAt))||(row.observedAt!=null&&progress.observedAt!==row.observedAt)))fail();if(progress.available){const leg=p.legs[i];const expectedPercent=isTeamLeg(leg)?100:leg.target>0?Math.max(0,Math.min(100,progress.current/leg.target*100)):compare(progress.current,leg.operator,leg.target)?100:0;if(Math.abs(progress.percent-expectedPercent)>0.000001)fail();if(['Final Hit','Provisionally Hit'].includes(progress.state)&&!progress.hit||['Final Missed','Provisionally Missed'].includes(progress.state)&&progress.hit)fail();if(!Number.isFinite(progress.current)||typeof progress.hit!=='boolean'||progress.target!==leg.target)fail();if(isTeamLeg(leg)){if(!Number.isInteger(progress.opponent)||progress.opponent<0||!Number.isInteger(progress.current)||progress.current<0||progress.hit!==(progress.current>progress.opponent))fail();}else if(progress.hit!==compare(progress.current,leg.operator,leg.target))fail();}}
   const rows=p.result.legs;if(rows.some(l=>l.resolved&&!l.state.startsWith('Final ')&&l.state!=='Voided / Unavailable'))fail();const expected=!p.lockedAt||!rows.length||!rows.every(l=>l.resolved)?'active':rows.some(l=>l.state==='Final Missed')?'lost':rows.every(l=>l.state==='Voided / Unavailable')?'voided':'won';if(p.result.status!==expected)fail();}
 }
 return data;
}
