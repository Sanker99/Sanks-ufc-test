const SITE_ORIGINS=new Set(['https://sanksresearchlab.pages.dev','https://sanksresearchlab-test.pages.dev','https://feature-parlay-demand-live-s.sanks-parlay-demand-preview.pages.dev','https://feature-parlay-demand-live-stats.sanks-parlay-demand-preview.pages.dev','https://sanks-parlay-demand-preview.pages.dev']);
function allowedOrigin(origin,url){return origin===url.origin||SITE_ORIGINS.has(origin)||/^https:\/\/review-[0-9a-f]{12}\.sanksresearchlab-test\.pages\.dev$/.test(origin??'');}
export async function feedRequest(context,path){
 const {request}=context,url=new URL(request.url),origin=request.headers.get('Origin');
 if(!PREVIEWS.has(url.hostname)&&!['localhost','127.0.0.1'].includes(url.hostname))return unavailable('Unknown feed deployment',503);
 if(!['/health','/game','/register'].includes(path))return unavailable('Unknown feed route',404);
 if(origin&&!allowedOrigin(origin,url))return unavailable('Origin is not allowed',403);
 let response;
 if(request.method==='OPTIONS')response=new Response(null,{status:204});
 else response=await handleFeedRequest(context,path);
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
 if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');headers.set('Access-Control-Allow-Methods',path==='/register'?'POST, OPTIONS':'GET, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type');}
 return new Response(response.body,{status:response.status,headers});
}
const PREVIEWS=new Set(['sanks-parlay-feed.pages.dev','feature-parlay-demand-live-s.sanks-parlay-demand-preview.pages.dev','feature-parlay-demand-live-stats.sanks-parlay-demand-preview.pages.dev','sanks-parlay-demand-preview.pages.dev','feature-parlay-demand-live-stats.sanks-ufc-preview.pages.dev']);
async function handleFeedRequest(context,path){
 const {request,env}=context,url=new URL(request.url);
 if(!['/register','/game','/health'].includes(path))return unavailable('Unknown feed route',404);
 // Never activate this replacement on the preserved V4 host or production.
 if(!PREVIEWS.has(url.hostname)&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')return unavailable('Demand feed is restricted to its isolated preview');
 if(request.method==='POST'){
  if(!allowedOrigin(request.headers.get('Origin'),url)||!(request.headers.get('content-type')??'').startsWith('application/json'))return unavailable('Same-origin JSON required',403);
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
