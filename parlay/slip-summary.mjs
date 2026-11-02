const currencies={USD:'USD','$':'USD',EUR:'EUR','€':'EUR',GBP:'GBP','£':'GBP'};
export function inputCents(value){
 if(value==null||String(value).trim()==='')return null;
 const raw=String(value).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a money amount with no more than two decimal places.');
 const [whole,fraction='']=raw.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>100000000000)throw Error('Money amount is too large.');
 return cents;
}
export function validFinances(f){
 return !!f&&typeof f==='object'&&!Array.isArray(f)&&['USD','EUR','GBP'].includes(f.currency)&&['stakeCents','payoutCents','profitCents'].every(k=>f[k]==null||Number.isSafeInteger(f[k])&&f[k]>=0&&f[k]<=100000000000);
}
export function parseSlipFinances(text){
 const values={stakeCents:[],payoutCents:[],profitCents:[]},warnings=[],foundCurrencies=new Set();
 const labelPattern=/\b(total\s+wager|wager(?:\s+amount)?|amount\s+wagered|bet\s+(?:amount|cost)|(?:total\s+)?stake|total\s+charged|potential\s+payout|total\s+payout|payout|potential\s+returns?|to\s+return|returns?|to\s+pay|potential\s+(?:winnings|profit)|net\s+winnings|winnings|to\s+win|profit)\b/gi;
 const keyOf=label=>/wager|stake|bet |charged/i.test(label)?'stakeCents':/winnings|profit|to win/i.test(label)?'profitCents':'payoutCents';
 const amountPattern=/(USD|EUR|GBP|\$|€|£)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*(USD|EUR|GBP))?/gi;
 const amounts=raw=>{
  const cleaned=raw.trim().replace(/^[:|]+|[:|]+$/g,'').trim();if(!cleaned)return [];
  const hits=[...cleaned.matchAll(amountPattern)],rest=cleaned.replace(amountPattern,'');
  if(!hits.length||!/^[\s|]*$/.test(rest))return null;
  try{return hits.map(m=>{const before=m[1]&&currencies[m[1].toUpperCase()],after=m[3]&&currencies[m[3].toUpperCase()];if(before&&after&&before!==after)throw Error('currency');return {cents:inputCents(m[2].replace(/,/g,'')),currency:before||after||null};});}catch{return null;}
 };
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const rows=lines.map(line=>{const labels=[...line.matchAll(labelPattern)].map(m=>({key:keyOf(m[0]),index:m.index,end:m.index+m[0].length}));return {line,labels,onlyLabels:labels.length>0&&line.replace(labelPattern,'').replace(/[\s:|/—-]/g,'')===''};});
 const add=(key,amount)=>{values[key].push(amount.cents);if(amount.currency)foundCurrencies.add(amount.currency);};
 // Inline pairs: Total Wager $10.00 | Total Payout $250.00.
 for(const row of rows)if(row.labels.length&&!row.onlyLabels){
  for(let j=0;j<row.labels.length;j++){
   const label=row.labels[j],raw=row.line.slice(label.end,row.labels[j+1]?.index??row.line.length),read=amounts(raw);
   if(read?.length===1)add(label.key,read[0]);else warnings.push('A slip money amount could not be read. Check Total Wager and Total Payout.');
  }
 }
 const blocks=[];
 for(let i=0;i<rows.length;i++)if(rows[i].onlyLabels){
  const start=i,labels=[...rows[i].labels];while(rows[i+1]?.onlyLabels){labels.push(...rows[++i].labels);}
  blocks.push({start,end:i,labels});
 }
 const adjacent=(index,direction,count)=>{
  let result=[];for(let i=index;i>=0&&i<rows.length&&result.length<count;i+=direction){if(rows[i].labels.length)break;const read=amounts(rows[i].line);if(!read?.length)break;result=direction===1?[...result,...read]:[...read,...result];}
  return result.length===count?result:null;
 };
 for(const b of blocks){b.before=adjacent(b.start-1,-1,b.labels.length);b.after=adjacent(b.end+1,1,b.labels.length);}
 const directions=new Set(blocks.filter(b=>!!b.before!==!!b.after).map(b=>b.before?'before':'after'));
 const direction=directions.size===1?[...directions][0]:null;
 const used=new Set();
 for(const b of blocks){
  const side=direction??(b.before&&!b.after?'before':b.after&&!b.before?'after':null),read=side&&b[side];
  if(!read){warnings.push('Money labels have ambiguous placement or missing amounts. Review Total Wager and Total Payout.');continue;}
  // A physical amount row cannot supply two different label blocks.
  const range=side==='after'?Array.from({length:rows.length-b.end-1},(_,i)=>b.end+1+i):Array.from({length:b.start},(_,i)=>b.start-1-i);
  let n=0,indices=[];for(const i of range){const a=rows[i].labels.length?null:amounts(rows[i].line);if(!a?.length)break;indices.push(i);n+=a.length;if(n>=read.length)break;}
  if(indices.some(i=>used.has(i))){warnings.push('Money labels have ambiguous placement. Review Total Wager and Total Payout.');continue;}
  indices.forEach(i=>used.add(i));b.labels.forEach((label,i)=>add(label.key,read[i]));
 }
 const finances={currency:[...foundCurrencies][0]||'USD',stakeCents:null,payoutCents:null,profitCents:null};
 for(const [key,list] of Object.entries(values)){const unique=[...new Set(list)];if(unique.length===1)finances[key]=unique[0];if(unique.length>1)warnings.push('Different '+({stakeCents:'wager',payoutCents:'payout',profitCents:'winnings'})[key]+' amounts were found. Check the original slip.');}
 if(foundCurrencies.size>1){for(const key of Object.keys(values))finances[key]=null;warnings.push('Multiple currencies were found. Enter the correct slip currency and amounts.');}
 return {finances,warnings:[...new Set(warnings)]};
}
export function financialTotals(finances){
 const f=validFinances(finances)?finances:{currency:'USD'};
 const stake=f.stakeCents??null;
 const payout=f.payoutCents??null;
 const profit=f.profitCents??null;
 return {currency:f.currency,stake,payout,profit};
}
export function money(cents,currency='USD'){return cents==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100);}
export function cardEventDate(legs,games){
 const byId=new Map(games.map(g=>[g.schedule_id,g])),counts=new Map();let missing=0;
 for(const leg of legs){const date=byId.get(leg.gameId)?.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')){missing++;continue;}counts.set(date,(counts.get(date)||0)+1);}
 const dates=[...counts.keys()].sort();if(!dates.length)return {date:null,label:'Date unavailable',days:'',missing};
 // Each leg counts. On an equal count, the earliest event date wins.
 const date=[...dates].sort((a,b)=>counts.get(b)-counts.get(a)||a.localeCompare(b))[0];
 const parsed=d=>new Date(d+'T12:00:00Z');
 const weekdays=[...new Set(dates.map(d=>new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(parsed(d))))];
 return {date,label:new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(parsed(date)),days:dates.length>1?weekdays.join(' & '):'',missing};
}

export function mergeFinances(previous,incoming){
 if(!previous)return {finances:incoming,warnings:[]};
 if(!incoming||!['stakeCents','payoutCents','profitCents'].some(k=>incoming[k]!=null))return {finances:previous,warnings:[]};
 if(previous.currency!==incoming.currency&&['stakeCents','payoutCents','profitCents'].some(k=>previous[k]!=null))return {finances:previous,warnings:['Different slip currencies were found. Review the money fields.']};
 const finances={...previous,currency:incoming.currency},warnings=[];
 for(const k of ['stakeCents','payoutCents','profitCents'])if(incoming[k]!=null){if(previous[k]!=null&&previous[k]!==incoming[k]){finances[k]=null;warnings.push('Conflicting slip amounts. Enter the correct amount before confirming.');}else finances[k]=incoming[k];}
 return {finances,warnings};
}
