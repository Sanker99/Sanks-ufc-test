import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyOfficialFight,officialBout} from '../ufc-official.mjs';
import {ufcObservationReport,makeUfcLeg} from '../ufc.mjs';
import {evaluateParlay} from '../core.mjs';
const real=JSON.parse(fs.readFileSync(new URL('./fixtures/ufc-official-final.json',import.meta.url)));
const upcoming=JSON.parse(fs.readFileSync(new URL('./fixtures/ufc-official-upcoming.json',import.meta.url)));
const fight={gameId:'ufc:600061268:401928118',season:2026,date:'2026-11-07T22:00Z',scheduledFor:'2026-11-07T22:00Z',rounds:3,outcome:'final',
 fighters:[{id:'4880114',name:'Jonny Parsons'},{id:'5080485',name:'José Souza'}]};
const context={eventId:1343,fightId:13188,now:Date.parse('2026-11-08T04:00Z')};
function mapped(p=real){return applyOfficialFight(fight,p,context);}
function grade(f,category='ufc_sig_strikes',target=30){
 const l=makeUfcLeg(fight,category,'5080485','>=',target,'America/Chicago');
 return evaluateParlay({lockedAt:'2026-11-07T21:00Z',legs:[l]},ufcObservationReport(f).observations).legs[0];
}
test('real official final feed immediately supplies verified landed totals and result props',()=>{
 const f=mapped();assert.equal(f.winnerId,'5080485');assert.equal(f.method,'ko');assert.equal(f.finishRound,1);assert.equal(f.length,256);
 assert.deepEqual(f.fighters[1].stats,{ufc_sig_strikes:33,ufc_takedowns:0});
 assert.equal(f.fighters[1].statsFinalVerified,true);
 assert.equal(grade(f).state,'Final Hit');assert.equal(grade(f,'ufc_win',1).state,'Final Hit');
});
test('live stats update provisionally without settling winner or method',()=>{
 const p=structuredClone(real),d=p.LiveFightDetail;d.Status='Live';d.OfficialStats=false;
 d.Result={Method:null,EndingRound:null,EndingTime:null};d.Fighters.forEach(f=>f.Outcome={Outcome:null});
 const f=mapped(p),r=ufcObservationReport(f);
 assert.equal(f.outcome,'live');assert.equal(r.nextPollMs,15000);assert.equal(grade(f).state,'Provisionally Hit');
 assert.equal(grade(f,'ufc_win',1).progress.available,false);
});
test('official decision and doctor-stoppage labels map to supported victory-method props',()=>{
 for(const method of ['Decision - Unanimous','Decision - Split','Decision - Majority']){
  const p=structuredClone(real),d=p.LiveFightDetail;d.Result.Method=method;d.Result.EndingRound=3;d.Result.EndingTime='5:00';
  const f=mapped(p);assert.equal(f.method,'decision');assert.equal(grade(f,'ufc_decision',1).state,'Final Hit');
  const l=makeUfcLeg(fight,'ufc_distance','fight','>=',1,'America/Chicago');
  assert.equal(evaluateParlay({lockedAt:'2026-11-07T21:00Z',legs:[l]},ufcObservationReport(f).observations).legs[0].state,'Final Hit');
 }
 const p=structuredClone(real);p.LiveFightDetail.Result.Method="TKO - Doctor's Stoppage";
 assert.equal(mapped(p).method,'ko');assert.equal(grade(mapped(p),'ufc_ko',1).state,'Final Hit');
});
test('final result settles while unconfirmed stat totals remain provisional and continue fast polling',()=>{
 const p=structuredClone(real);p.LiveFightDetail.OfficialStats=false;
 const f=mapped(p);assert.equal(grade(f,'ufc_win',1).state,'Final Hit');assert.equal(grade(f).state,'Provisionally Hit');
 assert.equal(ufcObservationReport(f).nextPollMs,15000);
});
test('missing rounds or inconsistent total cannot become final fighter statistics',()=>{
 for(const change of [d=>d.RoundStats=[],d=>d.FightStats[1].SigStrikesLanded=34]){
  const p=structuredClone(real);change(p.LiveFightDetail);assert.equal(grade(mapped(p)).resolved,false);
 }
});
test('wrong event, bout, date, duplicate fighter, and impossible landed counts are rejected',()=>{
 for(const change of [d=>d.Event.EventId=1,d=>d.FightId=1,d=>d.Event.StartTime='2026-11-01T22:00Z',d=>d.Fighters[0]=d.Fighters[1]]){
  const p=structuredClone(real);change(p.LiveFightDetail);assert.equal(mapped(p),null);
 }
 const p=structuredClone(real);p.LiveFightDetail.FightStats[1].SigStrikesLanded=10000;
 assert.equal(mapped(p).fighters[1].stats,undefined);
});
test('upcoming bout returns no synthetic zero totals',()=>{
 const f={...fight,date:'2026-11-14T22:00Z',fighters:[{id:'1',name:'Evan Elder'},{id:'2',name:'Samuel Sanches'}]};
 const r=applyOfficialFight(f,upcoming,{eventId:1345,fightId:13236,now:Date.parse('2026-11-14T17:00Z')});
 assert.equal(r.outcome,'pregame');assert.deepEqual(ufcObservationReport(r).observations,[]);
});
test('event discovery requires both exact fighter names in a unique bout',()=>{
 const bout=real.LiveFightDetail,event={...bout.Event,FightCard:[bout]};
 assert.equal(officialBout(event,fight).FightId,13188);
 assert.equal(officialBout({...event,FightCard:[bout,bout]},fight),null);
 assert.equal(officialBout(event,{...fight,fighters:[fight.fighters[0],{id:'3',name:'Other Fighter'}]}),null);
});

