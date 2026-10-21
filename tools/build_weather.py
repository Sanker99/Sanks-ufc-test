"""Shared NFL/NCAA venue and kickoff forecasts. No campus/city coordinate fallback."""
import argparse,csv,hashlib,io,json,re,time,urllib.parse,urllib.request
from pathlib import Path
from datetime import datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
UA='SanksResearchLab/1.0 (https://github.com/Sanker99/Sanks-ufc-test; sports research)'
def now():return datetime.now(timezone.utc)
def normalized(value):return re.sub('[^a-z0-9]','',str(value).casefold())
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=40) as r:return json.load(r)
def load(path,default=None):return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)
def kickoff_nfl(game):
    try:return datetime.fromisoformat(game['date']+'T'+game['time']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)
    except (ValueError,KeyError,TypeError):return None
def select_hour(payload,kickoff):
    times=payload.get('hourly',{}).get('time',[])
    if not times:return None
    index=min(range(len(times)),key=lambda i:abs(times[i]-kickoff.timestamp()))
    if abs(times[index]-kickoff.timestamp())>1800:return None
    def val(name):
        values=payload['hourly'].get(name,[]);return values[index] if len(values)>index else None
    return {'temperature_f':val('temperature_2m'),'wind_mph':val('wind_speed_10m'),'wind_direction_degrees':val('wind_direction_10m'),'precipitation_probability':val('precipitation_probability'),'weather_code':val('weather_code'),'forecast_hour':datetime.fromtimestamp(times[index],timezone.utc).isoformat(),'time_zone':payload.get('timezone','UTC')}
def roof_kind(indoor,historical):
    if historical&{'open','closed'}:return 'retractable'
    if indoor is True or 'dome' in historical:return 'indoor'
    if indoor is False or 'outdoors' in historical:return 'outdoor'
    return 'unknown'
def coordinate_rows(rows,cache):
    missing={r['key']:r for r in rows if r['key'] not in cache}
    names=list(dict.fromkeys(r['name'] for r in missing.values()))
    def add(venue,page):
        coordinate=next(iter(page.get('coordinates',[])),None)
        if coordinate and normalized(venue['city']) in normalized(page.get('extract','')):
            cache[venue['key']]={'latitude':coordinate['lat'],'longitude':coordinate['lon'],'coordinate_source':'https://en.wikipedia.org/?curid='+str(page['pageid']),'coordinate_title':page['title'],'coordinate_checked_at':now().isoformat()};return True
        return False
    def query_titles(titles):return get('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','prop':'coordinates|extracts','exintro':1,'explaintext':1,'exlimit':'max','coprimary':'primary','redirects':1,'titles':'|'.join(titles),'format':'json'}))
    for offset in range(0,len(names),20):
        batch=names[offset:offset+20]
        response=query_titles(batch)
        query=response.get('query',{});redirects={r['from']:r['to'] for r in [*query.get('normalized',[]),*query.get('redirects',[])]};pages={p['title']:p for p in query.get('pages',{}).values()}
        for name in batch:
            title=name
            for _ in range(5):
                if title not in redirects:break
                title=redirects[title]
            page=pages.get(title,{})
            for venue in missing.values():
                if venue['name']==name:add(venue,page)
        time.sleep(.3)
    for venue in missing.values():
        if venue['key'] in cache or not venue['city']:continue
        base=re.sub(r'\s*\([^)]*\)','',venue['name']).strip()
        search=get('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','list':'search','srsearch':f'"{base}" "{venue["city"]}"','srlimit':3,'format':'json'}))
        titles=[r['title'] for r in search.get('query',{}).get('search',[]) if re.search(r'stadium|field|dome|coliseum|bowl|park|house',r['title'],re.I)]
        if not titles:continue
        response=query_titles(titles)
        for page in response.get('query',{}).get('pages',{}).values():
            if normalized(base) not in normalized(page.get('extract','')):continue
            if add(venue,page):break
        time.sleep(.3)
    return cache
def main(ncaa_cache,force=False):
    cache_dir=ROOT/'work/weather';cache_dir.mkdir(parents=True,exist_ok=True)
    ncaa=load(ROOT/'data/ncaa-data.json');nfl=load(ROOT/'data/data.json',load(ROOT/'data.json'))
    prior=load(ROOT/'data/game-weather.json',{'games':{}});venues=load(ROOT/'data/game-venues.json',{'venues':{}})['venues'];games=[]
    schedules={}
    venue_ids={}
    for p in ncaa_cache.glob('schedule-*.json'):
        for e in load(p,{}).get('events',[]):
            for c in e.get('competitions',[])[:1]:schedules[str(e['id'])]=c
    for p in ncaa_cache.glob('summary-*.json'):
        v=load(p,{}).get('gameInfo',{}).get('venue',{})
        if v.get('id'):venue_ids[normalized(v.get('fullName'))]=v['id']
    raw_path=ROOT/'work/nfl-source/schedule.csv'
    nfl_rows=list(csv.DictReader(io.StringIO(raw_path.read_text(encoding='utf-8-sig')))) if raw_path.exists() else load(ROOT/'cache/schedule.json',{}).get('rows',[])
    roofs={}
    for r in nfl_rows:roofs.setdefault(normalized(r.get('stadium','')),set()).add(r.get('roof',''))
    current_nfl={(int(r['week']),r.get('away_team'),r.get('home_team')):r for r in nfl_rows if str(r.get('season'))==str(nfl['season'])}
    nfl_events={};weeks={int(g['week']) for g in nfl['games'] if kickoff_nfl(g) and now()<=kickoff_nfl(g)<=now()+timedelta(days=15)}
    for week in weeks:
        p=cache_dir/f'nfl-events-{nfl["season"]}-{week}.json';url=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={nfl["season"]}&week={week}&seasontype=2&limit=1000'
        try:
            payload=load(p) if p.exists() and time.time()-p.stat().st_mtime<1800 else get(url)
            dump(p,payload)
            for e in payload.get('events',[]):
                c=e['competitions'][0];sides={x['homeAway']:x['team']['abbreviation'] for x in c['competitors']};aliases={'LAR':'LA','WSH':'WAS'}
                nfl_events[(week,aliases.get(sides['away'],sides['away']),aliases.get(sides['home'],sides['home']))]=(c,url)
        except Exception as exc:print('NFL venue feed retained:',str(exc),flush=True)
    for g in ncaa['games']:
        c=schedules.get(g['id'],{});v=c.get('venue') or g.get('venue') or {};name=v.get('fullName','');city=v.get('address',{}).get('city','');key=normalized(name)+'|'+normalized(city)
        g['venue']=v;g['kickoff_confirmed']=c.get('timeValid',g.get('kickoff_confirmed')) is True
        games.append({'key':'NCAA:'+g['id'],'league':'NCAA','conference':g['conferences'],'kickoff':datetime.fromisoformat(g['date'].replace('Z','+00:00')) if g['kickoff_confirmed'] else None,'completed':g['completed'],'neutral':g['neutral'],'venue_key':key,'name':name,'city':city,'espn_venue_id':v.get('id') or venue_ids.get(normalized(name))})
    for g in nfl['games']:
        r=current_nfl.get((int(g['week']),g['away'],g['home']),{});c,venue_source=nfl_events.get((int(g['week']),g['away'],g['home']),({},'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'));v=c.get('venue') or g.get('venue') or {};name=v.get('fullName') or r.get('stadium','');city=v.get('address',{}).get('city','');key=normalized(name)+'|'+normalized(city)
        # NFL location is from the actual schedule row, including neutral-site games.
        games.append({'key':f'NFL:{nfl["season"]}:{g["week"]}:{g["away"]}:{g["home"]}','league':'NFL','conference':[],'kickoff':kickoff_nfl(g),'completed':all(g.get(k) is not None and str(g.get(k)).strip()!='' for k in ['home_score','away_score']),'neutral':c.get('neutralSite',r.get('location')=='Neutral'),'venue_key':key,'name':name,'city':city,'stadium_id':r.get('stadium_id'),'espn_venue_id':v.get('id'),'roof_history':list(roofs.get(normalized(r.get('stadium','')),set())),'venue_source':venue_source})
    # ESPN venue metadata supplies indoor/outdoor flags; it never supplies invented coordinates.
    wanted={g['venue_key']:g for g in games if not g['completed'] and g['name']}
    def metadata(item):
        key,g=item;old=venues.get(key,{})
        if old.get('roof_kind'):return key,old
        v={};vid=g.get('espn_venue_id')
        if vid:
            league='nfl' if g['league']=='NFL' else 'college-football'
            url=f'https://sports.core.api.espn.com/v2/sports/football/leagues/{league}/venues/{vid}?lang=en&region=us'
            p=cache_dir/(league+'-venue-'+str(vid)+'.json')
            try:
                v=load(p) or get(url)
                if not p.exists():dump(p,v)
            except Exception:v={}
        else:url='https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
        history=set(g.get('roof_history',[])) or roofs.get(normalized(g['name']),set());kind=roof_kind(v.get('indoor'),history)
        return key,{**old,'key':key,'name':g['name'],'city':g['city'],'roof_kind':kind,'venue_source':g.get('venue_source') or url,'roof_status':'unknown' if kind=='retractable' else None}
    with ThreadPoolExecutor(max_workers=4) as pool:venues.update(dict(pool.map(metadata,wanted.items())))
    geo={k:v for k,v in venues.items() if 'latitude' in v}
    eligible=[g for g in games if not g['completed'] and g['kickoff'] and now()<=g['kickoff']<=now()+timedelta(days=15) and g['name']]
    # NFL exact stadium page titles are already location-specific. NCAA also requires the event city.
    try:geo=coordinate_rows([{**venues[g['venue_key']]} for g in eligible],geo)
    except Exception as exc:print('Coordinate source unavailable; previous verified coordinates retained:',str(exc),flush=True)
    for key,coords in geo.items():venues[key].update(coords)
    output={};forecasts={}
    locations={g['venue_key']:venues.get(g['venue_key'],{}) for g in eligible if venues.get(g['venue_key'],{}).get('roof_kind')!='indoor' and 'latitude' in venues.get(g['venue_key'],{})}
    def forecast(item):
        key,v=item;location=str(v['latitude'])+','+str(v['longitude']);p=cache_dir/(hashlib.sha256((key+'|'+location).encode()).hexdigest()[:20]+'.json');old=load(p,{})
        try:
            if not force and old and time.time()-p.stat().st_mtime<3600:return key,{**old,'cached':False}
            params={'latitude':v['latitude'],'longitude':v['longitude'],'hourly':'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability','temperature_unit':'fahrenheit','wind_speed_unit':'mph','timezone':'auto','timeformat':'unixtime','forecast_days':16}
            url='https://api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params);response=get(url);assert response.get('hourly',{}).get('time'),'Forecast hourly data missing';response.update(source_url=url,fetched_at=now().isoformat(),cached=False);dump(p,response);return key,response
        except Exception as exc:return key,{**old,'cached':bool(old),'error':str(exc)}
    with ThreadPoolExecutor(max_workers=3) as pool:forecasts.update(dict(pool.map(forecast,locations.items())))
    for g in games:
        v=venues.get(g['venue_key'],{});kick=g['kickoff'];row={'venue_key':g['venue_key'],'venue':g['name'] or 'Venue unconfirmed','venue_city':g['city'],'roof_kind':v.get('roof_kind','unknown'),'neutral':g['neutral'],'kickoff':kick.isoformat() if kick else None,'league':g['league'],'conferences':g['conference'],'venue_source':v.get('venue_source'),'coordinate_source':v.get('coordinate_source')}
        if g['completed']:row['status']='completed'
        elif not kick:row['status']='kickoff_unknown'
        elif v.get('roof_kind')=='indoor':row['status']='indoor'
        elif kick>now()+timedelta(days=15):row['status']='outside_horizon'
        elif 'latitude' not in v:row['status']='venue_unavailable'
        else:
            f=forecasts.get(g['venue_key'],{});hour=select_hour(f,kick)
            if hour:row.update(hour,status='forecast',fetched_at=f.get('fetched_at'),source_url=f.get('source_url'),cached=f.get('cached',False),error=f.get('error'),scope='on_field' if v.get('roof_kind')=='outdoor' else 'exterior_only')
            else:
                old=prior['games'].get(g['key'],{})
                if old.get('kickoff')==row['kickoff'] and old.get('venue_key')==row['venue_key'] and old.get('location_signature')==str(v.get('latitude'))+','+str(v.get('longitude')) and old.get('status')=='forecast':row.update(old,cached=True,error=f.get('error','Forecast temporarily unavailable'))
                else:row['status']='forecast_unavailable'
        source_game=next((x for x in (ncaa['games'] if g['league']=='NCAA' else nfl['games']) if ('NCAA:'+x['id'] if g['league']=='NCAA' else f'NFL:{nfl["season"]}:{x["week"]}:{x["away"]}:{x["home"]}')==g['key']),None)
        row['schedule_signature']=source_game['date'] if g['league']=='NCAA' else source_game['date']+'T'+str(source_game.get('time') or '')
        row['location_signature']=str(v.get('latitude'))+','+str(v.get('longitude'));row['latitude']=v.get('latitude');row['longitude']=v.get('longitude')
        if source_game is not None and g['league']=='NFL':source_game['venue']={'fullName':g['name'],'address':{'city':g['city']},'stadium_id':g.get('stadium_id')}
        output[g['key']]=row
    dump(ROOT/'data/game-venues.json',{'venues':venues,'updated':now().isoformat(),'coordinate_policy':'Exact or redirected stadium page coordinates; NCAA city must match introduction; never campus/city centroid'})
    result={'updated':now().isoformat(),'source':'Open-Meteo hourly forecast; ESPN event venues and venue metadata; nflverse schedule roofs; Wikipedia stadium coordinates','games':output,'coverage':{state:sum(v['status']==state for v in output.values()) for state in sorted({v['status'] for v in output.values()})}}
    dump(ROOT/'data/game-weather.json',result);dump(ROOT/'data/ncaa-data.json',ncaa);dump(ROOT/'data/data.json',nfl);dump(ROOT/'data.json',nfl);print('Weather coverage',result['coverage'],flush=True)
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--ncaa-cache',type=Path,default=ROOT/'work/ncaa-cache');p.add_argument('--force',action='store_true');a=p.parse_args();main(a.ncaa_cache,a.force)
