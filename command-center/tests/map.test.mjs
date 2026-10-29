import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('bundled map draws all states without IP-derived counts and accepts only opt-in approximate areas',async()=>{
  const topology=await readFile(new URL('../ui/states.json',import.meta.url),'utf8');
  const code=(await readFile(new URL('../ui/map.js',import.meta.url),'utf8')).replace('__STATE_TOPOLOGY__',()=>topology);
  const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const paths=[],tip={textContent:''},svg={append:p=>paths.push(p),querySelector:()=>null},node={innerHTML:'',querySelector:q=>q==='svg'?svg:tip};
  const oldDocument=globalThis.document;globalThis.document={createElementNS(){return {attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v},append(t){this.title=t},addEventListener(k,f){this.listeners[k]=f}}}};
  try{module.renderMap(node,[{label:'PA',visitors:7}]);assert.equal(paths.filter(p=>p.attributes.d).length,51);for(const p of paths.filter(p=>p.attributes.d)){assert.ok(p.attributes.d.startsWith('M'));assert.ok(!/NaN|undefined|Infinity/.test(p.attributes.d));assert.equal(p.attributes.tabindex,'0')}
    const pa=paths.find(p=>p.attributes['aria-label']?.startsWith('Pennsylvania:'));pa.listeners.focus();assert.match(tip.textContent,/no state-level location is available/);
    module.renderMap(node,[{label:'MO',visitors:4}],[{label:'Browser-shared area',state:'BR',lat:37.2,lon:-93.3,visits:4}]);
    const layer=paths.findLast(p=>p.attributes.class==='city-glow');assert.ok(layer);assert.equal(layer.attributes.class,'city-glow');assert.equal(layer.title?.length,undefined);
    assert.equal(layer.title?.attributes?.class,'core');
    const px=Number(layer.title.attributes.cx),py=Number(layer.title.attributes.cy);
    assert.ok(px>=502&&px<=622&&py>=260&&py<=364,'Springfield hotspot should fall inside Missouri');
    module.renderMap(node,[],[{label:'Browser-shared area',state:'BR',lat:39.77,lon:-94.85,visits:1}]);
    const joseph=paths.findLast(p=>p.attributes.class==='city-glow').title;
    const jx=Number(joseph.attributes.cx),jy=Number(joseph.attributes.cy);
    assert.ok(jx<px&&jy<py,'Saint Joseph must plot northwest of Springfield');
    assert.ok(Math.hypot(jx-px,jy-py)>50,'Distinct Missouri cities must not collapse to one hotspot');
    module.renderMap(node,[],[{label:'Browser-shared area',state:'BR',lat:37.2,lon:-93.3,visits:4}],[{label:'Browser-shared area',state:'BR',lat:37.2,lon:-93.3,matches:2}]);
    const red=paths.findLast(p=>p.attributes.class==='flagged-search-dots');assert.ok(red);assert.equal(red.title.attributes.r,'5');assert.match(red.title.attributes['aria-label'],/2 flagged searches/);
  }finally{globalThis.document=oldDocument}
});
