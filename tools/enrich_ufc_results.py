"""Join UFCStats scheduled format by exact event, fighter and opponent, never finish round."""
import sys, json, csv, io, urllib.request, re
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build_ufc_csv import key, fight_names, col, parse_scheduled_rounds
SOURCE='https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fight_results.csv'
def main():
    cache=ROOT/'work/ufc-source';cache.mkdir(parents=True,exist_ok=True);p=cache/'ufc_fight_results.csv'
    if not p.exists():
        with urllib.request.urlopen(SOURCE,timeout=90) as r:raw=r.read()
        p.write_bytes(raw)
    rows=list(csv.DictReader(io.StringIO(p.read_text(encoding='utf-8-sig'))));lookup={}
    for r in rows:
        names=fight_names(r['BOUT'])
        if len(names)!=2:continue
        for a,b in [names,names[::-1]]:lookup[(key(r['EVENT']),key(a),key(b))]=r
    dest=ROOT/'data/ufc-data.json';data=json.loads(dest.read_text(encoding='utf-8'));matched=scheduled=0
    for fighter in data['fighters'].values():
        for f in fighter.get('fights',[]):
            r=lookup.get((key(f['event']),key(fighter['name']),key(f['opponent'])))
            if not r:continue
            matched+=1;f['fight_url']=r['URL'].strip();f['time_format']=r['TIME FORMAT'].strip();f['time']=r['TIME'];f['scheduled_rounds']=parse_scheduled_rounds(r['TIME FORMAT']);f['scheduled_rounds_source']=r['URL'].strip();scheduled+=f['scheduled_rounds'] in [3,5]
    assert matched>10000,'Incomplete historical join; preserve previous snapshot'
    data['format_coverage']={'matched_fighter_bouts':matched,'verified_3_or_5_rounds':scheduled,'source_snapshot':SOURCE,'joined_at':datetime.now(timezone.utc).isoformat(),'basis':'UFCStats TIME FORMAT; no inference from title status or finish round'}
    # Enrichment time is separate from the original fight-data update timestamp.
    temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');temp.replace(dest)
    print(data['format_coverage'])
if __name__=='__main__':main()
