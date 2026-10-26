export const CATEGORIES = {passing_yards:'Passing yards',passing_tds:'Passing touchdowns',completions:'Passing completions',attempts:'Passing attempts',interceptions:'Interceptions',rushing_yards:'Rushing yards',carries:'Rushing attempts',rushing_tds:'Rushing touchdowns',receiving_yards:'Receiving yards',receptions:'Receptions',receiving_tds:'Receiving touchdowns',anytime_tds:'Anytime touchdown',rush_receive_yards:'Rushing + receiving yards'};
const patterns = [
 ['rush_receive_yards',/(?:rush(?:ing)?\s*(?:\+|and|&)\s*rec(?:eiving)?|combined rushing and receiving)\s*(?:yds|yards)/i],
 ['anytime_tds',/(?:any\s*time\s*(?:touchdown|td)(?:\s*scorer)?|(?:touchdown|td)\s*scorer)/i],
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
 const hits=[...text.replace(/[−–]/g,'-').matchAll(/\b(over|under)\s*(\d+(?:\.\d+)?)(?![\w.])|([<>]=?)\s*(\d+(?:\.\d+)?)(?![\w.])|(?<![\w.+-])(\d+(?:\.\d+)?)\s*\+/gi)].map(m=>({operator:m[1]?(m[1].toLowerCase()==='over'?'>':'<'):m[3]||'>=',target:Number(m[2]??m[4]??m[5])}));
 const unique=[...new Map(hits.map(x=>[JSON.stringify(x),x])).values()];
 if(unique.length===1)return unique[0];if(!unique.length&&category==='anytime_tds')return {operator:'>=',target:1};return {operator:null,target:null};
}
const junk=/(?:\b(?:odds|promo|boost|wager|payout|stake|profit|balance|bonus|account|ticket|bet id)\b|\$|@|https?:)/i;
export function deduplicate(legs){const seen=new Set();return legs.filter(l=>{if(!l.playerId||l.target===null)return true;const k=JSON.stringify([l.playerId,l.gameId,l.season,l.category,l.operator,l.target]);if(seen.has(k))return false;seen.add(k);return true;});}
export function parseSlip(text,roster,context={}){
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),legs=[];let currentName='';
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(junk.test(line))continue;const cat=categoryOf(line);
  if(!cat){if(/^[\p{L}\s.'’0-9-]+$/u.test(line)&&/\p{L}/u.test(line)&&line.split(/\s+/).length>=2&&!/\d+\s*\+|\b(?:over|under|vs)\b/i.test(line))currentName=line;continue;}
  const prefix=line.slice(0,cat.match.index).replace(/(?:\d+(?:\.\d+)?\s*\+|(?:over|under)\s*\d+(?:\.\d+)?)\s*$/i,'').replace(/[|:—–-]+$/g,'').trim();
  const rawName=/\p{L}/u.test(prefix)?prefix:currentName,match=matchPlayer(rawName,roster,context);let threshold=thresholdOf(line,cat.key);
  if(threshold.target===null&&lines[i+1]&&!junk.test(lines[i+1])&&/^(?:(?:over|under|[<>]=?)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*\+)$/i.test(lines[i+1]))threshold=thresholdOf(lines[i+1],cat.key);
  legs.push({playerId:match.player?.id??null,playerName:match.player?.name??rawName,team:match.player?.team??null,season:context.season??null,gameId:context.gameId??null,category:cat.key,...threshold,confidence:Math.min(match.confidence,context.ocrConfidence??1),verificationStatus:'review',candidates:match.candidates,reviewReason:threshold.target===null?'Missing or conflicting explicit target':match.reason});currentName='';
 }return deduplicate(legs);
}
export function validateLeg(l){return !!(l.playerId&&l.playerName&&l.team&&l.gameId&&Number.isInteger(l.season)&&Object.hasOwn(CATEGORIES,l.category)&&['>','>=','<','<='].includes(l.operator)&&typeof l.target==='number'&&Number.isFinite(l.target)&&l.target>=0&&l.verificationStatus==='confirmed');}
export function lockParlay(p,confirmed,now=new Date().toISOString()){if(p.lockedAt)throw Error('Locked parlays cannot be edited');if(!confirmed||!p.legs.length||!p.legs.every(validateLeg))throw Error('Confirm every player, game, category and target before locking');return {...structuredClone(p),lockedAt:now,updatedAt:now};}
export function compare(v,op,t){return ({'>':()=>v>t,'>=':()=>v>=t,'<':()=>v<t,'<=':()=>v<=t}[op])?.()??false;}
export function evaluateLeg(l,s){
 if(!s||s.gameId!==l.gameId||s.playerId!==l.playerId||s.season!==l.season)return 'Pending';
 if(s.voided===true&&s.settlementConfirmed===true)return 'Voided / Unavailable';
 if(['postponed','canceled','suspended'].includes(s.status))return 'Voided / Unavailable';
 if(s.status==='pregame')return 'Pending';
 const v=s.metrics?.[l.category];if(!s.verified||s.participated!==true||typeof v!=='number'||!Number.isFinite(v))return 'Voided / Unavailable';
 const hit=compare(v,l.operator,l.target);
 if(s.status==='final'&&s.finalVerified===true)return hit?'Final Hit':'Final Missed';
 if(['live','final'].includes(s.status))return hit?'Provisionally Hit':'Provisionally Missed';return 'Live';
}
export function evaluateParlay(p,snapshots=[]){const legs=p.legs.map(l=>{const s=snapshots.filter(s=>s.gameId===l.gameId&&s.playerId===l.playerId&&s.season===l.season).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0],state=evaluateLeg(l,s);return {state,resolved:state.startsWith('Final ')||(s?.voided===true&&s?.settlementConfirmed===true)};});return {status:!p.lockedAt||!legs.length||!legs.every(l=>l.resolved)?'active':legs.some(l=>l.state==='Final Missed')?'lost':legs.every(l=>l.state==='Voided / Unavailable')?'voided':'won',legs};}
export function dayKey(date=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function parlayBucket(result,resolvedDay,today){return result.status==='active'||!resolvedDay||resolvedDay>=today?'active':result.status;}
// Adapter contract permits a later D1 implementation without changing domain logic.
export class BrowserRepository{
 constructor(storage,key='sanks.parlays.v1'){this.storage=storage;this.key=key;}
 list(){const raw=this.storage.getItem(this.key);if(raw===null)return [];let d;try{d=JSON.parse(raw);}catch{throw Error('Saved data is unreadable; existing storage was preserved');}if(d.version!==1||!Array.isArray(d.parlays)||!d.parlays.every(p=>p&&typeof p.id==='string'&&Array.isArray(p.legs)))throw Error('Unsupported saved data; existing storage was preserved');return d.parlays;}
 save(p){const all=this.list(),old=all.find(x=>x.id===p.id);if(old?.lockedAt&&JSON.stringify({...old,result:undefined,resolvedDay:undefined})!==JSON.stringify({...p,result:undefined,resolvedDay:undefined}))throw Error('Locked parlays cannot be edited');const next=all.filter(x=>x.id!==p.id);next.push(structuredClone(p));this.storage.setItem(this.key,JSON.stringify({version:1,parlays:next}));return p;}
}

// Called by a future verified-source integration; selections remain immutable.
export function recordObservations(repository,parlay,snapshots,now=new Date()){
 const result=evaluateParlay(parlay,snapshots);
 const resolvedDay=result.status==='active'?null:(parlay.resolvedDay||dayKey(now,parlay.timeZone));
 const next={...parlay,result,resolvedDay};repository.save(next);return next;
}
