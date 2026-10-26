// LOCAL QA ONLY. Generates test authorization inside this localhost server.
// This file is never copied into a deployable static directory or Worker.
import http from 'node:http';
import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {resolve,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),fixture=join(root,'work/command-center-site');
await mkdir(fixture,{recursive:true});
await writeFile(join(fixture,'index.html'),'<!doctype html><head><title>LOCAL COLLECTION TEST</title></head><body>Local QA public page</body>');
await cp(join(root,'data'),join(fixture,'data'),{recursive:true});
execFileSync(process.execPath,[join(root,'command-center/build.mjs'),fixture],{stdio:'inherit'});
const worker=await import(pathToFileURL(join(root,'dist/_worker.js')));
const sql=new DatabaseSync(':memory:');sql.exec(await readFile(join(root,'command-center/migrations/0001_analytics.sql'),'utf8'));
const db={prepare(q){return {args:[],bind(...a){this.args=a;return this},async first(){return sql.prepare(q).get(...this.args)||null},async all(){return {results:sql.prepare(q).all(...this.args)}},async run(){return sql.prepare(q).run(...this.args)}}},async batch(ss){sql.exec('BEGIN');try{for(const s of ss)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='localhost-test';
const b64=x=>Buffer.from(x).toString('base64url'),h=b64(JSON.stringify({kid:jwk.kid,alg:'RS256'})),p=b64(JSON.stringify({iss:'https://qa.cloudflareaccess.com',aud:['local-qa'],sub:'local-qa',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600}));
const token=h+'.'+p+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p)));
globalThis.fetch=async url=>{if(String(url)==='https://qa.cloudflareaccess.com/cdn-cgi/access/certs')return Response.json({keys:[jwk]});throw Error('Unexpected external network request')};
const origin='http://localhost:4173',env={ANALYTICS:db,ANALYTICS_SECRET:'LOCAL-ONLY-TEST-SECRET-'.repeat(3),ADMIN_ENABLED:'true',ACCESS_AUD:'local-qa',ACCESS_ISSUER:'https://qa.cloudflareaccess.com',PUBLIC_ORIGIN:origin,ASSETS:{async fetch(request){const path=new URL(request.url).pathname;if(path.includes('..'))return new Response('',{status:404});try{return new Response(await readFile(join(root,'dist',path==='/'?'index.html':path)),{headers:{'Content-Type':({'.json':'application/json','.html':'text/html','.js':'text/javascript'}[extname(path)]||'text/html')}})}catch{return new Response('',{status:404})}}}};
http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);if(!req.url.includes('unauthorized=1'))headers.set('Cf-Access-Jwt-Assertion',token);const request=new Request(origin+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const r=await worker.default.fetch(request,env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500);res.end('Local QA failure')}}).listen(4173,'localhost',()=>console.log('LOCAL QA ONLY at '+origin+'/admin'));
