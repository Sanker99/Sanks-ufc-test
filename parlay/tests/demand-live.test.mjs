import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../workers/parlay-demand/catalog.mjs';
import {DemandCoordinator,freshState,intervalFor,rollBudget,applyHeaders,LEASE_MS} from '../../workers/parlay-demand/coordinator.mjs';
import {mapBoxscore,validateMatch,validateIdentities,providerRequest} from '../../workers/parlay-demand/provider.mjs';
import {demandGames,createDemandRegistration,feedLabel} from '../demand-client.mjs';
import {feedRequest} from '../demand-gateway.mjs';
import {evaluateParlay} from '../core.mjs';
import fixture from './fixtures/bigballs-simulated.json' with {type:'json'};
const {gameId,game,playerId,manifest,box:baseBox,match:baseMatch}=fixture;
const kickoff=Date.parse(game.kickoff);
function setup({key='test-only',maps=manifest}={}){
 let clock=kickoff+60000,calls=0,mode='live',yards='24',fault=null,cap='250';
 const memory=new Map();let alarm=null;
 const storage={get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v)),setAlarm:async v=>{alarm=v;},deleteAlarm:async()=>{alarm=null;}};
 const env={BBS_API_KEY:key,BBS_IDENTITIES:JSON.stringify(maps)},ctx={storage};
 const make=()=>{const c=new DemandCoordinator(ctx,env);c.now=()=>clock;c.fetcher=async url=>{
  calls++;assert.equal((await storage.get('state')).used>0,true,'request must be durably charged before network');
  if(fault==='throw')throw Error('secret credential debug');if(fault)return new Response('{}',{status:fault,headers:{'retry-after':'300'}});
  const p=structuredClone(url.includes('/matches/')?baseMatch:baseBox);
  if(url.includes('/matches/'))p.data.status=mode==='final'?'finished':'in_progress';
  else{p.meta.as_of=new Date(clock).toISOString();p.data.status=mode==='final'?'finished':'in_progress';p.data.teams[0].stat_groups[0].players[0].stats[0]=yards;}
  return Response.json(p,{headers:{'x-ratelimit-limit-day':cap}});
 };return c;};
 const c=make();
 return {c,storage,env,make,get now(){return clock;},set now(n){clock=n;},get calls(){return calls;},set mode(v){mode=v;},set yards(v){yards=v;},set fault(v){fault=v;},set cap(v){cap=v;},get alarm(){return alarm;}};
}
const register=(s,games=[gameId])=>s.c.fetch(new Request('https://collector/register',{method:'POST',body:JSON.stringify({games})}));
const get=async s=>(await s.c.fetch(new Request('https://collector/game?gameId='+gameId))).json();

test('registration is bounded, deduplicated, anonymous and makes no provider reads',async()=>{
 const s=setup();await Promise.all(Array.from({length:20},()=>register(s,[gameId,gameId])));
 assert.equal(s.calls,0);const saved=await s.storage.get('state');
 assert.deepEqual(Object.keys(saved.games),[gameId]);assert.equal(saved.games[gameId].expiresAt,s.now+LEASE_MS);
 assert.doesNotMatch(JSON.stringify(saved),/parlayName|playerId|userId|ipAddress/);
 assert.equal((await register(s,['unknown'])).status,400);
 const bad=await s.c.fetch(new Request('https://collector/register',{method:'POST',body:JSON.stringify({games:[gameId],name:'private'})}));assert.equal(bad.status,400);
});
test('simultaneous visitors, repeated alarms and an object restart share a persisted cache',async()=>{
 const s=setup();await register(s);await Promise.all([s.c.alarm(),s.c.alarm(),s.c.alarm()]);
 assert.equal(s.calls,2);const report=await get(s);assert.equal(report.observations[0].metrics.receiving_yards,24);
 for(let i=0;i<20;i++)await get(s);assert.equal(s.calls,2);
 const restarted=s.make();await restarted.alarm();assert.equal(s.calls,2);
});
test('registrations expire after the browser closes and upcoming games do not poll early',async()=>{
 const s=setup();s.now=kickoff-60000;await register(s);await s.c.alarm();assert.equal(s.calls,0);assert.equal(s.alarm,kickoff);
 s.now=kickoff+1000;await s.c.alarm();assert.equal(s.calls,2);
 s.now+=LEASE_MS;await s.c.alarm();assert.equal(s.calls,2);assert.equal(s.alarm,null);
});
test('missing credentials or game mappings remain explicitly unavailable with no source fallback',async()=>{
 for(const s of [setup({key:''}),setup({maps:{version:1,games:{},players:{}}})]){
  await register(s);await s.c.alarm();assert.equal(s.calls,0);const r=await get(s);assert.equal(r.observations.length,0);assert.match(r.reason,/not configured|not verified/);
 }
});
test('daily quota is a hard ceiling, reservations survive failures, and UTC resets are exact',async()=>{
 const s=setup();await register(s);let budget=freshState();rollBudget(budget,s.now);budget.used=249;budget.games={[gameId]:{expiresAt:s.now+LEASE_MS,nextAt:s.now}};
 await s.storage.put('state',budget);await s.c.alarm();assert.equal(s.calls,0);assert.equal((await s.storage.get('state')).used,249);
 const before=new Date(s.now).toISOString().slice(0,10);s.now=(Math.floor(s.now/86400000)+1)*86400000;budget=await s.storage.get('state');rollBudget(budget,s.now);assert.notEqual(budget.day,before);assert.equal(budget.used,0);assert.equal(budget.limit,250);
});
test('authenticated cap headers are required before enabling 500; smaller caps and reset/backoff win',()=>{
 const s=freshState(),now=kickoff;rollBudget(s,now);assert.equal(s.limit,250);
 applyHeaders(s,new Headers({'x-ratelimit-limit-day':'2000'}),now);assert.equal(s.limit,250);
 applyHeaders(s,new Headers({'x-ratelimit-limit-day':'500'}),now);assert.equal(s.limit,500);
 applyHeaders(s,new Headers({'x-ratelimit-limit-day':'250','x-ratelimit-remaining-day':'40','retry-after':'120'}),now);assert.equal(s.limit,250);assert.equal(s.used,210);assert.equal(s.blockedUntil,now+120000);
});
test('adaptive polling accounts for upcoming games and both provider routes',()=>{
 const s=freshState();s.limit=250;
 const games=Array.from({length:2},()=>({...game,kickoff:new Date(kickoff).toISOString()}));
 assert.equal(intervalFor(s,[games[0]],kickoff),180000);
 assert.equal(intervalFor(s,games,kickoff),300000);
 s.used=210;assert.ok(intervalFor(s,games,kickoff)>300000);
 s.used=250;assert.ok(intervalFor(s,games,kickoff)>=900000);
});
test('API failures retain prior stats, back off globally and do not expose source error details',async()=>{
 const s=setup();await register(s);await s.c.alarm();const old=await get(s);
 s.now+=300001;s.fault=429;await register(s);await s.c.alarm();
 const r=await get(s);assert.deepEqual(r.observations,old.observations);assert.match(r.reason,/unavailable/);assert.doesNotMatch(JSON.stringify(r),/secret|test-only/);const calls=s.calls;
 await s.c.alarm();assert.equal(s.calls,calls);assert.ok((await s.storage.get('state')).blockedUntil>s.now);
});
test('stale cached totals are delayed and failed requests never erase progress',async()=>{
 const s=setup();await register(s);await s.c.alarm();s.now+=1200000;
 const r=await get(s);assert.equal(r.stale,true);assert.ok(r.observations.length);
 assert.match(feedLabel(r,{available:true,current:24,observedAt:r.observedAt,state:'Provisionally Hit'},s.now),/^DELAYED/);
});
test('matching requires exact provider player ID, roster context and game identities',()=>{
 assert.equal(validateIdentities(manifest,catalog),manifest);
 const wrong=structuredClone(manifest);wrong.players[playerId].team='BUF';assert.throws(()=>validateIdentities(wrong,catalog));
 const collision=structuredClone(manifest);collision.players['unknown-player']=collision.players[playerId];assert.throws(()=>validateIdentities(collision,catalog));
 const bad=structuredClone(baseMatch);bad.data.home.id=game.awayId;assert.throws(()=>validateMatch(bad,game));
 const ambiguous=structuredClone(baseBox);ambiguous.data.teams[0].stat_groups[0].players[0].player_id=null;
 assert.equal(mapBoxscore(ambiguous,{gameId,game,players:manifest.players,now:kickoff+60000}).observations.length,0);
});
test('category mapping keeps absent stats unavailable and only combines complete components',()=>{
 const options={gameId,game,players:manifest.players,now:kickoff+60000};
 const r=mapBoxscore(baseBox,options);assert.equal(r.observations[0].metrics.receiving_yards,24);assert.equal(r.observations[0].metrics.rush_receive_yards,undefined);assert.equal(r.observations[0].metrics.anytime_tds,undefined);
 const p=structuredClone(baseBox),row=p.data.teams[0].stat_groups[0].players[0];
 row.stats[0]='';assert.equal(mapBoxscore(p,options).observations[0].metrics.receiving_yards,undefined);
 p.data.teams[0].stat_groups.push({type:'rushing',keys:['YDS','CAR'],players:[{player_id:manifest.players[playerId].providerId,stats:['-2','1']}]});
 row.stats[0]='24';assert.equal(mapBoxscore(p,options).observations[0].metrics.rush_receive_yards,22);
 row.stats.pop();assert.throws(()=>mapBoxscore(p,options),/Misaligned/);
});
test('a player on multiple cards shares observations; numeric props and moneylines remain provisional',async()=>{
 const s=setup();await register(s);await s.c.alarm();const r=await get(s);
 const legs=[{playerId,team:manifest.players[playerId].team,season:game.season,gameId,category:'receiving_yards',operator:'>=',target:20},{category:'moneyline',team:game.home,season:game.season,gameId}];
 const p={id:'a',lockedAt:new Date(s.now).toISOString(),legs};
 assert.equal(evaluateParlay(p,r.observations).status,'active');
 assert.equal(evaluateParlay({...p,id:'b'},r.observations).legs[0].progress.current,24);
 assert.equal(s.calls,2);
});
test('finals require two agreeing reports five minutes apart; a correction reopens verification',async()=>{
 const s=setup();s.mode='final';await register(s);await s.c.alarm();let r=await get(s);assert.equal(r.finalResultsEnabled,false);
 s.now+=300001;await register(s);await s.c.alarm();r=await get(s);assert.equal(r.finalResultsEnabled,true);assert.ok(r.observations.every(o=>o.finalVerified));
 s.now+=600001;s.yards='18';await register(s);await s.c.alarm();r=await get(s);assert.equal(r.finalResultsEnabled,false);assert.equal(r.observations[0].metrics.receiving_yards,18);
 s.now+=300001;await register(s);await s.c.alarm();r=await get(s);assert.equal(r.finalResultsEnabled,true);
});
test('transport rejects non-allowlisted destinations, redirects and oversized payloads',async()=>{
 let calls=0;const fake=async()=>{calls++;return new Response('{}',{status:302});};
 await assert.rejects(()=>providerRequest('/v1/evil','key',fake));assert.equal(calls,0);
 assert.equal((await providerRequest('/v1/live-stats/american_football/'+game.providerId+'/players','key',fake)).status,302);
 await assert.rejects(()=>providerRequest('/v1/live-stats/american_football/'+game.providerId+'/players','key',async()=>new Response('{}',{headers:{'Content-Length':'2000001'}})));
});
test('browser demand contains only unresolved locked game IDs and heartbeats coalesce',async()=>{
 const parlays=[{lockedAt:'yes',legs:[{gameId},{gameId}]},{legs:[{gameId:'draft'}]},{lockedAt:'yes',result:{status:'won'},legs:[{gameId:'closed'}]}];
 assert.deepEqual(demandGames(parlays),[gameId]);let requests=0;const register=createDemandRegistration({now:()=>0,fetcher:async(url,options)=>{requests++;assert.deepEqual(JSON.parse(options.body),{games:[gameId]});return Response.json({});}});
 await register([gameId]);await register([gameId]);assert.equal(requests,1);
});
test('preview gateway enforces origin, body bounds and production isolation',async()=>{
 const host='https://feature-parlay-demand-live-stats.sanks-ufc-preview.pages.dev';
 const ctx={request:new Request(host+'/api/parlay/demand',{method:'POST',body:'{}',headers:{Origin:'https://evil.example','Content-Type':'application/json'}}),env:{}};
 assert.equal((await feedRequest(ctx,'/register')).status,403);
 ctx.request=new Request('https://sanksresearchlab.pages.dev/api/parlay/game');assert.equal((await feedRequest(ctx,'/game')).status,503);
});

test('many active games force slower cadence and per-game reserve prevents a late game exhausting finals',async()=>{
 const s=setup();s.now=kickoff+200*60000;await register(s);
 const state=await s.storage.get('state');state.used=240;state.games[gameId].reserveDay=state.day;state.games[gameId].reserveUsed=6;await s.storage.put('state',state);
 await s.c.alarm();assert.equal(s.calls,0);assert.match((await get(s)).reason,/budget/);
 const games=Array.from({length:8},()=>game);assert.ok(intervalFor({...freshState(),used:0},games,kickoff)>300000);
});
test('provider stat cells cannot move backwards or a future timestamp create a live report',()=>{
 const p=structuredClone(baseBox);p.meta.as_of=new Date(kickoff+3600000).toISOString();
 assert.throws(()=>mapBoxscore(p,{gameId,game,players:manifest.players,now:kickoff+60000}),/timestamp/);
});
test('score ties, missing player activity and unsupported touchdowns cannot settle',async()=>{
 const s=setup();s.mode='final';await register(s);await s.c.alarm();s.now+=300001;await register(s);await s.c.alarm();
 const r=await get(s),p={lockedAt:'yes',legs:[{playerId,team:manifest.players[playerId].team,season:game.season,gameId,category:'anytime_tds',operator:'>=',target:1}]};
 assert.equal(evaluateParlay(p,r.observations).status,'active');
 const tied={...r.observations.find(o=>o.kind==='team'),scores:{selected:7,opponent:7},finalVerified:true,status:'final'};
 assert.equal(evaluateParlay({lockedAt:'yes',legs:[{gameId,season:game.season,category:'moneyline',team:tied.team}]},[tied]).status,'active');
});
test('all passing and rushing metrics stay category-qualified and explicit zero needs participation',()=>{
 const p=structuredClone(baseBox),row={player_id:manifest.players[playerId].providerId,stats:['10/20','120','1','0']};
 p.data.teams[0].stat_groups=[{type:'passing',keys:['C/ATT','YDS','TD','INT'],players:[row]},{type:'rushing',keys:['CAR','YDS','TD'],players:[{player_id:row.player_id,stats:['2','-3','0']}]}];
 const r=mapBoxscore(p,{gameId,game,players:manifest.players,now:kickoff+60000}).observations[0];
 assert.deepEqual(r.metrics,{completions:10,attempts:20,passing_yards:120,passing_tds:1,interceptions:0,carries:2,rushing_yards:-3,rushing_tds:0});assert.equal(r.participated,true);
});

test('multiple simultaneous games use independent shared reports and one common daily budget',async()=>{
 const otherId=Object.keys(catalog.games).find(id=>id!==gameId&&Math.abs(Date.parse(catalog.games[id].date)-Date.parse(game.date))<=86400000);
 const other={...game,...catalog.games[otherId],providerId:'55555555-5555-4555-8555-555555555555',homeId:'66666666-6666-4666-8666-666666666666',awayId:'77777777-7777-4777-8777-777777777777',kickoff:catalog.games[otherId].date+'T17:00:00Z'};
 const maps=structuredClone(manifest);maps.games[otherId]=other;const s=setup({maps});s.now=Math.max(kickoff,Date.parse(other.kickoff))+60000;
 let calls=0;s.c.fetcher=async url=>{calls++;const g=url.includes(other.providerId)?other:game;
 return Response.json(url.includes('/matches/')?{data:{id:g.providerId,sport:'american_football',league:'NFL',kickoff_utc:g.kickoff,home:{id:g.homeId},away:{id:g.awayId},score:{home:0,away:0},status:'in_progress'}}:{data:{match_id:g.providerId,sport:'american_football',status:'in_progress',teams:[]},meta:{as_of:new Date(s.now).toISOString(),stale:false}});
 };
 await register(s,[gameId,otherId]);await s.c.alarm();assert.equal(calls,4);assert.equal((await s.storage.get('state')).used,4);
 const r=await (await s.c.fetch(new Request('https://collector/game?gameId='+otherId))).json();assert.equal(r.gameId,otherId);assert.equal(r.observations.length,2);
});
test('postponed and canceled games stop without voiding user selections',async()=>{
 const s=setup();await register(s);s.c.fetcher=async()=>Response.json({data:{...baseMatch.data,status:'postponed'}});
 await s.c.alarm();const state=await s.storage.get('state');assert.equal(state.used,1);assert.equal(state.games[gameId].stopped,true);
 const r=await get(s);assert.equal(r.observations.length,0);assert.match(r.reason,/postponed/);assert.equal(s.alarm,null);
});

test('browser cache reads send only a game ID, never selected player IDs or categories',async()=>{
 const {fetchLiveGame}=await import('../live-sync.mjs');const original=globalThis.fetch;let url;
 globalThis.fetch=async input=>{url=input;return Response.json({gameId});};
 try{await fetchLiveGame({gameId,details:['private-player-choice'],fullDetails:true});assert.equal(url,'/api/parlay/game?'+new URLSearchParams({gameId}));}
 finally{globalThis.fetch=original;}
});
