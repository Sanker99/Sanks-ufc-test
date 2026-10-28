// Candidate adapter. Not selected by the live tracker until coverage is approved.
const canonical=value=>({LAR:'LA',JAC:'JAX',WSH:'WAS'})[value]??value;
const dateKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const fields={3:'passing_yards',5:'passing_tds',7:'interceptions',22:'rushing_yards',42:'receiving_yards'};
function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value!=='string'||! /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value))return null;return Number(value.replaceAll(',',''));}
export function selectPlayer(payload,sportradarId){
 if(!/^[a-f0-9-]{36}$/.test(sportradarId))throw Error('Invalid external identity');
 const players=(payload.players??[]).filter(p=>(p.proPlayer?.externalIds??[]).some(id=>id.id===sportradarId));
 if(players.length!==1||!Number.isSafeInteger(players[0].proPlayer.id))throw Error('Missing or ambiguous player identity');
 return players[0];
}
export function selectGame(player,game){
 const matches=(player.requestedGames??[]).filter(row=>{const g=row.game;return g&&Number.isSafeInteger(g.id)&&canonical(g.home?.abbreviation)===game.home&&canonical(g.away?.abbreviation)===game.away&&Number.isFinite(Number(g.startTimeEpochMilli))&&dateKey(Number(g.startTimeEpochMilli))===game.date&&Number(row.period?.ordinal??g.period?.ordinal)===Number(game.week);});
 if(matches.length!==1)throw Error('Missing or ambiguous game identity');return matches[0];
}
export function mapListing(player,game,{playerId,team,observedAt}){
 const row=selectGame(player,game),metrics={};
 if(![game.home,game.away].includes(team)||canonical(player.proPlayer?.proTeamAbbreviation)!==team)throw Error('Player team mismatch');
 for(const stat of row.stats??[]){
 const id=stat.category?.id,value=number(stat.value?.value)??number(stat.value?.formatted);
 if(fields[id]&&value!==null)metrics[fields[id]]=value;
 const pair=String(stat.value?.formatted??'').match(/^(\d+)\/(\d+)$/);
 if(pair&&Number(pair[1])<=Number(pair[2])){if(id===12){metrics.completions=Number(pair[1]);metrics.attempts=Number(pair[2]);}if(id===175){metrics.receptions=Number(pair[1]);metrics.targets=Number(pair[2]);}}
 }
 const status=({FINAL_SCORE:'final',IN_PROGRESS:'live',NOT_YET_STARTED:'pregame',POSTPONED:'postponed',SUSPENDED:'suspended',DELAYED:'unavailable'})[row.game.status]??'unavailable';
 const participated=['attempts','receptions','targets'].some(key=>metrics[key]>0)||['passing_yards','rushing_yards','receiving_yards'].some(key=>metrics[key]!==undefined&&metrics[key]!==0);
 return {gameId:game.schedule_id,season:game.season,playerId,providerId:String(player.proPlayer.id),team,status,verified:true,finalVerified:status==='final',participated:participated?true:null,observedAt,metrics,source:'Fleaflicker · candidate',providerGameId:row.game.id};
}
const text=html=>html.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,' ').replace(/&amp;/g,'&').trim();
const cells=row=>[...row.matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)].map(m=>({html:m[2],text:text(m[2]),span:Number(m[1].match(/colspan="(\d+)"/)?.[1]??1)}));
const profileFields={'Passing:Cmp':'completions','Passing:Att':'attempts','Passing:Yd':'passing_yards','Passing:TD':'passing_tds','Passing:INT':'interceptions','Rushing:Att':'carries','Rushing:Yd':'rushing_yards','Rushing:TD':'rushing_tds','Receiving:Rec':'receptions','Receiving:Tgt':'targets','Receiving:Yd':'receiving_yards','Receiving:TD':'receiving_tds'};
export function profileMetrics(html,{providerId,providerGameId,season,week,team}){
 if(typeof html!=='string'||html.length>2000000||!Number.isSafeInteger(providerId)||!Number.isSafeInteger(providerGameId))throw Error('Invalid profile');
 if(!new RegExp('/players/[^"<>]*-'+providerId+'(?:[?"\\s])').test(html))throw Error('Profile identity mismatch');
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]).filter(t=>t.includes('<thead>')&&new RegExp('>'+season+' (?:Passing|Rushing|Receiving)<').test(t));
 if(tables.length!==1)throw Error('Profile table layout changed');
 const table=tables[0],head=table.match(/<thead>([\s\S]*?)<\/thead>/i)?.[1],headers=[...head.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>cells(m[1]));
 if(headers.length!==2)throw Error('Profile headers changed');
 const groups=headers[0].flatMap(cell=>Array(cell.span).fill(cell.text.replace(/^\d{4} /,''))),labels=headers[1].map(c=>c.text);
 if(groups.length!==labels.length||groups.length>50)throw Error('Profile columns changed');
 const rows=[...table.slice(table.indexOf('</thead>')+8).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].filter(m=>new RegExp('boxscore\\?gameId='+providerGameId+'(?:[&"\\s])').test(m[1]));
 if(rows.length!==1)throw Error('Profile game mismatch');
 const values=cells(rows[0][1]);if(values.length!==labels.length||values[0].text!==String(week)||canonical(values[1].text)!==team)throw Error('Profile week/team mismatch');
 const metrics={};for(let i=0;i<labels.length;i++){const key=profileFields[groups[i]+':'+labels[i]];if(!key)continue;const value=number(values[i].text);if(value!==null){if(Object.hasOwn(metrics,key))throw Error('Duplicate stat column');metrics[key]=value;}}
 if(metrics.rushing_yards!==undefined&&metrics.receiving_yards!==undefined)metrics.rush_receive_yards=metrics.rushing_yards+metrics.receiving_yards;
 return metrics;
}
export function buildListingURL({leagueId,season,week,name}){
 if(!Number.isSafeInteger(leagueId)||leagueId<=0||!Number.isInteger(season)||season<2000||season>2100||!Number.isInteger(week)||week<1||week>23||typeof name!=='string'||!name.trim()||name.length>100)throw Error('Invalid lookup');
 const url=new URL('https://www.fleaflicker.com/api/FetchPlayerListing');url.search=new URLSearchParams({sport:'NFL',league_id:String(leagueId),sort:'SORT_SCORING_PERIOD',sort_season:String(season),sort_period:String(week),'filter.query':name,external_id_type:'SPORTRADAR'});return url.href;
}
export async function fetchListing(input,{fetcher=fetch}={}){
 const response=await fetcher(buildListingURL(input),{redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Candidate source unavailable ('+response.status+')');
 if(Number(response.headers.get('content-length')||0)>2000000)throw Error('Source response too large');
 const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000)throw Error('Source response too large');raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{await reader.cancel();}
 return JSON.parse(raw);
}
