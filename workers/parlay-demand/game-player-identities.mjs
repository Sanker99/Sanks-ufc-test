import {NFL_TEAMS} from '../../parlay/teams.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[.\u2019']/g,'').replace(/\s+/g,' ').trim();

// Match only names unique across the entire preserved roster. Team context must
// agree with this exact scheduled game. No fuzzy aliases or cross-game transfers.
export function gamePlayerIdentities(payload,{gameId,game,players,roster,now}){
 const d=payload?.data,at=Date.parse(payload?.meta?.as_of);
 if(payload?.error||d?.match_id!==game.providerId||d.sport!=='american_football'||
  !['scheduled','in_progress','finished'].includes(d.status)||!Array.isArray(d.teams)||
  !Number.isFinite(at)||at<Date.parse(game.kickoff)||at>now+60000)throw Error('Invalid identity evidence');
 const byName=new Map(),byProvider=new Map();
 for(const player of roster){
  const key=normalize(player.name);
  const matches=byName.get(key)??[];
  matches.push(player);byName.set(key,matches);
 }
 for(const [id,p] of Object.entries(players))byProvider.set(p.providerId,id);
 const candidates=new Map(), conflicts=new Set();
 for(const side of d.teams){
  const team=side.team_name==null?null:NFL_TEAMS.find(t=>t.name===side.team_name)?.code;
  if(side.team_name!=null&&![game.home,game.away].includes(team))throw Error('Invalid team identity evidence');
  for(const group of side.stat_groups??[]){
   if(!['players','passing','rushing','receiving','Passing','Rushing','Receiving'].includes(group.type))continue;
   for(const row of group.players??[]){
    if(!uuid.test(row.player_id)||!row.name)continue;
    const matches=byName.get(normalize(row.name));
    if(matches?.length!==1)continue;
    const local=matches[0];
    if(![game.home,game.away].includes(local.team)||team&&team!==local.team)continue;
    if(!['QB','RB','FB','WR','TE','K'].includes(local.position))continue;
    if(byProvider.has(row.player_id)&&byProvider.get(row.player_id)!==local.id)continue;
    const old=players[local.id];
    if(old&&old.providerId!==row.player_id)continue;
    if(candidates.has(local.id)&&candidates.get(local.id).providerId!==row.player_id){conflicts.add(local.id);continue;}
    candidates.set(local.id,{
     ...old,providerId:row.player_id,name:local.name,team:local.team,position:local.position,
     gameIds:old?.gameIds?[...new Set([...old.gameIds,gameId])]:old?undefined:[gameId],
     ...(side.team_name==null&&!old?.teamId?{allowUnassignedTeam:true}:{}),
     evidence:'Exact unique roster full name and provider UUID in the verified game box score; exact named side or unique current-team roster context for an unassigned row',
     verifiedAt:new Date(now).toISOString()
    });
   }
  }
 }
 // A source identifier cannot be reused for another local player in the same box.
 const counts=new Map();
 for(const p of candidates.values())counts.set(p.providerId,(counts.get(p.providerId)??0)+1);
 return {...players,...Object.fromEntries([...candidates].filter(([id,p])=>!conflicts.has(id)&&counts.get(p.providerId)===1))};
}
