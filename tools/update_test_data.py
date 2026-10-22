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

def assess(name,payload):
    """A successful process is not proof that its upstream data is complete or fresh."""
    warnings=[]
    if name=='NFL':
        problems=[k+': '+str(v['error']) for k,v in payload.get('sources',{}).items() if v.get('error')]
        if problems:raise ValueError('Upstream failure: '+'; '.join(problems))
        if not payload.get('players') or not payload.get('games'):raise ValueError('Empty NFL snapshot')
    if name=='NCAA':
        coverage=payload.get('coverage',{})
        if coverage.get('issues'):raise ValueError('NCAA box-score coverage failed')
        if payload.get('season')!=datetime.now(timezone.utc).year:raise ValueError('NCAA season mismatch')
        if coverage.get('unresolved_identity_rows'):warnings.append(str(coverage['unresolved_identity_rows'])+' excluded statistical rows need identity reconciliation; see exclusion ledger')
    if name=='UFC':
        latest=payload.get('coverage',{}).get('latest_event_date')
        if latest and (datetime.now(timezone.utc)-datetime.fromisoformat(latest).replace(tzinfo=timezone.utc)).days>14:warnings.append('Historical mirror has no event in the last 14 days; check upstream freshness')
    if name=='Availability':
        for league,report in payload.get('leagues',{}).items():
            if report.get('error'):warnings.append(league+': '+report['error'])
            for conference,error in report.get('official_errors',{}).items():warnings.append(conference+' official report: '+error)
            if report.get('supplemental_error'):warnings.append(league+' supplemental: '+report['supplemental_error'])
            elif report.get('partial'):warnings.append(league+': '+str(report.get('teams_with_current_reports',0))+'/'+str(report.get('scoped_teams',0))+' teams with current matched reports')
    if name=='Measurements':
        coverage=payload.get('measurement_coverage',{})
        if not coverage.get('sourced'):raise ValueError('No sourced player measurements')
        if coverage.get('missing_or_partial'):warnings.append(str(len(coverage['missing_or_partial']))+' players have incomplete measurements')
        if coverage.get('source_errors'):warnings.append(str(len(coverage['source_errors']))+' current roster source checks failed; sourced fallback retained')
    if name=='Experience':
        for sport,feed in payload.get('news',{}).items():
            if feed.get('error'):warnings.append(sport+' news: '+feed['error'])
        if payload.get('issues'):warnings.append(str(len(payload['issues']))+' helmet source gaps')
    if name=='NFL_intelligence':
        if not payload.get('players'):raise ValueError('Empty NFL intelligence')
        warnings.append('Supplemental reserve/injury source; current player-specific ESPN reports take precedence by report time.')
    if name=='Fantasy_projections':
        if len(payload.get('players',{}))<100:raise ValueError('Insufficient matched projection coverage')
    if name=='Event_times' and payload.get('errors'):warnings.append('Some UFC schedule checks failed; last-good section times retained')
    if name=='Verification' and payload.get('summary',{}).get('discrepancy'):warnings.append('Statistical discrepancies require review')
    return warnings
def main(force=False,only=None):
    if os.environ.get('SANKS_TARGET_PROJECT','sanksresearchlab-test')!='sanksresearchlab-test':raise RuntimeError('This updater is restricted to the test Lab')
    jobs=[('NFL','data/data.json',1800,['build_cloud_data.py']),('NCAA','data/ncaa-data.json',3600,['tools/build_ncaa_data.py','--season',str(datetime.now().year),'--cache','work/ncaa-cache','--refresh']),('UFC','data/ufc-data.json',21600,['build_ufc_csv.py']),('UFC_cards','data/ufc-cards.json',86400,['build_ufc_cards.py']),('UFC_countries','data/ufc-countries.json',86400,['tools/build_ufc_countries.py'])]
    jobs.extend([('Measurements','data/athlete-content.json',86400,['tools/build_player_measurements.py']),('Experience','data/lab-experience.json',1800,['tools/build_lab_experience.py']),('UFC_events','data/ufc-streak-events.json',1800,['tools/build_streak_event_snapshot.py']),('Availability','data/player-availability.json',1800,['tools/build_availability.py']),('Verification','data/stat-verification.json',3600,['tools/verify_stat_samples.py']),('Weather','data/game-weather.json',1800,['tools/build_weather.py'])])
    jobs.extend([('NFL_intelligence','data/nfl-intelligence.json',1800,['tools/build_nfl_intelligence.py']),('Event_times','data/event-times.json',1800,['tools/build_event_times.py']),('Fantasy_projections','data/fantasy-projections.json',3600,['tools/build_fantasy_projections.py'])])
    status_path=ROOT/'data/refresh-status.json';status=json.loads(status_path.read_text()) if status_path.exists() else {'feeds':{}}
    for name,file,ttl,command in jobs:
        if only and name not in only:continue
        companions={'NCAA':'data/ncaa-stat-exclusions.json','UFC_events':'data/ufc-profile-records.json'}
        companion_ready=name not in companions or (ROOT/companions[name]).exists()
        if name=='Availability' and (ROOT/file).exists():companion_ready=json.loads((ROOT/file).read_text(encoding='utf-8')).get('policy_version')==4
        if name=='Fantasy_projections' and (ROOT/file).exists():companion_ready=json.loads((ROOT/file).read_text(encoding='utf-8')).get('policy_version')==1
        if not force and companion_ready and age(ROOT/file)<ttl:continue
        path=ROOT/file;before=path.read_bytes() if path.exists() else None
        entry={'last_attempt':stamp(),'snapshot':file}
        try:
            result=subprocess.run([sys.executable,*command],cwd=ROOT,capture_output=True,text=True,timeout=1200)
            if result.returncode:raise RuntimeError(result.stderr[-1500:] or result.stdout[-1500:])
            payload=json.loads(path.read_text(encoding='utf-8'));warnings=assess(name,payload);entry.update(cached=False,error=None,partial=bool(warnings),warnings=warnings,source_updated=payload.get('updated') or payload.get('updated_at') or payload.get('sources',{}).get('stats',{}).get('updated'))
            if name=='NFL':
                (ROOT/'data.json').write_bytes(path.read_bytes())
                if (ROOT/'data/injuries.json').exists():(ROOT/'injuries.json').write_bytes((ROOT/'data/injuries.json').read_bytes())
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
