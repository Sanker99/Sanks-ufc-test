"""Source-backed availability. No clearance inferred from roster membership or absence."""
import json,re,unicodedata,urllib.request,csv,io
from pathlib import Path
from datetime import datetime,timezone,timedelta
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
TEAM_IDS={'ATL':1,'BUF':2,'CHI':3,'CIN':4,'CLE':5,'DAL':6,'DEN':7,'DET':8,'GB':9,'TEN':10,'IND':11,'KC':12,'LV':13,'LA':14,'MIA':15,'MIN':16,'NE':17,'NO':18,'NYG':19,'NYJ':20,'PHI':21,'ARI':22,'PIT':23,'LAC':24,'SF':25,'SEA':26,'TB':27,'WAS':28,'CAR':29,'JAC':30,'BAL':33,'HOU':34}
ALIASES={'JAX':'JAC','WSH':'WAS','LAR':'LA'}
def norm(value):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',str(value)).encode('ascii','ignore').decode().lower())
def read(path):return json.loads(path.read_text(encoding='utf-8'))

def athlete_id(athlete):
    ids={str(athlete['id'])} if athlete.get('id') else set()
    for link in athlete.get('links',[]):
        match=re.search(r'^https://www\.espn\.com/(?:nfl|college-football)/player/(?:[^?#]*?/)?id/(\d+)(?:/|$)',link.get('href',''))
        if match:ids.add(match[1])
    return next(iter(ids)) if len(ids)==1 else ''
def instant(value):
    try:return datetime.fromisoformat(str(value).replace('Z','+00:00')).astimezone(timezone.utc)
    except (ValueError,TypeError):return None
def classify(status,reported_at,now):
    reported=instant(reported_at)
    if not reported or reported>now+timedelta(minutes=5) or now-reported>(timedelta(days=180) if str(status).strip().lower() in ['injured reserve','ir','out for season'] and reported.year==now.year else timedelta(hours=72)):return 'unknown','Unconfirmed','The player-specific report is missing a current date.'
    text=str(status).strip().lower()
    if text in ['active','available','cleared','will play']:return 'available','Available',f'ESPN reports {status}. This is a source designation, not a guarantee of game-day participation.'
    if text in ['questionable','doubtful','probable','day-to-day','day to day','game time decision']:return 'questionable',str(status).title(),f'ESPN reports {status}; participation remains uncertain.'
    if text in ['out','inactive','injured reserve','ir','out for season','suspended','pup','nfi']:return 'out','Out',f'ESPN reports {status}. Check the linked report for the reason and latest updates.'
    return 'unknown','Unconfirmed',f'The source designation {status or "unknown"} does not confirm availability.'

def college_reports(roster,now):
    """Team + position + unique initial/surname match; dated reports only."""
    from bs4 import BeautifulSoup
    url='https://www.covers.com/sport/football/ncaaf/injuries'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=40) as response:soup=BeautifulSoup(response.read(),'html.parser')
    index={};teams={};players={};unmatched=[];seen=set()
    for p in roster:
        teams.setdefault(norm(p['team_name']),set()).add(str(p['team_id']))
    for table in soup.select('table'):
        container=table.find_parent(class_='covers-CoversMatchups-injuryContainer')
        heading=container.find_previous_sibling() if container else None
        label=heading.select_one('.covers-CoversMatchups-teamName') if heading else None
        tids=teams.get(norm(label.get_text(' ',strip=True)),set()) if label else set()
        if len(tids)!=1:continue
        tid=next(iter(tids));seen.add(tid)
        for row in table.select('tbody tr'):
            cells=row.find_all('td',recursive=False)
            if len(cells)!=4 or not cells[2].find('b'):continue
            abbreviated=cells[0].get_text(' ',strip=True);pos=cells[1].get_text(strip=True)
            candidates=[p for p in roster if str(p['team_id'])==tid and p['position']==pos and norm(p['name'])[0:1]==norm(abbreviated)[0:1] and norm(p['name']).endswith(norm(abbreviated)[1:])]
            if len(candidates)!=1:
                if pos in ['QB','RB','WR','TE']:unmatched.append({'team_id':tid,'name':abbreviated,'position':pos})
                continue
            p=candidates[0];status=cells[2].find('b').get_text(' ',strip=True).split(' - ')[0]
            date_match=re.search(r'([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})',cells[2].get_text(' ',strip=True))
            if not date_match:continue
            reported=datetime.strptime(date_match[1]+f' {now.year}','%a, %b %d %Y').replace(tzinfo=timezone.utc)
            detail=row.find_next_sibling('tr');detail=detail.get_text(' ',strip=True) if detail and 'collapse' in detail.get('class',[]) else ''
            if re.search(r'(remainder|rest|entire).*season|season.ending',detail,re.I):status='Out for Season'
            state,label,reason=classify(status,reported.isoformat(),now)
            if state=='unknown':continue
            players[str(p['id'])]={'state':state,'label':label,'reason':f'Covers reports {status}. '+detail,'reported_status':status,'reported_at':reported.isoformat(),'source_url':url,'source_feed':url,'source_athlete_id':p['espn_id'],'team_id':tid,'match_method':'Unique team, position, first initial and surname'}
    if not seen:raise ValueError('No scoped NCAA injury tables parsed')
    return {'players':players,'teams_seen':len(seen),'unmatched':unmatched,'source_url':url}
def parse(league,payload,roster,now):
    if int(payload.get('season',{}).get('year',0))!=now.year:raise ValueError('Availability season mismatch')
    groups=payload.get('injuries')
    if not isinstance(groups,list) or not groups:raise ValueError('Availability feed has no team groups')
    url='https://site.api.espn.com/apis/site/v2/sports/football/'+('nfl' if league=='NFL' else 'college-football')+'/injuries'
    by_name={};by_id={};scope=set()
    for p in roster:
        team=str(TEAM_IDS.get(ALIASES.get(p.get('team'),p.get('team')),'')) if league=='NFL' else str(p['team_id'])
        scope.add(team);by_name.setdefault((team,norm(p['name'])),[]).append(p);by_id[(team,str(p.get('espn_id','')))]=p
    players={};current=set();stale=0;unmatched=0;entries=0
    for group in groups:
        team=str(group.get('id',''))
        if team not in scope:continue
        for row in group.get('injuries',[]):
            athlete=row.get('athlete',{});aid=athlete_id(athlete)
            p=by_id.get((team,aid)) if aid else None
            if not p:unmatched+=1;continue
            status=row.get('status','');date=row.get('date');state,label,reason=classify(status,date,now);entries+=1
            if state=='unknown':stale+=1
            else:current.add(team)
            record={'state':state,'label':label,'reason':reason,'reported_status':status,'reported_at':date,'source_url':f'https://www.espn.com/'+('nfl' if league=='NFL' else 'college-football')+'/player/_/id/'+aid,'source_feed':url,'source_athlete_id':aid,'team_id':team}
            previous=players.get(str(p['id']))
            if not previous or (instant(date) or datetime.min.replace(tzinfo=timezone.utc))>(instant(previous.get('reported_at')) or datetime.min.replace(tzinfo=timezone.utc)):players[str(p['id'])]=record
    return {'source_url':url,'checked_at':now.isoformat(),'source_timestamp':payload.get('timestamp'),'scoped_teams':len(scope),'teams_seen':sum(str(g.get('id')) in scope for g in groups),'teams_with_current_reports':len(current),'matched_entries':entries,'stale_or_unknown_entries':stale,'unmatched_entries':unmatched,'partial':len(current)<len(scope),'players':players,'error':None}
def main():
    now=datetime.now(timezone.utc);dest=ROOT/'data/player-availability.json';old=read(dest) if dest.exists() else {'schema_version':1,'leagues':{}}
    nfl=read(ROOT/'data/data.json')['players'];photos=read(ROOT/'data/athlete-photos.json')['photos'];names={(ALIASES.get(p['team'],p['team']),norm(p['name'])) for p in nfl}
    for p in photos.values():
        if p['sport']=='NFL' and (ALIASES.get(p['roster']['team'],p['roster']['team']),norm(p['name'])) not in names:nfl.append({'id':p['id'],'name':p['name'],**p['roster']})
    # Current-season exact GSIS/ESPN/team crosswalk; no name-only fallback.
    crosswalk_url=f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{now.year}.csv'
    with urllib.request.urlopen(crosswalk_url,timeout=45) as response:crosswalk=list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
    identities={}
    for r in crosswalk:
        if r.get('espn_id'):identities.setdefault((norm(r.get('full_name','')),ALIASES.get(r['team'],r['team']),r.get('position')),set()).add(r['espn_id'])
    crosswalk={(r['gsis_id'],ALIASES.get(r['team'],r['team'])):r['espn_id'] for r in crosswalk if r.get('gsis_id') and r.get('espn_id')}
    for p in nfl:
        t=ALIASES.get(p['team'],p['team']);ids=identities.get((norm(p['name']),t,p.get('position')),set())
        p['espn_id']=crosswalk.get((str(p['id']),t),next(iter(ids)) if len(ids)==1 else '')
    ncaa_data=read(ROOT/'data/ncaa-data.json');ncaa=ncaa_data['players']
    def collect(item):
        league,roster=item;url='https://site.api.espn.com/apis/site/v2/sports/football/'+('nfl' if league=='NFL' else 'college-football')+'/injuries'
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=35) as response:payload=json.load(response)
            return league,parse(league,payload,roster,now)
        except Exception as exc:
            previous=old['leagues'].get(league,{})
            return league,{**previous,'error':str(exc),'last_attempt':now.isoformat(),'partial':True}
    with ThreadPoolExecutor(max_workers=2) as pool:leagues=dict(pool.map(collect,[('NFL',nfl),('NCAA',ncaa)]))
    try:
        college=college_reports(ncaa,now);league=leagues['NCAA']
        for pid,row in college['players'].items():
            previous=league.get('players',{}).get(pid)
            if not previous or previous['state']=='unknown' or instant(row['reported_at'])>instant(previous['reported_at']):league.setdefault('players',{})[pid]=row
        league.update(checked_at=now.isoformat(),supplemental_source=college['source_url'],supplemental_unmatched=college['unmatched'],supplemental_error=None)
        league['matched_entries']=len(league.get('players',{}));league['teams_seen']=max(league.get('teams_seen',0),college['teams_seen'])
        league['teams_with_current_reports']=len({r['team_id'] for r in league['players'].values() if r['state']!='unknown'});league['partial']=league['teams_with_current_reports']<league['scoped_teams']
    except Exception as exc:leagues['NCAA']['supplemental_error']=str(exc)
    try:from .build_ncaa_official_availability import collect as official_reports
    except ImportError:from build_ncaa_official_availability import collect as official_reports
    official=official_reports(ncaa_data,now);league=leagues['NCAA']
    for pid,row in old.get('leagues',{}).get('NCAA',{}).get('players',{}).items():
        if row.get('official') and row.get('conference') in official['errors'] and instant(row.get('reported_at')) and timedelta(0)<=now-instant(row['reported_at'])<=timedelta(hours=72) and instant(row.get('game_start')) and instant(row['game_start'])>now:
            official['players'].setdefault(pid,row)
    # A current official game report overrides general injury lists, including
    # an explicit exempt entry that does not establish eligibility to play.
    league.setdefault('players',{}).update(official['players'])
    league['scoped_teams']=len({str(p['team_id']) for p in ncaa})
    if official['players']:
        league['general_source_error']=league.get('error');league['error']=None
    league.update(checked_at=now.isoformat(),official_reports=official['reports'],official_errors=official['errors'],official_unmatched=official['unmatched'],coverage_by_team=official['coverage_by_team'])
    league['teams_seen']=max(league.get('teams_seen',0),official['teams_seen'])
    league['matched_entries']=sum(r['state']!='unknown' for r in league['players'].values())
    league['teams_with_current_reports']=len({r['team_id'] for r in league['players'].values() if r['state']!='unknown'})
    league['partial']=league['matched_entries']<len(ncaa)
    result={'schema_version':1,'policy_version':4,'updated':now.isoformat(),'policy':'Explicit reports dated within 72 hours receive a colored check. Official NCAA reports must match both scheduled opponents and game date. Exempt, omitted, old and mismatched entries do not establish healthy/playing status. Current-season explicit IR/season-long reports may remain classified for 180 days.','leagues':leagues}
    temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(dest)
    print('Availability:',{k:{x:v.get(x) for x in ['teams_seen','teams_with_current_reports','matched_entries','error']} for k,v in leagues.items()})
    return result
if __name__=='__main__':main()
