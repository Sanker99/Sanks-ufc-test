"""Bounded, exact-identity ESPN cross-checks. Unchecked rows are never called verified."""
import json,re,sys,urllib.request,time,unicodedata
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
MAP={'passingYards':'passing_yards','passingTouchdowns':'passing_tds','interceptions':'interceptions','rushingAttempts':'carries','rushingYards':'rushing_yards','rushingTouchdowns':'rushing_tds','receivingYards':'receiving_yards','receivingReceptions':'receptions','receptions':'receptions','receivingTouchdowns':'receiving_tds','receivingTargets':'targets'}
ALIASES={'JAX':'JAC','WSH':'WAS','LAR':'LA'}
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def number(s):
    try:
        n=float(s)
        return n if abs(n)!=float('inf') and n==n else None
    except (TypeError,ValueError):return None
def metrics(group,row):
    result={}
    for key,value in zip(group.get('keys',[]),row.get('stats',[])):
        if key=='completions/passingAttempts':
            pair=str(value).split('/')
            if len(pair)==2:result.update(completions=number(pair[0]),attempts=number(pair[1]))
        elif key in MAP:result[MAP[key]]=number(value)
    return result
def get(url):
    import hashlib
    cache=ROOT/'cache/verification';cache.mkdir(parents=True,exist_ok=True)
    path=cache/(hashlib.sha256(url.encode()).hexdigest()+'.json')
    if path.exists() and time.time()-path.stat().st_mtime<3600:return json.loads(path.read_text(encoding='utf-8'))
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=25) as response:payload=json.load(response)
    path.write_text(json.dumps(payload),encoding='utf-8');return payload
def extract(payload,sport,p,log):
    values={};matches=set()
    for side in payload.get('boxscore',{}).get('players',[]):
        team=side.get('team',{})
        if sport=='NCAA':same=str(team.get('id'))==str(p['team_id'])
        else:same=ALIASES.get(team.get('abbreviation'),team.get('abbreviation'))==ALIASES.get(log.get('team',p['team']),log.get('team',p['team']))
        if not same:continue
        for group in side.get('statistics',[]):
            for row in group.get('athletes',[]):
                athlete=row.get('athlete',{})
                exact=str(athlete.get('id'))==str(p.get('espn_id',p['id'].removeprefix('ncaa:'))) if sport=='NCAA' else norm(athlete.get('displayName',''))==norm(p['name'])
                if exact:matches.add(str(athlete.get('id')));values.update(metrics(group,row))
    return values if len(matches)==1 else {}
def main():
    now=datetime.now(timezone.utc).isoformat();results=[];errors=[]
    nfl=json.loads((ROOT/'data/data.json').read_text(encoding='utf-8'));college=json.loads((ROOT/'data/ncaa-data.json').read_text(encoding='utf-8'))
    samples=[]
    for position in ['QB','RB','WR','TE']:
        eligible=[p for p in nfl['players'] if p['position']==position and p['games']]
        selected=sorted(eligible,key=lambda p:(p['name'] not in ['Dak Prescott','Ashton Jeanty'],p['name']))[:2]
        samples.extend(('NFL',p,p['games'][-1],nfl['season']) for p in selected)
    for conference in ['ACC','Big 12','B1G','PAC-12','SEC']:
        eligible=[p for p in college['players'] if p['conference']==conference and p['position']=='QB' and p['games']]
        if eligible:
            p=max(eligible,key=lambda p:len(p['games']));samples.append(('NCAA',p,p['games'][-1],college['season']))
    for sport,p,log,season in samples:
        gid=log.get('game_id');values={};reason='No exact matching final ESPN box-score player or published value for this statistic';url=None
        try:
            league='nfl' if sport=='NFL' else 'college-football';base='https://site.api.espn.com/apis/site/v2/sports/football/'+league
            if sport=='NFL':
                board=get(base+f'/scoreboard?dates={season}&seasontype=2&week={log["week"]}&limit=1000')
                candidates=[e for e in board.get('events',[]) if e.get('status',{}).get('type',{}).get('completed') and any(ALIASES.get(c.get('team',{}).get('abbreviation'),c.get('team',{}).get('abbreviation'))==ALIASES.get(log.get('team',p['team']),log.get('team',p['team'])) for c in e.get('competitions',[{}])[0].get('competitors',[]))]
                if len(candidates)==1:gid=candidates[0]['id']
            if gid:
                payload=get(base+'/summary?event='+str(gid))
                completed=payload.get('header',{}).get('competitions',[{}])[0].get('status',{}).get('type',{}).get('completed')
                if completed:values=extract(payload,sport,p,log)
                url=f'https://www.espn.com/{"nfl" if sport=="NFL" else "college-football"}/boxscore/_/gameId/{gid}'
        except Exception as exc:reason=str(exc);errors.append({'sport':sport,'player_id':p['id'],'error':reason})
        for metric,primary in log['metrics'].items():
            if number(primary) is None:continue
            secondary=values.get(metric);status='unavailable' if secondary is None else 'verified' if number(primary)==secondary else 'discrepancy'
            results.append({'sport':sport,'player_id':p['id'],'player_name':p['name'],'week':log['week'],'team':log.get('team',p.get('team')),'game_id':gid,'metric':metric,'primary':primary,'secondary':secondary,'status':status,'source_url':url,'checked_at':now,'reason':None if secondary is not None else reason})
    result={'schema_version':1,'updated':now,'policy':'Limited latest-game sample: two NFL players per position and one NCAA quarterback per scoped conference. NFL compares nflverse with ESPN. NCAA rechecks its primary ESPN source, not an independent provider. Unchecked players and metrics are not verified.','sampled_players':len(samples),'summary':{state:sum(r['status']==state for r in results) for state in ['verified','discrepancy','unavailable']},'errors':errors,'results':results}
    dest=ROOT/'data/stat-verification.json';tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(result,indent=2),encoding='utf-8');tmp.replace(dest)
    print('Stat sample checks:',len(samples),'players;',result['summary']);return result
if __name__=='__main__':main()
