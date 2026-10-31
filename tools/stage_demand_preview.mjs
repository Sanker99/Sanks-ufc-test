import {mkdir,copyFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work/demand-site');
await mkdir(path.join(out,'parlay'),{recursive:true});await mkdir(path.join(out,'data'),{recursive:true});
for(const f of await readdir(path.join(root,'parlay')))if(/\.(html|css|mjs)$/.test(f)&&!['live-source.mjs','live-identities.mjs','fleaflicker-source.mjs','fleaflicker-identities.mjs','stats.mjs','identity.mjs'].includes(f))await copyFile(path.join(root,'parlay',f),path.join(out,'parlay',f));
await copyFile(path.join(root,'data/data.json'),path.join(out,'data/data.json'));
await writeFile(path.join(out,'_redirects'),'/ /parlay/ 302\n');
console.log('Staged isolated tracker at work/demand-site');
