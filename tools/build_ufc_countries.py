"""Extract represented country from the same red/blue fighter card on UFC.com."""
import argparse, json, re, hashlib, urllib.request
from pathlib import Path
from datetime import datetime, timezone
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
def parse(html,source,stamp):
    soup=BeautifulSoup(html,'html.parser');rows={}
    for block in soup.select('.c-listing-fight'):
        for side in ['red','blue']:
            link=block.select_one(f'.c-listing-fight__corner-image--{side} a[href*="/athlete/"]')
            country=block.select_one(f'.c-listing-fight__country--{side}')
            flag=country.select_one('img') if country else None
            text=country.select_one('.c-listing-fight__country-text') if country else None
            match=re.search(r'/flags/([A-Z]{2})\.PNG',flag.get('src',''),re.I) if flag else None
            if not (link and text and match):continue
            slug=link['href'].rstrip('/').split('/')[-1]
            if not re.fullmatch('[a-z0-9-]+',slug):continue
            code=match[1].upper();rows['ufc:'+slug]={'country':text.get_text(' ',strip=True),'code':code,'flag_path':f'assets/flags/{code.lower()}.png','flag_source':flag['src'],'source_url':source,'retrieved_at':stamp,'basis':'Official UFC event red/blue corner country representation'}
    return rows
def main(sources):
    countries={}
    if sources:
        for p in sorted(sources.glob('*.html')):
            meta=json.loads(p.with_suffix('.json').read_text())
            if '/event/' in meta['source_url']:countries.update(parse(p.read_text(encoding='utf-8'),meta['source_url'],meta['retrieved_at']))
    else:
        cards=json.loads((ROOT/'data/ufc-cards.json').read_text())
        for e in cards['events']:
            url=e.get('url') or e.get('source_url')
            if not url or not url.startswith('https://www.ufc.com/event/'):continue
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as r:html=r.read().decode('utf-8')
            countries.update(parse(html,url,datetime.now(timezone.utc).isoformat()))
    assert countries,'No verified countries; preserve previous snapshot'
    for row in {r['code']:r for r in countries.values()}.values():
        p=ROOT/row['flag_path'];p.parent.mkdir(exist_ok=True)
        if not p.exists():
            with urllib.request.urlopen(urllib.request.Request(row['flag_source'],headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as r:raw=r.read()
            assert raw.startswith(b'\x89PNG'), 'Invalid official flag';p.write_bytes(raw)
    output=ROOT/'data/ufc-countries.json';payload={'updated':datetime.now(timezone.utc).isoformat(),'fighters':countries,'coverage':len(countries),'unknown':'No country flag shown where verified representation is unavailable'}
    temp=output.with_suffix('.tmp');temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(output)
    print('Verified UFC country entries:',len(countries))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sources',type=Path);main(p.parse_args().sources)
