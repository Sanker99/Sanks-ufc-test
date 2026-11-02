import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlipFinances} from '../slip-summary.mjs';
for(const text of [
 'Total Wager $10.00\nTotal Payout $250.00',
 'Total Wager\n$10.00\nTotal Payout\n$250.00',
 'Total Wager Total Payout\n$10.00 $250.00',
 'Total Wager\nTotal Payout\n$10.00\n$250.00',
 '$10.00 $250.00\nTotal Wager Total Payout',
 '$10.00\nTotal Wager\n$250.00\nTotal Payout',
 'Total Wager: $10.00 | Total Payout: $250.00',
 'TOTAL WAGER\nTOTAL PAYOUT\n10.00 250.00',
 '$10.00 Total Wager $250.00 Total Payout'
])test('FanDuel amount layout: '+JSON.stringify(text),()=>{const r=parseSlipFinances(text);assert.equal(r.finances.stakeCents,1000);assert.equal(r.finances.payoutCents,25000);assert.deepEqual(r.warnings,[]);});
test('incomplete FanDuel header pairs cannot assign wager as payout',()=>{const r=parseSlipFinances('Total Wager\nTotal Payout\n$10.00');assert.equal(r.finances.stakeCents,null);assert.equal(r.finances.payoutCents,null);assert.ok(r.warnings.length);});
test('malformed, negative and inconsistent amounts remain reviewable',()=>{for(const raw of ['$1O.00','-$10.00','$-10.00','$10.009']){const r=parseSlipFinances('Total Wager '+raw);assert.equal(r.finances.stakeCents,null,raw);assert.ok(r.warnings.length,raw);}const r=parseSlipFinances('Total Wager $10.00\nTotal Payout $1,234.56');assert.equal(r.finances.payoutCents,123456);});
