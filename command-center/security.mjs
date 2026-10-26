const enc = new TextEncoder();
export const headers = {
  'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}})}
function decode(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
let cached;
export async function authorized(request,env,fetcher=fetch){
  if(env.ADMIN_ENABLED!=='true'||!env.ACCESS_AUD||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER||''))return false;
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16000)return false;
  try{
    const parts=token.split('.');if(parts.length!==3)return false;
    const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now=Date.now()/1000;
    if(head.alg!=='RS256'||typeof head.kid!=='string'||claims.iss!==env.ACCESS_ISSUER||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||(claims.nbf&&claims.nbf>now)||typeof claims.sub!=='string'||!claims.sub)return false;
    if(!cached||cached.issuer!==env.ACCESS_ISSUER||cached.until<Date.now()){
      const r=await fetcher(env.ACCESS_ISSUER+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000)});
      if(!r.ok)return false;const body=await r.json();if(!Array.isArray(body.keys))return false;
      cached={issuer:env.ACCESS_ISSUER,until:Date.now()+300000,keys:body.keys};
    }
    const jwk=cached.keys.find(k=>k.kid===head.kid&&k.kty==='RSA');if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
  }catch{return false}
}
export async function pseudonym(value,secret){
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function cookie(request,name){return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
