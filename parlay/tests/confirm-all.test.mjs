import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmLegs,lockParlay} from '../core.mjs';
const roster=[{id:'p1',name:'Canonical Player',team:'SF',season:2026}];
const games=[{schedule_id:'g1',home:'SF',away:'WAS'},{schedule_id:'g2',home:'LV',away:'PHI'}],context={roster,games,season:2026};
const player={playerId:'p1',playerName:'OCR name',team:'SF',gameId:'g1',season:2026,category:'rushing_yards',operator:'>=',target:40,verificationStatus:'review'};
const team={kind:'team',playerId:null,playerName:null,team:'SF',teamName:'OCR team name',gameId:'g1',season:2026,category:'moneyline',operator:'win',target:null,verificationStatus:'review'};
test('bulk confirmation accepts complete player and moneyline legs without mutating inputs',()=>{
 const input=[player,team],before=structuredClone(input),result=confirmLegs(input,context);
 assert.equal(result.confirmedCount,2);assert.deepEqual(result.unresolved,[]);
 assert.equal(result.legs[0].playerName,'Canonical Player');assert.equal(result.legs[1].teamName,'San Francisco 49ers');
 assert.ok(result.legs.every(l=>l.verificationStatus==='confirmed'));assert.deepEqual(input,before);
});
test('bulk confirmation leaves incomplete, mismatched and unsupported selections in review',()=>{
 const invalid=[{...player,target:null},{...player,gameId:'g2'},{...player,season:2025},{...player,playerId:'unknown'},{...player,category:'unsupported'}];
 const result=confirmLegs([player,...invalid],context);
 assert.equal(result.confirmedCount,1);assert.deepEqual(result.unresolved.map(r=>r.index),[1,2,3,4,5]);assert.ok(result.legs.slice(1).every(l=>l.verificationStatus==='review'));
 assert.throws(()=>lockParlay({id:'test',legs:result.legs},true),/Remove unsupported/);
});
test('confirming all does not bypass final locking consent or import reconciliation',()=>{
 const result=confirmLegs([player,team],context),draft={id:'test',legs:result.legs};
 assert.throws(()=>lockParlay(draft,false),/Confirm every/);
 assert.throws(()=>lockParlay({...draft,importWarnings:['Check cropped slip']},true),/Reconcile/);
 assert.ok(lockParlay(draft,true).lockedAt);
});
