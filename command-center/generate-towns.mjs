import {writeFile} from 'node:fs/promises';
const url='https://raw.githubusercontent.com/FunnelFunction/0.0_Locations-simplemaps.com/main/us_cities_states_counties_zips.csv';
const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('City dataset download failed: '+response.status);
const csv=await response.text();
const lines=csv.split(/\r?\n/);
const header=lines.shift().split('|').map(s=>s.trim().toLowerCase());
const column=(...names)=>names.map(n=>header.indexOf(n)).find(i=>i>=0);
const city=column('city'),state=column('state short','state_short','state'),lat=column('latitude','lat'),lon=column('longitude','lng','lon');
if([city,state,lat,lon].some(x=>x===undefined))throw Error('Unexpected city dataset columns: '+header.join(','));
const towns=[];
for(const line of lines){
 const cols=line.split('|');
 const a=Number(cols[lat]),b=Number(cols[lon]);
 if(!cols[city]||!/^[A-Z]{2}$/.test(cols[state])||!Number.isFinite(a)||!Number.isFinite(b))continue;
 towns.push([cols[city].trim(),cols[state],Math.round(a*10000)/10000,Math.round(b*10000)/10000]);
}
if(towns.length<10000)throw Error('Incomplete US city dataset: '+towns.length);
if(!towns.some(r=>r[0].toLowerCase()==='marionville'&&r[1]==='MO'))throw Error('Expected rural Missouri reference town missing');
await writeFile(new URL('./towns-data.mjs',import.meta.url),'// Generated from FunnelFunction US cities dataset (CC BY 4.0). Source: '+url+'\nexport const TOWNS='+JSON.stringify(towns)+';\n');
console.log('Bundled '+towns.length+' US town coordinates for offline nearest-town lookup.');
