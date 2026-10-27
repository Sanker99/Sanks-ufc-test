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

  function inviteLocation(){
    if(!navigator.geolocation||localStorage.getItem('sanks-location-choice'))return;
    const box=document.createElement('aside');
    box.setAttribute('role','dialog');box.setAttribute('aria-label','Help put your city on the map');
    box.style.cssText='position:fixed;bottom:20px;right:20px;z-index:99999;max-width:390px;padding:22px;background:#0a1918;color:#f3fff2;border:1px solid #b6ff43;box-shadow:0 15px 45px #000a;font:15px/1.5 system-ui';
    const title=document.createElement('strong');title.textContent="We're tracking how far SANKS Research Lab reaches!";title.style.fontSize='19px';
    const info=document.createElement('p');info.textContent='Help us put your city on the map! Sharing your location helps us see where and how often our page gets viewed.';
    const privacy=document.createElement('p');privacy.textContent='Optional. Approximate area only (rounded to 0.1 degrees). Never exact GPS coordinates.';privacy.style.cssText='font-size:12px;opacity:.75';
    const yes=document.createElement('button');yes.type='button';yes.textContent="I'M DOWN WITH THE GET DOWN";yes.style.cssText='background:#b6ff43;color:#08140a;padding:12px;border:0;font-weight:bold;cursor:pointer;margin-right:8px';
    const no=document.createElement('button');no.type='button';no.textContent='I SUCK & WONT SHARE';no.style.cssText='background:transparent;color:white;padding:12px;border:1px solid #668076;cursor:pointer';
    box.append(title,info,privacy,yes,no);document.body.append(box);
    const feedback=document.createElement('p');
    feedback.setAttribute('role','status');
    feedback.setAttribute('aria-live','polite');
    feedback.style.cssText='font-size:13px;min-height:18px;margin:12px 0 0;color:#d9f3d0';
    box.append(feedback);
    // Do not save a choice until permission is declined or a coarse event was accepted.
    const close=choice=>{if(choice)localStorage.setItem('sanks-location-choice',choice);box.remove()};
    const reset=message=>{yes.disabled=false;no.disabled=false;yes.textContent="TRY SHARING AGAIN";feedback.textContent=message};
    no.addEventListener('click',()=>close('declined'));
    yes.addEventListener('click',()=>{
      if(yes.disabled)return;
      yes.disabled=true;
      yes.textContent='LOCATING…';
      feedback.textContent='Waiting for your browser location permission. You may need to approve a phone prompt.';
      try{
        navigator.geolocation.getCurrentPosition(async position=>{
          const lat=Math.round(position.coords.latitude*10)/10,lon=Math.round(position.coords.longitude*10)/10;
          if(!(lat>=24&&lat<=50&&lon>=-125&&lon<=-66)){
            reset('This location is outside our supported US map. Nothing was shared.');return;
          }
          feedback.textContent='Location found. Saving approximate area…';
          const payload=JSON.stringify({kind:'location',sport:'LAB',section:'home',consent:true,lat,lon});
          try{
            // Preserve visitor cookie sequencing; a failed request is not consent success.
            const request=queue.then(()=>fetch('/api/collect',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:payload,signal:AbortSignal.timeout(12000)}));
            queue=request.catch(()=>{});
            const response=await request;
            if(!response.ok)throw Error('Server rejected location');
            feedback.textContent='Approximate area shared. Thank you!';
            close('approved');
          }catch{reset('Could not save your location. Check your connection and try again.')}
        },error=>{
          const message=error.code===1
            ?'Location permission was denied. Enable location for this site in your browser settings, then try again.'
            :error.code===2
              ?'Your phone could not determine its location. Turn on device location services and try again.'
              :'Location timed out. Try again, preferably with location services enabled.';
          reset(message);
        },{enableHighAccuracy:false,timeout:15000,maximumAge:600000});
      }catch{reset('Location access is unavailable in this browser. You can retry or decline.')}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inviteLocation,{once:true});else inviteLocation();
  // Explicit integration API accepts only controlled taxonomy; never pass search text.
  window.sanksTrack=send;
})();
