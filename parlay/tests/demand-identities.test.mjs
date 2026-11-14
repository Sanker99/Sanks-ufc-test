import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDemandIdentities} from '../../workers/parlay-demand/build-identities.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
function input(){return {catalog:{season:2026,games:{g:{week:7,date:'2026-10-26',home:'PHI',away:'DAL'}},players:{p:{team:'PHI',position:'QB'}}},roster:[{id:'p',name:"Alex O'Example",team:'PHI',position:'QB'}],matches:[{id:ids[0],sport:'american_football',league:'NFL',home:{id:ids[1],name:'Philadelphia Eagles',short_name:'PHI'},away:{id:ids[2],name:'Dallas Cowboys',short_name:'DAL'},kickoff_utc:'2026-10-26T17:00:00Z'}],players:[{id:ids[3],name:'Alex O’Example',sport:'american_football',league_name:'NFL',team_id:ids[1],team_name:'Philadelphia Eagles',position:'Quarterback'}],verifiedAt:'2026-10-31T00:00:00Z'};}
test('identity build verifies schedule dates, NFL team UUIDs, positions and unique full names',()=>{
 const result=buildDemandIdentities(input());assert.equal(result.manifest.games.g.providerId,ids[0]);assert.equal(result.manifest.players.p.providerId,ids[3]);
 for(const mutate of [x=>x.players[0].team_id=ids[2],x=>x.players[0].position=null,x=>x.players[0].name='Alex Example',x=>x.players[0].sport='basketball']){
  const x=input();mutate(x);assert.equal(Object.keys(buildDemandIdentities(x).manifest.players).length,0);
 }
});
test('duplicate provider identities, ambiguous names and conflicting schedule rows cannot be assigned',()=>{
 let x=input();x.players.push({...x.players[0],id:ids[4]});assert.equal(Object.keys(buildDemandIdentities(x).manifest.players).length,0);
 x=input();x.roster.push({...x.roster[0],id:'q'});assert.equal(Object.keys(buildDemandIdentities(x).manifest.players).length,0);
 x=input();x.matches.push({...x.matches[0],id:ids[4]});assert.throws(()=>buildDemandIdentities(x),/Conflicting source game/);
 x=input();x.matches[0].kickoff_utc='2026-10-27T17:00:00Z';assert.equal(Object.keys(buildDemandIdentities(x).manifest.games).length,0);
 x=input();x.matches[0].home.short_name='DAL';assert.throws(()=>buildDemandIdentities(x),/Unverified NFL/);
});

