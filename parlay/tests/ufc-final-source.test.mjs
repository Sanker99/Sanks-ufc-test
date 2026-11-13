import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchUfcFinalStats,readUfcStatsTotals} from '../../functions/api/parlay/ufc-final-source.mjs';
const fight={date:'2026-11-07T22:00Z',outcome:'final',length:256,winnerId:'2',fighters:[{id:'1',name:'Jonny Parsons'},{id:'2',name:'José Souza'}]};
const index='<tr><td><a href="http://ufcstats.com/event-details/110404b505fb562c">UFC Fight Night</a><span class="b-statistics__date">November 07, 2026</span></td></tr>';
const event='<tr data-link="http://ufcstats.com/fight-details/e2cd8521c8ba55b2">'+['win','<a>Jose Souza</a><a>Jonny Parsons</a>','1','33','0','0','Welterweight','KO/TKO','1','4:16'].map(x=>'<td>'+x+'</td>').join('')+'</tr>';
const detail='<table><thead><tr><th>FIGHTER</th><th>SIG. STR.</th><th>TD</th></tr></thead><tbody><tr><td><p>Jonny Parsons</p><p>Jose Souza</p></td><td><p>15 of 30</p><p>33 of 42</p></td><td><p>0 of 0</p><p>0 of 0</p></td></tr></tbody></table>';
test('final fallback confirms the official event, fighters, winner and elapsed time before reading totals',async()=>{
 const calls=[];
 const fetchSource=async url=>{calls.push(url);return new Response([index,event,detail][calls.length-1]);};
 const result=await fetchUfcFinalStats(fight,fetchSource);
 assert.deepEqual(result,{source:'UFCStats',totals:{'1':{ufc_sig_strikes:15,ufc_takedowns:0},'2':{ufc_sig_strikes:33,ufc_takedowns:0}}});
 assert.equal(calls.length,3);
 assert.equal(await fetchUfcFinalStats({...fight,outcome:'live'},()=>assert.fail()),null);
 let next=0;
 assert.equal(await fetchUfcFinalStats({...fight,length:255},async()=>new Response([index,event][next++])),null);
 assert.equal(readUfcStatsTotals(detail.replace('33 of 42','---'),fight),null);
});
