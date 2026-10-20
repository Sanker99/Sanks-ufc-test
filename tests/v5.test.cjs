const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function harness(){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}}});return elements.get(id)};
  const context=vm.createContext({console,URL,URLSearchParams,AbortSignal,Intl,Date,location:{hash:''},document:{getElementById:element},fetch:async()=>{throw Error('Offline test')},setInterval(){},setTimeout,clearTimeout});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const legacy=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInContext(legacy.slice(0,legacy.indexOf("$('refreshAllData').onclick=")),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/v5.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/ncaa.js'),'utf8'),context);
  return {context,run:code=>vm.runInContext(code,context),element};
}
test('all inline and external application scripts parse; published JSON is valid',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(code);
  new vm.Script(fs.readFileSync(path.join(root,'assets/v5.js'),'utf8'));
  for(const file of ['data.json','injuries.json','data/ufc-data.json','data/ufc-cards.json','data/athlete-content.json'])JSON.parse(fs.readFileSync(path.join(root,file)));
});
test('profile and comparison links round trip encoded identities; unknown sports are unavailable',()=>{
  const {run}=harness();
  assert.equal(run("location.hash=profileHash('NFL','00-0033873','00-0034857');parseV5Route().compare"),'00-0034857');
  assert.equal(run("location.hash=profileHash('UFC','name/with space');parseV5Route().key"),'name/with space');
  assert.equal(run("findAthlete('NCAA','unpublished')"),null);
  assert.equal(run("location.hash='#/athlete/%ZZ';parseV5Route().view"),'error');
});
test('NFL comparison excludes missing values while preserving genuine zeroes',()=>{
  const {run}=harness();
  run("sample={name:'Example',position:'QB',games:[{metrics:{passing_yards:100}},{metrics:{passing_yards:null}},{metrics:{passing_yards:0}},{metrics:{}},{metrics:{passing_yards:''}}]}");
  assert.equal(run("nflSummary(sample,'passing_yards').count"),2);
  assert.equal(run("nflSummary(sample,'passing_yards').average"),50);
  assert.equal(run("nflSummary(sample,'interceptions').average"),null);
});
test('real snapshot identities resolve and NFL totals match recorded game logs',()=>{
  const {context,run}=harness();context.snapshot=JSON.parse(fs.readFileSync(path.join(root,'data.json')));context.ufcSnapshot=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-data.json')));
  run('data=snapshot;ufcData=ufcSnapshot');
  assert.equal(run("findAthlete('NFL','00-0033873').name"),'Patrick Mahomes');
  assert.equal(run("nflSummary(findAthlete('NFL','00-0033873'),'passing_yards').total"),1037);
  assert.equal(run("findAthlete('UFC','alexpereira').name"),'Alex Pereira');
  assert.equal(run("ufcRecentResults(findAthlete('UFC','alexpereira')).length"),5);
});
test('UFC recent averages use only last five results and report per-metric coverage',()=>{
  const {run}=harness();
  run("fighter={fights:[{date:'2026-10-10',result:'W',sig_strikes:0},{date:'2026-10-09',result:'L',sig_strikes:10},{date:'2026-10-08',result:'W'},{date:'2026-10-07',result:'W',sig_strikes:null},{date:'2026-10-06',result:'W',sig_strikes:20},{date:'2026-10-05',result:'W',sig_strikes:999}]}");
  assert.equal(run("recentFightStats(fighter,'sig_strikes')"),'10.0 (3 fights)');
  assert.equal(run("recentFightStats(fighter,'submissions')"),'Unavailable');
});
test('news requires exact full-name boundaries, recent publication and a safe source link',()=>{
  const {context,run}=harness();const published=new Date(Date.now()-86400000).toISOString();
  context.articles=[{headline:'Ann Smith wins',published,url:'https://example.com/story'}, {headline:'Joann Smith wins',published,url:'https://example.com/wrong'}, {headline:'Ann Smith wins',published:'2001-01-01',url:'https://example.com/old'}, {headline:'Ann Smith wins',published,url:'javascript:alert(1)'}];
  assert.equal(run("matchingNews(articles,'Ann Smith').length"),1);
  assert.equal(run("matchingNews(articles,'Ann Smith')[0].url"),'https://example.com/story');
});
test('news failures are retryable; pending requests are cached without cross-athlete results',async()=>{
  const {context,run}=harness();let calls=0;
  context.fetch=async()=>{calls++;if(calls===1)throw Error('Unavailable');return {ok:true,json:async()=>({articles:[]})}};
  await assert.rejects(run("sportNews('NFL')"));
  await run("Promise.all([sportNews('NFL'),sportNews('NFL')])");
  assert.equal(calls,2);
});
test('published NFL fallback handles absent data-directory files',async()=>{
  const {context,run}=harness();const requests=[];
  context.fetch=async url=>{requests.push(url);return {ok:url==='fallback',status:404,json:async()=>({players:[]})}};
  await run("publishedJson('primary','fallback')");assert.deepEqual(requests,['primary','fallback']);
});
test('dates use padded MM/DD/YYYY and invalid dates remain unavailable',()=>{
  const {run}=harness();assert.equal(run("displayDate('2026-01-02')"),'01/02/2026');assert.equal(run("displayDate(null)"),'Unavailable');assert.equal(run("displayDate('bad date')"),'Unavailable');
  assert.equal(run("displayDate('2026-99-99')"),'Unavailable');assert.equal(run("displayDate('2026-02-30')"),'Unavailable');
});
test('unchanged background NFL refresh does not destroy a comparison selector',async()=>{
  const {context,run}=harness();let renders=0;context.render=()=>{renders++};
  context.fetch=async()=>({ok:true,json:async()=>({players:[],games:[],sources:{}})});
  await run('refresh()');assert.equal(renders,0);
  await run('refresh(true)');assert.equal(renders,1);
});
test('unlicensed or unsafe photographs never create image elements',()=>{
  const {run}=harness();run("p={id:'1',name:'Test Athlete'};v5.content.athletes['NFL:1']={photo:{url:'https://example.com/image.jpg'}}");
  assert.doesNotMatch(run("portraitMarkup('NFL',p)"),/<img/);
  run("v5.content.athletes['NFL:1'].photo={url:'javascript:alert(1)',license_url:'https://example.com/license',attribution:'Author'}");assert.doesNotMatch(run("portraitMarkup('NFL',p)"),/<img/);
  run("v5.content.athletes['NFL:1'].photo.url='https://example.com/image.jpg'");assert.match(run("portraitMarkup('NFL',p)"),/<img/);
});
test('confirmed injury absence remains excluded from historical rates',()=>{
  const {run}=harness();run("data.games=[{week:1,home:'AAA',away:'BBB',home_score:1,away_score:2,date:'2020-01-01'}];injuryData.players={id:{weekly:{1:{status:'Out'}}}};p={id:'id',team:'AAA',games:[]}");
  assert.equal(run('injuryGameLogs(p)[0].dnp'),true);assert.equal(run('injuryGameLogs(p)[0].missing'),true);
  run("injuryData.players.id.weekly[1].status='Questionable'");assert.equal(run('injuryGameLogs(p)[0].dnp'),false);
});

test('all 3350 approved photos have local assets and retain stable athlete identity',()=>{
 const {run}=harness();const registry=JSON.parse(fs.readFileSync(path.join(root,'data/athlete-photos.json')));
 run('athletePhotos='+JSON.stringify(registry));
 assert.equal(Object.keys(registry.photos).length,3350);
 for(const [id,p] of Object.entries(registry.photos)){
  assert.ok(fs.existsSync(path.join(root,p.path)),p.path);
  assert.equal(p.approval,'user_approved');
  assert.equal(run(`athletePhoto(${JSON.stringify(p.sport)},{id:${JSON.stringify(id)},name:${JSON.stringify(p.name)}})?.id`),id);
 }
 assert.equal(run("athletePhoto('NFL',{id:'00-0036389',name:'Jalen Hurts'}).id"),'nfl:jalen-hurts');
 assert.equal(run("athletePhoto('UFC',{name:'Jan Blachowicz'}).id"),'ufc:jan-blachowicz');
 assert.equal(run("athletePhoto('UFC',{name:'Jalen Hurts'})"),null);
 assert.equal(run("sanksArt('NFL','Unknown Player')"),null);
 assert.doesNotMatch(run("sanksArtMarkup('NFL',{name:'Jalen Hurts'})"),/Illustration/);
});
test('every approved roster athlete is searchable and has a profile without fabricated statistics',()=>{
 const {run}=harness();run('athletePhotos='+fs.readFileSync(path.join(root,'data/athlete-photos.json'),'utf8'));
 run('data='+fs.readFileSync(path.join(root,'data.json'),'utf8'));
 run('ufcData='+fs.readFileSync(path.join(root,'data/ufc-data.json'),'utf8'));
 run('mergeApprovedPhotoRoster()');
 assert.equal(run("new Set(data.players.map(p=>athletePhoto('NFL',p)?.id).filter(Boolean)).size"),767);
 assert.equal(run("new Set(Object.values(ufcData.fighters).map(p=>athletePhoto('UFC',p)?.id).filter(Boolean)).size"),277);
 const count=run('data.players.length');run('mergeApprovedPhotoRoster()');assert.equal(run('data.players.length'),count);
 assert.ok(run('data.players.filter(p=>p.photo_only).every(p=>p.games.length===0)'));
 assert.ok(run("athleteResults('Joseph Kropschot').some(p=>p.sport==='UFC')"));
 assert.ok(run("athleteResults('Josh Kattus').some(p=>p.sport==='NFL')"));
 const before=run("sanksArt('NFL','Jalen Hurts')");run("athletePhotos.photos['nfl:jalen-hurts'].path='https://example.com/wrong.webp'");assert.equal(run("sanksArt('NFL','Jalen Hurts')"),null);
});

test('NCAA snapshot is restricted to the five conferences and all logs join to final scoped games',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/ncaa-data.json'))),teams=new Map(d.teams.map(t=>[t.id,t])),games=new Map(d.games.map(g=>[g.id,g]));
 assert.deepEqual(d.conferences,['ACC','Big 12','B1G','PAC-12','SEC']);assert.equal(d.teams.length,75);assert.equal(new Set(d.players.map(p=>p.id)).size,d.players.length);
 assert.equal(d.coverage.boxscores_loaded,d.coverage.completed_games);assert.deepEqual(d.coverage.issues,[]);
 for(const p of d.players){assert.match(p.id,/^ncaa:\d+$/);assert.ok(teams.has(p.team_id));assert.equal(p.conference,teams.get(p.team_id).conference);assert.ok(['QB','RB','WR','TE'].includes(p.position));
  const seen=new Set();for(const log of p.games){const g=games.get(log.game_id);assert.ok(g?.completed);assert.ok([g.home_id,g.away_id].includes(p.team_id));assert.ok(!seen.has(log.game_id));seen.add(log.game_id);for(const v of Object.values(log.metrics))assert.ok(v===null||Number.isFinite(v));}}
 for(const g of d.games)assert.ok(teams.has(g.home_id)||teams.has(g.away_id));
});
test('NCAA runs follow consecutive completed TEAM games, survive byes, and break on missing/unknown/zero values',()=>{
 const {run}=harness();run(`ncaaData={teams:[],players:[{id:'ncaa:1',name:'Test QB',position:'QB',conference:'ACC',team_id:'1',games:[{game_id:'a',metrics:{passing_yards:250}},{game_id:'b',metrics:{passing_yards:250}},{game_id:'c',metrics:{passing_yards:250}}]}],games:[{id:'a',home_id:'1',away_id:'2',date:'2026-09-01',completed:true},{id:'b',home_id:'1',away_id:'2',date:'2026-09-15',completed:true},{id:'c',home_id:'1',away_id:'2',date:'2026-09-22',completed:true},{id:'d',home_id:'1',away_id:'2',date:'2026-12-01',completed:false}]};opt={conference:'ALL',team:'ALL',category:'QB',min:3}`);
 assert.equal(run("ncaaStreakRows(opt).find(r=>r.metric==='passing_yards'&&r.threshold===250).count"),3);
 run("ncaaData.players[0].games[1].metrics.passing_yards=null");assert.equal(run('ncaaStreakRows(opt).length'),0);
 run("ncaaData.players[0].games[1].metrics.passing_yards=0");assert.equal(run('ncaaStreakRows(opt).length'),0);
 run("ncaaData.players[0].games[1].metrics.passing_yards=250;ncaaData.games[3].completed=true");assert.equal(run('ncaaStreakRows(opt).length'),0);
 run("ncaaData.games[3].completed=false;opt.conference='SEC'");assert.equal(run('ncaaStreakRows(opt).length'),0);
 run("opt.conference='ACC';opt.team='99'");assert.equal(run('ncaaStreakRows(opt).length'),0);
});
test('NCAA summaries preserve zeroes, omit missing values, and route without NFL identity collisions',()=>{
 const {run}=harness();run("ncaaData.players=[{id:'ncaa:123',name:'Shared Name',team:'ABC',team_name:'Test School',conference:'ACC',position:'QB',games:[{metrics:{passing_yards:0}},{metrics:{passing_yards:null}},{metrics:{}}]}]");
 assert.equal(run("collegeMetricSummary(ncaaData.players[0],'passing_yards').count"),1);assert.equal(run("collegeMetricSummary(ncaaData.players[0],'passing_yards').average"),0);
 assert.ok(run("athleteResults('Shared Name').some(p=>p.sport==='NCAA'&&p.key==='ncaa:123')"));
 assert.equal(run("location.hash=collegeProfileLink(ncaaData.players[0],'passing_yards',200);extendedRoute().sport"),'NCAA');assert.equal(run('extendedRoute().key'),'ncaa:123');assert.equal(run('extendedRoute().threshold'),'200');
 assert.equal(run("location.hash='#/ncaa';parseV5Route().view"),'ncaa');
 assert.match(run("leagueToolbar('streaks','NCAA')"),/NFL Streaks/);assert.match(run("leagueToolbar('streaks','NCAA')"),/UFC Streaks/);
});
test('UFC streaks use full latest fight sequence and unknown statistics or no contests interrupt a run',()=>{
 const {run}=harness();run("athletePhotos={photos:{'ufc:test':{id:'ufc:test',approval:'user_approved',sport:'UFC',path:'assets/photos/ufc/test.webp'}},by_id:{},by_name:{'UFC:testfighter':'ufc:test'}};ufcData.fighters={test:{name:'Test Fighter',fights:[{date:'2026-09-01',result:'W',method:'KO/TKO',sig_strikes:70},{date:'2026-08-01',result:'W',method:'Submission',sig_strikes:null},{date:'2026-07-01',result:'NC',method:'No Contest',sig_strikes:80}]}};opts={min:2,category:'ALL'}");
 assert.equal(run("ufcStreakRows(opts).find(r=>r.metric==='wins').count"),2);assert.equal(run("ufcStreakRows(opts).find(r=>r.metric==='finishes').count"),2);assert.ok(run("!ufcStreakRows(opts).some(r=>r.metric==='sig_strikes')"));
 run("opts.min=3");assert.equal(run('ufcStreakRows(opts).length'),0);
});

test('UFC event filter only includes fighters booked on the selected official event',()=>{
 const {run}=harness();run("athletePhotos={photos:{'ufc:test':{id:'ufc:test',approval:'user_approved',sport:'UFC',path:'assets/photos/ufc/test.webp'}},by_id:{},by_name:{'UFC:testfighter':'ufc:test'}};ufcData.fighters={test:{name:'Test Fighter',fights:[{date:'2026-09-01',result:'W',method:'KO/TKO'},{date:'2026-08-01',result:'W',method:'Submission'}]}};ufcStreakEvents={events:[{id:'booked',athlete_ids:['ufc:test']},{id:'other',athlete_ids:['ufc:someone-else']}]};opts={min:2,category:'wins',event:'booked'}");
 assert.equal(run('ufcStreakRows(opts).length'),1);run("opts.event='other'");assert.equal(run('ufcStreakRows(opts).length'),0);run("opts.event='unknown'");assert.equal(run('ufcStreakRows(opts).length'),0);run("opts.event='ALL'");assert.equal(run('ufcStreakRows(opts).length'),1);
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-streak-events.json')));assert.ok(d.events.length>0);for(const e of d.events){assert.equal(new Set(e.athlete_ids).size,e.athlete_ids.length);assert.ok(e.athlete_ids.every(id=>id.startsWith('ufc:')));assert.ok(e.source_url.startsWith('https://www.ufc.com/event/'));}
});

test('NCAA photos use exact IDs across cards, profiles and streaks without cross-name substitutions',()=>{
 const {run,element}=harness();run('athletePhotos='+fs.readFileSync(path.join(root,'data/athlete-photos.json'),'utf8'));run('ncaaData='+fs.readFileSync(path.join(root,'data/ncaa-data.json'),'utf8'));
 assert.equal(run("ncaaData.players.filter(p=>athletePhoto('NCAA',p)).length"),2306);
 const unresolved=run("ncaaData.players.filter(p=>!athletePhoto('NCAA',p)).map(p=>p.id)");assert.equal(unresolved.length,6);
 run("sample=ncaaData.players.find(p=>athletePhoto('NCAA',p))");const id=run('sample.id');
 assert.equal(run("athletePhoto('NCAA',sample).id"),id);
 assert.equal(run("athletePhoto('NCAA',{name:sample.name,id:'ncaa:unknown'})"),null);
 assert.equal(run("athletePhoto('NFL',sample)"),null);
 assert.match(run('collegePlayerCard(sample)'),/assets\/photos\/ncaa\//);
 assert.match(run('collegeStreakCard(sample,[])'),/assets\/photos\/ncaa\//);
 run("renderCollegeProfile({key:sample.id})");assert.match(element('listing').innerHTML,/assets\/photos\/ncaa\//);
 run("missing=ncaaData.players.find(p=>!athletePhoto('NCAA',p));renderCollegeProfile({key:missing.id})");assert.match(element('listing').innerHTML,/athlete-placeholder/);
 assert.doesNotMatch(element('listing').innerHTML,/assets\/photos\/ncaa\//);
 run('mergeApprovedPhotoRoster()');assert.ok(run("Object.values(ufcData.fighters).every(p=>!p.id?.startsWith('ncaa:'))"));assert.equal(run("Object.values(ufcData.fighters).filter(p=>athletePhoto('UFC',p)).length"),277);
});

test('UFC groups six categories and multiple thresholds into one stable fighter card',()=>{
 const {run}=harness();run("athletePhotos={photos:{'ufc:one':{id:'ufc:one',sport:'UFC',approval:'user_approved',path:'assets/photos/ufc/one.webp'}},by_id:{},by_name:{'UFC:one':'ufc:one'}};p={name:'One'};rows=['wins','finishes','submissions','sig_strikes','takedowns','total_strikes'].map(metric=>({player:p,metric,label:metric,count:4,threshold:50,latest:'2026-10-01'}));rows.push({...rows[3],threshold:25,count:5});groups=groupedUfcStreaks(rows)");
 assert.equal(run('groups.length'),1);const html=run('ufcStreakCard(groups[0])');assert.equal((html.match(/data-ufc-photo-id=/g)||[]).length,1);assert.equal((html.match(/data-ufc-category=/g)||[]).length,6);assert.match(html,/50\+/);assert.match(html,/25\+ \(5\)/);
});
