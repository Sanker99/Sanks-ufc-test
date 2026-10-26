import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
test('integration build preserves public assets and denies all admin surfaces by default',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sanks-build-'));
  await cp(new URL('..',import.meta.url),join(dir,'command-center'),{recursive:true});
  const site=join(dir,'site');await mkdir(site);await writeFile(join(site,'index.html'),'<!doctype html><head></head><body>PUBLIC $& PRESERVED</body>');await writeFile(join(site,'data.json'),'{}');
  execFileSync(process.execPath,[join(dir,'command-center/build.mjs'),site]);
  const out=join(dir,'dist'),worker=await import(pathToFileURL(join(out,'_worker.js')));
  assert.equal(await readFile(join(out,'data.json'),'utf8'),'{}');
  assert.equal((await readFile(join(out,'index.html'),'utf8')).replace('<script defer src="/sanks-tracker.js"></script>',''),await readFile(join(site,'index.html'),'utf8'));
  assert.ok(!(await readdir(out)).includes('admin'));
  for(const path of ['/admin','/admin/','/admin/app.js','/admin/style.css','/admin/map.js','/api/admin','/api/admin/report','/api/admin/health','/admin/anything']){
    for(const hostname of ['example.com','preview.pages.dev']){
      const r=await worker.default.fetch(new Request('https://'+hostname+path),{});assert.equal(r.status,403,path);assert.match(r.headers.get('Cache-Control'),/no-store/);
    }
  }
  const publicResponse=await worker.default.fetch(new Request('https://example.com/'),{ASSETS:{fetch:()=>new Response('public')}});assert.equal(await publicResponse.text(),'public');
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='built-worker';
  const b64=x=>Buffer.from(x).toString('base64url'),h=b64(JSON.stringify({kid:jwk.kid,alg:'RS256'})),p=b64(JSON.stringify({iss:'https://built.cloudflareaccess.com',aud:['built'],sub:'test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300}));
  const token=h+'.'+p+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p)));
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
  try{const env={ADMIN_ENABLED:'true',ACCESS_ISSUER:'https://built.cloudflareaccess.com',ACCESS_AUD:'built',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    for(const path of ['/admin','/admin/app.js','/admin/style.css','/admin/map.js']){const r=await worker.default.fetch(new Request('https://preview.pages.dev'+path,{headers:{'Cf-Access-Jwt-Assertion':token}}),env);assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes('__STATE_TOPOLOGY__'));assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/)}
    const r=await worker.default.fetch(new Request('https://preview.pages.dev/api/admin/report',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);assert.equal((await r.json()).available,false);
    const health=await worker.default.fetch(new Request('https://preview.pages.dev/api/admin/health',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);assert.equal((await health.json()).sources.length,4);
    const mutation=await worker.default.fetch(new Request('https://preview.pages.dev/api/admin/health',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':token}}),env);assert.equal(mutation.status,405);
  }finally{globalThis.fetch=oldFetch}
  assert.throws(()=>execFileSync(process.execPath,[join(dir,'command-center/build.mjs'),site],{stdio:'pipe'}),/dist already exists/);
});
