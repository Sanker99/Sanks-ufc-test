import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentScheduleWeek,suggestedWeekGame,defaultWeekGames} from '../schedule.mjs';
const data=JSON.parse(readFileSync(new URL('../../data/data.json',import.meta.url))),season=data.season,games=data.games;
const at=iso=>({now:new Date(iso),timeZone:'America/Chicago'});
const leg={playerId:'test',playerName:'Test',team:'PHI',season,gameId:null,category:'receiving_yards',operator:'>=',target:40,verificationStatus:'review'};
test('Monday night stays in this week until local Tuesday, then advances',()=>{
 assert.equal(currentScheduleWeek(games,season,at('2026-10-27T04:59:00Z')),7);
 assert.equal(currentScheduleWeek(games,season,at('2026-10-27T05:00:00Z')),8);
 assert.equal(currentScheduleWeek(games,season,at('2026-11-01T07:30:00Z')),8);
});
test('the seven-leg Eagles/Cowboys card defaults to the current scheduled matchup',()=>{
 const names=['Dallas Goedert','CeeDee Lamb','George Pickens','Darius Cooper','Saquon Barkley','Jake Ferguson','Dak Prescott'];
 const input=names.map(name=>{const p=data.players.find(p=>p.name===name);assert.ok(p,name);return {...leg,playerId:p.id,playerName:p.name,team:p.team};});
 const result=defaultWeekGames(input,games,{season,week:7});
 assert.ok(result.every(l=>l.gameId==='2026_07_DAL_PHI'));assert.ok(result.every(l=>l.verificationStatus==='review'));
 assert.ok(input.every(l=>l.gameId===null));assert.equal(result[0].gameAssumption.week,7);
});
test('next-week suggestions follow each team rather than forcing one shared game',()=>{
 assert.equal(suggestedWeekGame(leg,games,{season,week:8}).schedule_id,'2026_08_PHI_WAS');
 assert.equal(suggestedWeekGame({...leg,team:'DAL'},games,{season,week:8}).schedule_id,'2026_08_ARI_DAL');
});
test('saved games and user overrides remain unchanged',()=>{
 const chosen={...leg,gameId:'2026_01_WAS_PHI',verificationStatus:'confirmed'};
 assert.deepEqual(defaultWeekGames([chosen],games,{season,week:7})[0],chosen);
});
test('bye weeks, unsupported selections and ambiguous schedules remain unassigned',()=>{
 assert.equal(suggestedWeekGame({...leg,team:'BUF'},games,{season,week:7}),null);
 assert.equal(suggestedWeekGame({...leg,category:'unsupported'},games,{season,week:7}),null);
 const match=games.find(g=>g.schedule_id==='2026_07_DAL_PHI');
 assert.equal(suggestedWeekGame(leg,[...games,{...match,schedule_id:'2026_07_extra'}],{season,week:7}),null);
});
test('printed conflicting matchups and wrong seasons do not get a default',()=>{
 assert.equal(suggestedWeekGame(leg,games,{season,week:7,text:'PHI @ WAS'}),null);
 assert.equal(suggestedWeekGame(leg,games,{season,week:7,text:'DAL @ PHI'}).schedule_id,'2026_07_DAL_PHI');
 assert.equal(suggestedWeekGame({...leg,season:2025},games,{season,week:7}),null);
});
test('outside published schedule weeks there is no guessed game or week',()=>{
 assert.equal(currentScheduleWeek(games,season,at('2027-03-01T12:00:00Z')),null);
 assert.equal(suggestedWeekGame(leg,games,{season,week:null}),null);
});
