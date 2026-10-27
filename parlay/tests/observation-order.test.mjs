import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRepository,recordObservations,parseBackup} from '../core.mjs';
import {progressMarkup} from '../progress.mjs';
const leg=(id,gameId='2026_08_TEST_GAME')=>({playerId:id,playerName:'QA Player '+id,team:'LV',gameId,season:2026,category:'rushing_yards',operator:'>=',target:40,verificationStatus:'confirmed'});
const p={id:'observation-order',name:'LOCAL QA — NOT LIVE',lockedAt:'2026-10-26T12:00:00Z',timeZone:'America/Chicago',legs:[leg('one'),leg('two','other-game')]};
const at=minute=>'2026-10-26T18:'+String(minute).padStart(2,'0')+':00Z';
const snapshot=(selection,value,minute=0,overrides={})=>({playerId:selection.playerId,gameId:selection.gameId,season:2026,status:'live',participated:true,verified:true,metrics:{rushing_yards:value},observedAt:at(minute),source:'LOCAL QA — NOT LIVE',...overrides});
function setup(){const map=new Map(),r=new BrowserRepository({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)});r.save(p);return r;}
test('partial updates retain other games across polls and browser repository reloads',()=>{
 const r=setup();recordObservations(r,p,[snapshot(p.legs[0],32),snapshot(p.legs[1],20)]);
 const next=recordObservations(r,p,[snapshot(p.legs[0],40,1)]);
 assert.deepEqual(next.result.legs.map(row=>row.progress.current),[40,20]);
 assert.deepEqual(r.list()[0].result,next.result);
});
test('a late stale response cannot reverse a newer bar or verified final',()=>{
 const r=setup();recordObservations(r,p,[snapshot(p.legs[0],45,3,{status:'final',finalVerified:true})]);
 const next=recordObservations(r,p,[snapshot(p.legs[0],12,1)]);
 assert.equal(next.result.legs[0].state,'Final Hit');assert.equal(next.result.legs[0].progress.current,45);
 assert.equal(next.result.legs[0].observedAt,at(3));
});
test('a newer correction can reverse a prior final even with a stale caller object',()=>{
 const r=setup();recordObservations(r,p,[snapshot(p.legs[0],45,1,{status:'final',finalVerified:true}),snapshot(p.legs[1],50,1,{status:'final',finalVerified:true})]);
 const next=recordObservations(r,p,[snapshot(p.legs[0],32,2,{status:'final',finalVerified:true})]);
 assert.equal(next.result.status,'lost');assert.equal(next.result.legs[1].state,'Final Hit');
 assert.equal(next.result.legs[0].progress.tone,'red');
});
test('empty, malformed-time and wrong-identity batches preserve the saved result',()=>{
 const r=setup();const first=recordObservations(r,p,[snapshot(p.legs[0],32)]);
 for(const rows of [[],[snapshot(p.legs[0],90,1,{observedAt:'bad'})],[snapshot(p.legs[0],90,1,{gameId:'wrong'})],[snapshot(p.legs[0],90,1,{season:2025})]]){
  assert.deepEqual(recordObservations(r,p,rows).result,first.result);
 }
});
test('replayed observations and conflicting equal timestamps cannot flicker saved results',()=>{
 const r=setup();const first=recordObservations(r,p,[snapshot(p.legs[0],32)]);
 assert.deepEqual(recordObservations(r,p,[snapshot(p.legs[0],90)]).result,first.result);
});
test('newer explicit unavailability clears a stale value without settling the leg',()=>{
 const r=setup();recordObservations(r,p,[snapshot(p.legs[0],45)]);
 const next=recordObservations(r,p,[snapshot(p.legs[0],0,2,{verified:false,metrics:{}})]);
 assert.equal(next.result.legs[0].progress.available,false);assert.equal(next.result.legs[0].resolved,false);
 assert.equal(next.result.legs[0].observedAt,at(2));assert.equal(next.result.status,'active');
});
test('selection immutability survives observation refresh and drafts reject observations',()=>{
 const r=setup();const next=recordObservations(r,p,[snapshot(p.legs[0],32)]);
 assert.deepEqual(next.legs,p.legs);assert.equal(next.lockedAt,p.lockedAt);
 assert.throws(()=>r.save({...next,legs:[{...p.legs[0],playerName:'changed'},p.legs[1]]}),/Locked/);
 const draft={...p,id:'draft',lockedAt:null};r.save(draft);assert.throws(()=>recordObservations(r,draft,[]),/Lock/);
});
test('timestamps survive backup round trips; malformed and inconsistent timestamps reject atomically',()=>{
 const r=setup();const saved=recordObservations(r,p,[snapshot(p.legs[0],32)]);
 assert.equal(parseBackup({version:1,parlays:[saved]}).parlays[0].result.legs[0].observedAt,at(0));
 for(const field of ['row','progress','mismatch']){
  const bad=structuredClone(saved);
  if(field==='row')bad.result.legs[0].observedAt='bad';
  if(field==='progress')bad.result.legs[0].progress.observedAt='bad';
  if(field==='mismatch')bad.result.legs[0].progress.observedAt=at(2);
  assert.throws(()=>parseBackup({version:1,parlays:[bad]}),/invalid backup/i);
 }
});
test('bars show escaped semantic check times and accept legacy untimed progress',()=>{
 const r=setup();const saved=recordObservations(r,p,[snapshot(p.legs[0],32)]);
 const html=progressMarkup(p.legs[0],saved.result.legs[0].progress);
 assert.match(html,/<time datetime="2026-10-26T18:00:00Z">Checked /);
 const old={...saved.result.legs[0].progress};delete old.observedAt;
 assert.doesNotMatch(progressMarkup(p.legs[0],old),/<time/);
 assert.doesNotMatch(progressMarkup(p.legs[0],{...old,observedAt:'<script>alert(1)</script>'}),/<script/);
});

test('matching cached stats can become final at the same timestamp without changing values',()=>{
 const r=setup();recordObservations(r,p,p.legs.map(l=>snapshot(l,45)));
 const next=recordObservations(r,p,p.legs.map(l=>snapshot(l,45,0,{status:'final',finalVerified:true})));
 assert.equal(next.result.status,'won');assert.ok(next.result.legs.every(l=>l.state==='Final Hit'));assert.deepEqual(next.legs,p.legs);
});

test('equal-timestamp conflicting finals and older finals cannot promote provisional results',()=>{
 for(const [value,minute]of [[32,1],[45,0]]){
 const r=setup(),before=recordObservations(r,p,[snapshot(p.legs[0],45,1)]);
 const next=recordObservations(r,p,[snapshot(p.legs[0],value,minute,{status:'final',finalVerified:true})]);assert.deepEqual(next.result,before.result);
 }
});
