const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Pure VM test: never evaluates the page or calls window.open/network APIs.
const file=process.env.APPROVED_EXPERIENCE || 'approved-update/assets/experience.js';
const source=fs.readFileSync(file,'utf8');
const block=source.slice(source.indexOf('// Tits McGee novelty link:'),source.indexOf('function openForTheBoys(event)'));
function session(store,broken=false){
 const context=vm.createContext({localStorage:{getItem:k=>{if(broken)throw Error();return store[k]||null},setItem:(k,v)=>{if(broken)throw Error();store[k]=v}}});
 vm.runInContext(block,context);
 return ()=>vm.runInContext('nextForTheBoysUrl()',context);
}
test('19 unique destinations per cycle; no repeat at cycle boundary',()=>{
 const next=session({});let last;
 for(let cycle=0;cycle<100;cycle++){
  const values=Array.from({length:19},next);
  assert.equal(new Set(values).size,19);assert.notEqual(values[0],last);last=values.at(-1);
 }
});
test('rotation survives reload between every selection',()=>{
 const store={};const values=Array.from({length:19},()=>session(store)());
 assert.equal(new Set(values).size,19);assert.notEqual(session(store)(),values.at(-1));
});
test('corrupt or unavailable storage recovers',()=>{
 for(const bad of ['{','null','{"queue":[0,0],"last":0}','{"queue":[99],"last":0}','{"queue":[],"last":99}']){
  const next=session({'sanks-for-the-boys-rotation-v2':bad});
  assert.equal(new Set(Array.from({length:19},next)).size,19);
 }
 assert.equal(new Set(Array.from({length:19},session({},true))).size,19);
});
