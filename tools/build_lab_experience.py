"""Source-linked headline snapshots and exact-team representative helmet photos."""
import json,re,html,hashlib,urllib.request
from pathlib import Path
from urllib.parse import urljoin,urlparse
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
HOST='https://www.helmethistory.com'
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=30) as response:return response.read()
def norm(s):return re.sub('[^a-z]','',s.lower())
def main():
    dest=ROOT/'data/lab-experience.json';old=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {};now=datetime.now(timezone.utc).isoformat();issues=[]
    identities=json.loads((ROOT/'data/team-identities.json').read_text(encoding='utf-8'));college=json.loads((ROOT/'data/ncaa-data.json').read_text(encoding='utf-8'));scoped={str(t['id']) for t in college['teams']}|{str(g[k]) for g in college['games'] for k in ['home_id','away_id']}
    helmets=dict(old.get('helmets',{}));aliases={'NFL:NYJ':'new-york-a','NFL:NYG':'new-york-n','NFL:LAC':'los-angeles-a','NFL:LA':'los-angeles-n','NFL:LAR':'los-angeles-n','NCAA:California':'cal','NCAA:Miami':'miami-fl','NCAA:Washington':'univ-washington','NCAA:Arizona':'univ-arizona','NCAA:NC State':'north-carolina-state','NCAA:Ole Miss':'mississippi','NCAA:Texas A&M':'texas-am','NCAA:App State':'appalachian-state','NCAA:Florida Atlantic':'fau','NCAA:Grambling':'grambling-state','NCAA:Louisiana':'ull','NCAA:Massachusetts':'umass','NCAA:Middle Tennessee':'mtsu','NCAA:Sam Houston':'sam-houston-state','NCAA:23':'san-jose-state','NCAA:Southern Miss':'southern-mississippi','NCAA:UT Martin':'tennessee-martin'}
    index={}
    for sport,page in [('NFL','nfl'),('NCAA','fbs'),('NCAA','fcs')]:
        raw=fetch(HOST+'/'+page+'.html').decode();links=re.findall(r"<a href='(/[^']+\.html)'[^>]*><img src='([^']+)'",raw)
        index.setdefault(sport,{}).update({norm(re.sub(r'\d+$','',Path(link).stem)):link for link,_ in links})
    jobs=[]
    for sport,teams in identities.items():
        if sport not in index:continue
        for key,t in teams.items():
            if sport=='NCAA' and str(key) not in scoped:continue
            ident=sport+':'+str(key)
            if ident in helmets:continue
            slug=aliases.get(ident,aliases.get(sport+':'+t['location'],t['location']))
            link=index[sport].get(norm(slug))
            if not link:issues.append({'team':ident,'name':t['name'],'reason':'Exact source page not matched'});continue
            jobs.append((ident,t,HOST+link))
    def collect(job):
        ident,t,page=job
        try:
            raw=fetch(page).decode();images=re.findall(r'<img[^>]+src=["\x27]([^"\x27]+)',raw)
            src=next(urljoin(HOST,html.unescape(u)) for u in images if '/uploads/' in u and re.search(r'\.(?:png|jpg|jpeg)(?:\?|$)',u,re.I))
            content=fetch(src)
            if not (content.startswith(b'\x89PNG') or content.startswith(b'\xff\xd8')):raise ValueError('Invalid image format')
            ext='.png' if content.startswith(b'\x89PNG') else '.jpg';path='assets/helmets/'+ident.replace(':','-').lower()+ext;(ROOT/path).parent.mkdir(parents=True,exist_ok=True);(ROOT/path).write_bytes(content)
            return ident,{'team_name':t['name'],'path':path,'source_url':page,'image_url':src,'sha256':hashlib.sha256(content).hexdigest(),'checked_at':now,'description':'Representative team helmet photograph; game-specific uniform is not confirmed.'},None
        except Exception as exc:return ident,None,str(exc)
    with ThreadPoolExecutor(max_workers=5) as pool:
        for ident,entry,error in pool.map(collect,jobs):
            if entry:helmets[ident]=entry
            else:issues.append({'team':ident,'reason':error})
    news={}
    for sport,league in [('NFL','football/nfl'),('NCAA','football/college-football'),('UFC','mma/ufc')]:
        url='https://site.api.espn.com/apis/site/v2/sports/'+league+'/news?limit=50'
        try:
            payload=json.loads(fetch(url));articles=[];seen=set()
            for a in payload.get('articles',[]):
                link=a.get('links',{}).get('web',{}).get('href');headline=a.get('headline');published=a.get('published')
                if not headline or not link or '/story/' not in link or urlparse(link).scheme!='https' or link in seen:continue
                seen.add(link);articles.append({'headline':headline,'url':link,'published':published,'image':next((i.get('url') for i in a.get('images',[]) if i.get('url')),None),'source':'ESPN'})
                if len(articles)==10:break
            if not articles:raise ValueError('No valid headlines')
            news[sport]={'checked_at':now,'source_url':url,'articles':articles,'error':None}
        except Exception as exc:news[sport]={**old.get('news',{}).get(sport,{'articles':[]}),'error':str(exc)}
    result={'schema_version':1,'updated':now,'helmets':helmets,'news':news,'issues':issues,'helmet_policy':'Exact team source pages; representative photographs, not confirmation of game-day helmet selection. Photos retain their original pixels.'}
    dest.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print('Experience:',len(helmets),'helmet photos;', {k:len(v['articles']) for k,v in news.items()},'headlines; gaps:',issues);return result
if __name__=='__main__':main()
