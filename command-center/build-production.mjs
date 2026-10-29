import {mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleWorker} from './bundle.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,process.argv[2]||'command-center-production-export');
await mkdir(out,{recursive:true});
const existing=await readdir(out);
if(existing.length)throw new Error(`Refusing to overwrite non-empty output directory: ${out}`);
const worker=await bundleWorker(root);
await writeFile(path.join(out,'_worker.js'),worker);
await writeFile(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/admin','/admin/*','/api/admin','/api/admin/*','/api/collect'],exclude:[]},null,2)+'\n');
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SANKS Command Center</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#091315;color:#e8f2ef;font:16px Arial,sans-serif"><main style="max-width:38rem;margin:2rem;padding:2rem;border:1px solid #365458;background:#101a1e"><p style="letter-spacing:.2em;color:#76d8bc">SANKS RESEARCH LAB</p><h1>Command Center.</h1><p>Private operations dashboard.</p><p><a href="/admin" style="color:#76d8bc">Open admin sign-in</a></p><p><a href="https://sanksresearchlab.pages.dev/" style="color:#adc0c2">Return to Research Lab ↗</a></p></main></body></html>\n`);
console.log(`Built isolated production Command Center in ${out}`);
