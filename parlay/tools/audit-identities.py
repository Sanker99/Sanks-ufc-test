"""Audit existing exact player IDs and a downloaded nflverse games.csv. No network I/O."""
import csv
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
if len(sys.argv) != 2:
    raise SystemExit("Usage: python parlay/tools/audit-identities.py path/to/games.csv")
with Path(sys.argv[1]).open(encoding="utf-8-sig", newline="") as source:
    rows = list(csv.DictReader(source))
script = """
import fs from 'node:fs';
import {buildPlayerCrosswalk,buildGameCrosswalk} from './parlay/identity.mjs';
const data=JSON.parse(fs.readFileSync('data/data.json'));
const athletes=JSON.parse(fs.readFileSync('data/athlete-content.json')).athletes;
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
const players=buildPlayerCrosswalk(data.players,athletes);
const games=buildGameCrosswalk(data.games,rows,data.season);
console.log(JSON.stringify({season:data.season,players:Object.keys(players.ids).length,missingPlayers:players.missing,games:Object.keys(games.ids).length,missingGames:games.missing},null,2));
"""
subprocess.run(["node", "--input-type=module", "-e", script], cwd=root, input=json.dumps(rows), text=True, check=True)
