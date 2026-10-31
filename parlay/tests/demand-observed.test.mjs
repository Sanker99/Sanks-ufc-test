import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/bigballs-observed.json' with {type:'json'};
import {DemandCoordinator} from '../../workers/parlay-demand/coordinator.mjs';
import {validateMatch,mapBoxscore} from '../../workers/parlay-demand/provider.mjs';
import {evaluateParlay} from '../core.mjs';
test('observed free NFL payload produces exact QB totals and requires a second final check',async()=>{
 const {gameId,game,players,box,match}=fixture;let clock=Date.parse('2026-10-31T17:00:00Z'),calls=0;const memory=new Map();
 const storage={get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v)),setAlarm:async()=>{},deleteAlarm:async()=>{}};
 const c=new DemandCoordinator({storage},{BBS_API_KEY:'test-only',BBS_IDENTITIES:JSON.stringify({version:1,games:{[gameId]:game},players})});c.now=()=>clock;
 c.fetcher=async url=>{calls++;return Response.json(url.includes('/matches/')?match:box);};
 validateMatch(match,game);
 const mapped=mapBoxscore(box,{gameId,game,players,now:clock});
 assert.equal(mapped.observations.find(p=>p.playerId==='00-0036264').metrics.passing_yards,288);
 assert.equal(mapped.observations.find(p=>p.playerId==='00-0039150').metrics.passing_yards,200);
 await c.fetch(new Request('https://collector/register',{method:'POST',body:JSON.stringify({games:[gameId]})}));await c.alarm();
 let report=await (await c.fetch(new Request('https://collector/game?gameId='+gameId))).json();
 const card={lockedAt:new Date(clock).toISOString(),legs:[{gameId,season:2026,team:'GB',playerId:'00-0036264',category:'passing_yards',operator:'>=',target:250},{gameId,season:2026,team:'GB',category:'moneyline'}]};
 assert.equal(evaluateParlay(card,report.observations).status,'active');assert.equal(report.finalResultsEnabled,false);assert.equal(calls,2);
 clock+=300001;await c.alarm();report=await (await c.fetch(new Request('https://collector/game?gameId='+gameId))).json();
 assert.equal(report.finalResultsEnabled,true);assert.equal(evaluateParlay(card,report.observations).status,'won');assert.equal(calls,4);
 assert.doesNotMatch(JSON.stringify(report),/providerId|providerGameId|test-only/);
});

