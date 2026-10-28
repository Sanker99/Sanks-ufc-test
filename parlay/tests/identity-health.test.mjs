import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPlayerCrosswalk,buildGameCrosswalk} from '../identity.mjs';
import {probeSources,onRequestGet} from '../../functions/api/parlay/health.js';
const data = JSON.parse(readFileSync(new URL('../../data/data.json',import.meta.url)));
const athletes = JSON.parse(readFileSync(new URL('../../data/athlete-content.json',import.meta.url))).athletes;
test('existing exact identities are collision-free; missing identities remain absent',()=>{
 const {ids,missing} = buildPlayerCrosswalk(data.players,athletes);
 assert.equal(Object.keys(ids).length+missing.length,data.players.length);
 assert.ok(Object.keys(ids).length > 1600); assert.ok(missing.length > 0);
 assert.throws(()=>buildPlayerCrosswalk([{id:'00-0000001'},{id:'00-0000002'}],{'NFL:00-0000001':{measurements:{espn_id:'1'}},'NFL:00-0000002':{measurements:{espn_id:'1'}}}),/Conflicting/);
});
const game={schedule_id:'2026_01_SF_LA',date:'2026-09-10',home:'LA',away:'SF'};
const row={game_id:game.schedule_id,season:'2026',gameday:game.date,home_team:'LAR',away_team:'SF',espn:'401872657'};
test('game crosswalk requires exact season, date, matchup and unique event ID',()=>{
 assert.equal(buildGameCrosswalk([game],[row],2026).ids[game.schedule_id],row.espn);
 assert.deepEqual(buildGameCrosswalk([game],[row],2025).missing,[game.schedule_id]);
 for (const patch of [{gameday:'2026-09-11'},{home_team:'BUF'}]) assert.throws(()=>buildGameCrosswalk([game],[{...row,...patch}],2026),/mismatch/);
 assert.throws(()=>buildGameCrosswalk([game],[row,row],2026),/Duplicate/);
 assert.equal(Object.keys(buildGameCrosswalk([game],[{...row,espn:''}],2026).ids).length,0);
 assert.throws(()=>buildGameCrosswalk([game,{...game,schedule_id:'other'}],[row,{...row,game_id:'other'}],2026),/Duplicate provider/);
});
const schedule='game_id,season,gameday,home_team,away_team,espn\ng,2026,2026-09-10,LA,SF,123\n';
const validFetch=async url=>new Response(url.includes('sleeper')?JSON.stringify({season:'2026',week:8,season_type:'regular'}):schedule);
test('diagnostic probes only fixed documented sources and validates both schemas',async()=>{
 const requested=[];
 const result=await probeSources(async (url,options)=>{requested.push(url);assert.equal(options.redirect,'manual');return validFetch(url);});
 assert.equal(requested.length,2);assert.ok(result.every(r=>r.ok));
 assert.ok((await probeSources(async()=>new Response('<html>failure</html>'))).every(r=>!r.ok));
 assert.ok((await probeSources(async()=>new Response('',{status:429}))).every(r=>r.status===429&&!r.ok));
});
test('oversized, aborted and failed responses cannot appear healthy or expose error details',async()=>{
 assert.ok((await probeSources(async()=>new Response('x',{headers:{'content-length':'4000001'}}))).every(r=>!r.ok));
 assert.ok((await probeSources(async()=>new Response('x'.repeat(4_000_001)))).every(r=>!r.ok));
 assert.ok((await probeSources(async()=>{throw Error('private upstream error');})).every(r=>!r.ok&&!r.error.includes('private')));
 assert.ok((await probeSources(async()=>{throw new DOMException('Aborted','AbortError');})).every(r=>r.error==='timeout'));
});
test('health caches observations, ignores query URLs and reports provisional tracking only',async()=>{
 const previousFetch=globalThis.fetch, previousCaches=globalThis.caches;
 const saved=new Map(),tasks=[];
 globalThis.fetch=function(url,options){assert.equal(this,globalThis);return validFetch(url,options);};
 globalThis.caches={default:{match:async key=>saved.get(key.url)?.clone(),put:async(key,value)=>saved.set(key.url,value)}};
 try {
  const context={request:new Request('https://preview.example/api/parlay/health?url=https://evil.example'),waitUntil:task=>tasks.push(task)};
  const first=await onRequestGet(context);await Promise.all(tasks);
  const second=await onRequestGet(context);
  assert.equal(first.headers.get('X-Parlay-Cache'),'MISS');assert.equal(second.headers.get('X-Parlay-Cache'),'HIT');
  assert.equal(first.headers.get('Cache-Control'),'no-store');
  const a=await first.json(),b=await second.json();assert.equal(a.observedAt,b.observedAt);assert.equal(b.liveTrackingEnabled,true);assert.equal(b.finalSettlementEnabled,false);
 } finally {globalThis.fetch=previousFetch;globalThis.caches=previousCaches;}
});
