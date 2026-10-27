// Connection diagnostics only: these sources do not provide live player totals.
const sources = [
 {id:'sleeper-state',url:'https://api.sleeper.app/v1/state/nfl',format:'json'},
 {id:'nflverse-schedule',url:'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',format:'csv'}
];
const MAX_BYTES = 4_000_000;
async function boundedText(response) {
 if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('Response too large');
 const reader = response.body.getReader(), decoder = new TextDecoder();
 let size = 0, text = '';
 try {
  while (true) {
   const {value,done} = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > MAX_BYTES) throw Error('Response too large');
   text += decoder.decode(value,{stream:true});
  }
  return text + decoder.decode();
 } finally { await reader.cancel().catch(()=>{}); }
}
export async function probeSources(fetcher = (url, options) => globalThis.fetch(url, options), now = Date.now) {
 return Promise.all(sources.map(async source => {
  const start = now(), controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),8000);
  try {
   const response = await fetcher(source.url,{signal:controller.signal,redirect:'manual'});
   if (!response.ok) return {id:source.id,status:response.status,ok:false,latencyMs:now()-start};
   const text = await boundedText(response);
   let schemaValid = false;
   if (source.format === 'json') {
    const state = JSON.parse(text);
    schemaValid = /^\d{4}$/.test(String(state.season)) && Number.isInteger(state.week) && typeof state.season_type === 'string';
   } else {
    const columns = text.split(/\r?\n/,1)[0].split(',');
    schemaValid = ['game_id','season','gameday','home_team','away_team','espn'].every(name=>columns.includes(name)) && text.split('\n').length > 2;
   }
   return {id:source.id,status:response.status,ok:schemaValid,schemaValid,latencyMs:now()-start};
  } catch (error) {
   return {id:source.id,ok:false,error:error.name === 'AbortError'?'timeout':'source unavailable or invalid',failure:failureReason(error),latencyMs:now()-start};
  } finally { clearTimeout(timeout); }
 }));
}
export async function onRequestGet(context) {
 const key = new Request(new URL('/api/parlay/health',context.request.url),{method:'GET'});
 const cache = globalThis.caches?.default;
 const hit = await cache?.match(key);
 if (hit) return publicResponse(await hit.text(),'HIT');
 const sources = await probeSources();
 const body = JSON.stringify({runtime:'Cloudflare Pages Functions',observedAt:new Date().toISOString(),liveTrackingEnabled:false,sources,limitations:['Connection checks only; no live player statistics or settlement verification.']});
 if (cache) context.waitUntil(cache.put(key,new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}})));
 return publicResponse(body,'MISS');
}
function publicResponse(body,cache) {
 return new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Parlay-Cache':cache,'X-Content-Type-Options':'nosniff'}});
}

function failureReason(error) {
 const message = String(error.message);
 if (/illegal invocation|this.*reference/i.test(message)) return 'runtime receiver';
 if (/redirect/i.test(message)) return 'redirect rejected';
 if (/too large/i.test(message)) return 'response too large';
 if (/json|unexpected token/i.test(message)) return 'invalid JSON';
 return error.name === 'AbortError' ? 'timeout' : 'request or response failed';
}
