import {NFL_TEAMS} from '../../parlay/teams.mjs';
import {validateIdentities} from './provider.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonical=v=>({LAR:'LA',JAC:'JAX',WSH:'WAS'})[v]??v;
const name=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[.\u2019']/g,'').replace(/\s+/g,' ').trim();
const positions={'Quarterback':'QB','Running Back':'RB','Wide Receiver':'WR','Tight End':'TE','Place Kicker':'K','Punter':'P','Fullback':'FB','Cornerback':'CB','Safety':'SAF','Linebacker':'LB','Defensive End':'DE','Defensive Tackle':'DT','Offensive Tackle':'OT','Guard':'G','Center':'C','Long Snapper':'LS'};
const localDate=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
export function buildDemandIdentities({catalog,roster,matches,players,verifiedAt}){
 const games={},mappedPlayers={},issues=[],teamIds=new Map(),sourceGames=new Map();
 for(const match of matches){
  if(match.sport!=='american_football'||match.league!=='NFL'||!uuid.test(match.id)||!Number.isFinite(Date.parse(match.kickoff_utc)))throw Error('Invalid NFL source match');
  const teams=['home','away'].map(side=>NFL_TEAMS.find(t=>t.name===match[side]?.name));
  if(teams.some(t=>!t)||['home','away'].some((side,i)=>!uuid.test(match[side]?.id)||canonical(match[side].short_name)!==teams[i].code))throw Error('Unverified NFL source team');
  const [home,away]=teams.map(t=>t.code),date=localDate(match.kickoff_utc);
  const candidates=Object.entries(catalog.games).filter(([,g])=>g.home===home&&g.away===away&&g.date===date);
  if(candidates.length!==1){issues.push({reason:'Game not uniquely present in preserved schedule',providerId:match.id});continue;}
  const [gameId,g]=candidates[0];
  if(games[gameId]&&games[gameId].providerId!==match.id)throw Error('Conflicting source game identity');
  if(sourceGames.has(match.id)&&sourceGames.get(match.id)!==gameId)throw Error('Provider game reused');sourceGames.set(match.id,gameId);
  for(let i=0;i<2;i++){const team=teams[i].code,id=match[i===0?'home':'away'].id;if(teamIds.has(team)&&teamIds.get(team)!==id)throw Error('Conflicting team UUID');teamIds.set(team,id);}
  games[gameId]={providerId:match.id,homeId:match.home.id,awayId:match.away.id,season:catalog.season,week:g.week,home,away,kickoff:match.kickoff_utc,evidence:'Authenticated NFL schedule: exact home/away team names and UUIDs, abbreviations, local date and preserved season/week',verifiedAt};
 }
 const byContext=new Map(),localContexts=new Map();
 for(const p of roster){const key=[p.team,p.position,name(p.name)].join('|');localContexts.set(key,[...(localContexts.get(key)??[]),p]);}
 for(const p of players){
  if(p.sport!=='american_football'||p.league_name!=='NFL'||!uuid.test(p.id))continue;
  const team=NFL_TEAMS.find(t=>t.name===p.team_name)?.code,position=positions[p.position]??p.position;
  if(!team||p.team_id!==teamIds.get(team)||!position||!p.name)continue;
  const key=[team,position,name(p.name)].join('|');if(!byContext.has(key))byContext.set(key,new Map());byContext.get(key).set(p.id,p);
 }
 const selected=[];
 for(const [key,locals] of localContexts){
  const sources=byContext.get(key);if(locals.length!==1||sources?.size!==1){for(const p of locals)if(teamIds.has(p.team))issues.push({playerId:p.id,name:p.name,team:p.team,reason:sources?.size>1||locals.length>1?'Ambiguous identity context':'No exact name, position and current-team UUID match'});continue;}
  const local=locals[0],source=[...sources.values()][0];
  if(!catalog.players[local.id]||catalog.players[local.id].team!==local.team||catalog.players[local.id].position!==local.position)throw Error('Preserved roster disagrees with collector catalog');
  selected.push({local,source});
 }
 const providerCounts=new Map();for(const {source}of selected)providerCounts.set(source.id,(providerCounts.get(source.id)??0)+1);
 for(const {local,source}of selected){if(providerCounts.get(source.id)!==1){issues.push({playerId:local.id,reason:'Provider identity reused'});continue;}
  mappedPlayers[local.id]={providerId:source.id,team:local.team,position:local.position,name:local.name,teamId:source.team_id,evidence:'Authenticated NFL roster: unique exact full name (case/punctuation normalized), position and current-team UUID; preserved SANKS season '+catalog.season,verifiedAt};
 }
 const manifest={version:1,games,players:mappedPlayers};validateIdentities(manifest,catalog);
 return {manifest,issues,teamIds:Object.fromEntries(teamIds)};
}

