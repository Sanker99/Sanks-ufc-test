(()=>{'use strict';
  if(location.pathname.startsWith('/admin')||navigator.doNotTrack==='1'||navigator.globalPrivacyControl)return;
  let count=0,windowStart=Date.now(),lastRoute='',queue=Promise.resolve();
  const safe=v=>String(v??'').replace(/[^a-zA-Z0-9_.:| -]/g,'').slice(0,100);
  const currentSport=()=>{const p=location.hash.match(/athlete\/(NFL|NCAA|UFC)/)?.[1]||new URLSearchParams(location.hash.split('?')[1]||'').get('league');return ['NFL','NCAA','UFC'].includes(p)?p:location.hash.includes('/ncaa')?'NCAA':location.hash.includes('/ufc')?'UFC':'NFL'};
  function send(kind,sport='LAB',section='home',entity=''){
    if(Date.now()-windowStart>60000){count=0;windowStart=Date.now()}if(++count>25)return;
    const payload=JSON.stringify({kind,sport,section,entity:safe(entity),referrer:kind==='page'?document.referrer:''});
    // Serialize so the first response establishes the HttpOnly visitor cookie
    // before any subsequent feature event is sent.
    queue=queue.then(()=>fetch('/api/collect',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,signal:AbortSignal.timeout(4000)})).catch(()=>{});
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

  // Optional location invitation. Never request browser permission without a click.
  function locationInvitation(){
    if(sessionStorage.getItem('sanks-location-invite')||localStorage.getItem('sanks-location-choice'))return;
    const box=document.createElement('aside');box.setAttribute('role','dialog');box.setAttribute('aria-label','Help put your city on the map');
    box.style.cssText='position:fixed;bottom:24px;right:24px;z-index:99999;max-width:390px;padding:22px;background:#091715;color:#f5fff7;border:1px solid #a5ed42;box-shadow:0 16px 55px #000b;font:15px/1.5 system-ui,sans-serif';
    box.innerHTML='<strong style="font-size:19px">We\\'re tracking how far SANKS Research Lab reaches!</strong><p>Help us put your city on the map! Sharing your location helps us see where and how often our page gets viewed.</p><p style="font-size:12px;opacity:.75">Optional. Your browser may ask for permission. Precise coordinates are not saved.</p><button type="button" data-yes style="background:#b4ff48;color:#07130d;padding:12px;border:0;font-weight:800;cursor:pointer">I\\'M DOWN WITH THE GET DOWN</button> <button type="button" data-no style="background:transparent;color:#fff;padding:12px;border:1px solid #64766b;cursor:pointer">I SUCK &amp; WONT SHARE</button>';
    document.body.append(box);
    const dismiss=()=>{localStorage.setItem('sanks-location-choice','dismissed');box.remove()};
    box.querySelector('[data-no]').addEventListener('click',dismiss);
    box.querySelector('[data-yes]').addEventListener('click',()=>{
      if(!navigator.geolocation){dismiss();return}
      box.querySelector('[data-yes]').disabled=true;
      navigator.geolocation.getCurrentPosition(position=>{
        // Client-side rounding prevents transmitting precise browser coordinates.
        const latitude=Math.round(position.coords.latitude*10)/10;
        const longitude=Math.round(position.coords.longitude*10)/10;
        // Location collection requires an independently reviewed, consent-aware backend.
        // Do not transmit location until that endpoint is available.
        void latitude;void longitude;
        localStorage.setItem('sanks-location-choice','approved');box.remove();
      },()=>dismiss(),{enableHighAccuracy:false,timeout:10000,maximumAge:600000});
    });
  }
  window.addEventListener('load',()=>setTimeout(locationInvitation,12000),{once:true});
  // Explicit integration API accepts only controlled taxonomy; never pass search text.
  window.sanksTrack=send;
})();
