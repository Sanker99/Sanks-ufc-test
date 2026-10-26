// Provider adapter: exact provider IDs only. Not connected to automatic network polling.
const fields={passing:{YDS:'passing_yards',TD:'passing_tds',INT:'interceptions'},rushing:{YDS:'rushing_yards',CAR:'carries',TD:'rushing_tds'},receiving:{YDS:'receiving_yards',REC:'receptions',TD:'receiving_tds'}};
const numeric=s=>typeof s==='string'&&/^-?\d+(?:\.\d+)?$/.test(s)?Number(s):typeof s==='number'&&Number.isFinite(s)?s:null;
export function mapEspnSummary(payload,{gameId,season,idMap={},observedAt=new Date().toISOString(),finalVerified=false}={}){
 const competition=payload.header?.competitions?.[0];
 if(!competition||String(payload.header?.id)!==String(gameId)||payload.header?.season?.year!==season)throw Error('Provider game/season mismatch');
 const state=competition.status?.type, status=state?.completed?'final':state?.state==='in'?'live':state?.state==='pre'?'pregame':'unavailable';
 const players=new Map();
 for(const team of payload.boxscore?.players??[])for(const group of team.statistics??[]){
  const mapping=fields[group.name];if(!mapping)continue;
  for(const row of group.athletes??[]){
   const providerId=String(row.athlete?.id??''),playerId=idMap[providerId];if(!playerId)continue;
   const p=players.get(playerId)??{gameId,season,playerId,providerId,team:team.team?.abbreviation,status,observedAt,verified:true,finalVerified:finalVerified===true,participated:true,metrics:{},source:'ESPN summary'};
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
 const cache=new Map();return async key=>{const old=cache.get(key);if(old&&now()-old.at<ttlMs)return structuredClone(old.value);const value=await fetchSnapshot(key);cache.set(key,{at:now(),value:structuredClone(value)});return value;};
}
