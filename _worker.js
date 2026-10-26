// Safe fallback for existing Cloudflare Git integrations that publish the raw
// repository instead of the prepared command-center build. No admin is enabled.
export default {fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/admin'||path.startsWith('/admin/')||path==='/api/admin'||path.startsWith('/api/admin/')||path==='/command-center'||path.startsWith('/command-center/'))return new Response('Command Center is disabled on this deployment.',{status:403,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(path==='/api/collect')return new Response('Collection is disabled on this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  return env.ASSETS.fetch(request);
}};
