import {signedHandicap} from './moneyline.mjs?v=manual-1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=category=>category==='game_total_points'?'points':category.includes('yards')?'yards':category.includes('tds')?'TDs':category==='receptions'?'receptions':category==='completions'?'completions':category==='interceptions'?'INTs':'attempts';
function observationTime(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '';
 const label=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));
 return '<time datetime="'+esc(value)+'">Checked '+esc(label)+'</time>';
}
const op={'>=':'≥','>':'Over','<':'Under','<=':'≤'};
export function progressMarkup(leg,progress,{compact=false}={}){
 if(leg.category==='spread')return spreadMarkup(leg,progress,{compact});
 const moneyline=leg.category==='moneyline',p=progress??{},available=p.available===true&&Number.isFinite(p.current),push=p.state==='Push / Settlement pending',tone=push?'waiting':available?(p.hit?'green':'red'):'waiting',percent=available&&Number.isFinite(p.percent)?Math.max(0,Math.min(100,p.percent)):0;
 const current=available?(p.knownMinimum?'≥ ':'')+esc(p.current):'—',target=moneyline?'WIN':`${op[leg.operator]??''} ${leg.target??'—'} ${unit(leg.category)}`;
 const left=moneyline?`${esc(leg.team||'TEAM')} ${current}${available?` · ${esc(p.opponentTeam||'OPP')} ${esc(p.opponent)}`:''}`:`${current} <span>${esc(unit(leg.category))}</span>`;
 const final=String(p.state??'').startsWith('Final '),status=push?'Push / settlement pending':!available?'Waiting for verified stats':final?p.state:moneyline?`${p.current===p.opponent?'Tied':p.current>p.opponent?'Leading':'Trailing'} · provisional`:`${p.hit?'Target currently met':'Target not yet met'} · provisional`;
 const caption=push?'Push / settlement pending':compact?(!available?'Awaiting stats':final?p.state:moneyline?(p.current===p.opponent?'Tied':p.current>p.opponent?'Leading':'Trailing')+' · provisional':p.hit?'Target met · provisional':'In progress · provisional'):status;
 const accessible=available?moneyline?`${left.replace(/<[^>]*>/g,'')} — ${status}`:`${p.current} ${unit(leg.category)}; target ${target}; ${status}`:'No verified stat available';
 const aria=moneyline?`role="img" aria-label="${esc(accessible)}"`:`role="progressbar" aria-label="Leg progress" aria-valuemin="0" aria-valuemax="100" ${available?`aria-valuenow="${percent}"`:''} aria-valuetext="${esc(accessible)}"`;
 return `<div class="leg-progress" data-tone="${tone}"><div class="progress-numbers"><strong>${left}</strong><span>${moneyline?'MONEYLINE':`TARGET ${esc(target)}`}</span></div><div class="progress-track" ${aria}><div class="progress-fill" style="width:${percent}%"></div></div><div class="progress-caption"><span>${esc(caption)}</span>${compact?'':observationTime(p.observedAt)}${!compact&&available&&p.source?`<small>${esc(p.source)}</small>`:''}</div></div>`;
}

function spreadMarkup(leg,progress,{compact}){
 const p=progress??{},available=p.available===true&&Number.isInteger(p.current)&&Number.isInteger(p.opponent),push=p.state==='Push / Settlement pending',margin=available?p.current+leg.target-p.opponent:null;
 const tone=push?'waiting':available?(margin>0?'green':margin<0?'red':'waiting'):'waiting',market=leg.alternateSpread?'ALT SPREAD':'SPREAD',line=signedHandicap(leg.target);
 const scores=available?`${leg.team} ${p.current} · ${p.opponentTeam||'OPP'} ${p.opponent}`:`${leg.team||'TEAM'} — · OPP —`;
 const status=push?'Push / settlement pending':!available?'Waiting for verified scores':`${String(p.state??'').startsWith('Final ')?p.state:margin>0?'Covering · provisional':margin<0?'Not covering · provisional':'At the line · provisional'} · cover margin ${signedHandicap(margin)}`;
 return `<div class="leg-progress" data-tone="${tone}"><div class="progress-numbers"><strong>${esc(scores)}</strong><span>${esc(market+' '+line)}</span></div><div class="progress-track" role="img" aria-label="${esc(scores+'; '+market+' '+line+'; '+status)}"><div class="progress-fill" style="width:${available?100:0}%"></div></div><div class="progress-caption"><span>${esc(status)}</span>${compact?'':observationTime(p.observedAt)}${!compact&&available&&p.source?`<small>${esc(p.source)}</small>`:''}</div></div>`;
}
