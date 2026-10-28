// Exact source identifiers only. Names never participate in observation joins.
export function buildPlayerCrosswalk(players, athletes) {
 const ids = Object.create(null), missing = [];
 for (const player of players) {
  const id = athletes[`NFL:${player.id}`]?.measurements?.espn_id;
  if (typeof id !== 'string' || !/^\d+$/.test(id)) { missing.push(player.id); continue; }
  if (Object.hasOwn(ids, id) && ids[id] !== player.id) throw Error('Conflicting provider player ID');
  if (!/^00-\d{7}$/.test(player.id)) throw Error('Invalid GSIS identity');
  ids[id] = player.id;
 }
 return {ids, missing};
}
const canonicalTeam = value => ({LAR:'LA',JAC:'JAX',WSH:'WAS'})[value] ?? value;
export function buildGameCrosswalk(games, rows, season) {
 const byId = new Map(), providerIds = new Set(), ids = Object.create(null), missing = [];
 for (const row of rows.filter(row => Number(row.season) === season)) {
  if (byId.has(row.game_id)) throw Error('Duplicate source game ID');
  byId.set(row.game_id, row);
 }
 for (const game of games) {
  const row = byId.get(game.schedule_id);
  if (!row || !/^\d+$/.test(String(row.espn ?? ''))) { missing.push(game.schedule_id); continue; }
  if (row.gameday !== game.date || canonicalTeam(row.home_team) !== canonicalTeam(game.home) || canonicalTeam(row.away_team) !== canonicalTeam(game.away)) throw Error(`Schedule identity mismatch: ${game.schedule_id}`);
  const providerId = String(row.espn);
  if (providerIds.has(providerId)) throw Error('Duplicate provider game ID');
  providerIds.add(providerId); ids[game.schedule_id] = providerId;
 }
 return {ids, missing};
}
