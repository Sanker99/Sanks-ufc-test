const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=category=>category.includes('yards')?'yards':category.includes('tds')?'TDs':category==='receptions'?'receptions':category==='completions'?'completions':category==='interceptions'?'INTs':'attempts';
function observationTime(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '';
 const label=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));
 return '<time datetime="'+esc(value)+'">Checked '+esc(label)+'</time>';
}
const op={'>=':'≥','>':'>','<':'<','<=':'≤'};
export function progressMarkup(leg,progress,{compact=false}={}){
 const moneyline=leg.category==='moneyline',p=progress??{},available=p.available===true&&Number.isFinite(p.current),tone=available?(p.hit?'green':'red'):'waiting',percent=available&&Number.isFinite(p.percent)?Math.max(0,Math.min(100,p.percent)):0;
 const current=available?esc(p.current):'—',target=moneyline?'WIN':`${op[leg.operator]??''} ${leg.target??'—'} ${unit(leg.category)}`;
 const left=moneyline?`${esc(leg.team||'TEAM')} ${current}${available?` · ${esc(p.opponentTeam||'OPP')} ${esc(p.opponent)}`:''}`:`${current} <span>${esc(unit(leg.category))}</span>`;
 const final=String(p.state??'').startsWith('Final '),status=!available?'Waiting for verified stats':final?p.state:moneyline?`${p.current===p.opponent?'Tied':p.current>p.opponent?'Leading':'Trailing'} · provisional`:`${p.hit?'Target currently met':'Target not yet met'} · provisional`;
 const caption=compact?(!available?'Awaiting stats':final?p.state:moneyline?(p.current===p.opponent?'Tied':p.current>p.opponent?'Leading':'Trailing')+' · provisional':p.hit?'Target met · provisional':'In progress · provisional'):status;
 const accessible=available?moneyline?`${left.replace(/<[^>]*>/g,'')} — ${status}`:`${p.current} ${unit(leg.category)}; target ${target}; ${status}`:'No verified stat available';
 const aria=moneyline?`role="img" aria-label="${esc(accessible)}"`:`role="progressbar" aria-label="Leg progress" aria-valuemin="0" aria-valuemax="100" ${available?`aria-valuenow="${percent}"`:''} aria-valuetext="${esc(accessible)}"`;
 return `<div class="leg-progress" data-tone="${tone}"><div class="progress-numbers"><strong>${left}</strong><span>${moneyline?'MONEYLINE':`TARGET ${esc(target)}`}</span></div><div class="progress-track" ${aria}><div class="progress-fill" style="width:${percent}%"></div></div><div class="progress-caption"><span>${esc(caption)}</span>${compact?'':observationTime(p.observedAt)}${!compact&&available&&p.source?`<small>${esc(p.source)}</small>`:''}</div></div>`;
}
