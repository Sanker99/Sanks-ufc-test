// Prepare only this feature branch for the existing raw-root preview integration.
import {readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {bundleWorker,commandRoutes} from './bundle.mjs';
const root=resolve(import.meta.dirname,'..');
await writeFile(join(root,'_worker.js'),await bundleWorker(root));
await writeFile(join(root,'_routes.json'),JSON.stringify(commandRoutes)+'\n');
await cp(join(root,'command-center/tracker.js'),join(root,'sanks-tracker.js'));
const path=join(root,'index.html'),html=await readFile(path,'utf8');
if(!html.includes('src="/sanks-tracker.js"'))await writeFile(path,html.replace(/<\/body>/i,'<script defer src="/sanks-tracker.js"></script></body>'));
console.log('Feature-branch preview prepared. Authentication still requires explicit environment configuration.');
