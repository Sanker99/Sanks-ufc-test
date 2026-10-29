import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bundleWorker} from '../bundle.mjs';
test('deployed preview Worker and tracker match the reviewed source exactly',async()=>{
 const root=resolve(import.meta.dirname,'../..');
 assert.equal((await readFile(new URL('../../_worker.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),await bundleWorker(root));
 assert.equal((await readFile(new URL('../../sanks-tracker.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),(await readFile(new URL('../tracker.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n'));
 const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');assert.equal((html.match(/src="\/sanks-tracker.js"/g)||[]).length,1);
});
