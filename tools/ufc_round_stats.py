"""Conservative UFCStats per-round aggregation; absent rounds never become zero."""
import re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from build_ufc_csv import key, col, landed_count
METRICS={'sig_strikes':('SIG.STR.',400),'total_strikes':('TOTAL STR.',1000),'takedowns':('TD',30),'submissions':('SUB.ATT',30)}
def seconds(value):
    m=re.fullmatch(r'(\d+):([0-5]\d)',str(value or '').strip())
    return int(m[1])*60+int(m[2]) if m else None
def aggregate(stats,results):
    rounds={};duplicates=conflicts=0
    for r in stats:
        ident=(key(r['EVENT']),key(r['BOUT']),key(r['FIGHTER']));m=re.fullmatch(r'Round (\d+)',r['ROUND'].strip())
        if not m:continue
        n=int(m[1]);values={k:landed_count(col(r,header,header+'.'),limit) for k,(header,limit) in METRICS.items()};values['control_seconds']=seconds(r.get('CTRL'))
        bucket=rounds.setdefault(ident,{})
        if n in bucket:
            duplicates+=1
            for k,v in values.items():
                if bucket[n][k]!=v:bucket[n][k]=None;conflicts+=1
        else:bucket[n]=values
    by_bout={}
    for ident,bucket in rounds.items():by_bout.setdefault(ident[:2],[]).append((ident,bucket))
    output={};coverage={'source_round_rows':len(stats),'duplicate_round_rows':duplicates,'conflicting_metric_cells':conflicts,'control_fighter_bouts':0,'unknown_control_fighter_bouts':0}
    for r in results:
        try:n=int(r['ROUND'])
        except (ValueError,TypeError):continue
        # Duration comes from the recorded format plus recorded finish time.
        fmt=re.search(r'\(([\d-]+)\)',r.get('TIME FORMAT',''));periods=[int(v)*60 for v in fmt[1].split('-')] if fmt else []
        finish=seconds(r.get('TIME'));elapsed=sum(periods[:n-1])+finish if finish is not None and len(periods)>=n else None
        for ident,bucket in by_bout.get((key(r['EVENT']),key(r['BOUT'])),[]):
            values={}
            for metric in [*METRICS,'control_seconds']:
                cells=[bucket.get(i,{}).get(metric) for i in range(1,n+1)]
                if cells and all(v is not None for v in cells):values[metric]=sum(cells)
            if values.get('total_strikes',float('inf'))<values.get('sig_strikes',0):values.pop('total_strikes',None)
            ctrl=values.get('control_seconds')
            if ctrl is not None and (elapsed is None or ctrl>elapsed):values.pop('control_seconds',None)
            coverage['control_fighter_bouts' if 'control_seconds' in values else 'unknown_control_fighter_bouts']+=1
            output[ident]=values
    return output,coverage
