const PREVIEWS=new Set(['feature-parlay-demand-live-s.sanks-parlay-demand-preview.pages.dev','feature-parlay-demand-live-stats.sanks-parlay-demand-preview.pages.dev','sanks-parlay-demand-preview.pages.dev','feature-parlay-demand-live-stats.sanks-ufc-preview.pages.dev']);
export async function feedRequest(context,path){
 const {request,env}=context,url=new URL(request.url);
 // Never activate this replacement on the preserved V4 host or production.
 if(!PREVIEWS.has(url.hostname)&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')return unavailable('Demand feed is restricted to its isolated preview');
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin||!(request.headers.get('content-type')??'').startsWith('application/json'))return unavailable('Same-origin JSON required',403);
  if(Number(request.headers.get('content-length'))>4096)return unavailable('Registration too large',413);
 }
 if(!env.PARLAY_FEED)return unavailable('Shared statistics collector is not configured');
 if(path==='/register'){
  // Bound streaming reads, including requests without Content-Length.
  const reader=request.body?.getReader();let chunks=[],size=0;
  if(!reader)return unavailable('Registration required',400);
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)return unavailable('Registration too large',413);chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const body=new Uint8Array(size);let at=0;for(const c of chunks){body.set(c,at);at+=c.byteLength;}
  return forward(env,new Request('https://collector/register',{method:'POST',body,headers:{'Content-Type':'application/json'}}));
 }
 const params=path==='/game'?'?'+new URLSearchParams({gameId:url.searchParams.get('gameId')??''}):'';
 return forward(env,new Request('https://collector'+path+params));
}
async function forward(env,request){
 try{return await env.PARLAY_FEED.fetch(request);}catch{return unavailable('Shared statistics collector is unavailable');}
}
function unavailable(error,status=503){return new Response(JSON.stringify({error,retryAfterMs:60000}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
