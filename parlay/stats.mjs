import {teamName} from './moneyline.mjs';
// Provider adapter: exact provider IDs only. Not connected to automatic network polling.
const fields={passing:{YDS:'passing_yards',TD:'passing_tds',INT:'interceptions'},rushing:{YDS:'rushing_yards',CAR:'carries',TD:'rushing_tds'},receiving:{YDS:'receiving_yards',REC:'receptions',TD:'receiving_tds'}};
function providerStatus(type){const name=String(type?.name??'').toLowerCase();if(/postpon/.test(name))return 'postponed';if(/cancel/.test(name))return 'canceled';if(/suspend/.test(name))return 'suspended';return type?.completed?'final':type?.state==='in'?'live':type?.state==='pre'?'pregame':'unavailable';}
const numeric=s=>typeof s==='string'&&/^-?\d+(?:\.\d+)?$/.test(s)?Number(s):typeof s==='number'&&Number.isFinite(s)?s:null;
export function mapEspnSummary(payload,{gameId,season,idMap={},observedAt=new Date().toISOString(),finalVerified=false,participation={}}={}){
 const competition=payload.header?.competitions?.[0];
 if(!competition||String(payload.header?.id)!==String(gameId)||payload.header?.season?.year!==season)throw Error('Provider game/season mismatch');
 const state=competition.status?.type, status=providerStatus(state);
 const players=new Map();
 for(const team of payload.boxscore?.players??[])for(const group of team.statistics??[]){
  const mapping=fields[group.name];if(!mapping)continue;
  for(const row of group.athletes??[]){
   const providerId=String(row.athlete?.id??''),playerId=Object.hasOwn(idMap,providerId)?idMap[providerId]:null;if(typeof playerId!=='string'||!playerId)continue;
   const p=players.get(playerId)??{gameId,season,playerId,providerId,team:team.team?.abbreviation,status,observedAt,verified:true,finalVerified:finalVerified===true,participated:Object.hasOwn(participation,playerId)?participation[playerId]===true:null,metrics:{},source:'ESPN summary'};
   // Labels repeat between categories. Group name is essential to correct mapping.
   (group.labels??[]).forEach((label,i)=>{const v=numeric(row.stats?.[i]);if(mapping[label]&&v!==null)p.metrics[mapping[label]]=v;
    if(group.name==='passing'&&['C/ATT','CMP-ATT'].includes(label)){const match=String(row.stats?.[i]).match(/^(\d+)\s*[/-]\s*(\d+)$/);if(match){p.metrics.completions=Number(match[1]);p.metrics.attempts=Number(match[2]);}}
   });players.set(playerId,p);
  }
 }
 for(const p of players.values()){
  if(['rushing_yards','receiving_yards'].every(k=>Object.hasOwn(p.metrics,k)))p.metrics.rush_receive_yards=p.metrics.rushing_yards+p.metrics.receiving_yards;
  // Anytime TD also includes return/recovery TDs. Box-score rushing/receiving totals alone are insufficient.
 }
 return [...players.values()];
}
export function createCachedSource(fetchSnapshot,{ttlMs=30000,now=Date.now}={}){
 const cache=new Map(),pending=new Map();return async key=>{const old=cache.get(key);if(old&&now()-old.at<ttlMs)return structuredClone(old.value);if(!pending.has(key)){const request=Promise.resolve().then(()=>fetchSnapshot(key)).then(value=>{cache.set(key,{at:now(),value:structuredClone(value)});if(cache.size>256)cache.delete(cache.keys().next().value);return value;}).finally(()=>pending.delete(key));pending.set(key,request);}return structuredClone(await pending.get(key));};
}

// Team scores are mapped separately from player boxes. No numeric win probability is inferred.
export function mapEspnMoneylines(payload,{gameId,providerGameId=gameId,season,game,observedAt=new Date().toISOString(),finalVerified=false}={}){
 if(!gameId||!providerGameId||!Number.isInteger(season)||String(payload.header?.id)!==String(providerGameId)||payload.header?.season?.year!==season)throw Error('Provider game/season mismatch');
 const competition=payload.header?.competitions?.[0],competitors=competition?.competitors;
 if(!Array.isArray(competitors)||competitors.length!==2)return [];
 const aliases={LAR:'LA',JAC:'JAX',WSH:'WAS'},code=c=>aliases[c.team?.abbreviation]??c.team?.abbreviation;
 if(competitors.some(c=>!teamName(code(c)))||code(competitors[0])===code(competitors[1]))return [];
 if(game&&(game.schedule_id!==gameId||!competitors.every(c=>[game.home,game.away].includes(code(c)))))throw Error('Schedule matchup mismatch');
 const state=competition.status?.type,status=providerStatus(state);
 return competitors.map((c,i)=>{const selected=numeric(c.score),opponent=numeric(competitors[1-i].score);return {kind:'team',playerId:null,gameId,providerGameId,season,team:code(c),opponentTeam:code(competitors[1-i]),status,observedAt,verified:Number.isInteger(selected)&&selected>=0&&Number.isInteger(opponent)&&opponent>=0,finalVerified:finalVerified===true,scores:{selected,opponent},source:'ESPN game summary'};});
}
