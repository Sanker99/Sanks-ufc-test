import {test} from 'node:test';
import assert from 'node:assert/strict';
import identities from '../live-identities.mjs';
import {gameResponse,cachedJSON,validateSummary,participationEvidence,mapCoreStats,scoringTouchdowns} from '../live-source.mjs';
import {mapEspnSummary} from '../stats.mjs';
import {trackedGames,createLiveSync} from '../live-sync.mjs';
import {BrowserRepository} from '../core.mjs';
const game=identities.games['2026_07_DAL_PHI'];
const id=provider=>Object.keys(identities.players).find(key=>identities.players[key].providerId===provider);
const qb=id('2577417'),receiver=id('4241389');
const at='2026-10-27T03:00:00Z';
const summary=()=>({header:{id:game.providerId,season:{year:game.season},competitions:[{date:'2026-10-27T00:15:00Z',status:{type:{state:'in',completed:false}},competitors:[{id:'21',homeAway:'home',team:{abbreviation:'PHI'},score:'14'},{id:'6',homeAway:'away',team:{abbreviation:'DAL'},score:'21'}]}]},boxscore:{players:[{team:{id:'6',abbreviation:'DAL'},statistics:[{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'2577417'},stats:['3/7','80','3','0']}]},{name:'receiving',labels:['REC','YDS','TD','TGTS'],athletes:[{athlete:{id:'4241389'},stats:['0','0','0','1']}]}]}]}});
function corePayload(provider='4241389',scored=2,passing=0){
 const base='http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/';
 return {$ref:base+'events/'+game.providerId+'/competitions/'+game.providerId+'/competitors/6/roster/'+provider+'/statistics/0',athlete:{$ref:base+'seasons/'+game.season+'/athletes/'+provider},competition:{$ref:base+'events/'+game.providerId+'/competitions/'+game.providerId},splits:{categories:[{name:'passing',stats:[{name:'totalTouchdowns',value:scored+passing},{name:'passingTouchdowns',value:passing}]},{name:'scoring',stats:[{name:'totalScoringTouchdowns',value:scored}]},{name:'rushing',stats:[{name:'rushingYards',value:0}]},{name:'receiving',stats:[{name:'receivingYards',value:35},{name:'receptions',value:3}]}]}};
}
const coreOptions={game,playerId:receiver,providerId:'4241389',teamId:'6',team:'DAL',status:'live',observedAt:at,participated:true};
function cache(){const saved=new Map();return {match:async key=>saved.get(key.url)?.clone(),put:async(key,response)=>{saved.set(key.url,response.clone());}};}
test('summary matching requires exact event, season, date, and home/away teams',()=>{
 validateSummary(summary(),game);
 for(const mutate of [p=>p.header.id='wrong',p=>p.header.season.year=2025,p=>p.header.competitions[0].date='2026-10-28T00:15:00Z',p=>p.header.competitions[0].competitors.reverse().forEach((t,i)=>t.homeAway=i?'away':'home')]){
  const bad=summary();mutate(bad);assert.throws(()=>validateSummary(bad,game),/mismatch/);
 }
});
test('actual participation counts support explicit zero stats; absent/zero rows do not prove play',()=>{
 const evidence=participationEvidence(summary());assert.equal(evidence[qb],true);assert.equal(evidence[receiver],true);
 const empty=summary();empty.boxscore.players[0].statistics[1].athletes[0].stats=['0','0','0','0'];
 assert.equal(participationEvidence(empty)[receiver],undefined);
 const rows=mapEspnSummary(summary(),{gameId:game.id,providerGameId:game.providerId,season:game.season,idMap:{'2577417':qb},participation:evidence,observedAt:at});
 assert.equal(rows[0].gameId,game.id);assert.equal(rows[0].metrics.passing_yards,80);assert.equal(rows[0].finalVerified,false);
});
test('touchdowns scored exclude passing TDs and preserve explicit return/recovery totals',()=>{
 const qbOptions={...coreOptions,playerId:qb,providerId:'2577417'};
 assert.equal(mapCoreStats(corePayload('2577417',0,3),qbOptions).metrics.anytime_tds,0);
 assert.equal(mapCoreStats(corePayload('4241389',2,0),coreOptions).metrics.anytime_tds,2);
 const fallback=corePayload('4241389',1,2);fallback.splits.categories=fallback.splits.categories.filter(c=>c.name!=='scoring');
 assert.equal(mapCoreStats(fallback,coreOptions).metrics.anytime_tds,1);
 const missing=corePayload();missing.splits.categories=[];assert.equal(mapCoreStats(missing,coreOptions).metrics.anytime_tds,undefined);
 assert.equal(mapCoreStats(corePayload(),{...coreOptions,participated:null}).participated,null);
});
test('athlete detail identity must match exact athlete, season, competitor and game',()=>{
 for(const field of ['athlete','competition','$ref']){
  const payload=corePayload();if(field==='$ref')payload.$ref=payload.$ref.replace('/competitors/6/','/competitors/21/');else payload[field].$ref='http://evil.example/not-this-player';
  assert.throws(()=>mapCoreStats(payload,coreOptions),/identity mismatch/);
 }
});
test('shared source cache retains observedAt and coalesces simultaneous requests',async()=>{
 let calls=0;const stored=cache(),key=new Request('https://cache.example/source/one'),fetcher=async()=>{calls++;return new Response('{"value":3}');};
 const options={url:'https://upstream.example/fixed',key,cache:stored,fetcher,validate:p=>assert.equal(p.value,3),now:()=>Date.parse(at)};
 const [a,b]=await Promise.all([cachedJSON(options),cachedJSON(options)]);assert.equal(calls,1);assert.equal(a.observedAt,b.observedAt);
 const warm=await cachedJSON({...options,now:()=>Date.parse(at)+10000});assert.equal(warm.cacheHit,true);assert.equal(Date.parse(warm.observedAt),Date.parse(at));
});
test('invalid, oversized, redirected and rate-limited source reads are not cached as stats',async()=>{
 const key=new Request('https://cache.example/source/error');
 for(const fetcher of [async()=>new Response('bad json'),async()=>new Response('',{status:302}),async()=>new Response('',{status:429}),async()=>new Response('x',{headers:{'content-length':'2000001'}})]){
  await assert.rejects(cachedJSON({url:'https://upstream.example/fixed',key,cache:cache(),fetcher,validate:()=>{}}));
 }
});
test('game endpoint validates inputs, uses fixed destinations, serves cache, and never settles',async()=>{
 let calls=0;const stored=cache(),requested=[];
 const fetcher=async(url,options)=>{calls++;requested.push(url);assert.equal(options.redirect,'manual');return new Response(JSON.stringify(url.includes('/summary?')?summary():corePayload()));};
 const request=new Request('https://preview.example/api/parlay/game?gameId='+game.id+'&details='+receiver+'&url=https://evil.example');
 const first=await gameResponse(request,{cache:stored,fetcher,now:()=>Date.parse(at)}),data=await first.json();
 assert.equal(first.status,200);assert.equal(data.finalSettlementEnabled,false);assert.ok(data.observations.every(s=>s.finalVerified===false));assert.equal(data.observations.find(s=>s.playerId===receiver).metrics.anytime_tds,2);
 const warm=await gameResponse(request,{cache:stored,fetcher,now:()=>Date.parse(at)+10000});assert.equal(warm.headers.get('X-Parlay-Cache'),'HIT');assert.equal(calls,2);assert.ok(requested.every(url=>url.startsWith('https://site.api.espn.com/')||url.startsWith('https://sports.core.api.espn.com/')));
 const invalid=await gameResponse(new Request('https://preview.example/api/parlay/game?gameId=arbitrary'),{fetcher});assert.equal(invalid.status,404);
 const wrong=await gameResponse(new Request('https://preview.example/api/parlay/game?gameId='+game.id+'&details=https://evil.example'),{fetcher});assert.equal(wrong.status,400);
});
test('source failures are explicit errors, not fabricated zero observations',async()=>{
 const r=await gameResponse(new Request('https://preview.example/api/parlay/game?gameId='+game.id),{cache:cache(),fetcher:async()=>{throw Error('private debug information');}});
 assert.equal(r.status,503);const data=await r.json();assert.equal(data.observations,undefined);assert.doesNotMatch(JSON.stringify(data),/private debug/);
});
const leg={playerId:receiver,playerName:'QA receiver',team:'DAL',gameId:game.id,season:game.season,category:'receiving_yards',operator:'>=',target:40,verificationStatus:'confirmed'};
const parlay={id:'sync-test',name:'Test fixture',lockedAt:at,legs:[leg]},observation=value=>({...leg,metrics:{receiving_yards:value},status:'live',verified:true,participated:true,observedAt:at,finalVerified:false,source:'TEST FIXTURE'});
function repository(){const map=new Map(),r=new BrowserRepository({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)});r.save(parlay);return r;}
test('client groups games across parlays and asks for TD/combined detail coverage',()=>{
 const groups=trackedGames([parlay,{...parlay,id:'second',legs:[{...leg,category:'anytime_tds',target:1}]}]);assert.equal(groups.length,1);assert.deepEqual(groups[0].details,[receiver]);
});
test('client respects visibility, cadence and grouping while saving actual provisional progress',async()=>{
 const r=repository();r.save({...parlay,id:'second'});let visible=false,calls=0,time=Date.parse(at);
 const sync=createLiveSync({repository:r,isVisible:()=>visible,now:()=>time,fetchGame:async()=>{calls++;return {gameId:game.id,season:game.season,observedAt:at,nextPollMs:30000,observations:[observation(32)]};}});
 await sync.refresh();assert.equal(calls,0);visible=true;await sync.refresh();assert.equal(calls,1);
 assert.equal(r.list()[0].result.legs[0].progress.current,32);assert.equal(r.list()[1].result.status,'active');
 await sync.refresh();assert.equal(calls,1);time+=30001;await sync.refresh();assert.equal(calls,2);
});
test('failed refresh retains saved values, newer corrections reverse bars, and finals remain provisional',async()=>{
 const r=repository();let time=Date.parse(at),value=45,fail=false;
 const sync=createLiveSync({repository:r,isVisible:()=>true,now:()=>time,fetchGame:async()=>{if(fail)throw Error('offline');return {gameId:game.id,season:game.season,observedAt:new Date(time).toISOString(),observations:[{...observation(value),observedAt:new Date(time).toISOString(),status:'final'}]};}});
 await sync.refresh();assert.equal(r.list()[0].result.legs[0].progress.tone,'green');assert.equal(r.list()[0].result.status,'active');
 time+=30001;fail=true;await sync.refresh();assert.equal(r.list()[0].result.legs[0].progress.current,45);
 time+=60001;fail=false;value=20;await sync.refresh();assert.equal(r.list()[0].result.legs[0].progress.tone,'red');assert.equal(r.list()[0].result.legs[0].state,'Provisionally Missed');
});
test('wrong player/team identities and unexpected final verification cannot update a saved leg',async()=>{
 const r=repository(),sync=createLiveSync({repository:r,isVisible:()=>true,fetchGame:async()=>({gameId:game.id,season:game.season,observedAt:at,observations:[{...observation(99),team:'PHI'},{...observation(99),finalVerified:true}]})});
 await sync.refresh();assert.equal(r.list()[0].result,undefined);
});

test('complete scoring events link unique source athlete IDs and exclude the passing quarterback',()=>{
 const payload=summary(),team=payload.boxscore.players[0];
 team.statistics[0].athletes[0].athlete.displayName='Test Quarterback';
 team.statistics[1].athletes[0].athlete.displayName='Test Receiver';
 payload.header.competitions[0].competitors[0].score='0';payload.header.competitions[0].competitors[1].score='7';
 payload.scoringPlays=[{id:'play-1',homeScore:0,awayScore:7,team:{id:'6'},scoringType:{name:'touchdown'},text:'Test Receiver 12 Yd pass from Test Quarterback (Kick)'}];
 const counts=scoringTouchdowns(payload);assert.equal(counts.get('4241389'),1);assert.equal(counts.get('2577417'),0);
 const incomplete=structuredClone(payload);incomplete.scoringPlays=[];assert.equal(scoringTouchdowns(incomplete),null);
 const unknown=structuredClone(payload);unknown.scoringPlays[0].text='Unmapped Scorer 12 Yd pass';assert.equal(scoringTouchdowns(unknown),null);
 const ambiguous=structuredClone(payload);ambiguous.boxscore.players[0].statistics[1].athletes.push({athlete:{id:'999',displayName:'Test Receiver'},stats:['1','12','1','1']});assert.equal(scoringTouchdowns(ambiguous),null);
});
test('a denied athlete source is cached as an error and never as a stat value',async()=>{
 let calls=0;const options={url:'https://upstream.example/denied',key:new Request('https://cache.example/source/denied'),cache:cache(),fetcher:async()=>{calls++;return new Response('',{status:403});},validate:()=>{}};
 await assert.rejects(cachedJSON(options));await assert.rejects(cachedJSON(options));assert.equal(calls,1);
});

test('validated completed source reports enable final results without claiming sportsbook settlement',async()=>{
 const payload=summary();payload.header.competitions[0].status.type={state:'post',completed:true};
 const response=await gameResponse(new Request('https://preview.example/api/parlay/game?gameId='+game.id),{now:()=>Date.parse(at),fetcher:async()=>new Response(JSON.stringify(payload))});
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.gameStatus,'final');assert.equal(data.finalResultsEnabled,true);assert.equal(data.finalSettlementEnabled,false);assert.ok(data.observations.length);assert.ok(data.observations.every(s=>s.finalVerified===true));
});

test('a missed leg waits for all games, then moves to Lost immediately and survives reload',async()=>{
 const saved=new Map(),r=new BrowserRepository({getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}),secondGame='2026_08_DAL_ARI';r.save({...parlay,legs:[leg,{...leg,gameId:secondGame}]});
 let time=Date.parse(at),secondClosed=false;
 const sync=createLiveSync({repository:r,isVisible:()=>true,now:()=>time,fetchGame:async group=>{
  const closed=group.gameId===game.id||secondClosed;return {gameId:group.gameId,season:game.season,observedAt:new Date(time).toISOString(),gameStatus:closed?'final':'live',finalResultsEnabled:true,nextPollMs:300000,observations:[{...observation(group.gameId===game.id?32:45),gameId:group.gameId,status:closed?'final':'live',finalVerified:closed,observedAt:new Date(time).toISOString()}]};
 }});
 await sync.refresh(true);assert.equal(r.list()[0].result.status,'active');assert.equal(r.list()[0].result.legs[0].state,'Final Missed');
 time+=300001;secondClosed=true;await sync.refresh(true);const result=r.list()[0];assert.equal(result.result.status,'lost');
 const {parlayBucket}=await import('../core.mjs');assert.equal(parlayBucket(result.result,result.resolvedDay,result.resolvedDay),'lost');
 assert.deepEqual(r.list()[0].legs,[leg,{...leg,gameId:secondGame}]);
});

test('recent finished cards continue checking and can change Won to Lost or reopen after a correction',async()=>{
 const r=repository();let time=Date.parse(at),value=45,closed=true,calls=0;
 const sync=createLiveSync({repository:r,isVisible:()=>true,now:()=>time,gameDate:()=>game.date,fetchGame:async()=>{calls++;return {gameId:game.id,season:game.season,gameStatus:closed?'final':'live',finalResultsEnabled:true,observedAt:new Date(time).toISOString(),nextPollMs:300000,observations:[{...observation(value),status:closed?'final':'live',finalVerified:closed,observedAt:new Date(time).toISOString()}]};}});
 await sync.refresh();assert.equal(r.list()[0].result.status,'won');time+=300001;value=39;await sync.refresh();assert.equal(r.list()[0].result.status,'lost');
 time+=300001;closed=false;await sync.refresh();assert.equal(r.list()[0].result.status,'active');assert.equal(calls,3);
});

test('completed reports without the source final-results contract stay provisional',async()=>{
 const r=repository(),sync=createLiveSync({repository:r,isVisible:()=>true,fetchGame:async()=>({gameId:game.id,season:game.season,gameStatus:'final',observedAt:at,observations:[{...observation(45),status:'final',finalVerified:true}]})});
 await sync.refresh();assert.equal(r.list()[0].result,undefined);
});

test('settled-card correction polling is limited to games within seven days',()=>{
 const settled={...parlay,result:{status:'won'}};
 assert.equal(trackedGames([settled],{now:Date.parse('2026-10-27T00:00:00Z'),gameDate:()=>game.date}).length,1);
 assert.equal(trackedGames([settled],{now:Date.parse('2026-11-04T00:00:00Z'),gameDate:()=>game.date}).length,0);
});

test('sync promotes cached final reports even when no observation timestamp advances',async()=>{
 const r=repository();let closed=false,calls=0;
 const sync=createLiveSync({repository:r,isVisible:()=>true,fetchGame:async()=>{calls++;return {gameId:game.id,season:game.season,gameStatus:closed?'final':'live',finalResultsEnabled:true,observedAt:at,observations:[{...observation(45),status:closed?'final':'live',finalVerified:closed}]};}});
 await sync.refresh(true);assert.equal(r.list()[0].result.status,'active');closed=true;await sync.refresh(true);assert.equal(r.list()[0].result.status,'won');assert.equal(calls,2);
});
