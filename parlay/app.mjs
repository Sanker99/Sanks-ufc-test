import {inputCents,financialTotals,money,cardEventDate,mergeFinances} from './slip-summary.mjs';
let removedCard=null;
import {createDemandRegistration,feedLabel} from './demand-client.mjs';
const feedStates=new Map();
import {createLiveSync,fetchLiveGame} from './live-sync.mjs?v=results-2';
import {currentScheduleWeek,suggestedWeekGame,defaultWeekGames} from './schedule.mjs?v=results-2';
import {mountPlayerSearch} from './player-search.mjs?v=results-2';
import {NFL_TEAMS} from './teams.mjs?v=results-2';
import {teamName,upgradeMoneylines} from './moneyline.mjs?v=results-2';
import {progressMarkup} from './progress.mjs?v=results-2';
import {CATEGORIES,parseSlipDetailed,deduplicate,lockParlay,confirmLegs,BrowserRepository,evaluateParlay,parlayBucket} from './core.mjs?v=results-2';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let roster=[],games=[],season,repo,view='build',parlays=[],draft=fresh(),storageBroken=false,liveSync=null;
const searchTeams=NFL_TEAMS.map(t=>({id:t.code,name:t.name,team:t.code,position:'Moneyline'}));
const playerCategories=Object.entries(CATEGORIES).filter(([key])=>!['unsupported','moneyline'].includes(key));
const legName=l=>l.category==='moneyline'?(l.teamName||teamName(l.team)||'Choose a team'):(l.playerName||'Unknown player');
function fresh(){return {id:crypto.randomUUID(),name:'',createdAt:new Date().toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,lockedAt:null,legs:[]};}
function message(text){$('message').textContent=text;}
function safe(action){return (...args)=>{try{const result=action(...args);if(result?.catch)result.catch(e=>message(e.message));}catch(e){message(e.message);}};}
function options(items,value){return items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('');}
function gameContext(text='',now=new Date()){return {season,week:currentScheduleWeek(games,season,{now,timeZone:draft.timeZone}),text};}
function gameOptions(identity,value){const team=roster.find(p=>p.id===identity)?.team??(teamName(identity)?identity:null);if(value===undefined)value=suggestedWeekGame({team,season},games,gameContext())?.schedule_id??'';return options([['','Choose a game'],...games.filter(g=>team&&(g.home===team||g.away===team)).map(g=>[g.schedule_id,`${g.date} · ${g.away} @ ${g.home}`])],value);}
function show(next){view=next;document.body.dataset.view=next;for(const id of ['build','scan','history'])$(id).hidden=id!==(next==='build'||next==='scan'?next:'history');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===next)));if(['active','won','lost'].includes(next))renderHistory();if(['active','won','lost'].includes(next))liveSync?.refresh(true);}
function inlineFeedback(id,text){$(id).textContent=text;$(id).hidden=!text;}
function showReviewIssues(issues){
 for(const issue of issues){const card=$('legs').children[issue.index];if(!card)continue;card.classList.add('needs-review');const editor=card.querySelector('.leg-editor');if(editor){editor.hidden=false;const toggle=card.querySelector('[data-toggle]');toggle.setAttribute('aria-expanded','true');toggle.textContent='Done';}const note=document.createElement('p');note.className='field-error';note.textContent=issue.reason;card.querySelector('h3')?.after(note);const game=card.querySelector('[data-field="gameId"]');if(game&&!game.value){game.setAttribute('aria-invalid','true');game.setAttribute('aria-label','Game required for leg '+(issue.index+1));}}
}
function updateReviewControls(){const count=draft.legs.filter(l=>l.verificationStatus==='confirmed').length;$('review-toolbar').hidden=!draft.legs.length;$('review-count').textContent=count+' / '+draft.legs.length+' legs confirmed';$('confirm-all').disabled=storageBroken||!draft.legs.length;}
function invalidate(article,leg){inlineFeedback('review-feedback','');article.classList.remove('needs-review');article.querySelector('.field-error')?.remove();for(const field of article.querySelectorAll('[aria-invalid]'))field.removeAttribute('aria-invalid');updateReviewControls();article.classList.remove('confirmed');article.classList.add('review');article.querySelector('.muted').textContent='Selection changed';updateLegSummary(article,leg);message('Selection changed. Confirm the updated leg before locking.');if(leg&&article.querySelector('.leg-progress'))article.querySelector('.leg-progress').outerHTML=progressMarkup(leg);}
for(const id of ['money-currency','money-stake','money-payout','money-profit'])$(id).oninput=safe(()=>{draft.finances=readFinanceInputs();});
$('name').oninput=()=>{draft.name=$('name').value;};
function selectionText(l){return l.category==='moneyline'?'TO WIN':(({'>=':'At least','>':'Over','<':'Under','<=':'At most'})[l.operator]||'Choose comparison')+' '+(l.target??'—')+' · '+(CATEGORIES[l.category]||'Choose prop');}
function matchupText(l){const g=games.find(g=>g.schedule_id===l.gameId);return g?g.away+' @ '+g.home+' · '+g.date:'Choose a game';}
function updateLegSummary(article,l){article.querySelector('.selection-label').textContent=selectionText(l);article.querySelector('.leg-matchup').textContent=matchupText(l);}
function readFinanceInputs(){return {currency:$('money-currency').value,stakeCents:inputCents($('money-stake').value),payoutCents:inputCents($('money-payout').value),profitCents:inputCents($('money-profit').value)};}
function renderLegs(){
 const f=draft.finances??{};$('money-currency').value=f.currency??'USD';for(const [id,key] of [['money-stake','stakeCents'],['money-payout','payoutCents'],['money-profit','profitCents']])$(id).value=f[key]==null?'':(f[key]/100).toFixed(2);
 $('slip-money').open=['stakeCents','payoutCents','profitCents'].some(k=>f[k]!=null);

 inlineFeedback('review-feedback','');
 updateReviewControls();$('manual-add').open=!draft.legs.length;
 const assumed=[...new Set(draft.legs.filter(l=>l.gameAssumption).map(l=>l.gameAssumption.week))];inlineFeedback('game-default-note',assumed.length?'Games defaulted to Week '+assumed.join(', ')+'. Use Edit to change a game.':'');
 $('name').value=draft.name;
 $('import-warnings').innerHTML=draft.importWarnings?.length?`<div class="import-alert" role="alert"><strong>CHECK THE ORIGINAL SLIP</strong>${draft.importWarnings.map(w=>`<p>${esc(w)}</p>`).join('')}<button id="reconcile-import" type="button">I CHECKED THIS AGAINST THE ORIGINAL SLIP</button></div>`:'';
 if($('reconcile-import'))$('reconcile-import').onclick=()=>{draft.importWarnings=[];renderLegs();message('Import warning acknowledged. Every remaining leg still needs confirmation.');};
 $('legs').innerHTML=draft.legs.map((l,i)=>{
  if(l.category==='unsupported')return `<article class="leg unsupported"><h3>LEG ${i+1} · ${esc(l.playerName)}</h3><p class="market-label">${esc(l.unsupportedMarket||'Unsupported market').toUpperCase()} · NOT SUPPORTED</p><p>${esc(l.reviewReason)}</p><button data-remove="${i}" type="button">REMOVE UNSUPPORTED LEG</button></article>`;
  const ml=l.category==='moneyline';
  return `<article class="leg review-leg ${l.verificationStatus}"><div class="review-leg-head"><span class="team-badge">${esc(l.team||'NFL')}</span><div class="leg-body"><h3>${esc(legName(l))}</h3><p class="selection-label">${esc(selectionText(l))}</p><p class="leg-matchup">${esc(matchupText(l))}</p></div><button type="button" data-toggle="${i}" aria-expanded="false" aria-controls="leg-editor-${i}">Edit</button></div><div class="leg-editor" id="leg-editor-${i}" hidden><p class="muted">${Math.round(l.confidence*100)}% recognition · ${esc(l.reviewReason||'Manual selection')} · ${esc(l.verificationStatus)}</p><div class="fields ${ml?'moneyline-fields':''}"><div data-selection-search="${i}"></div><label>Game<select data-field="gameId" data-index="${i}">${gameOptions(ml?l.team:l.playerId,l.gameId)}</select></label>${ml?'<p class="moneyline-rule">MONEYLINE · Selected team to win. A tied final waits for confirmed settlement rules.</p>':`<label>Prop<select data-field="category" data-index="${i}">${options(playerCategories,l.category)}</select></label><label>Comparison<select data-field="operator" data-index="${i}">${options([['','Choose'],['>=','At least'],['>','Over'],['<','Under'],['<=','At most']],l.operator)}</select></label><label>Target<input data-field="target" data-index="${i}" type="number" min="0" step="0.5" value="${esc(l.target??'')}"></label>`}</div><div class="actions"><button data-confirm="${i}">DONE EDITING</button><button data-remove="${i}">Remove</button></div></div></article>`;
 }).join('')||'<p class="muted">Add a player, a moneyline team, or scan a slip to get started.</p>';
 for(const root of $('legs').querySelectorAll('[data-selection-search]')){
  const i=Number(root.dataset.selectionSearch),l=draft.legs[i],ml=l.category==='moneyline';
  mountPlayerSearch(root,ml?searchTeams:roster,{id:'leg-selection-'+i,value:ml?l.team:l.playerId,label:ml?'Team':'Player',placeholder:ml?'Search NFL teams…':'Search NFL players…',resultLabel:ml?'Matching teams':'Matching players',onChange:id=>{
   if(ml)Object.assign(l,{kind:'team',team:id,teamName:teamName(id),playerId:null,playerName:null,gameId:null,season,operator:'win',target:null,verificationStatus:'review'});
   else{const p=roster.find(p=>p.id===id);Object.assign(l,{playerId:p?.id??null,playerName:p?.name??'',team:p?.team??null,gameId:null,season,verificationStatus:'review'});}
   delete l.gameAssumption;Object.assign(l,defaultWeekGames([l],games,gameContext())[0]);const article=root.closest('.leg');article.querySelector('h3').textContent=legName(l);article.querySelector('.team-badge').textContent=l.team||'NFL';article.querySelector('[data-field=gameId]').innerHTML=gameOptions(id,l.gameId);invalidate(article,l);
  }});
 }
}
function save(){draft.finances=readFinanceInputs();if(storageBroken)throw Error('Storage recovery required before saving');draft.name=$('name').value.trim()||'Untitled parlay';draft.updatedAt=new Date().toISOString();repo.save(draft);parlays=repo.list();message('Draft saved in this browser.');}
function renderHistory(){
 const expanded=new Set([...$('parlays').querySelectorAll('.parlay')].filter(card=>card.querySelector('.slip-details')?.open).map(card=>card.dataset.parlayId));
 $('history-title').textContent={active:'ACTIVE PARLAYS',won:'BETS WON',lost:'BETS LOST'}[view];
 const list=parlays.map(upgradeMoneylines).filter(p=>parlayBucket(p.result??evaluateParlay(p))===view);
 const matchup=l=>{const g=games.find(g=>g.schedule_id===l.gameId);return g?[g.away+' @ '+g.home,new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(g.date+'T12:00:00Z'))].join(' · '):'Game needs review';};
 const selection=l=>l.category==='moneyline'?'TO WIN':(({'>=':'≥','>':'>','<':'<','<=':'≤'})[l.operator]??'')+' '+(l.target??'—')+' · '+(CATEGORIES[l.category]??'Review selection');
 $('parlays').innerHTML=list.map(p=>{
  const result=p.result??evaluateParlay(p),status=!p.lockedAt?'Draft':result.status==='won'?'Won':result.status==='lost'?'Lost':result.status==='voided'?'Voided':'Locked';
  const sharedGame=new Set(p.legs.map(l=>l.gameId)).size===1;
  const eventDate=cardEventDate(p.legs,games),amounts=financialTotals(p.finances);
  const dateMarkup='<div class="card-event-date">'+(eventDate.date?'<time datetime="'+esc(eventDate.date)+'">'+esc(eventDate.label)+'</time>':esc(eventDate.label))+(eventDate.days?'<small>'+esc(eventDate.days)+'</small>':'')+(eventDate.missing?'<small>Some dates unavailable</small>':'')+'</div>';
  const moneyMarkup='<div class="card-money"><span>Wager<strong>'+esc(money(amounts.stake,amounts.currency))+'</strong></span><span>Potential payout<strong>'+esc(money(amounts.payout,amounts.currency))+'</strong></span>'+(amounts.profit!=null?'<span>Potential winnings<strong>'+esc(money(amounts.profit,amounts.currency))+'</strong></span>':'')+'</div>';

  const details=p.legs.map((l,i)=>{const row=result.legs[i],progress=row?.progress;return '<li><strong>'+esc(legName(l))+'</strong><span>'+esc(row?.state||'Pending')+(progress?.source?' · '+esc(progress.source):'')+'</span>'+(progress?.observedAt?'<time datetime="'+esc(progress.observedAt)+'">Checked '+esc(new Date(progress.observedAt).toLocaleString())+'</time>':'')+'</li>';}).join('');
  const rows=p.legs.map((l,i)=>'<div class="tracked-leg"><span class="team-badge" aria-label="'+esc(teamName(l.team)||l.team)+'">'+esc(l.team||'NFL')+'</span><div class="leg-body"><h4>'+esc(legName(l))+'</h4><p class="selection-label">'+esc(selection(l))+'</p>'+(sharedGame?'':'<p class="leg-matchup">'+esc(matchup(l))+'</p>')+ (p.lockedAt?progressMarkup(l,result.legs[i]?.progress,{compact:true})+'<small class="feed-freshness">'+esc(feedLabel(feedStates.get(l.gameId),result.legs[i]?.progress,Date.now(),l))+'</small>':'')+'</div></div>').join('');
  return '<article class="parlay" data-parlay-id="'+esc(p.id)+'"><div class="slip-head"><div><h3>'+esc(p.name)+'</h3><p>'+p.legs.length+' '+(p.legs.length===1?'leg':'legs')+(sharedGame?' · '+esc(matchup(p.legs[0])):'')+'</p></div><span class="slip-status">'+status+'</span></div>'+(!p.lockedAt?'<p class="draft-tracking-note">Draft · review the selections, then Confirm all & track.</p>':'')+dateMarkup+moneyMarkup+'<div class="slip-legs">'+rows+'</div><details class="slip-details"><summary>Stats & checked times</summary><ul>'+details+'</ul></details>'+(!p.lockedAt?'<button data-edit="'+esc(p.id)+'">EDIT DRAFT</button>':'')+'<div class="card-actions"><button type="button" data-remove-card="'+esc(p.id)+'">Remove card</button></div></article>';
 }).join('')||'<p class="empty-state">No parlays here yet.</p>';
 for(const card of $('parlays').querySelectorAll('.parlay'))if(expanded.has(card.dataset.parlayId))card.querySelector('.slip-details').open=true;
}
function updateLegType(){const ml=$('leg-type').value==='moneyline';$('manual-player-search').hidden=ml;$('manual-team-search').hidden=!ml;for(const id of ['manual-prop-field','manual-comparison-field','manual-target-field'])$(id).hidden=ml;$('target').required=!ml;$('game').innerHTML=gameOptions(ml?$('selected-team').value:$('player').value);}
$('leg-type').onchange=updateLegType;
$('manual').onsubmit=safe(e=>{e.preventDefault();const ml=$('leg-type').value==='moneyline',game=games.find(g=>g.schedule_id===$('game').value);let leg;
 if(ml){const code=$('selected-team').value;if(!teamName(code)||!game||![game.home,game.away].includes(code))throw Error('Choose the selected team and its game');leg={kind:'team',playerId:null,playerName:null,team:code,teamName:teamName(code),season,gameId:game.schedule_id,category:'moneyline',operator:'win',target:null};}
 else{const p=roster.find(x=>x.id===$('player').value);if(!p||!game||![game.home,game.away].includes(p.team))throw Error('Choose a player and matching game');leg={playerId:p.id,playerName:p.name,team:p.team,season,gameId:game.schedule_id,category:$('category').value,operator:$('operator').value,target:$('target').value===''?null:Number($('target').value)};}
 draft.legs=deduplicate([...draft.legs,{...leg,confidence:1,verificationStatus:'review',reviewReason:'Manual selection; confirm all fields'}]);renderLegs();
});
$('legs').onchange=safe(e=>{const {field,index}=e.target.dataset;if(!field)return;const l=draft.legs[Number(index)];l[field]=field==='target'?(e.target.value===''?null:Number(e.target.value)):e.target.value;if(field==='gameId')delete l.gameAssumption;l.verificationStatus='review';invalidate(e.target.closest('.leg'),l);});
$('legs').oninput=$('legs').onchange;
$('legs').onclick=safe(e=>{if(e.target.dataset.toggle!==undefined){const article=e.target.closest('.leg'),editor=article.querySelector('.leg-editor');editor.hidden=!editor.hidden;e.target.setAttribute('aria-expanded',String(!editor.hidden));e.target.textContent=editor.hidden?'Edit':'Done';}if(e.target.dataset.remove!==undefined){draft.legs.splice(Number(e.target.dataset.remove),1);renderLegs();}
 if(e.target.dataset.confirm!==undefined){const index=Number(e.target.dataset.confirm),review=confirmLegs([draft.legs[index]],{roster,games,season});if(review.unresolved.length)throw Error(review.unresolved[0].reason);draft.legs[index]=review.legs[0];renderLegs();}
});
$('confirm-all').onclick=safe(()=>{try{
 if(storageBroken)throw Error('Storage recovery required before saving');
 draft.finances=readFinanceInputs();
 const review=confirmLegs(draft.legs,{roster,games,season});draft.legs=review.legs;renderLegs();
 if(review.unresolved.length){showReviewIssues(review.unresolved);throw Error('Check '+review.unresolved.length+' flagged '+(review.unresolved.length===1?'leg':'legs')+'. '+review.unresolved[0].reason);}
 draft.name=$('name').value.trim()||'Untitled parlay';const locked=lockParlay(draft,true);repo.save(locked);parlays=repo.list();draft=fresh();renderLegs();show('active');message('Parlay confirmed and saved. Tracking started.');
 }catch(error){message(error.message);inlineFeedback('review-feedback',error.message);}});
$('new').onclick=()=>{draft=fresh();renderLegs();message('New draft. Save it before leaving.');};
$('save').onclick=safe(save);
$('parse').onclick=safe(()=>{if(!roster.length)throw Error('Roster is unavailable');const parsed=parseSlipDetailed($('ocr-text').value,roster,{season,games,gameDate:$('slip-date').value||null,ocrConfidence:lastOcrConfidence}),legs=$('slip-date').value?parsed.legs:defaultWeekGames(parsed.legs,games,gameContext($('ocr-text').value));if(!legs.length)throw Error('No recognizable selections found. Correct the text or add a leg manually.');draft.finances=readFinanceInputs();const mergedMoney=mergeFinances(draft.finances,parsed.finances);draft.finances=mergedMoney.finances;parsed.warnings.push(...mergedMoney.warnings);draft.legs=deduplicate([...draft.legs,...legs]);draft.importWarnings=[...new Set([...(draft.importWarnings??[]),...parsed.warnings])];$('ocr-text').value='';$('images').value='';lastOcrConfidence=1;renderLegs();show('build');message(`${legs.length} selections read${legs.some(l=>l.category==='unsupported')?' — includes unsupported markets that block locking':''}. Games default to this week when available. Review the selections and change any game if needed.`);});
$('parlays').onclick=safe(e=>{const removal=e.target.closest('[data-remove-card]');if(removal){const card=repo.list().find(p=>p.id===removal.dataset.removeCard);if(card&&repo.remove(card.id)){removedCard=card;parlays=repo.list();renderHistory();$('card-action-text').textContent=(card.name||'Parlay')+' removed. ';$('card-action').hidden=false;liveSync?.refresh(true);}return;}const p=parlays.find(p=>p.id===e.target.dataset.edit);if(p&&!p.lockedAt){draft=upgradeMoneylines(p);draft.legs=defaultWeekGames(draft.legs,games,gameContext('',new Date(draft.createdAt||Date.now())));renderLegs();show('build');}});
$('undo-remove').onclick=safe(()=>{if(!removedCard)return;repo.restore({version:1,parlays:[removedCard]});removedCard=null;parlays=repo.list();$('card-action').hidden=true;renderHistory();liveSync?.refresh(true);});
$('restore').onchange=safe(async()=>{const file=$('restore').files[0];if(!file)return;if(storageBroken)throw Error('Recover existing storage before importing a backup');if(file.size>2000000)throw Error('Backup must be smaller than 2 MB');const count=repo.restore(await file.text());parlays=repo.list();renderHistory();$('restore').value='';message(`${count} saved parlays restored. Existing history was preserved.`);});
$('export').onclick=safe(()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,parlays:repo.list()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sanks-parlays.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>show(b.dataset.view);
function refreshSaved(){if(storageBroken||!repo)return;try{parlays=repo.list();if(['active','won','lost'].includes(view))renderHistory();}catch(e){message(e.message);}}
window.addEventListener('storage',refreshSaved);window.addEventListener('focus',refreshSaved);window.addEventListener('sanks:parlays-updated',refreshSaved);

let lastOcrConfidence=1;
async function loadOcr(){if(globalThis.Tesseract)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(Error('OCR engine could not load. Try pasted text.'));document.head.append(script);});}
// Upscale and grayscale to help screenshots and photos; no image leaves the browser.
async function prepare(file){const image=await createImageBitmap(file);try{if(image.width*image.height>24000000)throw Error('Image is too large; crop it to the slip first.');const scale=Math.min(2,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.filter='grayscale(1) contrast(1.2)';ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;}finally{image.close();}}
$('ocr').onclick=safe(async()=>{const files=[...$('images').files];if(!files.length||files.length>10)throw Error('Select between one and ten images');if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>15000000))throw Error('Use PNG, JPEG or WebP images smaller than 15 MB');$('ocr').disabled=true;$('parse').disabled=true;$('progress').hidden=false;let worker;try{await loadOcr();worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.progress!==undefined)$('progress').value=m.progress;}});const texts=[],scores=[];for(let i=0;i<files.length;i++){message(`Reading image ${i+1} of ${files.length}…`);const result=await worker.recognize(await prepare(files[i]));texts.push(result.data.text);scores.push(result.data.confidence/100);}lastOcrConfidence=Math.min(...scores);$('ocr-text').value=texts.join('\n\n');message('Images read. Correct text if needed, then import for review.');}finally{if(worker)await worker.terminate();$('ocr').disabled=false;$('parse').disabled=false;$('progress').hidden=true;}});
async function start(){
 try{repo=new BrowserRepository(localStorage);parlays=repo.list();}catch(e){storageBroken=true;message(e.message);$('save').disabled=true;$('confirm-all').disabled=true;}
 const response=await fetch('./catalog.json');if(!response.ok)throw Error('NFL roster could not load; try again later');const data=await response.json();season=data.season;roster=data.players.map(({id,name,team,position})=>({id,name,team,position,season})).sort((a,b)=>a.name.localeCompare(b.name));games=data.games;
 mountPlayerSearch($('manual-player-search'),roster,{id:'player-search',onChange:id=>{$('player').value=id??'';if($('leg-type').value==='player')$('game').innerHTML=gameOptions(id);}});
 mountPlayerSearch($('manual-team-search'),searchTeams,{id:'team-search',label:'Team',placeholder:'Search NFL teams…',resultLabel:'Matching teams',onChange:id=>{$('selected-team').value=id??'';if($('leg-type').value==='moneyline')$('game').innerHTML=gameOptions(id);}});
 $('category').innerHTML=options(playerCategories,'passing_yards');updateLegType();renderLegs();if(!storageBroken){
  const liveStatus=state=>{const note=$('live-status');if(!note)return;const reason=[...feedStates.values()].find(f=>f.reason)?.reason;if(state.status==='idle')note.textContent='Lock a parlay to register its games.';else if(reason)note.textContent=reason;else if(state.status==='error')note.textContent='Some statistics unavailable; saved values retained.';else note.textContent=state.status==='loading'?'Reading shared statistics cache…':'Big Balls Sports Data · demand-based checks · live totals remain provisional';};
  liveSync=createLiveSync({repository:repo,isVisible:()=>document.visibilityState!=='hidden',gameDate:id=>games.find(g=>g.schedule_id===id)?.date,fetchGame:fetchLiveGame,registerGames:createDemandRegistration(),onGame:(data,group)=>{feedStates.set(group.gameId,data);if(['active','won','lost'].includes(view))renderHistory();},onState:liveStatus});
  setInterval(()=>{liveSync.refresh();if(['active','won','lost'].includes(view))renderHistory();},30000);document.addEventListener('visibilitychange',()=>liveSync.refresh());
  message('');show(parlays.length?'active':'build');
 }
}start().catch(e=>message(e.message));
