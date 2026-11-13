import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as demand from '../../functions/api/parlay/demand.js';
import * as game from '../../functions/api/parlay/game.js';
import * as health from '../../functions/api/parlay/health.js';
for(const [name,route] of [['demand',demand],['game',game],['health',health]])test(name+' deployed route exports and handles browser OPTIONS preflight',async()=>{
 assert.equal(typeof route.onRequestOptions,'function');let forwarded=0;
 const response=await route.onRequestOptions({request:new Request('https://sanks-parlay-feed.pages.dev/api/parlay/'+name,{method:'OPTIONS',headers:{Origin:'https://sanksresearchlab.pages.dev','Access-Control-Request-Method':name==='demand'?'POST':'GET','Access-Control-Request-Headers':'content-type'}}),env:{PARLAY_FEED:{fetch:()=>{forwarded++;}}}});
 assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://sanksresearchlab.pages.dev');assert.match(response.headers.get('Access-Control-Allow-Headers'),/Content-Type/i);assert.equal(forwarded,0);
});
test('demand route preserves allowed-origin JSON registration through its actual handler',async()=>{
 let called=false;const response=await demand.onRequestPost({request:new Request('https://sanks-parlay-feed.pages.dev/api/parlay/demand',{method:'POST',headers:{Origin:'https://sanksresearchlab.pages.dev','Content-Type':'application/json'},body:JSON.stringify({games:['2026_08_ARI_DAL']})}),env:{PARLAY_FEED:{fetch:async request=>{called=true;assert.equal(new URL(request.url).pathname,'/register');assert.deepEqual(await request.json(),{games:['2026_08_ARI_DAL']});return Response.json({expiresAt:'2026-11-02T16:00:00Z',refreshAfterMs:60000});}}}});
 assert.equal(response.status,200);assert.equal(called,true);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://sanksresearchlab.pages.dev');
});
