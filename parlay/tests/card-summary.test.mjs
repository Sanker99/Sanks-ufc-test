import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlipFinances,inputCents,mergeFinances,cardEventDate,financialTotals} from '../slip-summary.mjs';
import {BrowserRepository,recordObservations,parseBackup,parseSlipDetailed} from '../core.mjs';
const games=[{schedule_id:'thu',date:'2026-10-29'},{schedule_id:'sun',date:'2026-11-01'},{schedule_id:'mon',date:'2026-11-02'}];
test('majority date counts legs and labels every represented weekday chronologically',()=>{
 const dates=cardEventDate([...Array.from({length:5},()=>({gameId:'sun'})),{gameId:'mon'}],games);
 assert.equal(dates.date,'2026-11-01');assert.equal(dates.label,'November 1, 2026');assert.equal(dates.days,'Sun & Mon');
 assert.equal(cardEventDate([{gameId:'thu'},{gameId:'sun'},{gameId:'sun'},{gameId:'mon'}],games).days,'Thu & Sun & Mon');
 assert.equal(cardEventDate([{gameId:'mon'},{gameId:'sun'}],games).date,'2026-11-01');
 assert.equal(cardEventDate([{gameId:'unknown'}],games).date,null);
});
test('slip wager, total payout and profit labels stay distinct and repeated amounts deduplicate',()=>{
 const r=parseSlipFinances('Wager\n$10.00\nPotential payout $1,234.56\nTo Win: $1,224.56\nWager $10.00\nOdds +300');
 assert.deepEqual(r.finances,{currency:'USD',stakeCents:1000,payoutCents:123456,profitCents:122456});assert.deepEqual(r.warnings,[]);
 assert.equal(parseSlipFinances('Balance $500\nBet ID 1234\nOdds +250').finances.stakeCents,null);
 assert.equal(financialTotals(parseSlipFinances('Wager $10\nTo Win $20').finances).payout,null);
});
test('conflicting, malformed or mixed-currency OCR amounts require review instead of guessing',()=>{
 for(const text of ['Wager $10\nWager $20','Wager $1O.00','Wager €10\nPayout $40']){
  const r=parseSlipFinances(text);assert.ok(r.warnings.length);assert.equal(r.finances.stakeCents,null);
 }
 assert.equal(parseSlipFinances('Stake £12.50\nReturns GBP 80.00').finances.currency,'GBP');
 assert.throws(()=>inputCents('1e3'));assert.throws(()=>inputCents('-5'));assert.throws(()=>inputCents('10.009'));assert.equal(inputCents('0'),0);
});
test('sequential screenshots retain known amounts and flag different totals',()=>{
 const a=parseSlipFinances('Wager $10').finances,b=parseSlipFinances('Total Payout $40').finances;
 assert.deepEqual(mergeFinances(a,b).finances,{currency:'USD',stakeCents:1000,payoutCents:4000,profitCents:null});
 const conflict=mergeFinances(a,parseSlipFinances('Wager $20').finances);assert.equal(conflict.finances.stakeCents,null);assert.ok(conflict.warnings.length);
});
const leg={kind:'team',team:'DAL',teamName:'Dallas Cowboys',playerId:null,season:2026,gameId:'sun',category:'moneyline',operator:'win',target:null,verificationStatus:'confirmed'};
const card={id:'card',name:'QA',lockedAt:'2026-10-30T12:00:00Z',legs:[leg],finances:{currency:'USD',stakeCents:1000,payoutCents:4000,profitCents:null}};
function setup(){let raw=null,fail=false;const storage={getItem:()=>raw,setItem:(k,v)=>{if(fail)throw Error('storage failure');raw=v;}};const repo=new BrowserRepository(storage);repo.save(card);return {repo,set fail(v){fail=v;},get raw(){return raw;}};}
test('amounts persist and restore, malformed backups reject, locked amounts cannot change',()=>{
 const {repo}=setup();assert.deepEqual(repo.list()[0].finances,card.finances);
 const b={version:1,parlays:repo.list()};assert.deepEqual(parseBackup(b).parlays[0].finances,card.finances);
 for(const n of [-1,1.5,Infinity,'100'])assert.throws(()=>parseBackup({version:1,parlays:[{...card,finances:{...card.finances,stakeCents:n}}]}));
 assert.throws(()=>repo.save({...card,finances:{...card.finances,stakeCents:2000}}),/Locked/);
});
test('removed active/won/lost cards stay removed during stale refreshes and can be undone',()=>{
 for(const status of ['active','won','lost']){
  const s=setup();if(status!=='active'){const state=status==='won'?'Final Hit':'Final Missed';s.repo.save({...card,result:{status,legs:[{state,resolved:true,observedAt:'2026-11-01T23:00:00Z'}]}});}
  const removed=s.repo.list()[0];assert.equal(s.repo.remove(card.id),true);assert.deepEqual(s.repo.list(),[]);
  assert.equal(recordObservations(s.repo,removed,[]),null);assert.deepEqual(s.repo.list(),[]);
  s.repo.restore({version:1,parlays:[removed]});assert.deepEqual(s.repo.list()[0],removed);
 }
});
test('failed deletion leaves storage untouched',()=>{
 const s=setup(),before=s.raw;s.fail=true;assert.throws(()=>s.repo.remove(card.id),/storage/);assert.equal(s.raw,before);
});
test('slip import returns amounts without turning dollar figures into prop thresholds',()=>{
 const roster=[{id:'00-0000001',name:'Test Receiver',team:'DAL',season:2026}];
 const r=parseSlipDetailed('Test Receiver\n40+ Receiving Yards\nWager $10.00\nPotential Payout $300.00',roster,{season:2026});
 assert.equal(r.legs.length,1);assert.equal(r.legs[0].target,40);assert.equal(r.finances.stakeCents,1000);assert.equal(r.finances.payoutCents,30000);
});
