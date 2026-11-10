import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMixedSlip,mayContainUfc,slipDates} from '../mixed-slip.mjs';
import {confirmLegs,lockParlay,evaluateParlay} from '../core.mjs';
import {ufcObservationReport} from '../ufc.mjs';

const timeZone='America/Chicago',season=2026;
const game={schedule_id:'2026_09_GB_NE',date:'2026-11-08',week:9,home:'NE',away:'GB'};
const player={id:'00-0035700',team:'GB',name:'Josh Jacobs',season};
const fight={gameId:'ufc:600061268:401928118',date:'2026-11-07T22:00Z',scheduledFor:'2026-11-07T22:00Z',
 season,title:'UFC Fight Night',rounds:3,outcome:'final',winnerId:'5080485',method:'ko',finishRound:1,length:256,
 checkedAt:'2026-11-08T07:00:00Z',fighters:[{id:'4880114',name:'Jonny Parsons'},{id:'5080485',name:'José Souza'}]};
const context={season,games:[game],fights:[fight],timeZone,now:new Date('2026-11-08T22:00Z')};
test('one mixed import resolves separate event dates, shared moneyline labels, and money once',()=>{
 const text='4 Leg Parlay\nNov 7, 2026\nJosé Souza\nMoneyline\nJosé Souza to win by KO/TKO\n11/8/2026\nPackers\nMoneyline\nJosh Jacobs\n40+ Rushing Yards\nTotal Charged: $10.00\nTotal Payout: $32.00';
 assert.equal(mayContainUfc(text),true);
 const parsed=parseMixedSlip(text,[player],{...context,dates:slipDates(text)});
 assert.deepEqual(parsed.warnings,[]);
 assert.deepEqual(parsed.legs.map(l=>[l.category,l.gameId]),[['moneyline',game.schedule_id],['rushing_yards',game.schedule_id],['ufc_win',fight.gameId],['ufc_ko',fight.gameId]]);
 assert.deepEqual(parsed.finances,{currency:'USD',stakeCents:1000,payoutCents:3200,profitCents:null});
 const review=confirmLegs(parsed.legs,{...context,roster:[player]});
 assert.equal(review.unresolved.length,0);
 const card=lockParlay({id:'mixed',legs:review.legs},true);
 const ufc=ufcObservationReport(fight).observations;
 assert.deepEqual(evaluateParlay(card,ufc).legs.map(l=>l.state),['Pending','Pending','Final Hit','Final Hit']);
});
test('an undated scan can resolve both sports without treating a team as a fighter',()=>{
 const text='Packers\nMoneyline\nJosé Souza\nMoneyline';
 assert.equal(mayContainUfc('Packers\nMoneyline'),false);
 const parsed=parseMixedSlip(text,[player],{...context,dates:[]});
 assert.deepEqual(parsed.legs.map(l=>l.gameId),[game.schedule_id,fight.gameId]);
 const ambiguous=parseMixedSlip(text,[player],{...context,dates:[],fights:[fight,{...fight,gameId:'ufc:1:2'}]});
 assert.equal(ambiguous.legs.length,2);
 assert.equal(ambiguous.legs[1].gameId,null);
 assert.equal(ambiguous.legs[1].category,'ufc_win');
});
