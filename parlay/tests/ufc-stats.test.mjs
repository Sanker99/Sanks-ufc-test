import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUfcEvents,makeUfcLeg,ufcObservationReport,parseUfcSelections} from '../ufc.mjs';
import {confirmLegs,evaluateParlay,lockParlay} from '../core.mjs';
import {trackedGames} from '../live-sync.mjs';
import {ufcResponse} from '../../functions/api/parlay/ufc.js';

const at='2026-11-07T23:00:00Z', date='2026-11-07', timeZone='America/Chicago';
const bout={id:'401928118',date:at,competitors:[
 {id:'4880114',athlete:{displayName:'Jonny Parsons'}},
 {id:'5080485',athlete:{displayName:'José Souza'},winner:true}
],status:{type:{name:'STATUS_IN_PROGRESS',state:'in',completed:false}}};
const event={id:'600061268',date:at,name:'UFC Fight Night',competitions:[bout]};
const [fight]=normalizeUfcEvents({events:[event]},at);
const final={...fight,outcome:'final',winnerId:'5080485'};

test('a UFC stat slip imports both landed metrics and receives live, then final results',()=>{
 const legs=parseUfcSelections('José Souza\n25+ Significant Strikes\nJosé Souza Under 0.5 Takedowns',[fight],{date,timeZone});
 const review=confirmLegs(legs,{fights:[fight],roster:[],games:[],season:2026,timeZone});
 assert.equal(review.unresolved.length,0);
 const card=lockParlay({id:'stats',legs:review.legs},true);
 assert.deepEqual(card.legs.map(l=>[l.category,l.operator,l.target]),[['ufc_sig_strikes','>=',25],['ufc_takedowns','<',0.5]]);
 assert.equal(trackedGames([card])[0].ufcStats,true);
 const withStats=f=>({...f,fighters:f.fighters.map(p=>p.id==='5080485'?{...p,stats:{ufc_sig_strikes:33,ufc_takedowns:0}}:p)});
 const live=ufcObservationReport(withStats(fight));
 assert.equal(live.nextPollMs,30000);
 assert.equal(live.finalResultsEnabled,false);
 assert.deepEqual(evaluateParlay(card,live.observations).legs.map(l=>l.state),['Provisionally Hit','Provisionally Hit']);
 assert.equal(evaluateParlay(card,ufcObservationReport(withStats(final)).observations).status,'won');
 assert.equal(evaluateParlay(card,ufcObservationReport(final).observations).status,'active');
});

test('the live gateway requests only the verified bout fighters and preserves explicit zero',async()=>{
 const route='https://sanks-parlay-feed.pages.dev/api/parlay/ufc?date='+date+'&fightId='+encodeURIComponent(fight.gameId);
 const hits=[];
 const response=await ufcResponse(new Request(route),{now:Date.parse(at),fetchSource:async url=>{
  hits.push(url);
  if(url.includes('scoreboard'))return Response.json({events:[event]});
  const expected='/events/600061268/competitions/401928118/competitors/';
  assert.ok(url.includes(expected));
  const ref=url.split('?')[0].replace('https:','http:')+'/0?lang=en&region=us';
  return Response.json({$ref:url.includes('5080485')?ref:ref.replace('4880114','9999999'),splits:{categories:[{name:'general',stats:[
   {name:'sigStrikesLanded',value:33},{name:'takedownsLanded',value:0},{name:'takedownsAttempted',value:3}
  ]}]}});
 }});
 assert.equal(response.status,200);
 assert.equal(hits.length,3);
 const [mapped]=(await response.json()).fights;
 assert.equal(mapped.outcome,'live');
 assert.deepEqual(mapped.fighters[1].stats,{ufc_sig_strikes:33,ufc_takedowns:0});
 assert.equal(mapped.fighters[0].stats,undefined);
});
