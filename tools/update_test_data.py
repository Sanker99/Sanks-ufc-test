"""Refresh free existing integrations independently; preserve previous snapshots on failure."""
import argparse,json,os,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def stamp():return datetime.now(timezone.utc).isoformat()
def age(path):
    if not path.exists():return float('inf')
    try:
        data=json.loads(path.read_text(encoding='utf-8'));value=data.get('updated') or data.get('updated_at') or data.get('sources',{}).get('stats',{}).get('updated')
        return (datetime.now(timezone.utc)-datetime.fromisoformat(value.replace('Z','+00:00'))).total_seconds()
    except Exception:return float('inf')
def main(force=False,only=None):
    if os.environ.get('SANKS_TARGET_PROJECT','sanksresearchlab-test')!='sanksresearchlab-test':raise RuntimeError('This updater is restricted to the test Lab')
    jobs=[('NFL','data/data.json',1800,['build_cloud_data.py']),('NCAA','data/ncaa-data.json',3600,['tools/build_ncaa_data.py','--season',str(datetime.now().year),'--cache','work/ncaa-cache','--refresh']),('UFC','data/ufc-data.json',21600,['build_ufc_csv.py']),('UFC_cards','data/ufc-cards.json',86400,['build_ufc_cards.py']),('UFC_countries','data/ufc-countries.json',86400,['tools/build_ufc_countries.py'])]
    jobs.append(('Weather','data/game-weather.json',1800,['tools/build_weather.py']))
    status_path=ROOT/'data/refresh-status.json';status=json.loads(status_path.read_text()) if status_path.exists() else {'feeds':{}}
    for name,file,ttl,command in jobs:
        if only and name not in only:continue
        if not force and age(ROOT/file)<ttl:continue
        path=ROOT/file;before=path.read_bytes() if path.exists() else None
        entry={'last_attempt':stamp(),'snapshot':file}
        try:
            result=subprocess.run([sys.executable,*command],cwd=ROOT,capture_output=True,text=True,timeout=1200)
            if result.returncode:raise RuntimeError(result.stderr[-1500:] or result.stdout[-1500:])
            payload=json.loads(path.read_text(encoding='utf-8'));entry.update(cached=False,error=None,source_updated=payload.get('updated') or payload.get('sources',{}).get('stats',{}).get('updated'))
            if name=='NFL':(ROOT/'data.json').write_bytes(path.read_bytes())
            if name=='UFC_cards':
                from build_streak_event_snapshot import main as events_snapshot
                events_snapshot()
            if name=='NCAA':
                # Reuse season-audited classifications/recovered logs; don't repeat 1,000 athlete requests each hour.
                entry['availability_note']='Existing exact-ID availability audit retained; new unclassified zero-log athletes remain unavailable'
            print(name,'updated',flush=True)
        except Exception as exc:
            if before is not None:path.write_bytes(before)
            entry.update(cached=before is not None,error=str(exc),source_updated=json.loads(before).get('updated') if before else None)
            print(name,'retained previous snapshot:',str(exc)[:180],flush=True)
        status['feeds'][name]=entry
    status['checked_at']=stamp();tmp=status_path.with_suffix('.tmp');tmp.write_text(json.dumps(status,indent=2),encoding='utf-8');tmp.replace(status_path)
    return status
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--force',action='store_true');p.add_argument('--only',nargs='+');a=p.parse_args();main(a.force,a.only)
