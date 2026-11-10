const origin='http://ufcstats.com';
export const UFC_FINAL_SOURCE='UFCStats';
const tags=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'>','gi'))].map(m=>m[1]);
const plain=html=>html.replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const name=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const path=(html,kind)=>html.match(new RegExp('(?:https?://ufcstats\\.com)?/('+kind+'-details/[a-f0-9]{16})(?=["\\\'])','i'))?.[1];
const date=text=>{
 const match=plain(text).match(/^([a-z]+) (\d{1,2}), (\d{4})$/i);
 if(!match)return null;
 const months='january february march april may june july august september october november december'.split(' ');
 const month=months.indexOf(match[1].toLowerCase())+1;
 return month?match[3]+'-'+String(month).padStart(2,'0')+'-'+match[2].padStart(2,'0'):null;
};
export function findUfcStatsEvent(html,dates){
 return [...new Set(tags(html,'tr').flatMap(row=>{
  const field=row.match(/<span\b[^>]*class=["'][^"']*\bb-statistics__date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const event=path(row,'event');
  return field&&event&&dates.includes(date(field))?[event]:[];
 }))];
}
export function findUfcStatsBout(html,fight){
 const expected=fight.fighters.map(f=>name(f.name)).sort();
 if(expected[0]===expected[1])return [];
 return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].flatMap(([row])=>{
  const cells=tags(row,'td'), link=path(row,'fight');
  if(!link||cells.length!==10)return [];
  const names=tags(cells[1],'a').map(plain).map(name);
  if(names.length!==2||[...names].sort().some((n,i)=>n!==expected[i]))return [];
  // The event table lists the winner first. Verify it before accepting the bout.
  const winner=fight.fighters.find(f=>f.id===fight.winnerId);
  if(plain(cells[0]).toLowerCase()!=='win'||!winner||names[0]!==name(winner.name))return [];
  const round=Number(plain(cells[8])), time=plain(cells[9]).match(/^(\d):([0-5]\d)$/);
  if(fight.length!=null&&(!time||round<1||(round-1)*300+Number(time[1])*60+Number(time[2])!==fight.length))return [];
  return [link];
 });
}
export function readUfcStatsTotals(html,fight){
 for(const table of tags(html,'table')){
  const [header]=tags(table,'thead'),[body]=tags(table,'tbody');
  if(!header||!body)continue;
  const heads=tags(header,'th').map(h=>plain(h).toUpperCase());
  const [fighterCol,strikeCol,takedownCol]=['FIGHTER','SIG. STR.','TD'].map(h=>heads.indexOf(h));
  const rows=tags(body,'tr');
  if([fighterCol,strikeCol,takedownCol].some(i=>i<0)||rows.length!==1)continue;
  const cells=tags(rows[0],'td');
  if(cells.length!==heads.length)continue;
  const values=index=>tags(cells[index],'p').map(plain);
  const fighters=values(fighterCol),strikes=values(strikeCol),takedowns=values(takedownCol);
  if([fighters,strikes,takedowns].some(pair=>pair.length!==2))continue;
  const landed=value=>{
   const hit=value.match(/^(\d{1,5}) of (\d{1,5})$/i);
   return hit&&Number(hit[1])<=Number(hit[2])?Number(hit[1]):null;
  };
  const result={};
  for(const fighter of fight.fighters){
   const index=fighters.findIndex(f=>name(f)===name(fighter.name));
   if(index<0)break;
   const counts=[landed(strikes[index]),landed(takedowns[index])];
   if(counts.some(n=>n===null))break;
   result[fighter.id]={ufc_sig_strikes:counts[0],ufc_takedowns:counts[1]};
  }
  if(Object.keys(result).length===2&&new Set(fighters.map(name)).size===2)return result;
 }
 return null;
}
async function read(fetchSource,pathname,ttl){
 const res=await fetchSource(origin+'/'+pathname,{redirect:'error',signal:AbortSignal.timeout(4000),cf:{cacheEverything:true,cacheTtl:ttl}});
 if(!res.ok)throw new Error('UFCStats HTTP '+res.status);
 const html=await res.text();
 if(html.length>1500000)throw new Error('UFCStats response too large');
 return html;
}
export async function fetchUfcFinalStats(fight,fetchSource){
 if(fight.outcome!=='final')return null;
 const dates=[fight.date.slice(0,10)];
 const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fight.date));
 if(!dates.includes(local))dates.push(local);
 const events=findUfcStatsEvent(await read(fetchSource,'statistics/events/completed?page=1',45),dates);
 if(!events.length||events.length>3)return null;
 const bouts=(await Promise.all(events.map(async event=>findUfcStatsBout(await read(fetchSource,event,45),fight)))).flat();
 if(bouts.length!==1)return null;
 const totals=readUfcStatsTotals(await read(fetchSource,bouts[0],90),fight);
 return totals?{totals,source:UFC_FINAL_SOURCE}:null;
}
