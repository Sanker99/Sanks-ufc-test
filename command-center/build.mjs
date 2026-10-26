import {bundleWorker,commandRoutes} from './bundle.mjs';
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
if(!html.includes('src="/sanks-tracker.js"'))html=html.replace(/<\/head>/i,'<script defer src="/sanks-tracker.js"></script></head>');
await writeFile(join(out,'index.html'),html);
await cp(join(root,'command-center/tracker.js'),join(out,'sanks-tracker.js'));
await writeFile(join(out,'_worker.js'),await bundleWorker(root));
await writeFile(join(out,'_routes.json'),JSON.stringify(commandRoutes));
console.log('Built dist with protected embedded admin assets. Public source preserved except the tracker script tag. Do not upload through dashboard drag-and-drop: deploy Worker via Wrangler.');
