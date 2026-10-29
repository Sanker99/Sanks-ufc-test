// US Atlas v3, ISC license; Albers USA projection includes AK and HI insets.
const topology=__STATE_TOPOLOGY__;
// Map markers are consented, coarse browser areas only. They are not verified positions.
const codes={'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'};
function arc(index){let x=0,y=0;const a=topology.arcs[index<0?~index:index].map(p=>{x+=p[0];y+=p[1];return [x*topology.transform.scale[0]+topology.transform.translate[0],y*topology.transform.scale[1]+topology.transform.translate[1]]});return index<0?a.reverse():a}
function ring(indices){return indices.flatMap((i,n)=>n?arc(i).slice(1):arc(i)).map((p,i)=>(i?'L':'M')+p.map(n=>n.toFixed(2)).join(',')).join('')+'Z'}
// Match the lower-48 US Atlas Albers USA projection (975 x 610 viewBox).
// D3's geoAlbersUsa uses Albers parallels 29.5/45.5, rotation 96,
// center [-0.6,38.7], scale 1300 and translation [487.5,305].
function project(lat,lon,state){
 if(state==='AK')return [128+(lon+150)*2.5,475-(lat-64)*4];
 if(state==='HI')return [250+(lon+157)*3.5,535-(lat-20)*4];
 const rad=Math.PI/180,p1=29.5*rad,p2=45.5*rad;
 const n=(Math.sin(p1)+Math.sin(p2))/2;
 const C=Math.cos(p1)**2+2*n*Math.sin(p1);
 const raw=(a,b)=>{const rho=Math.sqrt(C-2*n*Math.sin(a*rad))/n,theta=n*(b+96)*rad;return [rho*Math.sin(theta),-rho*Math.cos(theta)]};
 const [x,y]=raw(lat,lon),[x0,y0]=raw(38.7,-96.6);
 return [487.5+(x-x0)*1300,305-(y-y0)*1300];
}
export function renderMap(node,rows,cities=[],flaggedCities=[]){
  const counts=Object.fromEntries(rows.map(r=>[r.label,r.visitors])),max=Math.max(1,...Object.values(counts));
  node.innerHTML='<div class="map-console"><div class="map-hud"><span>◈ GEO / ACTIVITY GRID</span><span>● OPT-IN APPROXIMATE AREAS ONLY</span></div><svg class="map" viewBox="0 0 975 610" role="group" aria-label="United States map showing approximate locations shared by visitors."><defs><radialGradient id="signalHalo"><stop offset="0" stop-color="#d8ff79" stop-opacity=".72"/><stop offset=".23" stop-color="#baff32" stop-opacity=".38"/><stop offset="1" stop-color="#baff32" stop-opacity="0"/></radialGradient><filter id="signalBloom" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur stdDeviation="4"/></filter></defs><g class="map-grid"></g></svg><div class="map-scan" aria-hidden="true"></div><div class="map-coordinate">CONSENTED / APPROXIMATE AREAS</div></div><div class="map-tooltip" role="status">Only approximate areas shared by visitors appear here.</div><p class="note">Only approximate browser areas explicitly shared by visitors appear on this map. No IP-based location estimates are shown. Rounded areas are not exact positions, may not identify a city, and are not a visitor’s current location. US Atlas / Albers USA · ISC license.</p>';
  const svg=node.querySelector('svg'),tip=node.querySelector('.map-tooltip');
  const grid=svg.querySelector('.map-grid');
  if(grid){for(let x=35;x<975;x+=48){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('y1',0);line.setAttribute('y2',610);grid.append(line)}for(let y=20;y<610;y+=48){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',0);line.setAttribute('x2',975);line.setAttribute('y1',y);line.setAttribute('y2',y);grid.append(line)}}
  for(const g of topology.objects.states.geometries){
    const code=codes[String(g.id).padStart(2,'0')];if(!code)continue;const n=0;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',(g.type==='Polygon'?[g.arcs]:g.arcs).flatMap(p=>p.map(ring)).join(''));
    path.setAttribute('fill',n?`hsl(86 49% ${14+Math.sqrt(n/max)*21}%)`:'#101b1b');
    path.setAttribute('tabindex','0');path.setAttribute('aria-label',`${g.properties.name}: no state-level location is available`);
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=`${g.properties.name} · no state-level location is available`;path.append(title);
    const show=()=>tip.textContent=title.textContent;path.addEventListener('pointerenter',show);path.addEventListener('focus',show);path.addEventListener('click',show);svg.append(path);
  }
  // City hotspots are informational overlays, not precise user locations.
  const valid=cities.filter(c=>c.state==='BR'&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon))&&c.lat!=null&&c.lon!=null);
  const maxVisits=Math.max(1,...valid.map(c=>Number(c.visits)||0));
  const missing=cities.length-valid.length;
  if(missing)tip.textContent=`${missing} city area(s) lack usable coordinates; dots appear only for geolocated visits.`;
  const layer=document.createElementNS('http://www.w3.org/2000/svg','g');
  layer.setAttribute('class','city-glow');
  for(const c of valid){
    const [x,y]=project(Number(c.lat),Number(c.lon),c.state);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>975||y<0||y>610)continue;
    const strength=Math.sqrt((Number(c.visits)||0)/maxVisits);
    const halo=document.createElementNS('http://www.w3.org/2000/svg','circle');
    halo.setAttribute('class','halo');halo.setAttribute('cx',x.toFixed(1));halo.setAttribute('cy',y.toFixed(1));
    halo.setAttribute('r',String(10+strength*17));layer.append(halo);
    const core=document.createElementNS('http://www.w3.org/2000/svg','circle');
    core.setAttribute('class','core');core.setAttribute('cx',x.toFixed(1));core.setAttribute('cy',y.toFixed(1));
    core.setAttribute('r',String(2+strength*2.5));layer.append(core);
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent='Approximate area shared by visitor · '+c.visits+' opt-in signal(s) in these sessions; not a current or exact position';
    core.append(title);
    core.setAttribute('tabindex','0');
    core.setAttribute('aria-label',title.textContent);
    const showCity=()=>{tip.textContent=title.textContent};core.addEventListener('focus',showCity);core.addEventListener('pointerenter',showCity);core.addEventListener('click',showCity);
  }
  svg.append(layer);
  const flagged=document.createElementNS('http://www.w3.org/2000/svg','g');
  flagged.setAttribute('class','flagged-search-dots');
  for(const c of flaggedCities){
    if(c.state!=='BR'||c.lat==null||c.lon==null)continue;
    const [x,y]=project(Number(c.lat),Number(c.lon),c.state);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>975||y<0||y>610)continue;
    const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
    marker.setAttribute('cx',x.toFixed(1));marker.setAttribute('cy',y.toFixed(1));
    marker.setAttribute('r','5');marker.setAttribute('tabindex','0');
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent=String(c.label)+(c.state==='BR'?'':', '+c.state)+' · '+c.matches+' flagged searches · approximate area';
    marker.append(title);marker.setAttribute('aria-label',title.textContent);
    const show=()=>tip.textContent=title.textContent;
    marker.addEventListener('focus',show);marker.addEventListener('pointerenter',show);marker.addEventListener('click',show);
    flagged.append(marker);
  }
  svg.append(flagged);
  if(!valid.length){tip.textContent=cities.length?'Shared areas lack usable coordinates.':'No approximate areas have been explicitly shared yet.';}
}
