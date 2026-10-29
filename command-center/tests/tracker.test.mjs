import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile(new URL('../tracker.js',import.meta.url),'utf8');
function tracker(hash='#/news',privacy={}){
  const calls=[],handlers={},requests=[],pending=[];
  const storage=new Map();
  const context={location:{pathname:'/',hash},navigator:{...privacy},crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},URLSearchParams,AbortSignal,Date,Promise,JSON,String,setTimeout,clearTimeout,
    document:{referrer:'https://search.example/?private=query',readyState:'loading',addEventListener:(type,fn)=>handlers[type]=fn},
    fetch:async(url,options)=>{requests.push(JSON.parse(options.body));await new Promise(resolve=>pending.push(resolve));return new Response(null,{status:204})},
    ufcEvents:[{id:'event-123'}],ufcEvent:{id:'event-123',competitions:[{id:'bout-456'}]}};
  context.window={addEventListener:(type,fn)=>handlers[type]=fn};vm.runInNewContext(code,context);
  return {context,handlers,requests,pending,async flush(){for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(pending.length)pending.shift()();else break}await new Promise(resolve=>setImmediate(resolve))}};
}
test('tracker serializes events with one anonymous visitor identifier',async()=>{const t=tracker('#/athlete/NCAA/123');await new Promise(r=>setImmediate(r));assert.equal(t.requests.length,1);assert.equal(t.requests[0].kind,'page');t.pending.shift()();await t.flush();assert.equal(t.requests.length,2);assert.equal(t.requests[1].kind,'player');assert.equal(t.requests[1].sport,'NCAA');assert.equal(t.requests[0].visitorId,t.requests[1].visitorId);assert.match(t.requests[0].visitorId,/^[0-9a-f-]{36}$/)});
test('league switch is tracked without recording raw query parameters',async()=>{const t=tracker('#/streaks?league=NCAA&q=secret');await t.flush();assert.equal(t.requests[1].kind,'streak');assert.equal(t.requests[1].sport,'NCAA');t.context.location.hash='#/streaks?league=UFC&q=other-secret';t.handlers.hashchange();await t.flush();assert.equal(t.requests[3].sport,'UFC');assert.ok(!JSON.stringify(t.requests).includes('other-secret'))});
test('UFC interactions use stable published identities and NCAA conference clicks are supported',async()=>{const t=tracker();await t.flush();for(const dataset of [{ufcEvent:'0'},{bout:'0'},{conference:'Big Ten'},{collegeGame:'college-1'},{labStat:'rushing_yards'}])t.handlers.click({target:{closest:()=>({dataset})}});await t.flush();assert.equal(t.requests[1].entity,'event-123');assert.equal(t.requests[2].entity,'event-123|bout-456');assert.equal(t.requests[3].kind,'conference');assert.equal(t.requests[4].sport,'NCAA');assert.equal(t.requests[5].kind,'statistic')});
test('privacy preferences prevent all collection setup',async()=>{for(const privacy of [{doNotTrack:'1'},{globalPrivacyControl:true}]){const t=tracker('#/news',privacy);await t.flush();assert.equal(t.requests.length,0);assert.equal(t.context.window.sanksTrack,undefined)}});
