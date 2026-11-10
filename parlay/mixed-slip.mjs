import {parseSlipDetailed,deduplicate} from './core.mjs?v=mixed-1';
import {matchTeam} from './moneyline.mjs?v=ufc-1';
import {currentScheduleWeek,defaultWeekGames} from './schedule.mjs?v=late-1';
import {parseUfcSelectionsDetailed} from './ufc.mjs?v=mixed-1';

export function slipDates(text,hint){
 const dates=new Set();
 function add(year,month,day){
  const date=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  const value=new Date(date+'T12:00:00Z');
  if(Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date)dates.add(date);
 }
 for(const [,y,m,d] of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))add(y,m,d);
 for(const [,m,d,y] of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/g))add(y.length===2?'20'+y:y,m,d);
 const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
 for(const [,month,d,y] of text.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi))add(y,months.indexOf(month.slice(0,3).toLowerCase())+1,d);
 if(hint)dates.add(hint);
 return [...dates];
}

export function mayContainUfc(text){
 const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 return lines.some((line,index)=>{
  if(/\b(?:UFC|fight winner|fight (?:to go|goes)|go(?:es)? the distance|win by|win (?:in )?(?:round|rd)|\d(?:\.\d+)?\s*rounds?|significant strikes|takedowns)\b/i.test(line))return true;
  const market=line.match(/\bmoney\s*line\b|\bto win\s*(?:[+-]\d{2,6})?$/i);
  if(!market)return false;
  const selection=(line.slice(0,market.index).trim()||lines[index-1]||'').replace(/\s+[+-]\d{2,6}\s*$/,'');
  return !matchTeam(selection);
 });
}

export function parseMixedSlip(text,roster,{season,games,fights,timeZone,dates,ocrConfidence,now=new Date()}){
 const ufc=parseUfcSelectionsDetailed(text,fights,{dates,timeZone,isNflTeam:matchTeam});
 const parsed=parseSlipDetailed(text,roster,{season,games,gameDates:dates,ocrConfidence,excludedLines:ufc.consumed});
 const weeks=new Set(dates.map(date=>currentScheduleWeek(games,season,{now:new Date(date+'T12:00:00Z'),timeZone})));
 const week=dates.length?(weeks.size===1?[...weeks][0]:null):currentScheduleWeek(games,season,{now,timeZone});
 const nflText=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).filter((_,i)=>!ufc.consumed.has(i)).join('\n');
 const nfl=defaultWeekGames(parsed.legs,games,{season,week,text:nflText});
 const legs=deduplicate([...nfl,...ufc.legs]);
 const warnings=parsed.warnings.filter(w=>!w.startsWith('The slip header says'));
 if(parsed.declaredLegCount&&parsed.declaredLegCount!==legs.length)warnings.push('The slip lists '+parsed.declaredLegCount+' legs. Scan found '+legs.length+'. Check the original and add any missing picks before submitting.');
 return {...parsed,legs,warnings};
}
