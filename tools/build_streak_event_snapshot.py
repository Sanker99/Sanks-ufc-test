"""Publish unified ESPN UFC events, approved-roster membership and sourced overall records."""
import json,re,sys,urllib.request
from pathlib import Path
from datetime import datetime,timezone,timedelta
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build_ufc_csv import key

def build(payload,photos,old,now):
    previous=old.get('events',[]);events=[];records={}
    for event in payload.get('events',[]):
        date=event.get('date');parsed=datetime.fromisoformat(date.replace('Z','+00:00')) if date else None
        if not parsed or parsed<now-timedelta(hours=12) or event.get('status',{}).get('type',{}).get('completed'):continue
        name=event.get('name','UFC event');ids=set();uncovered=set()
        for bout in event.get('competitions',[]):
            for c in bout.get('competitors',[]):
                athlete=c.get('athlete',{});fighter=athlete.get('displayName') or athlete.get('fullName','');pid=photos['by_name'].get('UFC:'+key(fighter))
                if pid:ids.add(pid)
                else:uncovered.add(fighter)
                total=next((r.get('summary') for r in c.get('records',[]) if r.get('name')=='overall'),None)
                if total and re.fullmatch(r'[0-9]+-[0-9]+(?:-[0-9]+){0,2}',total):records[key(fighter)]={'record':total,'name':fighter,'scope':'Overall professional record reported by ESPN','source_url':'https://www.espn.com/mma/fighter/_/id/'+str(c['id']),'checked_at':now.isoformat()}
        old_id=None
        for p in previous:
            if p.get('espn_event_id')==str(event['id']):old_id=p['id'];break
            pdate=datetime.fromisoformat(p['date'].replace('Z','+00:00'));pdate=pdate.replace(tzinfo=timezone.utc) if not pdate.tzinfo else pdate
            if abs((pdate-parsed).total_seconds())<36*3600:old_id=p['id'];break
        events.append({'id':old_id or 'espn:'+str(event['id']),'espn_event_id':str(event['id']),'title':name,'date':date,'source_url':'https://www.espn.com/mma/fightcenter/_/id/'+str(event['id']),'athlete_ids':sorted(ids),'uncovered_fighters':sorted(uncovered)})
    if not events:raise ValueError('No upcoming UFC events returned; retaining previous snapshot')
    return {'schema_version':1,'updated':now.isoformat(),'source':'ESPN UFC scoreboard; exact approved photo aliases','events':sorted(events,key=lambda e:e['date'])},{'schema_version':1,'updated':now.isoformat(),'records':records,'policy':'ESPN overall professional records are distinct from UFCStats source-covered fight counts.'}

def main():
    now=datetime.now(timezone.utc);dest=ROOT/'data/ufc-streak-events.json';old=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {'events':[]};photos=json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'));dates=now.strftime('%Y%m%d')+'-'+(now+timedelta(days=120)).strftime('%Y%m%d');url='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates='+dates
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=35) as response:payload=json.load(response)
    events,records=build(payload,photos,old,now)
    for name,data in [('ufc-streak-events.json',events),('ufc-profile-records.json',records)]:
        path=ROOT/'data'/name;temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)
    print('UFC context:',len(events['events']),'events;',len(records['records']),'overall records');return events
if __name__=='__main__':main()
