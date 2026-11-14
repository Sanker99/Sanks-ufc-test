import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemandCoordinator} from '../../workers/parlay-demand/coordinator.mjs';
import identities from '../../workers/parlay-demand/identities.mjs';
import {createLiveSync} from '../live-sync.mjs';
import {parseSlipFinances,financialTotals} from '../slip-summary.mjs';
import {mergeTrackerRoster} from '../roster-additions.mjs';
import {parseSlipDetailed} from '../core.mjs';

test('new week game added after kickoff discovers the matchup, reads player stats and verifies the final',async()=>{
 const gameId='2026_09_DAL_IND',kickoff='2026-11-08T18:00:00.000Z',old=identities.games['2026_08_IND_JAX'],dal=identities.games['2026_08_ARI_DAL'];
 const id='42424242-4242-4242-8242-424242424242';
 const match={id,kickoff_utc:kickoff,sport:'american_football',league:'NFL',status:'finished',home:{id:old.awayId,name:'Indianapolis Colts',short_name:'IND'},away:{id:dal.homeId,name:'Dallas Cowboys',short_name:'DAL'},score:{home:17,away:24}};
 const player=Object.entries(identities.players).find(([,p])=>p.team==='DAL'&&p.position==='QB');
 let now=Date.parse('2026-11-08T22:00:00Z'),state,alarm;
 const storage={get:async()=>structuredClone(state),put:async(k,v)=>{state=structuredClone(v);},setAlarm:async n=>{alarm=n;},deleteAlarm:async()=>{alarm=null;}};
 const c=new DemandCoordinator({storage},{BBS_API_KEY:'test-only'});c.now=()=>now;
 let scheduleReads=0,gameReads=0;
 c.fetcher=async url=>{
  if(url.includes('/matches?')){scheduleReads++;assert.match(url,/date=2026-11-08/);return Response.json({data:[match]});}
  gameReads++;assert.ok(url.includes(id));
  if(url.includes('/matches/'))return Response.json({data:match});
  return Response.json({data:{match_id:id,sport:'american_football',status:'finished',teams:[{team_name:'Indianapolis Colts',stat_groups:[]},{team_name:'Dallas Cowboys',stat_groups:[{type:'players',keys:['passingYards','passingAttempts'],players:[{player_id:player[1].providerId,name:player[1].name,stats:['195','26']}]}]}]},meta:{as_of:'2026-11-08T21:30:00.000Z',stale:false}});
 };
 const read=async()=> (await c.fetch(new Request('https://collector/game?gameId='+gameId))).json();
 await c.fetch(new Request('https://collector/register',{method:'POST',body:JSON.stringify({games:[gameId]})}));
 assert.equal(scheduleReads,0);assert.equal(alarm,now+1000);assert.match((await read()).reason,/Waiting/);
 await c.alarm();let r=await read();assert.equal(scheduleReads,1);assert.equal(gameReads,2);assert.equal(r.observations.find(o=>o.playerId===player[0]).metrics.passing_yards,195);
 assert.equal(r.finalResultsEnabled,false);now+=300001;await c.alarm();r=await read();
 assert.equal(scheduleReads,1);assert.equal(gameReads,4);assert.equal(r.finalResultsEnabled,true);assert.equal(state.used,5);
});

test('a newly added game gets a read even when six existing games are already tracked',async()=>{
 const cards=Array.from({length:6},(_,i)=>({id:String(i),lockedAt:'2026-11-08T18:00:00Z',legs:[{gameId:'old-'+i,season:2026}]})),reads=[];
 const sync=createLiveSync({repository:{list:()=>cards},isVisible:()=>true,fetchGame:async g=>{reads.push(g.gameId);return {gameId:g.gameId,season:g.season,observations:[]};}});
 await sync.refresh(true);
 cards.push({id:'new',lockedAt:'2026-11-08T22:00:00Z',legs:[{gameId:'late-game',season:2026}]});
 await sync.refresh(true);assert.equal(reads[6],'late-game');
});

test('scanned wager shorthand and OCR spacing are read, and payout yields net winnings',()=>{
 const {finances,warnings}=parseSlipFinances('Bet: $ 10 . 00\nPotential Winnings: $ 1, 234 . 56\nBet ID 7782');
 assert.deepEqual(finances,{currency:'USD',stakeCents:1000,payoutCents:null,profitCents:123456});assert.deepEqual(warnings,[]);
 assert.equal(financialTotals(parseSlipFinances('Total Wager $10\nTotal Payout $30').finances).profit,2000);
 assert.equal(parseSlipFinances('Bet ID 7782\nBalance $80').finances.stakeCents,null);
});

test('FanDuel Total Charged and Total Payout survive line wraps and OCR spacing',()=>{
 const r=parseSlipFinances('Total\nCharged\n$ 10 . 00\nTotal\nPayout\n$ 1, 234 . 56');
 assert.deepEqual(r.finances,{currency:'USD',stakeCents:1000,payoutCents:123456,profitCents:null});assert.deepEqual(r.warnings,[]);
});

test('Jacobs can be selected and imported; verified catalog records win duplicate Lab entries',()=>{
 const games=[{schedule_id:'2026_09_GB_NE',week:9,home:'NE',away:'GB',date:'2026-11-08'}];
 const roster=mergeTrackerRoster([], [{id:'00-0035700',name:'Old Jacobs',team:'NE',position:'RB'},{id:'00-9999999',name:'New Lab Receiver',team:'NE',position:'WR'}],2026,games);
 assert.equal(roster.find(p=>p.id==='00-0035700').team,'GB');assert.equal(roster.length,2);
 const r=parseSlipDetailed('Josh Jacobs\n40+ Rushing Yards\nTotal Charged $10.00\nTotal Payout $30.00',roster,{season:2026,games,gameDate:'2026-11-08'});
 assert.equal(r.legs[0].playerId,'00-0035700');assert.equal(r.legs[0].gameId,'2026_09_GB_NE');assert.equal(r.finances.stakeCents,1000);
});
