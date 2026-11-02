import {NFL_TEAMS} from '../../parlay/teams.mjs';
export const TOUCHDOWN_SCHEMA=1;
const TD_KEYS=['rushingTouchdowns','receivingTouchdowns','kickReturnTouchdowns','puntReturnTouchdowns','interceptionTouchdowns','fumbleRecoveryTouchdowns'];
const grouped={rushing:{TD:'rushingTouchdowns',touchdowns:'rushingTouchdowns',rushing_touchdowns:'rushingTouchdowns'},receiving:{TD:'receivingTouchdowns',touchdowns:'receivingTouchdowns',receiving_touchdowns:'receivingTouchdowns'},kickreturns:{TD:'kickReturnTouchdowns'},puntreturns:{TD:'puntReturnTouchdowns'},kicking:{FGM:'fieldGoalsMade',XPM:'extraPointsMade'}};
const PLAYER_TD_KEYS=TD_KEYS.slice(0,4);
const ACTIVITY=['passingAttempts','rushingAttempts','receptions','receivingTargets','kickReturns','puntReturns','totalTackles','soloTackles','defensiveInterceptions','fumblesRecovered'];
const SCORE_KEYS=new Set([...TD_KEYS,'fieldGoalsMade','extraPointsMade',...ACTIVITY]);
const integer=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v.trim())?Number(v):null;
export function touchdownLedger(payload,game,match){
 const sides=new Map(),allIds=new Map();
 for(const side of payload.data.teams){
  const team=NFL_TEAMS.find(t=>t.name===side.team_name)?.code;
  if(![game.home,game.away].includes(team))continue;
  if(sides.has(team)){sides.get(team).invalid=true;continue;}
  const ledger={team,invalid:false,players:new Map()};sides.set(team,ledger);
  for(const group of side.stat_groups){
   const type=String(group.type??'').toLowerCase().replace(/[^a-z]/g,''),aliases=grouped[type]??{};
   const indices=group.keys.map((key,i)=>[SCORE_KEYS.has(key)?key:aliases[key],i]).filter(([key])=>key);
   if(!indices.length)continue;
   for(const row of group.players){
    const relevant=indices.map(([key,i])=>[key,row.stats[i]]);
    // Every counted scorer needs a stable provider identity, including unmapped players.
    if(!row.player_id){if(relevant.some(([key,v])=>TD_KEYS.includes(key)&&integer(v)>0))ledger.invalid=true;continue;}
    if(allIds.has(row.player_id)&&allIds.get(row.player_id)!==team){ledger.invalid=true;sides.get(allIds.get(row.player_id)).invalid=true;}allIds.set(row.player_id,team);
    const p=ledger.players.get(row.player_id)??{team,cells:{},invalid:false,activity:false};ledger.players.set(row.player_id,p);
    for(const [key,raw] of relevant){
     if(raw==null||String(raw).trim()==='')continue;
     const value=integer(raw);
     if(value===null){p.invalid=true;ledger.invalid=true;continue;}
     if(Object.hasOwn(p.cells,key)&&p.cells[key]!==value){p.invalid=true;ledger.invalid=true;continue;}
     p.cells[key]=value;if(ACTIVITY.includes(key)&&value>0)p.activity=true;
    }
   }
  }
 }
 const byProvider=new Map(),teams={};
 for(const side of sides.values()){
  let touchdowns=0,otherPoints=0;
  for(const p of side.players.values()){p.count=TD_KEYS.reduce((n,key)=>n+(p.cells[key]??0),0);touchdowns+=p.count;otherPoints+=3*(p.cells.fieldGoalsMade??0)+(p.cells.extraPointsMade??0);}
  const score=integer(match.score?.[side.team===game.home?'home':'away']),accounted=6*touchdowns+otherPoints;
  // Do not turn empty cells into zero. Instead establish that every possible TD
  // is already assigned: another six-point score cannot fit in the team score.
  // Unknown conversions/safeties remain nonnegative and do not weaken this bound.
  const complete=!side.invalid&&score!==null&&accounted<=score&&score-accounted<6;
  teams[side.team]={complete,reportedTouchdowns:touchdowns,accountedPoints:accounted,score};
  for(const [id,p] of side.players){
   if(p.invalid)continue;
   const eligible=PLAYER_TD_KEYS.reduce((n,key)=>n+(p.cells[key]??0),0),ambiguousFumble=(p.cells.fumbleRecoveryTouchdowns??0)>0;
   const exact=complete&&!ambiguousFumble;
   if(exact||eligible>0)byProvider.set(id,{team:p.team,count:eligible,participated:p.activity||p.count>0,coverage:{version:TOUCHDOWN_SCHEMA,complete:exact,rules:'fanduel-player',basis:exact?'team-score-bound':'reported-minimum'}});
  }
 }
 return {byProvider,teams};
}
