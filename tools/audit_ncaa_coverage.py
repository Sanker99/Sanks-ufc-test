"""Cross-check zero-log roster identities against ESPN's season-specific player game log."""
import argparse,json,urllib.request,time
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor,as_completed
ROOT=Path(__file__).resolve().parents[1]
FIELDS={'passingYards':'passing_yards','passingTouchdowns':'passing_tds','passingAttempts':'attempts','completions':'completions','interceptions':'interceptions','rushingAttempts':'carries','rushingYards':'rushing_yards','rushingTouchdowns':'rushing_tds','receivingYards':'receiving_yards','receptions':'receptions','receivingTouchdowns':'receiving_tds','receivingTargets':'targets'}
def number(v):
    try:return float(v) if str(v).strip() not in ['','--','-'] else None
    except (TypeError,ValueError):return None
def inspect_response(player,response,games,season,complete):
    filt=next((x for x in response.get('filters',[]) if x.get('name')=='season'),{})
    if str(filt.get('value'))!=str(season):raise ValueError('Player game-log season mismatch')
    logs=[];observed=0
    for kind in response.get('seasonTypes',[]):
        if str(season) not in kind.get('displayName',''):continue
        for category in kind.get('categories',[]):
            for entry in category.get('events',[]):
                gid=str(entry.get('eventId'));game=games.get(gid);event=response.get('events',{}).get(gid,{})
                if not game or not game['completed'] or str(event.get('team',{}).get('id'))!=player['team_id']:continue
                observed+=1;metrics={FIELDS[k]:number(v) for k,v in zip(response.get('names',[]),entry.get('stats',[])) if k in FIELDS}
                if not any(v is not None for v in metrics.values()):continue
                logs.append({'game_id':gid,'week':game['week'],'date':game['date'],'team':player['team'],'team_id':player['team_id'],'opponent':game['away'] if game['home_id']==player['team_id'] else game['home'],'metrics':metrics,'source_url':f'https://www.espn.com/college-football/player/gamelog/_/id/{player["espn_id"]}?season={season}','source_kind':'ESPN season player game log'})
    if logs:return logs,{'state':'recorded_appearances','label':'Recorded appearances','appearances':len({g['game_id'] for g in logs})}
    if observed:return [],{'state':'statistics_unavailable','label':'Statistics unavailable','reason':'ESPN records an appearance but no supported offensive statistic'}
    if complete:return [],{'state':'no_recorded_appearances','label':'No recorded appearances','reason':'No entries in ESPN season player game log or covered team offensive box scores; not proof of inactivity or injury'}
    return [],{'state':'statistics_unavailable','label':'Statistics unavailable','reason':'Team final box-score coverage is incomplete'}
def main(cache,refresh=False):
    dest=ROOT/'data/ncaa-data.json';data=json.loads(dest.read_text(encoding='utf-8'));season=data['season'];games={g['id']:g for g in data['games']};complete=data['coverage']['boxscores_loaded']==data['coverage']['completed_games'] and not data['coverage'].get('issues');cache.mkdir(parents=True,exist_ok=True)
    selected=[p for p in data['players'] if not p['games']];issues=[];added=0
    def one(player):
        p=cache/(player['espn_id']+'.json');url=f'https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/{player["espn_id"]}/gamelog?season={season}'
        try:
            if p.exists() and not refresh:response=json.loads(p.read_text(encoding='utf-8'))
            else:
                with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=20) as r:response=json.load(r)
                temp=p.with_suffix('.tmp');temp.write_text(json.dumps(response),encoding='utf-8');temp.replace(p)
            logs,availability=inspect_response(player,response,games,season,complete)
            return player,logs,{**availability,'source_url':url,'checked_at':datetime.now(timezone.utc).isoformat()},None
        except Exception as e:return player,[],{'state':'statistics_unavailable','label':'Statistics unavailable','reason':'Player season check failed; no activity inferred','source_url':url},str(e)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(one,p) for p in selected]
        for i,f in enumerate(as_completed(futures),1):
            p,logs,availability,error=f.result();p['availability']=availability;p['games'].extend(logs);added+=len(logs)
            if error:issues.append({'player_id':p['id'],'error':error})
            if i%100==0:print('NCAA identities checked',i,'/',len(selected),flush=True)
    for p in data['players']:
        p['games'].sort(key=lambda g:(g['date'],g['game_id']))
        if not p.get('availability'):p['availability']={'state':'recorded_appearances','label':'Recorded appearances','appearances':len(p['games']),'source_url':p['source_url']}
    counts={state:sum(p['availability']['state']==state for p in data['players']) for state in ['recorded_appearances','no_recorded_appearances','statistics_unavailable']}
    recovered=sum(g.get('source_kind')=='ESPN season player game log' for p in data['players'] for g in p['games'])
    checked=max(len(selected),data.get('availability_audit',{}).get('checked_zero_log_players',0))
    data['coverage']['player_game_logs']=sum(len(p['games']) for p in data['players']);data['availability_audit']={'checked_zero_log_players':checked,'added_game_logs':recovered,'new_game_logs_this_run':added,'states':counts,'issues':issues,'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'Published offensive statistics; absence is not a medical, eligibility or inactive designation'}
    temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');temp.replace(dest)
    (ROOT/'ncaa-availability-audit.json').write_text(json.dumps(data['availability_audit'],indent=2),encoding='utf-8');print(data['availability_audit'],flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,default=ROOT/'work/ncaa-gamelogs');p.add_argument('--refresh',action='store_true');a=p.parse_args();main(a.cache,a.refresh)
