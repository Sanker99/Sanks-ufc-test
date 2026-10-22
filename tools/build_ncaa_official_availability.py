"""Public conference availability reports, bound to a scheduled game and roster identity.

The public HDI publish endpoint is the same unauthenticated source used by the
conference websites. Pac-12 publishes a public Azure JSON document. No credentials
or private endpoints are used. An omitted player is never declared healthy.
"""
import json,re,unicodedata,urllib.request
from datetime import datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor

PUBLIC='https://app.hdintelligence.com/api/get-publish-public'
PAC_FEED='https://sbcautostorage.blob.core.windows.net/availability-reports/pac12-football/prod/report.json'
PAC_PAGE='https://pac-12.com/news/2026/9/11/2026-football-reports.aspx'
CONFERENCES={'B10':'B1G','B12':'Big 12','ACC':'ACC','SEC':'SEC','PAC':'PAC-12'}
ZONES={'CT':'America/Chicago','ET':'America/New_York','MT':'America/Denver','PT':'America/Los_Angeles'}
TEAM_ALIASES={'pittsburgh':'pitt','michiganst':'michiganstate','kansasst':'kansasstate','arizonast':'arizonastate','oklahomast':'oklahomastate','iowast':'iowastate','mississippist':'mississippistate','southerncalifornia':'usc','miamifl':'miami'}

def norm(value):
    return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',str(value)).encode('ascii','ignore').decode().lower())

def player_name(value):
    return norm(re.sub(r'\b(jr|sr|ii|iii|iv)\b','',str(value),flags=re.I))

def team_name(value):
    key=norm(re.sub(r'\bSt\.?$', 'State',str(value),flags=re.I))
    return TEAM_ALIASES.get(key,key)

def instant(value):
    try:
        d=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return d.astimezone(timezone.utc) if d.tzinfo else None
    except (ValueError,TypeError):return None

def designation(status):
    s=status.strip().lower()
    if s in ('available','active','cleared'):return 'available'
    if s in ('questionable','probable','doubtful','game time decision'):return 'questionable'
    if s in ('out','out for season','out (season)','out - (1st half)','suspended','ir'):return 'out'
    return 'unknown'

def request(code):
    if code=='PAC':req=urllib.request.Request(PAC_FEED)
    else:req=urllib.request.Request(PUBLIC,data=json.dumps({'sport':'Football','organization':code,'conference':code}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)

def normalized_reports(code,payload):
    if code=='PAC':
        if not isinstance(payload.get('games'),list):raise ValueError('Missing Pac-12 games')
        for r in payload['games']:
            yield {'id':r['gameId'],'date':r['dateISO'],'reported':instant(r['updatedAtUTC']),'stage':r['notes'],'teams':[{'name':r[s]['name'],'rows':r[s]['players']} for s in ('away','home')],'source_url':PAC_PAGE,'source_feed':PAC_FEED}
    else:
        if not isinstance(payload,dict):raise ValueError('Invalid conference reports')
        for rid,r in payload.items():
            reported=datetime.fromisoformat(r['publishDate']+'T'+r['postedTime']).replace(tzinfo=ZoneInfo(ZONES[r['conferenceTimeZone']])).astimezone(timezone.utc)
            ts=[]
            for t in r['games']:
                rows=[]
                for row in t['rows']:
                    m=re.fullmatch(r'([A-Z]+) #([^ ]+) (.+)',row['name'])
                    if m:rows.append({'position':m[1],'jersey':m[2],'name':m[3],'status':row['status'],'exempt':row.get('exemptStatus') not in (None,'','NonExempt')})
                ts.append({'name':t.get('teamDisplayName') or t['teamName'],'rows':rows})
            yield {'id':str(rid),'date':r['footer']['date'],'reported':reported,'stage':r['ReportType'],'teams':ts,'source_url':f'https://app.hdintelligence.com/?conf={code}&source={code}&sport=Football&type=publish','source_feed':PUBLIC}

def parse_reports(code,payload,data,now):
    teams={str(t['id']):t for t in data['teams'] if t['conference']==CONFERENCES[code]}
    team_index={}
    for tid,t in teams.items():
        for n in (t['short_name'],t['name'],t.get('abbreviation','')):
            team_index.setdefault(team_name(n),set()).add(tid)
    players={};audits=[];seen=set();unmatched=[]
    for r in normalized_reports(code,payload):
        stamp=r['reported']
        if not stamp or stamp>now+timedelta(minutes=5) or now-stamp>timedelta(hours=72):continue
        tids=[]
        for t in r['teams']:
            ids=team_index.get(team_name(t['name']),set())
            tids.append(next(iter(ids)) if len(ids)==1 else None)
        if len(tids)!=2 or None in tids or len(set(tids))!=2:
            unmatched.append({'report_id':r['id'],'reason':'Ambiguous team identity','teams':[t['name'] for t in r['teams']]});continue
        games=[g for g in data['games'] if not g.get('completed') and {str(g['home_id']),str(g['away_id'])}==set(tids) and instant(g['date']) and instant(g['date']).astimezone(ZoneInfo('America/Chicago')).date().isoformat()==r['date'] and instant(g['date'])>now-timedelta(hours=6)]
        if len(games)!=1:
            unmatched.append({'report_id':r['id'],'reason':'No unique upcoming scheduled game'});continue
        game=games[0]
        for t,tid in zip(r['teams'],tids):
            seen.add(tid);matched=0
            roster=[p for p in data['players'] if str(p['team_id'])==tid]
            for row in t['rows']:
                if row['position'] not in ('QB','RB','WR','TE'):continue
                candidates=[p for p in roster if p['position']==row['position'] and player_name(p['name'])==player_name(row['name'])]
                if len(candidates)!=1:
                    unmatched.append({'team_id':tid,'name':row['name'],'position':row['position'],'reason':'Name or position mismatch'});continue
                p=candidates[0];state=designation(row['status'])
                if row['status'].strip().lower()=='exempt':state='unknown'
                record={'state':state,'label':row['status'],'reported_status':row['status'],'reported_at':stamp.isoformat(),'source_url':r['source_url'],'source_feed':r['source_feed'],'source_athlete_id':p['espn_id'],'team_id':tid,'conference':CONFERENCES[code],'game_id':str(game['id']),'game_start':game['date'],'report_id':r['id'],'report_stage':r['stage'],'official':True,'match_method':'Exact conference, scheduled opponents/date, team, normalized full name, position'+(' and jersey' if 'jersey' in row else ''),'reason':f"Official {CONFERENCES[code]} {r['stage']} report: {row['status']}."+(' Exempt roster entry does not confirm game availability.' if row['status'].strip().lower()=='exempt' else ' Availability applies to the linked upcoming game; it does not guarantee participation.')}
                record['match_method']='Exact conference, scheduled opponents/date, team, normalized full name and position'
                if 'jersey' in row:record['jersey_matches']=str(p.get('jersey',''))==row['jersey']
                old=players.get(str(p['id']))
                if not old or instant(old['reported_at'])<stamp:players[str(p['id'])]=record
                matched+=1
            audits.append({'team_id':tid,'report_id':r['id'],'game_id':str(game['id']),'reported_at':stamp.isoformat(),'matched_players':matched,'source_url':r['source_url']})
    return {'players':players,'teams_seen':sorted(seen),'reports':audits,'unmatched':unmatched}

def collect(data,now):
    players={};reports=[];unmatched=[];errors={};seen=set()
    def one(code):
        try:return code,parse_reports(code,request(code),data,now),None
        except Exception as exc:return code,None,str(exc)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for code,result,error in pool.map(one,CONFERENCES):
            if error:errors[CONFERENCES[code]]=error;continue
            players.update(result['players']);reports.extend(result['reports']);unmatched.extend(result['unmatched']);seen.update(result['teams_seen'])
    ledger={}
    for t in data['teams']:
        tid=str(t['id']);roster=[p for p in data['players'] if str(p['team_id'])==tid]
        current=[p for p in roster if players.get(str(p['id']),{}).get('state') in ('available','questionable','out')]
        upcoming=[g for g in data['games'] if tid in (str(g['home_id']),str(g['away_id'])) and not g.get('completed') and instant(g['date']) and now<instant(g['date'])<now+timedelta(days=4)]
        ledger[tid]={'team':t['name'],'conference':t['conference'],'players_checked':len(roster),'explicit_current_statuses':len(current),'official_report_found':tid in seen,'reason':None if len(current)==len(roster) else 'No game in next four days' if not upcoming else 'Report lists limited players only' if t['conference']=='PAC-12' and tid in seen else 'Exempt or unmatched roster entries' if tid in seen else 'Current official report not published or unavailable'}
    return {'players':players,'teams_seen':len(seen),'reports':reports,'unmatched':unmatched,'errors':errors,'coverage_by_team':ledger}
