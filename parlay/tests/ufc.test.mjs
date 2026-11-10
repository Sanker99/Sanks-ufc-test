import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUfcEvents,makeUfcLeg,parseUfcSelections,ufcObservationReport} from '../ufc.mjs';
import {confirmLegs,evaluateParlay,lockParlay,parseBackup} from '../core.mjs';
import {demandGames} from '../demand-client.mjs';
import {ufcResponse} from '../../functions/api/parlay/ufc.js';
const date='2026-11-07', timeZone='America/Chicago', checked='2026-11-08T08:00:00Z';
const participant=(id,displayName,winner)=>({id,athlete:{displayName},winner});
const bout={id:'401928118',date:'2026-11-07T22:00Z',
 competitors:[participant('4880114','Jonny Parsons',false),participant('5080485','José Souza',true)],
 format:{regulation:{periods:3}},status:{period:1,displayClock:'4:16',type:{name:'STATUS_FINAL',state:'post',completed:true}},
 details:[{type:{id:'21',text:'Unofficial Winner Kotko'}}]};
const event={id:'600061268',date:bout.date,name:'UFC Fight Night',competitions:[bout]};
const [fight]=normalizeUfcEvents({events:[event]},checked);
const lock=(...legs)=>{
 const result=confirmLegs(legs,{fights:[fight],timeZone,roster:[],games:[],season:2026});
 assert.equal(result.unresolved.length,0);
 return lockParlay({id:'test',timeZone,legs:result.legs},true,checked);
};
const pick=(category,target=1,operator='>=')=>makeUfcLeg(fight,category,'5080485',operator,target,timeZone);
test('post-fight UFC slips resolve winner, method, exact round, distance and round totals',()=>{
 const card=lock(pick('ufc_win'),pick('ufc_ko'),pick('ufc_round'),pick('ufc_distance',0),pick('ufc_rounds',1.5,'<'));
 const result=evaluateParlay(card,ufcObservationReport(fight).observations);
 assert.equal(result.status,'won');
 assert.ok(result.legs.every(l=>l.state==='Final Hit'));
 assert.equal(parseBackup({version:1,parlays:[{...card,result}]}).parlays.length,1);
 assert.deepEqual(demandGames([card]),[]);
 assert.equal(evaluateParlay(lock(pick('ufc_round',2)),ufcObservationReport(fight).observations).status,'lost');
});
test('wrong bout, no contest, ambiguous winner and missing method cannot settle unsupported evidence',()=>{
 const card=lock(pick('ufc_ko'));
 for(const altered of [{...bout,id:'2'},{...bout,details:[]},{...bout,competitors:bout.competitors.map(x=>({...x,winner:false}))}]){
  const [other]=normalizeUfcEvents({events:[{...event,competitions:[altered]}]},checked);
  assert.equal(evaluateParlay(card,ufcObservationReport(other).observations).status,'active');
 }
 assert.equal(normalizeUfcEvents({events:[{...event,competitions:[bout,bout]}]},checked).length,0);
});
test('UFC scan uses exact fighter, event date and matchup, including a rematch',()=>{
 const text='José Souza\nMoneyline\nJonny Parsons vs José Souza\nUnder 1.5 Rounds';
 const legs=parseUfcSelections(text,[fight],{date,timeZone});
 assert.deepEqual(legs.map(l=>[l.gameId,l.category,l.playerId]),[[fight.gameId,'ufc_win','5080485'],[fight.gameId,'ufc_rounds','fight']]);
 assert.equal(parseUfcSelections(text,[fight,{...fight,gameId:'ufc:1:2'}],{date,timeZone})[0].gameId,null);
 assert.equal(parseUfcSelections('José Souza to win in round 1 or 2',[fight],{date,timeZone})[0].category,'unsupported');
});
test('UFC relay accepts bounded date queries and returns an allowlisted bout shape',async()=>{
 const request=new Request('https://sanks-parlay-feed.pages.dev/api/parlay/ufc?date='+date);
 const res=await ufcResponse(request,{now:Date.parse(checked),fetchSource:async url=>{
  assert.equal(url,'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261106-20261108');
  return Response.json({events:[event]});
 }});
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).fights,[{...fight,checkedAt:new Date(checked).toISOString()}]);
 const invalid=await ufcResponse(new Request('https://test/api/parlay/ufc?date=2026-02-31'),{now:Date.parse(checked),fetchSource:()=>assert.fail()});
 assert.equal(invalid.status,400);
});
