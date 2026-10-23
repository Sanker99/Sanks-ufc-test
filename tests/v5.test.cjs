const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function harness(){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}}});return elements.get(id)};
  const context=vm.createContext({console,URL,URLSearchParams,AbortSignal,Intl,Date,location:{hash:''},document:{getElementById:element,querySelectorAll:()=>[]},fetch:async()=>{throw Error('Offline test')},setInterval(){},setTimeout,clearTimeout});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const legacy=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInContext(legacy.slice(0,legacy.indexOf("$('refreshAllData').onclick=")),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/v5.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/ncaa.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/weather.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/team-identities.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/lab.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/experience.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/live-scores.js'),'utf8'),context);
  return {context,run:code=>vm.runInContext(code,context),element};
}
test('all inline and external application scripts parse; published JSON is valid',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(code);
  for(const f of ['assets/v5.js','assets/ncaa.js','assets/weather.js','assets/team-identities.js','assets/lab.js','assets/experience.js','assets/live-scores.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'));
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
  assert.equal(run("nflSummary(findAthlete('NFL','00-0033873'),'passing_yards').total"),context.snapshot.players.find(p=>p.id==='00-0033873').games.reduce((n,g)=>n+(g.metrics.passing_yards??0),0));
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
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-streak-events.json')));assert.ok(d.events.length>0);for(const e of d.events){assert.equal(new Set(e.athlete_ids).size,e.athlete_ids.length);assert.ok(e.athlete_ids.every(id=>id.startsWith('ufc:')));assert.ok(e.source_url.startsWith('https://www.espn.com/mma/fightcenter/_/id/'));assert.ok(e.date.includes('T'));}
});

test('NCAA photos use exact IDs across cards, profiles and streaks without cross-name substitutions',()=>{
 const {run,element}=harness();run('athletePhotos='+fs.readFileSync(path.join(root,'data/athlete-photos.json'),'utf8'));run('ncaaData='+fs.readFileSync(path.join(root,'data/ncaa-data.json'),'utf8'));
 assert.ok(run("ncaaData.players.filter(p=>athletePhoto('NCAA',p)).length/ncaaData.players.length")>0.99);
 const unresolved=run("ncaaData.players.filter(p=>!athletePhoto('NCAA',p)).map(p=>p.id)");assert.ok(unresolved.length>0);
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

test('UFC completed history deduplicates fights, excludes future/canceled bouts and preserves unknown metrics',()=>{
 const {run}=harness();run("p={fights:[{date:'2026-09-03',result:'W',fight_url:'same',sig_strikes:70},{date:'2026-09-03',result:'W',fight_url:'same',sig_strikes:70},{date:'2026-09-02',result:'W',sig_strikes:null},{date:'2026-09-01',result:'L',sig_strikes:0},{date:'2099-01-01',result:'W'},{date:'2026-09-04',result:'W',status:'Canceled'}]}");
 assert.equal(run('ufcCompletedFights(p).length'),3);assert.equal(run('ufcCompletedFights(p)[1].sig_strikes'),null);assert.equal(run('ufcCompletedFights(p)[2].sig_strikes'),0);
});
test('UFC numerical streak categories remain separate from finish types and support 3/4/5 fights',()=>{
 const {run}=harness();run("athletePhotos={photos:{'ufc:test':{id:'ufc:test',sport:'UFC',approval:'user_approved',path:'assets/photos/ufc/test.webp'}},by_id:{},by_name:{'UFC:test':'ufc:test'}};ufcData.fighters={one:{name:'Test',fights:Array.from({length:5},(_,i)=>({date:'2026-09-0'+(5-i),opponent:'Opponent '+i,result:'W',method:'KO/TKO',total_strikes:160,sig_strikes:80,takedowns:3,submissions:2,control_seconds:300}))}};");
 for(const min of [3,4,5]){run('opts={category:"ALL",min:'+min+'}');assert.ok(run("ufcStreakRows(opts).some(r=>r.metric==='knockouts'&&r.count===5)"));assert.ok(run("ufcStreakRows(opts).some(r=>r.metric==='submission_attempts'&&r.threshold===2)"));assert.ok(run("!ufcStreakRows(opts).some(r=>r.metric==='submissions')"));assert.ok(run("ufcStreakRows(opts).some(r=>r.metric==='control_seconds'&&r.threshold===300)"));}
 run("ufcData.fighters.one.fights[0].total_strikes=null");assert.ok(run("!ufcStreakRows(opts).some(r=>r.metric==='total_strikes')"));
});

test('UFC flags require an exact fighter and verified official representation',()=>{
 const {run}=harness();run('athletePhotos='+fs.readFileSync(path.join(root,'data/athlete-photos.json'),'utf8'));run('ufcCountries='+fs.readFileSync(path.join(root,'data/ufc-countries.json'),'utf8'));
 const countries=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-countries.json')));assert.ok(countries.coverage>100);
 for(const [id,row] of Object.entries(countries.fighters)){assert.match(row.source_url,/^https:\/\/www\.ufc\.com\/event\//);assert.ok(fs.existsSync(path.join(root,row.flag_path)));}
 assert.equal(run("verifiedUfcFlag({name:'Unknown Person'})"),'');assert.match(run("verifiedUfcFlag({name:'Merab Dvalishvili'})"),/Georgia flag/);
});

test('UFC scheduled format comes from the source format rather than finish round',()=>{
 const {run}=harness();assert.equal(run('ufcScheduledRounds({round:1,scheduled_rounds:5})'),'5 rounds');assert.equal(run('ufcScheduledRounds({round:3})'),'Unknown');
 run("fighter={fights:[{date:'2026-09-01',result:'W',method:'KO/TKO',round:1,scheduled_rounds:3}]} ");assert.match(run('fightHistoryMarkup(fighter)'),/Scheduled: 3 rounds/);
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-data.json')));assert.ok(d.format_coverage.verified_3_or_5_rounds>11000);
 for(const p of Object.values(d.fighters))for(const f of p.fights){if(f.scheduled_rounds){assert.match(f.scheduled_rounds_source,/ufcstats.com\/fight-details\//);assert.match(f.time_format,new RegExp('^'+f.scheduled_rounds+' Rnd'));}}
});

test('UFC control time displays m:ss and never turns missing values into zero',()=>{
 const {run}=harness();assert.equal(run('formatUfcDuration(185)'),'3:05');assert.equal(run('formatUfcDuration(null)'),'Unknown');assert.equal(run('formatUfcDuration(0)'),'0:00');
 run("p={fights:[{date:'2026-09-03',result:'W',control_seconds:120},{date:'2026-09-02',result:'L',control_seconds:180},{date:'2026-09-01',result:'W'}]}");assert.equal(run("recentFightStats(p,'control_seconds')"),'2:30 (2 fights)');assert.match(run('fightHistoryMarkup(p)'),/Control: Unknown/);
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/ufc-data.json')));assert.ok(d.control_coverage.published_control_fighter_bouts>11000);for(const p of Object.values(d.fighters))for(const f of p.fights)if(f.control_seconds!=null){assert.ok(Number.isFinite(f.control_seconds)&&f.control_seconds>=0);assert.match(f.control_source,/ufcstats.com\/fight-details\//);}
});

test('actual UFC source float-form integer counts preserve submission attempts',()=>{
 const {run}=harness();run('actual='+fs.readFileSync(path.join(root,'data/ufc-data.json'),'utf8'));assert.equal(run("actual.fighters.alexandervolkanovski.fights.find(f=>f.fight_url==='http://ufcstats.com/fight-details/b06b43670238c2d8').submissions"),1);
});

test('NFL streaks use final team games, skip byes and break for missing logs or duplicate conflicts',()=>{
 const {run}=harness();run("data={players:[{id:'one',team:'DAL',name:'One',position:'QB',games:[{week:1,team:'DAL',metrics:{passing_yards:250}},{week:3,team:'DAL',metrics:{passing_yards:275}},{week:4,team:'DAL',metrics:{passing_yards:300}}]}],games:[1,3,4].map(week=>({week,date:'2020-01-0'+week,home:'DAL',away:'NYG',home_score:20,away_score:10}))};streakMin=3;streakCategory='QB';streakActive=true");
 assert.ok(run("streakRows().some(r=>r.metric==='passing_yards'&&r.count===3)"));run("data.games.push({week:5,date:'2020-01-05',home:'DAL',away:'NYG',home_score:'',away_score:''})");assert.ok(run('streakRows().length>0'));
 run('data.games.at(-1).home_score=20;data.games.at(-1).away_score=10');assert.equal(run('streakRows().length'),0);run('streakActive=false');assert.ok(run('streakRows().length>0'));
 run("data.players[0].games.push({week:4,team:'DAL',metrics:{passing_yards:0}})");assert.equal(run('streakRows().length'),0);
});
test('Dallas audit through Week 6 retains the verified three-game streak after future refreshes',()=>{
 const {run}=harness();run('data='+fs.readFileSync(path.join(root,'data.json'),'utf8'));run("data.games=data.games.filter(g=>Number(g.week)<=6);data.players.forEach(p=>p.games=p.games.filter(g=>Number(g.week)<=6));streakMin=3;streakCategory='ALL';streakActive=true");assert.ok(run("streakRows().some(r=>r.player.team==='DAL'&&r.player.name==='Dak Prescott'&&r.metric==='passing_yards'&&r.threshold===250)"));
});

test('NFL opponent allowance follows position and metric, includes zero and excludes incomplete final weeks',()=>{
 const {run}=harness();run("data={sources:{stats:{}},games:[{week:10,date:'2099-01-01',home:'AAA',away:'DEF',home_score:'',away_score:''},...[1,2,3].map(week=>({week,date:'2020-01-0'+week,home:'OFF',away:'DEF',home_score:20,away_score:10}))],players:[{id:'wr',position:'WR',games:[{week:1,team:'OFF',opponent:'DEF',metrics:{receiving_yards:50,receptions:5}},{week:2,team:'OFF',opponent:'DEF',metrics:{receiving_yards:0,receptions:0}},{week:3,team:'OFF',opponent:'DEF',metrics:{receiving_yards:null}}]},{id:'te',position:'TE',games:[{week:1,team:'OFF',opponent:'DEF',metrics:{receiving_yards:900,receptions:4}}]}]};p={name:'Player',team:'AAA',position:'WR'};d=defensiveAllowance(p,'receiving_yards')");
 assert.equal(run('d.opponent'),'DEF');assert.equal(run('d.average'),25);assert.equal(run('d.known_games'),2);assert.equal(run('d.weeks[2].total'),null);assert.match(run("defensiveMatchup(p,'receiving_yards')"),/yards \/ game/);
 run("p.position='TE';d=defensiveAllowance(p,'receptions')");assert.equal(run('d.average'),4);assert.equal(run('d.known_games'),1);
 run('data.players.push(data.players[0])');run("p.position='WR'");assert.equal(run("defensiveAllowance(p,'receiving_yards').average"),25);
});

test('NCAA empty profiles distinguish checked absence from unavailable statistics',()=>{
 const {run}=harness();run("p={id:'ncaa:one',name:'One',team_name:'Team',conference:'ACC',position:'QB',games:[]}");assert.equal(run('collegeAvailability(p).label'),'Statistics unavailable');run("p.availability={state:'no_recorded_appearances'}");assert.equal(run('collegeAvailability(p).label'),'No recorded appearances');assert.match(run('collegePlayerCard(p)'),/No recorded appearances/);assert.doesNotMatch(run('collegePlayerCard(p)'),/0 published game logs/);run('p.games=[{metrics:{passing_yards:0}}]');assert.equal(run('collegeAvailability(p).label'),'Recorded appearances');
});

test('average graph uses one numeric coordinate plane and excludes missing values',()=>{
 const {run}=harness();run("logs=[{week:1,metrics:{passing_yards:200}},{week:2,metrics:{passing_yards:null}},{week:3,missing:true,metrics:{passing_yards:0}}]");const html=run("chartHtml(logs,'passing_yards',999)");assert.match(html,/data-average="200"/);assert.match(html,/Unavailable/);assert.doesNotMatch(html,/999/);const line=Number(html.match(/class="average-line"[^>]*y1="([\d.]+)"/)[1]),bar=Number(html.match(/<rect[^>]*y="([\d.]+)"/)[1]);assert.ok(Math.abs(line-bar)<.00001);
});

test('NCAA and UFC failed refreshes retain usable cached data',async()=>{
 const {run}=harness();run("ncaaData.players=[{id:'ncaa:1'}];ncaaReady=true;ufcData.fighters={one:{name:'One',fights:[]}}");assert.equal(await run('loadNcaaData()'),false);assert.equal(run('ncaaReady'),true);assert.equal(run('ncaaData.players.length'),1);assert.equal(await run('loadUfcDataset()'),false);assert.equal(run('Object.keys(ufcData.fighters).length'),1);
});
test('a completed no-contest interrupts a fighter run instead of being skipped',()=>{
 const {run}=harness();run("athletePhotos={photos:{'ufc:one':{id:'ufc:one',sport:'UFC',approval:'user_approved',path:'assets/photos/ufc/one.webp'}},by_id:{},by_name:{'UFC:one':'ufc:one'}};ufcData.fighters={one:{name:'One',fights:[{date:'2026-09-04',result:'W'},{date:'2026-09-03',result:'W'},{date:'2026-09-02',result:'NC'},{date:'2026-09-01',result:'W'}]}}");assert.equal(run('ufcCompletedFights(ufcData.fighters.one).length'),4);assert.equal(run("ufcStreakRows({category:'wins',min:3}).length"),0);
});

test('NFL and NCAA share safe weather formatting, accurate zeroes and indoor/roof distinctions',()=>{
 const {run}=harness();assert.match(run("weatherBadge({status:'indoor'})"),/Indoor/);assert.doesNotMatch(run("weatherBadge({status:'indoor',temperature_f:50})"),/50/);assert.match(run("weatherBadge({status:'kickoff_unknown'})"),/TBA/);assert.match(run("weatherBadge({status:'forecast',temperature_f:0,wind_mph:0,wind_direction_degrees:0,precipitation_probability:0,weather_code:0,roof_kind:'retractable',scope:'exterior_only',fetched_at:new Date().toISOString()})"),/Outside: 0°F/);assert.equal(run('windCompass(315)'),'NW');assert.match(run("weatherBadge({status:'forecast',cached:true})"),/Cached/);
 run("payload={hourly:{time:[1000,4600],temperature_2m:[50,60]},timezone:'UTC'}");assert.equal(run("weatherHour(payload,new Date(2800*1000).toISOString()).temperature_f"),50);assert.equal(run("weatherHour(payload,new Date(9000*1000).toISOString())"),null);
});

test('weather refresh preserves a failed same-location forecast and rejects changed coordinates',async()=>{
 const {run}=harness();run("gameWeather.games.one={venue_key:'v',status:'forecast',kickoff:new Date(Date.now()+86400000).toISOString(),fetched_at:'2020-01-01',temperature_f:55,latitude:1,longitude:2};gameVenues.venues.v={latitude:1,longitude:2,roof_kind:'outdoor'}");await run("refreshVisibleVenue('one')");assert.equal(run('gameWeather.games.one.temperature_f'),55);assert.equal(run('gameWeather.games.one.cached'),true);assert.ok(run("weatherRetryAfter.get('1,2')>Date.now()"));run("weatherRetryAfter.clear();gameVenues.venues.v.latitude=3");await run("refreshVisibleVenue('one')");assert.equal(run('weatherRetryAfter.size'),0);
});

test('a changed stadium invalidates the old forecast even when kickoff is unchanged',()=>{
 const {run}=harness();run("row={schedule_signature:'same',venue:'Actual Stadium',venue_city:'City'}");assert.equal(run("weatherMatches(row,'same','Actual Stadium','City')"),true);assert.equal(run("weatherMatches(row,'same','Different Stadium','City')"),false);assert.equal(run("weatherMatches(row,'same','Actual Stadium','Other city')"),false);assert.equal(run("weatherMatches(row,'later','Actual Stadium','City')"),false);
});

test('every NCAA team filter returns exactly that team subset of the complete roster scan',()=>{
 const {run}=harness();run('ncaaData='+fs.readFileSync(path.join(root,'data/ncaa-data.json'),'utf8'));run("allRows=ncaaStreakRows({...collegeState.streaks,conference:'ALL',team:'ALL',active:true})");assert.equal(run('collegeStreakCoverage().players'),JSON.parse(fs.readFileSync(path.join(root,'data/ncaa-data.json'),'utf8')).players.length);
 for(const t of JSON.parse(fs.readFileSync(path.join(root,'data/ncaa-data.json'))).teams){const expected=run(`allRows.filter(r=>String(r.player.team_id)===${JSON.stringify(String(t.id))}).length`),actual=run(`ncaaStreakRows({...collegeState.streaks,conference:'ALL',team:${JSON.stringify(String(t.id))},active:true}).length`);assert.equal(actual,expected,t.name)}
 assert.ok(run("ncaaStreakRows({...collegeState.streaks,team:'2390'}).length>0"));assert.ok(run("ncaaStreakRows({...collegeState.streaks,team:2390}).length>0"));
});
test('NCAA historical runs remain available after the latest team game breaks an active run',()=>{
 const {run}=harness();run("ncaaData={players:[{id:'one',name:'One',team_id:'1',conference:'ACC',games:[1,2,3,4].map(week=>({game_id:String(week),week,date:'2020-01-0'+week,metrics:{passing_yards:week===4?0:250}}))}],teams:[{id:'1',name:'One',conference:'ACC'}],games:[1,2,3,4].map(week=>({id:String(week),home_id:'1',away_id:'2',completed:true,date:'2020-01-0'+week}))}");assert.equal(run("ncaaStreakRows({...collegeState.streaks,team:'1',active:true}).length"),0);assert.ok(run("ncaaStreakRows({...collegeState.streaks,team:'1',active:false}).some(r=>r.count===3&&!r.active)"));run('ncaaData.players[0].games[1].metrics.passing_yards=null');assert.equal(run("ncaaStreakRows({...collegeState.streaks,team:'1',active:false}).length"),0);
});
test('NFL default week advances to upcoming games after the previous week is completed',()=>{
 const {run}=harness();run("fixture=[{week:'1',date:'2000-01-01',home_score:10,away_score:20},{week:'2',date:'2099-01-01',home_score:'',away_score:''}]");assert.equal(run('currentWeek(fixture)'),2);assert.equal(run('currentWeek(fixture.slice(0,1))'),1);
});
test('full team identities use verified location and nickname fields and preserve multiword mascots',()=>{
 const {run}=harness();assert.equal(run("labTeamName('NFL','PHI')"),'Philadelphia Eagles');assert.match(run("labTeamMarkup('NFL','PHI')"),/<small>Philadelphia<\/small><strong>Eagles<\/strong>/);assert.equal(run("labTeamName('NCAA','2390')"),'Miami Hurricanes');assert.match(run("labTeamMarkup('NCAA','52')"),/Seminoles/);assert.equal(run("labTeamName('NFL','LA')"),'Los Angeles Rams');
});
test('position cards have four distinct green and gray treatments with explicit labels',()=>{
 const {run}=harness();assert.equal(run('new Set(Object.values(LAB_POSITIONS).map(x=>x.color)).size'),4);for(const position of ['QB','RB','WR','TE'])assert.match(run(`labPositionStyle({position:'${position}'})`),new RegExp(`data-position="${position}"`));assert.match(run('labPositionLegend()'),/Quarterback/);assert.match(run('labPositionLegend()'),/Tight end/);
});
test('NFL research controls and chart render as inline player-stage content',()=>{
 const {run}=harness();run('data='+fs.readFileSync(path.join(root,'data.json'),'utf8'));run("p=data.players.find(p=>p.name==='Dak Prescott');metric='passing_yards';threshold=250");const html=run('nflStageResearchMarkup(p)');assert.match(html,/data-lab-stat="passing_yards"/);assert.match(html,/id="labThreshold"/);assert.match(html,/id="labWindow"/);assert.match(html,/average-chart/);assert.match(html,/Opponent defense/);assert.doesNotMatch(html,/closeDetail|toggleResearch|pinned research/);
});


test('every emitted football streak metric opens that exact statistic and threshold',()=>{
 const {context,run}=harness();context.nfl=JSON.parse(fs.readFileSync(path.join(root,'data/data.json')));context.college=JSON.parse(fs.readFileSync(path.join(root,'data/ncaa-data.json')));
 run('data=nfl;ncaaData=college');
 assert.ok(run("streakRows().every(r=>athleteAdapters.NFL.metrics(r.player).includes(r.metric))"));
 assert.ok(run("data.players.filter(p=>p.name==='Ashton Jeanty').every(p=>footballMetrics(p).includes('targets'))"));
 assert.ok(run("ncaaData.players.filter(p=>p.position==='QB').every(p=>collegeMetricOptions(p).includes('rushing_tds'))"));
 assert.ok(run("ncaaStreakRows({...collegeState.streaks,active:false,min:2}).every(r=>collegeMetricOptions(r.player).includes(r.metric))"));
 run("location.hash=profileHash('NFL','exact')+'?stat=targets&threshold=5'");assert.equal(run('parseV5Route().stat'),'targets');assert.equal(run('parseV5Route().threshold'),'5');
 run("metric='unpublished';sample={id:'x',name:'Example',position:'RB',games:[]}");assert.match(run('nflStageResearchMarkup(sample)'),/Statistic unavailable/);
});
test('availability requires a fresh explicit player report; missing and stale reports stay unknown',()=>{
 const {run}=harness();run("p={id:'one'};playerAvailability={leagues:{NFL:{checked_at:new Date().toISOString(),players:{one:{state:'available',label:'Available',reported_at:new Date().toISOString()}}}}}");
 assert.equal(run("availabilityOf('NFL',p).state"),'available');assert.match(run("availabilityBadge('NFL',p)"),/availability-available/);
 run("playerAvailability.leagues.NFL.players.one.state='questionable'");assert.match(run("availabilityBadge('NFL',p)"),/availability-questionable/);
 run("playerAvailability.leagues.NFL.players.one.state='out'");assert.match(run("availabilityBadge('NFL',p)"),/availability-out/);
 assert.equal(run("availabilityOf('NFL',{id:'not-listed'}).state"),'unknown');
 run("playerAvailability.leagues.NFL.checked_at='2020-01-01T00:00:00Z'");assert.equal(run("availabilityOf('NFL',p).state"),'unknown');assert.match(run("availabilityOf('NFL',p).reason"),/no longer current/);
 assert.equal(run("availabilityBadge('UFC',p)"),'');
});
test('streak portraits resolve approved sport-scoped assets for all three sports',()=>{
 const {run}=harness();run('athletePhotos='+fs.readFileSync(path.join(root,'data/athlete-photos.json'),'utf8'));
 for(const sport of ['NFL','NCAA','UFC']){
  run(`p=Object.values(athletePhotos.photos).find(p=>p.sport==='${sport}');p={...p,...p.roster}`);
  assert.match(run(`labStreakPortrait('${sport}',p)`),/assets\/photos\//);
 }
 assert.match(run("labStreakPortrait('NCAA',{id:'ncaa:missing',name:'No Photo'})"),/streak-photo-fallback/);
});
test('NCAA defensive allowance retains zero and excludes incomplete and unloaded opponents',()=>{
 const {run}=harness();run("p={id:'p',team_id:'1',position:'RB'};ncaaData.games=[{id:'next',date:new Date(Date.now()+86400000).toISOString(),home_id:'1',away_id:'2',completed:false},{id:'zero',week:1,date:'2026-01-01',home_id:'2',away_id:'3',completed:true},{id:'missing',week:2,date:'2026-01-08',home_id:'2',away_id:'4',completed:true}];ncaaData.players=[{id:'other',position:'RB',games:[{game_id:'zero',team_id:'3',metrics:{rushing_yards:0}}]}]");
 assert.equal(run("collegeDefensiveAllowance(p,'rushing_yards').average"),0);assert.equal(run("collegeDefensiveAllowance(p,'rushing_yards').known_games"),1);assert.equal(run("collegeDefensiveAllowance(p,'rushing_yards').weeks.length"),2);
});
test('UFC overall records stay distinct from source coverage and checks never leak between athletes',()=>{
 const {run}=harness();run("p={name:'Test Fighter',record:'5-2'};ufcProfileRecords={records:{}};");assert.match(run('ufcRecordMarkup(p)'),/source coverage/);
 run("ufcProfileRecords.records.testfighter={record:'15-3',source_url:'https://www.espn.com/mma/'}");assert.match(run('ufcRecordMarkup(p)'),/15-3/);assert.match(run('ufcRecordMarkup(p)'),/Overall professional/);
 run("statVerification.results=[{sport:'NFL',player_id:'one',week:1,metric:'targets',primary:5,secondary:5,status:'verified',checked_at:new Date().toISOString()}];g={week:1,metrics:{targets:5}}");
 assert.match(run("statCheckMarkup('NFL',{id:'one'},g,'targets')"),/2 sources/);assert.doesNotMatch(run("statCheckMarkup('NFL',{id:'other'},g,'targets')"),/2 sources/);
});

test('football matchup renderers include explicit kickoff times without unsupported helpers',()=>{
 const {run}=harness();assert.match(run("matchupWhen('NCAA',{date:'2026-10-22T20:20:00Z',kickoff_confirmed:false})"),/Time TBD/);assert.match(run("matchupTile({away:'NE',home:'CHI',date:'2026-10-22',time:'20:20',week:7})"),/8:20 PM ET/);assert.match(run("collegeMatchupTile({id:'7',home_id:'1',away_id:'2',home_name:'Home',away_name:'Away',date:'2026-10-22T20:20:00Z',week:7,conferences:['SEC']})"),/Week 7/);
});


test('news is the starting route and all three sports publish ten linked article headlines',()=>{
 const {run}=harness();assert.equal(run("location.hash='';parseV5Route().view"),'news');run('labExperience='+fs.readFileSync(path.join(root,'data/lab-experience.json'),'utf8'));const d=JSON.parse(fs.readFileSync(path.join(root,'data/lab-experience.json')));
 for(const sport of ['NFL','NCAA','UFC']){assert.ok(d.news[sport].articles.length>=5&&d.news[sport].articles.length<=10);assert.ok(d.news[sport].articles.every(a=>a.url.startsWith('https://')&&a.url.includes('/story/')))}
 assert.match(run('newsDeskMarkup()'),/TOP HEADLINES/);assert.equal((run('newsDeskMarkup()').match(/target="_blank"/g)||[]).length,Object.values(d.news).reduce((n,f)=>n+f.articles.length,0));
});
test('all scoped football teams have exact sourced helmet photos with verified bytes',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/lab-experience.json'))),college=JSON.parse(fs.readFileSync(path.join(root,'data/ncaa-data.json'))),nfl=JSON.parse(fs.readFileSync(path.join(root,'data/data.json')));
 for(const t of college.teams)assert.ok(d.helmets['NCAA:'+t.id],t.name);
 for(const key of new Set(nfl.games.flatMap(g=>[g.home,g.away])))assert.ok(d.helmets['NFL:'+key],key);
 const crypto=require('node:crypto');for(const entry of Object.values(d.helmets)){assert.ok(entry.source_url.startsWith('https://www.helmethistory.com/'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,entry.path))).digest('hex'),entry.sha256)}
});
test('matchups group by date, sort within the day, and preserve true zero-score records',()=>{
 const {run}=harness();run("data.games=[{date:'2020-01-01',time:'13:00',week:1,home:'AAA',away:'BBB',home_score:0,away_score:7},{date:'2020-01-08',time:'13:00',week:2,home:'AAA',away:'BBB',home_score:0,away_score:0}]");assert.equal(run("teamSeasonRecord('NFL','AAA')"),'0-1-1');
 run("fixtures=[{id:'late',date:'2026-10-25',time:'20:00'},{id:'early',date:'2026-10-25',time:'13:00'},{id:'thursday',date:'2026-10-22',time:'20:00'}]");const html=run("footballDateSections('NFL',fixtures,g=>g.id)");assert.ok(html.indexOf('thursday')<html.indexOf('early'));assert.ok(html.indexOf('early')<html.indexOf('late'));assert.match(html,/Thursday/);assert.match(html,/Sunday/);
});
test('graphs preserve numeric zero, label confirmed injury, and never derive a mean from missing logs',()=>{
 const {run}=harness();const html=run("averageChartMarkup([{week:1,metrics:{targets:0}},{week:2,metrics:{targets:10}},{week:3,missing:true,dnp:true,metrics:{targets:0}}],'targets',999)");assert.match(html,/data-average="5"/);assert.match(html,/Injury/);assert.doesNotMatch(html,/999/);
 run("p={id:'p',team_id:'1',games:[{game_id:'a',week:1,metrics:{targets:0}}]};ncaaData.games=[{id:'a',home_id:'1',away_id:'2',completed:true,date:'2026-09-01',week:1},{id:'b',home_id:'1',away_id:'2',completed:true,date:'2026-09-08',week:2}]");assert.equal(run("collegeChartLogs(p,'targets').length"),2);assert.equal(run("collegeChartLogs(p,'targets')[1].missing"),true);
});
test('explicit Ready, questionable, OUT and long-term skull labels remain source backed',()=>{
 const {run}=harness();assert.equal(run("availabilityDisplay({state:'available'}).label"),'Ready');assert.equal(run("availabilityDisplay({state:'questionable'}).label"),'Questionable');assert.equal(run("availabilityDisplay({state:'out',reported_status:'Injured Reserve'}).label"),'IR');assert.equal(run("availabilityDisplay({state:'out',reported_status:'Out for Season'}).skull"),true);assert.equal(run("availabilityDisplay({state:'unknown',reported_status:'Injured Reserve'}).skull"),false);
});
test('UFC numeric comparisons respect reach, duration, missing values and neutral ties',()=>{
 const {run}=harness();const html=run("ufcComparisonRow(['Reach','71\"','72\"'])");assert.match(html,/<strong[^>]*class="stat-lower">71/);assert.match(html,/<strong[^>]*class="stat-better">72/);assert.equal(run("comparisonNumber('5:46 (5 fights)')"),346);assert.equal(run('comparisonNumber(null)'),null);assert.doesNotMatch(run("ufcComparisonRow(['Takedowns · recent per-fight avg','2.0 (5 fights)','2.0 (5 fights)'])"),/class="stat-(?:better|lower)"/);
});
test('a headliner is selected by exact title-name membership rather than arbitrary bout order',()=>{
 const {run}=harness();run("event={name:'UFC Test: Alpha vs. Beta',competitions:[{id:'other',competitors:[{athlete:{displayName:'One Gamma'}},{athlete:{displayName:'Two Delta'}}]},{id:'main',competitors:[{athlete:{displayName:'One Alpha'}},{athlete:{displayName:'Two Beta'}}]}]}");assert.equal(run('ufcMainEvent(event).id'),'main');run("event.name='UFC 999'");assert.equal(run('ufcMainEvent(event)'),null);
});

test('missing current injury reports produce no badge, label or large panel',()=>{const {run}=harness();run("p={id:'not-reported',name:'No Report'};playerAvailability={leagues:{}};");assert.equal(run("availabilityBadge('NFL',p)"),'');assert.equal(run("availabilityLabel('NFL',p)"),'');assert.equal(run("availabilityPanel('NFL',p)"),'');assert.equal(run("availabilityOf('NFL',p).state"),'unknown')});
test('fictional guest is search only and absent from the real NFL directory',()=>{const {run}=harness();assert.ok(run("athleteResults('Tits McGee').some(p=>p.key==='__easter__')"));assert.equal(run("athleteResults('').length"),0);assert.doesNotMatch(run("playerListing([],'Players','PLAYER DIRECTORY')"),/Tits McGee|__easter__/);assert.equal(run("findAthlete('NFL','__easter__')"),null)});

test('live dates use Eastern boundaries, validate dates and round-trip the score route',()=>{const {run}=harness();assert.equal(run("liveDay('2026-10-18T02:00:00Z')"),'2026-10-17');assert.equal(run("liveValidDay('2026-02-30')"),false);assert.equal(run("liveShiftDay('2026-12-31',1)"),'2027-01-01');assert.equal(run("location.hash='#/scores?date=2026-10-17';parseV5Route().view"),'scores');assert.equal(run('liveRequestedDay()'),'2026-10-17')});
test('live NCAA requests all five conferences rather than the truncated national board',()=>{const {run}=harness();assert.equal(run("liveRequests(['NCAA'],'2026-10-17').length"),5);assert.equal(run("new Set(liveRequests(['NCAA'],'2026-10-17').map(r=>r.group)).size"),5);assert.match(run("liveRequests(['UFC'],'2026-10-17')[0].url"),/20261016-20261018/)});
test('conference score feeds deduplicate shared games and exclude out-of-scope teams',()=>{const {run}=harness();run("ncaaData.teams=[{id:'1'}];evt=(id,a,b)=>({id,date:'2026-10-17T18:00Z',competitions:[{competitors:[{id:a},{id:b}]}]});liveRequests(['NCAA'],'2026-10-17').forEach(r=>liveAcceptBucket(r,{payload:{events:[evt('one','1','2'),evt('other','3','4')]}}))");assert.equal(run("liveEvents('NCAA','2026-10-17').length"),1);assert.equal(run("liveEvents('NCAA','2026-10-17')[0].id"),'one')});
test('failed score checks preserve last good scores and do not leak between dates',()=>{const {run}=harness();run("req=liveRequests(['NFL'],'2026-10-17')[0];liveAcceptBucket(req,{payload:{events:[{id:'one',date:'2026-10-17T18:00Z',competitions:[]}]}});liveFailBucket(req,Error('Offline'))");assert.equal(run("liveEvents('NFL','2026-10-17').length"),1);assert.equal(run("liveEvents('NFL','2026-10-18').length"),0);assert.equal(run("liveFeedHealth('NFL','2026-10-17').errors"),1);assert.throws(()=>run("liveAcceptBucket(req,{payload:{wrong:[]}})"));assert.equal(run("liveEvents('NFL','2026-10-17').length"),1)});
test('football scores preserve 0-0 and do not show a fabricated pregame score',()=>{const {run}=harness();assert.equal(run("liveScoreValue({score:'0'},{status:{type:{state:'in'}}})"),'0');assert.equal(run("liveScoreValue({score:'0'},{status:{type:{state:'pre'}}})"),'—');assert.equal(run("liveScoreValue({},{status:{type:{state:'post'}}})"),'—')});
test('UFC winners require final status and one explicit winner; methods are never inferred from a lead',()=>{const {run}=harness();run("event={id:'100',date:'2026-10-17T22:00Z'};bout={id:'200',status:{period:2,displayClock:'2:32',type:{state:'in',completed:false}},competitors:[{id:'one',winner:true},{id:'two',winner:false}]}");assert.equal(run('liveUfcOutcome(event,bout).winner'),null);run("bout.status.type={state:'post',completed:true};liveScores.results.set('100:200',{checked:Date.now(),data:{period:2,displayClock:'2:32',type:{state:'post',completed:true},result:{displayName:'KO/TKO'}}})");assert.equal(run('liveUfcOutcome(event,bout).winner'),'one');assert.equal(run('liveUfcOutcome(event,bout).method'),'KO/TKO');run("bout.competitors[1].winner=true");assert.equal(run('liveUfcOutcome(event,bout).winner'),null);run("bout.status.type.name='STATUS_CANCELED'");assert.equal(run('liveUfcOutcome(event,bout).complete'),false)});
test('UFC reported round clock remains exact and missing round/time is labeled',()=>{const {run}=harness();run("event={id:'100'};bout={id:'200',status:{period:1,displayClock:'0:00',type:{state:'in'}},competitors:[{id:'1',athlete:{displayName:'One'}},{id:'2',athlete:{displayName:'Two'}}]}");assert.match(run('liveUfcBoutMarkup(event,bout)'),/ROUND 1/);assert.match(run('liveUfcBoutMarkup(event,bout)'),/0:00/);assert.match(run('liveUfcBoutMarkup(event,bout)'),/Reported clock/);run('bout.status.period=0;delete bout.status.displayClock');assert.match(run('liveUfcBoutMarkup(event,bout)'),/Round pending/);assert.match(run('liveUfcBoutMarkup(event,bout)'),/Clock pending/)});
test('UFC uses sourced card segments and match numbers from main event down',()=>{const {run}=harness();run("event={id:'100',competitions:[{id:'a'},{id:'b'},{id:'c'}]};[['a','Main Card',2],['b','Early Prelims',12],['c','Main Card',1]].forEach(([id,description,matchNumber])=>liveScores.metadata.set('100:'+id,{data:{cardSegment:{description},matchNumber}}))");assert.equal(run("liveUfcGroups(event).map(g=>g.group).join('|')"),'Main Card|Early Prelims');assert.equal(run("liveUfcGroups(event)[0].bouts.map(b=>b.id).join('|')"),'c|a')});
test('UFC final bouts with no winner never award a check to a draw or no contest',()=>{const {run}=harness();run("event={id:'100'};bout={id:'200',status:{type:{state:'post',completed:true}},competitors:[{id:'1',athlete:{displayName:'One'}},{id:'2',athlete:{displayName:'Two'}}]}");assert.equal(run('liveUfcOutcome(event,bout).winner'),null);assert.doesNotMatch(run('liveUfcBoutMarkup(event,bout)'),/aria-label="Winner"/);assert.match(run('liveUfcBoutMarkup(event,bout)'),/Result pending/)});
test('live score checks update without a route/page refresh and pause in hidden tabs',async()=>{const {context,run}=harness();let calls=0;context.fetch=async()=>{calls++;return {ok:true,headers:{get:()=>null},json:async()=>({events:[]})}};run("location.hash='#/scores?date=2026-10-17';document.visibilityState='hidden';liveUpdateHosts=()=>{};");await run('refreshLiveScores(true)');assert.equal(calls,0);run("document.visibilityState='visible'");await run('refreshLiveScores(true)');assert.equal(calls,7);assert.equal(run('liveScores.buckets.size'),7);assert.equal(run('liveScores.busy'),false)});

test('slow UFC enrichment does not stall the fifteen-second scoreboard poll',async()=>{const {context,run}=harness();let scoreCalls=0,coreCalls=0,release;context.fetch=async url=>{if(String(url).includes('sports.core.api')){coreCalls++;return new Promise(resolve=>{release=resolve})}scoreCalls++;return {ok:true,headers:{get:()=>null},json:async()=>({events:String(url).includes('mma/ufc')?[{id:'100',date:'2026-10-17T20:00Z',competitions:[{id:'200',status:{type:{state:'pre'}}}]}]:[]})}};run("location.hash='#/scores?date=2026-10-17';document.visibilityState='visible';liveUpdateHosts=()=>{}");await run('refreshLiveScores(true)');assert.equal(run('liveScores.busy'),false);assert.equal(run('liveScores.enrichBusy'),true);await run('refreshLiveScores(true)');assert.equal(scoreCalls,14);assert.equal(coreCalls,1);release({ok:true,headers:{get:()=>null},json:async()=>({id:'200'})});await new Promise(resolve=>setImmediate(resolve));assert.equal(run('liveScores.enrichBusy'),false)});

test('UFC fight center starts with prelims, survives midnight, and labels failed feeds',()=>{const {run}=harness();run("date=liveDay();request=liveRequests(['UFC'],date)[0];event={id:'100',name:'Source Card',date:liveShiftDay(date,-1)+'T22:00:00-04:00',status:{type:{state:'pre',completed:false}},competitions:[{id:'200',status:{type:{state:'post',completed:true}},competitors:[]},{id:'201',status:{type:{state:'pre'}},competitors:[]}]};liveAcceptBucket(request,{payload:{events:[event]}})");assert.equal(run("liveEvents('UFC',date).length"),1);assert.match(run('liveUfcNowMarkup()'),/TONIGHT’S FIGHT CENTER/);run("event.status.type={state:'post',completed:true};event.competitions[1].status.type={state:'post',completed:true};liveFailBucket(request,Error('Offline'))");assert.match(run('liveUfcNowMarkup()'),/not currently confirmed/);assert.doesNotMatch(run('liveUfcNowMarkup()'),/No UFC card is currently underway/)});

test('an unavailable empty feed is not presented as proof that no games exist',()=>{const {run}=harness();run("date='2026-10-17';request=liveRequests(['NFL'],date)[0];liveFailBucket(request,Error('Unavailable'))");assert.match(run("liveLeagueMarkup('NFL',date)"),/temporarily unavailable/);assert.doesNotMatch(run("liveLeagueMarkup('NFL',date)"),/No NFL games/)});
