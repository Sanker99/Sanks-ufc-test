# Regenerate exact external-ID mapping from a downloaded DynastyProcess db_playerids.csv.
from pathlib import Path
import csv,json,re,sys
rows=list(csv.DictReader(Path(sys.argv[1]).open(encoding='utf-8-sig')));data=json.loads(Path('data/data.json').read_text(encoding='utf-8'));roster={p['id']:p for p in data['players']};out={};used={}
for row in rows:
 gsis=row['gsis_id'];provider=row['sportradar_id']
 if gsis not in roster or not re.fullmatch('[a-f0-9-]{36}',provider):continue
 if gsis in out and out[gsis]['sportradarId']!=provider:raise ValueError('Conflicting GSIS mapping')
 if provider in used and used[provider]!=gsis:raise ValueError('Conflicting provider mapping')
 out[gsis]={'sportradarId':provider,'name':roster[gsis]['name'],'team':roster[gsis]['team']};used[provider]=gsis
missing=sorted(set(roster)-set(out));Path('parlay/fleaflicker-identities.mjs').write_text('// Exact GSIS/Sportradar joins for Fleaflicker external IDs. Names are search hints only.\nexport default '+json.dumps({'source':'https://github.com/dynastyprocess/data','players':out,'missing':missing},separators=(',',':'))+';\n',encoding='utf-8');print(json.dumps({'mapped':len(out),'missing':len(missing),'mahomes':out.get('00-0033873')}))
