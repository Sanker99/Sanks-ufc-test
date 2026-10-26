import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('bundled map builds all 50 states and DC with finite paths and keyboard counts',async()=>{
  const topology=await readFile(new URL('../ui/states.json',import.meta.url),'utf8');
  const code=(await readFile(new URL('../ui/map.js',import.meta.url),'utf8')).replace('__STATE_TOPOLOGY__',()=>topology);
  const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const paths=[],tip={textContent:''},svg={append:p=>paths.push(p)},node={innerHTML:'',querySelector:q=>q==='svg'?svg:tip};
  const oldDocument=globalThis.document;globalThis.document={createElementNS(){return {attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v},append(t){this.title=t},addEventListener(k,f){this.listeners[k]=f}}}};
  try{module.renderMap(node,[{label:'PA',visitors:7}]);assert.equal(paths.length,51);for(const p of paths){assert.ok(p.attributes.d.startsWith('M'));assert.ok(!/NaN|undefined|Infinity/.test(p.attributes.d));assert.equal(p.attributes.tabindex,'0')}
    const pa=paths.find(p=>p.attributes['aria-label'].startsWith('Pennsylvania:'));pa.listeners.focus();assert.match(tip.textContent,/7 estimated visitors/);
  }finally{globalThis.document=oldDocument}
});
