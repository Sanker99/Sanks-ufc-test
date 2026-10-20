"""Refresh event-filter membership from official cards and exact approved fighter aliases."""
import json,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build_ufc_csv import key
def main():
    dest=ROOT/'data/ufc-streak-events.json';old=json.loads(dest.read_text(encoding='utf-8'));by_url={e.get('source_url'):e for e in old['events']};cards=json.loads((ROOT/'data/ufc-cards.json').read_text(encoding='utf-8'));photos=json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'));events=[]
    for e in cards['events']:
        if not e.get('date') or datetime.fromisoformat(e['date'].replace('Z','+00:00'))<datetime.now(timezone.utc):continue
        ids=set()
        for f in e.get('fights',[]):
            for name in [f['fighter1'],f['fighter2']]:
                pid=photos['by_name'].get('UFC:'+key(name))
                if pid:ids.add(pid)
        if not ids:continue
        prior=by_url.get(e['url'],{});events.append({'id':prior.get('id',e['event']),'title':prior.get('title',e['event']),'date':e['date'][:10],'source_url':e['url'],'athlete_ids':sorted(ids)})
    if not events:return False
    old.update(events=sorted(events,key=lambda e:e['date']),updated=datetime.now(timezone.utc).isoformat());temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(old,indent=2),encoding='utf-8');temp.replace(dest);return True
if __name__=='__main__':main()
