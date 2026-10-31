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
 const labels=[
  ['stakeCents',/^(?:total\s+wager|wager(?:\s+amount)?|amount\s+wagered|bet\s+(?:amount|cost)|(?:total\s+)?stake|total\s+charged)\b/i],
  ['payoutCents',/^(?:potential\s+payout|total\s+payout|payout|potential\s+returns?|to\s+return|returns?|to\s+pay)\b/i],
  ['profitCents',/^(?:potential\s+(?:winnings|profit)|net\s+winnings|winnings|to\s+win|profit)\b/i]
 ];
 const lines=String(text).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 let direction=null;
 const explicitMoney=line=>/^(?:USD|EUR|GBP|\$|€|£)\s*\d[\d,.]*$/i.test(line??'');
 for(let i=0;i<lines.length;i++){
  const label=labels.map(([key,re])=>({key,match:lines[i].match(re)})).find(x=>x.match);if(!label)continue;
  let raw=lines[i].slice(label.match[0].length).replace(/^\s*[:—-]?\s*/,'');
  if(!raw){const before=explicitMoney(lines[i-1]),after=explicitMoney(lines[i+1]);if(!direction&&before&&after){warnings.push('Money labels have ambiguous placement. Review the wager and payout fields.');continue;}if(!direction&&(before||after))direction=before?'before':'after';raw=direction==='before'?lines[i-1]:(lines[i+1]??'');}
  const match=raw.match(/^(USD|EUR|GBP|\$|€|£)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(USD|EUR|GBP)?$/i);
  if(!match){warnings.push('A slip money amount could not be read. Check the wager and payout fields.');continue;}
  const before=match[1]&&currencies[match[1].toUpperCase()],after=match[3]&&currencies[match[3].toUpperCase()];
  if(before&&after&&before!==after){warnings.push('Conflicting currencies on the slip. Review the money fields.');continue;}
  if(before||after)foundCurrencies.add(before||after);
  try{values[label.key].push(inputCents(match[2].replace(/,/g,'')));}catch{warnings.push('A slip money amount could not be read.');}
 }
 const finances={currency:[...foundCurrencies][0]||'USD',stakeCents:null,payoutCents:null,profitCents:null};
 for(const [key,amounts] of Object.entries(values)){
  const unique=[...new Set(amounts)];if(unique.length===1)finances[key]=unique[0];
  if(unique.length>1)warnings.push('Different '+({stakeCents:'wager',payoutCents:'payout',profitCents:'winnings'})[key]+' amounts were found. Check the original slip.');
 }
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
