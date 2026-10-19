/* Approval prototype only. No global profile/comparison redesign is enabled. */
const v6 = {registry:null,error:null};
const V6_DEMO_KEYS=['islammakhachev','charlesoliveira'];
async function loadV6Images(){
  try{const d=await fetchWithDeadline('./data/athlete-images.json');if(d.schema_version!==1||!d.athletes)throw Error('Invalid image registry');v6.registry=d;v6.error=null;return true}
  catch(error){v6.registry=null;v6.error=String(error.message||error);return false}
}
function v6LocalAsset(value){return typeof value==='string'&&/^assets\/portraits\/[a-z0-9-]+\.(webp|svg)$/.test(value)?value:null}
function v6Image(key){const photo=v6.registry?.athletes?.['UFC:'+key];return photo?.review_status==='verified-open-license'&&photo.source_page?.startsWith('https://commons.wikimedia.org/')&&safeUrl(photo.license_url)&&photo.attribution&&photo.derivatives_allowed===true&&v6LocalAsset(photo.portrait?.path)?photo:null}
function v6Flag(country){
  if(country==='RU')return '<svg viewBox="0 0 30 20" role="img" aria-label="Russia"><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#2850a0" d="M0 6.67h30v6.67H0z"/><path fill="#d44848" d="M0 13.33h30V20H0z"/></svg>';
  if(country==='BR')return '<svg viewBox="0 0 30 20" role="img" aria-label="Brazil"><path fill="#17854c" d="M0 0h30v20H0z"/><path fill="#f4d15c" d="m15 2 12 8-12 8L3 10Z"/><circle cx="15" cy="10" r="5" fill="#284e91"/><path d="M10.3 8.6q5-.5 9.2 3.2" stroke="#fff" fill="none" stroke-width="1"/></svg>';
  return '';
}
function v6Portrait(key,side){const p=v6Image(key),f=findAthlete('UFC',key),name=f?.name||'Fighter';
  if(!p)return `<div class="faceoff-photo faceoff-photo-${side} photo-fallback" role="img" aria-label="Photograph unavailable for ${esc(name)}"><span>Portrait unavailable</span></div>`;
  const maskPath=v6LocalAsset(p.cutout?.mask);const mask=maskPath?new URL(maskPath,document.baseURI).href+'?v=6b':null;
  return `<div class="faceoff-photo faceoff-photo-${side}"><img class="${mask?'has-silhouette':''}" ${mask?`style="--portrait-mask:url('${mask}')"`:''} src="${esc(p.portrait.path)}" width="${p.portrait.width}" height="${p.portrait.height}" alt="${esc(name)} — archival photograph, ${esc(p.captured_at.slice(0,4))}" fetchpriority="high" decoding="async"><span class="portrait-failure" hidden>Portrait unavailable</span></div>`;
}
function v6Credit(key){const p=v6Image(key);return p?`<li><a href="${esc(p.source_page)}" target="_blank" rel="noopener noreferrer">${esc(p.athlete_name)}</a> · ${esc(p.attribution)} · <a href="${esc(p.license_url)}" target="_blank" rel="noopener noreferrer">${esc(p.license)}</a>. ${esc(p.modifications)}</li>`:'<li>Portrait unavailable; no substitute image is used.</li>'}
function v6Form(f){return ufcRecentResults(f).map(fight=>`<span class="form-${ufcResultLetter(fight).toLowerCase()}" title="${esc(displayDate(fight.date)+' · '+fight.opponent+' · '+fight.result)}">${ufcResultLetter(fight)}</span>`).join('')||'<span>—</span>'}
function v6Nameplate(f,key,side){const p=v6Image(key),parts=f.name.split(' ');return `<div class="faceoff-name faceoff-name-${side}"><div class="faceoff-origin">${v6Flag(p?.country?.code)}<span>${esc(p?.country?.name||'Country unavailable')}</span></div><h2><span>${esc(parts.shift())}</span><strong>${esc(parts.join(' '))}</strong></h2><div class="faceoff-record"><b>${esc(f.record||'—')}</b><span>record in source coverage</span></div><div class="faceoff-form">${v6Form(f)}<small>Last five</small></div><a class="fighter-profile-link" href="${profileHash('UFC',key)}">Explore fighter <span aria-hidden="true">↗</span></a></div>`}
function renderV6Prototype(panel){
  document.body.classList.add('v6-preview');panel.classList.add('v6-prototype');
  const [a,b]=V6_DEMO_KEYS.map(key=>findAthlete('UFC',key));
  if(!a||!b){panel.innerHTML='<h2>Face-off research unavailable</h2><p>The prototype needs both published fighter records.</p><a href="#/ufc">Return to UFC</a>';return true}
  const tape=[['Height',a.height,b.height],['Reach',a.reach,b.reach],['Weight in source',a.weight,b.weight],['Stance',a.stance,b.stance]];
  panel.innerHTML=`<nav class="faceoff-breadcrumb" aria-label="Matchup navigation"><a href="#/ufc">← UFC research</a><span>V6 / Visual direction preview</span><a href="#/athlete/UFC/islammakhachev?compare=charlesoliveira">Compare in research view ↗</a></nav>
    <div class="faceoff-stage">
      <div class="arena-rig" aria-hidden="true"></div><div class="arena-smoke" aria-hidden="true"></div><div class="arena-floor" aria-hidden="true"></div>
      <div class="faceoff-masthead"><span class="faceoff-kicker">Sanks Research Lab <i></i> Fight intelligence</span><h1>THE FACE-OFF</h1><p>Islam Makhachev <span>×</span> Charles Oliveira</p><span class="faceoff-study">Fighter comparison · no scheduled bout implied</span></div>
      <div class="arena-word arena-word-left" aria-hidden="true">ISLAM</div><div class="arena-word arena-word-right" aria-hidden="true">CHARLES</div>
      ${v6Portrait(V6_DEMO_KEYS[0],'left')}${v6Portrait(V6_DEMO_KEYS[1],'right')}
      <div class="faceoff-shade" aria-hidden="true"></div>
      <div class="faceoff-center"><div class="faceoff-vs" aria-label="Versus">VS<span></span></div><div class="faceoff-tape"><h3>Tale of the tape</h3>${tape.map(([label,x,y])=>`<div class="faceoff-tape-row"><b>${esc(x||'—')}</b><span>${esc(label)}</span><b>${esc(y||'—')}</b></div>`).join('')}<p>Published measurements · may be historical</p></div></div>
      ${v6Nameplate(a,V6_DEMO_KEYS[0],'left')}${v6Nameplate(b,V6_DEMO_KEYS[1],'right')}
      <div class="faceoff-bottomline"><span><i></i> Research, beyond the record.</span><span>UFCStats snapshot · ${esc(displayDate(ufcData.updated))}</span><a href="#v6-research" id="v6ResearchLink">Fight history below ↓</a></div>
    </div>
    <div class="faceoff-disclosure"><p>Archival photographs: Islam, 2022 · Charles, 2021. The belt shown is part of the original historical photo; it does not indicate a current title. Source records cover published bouts, not necessarily the full professional career.</p><details><summary>Photography credits & usage rights</summary><ul>${V6_DEMO_KEYS.map(v6Credit).join('')}</ul><p>Original photographs are preserved; WebP compression, vector silhouette masks, responsive cropping and CSS lighting are disclosed adaptations. No faces or bodies have been generated or mirrored. No athlete or organization endorsement is implied.</p><a href="data/athlete-images.json" target="_blank" rel="noopener">View image registry ↗</a></details>${v6.error?'<p class="warning">Photo registry unavailable. Text-only fallbacks are shown.</p><button id="v6RetryImages">Retry photographs</button>':''}</div>
    <div id="v6-research" class="v6-research"><div class="v6-section-heading"><span>01 / THE RECENT RECORD</span><h2>Every fight tells a story.</h2><p>Five most recent available results, newest first. Source coverage applies.</p></div><div class="v6-history-grid">${[a,b].map((f,i)=>`<section><header class="v6-history-head"><h3>${esc(f.name)}</h3><div class="faceoff-form">${v6Form(f)}</div></header>${fightHistoryMarkup(f)}</section>`).join('')}</div><div class="v6-statistics"><div class="v6-section-heading"><span>02 / UNDER THE NUMBERS</span><h2>Performance, in context.</h2></div>${compareMarkup('UFC',a,b,false).split('<div class="profile-history">')[0]}</div></div>`;
  panel.querySelectorAll('.faceoff-photo img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.parentElement.classList.add('photo-fallback');img.nextElementSibling.hidden=false}});
  $('v6ResearchLink').onclick=e=>{e.preventDefault();$('v6-research').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})};
  if($('v6RetryImages'))$('v6RetryImages').onclick=async()=>{await loadV6Images();render()};
  return true;
}
