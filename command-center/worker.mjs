import {passwordRoutes,passwordReady} from './password.mjs';
import {authorized,json,headers} from './security.mjs';
import {collect,report,liveReport} from './analytics.mjs';
// Replaced by the build. Admin assets are embedded, never publicly addressable.
const assets = __ADMIN_ASSETS__;
export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  try{
    if(path==='/command-center'||path.startsWith('/command-center/'))return json({error:'Not found'},403);
    if(path==='/api/collect')return await collect(request,env);
    if(path==='/admin'||path.startsWith('/admin/')||path==='/api/admin'||path.startsWith('/api/admin/')){
      if(env.AUTH_MODE==='password'){const signIn=await passwordRoutes(request,env);if(signIn)return signIn}
      if(!await authorized(request,env)){
        if((path==='/admin'||path==='/admin/')&&request.method==='GET'&&passwordReady(request,env))return new Response(null,{status:303,headers:{...headers,Location:'/admin/login'}});
        return json({error:'Access denied. Sign-in is required.'},403);
      }
      if(request.method!=='GET')return json({error:'Method not allowed'},405);
      if(path==='/api/admin/report')return json(await report(env,url.searchParams.get('range')||'30',url.searchParams.get('aggregation')||'daily'));
      if(path==='/api/admin/live')return json(await liveReport(env));
      if(path==='/api/admin/health')return json(await health(request,env));
      const a=assets[path==='/admin/'?'/admin':path];if(a){const body=a.type.startsWith('text/html')?a.body.replace('__SIGN_OUT__',env.AUTH_MODE==='password'?'<form method="post" action="/api/admin/logout"><button class="outline" type="submit">Sign out</button></form>':'<a href="/cdn-cgi/access/logout">Sign out</a>'):a.body;return new Response(body,{headers:{...headers,'Content-Type':a.type}})}
      return json({error:'Not found'},404);
    }
    return env.ASSETS.fetch(request);
  }catch{return json({error:'Service unavailable. Check Worker logs and D1 bindings.'},503)}
}};
export async function health(request,env){
  let feeds={};try{const r=await env.ASSETS.fetch(new Request(new URL('/data/refresh-status.json',request.url)));if(r.ok&&r.headers.get('Content-Type')?.includes('json'))feeds=(await r.json()).feeds||{}}catch{}
  const rows=await Promise.all([['NFL','/data/data.json'],['NCAA','/data/ncaa-data.json'],['UFC','/data/ufc-data.json'],['Injuries','/data/injuries.json']].map(async([name,path])=>{
    try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));if(!r.ok||!r.headers.get('Content-Type')?.includes('json'))return {name,status:'unavailable',diagnostic:'Published JSON not found at '+path};
      const d=await r.json();const sources=d.sources?Object.entries(d.sources).map(([key,v])=>({name:key,updated:v.updated??null,failed:!!v.error})):[];
      const count=Array.isArray(d.players)?d.players.length:d.fighters?Object.keys(d.fighters).length:null;
      const f=feeds[name]||{},updated=f.source_updated??d.updated??d.generated_at??null,stale=updated?Date.now()-new Date(updated).getTime()>48*3600000:null;
      return {name,status:d.error||f.error||f.cached||f.partial||count===0||stale?'attention':'published',updated,lastAttempt:f.last_attempt??d.last_attempt??null,sourceErrors:sources,cached:!!f.cached,partial:!!f.partial,warningCount:Array.isArray(f.warnings)?f.warnings.length:0,stale,diagnostic:d.error||f.error?'Published source reported an error; inspect the refresh job logs.':count===0?'Dataset contains no records.':stale?'Published snapshot is older than 48 hours; review the refresh pipeline.':f.partial?'Published feed reports partial coverage.':'Published snapshot readable; upstream availability is not independently verified.',records:count};
    }catch{return {name,status:'unavailable',diagnostic:'Published JSON could not be read.'}}
  }));
  const refreshFeeds=Object.entries(feeds).map(([name,f])=>({name,updated:f.source_updated??null,lastAttempt:f.last_attempt??null,failed:!!f.error,cached:!!f.cached,partial:!!f.partial,warnings:Array.isArray(f.warnings)?f.warnings.length:0}));
  return {asOf:Date.now(),sources:rows,refreshFeeds,deployment:{commit:env.CF_PAGES_COMMIT_SHA||null,branch:env.CF_PAGES_BRANCH||null,url:env.CF_PAGES_URL||null},refresh:{supported:false,url:'https://github.com/Sanker99/Sanks-ufc-test/actions',reason:'Refresh jobs run in GitHub Actions. Direct Upload requires a separate publish. No server refresh credential is configured.'},failedRefreshAttempts:null,currentFailedFeeds:refreshFeeds.filter(f=>f.failed).length,applicationErrors:env.ANALYTICS?(await env.ANALYTICS.prepare("SELECT COUNT(*) count FROM events WHERE kind='error' AND ts>=?").bind(Date.now()-86400000).first()).count:null};
}
