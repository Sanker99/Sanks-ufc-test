/* Sport adapters keep identity and comparisons independent of the dashboard tabs. */
const athleteAdapters = {
  NFL: {
    all: () => data.players || [], key: p => String(p.id),
    detail: p => [p.team, p.position].filter(Boolean).join(' · '),
    facts: p => [['Team', p.team], ['Position', p.position]],
    metrics: p => posGroup(p)==='QB' ? ['passing_yards','passing_tds','attempts','completions','interceptions','rushing_yards'] : posGroup(p)==='RB' ? ['rushing_yards','carries','rushing_tds','receptions','receiving_yards'] : ['receiving_yards','receptions','targets','receiving_tds'],
    source: () => 'https://github.com/nflverse/nflverse-data/releases/tag/stats_player'
  },
  UFC: {
    all: () => Object.values(ufcData.fighters || {}), key: f => ufcKey(f.name),
    detail: f => f.weightclass || 'Weight class unavailable',
    facts: f => [['Current organization', 'Unavailable'], ['Weight class in source', f.weightclass], ['Height', f.height], ['Weight', f.weight], ['Reach', f.reach], ['Stance', f.stance]],
    source: f => safeUrl(f.profile_url) || 'http://ufcstats.com/statistics/fighters'
  }
};
const v5 = {ready:false, route:null, sidebar:true, content:{athletes:{}}, sidebarRequest:0, loadErrors:[]};
const newsCache = new Map();
function safeUrl(value) { try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null} catch {return null} }
function displayDate(value) {
  if(!value)return 'Unavailable';
  const text=String(value),calendar=/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if(calendar && text.length===10){const d=new Date(text+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===text?`${calendar[2]}/${calendar[3]}/${calendar[1]}`:'Unavailable'}
  const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':new Intl.DateTimeFormat('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}).format(date);
}
function displayTimestamp(value) {if(!value)return 'Unavailable';const d=new Date(value);return Number.isNaN(d.getTime())?'Unavailable':displayDate(value)+' '+new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(d)}
function findAthlete(sport,key) {const a=athleteAdapters[sport];return a?.all().find(p=>a.key(p)===String(key))||null}
function athleteContent(sport,p) {return v5.content.athletes?.[sport+':'+athleteAdapters[sport].key(p)]||{}}
function profileHash(sport,key,compare) {return '#/athlete/'+encodeURIComponent(sport)+'/'+encodeURIComponent(key)+(compare?'?compare='+encodeURIComponent(compare):'')}
function goHash(hash) {if(location.hash===hash)applyV5Route();else location.hash=hash}
function navigateProfile(sport,key,keepMetric=false) {if(keepMetric)v5.keepMetricKey=String(key);hideSuggestions();$('search').value='';goHash(profileHash(sport,key))}
function parseV5Route() {
  try {
    const [path,query='']=location.hash.replace(/^#\/?/,'').split('?'),parts=path.split('/').map(decodeURIComponent);
    if(parts[0]==='athlete')return {view:'athlete',sport:parts[1],key:parts[2],compare:new URLSearchParams(query).get('compare')};
    if(parts[0]==='matchup'){const q=new URLSearchParams(query);return {view:'matchup',sport:'UFC',keys:parts.slice(1,3),names:[q.get('a'),q.get('b')],event:q.get('event'),date:q.get('date')}}
    const teams=new URLSearchParams(query).get('teams')?.split('|').filter(t=>/^[A-Z]{2,3}$/.test(t));
    return {view:['games','players','streaks','ufc'].includes(parts[0])?parts[0]:'games',teams:teams?.length===2?teams:null};
  }catch{return {view:'error'}}
}
function closeResearch() {v5.sidebar=false;v5.sidebarRequest++;chosen=null;verifyRequest++;verifyKey='';$('detail').hidden=true;document.body.classList.remove('player-open','ufc-versus-open');if($('toggleResearch'))$('toggleResearch').textContent='Show detailed statistics'}
async function openResearch(sport,p) {
  v5.sidebar=true;document.body.classList.add('player-open');$('detail').hidden=false;if($('toggleResearch'))$('toggleResearch').textContent='Hide detailed statistics';
  if(sport==='NFL'){chosen=p;showPlayer()}else{chosen=null;verifyRequest++;verifyKey='';await renderUfcSidebar({athlete:{displayName:p.name}})}
  if($('closeDetail'))$('closeDetail').onclick=closeResearch;
}
function applyV5Route() {
  const previous=v5.route;v5.route=parseV5Route();const r=v5.route;
  const sameAthlete=previous?.view==='athlete'&&r.view==='athlete'&&previous.sport===r.sport&&previous.key===r.key;
  if(!sameAthlete)closeResearch();
  if(['games','players','streaks','ufc'].includes(r.view)){tab=r.view;playerScope=r.view==='players'?r.teams:null;$('search').value='';render();if(tab==='ufc')loadUfc()}
  else {tab=r.sport==='NFL'?'players':'ufc';render();if(v5.ready&&r.view==='athlete'&&!sameAthlete){const p=findAthlete(r.sport,r.key);if(p){if(r.sport==='NFL'&&v5.keepMetricKey!==String(r.key)){metric=athleteAdapters.NFL.metrics(p)[0];threshold=posGroup(p)==='QB'?200:posGroup(p)==='RB'?40:60}v5.keepMetricKey=null;openResearch(r.sport,p)}}}
  if(!sameAthlete||previous?.compare!==r.compare)$('workspace').scrollTop=0;
}
function factMarkup(rows) {return '<div class="profile-facts">'+rows.map(([label,value])=>`<div class="profile-fact"><small>${esc(label)}</small><strong>${esc(value??'Unavailable')||'Unavailable'}</strong></div>`).join('')+'</div>'}
function portraitMarkup(sport,p) {
  const photo=athleteContent(sport,p).photo;
  // An arbitrary headshot URL does not establish permission to display it.
  if(safeUrl(photo?.url)?.startsWith('https:')&&safeUrl(photo?.license_url)&&photo?.attribution)return `<figure><img class="athlete-portrait" src="${esc(safeUrl(photo.url))}" alt="${esc(p.name)}" referrerpolicy="no-referrer"><figcaption class="footer"><a href="${esc(safeUrl(photo.license_url))}" target="_blank" rel="noopener noreferrer">${esc(photo.attribution)}</a></figcaption></figure>`;
  return `<div class="athlete-placeholder" role="img" aria-label="Licensed photograph unavailable">${esc(p.name.split(/\s+/).map(n=>n[0]).slice(0,2).join(''))}</div>`;
}
function athleteHero(sport,p,link=false) {const a=athleteAdapters[sport];return `<div class="profile-hero">${portraitMarkup(sport,p)}<div><div class="eyebrow">${esc(sport)} · ATHLETE RESEARCH</div><h2>${esc(p.name)}</h2><p class="muted">${esc(a.detail(p))}</p>${link?`<a href="${profileHash(sport,a.key(p))}">View athlete profile →</a>`:'<small>Photographs appear only with documented usage rights.</small>'}</div></div>`}
function nflSummary(p,key) {const vals=(p.games||[]).map(g=>g.metrics?.[key]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))).map(Number);return {count:vals.length,total:vals.reduce((a,b)=>a+b,0),average:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}}
function recentFightStats(p,key) {const vals=ufcRecentResults(p).map(f=>ufcFightStat(f,key)).filter(n=>n!==null);return vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)+' ('+vals.length+' fights)':'Unavailable'}
function fightHistoryMarkup(p) {const fights=ufcRecentResults(p);return `<ol class="fight-history">${fights.map(f=>`<li><time>${esc(displayDate(f.date||f.event_date))}</time><strong>${esc(ufcResult(f))} · ${esc(ufcOpponent(f)||'Opponent unavailable')}</strong><br>${esc(f.event||'Event unavailable')}<br><small>${esc(f.method||'Method unavailable')} · Round ${esc(f.round??'—')} · ${esc(f.time||'Time unavailable')}</small></li>`).join('')||'<li>No recent fight results available in the published dataset.</li>'}</ol>`}
function careerMarkup(sport,p) {
  const content=athleteContent(sport,p),bio=content.biography;
  const biography=bio?.text&&safeUrl(bio.source_url)?`<p>${esc(bio.text)}</p><a href="${esc(safeUrl(bio.source_url))}" target="_blank" rel="noopener noreferrer">Biography source ↗</a>`:'';
  if(sport==='NFL'){
    const extra=content.measurements?.source_url&&safeUrl(content.measurements.source_url)?content.measurements:null;
    return factMarkup([...athleteAdapters.NFL.facts(p),['Height',extra?.height],['Weight',extra?.weight],['Published season',data.season],['Available game logs',p.games?.length??0]])+`<h3>Performance summary · ${esc(data.season)} published season</h3>`+factMarkup(athleteAdapters.NFL.metrics(p).map(k=>{const s=nflSummary(p,k);return [labels[k],s.count?s.total+' total · '+s.average.toFixed(1)+'/game · '+s.count+' logs':'Unavailable']}))+`<p class="footer">Season totals use available player logs only; missing values are excluded per statistic. Career totals and biography are not supplied by the current dataset.</p>${extra?`<a href="${esc(safeUrl(extra.source_url))}" target="_blank" rel="noopener noreferrer">Measurement source ↗</a>`:''}${biography}<p class="warning">${injuryLink(p)}</p>`;
  }
  return factMarkup([...athleteAdapters.UFC.facts(p),['Record in source coverage',p.record]])+`<p class="footer">The published record is calculated from bouts in the source snapshot; it may differ from a fighter’s complete professional record. Weight class reflects source bout labeling, not a verified current roster assignment.</p>${biography}<h3>Recent striking & grappling · per-fight averages</h3>`+factMarkup([['Significant strikes landed',recentFightStats(p,'sig_strikes')],['Total strikes landed',recentFightStats(p,'total_strikes')],['Takedowns landed',recentFightStats(p,'takedowns')],['Submission attempts',recentFightStats(p,'submissions')]])+`<p class="footer">Available values within the last five recorded results; fight counts are shown. Career per-minute rates are unavailable in this snapshot.</p><h3>Last five available fights</h3>${fightHistoryMarkup(p)}`;
}
function comparisonRows(sport,a,b) {
  if(sport==='NFL'){
    const fields=[...new Set([...athleteAdapters.NFL.metrics(a),...athleteAdapters.NFL.metrics(b)])];
    return [['Team',a.team,b.team],['Position',a.position,b.position],...['height','weight'].map(k=>[k==='height'?'Height':'Weight',... [a,b].map(p=>{const m=athleteContent('NFL',p).measurements;return safeUrl(m?.source_url)?m?.[k]:null})]),...fields.map(k=>[labels[k]+' · total / avg / logs',...[a,b].map(p=>{const s=nflSummary(p,k);return s.count?`${s.total} / ${s.average.toFixed(1)} / ${s.count}`:null})])];
  }
  return [['Record · source coverage',a.record,b.record],...['height','weight','reach','stance'].map(k=>[k[0].toUpperCase()+k.slice(1),a[k],b[k]]),... [['slpm','Significant strikes / min'],['str_acc','Strike accuracy'],['sapm','Strikes absorbed / min'],['str_def','Strike defense'],['td_avg','Takedowns / 15 min'],['td_acc','Takedown accuracy'],['td_def','Takedown defense'],['sub_avg','Submissions / 15 min']].map(([key,label])=>[label,...[a,b].map(p=>ufcNum(p[key])===null?null:p[key])]),... [['sig_strikes','Significant strikes'],['total_strikes','Total strikes'],['takedowns','Takedowns'],['submissions','Submission attempts']].map(([k,l])=>[l+' · recent per-fight avg',recentFightStats(a,k),recentFightStats(b,k)])];
}
function compareMarkup(sport,a,b,showHeroes=true) {return `${showHeroes?`<div class="comparison-heads">${athleteHero(sport,a,true)}${athleteHero(sport,b,true)}</div>`:''}<h3>Tale of the Tape</h3><table class="comparison-table"><thead><tr><th>${esc(a.name)}</th><th>Statistic</th><th>${esc(b.name)}</th></tr></thead><tbody>${comparisonRows(sport,a,b).filter(([,x,y])=>sport!=='UFC'||x!=null||y!=null).map(([label,x,y])=>`<tr><td>${esc(x??'Unavailable')}</td><th scope="row">${esc(label)}</th><td>${esc(y??'Unavailable')}</td></tr>`).join('')}</tbody></table><p class="footer">${sport==='NFL'?'Published '+esc(data.season)+' season only. Each statistic excludes missing values; totals, per-game averages and log counts are shown. Different positions may have different roles.':'Recent averages use only available values in each fighter’s last five recorded results. Coverage counts are shown; no missing values are treated as zero. Career per-minute rates and accuracy are unavailable where absent from the snapshot. Records cover source bouts, not necessarily the full professional career.'}</p>${sport==='UFC'?`<div class="profile-history"><section><h3>${esc(a.name)} · Last five</h3>${fightHistoryMarkup(a)}</section><section><h3>${esc(b.name)} · Last five</h3>${fightHistoryMarkup(b)}</section></div>`:''}`}
function renderV5View() {
  const r=v5.route||parseV5Route();if(!['athlete','matchup','error'].includes(r.view))return false;
  const panel=$('listing');panel.classList.toggle('matchup-page',r.view==='matchup');
  if(!v5.ready){panel.innerHTML='<p role="status">Loading athlete data…</p>';return true}
  const matchupFighter=i=>findAthlete('UFC',r.keys?.[i])||(r.names?.[i]?{name:r.names[i],fights:[],unavailable:true}:null);
  const a=r.view==='athlete'?findAthlete(r.sport,r.key):matchupFighter(0);
  const b=r.view==='athlete'?(r.compare?findAthlete(r.sport,r.compare):null):matchupFighter(1);
  if(!a || (r.view==='matchup'&&!b)) {panel.innerHTML=`<h2>Athlete data unavailable</h2><p class="status-message">This athlete or matchup is not in the published dataset.${v5.loadErrors.length?' A data request failed.':''}</p><button id="retryAthlete">Retry data</button> <a href="#/players">NFL players</a> · <a href="#/ufc">UFC events</a>`;$('retryAthlete').onclick=async()=>{v5.ready=false;render();await loadV5Data();applyV5Route()};return true}
  if(r.view==='matchup'){
    const fighterHero=p=>`<div class="versus-fighter"><div class="versus-name">${esc(p.name)}</div><p class="versus-record">${esc(p.record||'Record unavailable')} <small>· source coverage</small></p><p class="muted">${esc(p.weightclass||'Weight class unavailable')}</p>${p.unavailable?'<p class="status-message">Detailed fighter data unavailable in this snapshot.</p>':`<a href="${profileHash('UFC',ufcKey(p.name))}">View fighter profile →</a>`}</div>`;
    panel.innerHTML=`<div class="profile-actions"><a href="#/ufc">← UFC events</a></div><div class="eyebrow">SANKS RESEARCH LAB · FIGHT INTELLIGENCE</div>${r.event?`<h2 class="bout-title">${esc(r.event)}</h2>`:''}${r.date?`<p class="muted">${esc(displayTimestamp(r.date))} · ESPN schedule</p>`:''}<div class="versus-hero">${fighterHero(a)}<span class="versus-vs">VS</span>${fighterHero(b)}</div>${compareMarkup('UFC',a,b,false)}<p class="footer">Historical data snapshot: ${esc(displayDate(ufcData.updated))}. Fighter history: <a href="http://ufcstats.com/statistics/fighters" target="_blank" rel="noopener noreferrer">UFCStats</a>. Upcoming event details are provided separately by ESPN.</p>`;return true;
  }
  const adapter=athleteAdapters[r.sport];
  panel.innerHTML=`<div class="profile-actions"><a href="#/${r.sport==='NFL'?'players':'ufc'}">← ${r.sport==='NFL'?'Players':'UFC events'}</a><button id="addAthlete">${b?'Replace Athlete':'Add Athlete'}</button>${r.compare?'<button id="removeAthlete">Remove second athlete</button>':''}<button id="toggleResearch">${v5.sidebar?'Hide':'Show'} detailed statistics</button></div><div id="athleteSelector" hidden></div>${r.compare&&!b?'<p class="status-message">The second athlete is unavailable. Choose a replacement or remove the selection.</p>':''}${b?compareMarkup(r.sport,a,b):athleteHero(r.sport,a)+careerMarkup(r.sport,a)}<section><h3>Recent news · ${esc(a.name)}</h3><div id="athleteNews" role="status">Loading recent news…</div><button id="retryNews" hidden>Retry news</button></section><p class="footer">Research source: <a href="${esc(adapter.source(a))}" target="_blank" rel="noopener noreferrer">${esc(r.sport==='NFL'?'nflverse':'UFCStats snapshot')}</a> · Updated ${esc(displayDate(r.sport==='NFL'?data.sources.stats?.updated:ufcData.updated))}</p>`;
  $('addAthlete').onclick=()=>openAthleteSelector(r.sport,a);
  if($('removeAthlete'))$('removeAthlete').onclick=()=>goHash(profileHash(r.sport,r.key));
  $('toggleResearch').onclick=()=>{if(v5.sidebar)closeResearch();else openResearch(r.sport,a);render()};
  renderAthleteNews(r.sport,a);return true;
}
function openAthleteSelector(sport,original) {
  const host=$('athleteSelector'),adapter=athleteAdapters[sport];host.hidden=false;
  host.innerHTML=`<div class="athlete-selector" role="region" aria-label="Choose a second ${esc(sport)} athlete"><div class="row"><strong class="grow">Compare with a ${esc(sport)} athlete</strong><button id="cancelSelector" aria-label="Close athlete selector">Close</button></div><input type="search" id="compareSearch" aria-label="Search ${esc(sport)} athletes to compare" placeholder="Search name, team or division" autocomplete="off"><div class="selector-results" id="compareResults"></div></div>`;
  const input=$('compareSearch');const update=()=>{const q=input.value.trim().toLowerCase(),matches=adapter.all().filter(p=>adapter.key(p)!==adapter.key(original)&&[p.name,adapter.detail(p)].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));$('compareResults').innerHTML=matches.slice(0,40).map(p=>`<button data-compare="${esc(adapter.key(p))}"><span>${esc(p.name)}</span><small>${esc(adapter.detail(p))}</small></button>`).join('')||'<p>No matching athletes in this sport.</p>';$('compareResults').querySelectorAll('[data-compare]').forEach(el=>el.onclick=()=>goHash(profileHash(sport,adapter.key(original),el.dataset.compare)))};
  input.oninput=update;input.onkeydown=e=>{if(e.key==='Escape'){$('cancelSelector').click();return}if(e.key==='Enter'){$('compareResults').querySelector('button')?.click()}};$('cancelSelector').onclick=()=>{host.hidden=true;$('addAthlete').focus()};update();input.focus();
}
async function fetchWithDeadline(url) {const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('HTTP '+response.status);return response.json()}
async function sportNews(sport,force=false) {
  if(force)newsCache.delete(sport);
  if(!newsCache.has(sport))newsCache.set(sport,fetchWithDeadline('https://site.api.espn.com/apis/site/v2/sports/'+(sport==='NFL'?'football/nfl':'mma/ufc')+'/news?limit=50').then(d=>{if(!Array.isArray(d.articles))throw Error('Invalid news response');return d.articles}).catch(e=>{newsCache.delete(sport);throw e}));
  return newsCache.get(sport);
}
function matchingNews(articles,name) {const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const needle=' '+normalize(name)+' ';return articles.filter(a=>a&&typeof a.headline==='string'&&a.headline.trim()&&(' '+normalize([a.headline,a.description,...(Array.isArray(a.categories)?a.categories:[]).map(c=>c?.description)].join(' '))+' ').includes(needle)&&safeUrl(a.links?.web?.href||a.url)&&Number.isFinite(Date.parse(a.published))&&Date.parse(a.published)<=Date.now()&&Date.parse(a.published)>Date.now()-90*86400000).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)).slice(0,5)}
async function renderAthleteNews(sport,p,force=false) {
  const host=$('athleteNews'),retry=$('retryNews');if(!host)return;retry.hidden=true;
  retry.onclick=()=>{host.textContent='Loading recent news…';renderAthleteNews(sport,p,true)};
  try{const articles=await sportNews(sport,force);if(!host.isConnected)return;const items=matchingNews(articles,p.name);host.innerHTML=items.length?'<ul class="news-list">'+items.map(a=>`<li><a href="${esc(safeUrl(a.links?.web?.href||a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.headline)}</a><br><small>${esc(displayDate(a.published))} · ESPN</small></li>`).join('')+'</ul>':'<p class="muted">No matching recent articles in the latest ESPN sport feed. This feed is limited and does not provide complete athlete news coverage.</p>'}
  catch {if(!host.isConnected)return;host.textContent='Recent news is temporarily unavailable. The news source could not be reached.';retry.hidden=false}
}
async function showUfcBout(bout) {
  const competitors=(bout.competitors||[]).slice(0,2),keys=competitors.map(c=>ufcKey(c.athlete?.displayName||c.athlete?.name));
  const q=new URLSearchParams({a:competitors[0]?.athlete?.displayName||competitors[0]?.athlete?.name||'Fighter to be announced',b:competitors[1]?.athlete?.displayName||competitors[1]?.athlete?.name||'Fighter to be announced'});if(ufcEvent?.name)q.set('event',ufcEvent.name);if(ufcEvent?.date)q.set('date',ufcEvent.date);
  hideSuggestions();$('search').value='';goHash('#/matchup/'+keys.map(encodeURIComponent).join('/')+'?'+q.toString());
}
function showUfcFighter(c) {navigateProfile('UFC',ufcKey(c.athlete?.displayName||c.athlete?.name))}
async function publishedJson(primary,fallback) {try{return await fetchWithDeadline(primary)}catch(primaryError){if(!fallback)throw primaryError;return fetchWithDeadline(fallback)}}
async function loadV5Data() {v5.loadErrors=[];const results=await Promise.allSettled([refresh(),refreshInjuries(),loadUfcDataset(),fetchWithDeadline('./data/athlete-content.json').then(d=>{if(!d.athletes||typeof d.athletes!=='object')throw Error('Invalid athlete content');v5.content=d})]);results.forEach((result,i)=>{if(result.status==='rejected'||result.value===false)v5.loadErrors.push(i)});v5.ready=true;updateSuggestions()}
function initV5() {
  v5.route=null;
  ['games','players','streaks','ufc'].forEach(view=>{$(view==='streaks'?'streaksTab':view+'Tab').onclick=()=>{hideSuggestions();goHash('#/'+view)}});
  addEventListener('hashchange',applyV5Route);
  loadV5Data().then(applyV5Route);setInterval(refresh,60000);setInterval(refreshInjuries,60000);
}
