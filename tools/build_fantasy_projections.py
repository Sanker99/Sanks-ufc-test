"""Collect four public HTML tables, join exact roster identities, score league rules.

No provider API, credentials or paid service. Unknown components are not fabricated.
"""
import json,re,math,unicodedata,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
POSITIONS=('QB','RB','WR','TE')
HEADERS={'PaYd':'passing_yards','PaTD':'passing_tds','Int':'interceptions','RuYd':'rushing_yards','RuTD':'rushing_tds','Rec':'receptions','ReYd':'receiving_yards','ReTD':'receiving_tds','Att':'carries','Tgt':'targets'}
WEIGHTS={'passing_yards':.04,'passing_tds':4,'interceptions':-1,'rushing_yards':.1,'rushing_tds':6,'receptions':1,'receiving_yards':.1,'receiving_tds':6}
ALIASES={'LAR':'LA','JAX':'JAC','WSH':'WAS'}
NAME_ALIASES={'joshuajacobs':'joshjacobs','marquiseirving':'buckyirving','markeiseirving':'buckyirving','cameronskattebo':'camskattebo','kevinconcepcion':'kcconcepcion','patrickmahomesii':'patrickmahomes','cameronward':'camward','devontasmith':'devontasmith'}

def team(v):return ALIASES.get(v,v)
def name(v):
    v=re.sub(r'\b(jr|sr|ii|iii|iv)\b','',unicodedata.normalize('NFKD',v).encode('ascii','ignore').decode().lower())
    v=re.sub('[^a-z0-9]','',v)
    return NAME_ALIASES.get(v,v)
def score(stats):
    if not stats or any(not isinstance(v,(float,int)) or not math.isfinite(v) for v in stats.values()):raise ValueError('Invalid projection stats')
    base=sum(stats[k]*w for k,w in WEIGHTS.items() if k in stats)
    bonus=sum(10 if stats.get(k,0)>=high else 5 if stats.get(k,0)>=low else 0 for k,low,high in [('passing_yards',300,400),('rushing_yards',100,200),('receiving_yards',100,200)])
    return round(base+bonus,3),bonus
def parse_table(raw,position,season,week):
    soup=BeautifulSoup(raw,'html.parser');heading=soup.find('h1')
    if not heading or f'Week {week} {position}' not in heading.get_text(' ',strip=True):raise ValueError('Projection table week/position mismatch')
    if not re.search(rf'\b{season}\b',soup.get_text(' ',strip=True)):raise ValueError('Projection season mismatch')
    table=soup.find('table')
    if not table:raise ValueError('Missing projection table')
    headers=[c.get_text(' ',strip=True) for c in table.select('thead th')]
    required={'QB':{'PaYd','PaTD','Int','RuYd','RuTD'},'RB':{'RuYd','RuTD','Rec','ReYd','ReTD'},'WR':{'Rec','ReYd','ReTD','RuYd'},'TE':{'Rec','ReYd','ReTD'}}[position]
    if not required<=set(headers):raise ValueError('Missing scoring columns')
    rows=[]
    for tr in table.select('tbody tr'):
        cells=tr.find_all(['th','td'],recursive=False)
        if len(cells)!=len(headers):raise ValueError('Malformed projection row')
        if cells[1].get_text(strip=True).lower()=='bye':continue
        person=cells[0].select_one('.pc');nm=person.find('span',recursive=False) if person else None
        logo=person.find('img') if person else None
        opponent=cells[1].find('img');kickoff=tr.find('time')
        if not nm or not logo or not opponent or not kickoff:raise ValueError('Missing player identity or kickoff')
        stats={HEADERS[h]:float(c.get_text(strip=True)) for h,c in zip(headers,cells) if h in HEADERS}
        points,bonus=score(stats)
        start=kickoff.get('datetime','');dt=datetime.fromisoformat(start.replace('Z','+00:00'))
        if dt.year!=season:raise ValueError('Wrong projection kickoff season')
        rows.append({'name':nm.get_text(' ',strip=True),'team':team(logo.get('alt','')),'opponent':team(opponent.get('alt','')),'position':position,'kickoff':start,'stats':stats,'points':points,'bonus':bonus,'provider_points':float(cells[headers.index('Proj')].get_text(strip=True)),'missing_components':[k for k in WEIGHTS if k not in stats]})
    if len(rows)<10 or len({(name(r['name']),r['team']) for r in rows})!=len(rows):raise ValueError('Empty, incomplete or duplicate projection table')
    return rows

def main():
    now=datetime.now(timezone.utc);data=json.loads((ROOT/'data/data.json').read_text(encoding='utf-8'));season=int(data['season'])
    times=json.loads((ROOT/'data/event-times.json').read_text(encoding='utf-8'))['nfl']
    upcoming=[g for g in data['games'] if times.get(g.get('schedule_id'),{}).get('start') and datetime.fromisoformat(times[g['schedule_id']]['start'].replace('Z','+00:00'))>now]
    if not upcoming:raise ValueError('No verified upcoming NFL schedule')
    first=min(upcoming,key=lambda g:times[g['schedule_id']]['start']);week=int(first['week'])
    schedule={(team(g['home']),team(g['away'])) for g in data['games'] if int(g['week'])==week}
    roster={str(p['id']):p for p in data['players']}
    for p in json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'))['photos'].values():
        if p['sport']=='NFL':roster.setdefault(str(p['id']),{'id':p['id'],'name':p['name'],**p['roster']})
    index={}
    for p in roster.values():index.setdefault((name(p['name']),team(p['team']),p['position']),[]).append(p)
    players={};unmatched=[];sources=[];counts={};cache=ROOT/'work/fantasy-source';cache.mkdir(parents=True,exist_ok=True)
    for position in POSITIONS:
        url=f'https://edraft.com/fantasy-football/rankings/week-{week}?pos={position}&scoring=ppr'
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0 (+public weekly projections; hourly collection)'}),timeout=40) as response:raw=response.read()
        (cache/f'{season}-{week}-{position}.html').write_bytes(raw)
        rows=parse_table(raw,position,season,week);counts[position]=len(rows);sources.append(url)
        for row in rows:
            if (row['team'],row['opponent']) not in schedule and (row['opponent'],row['team']) not in schedule:raise ValueError('Projection opponent differs from current schedule')
            candidates=index.get((name(row['name']),row['team'],position),[])
            canonical=[p for p in candidates if str(p['id']).startswith('00-')]
            if not candidates or len(canonical)>1 or (not canonical and len(candidates)>1):unmatched.append({**row,'reason':'No unique name/team/position identity match'});continue
            # Photo-only aliases and the single GSIS identity represent one athlete.
            for p in candidates:
                pid=str(p['id'])
                if pid in players:raise ValueError('Duplicate matched projection')
                players[pid]={**row,'id':pid,'source_url':url,'collected_at':now.isoformat()}
    if len(players)<100:raise ValueError('Insufficient matched fantasy coverage')
    result={'schema_version':1,'season':season,'week':week,'updated':now.isoformat(),'label':'Fantasy Projection','scoring':WEIGHTS,'bonus_policy':'5 at 100 rushing/receiving or 300 passing; 10 instead at 200 rushing/receiving or 400 passing. Separate categories; unrounded yardage thresholds.','source_urls':sources,'players':players,'coverage':{'matched':len(players),'unique_athletes':len({(name(p['name']),p['team'],p['position']) for p in players.values()}),'source_rows':counts,'unmatched':unmatched},'limitations':'Scores use published component projections only. Missing scoring components are not supplied or assumed. Provider totals may use additional components or precision.','error':None}
    dest=ROOT/'data/fantasy-projections.json';tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(dest)
    print(json.dumps({'week':week,'matched':len(players),'unique_athletes':len({(name(p['name']),p['team'],p['position']) for p in players.values()}),'source_rows':counts,'unmatched':len(unmatched)}));return result
if __name__=='__main__':main()
