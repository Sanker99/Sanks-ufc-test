import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMixedSlip,slipDates} from '../production-site/parlay/mixed-slip.mjs';
import {confirmLegs,lockParlay} from '../production-site/parlay/core.mjs';

const timeZone='America/Chicago',season=2026,now=new Date('2026-11-14T17:00Z');
const base={date:'2026-11-14T22:00Z',scheduledFor:'2026-11-14T22:00Z',season,
 title:'UFC Test',rounds:3,outcome:'pregame',gameId:'ufc:1:2',
 fighters:[{id:'10',name:'José Souza'},{id:'20',name:'Jonny Parsons'}]};
const past={...base,gameId:'ufc:1:3',date:'2026-11-07T22:00Z',scheduledFor:'2026-11-07T22:00Z',outcome:'final'};
const later={...base,gameId:'ufc:1:4',date:'2026-12-05T22:00Z',scheduledFor:'2026-12-05T22:00Z'};
const game={schedule_id:'2026_10_GB_NE',date:'2026-11-15',week:10,home:'NE',away:'GB'};
const context={season,games:[game],fights:[past,later,base],timeZone,now};
const parse=text=>parseMixedSlip(text,[],{...context,dates:slipDates(text)});

test('undated fighter automatically selects and locks nearest upcoming bout over past and later rematches',()=>{
 const result=parse('José Souza\nMoneyline');
 assert.equal(result.legs.length,1);
 assert.equal(result.legs[0].gameId,base.gameId);
 const review=confirmLegs(result.legs,{...context,roster:[]});
 assert.deepEqual(review.unresolved,[]);
 assert.ok(lockParlay({id:'qa',legs:review.legs},true).lockedAt);
});
test('placement and NFL dates do not hide an upcoming fighter; an exact historic date still works',()=>{
 assert.equal(parse('Nov 13, 2026\nJosé Souza\nMoneyline').legs[0].gameId,base.gameId);
 assert.equal(parse('Nov 7, 2026\nJosé Souza\nMoneyline').legs[0].gameId,past.gameId);
});
test('FanDuel odds-separated and market-first names stay UFC and preserve neighboring NFL picks',()=>{
 for(const selection of ['José Souza\n-125\nMoneyline','Moneyline\nJosé Souza','Winner\nJosé Souza','José Souza −125\nMoneyline']){
  const result=parse('Packers\nMoneyline\n'+selection);
  assert.deepEqual(result.legs.map(l=>[l.category,l.gameId]),[['moneyline',game.schedule_id],['ufc_win',base.gameId]],selection);
 }
});
test('simultaneous ambiguous bouts stay in review and never silently choose one',()=>{
 const result=parseMixedSlip('José Souza\nMoneyline',[],{...context,dates:[],fights:[base,{...base,gameId:'ufc:1:5'}]});
 assert.equal(result.legs[0].kind,'ufc');
 assert.equal(result.legs[0].gameId,null);
});
test('a live bout wins over an upcoming rematch for an undated in-progress slip',()=>{
 const result=parseMixedSlip('José Souza\nMoneyline',[],{...context,dates:[],fights:[{...base,outcome:'live'},later]});
 assert.equal(result.legs[0].gameId,base.gameId);
});

