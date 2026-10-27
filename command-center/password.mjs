import {headers,json,cookie,pseudonym} from './security.mjs';
const passwordEncoder=new TextEncoder();
const passwordCookie='__Host-sanks_admin';
const passwordLifetime=8*60*60*1000;
const passwordMessage=passwordEncoder.encode('SANKS password verification v1');
const passwordHex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const passwordBytes=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
export function passwordReady(request,env){
  try{const origin=new URL(env.ADMIN_ORIGIN);return env.ADMIN_ENABLED==='true'&&env.AUTH_MODE==='password'&&!!env.ANALYTICS&&origin.protocol==='https:'&&origin.origin===env.ADMIN_ORIGIN&&new URL(request.url).origin===origin.origin&&/^sanks-v1\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'')&&/^[a-f0-9]{64,128}$/.test(env.ADMIN_SESSION_SECRET||'')}catch{return false}
}
export async function passwordKey(password,salt,pepper){
  const material=await pseudonym(password,pepper);
  const input=await crypto.subtle.importKey('raw',passwordEncoder.encode(material),'PBKDF2',false,['deriveBits']);
  // Workers caps PBKDF2 at 100,000 iterations. A separate secret pepper and a
  // long random owner passphrase supplement the platform-limited work factor.
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:passwordBytes(salt)},input,256);
  return crypto.subtle.importKey('raw',bits,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function createPasswordVerifier(password,pepper){
  if(typeof password!=='string'||password.length<20||password.length>256||!/^[a-f0-9]{64,128}$/.test(pepper))throw Error('Use a unique passphrase of 20-256 characters and a random 32-byte secret.');
  const salt=passwordHex(crypto.getRandomValues(new Uint8Array(16))),key=await passwordKey(password,salt,pepper);
  return 'sanks-v1$100000$'+salt+'$'+passwordHex(await crypto.subtle.sign('HMAC',key,passwordMessage));
}
async function passwordMatches(password,env){
  if(typeof password!=='string'||password.length<20||password.length>256)return false;
  const parts=env.ADMIN_PASSWORD_HASH.split('$'),key=await passwordKey(password,parts[2],env.ADMIN_SESSION_SECRET);
  return crypto.subtle.verify('HMAC',key,passwordBytes(parts[3]),passwordMessage);
}
async function passwordSessionId(token,env){return pseudonym(token,env.ADMIN_SESSION_SECRET+env.ADMIN_PASSWORD_HASH)}
export async function passwordAuthorized(request,env){
  if(!passwordReady(request,env))return false;
  const token=cookie(request,passwordCookie);if(!/^[a-f0-9]{64}$/.test(token||''))return false;
  try{const row=await env.ANALYTICS.prepare('SELECT expires FROM admin_sessions WHERE id=? AND expires>?').bind(await passwordSessionId(token,env),Date.now()).first();return !!row}catch{return false}
}
function passwordPage(message='',status=200){
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SANKS - Private sign-in</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#004c5444,transparent),#090e10;color:#edf3f3;font:16px Arial,sans-serif}main{margin:24px;padding:36px;max-width:390px;border:1px solid #365458;background:#101a1e}small{letter-spacing:3px;color:#76d8bc}h1{font-size:32px}p{line-height:1.6;color:#adc0c2}label,input,button{display:block;box-sizing:border-box;width:100%}input{margin:12px 0 20px;padding:14px;border:1px solid #567579;background:#0a1215;color:#fff;font-size:16px}button{padding:14px;background:#004c54;border:1px solid #76d8bc;color:#fff;font-size:16px;cursor:pointer}a{color:#76d8bc}.message{color:#ffc393}input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #76d8bc;outline-offset:4px}</style></head><body><main><small>SANKS RESEARCH LAB</small><h1>Command Center.</h1><p>Private access. Enter your owner passphrase to continue.</p>${message?'<p class="message" role="alert">'+message+'</p>':''}<form method="post" action="/admin/login"><label for="password">Owner passphrase</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="20" maxlength="256" required autofocus><button type="submit">Sign in securely</button></form><p>Sessions expire after 8 hours.</p><a href="/">Return to Research Lab</a></main></body></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'strict-origin-when-cross-origin'}});
}
function passwordOrigin(request,env){
  // Some browsers omit Fetch Metadata headers on ordinary HTML form posts.
  // An exact Origin match remains mandatory; reject any explicit cross-site metadata.
  const site=request.headers.get('Sec-Fetch-Site');
  return request.headers.get('Origin')===env.ADMIN_ORIGIN&&(site===null||site==='same-origin');
}
function passwordRedirect(path,setCookie){return new Response(null,{status:303,headers:{...headers,Location:path,...(setCookie?{'Set-Cookie':setCookie}:{})}})}
export async function passwordRoutes(request,env){
  const path=new URL(request.url).pathname;if(path!=='/admin/login'&&path!=='/api/admin/logout')return null;
  if(!passwordReady(request,env))return json({error:'Private sign-in is not enabled on this deployment.'},403);
  if(path==='/admin/login'&&request.method==='GET')return await passwordAuthorized(request,env)?passwordRedirect('/admin'):passwordPage();
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!passwordOrigin(request,env))return json({error:'Origin denied'},403);
  if(path==='/api/admin/logout'){
    const token=cookie(request,passwordCookie);if(/^[a-f0-9]{64}$/.test(token||''))await env.ANALYTICS.prepare('DELETE FROM admin_sessions WHERE id=?').bind(await passwordSessionId(token,env)).run();
    return passwordRedirect('/admin/login',passwordCookie+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
  }
  if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'Form encoding required'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'Form required'},400);
  let raw='',size=0;const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return json({error:'Form too large'},413)}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode();
  const now=Date.now(),window=Math.floor(now/(15*60000)),db=env.ANALYTICS;
  const gate=async(key,max)=>db.prepare('INSERT INTO admin_login_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window WHERE window!=excluded.window OR count<? RETURNING count').bind(key,window,max).first();
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const limiter=await pseudonym(ip,env.ADMIN_SESSION_SECRET+String(Math.floor(now/86400000)));
  if(!await gate(limiter,10)||!await gate('site-login-budget',60))return passwordPage('Too many sign-in attempts. Try again in 15 minutes.',429);
  await db.prepare('DELETE FROM admin_login_limits WHERE window<?').bind(window-96).run();
  const fields=new URLSearchParams(raw),values=fields.getAll('password');
  if(values.length!==1||!await passwordMatches(values[0],env))return passwordPage('Sign-in failed. Check your passphrase and try again.',401);
  const token=passwordHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires<=?').bind(now),db.prepare('INSERT INTO admin_sessions(id,created,expires) VALUES(?,?,?)').bind(await passwordSessionId(token,env),now,now+passwordLifetime)]);
  return passwordRedirect('/admin',passwordCookie+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800');
}
