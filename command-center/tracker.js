(()=>{'use strict';
  if(location.pathname.startsWith('/admin')||navigator.doNotTrack==='1'||navigator.globalPrivacyControl)return;
  const COLLECTOR=typeof window.SANKS_ANALYTICS_ENDPOINT==='string'?window.SANKS_ANALYTICS_ENDPOINT:'/api/collect';
  let fallbackVisitorId=crypto.randomUUID();
  const visitorId=()=>{try{let id=localStorage.getItem('sanks_visitor_id_v1');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id||'')){id=crypto.randomUUID();localStorage.setItem('sanks_visitor_id_v1',id)}return id}catch{return fallbackVisitorId}};
  const credentials=COLLECTOR.startsWith('https://')||COLLECTOR.startsWith('http://')?'omit':'same-origin';
  let count=0,windowStart=Date.now(),lastRoute='',queue=Promise.resolve();
  const safe=v=>String(v??'').replace(/[^a-zA-Z0-9_.:| -]/g,'').slice(0,100);
  const currentSport=()=>{const p=location.hash.match(/athlete\/(NFL|NCAA|UFC)/)?.[1]||new URLSearchParams(location.hash.split('?')[1]||'').get('league');return ['NFL','NCAA','UFC'].includes(p)?p:location.hash.includes('/ncaa')?'NCAA':location.hash.includes('/ufc')?'UFC':'NFL'};
  function send(kind,sport='LAB',section='home',entity=''){
    if(Date.now()-windowStart>60000){count=0;windowStart=Date.now()}if(++count>25)return;
    const payload=JSON.stringify({kind,sport,section,entity:safe(entity),referrer:kind==='page'?document.referrer:'',visitorId:visitorId()});
    // Serialize so the first response establishes the HttpOnly visitor cookie
    // before any subsequent feature event is sent.
    queue=queue.then(()=>fetch(COLLECTOR,{method:'POST',credentials,headers:{'Content-Type':'application/json'},body:payload,keepalive:true,signal:AbortSignal.timeout(4000)})).catch(()=>{});
  }
  function route(){
    const h=location.hash.split('?')[0],q=new URLSearchParams(location.hash.split('?')[1]||''),sport=currentSport();
    const canonical=h+'|'+sport+'|'+safe(q.get('teams'))+'|'+safe(q.get('compare'));if(canonical===lastRoute)return;lastRoute=canonical;
    const m=h.match(/^#\/athlete\/(NFL|NCAA|UFC)\/(.+)$/);
    if(m){send('page',m[1],'athlete');let key='';try{key=safe(decodeURIComponent(m[2]))}catch{}send(m[1]==='UFC'?'fighter':'player',m[1],'athlete',key);if(q.get('compare'))send('matchup',sport,'athlete',key+'|'+safe(q.get('compare')))}
    else {const s=h.match(/^#\/(games|players|streaks|ufc|teams|conferences|ncaa)/)?.[1]||'home',section=s==='ncaa'?'games':s;send('page',sport,section);if(s==='streaks')send('streak',sport,'streaks');for(const team of (q.get('teams')||'').split('|').filter(Boolean))send('team',sport,'teams',team)}
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,[data-player],[data-game]');if(!el)return;
    const d=el.dataset;
    if(d.game)send('game','NFL','games',d.game);
    else if(d.collegeGame)send('game','NCAA','games',d.collegeGame);
    else if(d.collegeStat)send('statistic','NCAA','athlete',d.collegeStat);
    else if(d.labStat)send('statistic','NFL','athlete',d.labStat);
    else if(d.stat)send('statistic',currentSport(),'athlete',d.stat);
    else if(d.ufcStat)send('statistic','UFC','athlete',d.ufcStat);
    else if(d.ufcEvent){const card=typeof ufcEvents!=='undefined'?ufcEvents[Number(d.ufcEvent)]:null;if(card?.id)send('card','UFC','ufc',card.id)}
    else if(d.bout){const card=typeof ufcEvent!=='undefined'?ufcEvent:null,bout=card?.competitions?.[Number(d.bout)];if(bout?.id)send('matchup','UFC','ufc',String(card.id)+'|'+bout.id)}
    else if(d.team)send('team',d.sport||'NFL','teams',d.team);
    else if(d.conference)send('conference','NCAA','conferences',d.conference);
  },{passive:true,capture:true});
  let timer,lastSearch='',lastSearchAt=0;
  function recordSearch(value){
    const query=String(value||'').trim();if(!query)return;
    const match=/tits|mcgee/i.test(query)?'tits-mcgee-match':'';
    const signature=query.toLowerCase();
    if(signature===lastSearch&&Date.now()-lastSearchAt<2500)return;
    lastSearch=signature;lastSearchAt=Date.now();
    send('search',currentSport(),'home',match);
  }
  document.addEventListener('input',e=>{if(e.target.id==='search'){clearTimeout(timer);const value=e.target.value;timer=setTimeout(()=>recordSearch(value),1500)}});
  document.addEventListener('keydown',e=>{if(e.target?.id==='search'&&e.key==='Enter'){clearTimeout(timer);recordSearch(e.target.value)}},true);
  document.addEventListener('submit',e=>{const input=e.target?.querySelector?.('#search');if(input){clearTimeout(timer);recordSearch(input.value)}},true);
  document.addEventListener('change',e=>{const el=e.target;if(el.matches('select')){send('filter',currentSport());if(['ncaaPlayerTeam','ncaaStreakTeam','teamFilter','streakTeam'].includes(el.id)&&el.value!=='ALL')send('team',currentSport(),'teams',el.value);if(el.id==='collegeProfileMetric')send('statistic','NCAA','athlete',el.value)}},{passive:true,capture:true});
  window.addEventListener('error',()=>send('error'));window.addEventListener('unhandledrejection',()=>send('error'));
  window.addEventListener('hashchange',route);lastRoute='uninitialized';route();

  const LOCATION_KEY='sanks-coarse-location-v1';
  const validCoarse=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=24&&p.lat<=50&&p.lon>=-125&&p.lon<=-66&&Math.abs(p.lat*10-Math.round(p.lat*10))<1e-7&&Math.abs(p.lon*10-Math.round(p.lon*10))<1e-7;
  const savedCoarse=()=>{try{const p=JSON.parse(localStorage.getItem(LOCATION_KEY)||'null');return validCoarse(p)?p:null}catch{return null}};
  function sendCoarse(p){
    if(!validCoarse(p))return Promise.reject(Error('Invalid approximate location'));
    const payload=JSON.stringify({kind:'location',sport:'LAB',section:'home',consent:true,lat:p.lat,lon:p.lon,visitorId:visitorId()});
    const request=queue.then(()=>fetch(COLLECTOR,{method:'POST',credentials,headers:{'Content-Type':'application/json'},body:payload,signal:AbortSignal.timeout(12000)})).then(response=>{if(!response.ok)throw Error('Location not saved');return response});
    queue=request.catch(()=>{});return request;
  }
  function locationControls(){
    const saved=savedCoarse();
    const choice=localStorage.getItem('sanks-location-choice');
    if(choice==='approved'&&!saved){localStorage.removeItem('sanks-location-choice')}
    if(choice==='approved'&&saved){
      // Reassociate this browser's existing consented coarse area with its current
      // anonymous visitor cookie after page collection; no new GPS request.
      sendCoarse(saved).catch(()=>{});
    }
    const control=document.createElement('button');
    control.type='button';control.textContent='LOCATION SETTINGS';
    control.setAttribute('aria-label','Update or revoke approximate location sharing');
    control.style.cssText='position:fixed;bottom:10px;left:10px;z-index:9998;background:#071b20;color:#b4e8dd;border:1px solid #315e65;padding:6px 9px;font:10px system-ui;cursor:pointer;opacity:.8';
    control.addEventListener('click',()=>{
      const previous=localStorage.getItem('sanks-location-choice');
      if(previous==='approved'){
        if(!confirm('Stop sharing your saved approximate area on future visits? Previously collected anonymous statistics remain.'))return;
        localStorage.removeItem(LOCATION_KEY);
        localStorage.setItem('sanks-location-choice','declined');
        control.textContent='LOCATION SETTINGS';
      }else{
        localStorage.removeItem('sanks-location-choice');
        inviteLocation();
      }
    });
    document.body.append(control);
    inviteLocation();
  }
  function inviteLocation(){
    if(!navigator.geolocation||localStorage.getItem('sanks-location-choice'))return;
    const box=document.createElement('aside');
    box.setAttribute('role','dialog');box.setAttribute('aria-label','Help put your city on the map');
    box.style.cssText='position:fixed;bottom:40px;right:20px;z-index:99999;max-width:390px;padding:22px;background:#0a1918;color:#f3fff2;border:1px solid #b6ff43;box-shadow:0 15px 45px #000a;font:15px/1.5 system-ui';
    const title=document.createElement('strong');title.textContent="We're tracking how far SANKS Research Lab reaches!";title.style.fontSize='19px';
    const info=document.createElement('p');info.textContent='Help us put your city on the map! Sharing your location helps us see where our page gets viewed.';
    const privacy=document.createElement('p');privacy.textContent='Optional. Only an approximate area (rounded to 0.1 degrees) is stored. You can revoke future sharing using Location Settings.';privacy.style.cssText='font-size:12px;opacity:.75';
    const yes=document.createElement('button');yes.type='button';yes.textContent="I'M DOWN WITH THE GET DOWN";yes.style.cssText='background:#b6ff43;color:#08140a;padding:12px;border:0;font-weight:bold;cursor:pointer;margin-right:8px';
    const no=document.createElement('button');no.type='button';no.textContent='NO THANKS';no.style.cssText='background:transparent;color:white;padding:12px;border:1px solid #668076;cursor:pointer';
    const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.style.cssText='font-size:13px;min-height:18px;margin:12px 0 0;color:#d9f3d0';
    box.append(title,info,privacy,yes,no,feedback);document.body.append(box);
    const reset=message=>{yes.disabled=false;no.disabled=false;yes.textContent='TRY SHARING AGAIN';feedback.textContent=message};
    no.addEventListener('click',()=>{localStorage.setItem('sanks-location-choice','declined');box.remove()});
    yes.addEventListener('click',()=>{
      if(yes.disabled)return;yes.disabled=true;yes.textContent='LOCATING…';
      feedback.textContent='Waiting for browser location permission.';
      try{navigator.geolocation.getCurrentPosition(async position=>{
        const p={lat:Math.round(position.coords.latitude*10)/10,lon:Math.round(position.coords.longitude*10)/10};
        if(!validCoarse(p)){reset('Location outside supported US map. Nothing shared.');return}
        feedback.textContent='Saving approximate area…';
        try{await sendCoarse(p);localStorage.setItem(LOCATION_KEY,JSON.stringify(p));localStorage.setItem('sanks-location-choice','approved');box.remove()}
        catch{reset('Could not save location. Please retry.')}
      },error=>reset(error.code===1?'Permission denied. Enable location for this site to retry.':'Location unavailable or timed out. Please retry.'),{enableHighAccuracy:false,timeout:15000,maximumAge:600000})}
      catch{reset('Location access is unavailable.')}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',locationControls,{once:true});else locationControls();
  // Explicit integration API accepts only controlled taxonomy; never pass search text.
  window.sanksTrack=send;
})();
