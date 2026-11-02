import {touchdownLedger} from './touchdowns.mjs';
import {NFL_TEAMS} from '../../parlay/teams.mjs';
export const SOURCE='Big Balls Sports Data';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own=(o,k)=>Object.hasOwn(o??{},k);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):null;
const canonical=v=>({LAR:'LA',JAC:'JAX',WSH:'WAS'})[v]??v;
export function validateIdentities(manifest,catalog){
 if(manifest?.version!==1||!manifest.games||!manifest.players)throw Error('Identity manifest unavailable');
 const seenGames=new Set(),seenPlayers=new Set();
 for(const [id,m] of Object.entries(manifest.games)){
  const g=catalog.games[id],date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(m.kickoff));
  if(!g||!uuid.test(m.providerId)||seenGames.has(m.providerId)||m.season!==catalog.season||m.week!==g.week||m.home!==g.home||m.away!==g.away||date!==g.date||!uuid.test(m.homeId)||!uuid.test(m.awayId)||m.homeId===m.awayId||!m.evidence||!Number.isFinite(Date.parse(m.verifiedAt)))throw Error('Invalid game mapping');
  seenGames.add(m.providerId);
 }
 for(const [id,m] of Object.entries(manifest.players)){
  const p=catalog.players[id];
  if(!p||!uuid.test(m.providerId)||seenPlayers.has(m.providerId)||canonical(m.team)!==p.team||m.position!==p.position||!m.evidence||!Number.isFinite(Date.parse(m.verifiedAt)))throw Error('Invalid player mapping');
  if(m.gameIds!==undefined&&(!Array.isArray(m.gameIds)||!m.gameIds.length||m.gameIds.some(id=>!manifest.games[id]||![manifest.games[id].home,manifest.games[id].away].includes(m.team))))throw Error('Invalid scoped player mapping');
  if(m.allowUnassignedTeam&&(!m.gameIds?.length||!m.name))throw Error('Unassigned player mapping needs game evidence');
  seenPlayers.add(m.providerId);
 }
 return manifest;
}
export function validateMatch(payload,game,{now=Date.now()}={}){
 let m=payload?.data;
 if(m?.scores){
  const values=m.scores.value;
  if(payload.error||!Array.isArray(values)||values.length!==1)throw Error('Game score envelope mismatch');
  const row=values[0],at=Date.parse(row.updated_at);
  if(row.match_id!==game.providerId||!['scheduled','live','in_progress','finished','final','postponed','canceled','cancelled','suspended'].includes(row.status)||![row.home,row.away].every(v=>Number.isInteger(v)&&v>=0&&v<=199)||!Number.isFinite(at)||at<Date.parse(game.kickoff)||at>now+60000)throw Error('Game score identity, status or timestamp mismatch');
  // The explicit score-record match ID links to the already verified NFL schedule.
  // Home/away identity and kickoff are context from that mapping, not new claims
  // from this reduced score-only response.
  m={id:row.match_id,sport:'american_football',league:'NFL',home:{id:game.homeId},away:{id:game.awayId},kickoff_utc:game.kickoff,status:row.status,score:{home:row.home,away:row.away}};
 }

 if(payload?.error||!m||m.id!==game.providerId||m.sport!=='american_football'||!['NFL','National Football League'].includes(m.league)||m.home?.id!==game.homeId||m.away?.id!==game.awayId||Date.parse(m.kickoff_utc)!==Date.parse(game.kickoff)||!['scheduled','live','in_progress','finished','final','postponed','canceled','cancelled','suspended'].includes(m.status))throw Error('Game identity or status mismatch');
 return m;
}
const fields={
 passing:{YDS:'passing_yards',yards:'passing_yards',passing_yards:'passing_yards',TD:'passing_tds',touchdowns:'passing_tds',passing_touchdowns:'passing_tds',CMP:'completions',completions:'completions',ATT:'attempts',attempts:'attempts',passing_attempts:'attempts',INT:'interceptions',interceptions:'interceptions'},
 rushing:{YDS:'rushing_yards',yards:'rushing_yards',rushing_yards:'rushing_yards',CAR:'carries',carries:'carries',attempts:'carries',rushing_attempts:'carries',TD:'rushing_tds',touchdowns:'rushing_tds',rushing_touchdowns:'rushing_tds'},
 receiving:{YDS:'receiving_yards',yards:'receiving_yards',receiving_yards:'receiving_yards',REC:'receptions',receptions:'receptions',TD:'receiving_tds',touchdowns:'receiving_tds',receiving_touchdowns:'receiving_tds',TGTS:'targets',targets:'targets'}
};
fields.players={passingYards:'passing_yards',passingTouchdowns:'passing_tds',passingCompletions:'completions',passingAttempts:'attempts',passingInterceptions:'interceptions',rushingYards:'rushing_yards',rushingTouchdowns:'rushing_tds',rushingAttempts:'carries',receivingYards:'receiving_yards',receivingTouchdowns:'receiving_tds',receptions:'receptions',receivingTargets:'targets'};
const groupType=v=>({Passing:'passing',Rushing:'rushing',Receiving:'receiving'})[v]??v;
// Roster feeds can retain a former team after a transfer. Only explicitly reviewed
// game-specific UUID + full-name evidence may assign a null-team row.
function assignedBox(payload,gameId,game,players){
 const copy=structuredClone(payload),byId=new Map(Object.values(players).filter(p=>p.name&&(!p.gameIds||p.gameIds.includes(gameId))&&[game.home,game.away].includes(p.team)).map(p=>[p.providerId,p]));
 const normalized=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[.\u2019']/g,'').replace(/\s+/g,' ').trim();
 for(const side of copy.data.teams.filter(s=>s.team_name==null)){
  for(const group of side.stat_groups??[]){
   if(!Array.isArray(group.players))continue;
   const remaining=[];
   for(const row of group.players){
    const p=byId.get(row.player_id);
    if(!p||normalized(row.name)!==normalized(p.name)){remaining.push(row);continue;}
    const name=NFL_TEAMS.find(t=>t.code===p.team)?.name,target=copy.data.teams.find(t=>t.team_name===name);
    if(!target){remaining.push(row);continue;}
    target.stat_groups.push({...group,players:[{...row,mappingEvidenceVersion:2}]});
   }
   group.players=remaining;
  }
 }
 return copy;
}
export function mapBoxscore(payload,{gameId,game,players,match=null,now=Date.now()}){
 const d=payload?.data,asOf=payload?.meta?.as_of,at=Date.parse(asOf);
 if(payload?.error||d?.match_id!==game.providerId||d.sport!=='american_football'||!['scheduled','in_progress','finished'].includes(d.status)||!Array.isArray(d.teams)||!Number.isFinite(at)||at<Date.parse(game.kickoff)||at>now+60000)throw Error('Invalid box score or timestamp');
 if(match)validateMatch({data:match},game);
 payload=assignedBox(payload,gameId,game,players);
 const status={scheduled:'pregame',in_progress:'live',finished:'final'}[d.status];
 const observations=[],notes=[],rows=new Map(),sides=new Set();
 const byProvider=new Map(Object.entries(players).map(([id,p])=>[p.providerId,{...p,id}]));
 for(const side of payload.data.teams){
  if(side.team_name==null){if(side.stat_groups?.some(g=>g.players?.length))notes.push({reason:'Unassigned team rows unavailable'});continue;}
  const team=NFL_TEAMS.find(t=>t.name===side.team_name)?.code;
  if(![game.home,game.away].includes(team)||sides.has(team)||!Array.isArray(side.stat_groups))throw Error('Box score team mismatch');
  sides.add(team);
  for(const group of side.stat_groups){
   const type=groupType(group.type),mapping=fields[type];if(!mapping)continue;
   if(!Array.isArray(group.keys)||new Set(group.keys).size!==group.keys.length||!Array.isArray(group.players))throw Error('Invalid stat group');
   const groupPlayers=new Set();
   for(const row of group.players){
    if(!row.player_id||!byProvider.has(row.player_id)){notes.push({reason:'Player identity unavailable'});continue;}
    if(groupPlayers.has(row.player_id))throw Error('Duplicate player row');groupPlayers.add(row.player_id);
    const p=byProvider.get(row.player_id);
    if(p.gameIds&&!p.gameIds.includes(gameId))continue;
    if(canonical(p.team)!==team)throw Error('Player team mismatch');
    if(!Array.isArray(row.stats)||row.stats.length!==group.keys.length)throw Error('Misaligned stat row');
    const record=rows.get(p.id)??{playerId:p.id,team,metrics:{},participated:null,...(row.mappingEvidenceVersion===2?{mappingEvidenceVersion:2}:{})};
    for(let i=0;i<group.keys.length;i++){
     const key=group.keys[i],raw=row.stats[i],target=mapping[key];
     if(type==='passing'&&['C/ATT','CMP-ATT','completions_attempts'].includes(key)){
      const pair=typeof raw==='string'&&raw.match(/^(\d+)[/-](\d+)$/);
      if(pair){record.metrics.completions=Number(pair[1]);record.metrics.attempts=Number(pair[2]);}continue;
     }
     if(!target)continue;const value=number(raw);
     if(value===null)continue;
     if(!Number.isInteger(value)||(!target.endsWith('yards')&&value<0))throw Error('Invalid NFL stat');
     if(own(record.metrics,target)&&record.metrics[target]!==value)throw Error('Conflicting stat values');
     record.metrics[target]=value;
    }
    rows.set(p.id,record);
   }
  }
 }
 if(sides.size!==2)notes.push({reason:'One team box score unavailable'});
 const touchdowns=match?touchdownLedger(payload,game,match):null;
 if(touchdowns)for(const [providerId,td] of touchdowns.byProvider){
  const p=byProvider.get(providerId);if(!p||canonical(p.team)!==td.team||p.gameIds&&!p.gameIds.includes(gameId))continue;
  if(!rows.has(p.id))rows.set(p.id,{playerId:p.id,team:td.team,metrics:{},participated:null});
  const row=rows.get(p.id);row.metrics.anytime_tds=td.count;row.touchdownCoverage=td.coverage;
  if(td.participated)row.touchdownParticipated=true;
 }

 for(const row of rows.values()){
  const m=row.metrics;
  row.participated=row.touchdownParticipated===true||['attempts','carries','receptions','targets'].some(k=>m[k]>0)?true:null;
  if(own(m,'rushing_yards')&&own(m,'receiving_yards'))m.rush_receive_yards=m.rushing_yards+m.receiving_yards;
  delete m.targets;
  delete row.touchdownParticipated;
  observations.push({...row,gameId,providerGameId:game.providerId,season:game.season,status,observedAt:asOf,source:SOURCE,verified:true,finalVerified:false});
 }
 return {observations,notes,status,touchdownCoverage:touchdowns?.teams??null,observedAt:asOf,stale:payload.meta.stale!==false||now-at>300000};
}
export function mapMoneylines(match,{gameId,game,observedAt}){
 const status={scheduled:'pregame',live:'live',in_progress:'live',finished:'final',final:'final',postponed:'postponed',canceled:'canceled',cancelled:'canceled',suspended:'suspended'}[match.status];
 if(![match.score?.home,match.score?.away].every(v=>Number.isInteger(v)&&v>=0))return [];
 return ['home','away'].map(side=>({kind:'team',gameId,providerGameId:game.providerId,season:game.season,team:game[side],opponentTeam:game[side==='home'?'away':'home'],scores:{selected:match.score[side],opponent:match.score[side==='home'?'away':'home']},status,observedAt,verified:true,finalVerified:false,source:SOURCE}));
}
export async function providerRequest(path,key,fetcher=fetch){
 if(!key)throw Error('Provider key unavailable');
 if(!/^\/v1\/(?:user\/me|matches\/[0-9a-f-]+\/events\?type=goals&sport=american_football|matches\/[0-9a-f-]+\?sport=american_football|live-stats\/american_football\/[0-9a-f-]+\/players|players\?sport=american_football&league=nfl&teamId=[0-9a-f-]{36}&limit=200(?:&offset=(?:200|400))?|players\/[0-9a-f-]{36}\/profile|matches\?sport=american_football&league=nfl&date=\d{4}-\d{2}-\d{2}&tz=America%2FNew_York&season=2026&limit=200)$/.test(path))throw Error('Provider route rejected');
 const response=await fetcher('https://api.bigballsdata.com'+path,{headers:{Authorization:'Bearer '+key.trim(),Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
 let payload=null;
 {
  if(Number(response.headers.get('content-length'))>2000000)throw Error('Provider response too large');
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)throw Error('Provider response too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();try{payload=JSON.parse(text);}catch{if(response.ok)throw Error('Invalid provider JSON');}}finally{await reader.cancel().catch(()=>{});}
 }
 return {ok:response.ok,status:response.status,headers:response.headers,payload};
}
