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
