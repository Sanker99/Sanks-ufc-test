import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPlayerCrosswalk,buildGameCrosswalk} from '../identity.mjs';
import {onRequestGet} from '../../functions/api/parlay/health.js';
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
test('preview health uses only the collector binding and sanitizes failures',async()=>{
 const host='https://feature-parlay-demand-live-stats.sanks-ufc-preview.pages.dev';let calls=0;
 const context={request:new Request(host+'/api/parlay/health?url=https://evil.example'),env:{PARLAY_FEED:{fetch:async request=>{calls++;assert.equal(request.url,'https://collector/health');return Response.json({configured:false});}}}};
 assert.equal((await onRequestGet(context)).status,200);assert.equal(calls,1);
 context.env.PARLAY_FEED.fetch=async()=>{throw Error('private credential debug');};
 const failure=await onRequestGet(context);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private credential/);
 context.request=new Request('https://sanksresearchlab.pages.dev/api/parlay/health');assert.equal((await onRequestGet(context)).status,503);
});
