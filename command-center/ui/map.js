// US Atlas v3, ISC license; Albers USA projection includes AK and HI insets.
const topology=__STATE_TOPOLOGY__;
const codes={'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'};
function arc(index){let x=0,y=0;const a=topology.arcs[index<0?~index:index].map(p=>{x+=p[0];y+=p[1];return [x*topology.transform.scale[0]+topology.transform.translate[0],y*topology.transform.scale[1]+topology.transform.translate[1]]});return index<0?a.reverse():a}
function ring(indices){return indices.flatMap((i,n)=>n?arc(i).slice(1):arc(i)).map((p,i)=>(i?'L':'M')+p.map(n=>n.toFixed(2)).join(',')).join('')+'Z'}
// Approximate Albers USA position. The continental projection is aligned to the
// US Atlas map bounds; AK/HI use deliberately approximate inset locations.
function project(lat,lon,state){
 if(state==='AK')return [128+(lon+150)*2.5,475-(lat-64)*4];
 if(state==='HI')return [250+(lon+157)*3.5,535-(lat-20)*4];
 const phi=lat*Math.PI/180,lambda=lon*Math.PI/180;
 const p1=29.5*Math.PI/180,p2=45.5*Math.PI/180,p0=37.5*Math.PI/180,l0=-96*Math.PI/180;
 const n=(Math.sin(p1)+Math.sin(p2))/2;
 const C=Math.cos(p1)**2+2*n*Math.sin(p1);
 const rho=Math.sqrt(C-2*n*Math.sin(phi))/n;
 const rho0=Math.sqrt(C-2*n*Math.sin(p0))/n;
 const x=rho*Math.sin(n*(lambda-l0)),y=rho0-rho*Math.cos(n*(lambda-l0));
 return [495+x*840,340-y*840];
}
export function renderMap(node,rows,cities=[]){
  const counts=Object.fromEntries(rows.map(r=>[r.label,r.visitors])),max=Math.max(1,...Object.values(counts));
  node.innerHTML='<svg class="map" viewBox="0 0 975 610" role="group" aria-label="United States visitor map. Focus a state for its visitor estimate."></svg><div class="map-tooltip" role="status">Explore a state · Alaska and Hawaii shown as insets</div><p class="note">Lime hotspots indicate approximate city activity; brighter halos mean more visits. State shading shows estimated visitors. Geography is approximate. US Atlas / Albers USA · ISC license.</p>';
  const svg=node.querySelector('svg'),tip=node.querySelector('.map-tooltip');
  for(const g of topology.objects.states.geometries){
    const code=codes[String(g.id).padStart(2,'0')];if(!code)continue;const n=counts[code]||0;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',(g.type==='Polygon'?[g.arcs]:g.arcs).flatMap(p=>p.map(ring)).join(''));
    path.setAttribute('fill',n?`hsl(166 40% ${22+Math.sqrt(n/max)*40}%)`:'#192c31');
    path.setAttribute('tabindex','0');path.setAttribute('aria-label',`${g.properties.name}: ${n} estimated visitors`);
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=`${g.properties.name} · ${n.toLocaleString()} estimated visitors`;path.append(title);
    const show=()=>tip.textContent=title.textContent;path.addEventListener('pointerenter',show);path.addEventListener('focus',show);path.addEventListener('click',show);svg.append(path);
  }
  // City hotspots are informational overlays, not precise user locations.
  const valid=cities.filter(c=>Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon))&&c.lat!=null&&c.lon!=null&&c.state);
  const maxVisits=Math.max(1,...valid.map(c=>Number(c.visits)||0));
  const layer=document.createElementNS('http://www.w3.org/2000/svg','g');
  layer.setAttribute('class','city-glow');
  for(const c of valid){
    const [x,y]=project(Number(c.lat),Number(c.lon),c.state);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>975||y<0||y>610)continue;
    const strength=Math.sqrt((Number(c.visits)||0)/maxVisits);
    const halo=document.createElementNS('http://www.w3.org/2000/svg','circle');
    halo.setAttribute('class','halo');halo.setAttribute('cx',x.toFixed(1));halo.setAttribute('cy',y.toFixed(1));
    halo.setAttribute('r',String(9+strength*20));layer.append(halo);
    const core=document.createElementNS('http://www.w3.org/2000/svg','circle');
    core.setAttribute('class','core');core.setAttribute('cx',x.toFixed(1));core.setAttribute('cy',y.toFixed(1));
    core.setAttribute('r',String(2+strength*3));layer.append(core);
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent=c.label+', '+c.state+': '+c.visits+' estimated visits';
    core.append(title);
  }
  svg.append(layer);
}
