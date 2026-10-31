import {resolveGame} from './core.mjs?v=live-1';
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'));
function weekStart(date){const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+5)%7));return day.toISOString().slice(0,10);}
function localDate(now,timeZone){const parts=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');}
// This app's game week runs Tuesday through Monday, including Monday night games.
export function currentScheduleWeek(games,season,{now=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
 const currentStart=weekStart(localDate(now,timeZone)),weeks=new Map();
 for(const game of games){if(!String(game.schedule_id).startsWith(season+'_')||!validDate(game.date)||!Number.isInteger(Number(game.week))||Number(game.week)<1)continue;const week=Number(game.week),old=weeks.get(week);if(!old||game.date<old)weeks.set(week,game.date);}
 const matches=[...weeks].filter(([,date])=>weekStart(date)===currentStart);
 return matches.length===1?matches[0][0]:null;
}
export function suggestedWeekGame(leg,games,{season,week,text=''}={}){
 if(!leg?.team||leg.season!==season||!Number.isInteger(week)||leg.category==='unsupported')return null;
 const matches=games.filter(g=>String(g.schedule_id).startsWith(season+'_')&&Number(g.week)===week&&[g.home,g.away].includes(leg.team));
 if(matches.length!==1)return null;
 return resolveGame({team:leg.team},matches,matches[0].date,text);
}
export function defaultWeekGames(legs,games,context){
 return legs.map(leg=>{
  if(leg.gameId)return leg; // Keep explicit dates, restored game choices and user overrides.
  const game=suggestedWeekGame(leg,games,context);
  return game?{...leg,gameId:game.schedule_id,gameAssumption:{week:context.week,season:context.season},verificationStatus:'review'}:leg;
 });
}
