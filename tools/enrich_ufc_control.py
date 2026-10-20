"""Enrich existing histories from complete verified per-round source statistics."""
from pathlib import Path
import csv,json,io,sys
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build_ufc_csv import key
from ufc_round_stats import aggregate
def main():
    folder=ROOT/'work/ufc-source'
    def rows(name):return list(csv.DictReader(io.StringIO((folder/name).read_text(encoding='utf-8-sig'))))
    stats=rows('ufc_fight_stats.csv');results=rows('ufc_fight_results.csv');totals,coverage=aggregate(stats,results)
    data=json.loads((ROOT/'data/ufc-data.json').read_text(encoding='utf-8'));joined=control=0
    for p in data['fighters'].values():
        for f in p.get('fights',[]):
            pair=key(p['name']+' vs. '+f['opponent']);inverse=key(f['opponent']+' vs. '+p['name'])
            found=totals.get((key(f['event']),pair,key(p['name']))) or totals.get((key(f['event']),inverse,key(p['name'])))
            if found is None:continue
            joined+=1
            for metric in ['sig_strikes','total_strikes','takedowns','submissions','control_seconds']:f.pop(metric,None)
            f.update(found)
            if 'control_seconds' in f:f['control_source']=f.get('fight_url');control+=1
    assert joined>10000 and control>5000,'Insufficient join; preserve previous snapshot'
    data['control_coverage']={**coverage,'joined_fighter_bouts':joined,'published_control_fighter_bouts':control,'source':'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fight_stats.csv','original_source':'http://ufcstats.com','joined_at':datetime.now(timezone.utc).isoformat(),'rules':'Every completed round must have CTRL. Exact duplicate round rows counted once; conflicts unknown. Total cannot exceed recorded elapsed duration.'}
    dest=ROOT/'data/ufc-data.json';temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');temp.replace(dest);print(data['control_coverage'])
if __name__=='__main__':main()
