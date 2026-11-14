export const rosterAdditions=[{id:'00-0035700',name:'Josh Jacobs',team:'GB',position:'RB'}];

export function mergeTrackerRoster(primary,lab,season,games){
 const teams=new Set(games.flatMap(g=>[g.home,g.away])),byId=new Map();
 for(const p of [...primary,...rosterAdditions,...(Array.isArray(lab)?lab:[])]){
  if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim()||!teams.has(p.team)||typeof p.position!=='string'||byId.has(p.id))continue;
  byId.set(p.id,{id:p.id,name:p.name,team:p.team,position:p.position,season});
 }
 return [...byId.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
