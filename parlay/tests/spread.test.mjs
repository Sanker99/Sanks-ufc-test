import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlipDetailed,confirmLegs,validateLeg,deduplicate,evaluateLeg,evaluateParlay,legProgress,lockParlay,parseBackup,BrowserRepository,recordObservations} from '../core.mjs';
import {spreadSelections,upgradeSpreadDrafts} from '../spread.mjs';
import {progressMarkup} from '../progress.mjs';
import {createLiveSync} from '../live-sync.mjs';
import {feedLabel} from '../demand-client.mjs';
const game={schedule_id:'2026_08_CAR_GB',home:'GB',away:'CAR',date:'2026-10-29',week:8},season=2026;
const leg={kind:'team',category:'spread',team:'GB',teamName:'Green Bay Packers',opponentTeam:'CAR',gameId:game.schedule_id,season,playerId:null,playerName:null,operator:'cover',target:-7.5,alternateSpread:false,verificationStatus:'confirmed'};
const s={kind:'team',team:'GB',opponentTeam:'CAR',gameId:leg.gameId,season,status:'final',verified:true,finalVerified:true,scores:{selected:27,opponent:19},observedAt:'2026-11-01T15:00:00Z',source:'Test score feed'};
const card={id:'spread',legs:[leg],lockedAt:'2026-10-29T12:00:00Z'};
const parse=text=>parseSlipDetailed(text,[],{season,games:[game],gameDate:game.date}).legs;
const repository=()=>{let data=null;return new BrowserRepository({getItem:()=>data,setItem:(k,v)=>{data=v;}});};
test('spread OCR reads favorites, underdogs, alternate descriptors, Unicode signs and pick em',()=>{
 for(const [text,team,target,alt] of [
  ['Green Bay Packers -7.5 (-110)\nPoint Spread','GB',-7.5,false],
  ['Alternate Spread\nCarolina Panthers +10.5','CAR',10.5,true],
  ['Carolina Panthers\n+10.5\nAlt Spread','CAR',10.5,true],
  ['GB\nSpread −7½','GB',-7.5,false],
  ['CAR (+10.50)\nAlternative Point Spread','CAR',10.5,true],
  ['Green Bay Packers PK\nSpread','GB',0,false],
  ['Carolina Panthers +10.5','CAR',10.5,false],
  ['Point Spread -7.5\nGreen Bay Packers','GB',-7.5,false]
 ]){const legs=parse(text);assert.equal(legs.length,1,text);assert.equal(legs[0].category,'spread',text);assert.equal(legs[0].team,team,text);assert.equal(legs[0].target,target,text);assert.equal(legs[0].alternateSpread,alt,text);assert.equal(legs[0].gameId,game.schedule_id,text);assert.equal(legs[0].verificationStatus,'review');}
});
test('spread parser does not interpret odds, missing signs or conflicting lines as handicaps',()=>{
 for(const text of ['GB -110\nSpread','GB 7.5\nSpread','GB -7.5 +3.5\nSpread','GB -7.25\nSpread','GB -O.5\nSpread']){const legs=parse(text);assert.equal(legs.length,1,text);assert.equal(legs[0].target,null,text);assert.equal(validateLeg({...legs[0],verificationStatus:'confirmed'}),false);}
 assert.equal(parse('Green Bay Packers +110').length,0);
 assert.equal(parse('Spread\nNew York -3.5')[0].team,null);
});
test('adjacent spread selections preserve different teams and alternate lines',()=>{const a=parse('GB -7.5\nSpread\nCAR +10.5\nAlternate Spread');assert.deepEqual(a.map(l=>[l.team,l.target,l.alternateSpread]),[['GB',-7.5,false],['CAR',10.5,true]]);const b=parse('Spread\nGB -7.5\nAlternate Spread\nGB -10.5');assert.deepEqual(b.map(l=>l.target),[-7.5,-10.5]);});
test('partial game spread markers remain explicit unsupported legs',()=>{for(const text of ['GB -3.5\nFirst Half Spread','First Half\nGB -3.5\nSpread','1Q Spread\nCAR +3.5','GB -3.5\nFirst half'])assert.equal(parse(text)[0].category,'unsupported',text);});
test('spreads require exact team and game, signed whole or half points and confirmation',()=>{assert.equal(validateLeg(leg),true);for(const bad of [{team:'UNKNOWN'},{target:null},{target:-7.25},{target:Infinity},{operator:'win'},{playerId:'p'}])assert.equal(validateLeg({...leg,...bad}),false);assert.equal(confirmLegs([{...leg,opponentTeam:null,verificationStatus:'review'}],{roster:[],games:[game],season}).unresolved.length,0);assert.equal(confirmLegs([{...leg,team:'KC'}],{roster:[],games:[game],season}).unresolved.length,1);});
test('duplicate spreads share team/game/handicap but retain moneylines and other alternate lines',()=>{assert.equal(deduplicate([leg,{...leg,alternateSpread:true}]).length,1);assert.equal(deduplicate([{...leg,target:null},{...leg,target:null,alternateSpread:true}]).length,2);assert.equal(deduplicate([leg,{...leg,target:-10.5},{...leg,category:'moneyline',target:null,operator:'win'}]).length,3);});
test('favorite and underdog results apply signed handicap to the selected team',()=>{for(const [target,selected,opponent,expected] of [[-7.5,27,19,'Final Hit'],[-8.5,27,19,'Final Missed'],[10.5,19,27,'Final Hit'],[7.5,19,27,'Final Missed'],[0,27,19,'Final Hit'],[0,19,27,'Final Missed']])assert.equal(evaluateLeg({...leg,target},{...s,scores:{selected,opponent}}),expected);});
test('spreads are provisional until verified, exact final margins stay active',()=>{assert.equal(evaluateLeg(leg,{...s,status:'live',finalVerified:false}),'Provisionally Hit');assert.equal(evaluateLeg(leg,{...s,finalVerified:false}),'Provisionally Hit');const result=evaluateParlay({...card,legs:[{...leg,target:-8}]},[s]);assert.equal(result.status,'active');assert.equal(result.legs[0].state,'Push / Settlement pending');assert.equal(result.legs[0].resolved,false);assert.match(progressMarkup({...leg,target:-8},result.legs[0].progress),/Push \/ settlement pending/);});
test('missing or unrelated scores cannot settle spreads or pretend to be zero',()=>{for(const bad of [{team:'CAR'},{opponentTeam:'KC'},{gameId:'wrong'},{season:2025},{kind:'player',playerId:'p'},{verified:false},{scores:{selected:null,opponent:0}},{scores:{selected:0,opponent:-1}},{status:'pregame'}])assert.equal(evaluateParlay(card,[{...s,...bad}]).status,'active');assert.equal(evaluateLeg({...leg,target:3.5},{...s,scores:{selected:0,opponent:0}}),'Final Hit');});
test('signed spreads persist, restore and validate handicap-adjusted progress',()=>{const repo=repository(),locked=lockParlay({...card,lockedAt:null},true);repo.save(locked);recordObservations(repo,locked,[s]);const saved=repo.list()[0];assert.equal(saved.result.status,'won');assert.equal(saved.result.legs[0].progress.current,27);assert.match(progressMarkup(leg,saved.result.legs[0].progress),/SPREAD -7.5/);assert.doesNotMatch(progressMarkup(leg,saved.result.legs[0].progress),/role="progressbar"/);assert.equal(repository().restore(JSON.stringify({version:1,parlays:[saved]})),1);const bad=structuredClone(saved);bad.legs[0].target=-10.5;bad.result.legs[0].progress.target=-10.5;assert.throws(()=>parseBackup({version:1,parlays:[bad]}));});
test('live synchronization records alternate-spread wins without player coverage',async()=>{const repo=repository();repo.save({...card,legs:[{...leg,alternateSpread:true}]});const sync=createLiveSync({repository:repo,isVisible:()=>true,fetchGame:async()=>({gameId:leg.gameId,season,observations:[s],observedAt:s.observedAt,gameStatus:'final',finalResultsEnabled:true})});await sync.refresh(true);assert.equal(repo.list()[0].result.status,'won');assert.doesNotMatch(feedLabel({identityCoverage:{playerIds:[]}},null,Date.now(),leg),/for this player/);});
test('same-time final verification promotes spread pushes; later corrections may settle them',()=>{const repo=repository(),p={...card,legs:[{...leg,target:-8}]};repo.save(p);recordObservations(repo,p,[{...s,finalVerified:false}]);recordObservations(repo,p,[s]);assert.equal(repo.list()[0].result.legs[0].state,'Push / Settlement pending');recordObservations(repo,p,[{...s,scores:{selected:28,opponent:19},observedAt:'2026-11-01T15:01:00Z'}]);assert.equal(repo.list()[0].result.status,'won');});
test('old unsupported spread drafts become reviewable without guessing lost handicaps',()=>{const old={id:'old',legs:[{category:'unsupported',unsupportedMarket:'POINT SPREAD',playerName:'Green Bay Packers',target:null}]};const next=upgradeSpreadDrafts(old);assert.equal(next.legs[0].category,'spread');assert.equal(next.legs[0].team,'GB');assert.equal(next.legs[0].target,null);assert.equal(old.legs[0].category,'unsupported');assert.equal(upgradeSpreadDrafts({...old,lockedAt:'2026-10-29T12:00:00Z'}).legs[0].category,'unsupported');});
