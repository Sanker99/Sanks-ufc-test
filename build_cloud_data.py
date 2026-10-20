from pathlib import Path
import json
import server, injuries
root=Path(__file__).resolve().parent
dest=root/'data'
dest.mkdir(exist_ok=True)
server.load_cache()
injuries.load(server.CACHE)
for key in ('stats','schedule'):
    server.fetch(key)
data=server.build()
if not data['players'] or len(data['games'])<250 or len({p['team'] for p in data['players']})<32:
    raise SystemExit("No player stats available: refusing to overwrite previous published data")
temporary=dest/'data.json.tmp'
temporary.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
temporary.replace(dest/'data.json')
injuries.force_refresh(server.CACHE)
snap=injuries.snapshot()
payload={'updated':snap['updated'],'error':snap['error'],'source':snap['source'],
'last_attempt':snap.get('last_attempt'),'last_http':snap.get('last_http'),
'groups':snap.get('groups'),'entries':snap.get('entries'),
'feed_season':snap.get('season'),'route':snap.get('route'),
'coverage':snap.get('coverage'),
'players':{p['id']:injuries.lookup(p,snap) for p in data['players']}}
(dest/'injuries.json').write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
print("Wrote",len(data['players']),"players")
