import fs from 'node:fs';
import path from 'node:path';
import catalog from '../workers/parlay-demand/catalog.mjs';
import {buildDemandIdentities} from '../workers/parlay-demand/build-identities.mjs';
const directory=path.resolve(process.argv[2]??'../discovery');
const roster=JSON.parse(fs.readFileSync('data/data.json','utf8')).players;
const files=fs.readdirSync(directory);
const matches=['sunday','monday','thursday'].flatMap(n=>JSON.parse(fs.readFileSync(path.join(directory,n+'.json'),'utf8')).payload.data);
const players=files.filter(n=>/^players-.*\.json$/.test(n)).flatMap(n=>JSON.parse(fs.readFileSync(path.join(directory,n),'utf8')).payload.data);
const result=buildDemandIdentities({catalog,roster,matches,players,verifiedAt:new Date().toISOString()});
fs.writeFileSync('workers/parlay-demand/identities.mjs','// Verified from authenticated NFL schedule and current-team roster context. Regenerate with tools/build-demand-identities.mjs.\nexport default '+JSON.stringify(result.manifest)+';\n');
fs.writeFileSync(path.join(directory,'mapping-coverage.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({games:Object.keys(result.manifest.games).length,players:Object.keys(result.manifest.players).length,unmatched:result.issues.length}));

