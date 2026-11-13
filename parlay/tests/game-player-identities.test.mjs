import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/scoped-player-observed.json' with {type:'json'};
import {gamePlayerIdentities} from '../../workers/parlay-demand/game-player-identities.mjs';
import {mapBoxscore} from '../../workers/parlay-demand/provider.mjs';
const f=fixture.find(f=>f.player.name==='Stefon Diggs');
const roster=[{id:f.playerId,name:f.player.name,team:f.player.team,position:f.player.position}];
const now=Date.parse('2026-11-02T19:00:00Z');
const discover=(players={},rows=roster,box=f.box,gameId=f.gameId)=>gamePlayerIdentities(box,{gameId,game:f.game,players,roster:rows,now});
test('missing and old game-scoped player mappings recover from exact verified box rows',()=>{
 for(const maps of [{},{[f.playerId]:{...f.player,gameIds:['older-game']}}]){
  const players=discover(maps);
  assert.equal(players[f.playerId].providerId,f.player.providerId);
  assert.ok(players[f.playerId].gameIds.includes(f.gameId));
  const box=mapBoxscore(f.box,{gameId:f.gameId,game:f.game,players,now});
  assert.equal(box.observations[0].metrics.receiving_yards,38);
 }
});
test('identity recovery rejects ambiguous names, changed UUIDs and mismatched named sides',()=>{
 assert.equal(Object.keys(discover({},[...roster,{...roster[0],id:'other'}])).length,0);
 assert.equal(discover({[f.playerId]:{...f.player,providerId:'00000000-0000-4000-8000-000000000001'}})[f.playerId].providerId,'00000000-0000-4000-8000-000000000001');
 assert.equal(Object.keys(discover({},[{...roster[0],team:'BUF'}])).length,0);
 const bad=structuredClone(f.box);bad.data.match_id='00000000-0000-4000-8000-000000000001';
 assert.throws(()=>discover({},roster,bad),/identity evidence/);
});

test('a same-name athlete on a different team cannot hide a unique player in this game',()=>{
 const players=discover({},[...roster,{...roster[0],id:'other',team:'BUF'}]);
 assert.equal(players[f.playerId].providerId,f.player.providerId);
});
