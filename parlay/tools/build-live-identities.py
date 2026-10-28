"""Regenerate exact live IDs from the existing Lab roster and downloaded nflverse games.csv."""
import csv
import json
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[2]
if len(sys.argv) != 2:
    raise SystemExit("Usage: python parlay/tools/build-live-identities.py path/to/games.csv")
with Path(sys.argv[1]).open(encoding="utf-8-sig", newline="") as source:
    rows = list(csv.DictReader(source))
script = r"""
import fs from 'node:fs';
import {buildPlayerCrosswalk,buildGameCrosswalk} from './parlay/identity.mjs';
const data=JSON.parse(fs.readFileSync('data/data.json')),athletes=JSON.parse(fs.readFileSync('data/athlete-content.json')).athletes;
const rows=JSON.parse(fs.readFileSync(0,'utf8')),p=buildPlayerCrosswalk(data.players,athletes),g=buildGameCrosswalk(data.games,rows,data.season);
const players=Object.fromEntries(Object.entries(p.ids).map(([providerId,id])=>[id,{providerId,team:data.players.find(x=>x.id===id).team}]));
const games=Object.fromEntries(data.games.filter(x=>g.ids[x.schedule_id]).map(x=>[x.schedule_id,{id:x.schedule_id,providerId:g.ids[x.schedule_id],season:data.season,home:x.home,away:x.away,date:x.date}]));
fs.writeFileSync('parlay/live-identities.mjs','// Exact nflverse/ESPN IDs; generated from the existing roster and nflverse schedule.\nexport default '+JSON.stringify({season:data.season,players,games,missingPlayers:p.missing})+';\n');
console.log(JSON.stringify({players:Object.keys(players).length,games:Object.keys(games).length,missingPlayers:p.missing.length,missingGames:g.missing}));
"""
subprocess.run(["node","--input-type=module","-e",script],cwd=root,input=json.dumps(rows),text=True,check=True)
