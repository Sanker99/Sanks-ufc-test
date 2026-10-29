import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import guard from '../../_worker.js';
test('prepared preview remains disabled without configuration and protects source/API assets',async()=>{
  const routes=JSON.parse(await readFile(new URL('../../_routes.json',import.meta.url),'utf8'));
  assert.ok(routes.include.includes('/command-center/*'));
  for(const path of ['/admin','/admin/app.js','/api/admin/report','/api/admin/health','/api/admin/live','/command-center/ui/admin.html','/command-center/analytics.mjs']){
    const r=await guard.fetch(new Request('https://preview.pages.dev'+path),{});assert.equal(r.status,403,path);
  }
  assert.equal((await guard.fetch(new Request('https://preview.pages.dev/api/collect',{method:'POST'}),{})).status,503);
  const r=await guard.fetch(new Request('https://preview.pages.dev/'),{ASSETS:{fetch:()=>new Response('public')}});assert.equal(await r.text(),'public');
});
