const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=JSON.parse(read('data/athlete-images.json'));
function app(){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []}});return nodes.get(id)};
  const context=vm.createContext({URL,URLSearchParams,AbortSignal,Intl,Date,location:{hash:''},document:{baseURI:'http://localhost/',getElementById:node,body:{classList:{add(){},remove(){},toggle(){}}}},console,setTimeout,clearTimeout,fetch:async()=>{throw Error('Offline fixture')}});
  const legacy=[...read('index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInContext(legacy.slice(0,legacy.indexOf("$('refreshAllData').onclick=")),context);
  vm.runInContext(read('assets/v5.js'),context);vm.runInContext(read('assets/v6-prototype.js'),context);
  context.registry=structuredClone(registry);context.nfl=JSON.parse(read('data.json'));context.ufc=JSON.parse(read('data/ufc-data.json'));
  const run=code=>vm.runInContext(code,context);run('data=nfl;ufcData=ufc;v6.registry=registry');
  return {run,context,node};
}
test('V6 prototype script parses and its explicit route does not replace V5 matchups',()=>{
  new vm.Script(read('assets/v6-prototype.js'));const {run}=app();
  assert.equal(run("location.hash='#/design/ufc-faceoff';parseV5Route().view"),'design');
  assert.equal(run("location.hash='#/matchup/islammakhachev/charlesoliveira';parseV5Route().view"),'matchup');
  assert.equal(run("location.hash='#/athlete/NFL/00-0033873';parseV5Route().view"),'athlete');
});
test('all four photo identities resolve to the published athlete datasets',()=>{
  const {run}=app();assert.equal(Object.keys(registry.athletes).length,4);
  for(const [identity,image] of Object.entries(registry.athletes)){const [sport,key]=identity.split(':');assert.equal(run(`findAthlete(${JSON.stringify(sport)},${JSON.stringify(key)}).name`),image.athlete_name)}
});
test('every packaged image has complete source, attribution, license and verified bytes',()=>{
  for(const image of Object.values(registry.athletes)){
    assert.equal(image.review_status,'verified-open-license');assert.match(image.source_page,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(image.license_url,/^https:\/\/creativecommons\.org\//);assert.ok(image.attribution);assert.ok(image.captured_at);assert.ok(image.modifications);
    const raw=fs.readFileSync(path.join(root,image.portrait.path));assert.equal(raw.toString('ascii',0,4),'RIFF');assert.equal(raw.toString('ascii',8,12),'WEBP');assert.equal(raw.length,image.portrait.bytes);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),image.portrait.sha256);
    if(image.share_alike)assert.equal(image.derivative_license,image.license);
    if(image.cutout){assert.equal(image.derivatives_allowed,true);assert.equal(image.cutout.license,image.license);assert.ok(fs.existsSync(path.join(root,image.cutout.mask)))}
  }
});
test('the two UFC hero photographs stay below 200 KB combined',()=>{
  assert.ok(registry.athletes['UFC:islammakhachev'].portrait.bytes+registry.athletes['UFC:charlesoliveira'].portrait.bytes<200000);
});
test('unsafe, unreviewed or non-adaptable photography falls back without substitution',()=>{
  const {run}=app();run("v6.registry.athletes['UFC:islammakhachev'].review_status='pending'");assert.doesNotMatch(run("v6Portrait('islammakhachev','left')"),/<img/);
  run("v6.registry.athletes['UFC:islammakhachev'].review_status='verified-open-license';v6.registry.athletes['UFC:islammakhachev'].derivatives_allowed=false");assert.equal(run("v6Image('islammakhachev')"),null);
  assert.equal(run("v6LocalAsset('assets/portraits/../../secret.webp')"),null);assert.equal(run("v6LocalAsset('https://example.com/athlete.webp')"),null);
});
test('mask URLs resolve from the document root rather than the stylesheet directory',()=>{
  const {run}=app();const markup=run("v6Portrait('islammakhachev','left')");assert.match(markup,/http:\/\/localhost\/assets\/portraits\/islam-mask\.svg/);assert.doesNotMatch(markup,/assets\/assets/);
});
test('prototype markup retains real records, source disclosures, profile links and fight histories',()=>{
  const {run,node}=app();run("renderV6Prototype($('listing'))");const html=node('listing').innerHTML;
  assert.match(html,/18-1-0/);assert.match(html,/25-11-0/);assert.match(html,/no scheduled bout implied/);assert.match(html,/CC BY 3\.0/);assert.match(html,/CC0 1\.0/);assert.match(html,/#\/athlete\/UFC\/islammakhachev/);assert.match(html,/Ian Machado Garry/);assert.match(html,/Max Holloway/);assert.match(html,/may be historical/);
});
test('image-registry failure produces an explicit retryable state',async()=>{
  const {run}=app();assert.equal(await run('loadV6Images()'),false);assert.equal(run('v6.registry'),null);run("renderV6Prototype($('listing'))");assert.match(run("$('listing').innerHTML"),/Retry photographs/);assert.doesNotMatch(run("v6Portrait('islammakhachev','left')"),/<img/);
});
