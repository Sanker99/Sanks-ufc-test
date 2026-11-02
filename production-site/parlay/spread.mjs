import {matchTeam} from './moneyline.mjs?v=anytime-1';
const market=/\b(?:(?:(?:alternate|alternative|alt\.?)\s+)?(?:point\s+|game\s+)?spread|handicap)\b/gi;
const scope=/\b(?:half|quarter|[12]h|[1-4]q|first\s+[12]|second\s+[12])\b/i;
const normalize=s=>String(s).replace(/[−–—]/g,'-').replace(/(\d)½/g,'$1.5');
export const validHandicap=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=99.5&&Number.isInteger(n*2);
function row(raw){
 const text=normalize(raw),label=!!text.match(market),partial=scope.test(text),pick=/\b(?:pk|pick(?:\s*['’]?em)?)\b/i.test(text);
 const values=[...text.matchAll(/(?<![\w.+-])([+-]\s*\d{1,2}(?:\.\d+)?)(?![\w.])/g)].map(m=>Number(m[1].replace(/\s/g,'')));
 if(pick)values.push(0);
 const unique=[...new Set(values)],target=unique.length===1&&validHandicap(unique[0])?unique[0]:null;
 const clean=text.replace(market,' ').replace(/\b(?:first|second|third|fourth|1st|2nd|3rd|4th)?\s*(?:half|quarter)|\b(?:[12]h|[1-4]q)\b/gi,' ').replace(/\b(?:pk|pick(?:\s*['’]?em)?)\b/gi,' ').replace(/[+-]\s*\d+(?:\.\d+)?/g,' ').replace(/[()\[\]:]/g,' ').trim();
 const team=matchTeam(clean),numericOnly=!clean&&!label&&!partial;
 return {team,target,values:unique,label,partial,alternate:/\b(?:alternate|alternative|alt\.?)\b/i.test(text),selectionLike:!!team||numericOnly||partial,raw};
}
// Inspect only adjacent selection rows; never borrow a handicap across a matchup,
// player prop, moneyline, or another spread descriptor.
export function spreadSelections(lines){
 const rows=lines.map(row),byIndex=new Map(),consumed=new Set();
 for(let i=0;i<rows.length;i++){
  const current=rows[i];if(!current.label||consumed.has(i))continue;
  const chosen=[i];let team=current.team,targets=[...current.values];
  for(const direction of [-1,1]){
   for(let step=1;step<=2;step++){
    const j=i+direction*step,r=rows[j];if(!r||consumed.has(j)||r.label||!r.selectionLike)break;
    if(r.team&&team&&r.team.code!==team.code)break;
    if(r.team&&team&&targets.length)break;
    chosen.push(j);team??=r.team;targets.push(...r.values);
   }
   if(team&&targets.length)break;
  }
  const unique=[...new Set(targets)],target=unique.length===1&&validHandicap(unique[0])?unique[0]:null;
  byIndex.set(i,{team,target,alternateSpread:current.alternate,partial:chosen.some(j=>rows[j].partial)});chosen.forEach(j=>consumed.add(j));
 }
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(consumed.has(i)||!r.team||!r.values.length)continue;
  byIndex.set(i,{team:r.team,target:r.target,alternateSpread:r.alternate,partial:r.partial||rows[i-1]?.partial===true||rows[i+1]?.partial===true});consumed.add(i);
 }
 return {byIndex,consumed};
}

export function upgradeSpreadDrafts(parlay){
 if(parlay.lockedAt||!parlay.legs.some(l=>l.category==='unsupported'&&/spread|handicap/i.test(l.unsupportedMarket??'')&&!/half|quarter|partial/i.test(l.unsupportedMarket??'')))return parlay;
 const next=structuredClone(parlay);next.legs=next.legs.map(l=>{
  if(l.category!=='unsupported'||!/spread|handicap/i.test(l.unsupportedMarket??'')||/half|quarter|partial/i.test(l.unsupportedMarket??''))return l;
  const parsed=spreadSelections([l.playerName??'',l.unsupportedMarket]).byIndex.values().next().value,team=parsed?.team;
  return {...l,kind:'team',category:'spread',playerId:null,playerName:null,team:team?.code??null,teamName:team?.name??'Choose a team',opponentTeam:null,operator:'cover',target:parsed?.target??null,alternateSpread:parsed?.alternateSpread??false,verificationStatus:'review',reviewReason:'Spread tracking is now supported. Confirm the selected team, game and signed handicap.'};
 });return next;
}
