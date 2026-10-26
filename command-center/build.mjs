import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=process.argv[2]&&resolve(process.argv[2]);
if(!source)throw Error('Provide the CURRENT full production static directory: node command-center/build.mjs <source-directory>. GitHub main is not verified production.');
const out=resolve(root,process.argv[3]||'dist');
if(relative(root,out).startsWith('..')||out===root)throw Error('Build output must stay inside this project.');
if(source===root||!relative(source,out).startsWith('..'))throw Error('Source must be a separate full static export; output must not be inside source.');
await access(join(source,'index.html'));
try{await access(join(source,'_worker.js'));throw Error('Existing Worker detected; integrate routing manually to preserve it.')}catch(e){if(e.code!=='ENOENT')throw e}
try{await access(out);throw Error('dist already exists. Use a clean build directory to prevent stale assets.')}catch(e){if(e.code!=='ENOENT')throw e}
await mkdir(out,{recursive:true});await cp(source,out,{recursive:true});
let html=await readFile(join(source,'index.html'),'utf8');
if(!/<\/head>/i.test(html))throw Error('Missing head closing tag');
html=html.replace(/<\/head>/i,'<script defer src="/sanks-tracker.js"></script></head>');
await writeFile(join(out,'index.html'),html);
await cp(join(root,'command-center/tracker.js'),join(out,'sanks-tracker.js'));
const readTopology=await readFile(join(root,'command-center/ui/states.json'),'utf8');
const a={};for(const [url,file,type] of [['/admin','admin.html','text/html; charset=utf-8'],['/admin/app.js','app.js','text/javascript; charset=utf-8'],['/admin/style.css','style.css','text/css; charset=utf-8'],['/admin/map.js','map.js','text/javascript; charset=utf-8']])a[url]={body:(await readFile(join(root,'command-center/ui',file),'utf8')).replace('__STATE_TOPOLOGY__',()=>readTopology),type};
let worker=await readFile(join(root,'command-center/worker.mjs'),'utf8');
for(const file of ['security','analytics']){
  const module=(await readFile(join(root,`command-center/${file}.mjs`),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
  worker=worker.replace(new RegExp(`import .* from './${file}.mjs';\\n`),()=>module+'\n');
}
worker=worker.replace('__ADMIN_ASSETS__',()=>JSON.stringify(a));
await writeFile(join(out,'_worker.js'),worker);
await writeFile(join(out,'_routes.json'),JSON.stringify({version:1,include:['/admin','/admin/*','/api/admin','/api/admin/*','/api/collect'],exclude:[]}));
console.log('Built dist with protected embedded admin assets. Public source preserved except the tracker script tag. Do not upload through dashboard drag-and-drop: deploy Worker via Wrangler.');
