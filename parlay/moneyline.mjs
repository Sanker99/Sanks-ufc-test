import {NFL_TEAMS} from './teams.mjs';
export const teamName=code=>NFL_TEAMS.find(t=>t.code===code)?.name??null;
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
export function matchTeam(raw){
 const query=normalize(String(raw??'').replace(/\s*[+-]\d{2,8}\s*$/,'')),words=query.split(' ');if(!query)return null;
 const candidates=[query];for(let n=1;n<=2&&n<words.length;n++)if(words.slice(0,n).every(w=>w.length<=3))candidates.push(words.slice(n).join(' '));
 const aliases={lar:'LA',jac:'JAX',wsh:'WAS'};
 for(const candidate of candidates){const matches=NFL_TEAMS.filter(t=>[t.code,t.name,t.nickname].some(label=>normalize(label)===candidate)||aliases[candidate]===t.code);if(matches.length===1)return matches[0];}
 return null;
}
export function isTeamLeg(leg){return leg.category==='moneyline';}
export function sameObservation(leg,s){return !!s&&s.gameId===leg.gameId&&s.season===leg.season&&(isTeamLeg(leg)?s.kind==='team'&&s.team===leg.team&&s.playerId==null:s.kind!=='team'&&!!leg.playerId&&s.playerId===leg.playerId);}
export function moneylineScores(s){const a=s?.scores?.selected,b=s?.scores?.opponent;return Number.isInteger(a)&&a>=0&&Number.isInteger(b)&&b>=0?{selected:a,opponent:b}:null;}
// Legacy moneyline placeholders were never lockable. Upgrade drafts only.
export function upgradeMoneylines(parlay){if(parlay.lockedAt)return parlay;const next=structuredClone(parlay);next.legs=next.legs.map(l=>{if(l.category!=='unsupported'||!/^money\s*line$/i.test(l.unsupportedMarket??''))return l;const t=matchTeam(l.playerName);return {kind:'team',playerId:null,playerName:null,team:t?.code??null,teamName:t?.name??l.playerName??'Choose a team',season:l.season,gameId:null,category:'moneyline',operator:'win',target:null,confidence:t?1:0,verificationStatus:'review',reviewReason:'Moneyline is now supported. Confirm the selected team and game.'};});return next;}
