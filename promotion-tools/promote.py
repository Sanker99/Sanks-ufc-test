"""Promote an immutable, tested static bundle; never rebuild production."""
import concurrent.futures,hashlib,io,json,os,re,shutil,subprocess,sys,urllib.request,urllib.error,zipfile
from pathlib import Path,PurePosixPath
OUT=Path('work/promotion');OUT.mkdir(parents=True,exist_ok=True)
SITE=OUT/'site'
REPO='Sanker99/Sanks-ufc-test'
CF='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/pages/projects/'
MODE=os.environ['PROMOTION_TARGET']
LIVE='https://sanksresearchlab.pages.dev/'
BEACON=re.compile(rb"<!-- Cloudflare Pages Analytics --><script\b[^>]*\bsrc=['\"]https://static\.cloudflareinsights\.com/beacon\.min\.js['\"][^>]*></script><!-- Cloudflare Pages Analytics -->",re.I)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return sha(json.dumps(value,sort_keys=True).encode())
def cf(path='',method='GET'):
    request=urllib.request.Request(CF+'sanksresearchlab'+path,method=method,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
    with urllib.request.urlopen(request,timeout=60) as response:body=json.load(response)
    assert body.get('success'),'Cloudflare request failed'
    return body['result']
def github(path):
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
    with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
def config(p):return canonical({k:p.get(k) for k in ['deployment_configs','source','build_config','production_branch']})
def inventory(root):
    assert not any(p.is_symlink() for p in root.rglob('*')),'Symlink in bundle'
    return {p.relative_to(root).as_posix():sha(p.read_bytes()) for p in root.rglob('*') if p.is_file()}
def validate_site():
    actual=inventory(SITE)
    assert 'index.html' in actual and 'assets/experience.js' in actual,'Incomplete application'
    forbidden={'_worker.js','_routes.json','_redirects','_headers'}
    assert not any(PurePosixPath(name).parts[0] in forbidden|{'functions'} for name in actual),'Routing/Functions changes need a separate reviewed procedure'
    for p in SITE.rglob('*.js'):subprocess.run(['node','--check',str(p)],check=True,stdout=subprocess.DEVNULL)
    return actual
def baseline_manifest(deployment,cloud_files,provenance=None):
    labeled=deployment['deployment_trigger']['metadata']['commit_hash']
    assert re.fullmatch('[0-9a-f]{40}',labeled),'Invalid baseline deployment label'
    if provenance is None:
        provenance=json.loads(Path(__file__).with_name('baseline-provenance.json').read_text())
    record=provenance.get(deployment['id'])
    source=labeled
    if record:
        assert record['workflow_commit']==labeled,'Reviewed deployment provenance changed'
        source=record['source_commit']
        assert re.fullmatch('[0-9a-f]{40}',source),'Invalid immutable baseline source'
        print('Using reviewed immutable source manifest for the exact recorded live deployment; complete byte verification is still required.')
    subprocess.run(['git','fetch','origin',source],check=True,stdout=subprocess.DEVNULL)
    baseline=json.loads(subprocess.check_output(['git','show',source+':.github/deployment-manifests/production-content-sha256.json']))
    assert sorted(baseline)==sorted(x.lstrip('/') for x in cloud_files),'Production inventory drifted'
    return baseline,source

def fetch_bytes(url):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'SANKS-verified-promotion/1.0'})
            with urllib.request.urlopen(req,timeout=60) as response:return response.read()
        except Exception:
            if attempt==2:raise

def verify_files(base,expected):
    def check(item):
        path,wanted=item
        try:
            from urllib.parse import quote
            raw=fetch_bytes(base+quote(path,safe='/'))
            if path.endswith('.html'):
                raw,removed=BEACON.subn(b'',raw)
                assert removed<=1,'Unexpected duplicate Pages analytics injections'
            return path if sha(raw)!=wanted else None
        except Exception:return path
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:return sorted(x for x in pool.map(check,expected.items()) if x)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def artifact_bytes(artifact_id):
    req=urllib.request.Request(f'https://api.github.com/repos/{REPO}/actions/artifacts/{artifact_id}/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN']})
    try:
        urllib.request.build_opener(NoRedirect).open(req,timeout=60)
        raise AssertionError('Expected signed artifact redirect')
    except urllib.error.HTTPError as error:
        assert error.code in (301,302,303,307),f'Artifact download returned {error.code}'
        url=error.headers['Location']
    # Do not forward the GitHub credential to the artifact storage host.
    return urllib.request.urlopen(url,timeout=120).read()
def unzip_safe(raw,destination):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in archive.namelist():
            p=PurePosixPath(name)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in name,'Unsafe artifact path'
        archive.extractall(destination)
def receipt():return json.loads((OUT/'receipt.json').read_text())
def prepare():
    assert MODE in ('test','production')
    if MODE=='test':
        source=os.environ['CANDIDATE_SHA'];assert re.fullmatch('[0-9a-f]{40}',source),'Use the full candidate commit SHA'
        candidate=Path('candidate')
        assert subprocess.check_output(['git','-C',str(candidate),'rev-parse','HEAD']).decode().strip()==source
        shutil.copytree(candidate/'production-site',SITE)
        actual=validate_site()
        expected=json.loads((candidate/'.github/deployment-manifests/production-content-sha256.json').read_text())
        assert actual==expected,'Update the candidate content manifest; source bytes do not match it'
        p=cf();d=p['canonical_deployment'];detail=cf('/deployments/'+d['id'])
        assert detail.get('uses_functions') is False,'Production mode changed'
        baseline_sha=d['deployment_trigger']['metadata']['commit_hash'];assert re.fullmatch('[0-9a-f]{40}',baseline_sha)
        baseline,baseline_bundle_sha=baseline_manifest(d,detail['files'])
        assert sorted(baseline)==sorted(x.lstrip('/') for x in detail['files']),'Production inventory drifted'
        changed=sorted(x for x in baseline.keys()|actual.keys() if baseline.get(x)!=actual.get(x))
        approved=sorted(x.strip() for x in os.environ['APPROVED_PATHS'].split(',') if x.strip())
        assert changed==approved,'Changed paths differ from the explicitly approved path list'
        assert not verify_files(LIVE,baseline),'Published baseline bytes differ from the authoritative source'
        r={'source_sha':source,'baseline_id':d['id'],'baseline_source_sha':baseline_sha,'baseline_bundle_sha':baseline_bundle_sha,'baseline_config':config(p),'baseline_cloud_inventory':canonical(detail['files']),'before':baseline,'after':actual,'changed':changed,'preview_branch':'review-'+source[:12],'test_run_id':os.environ['GITHUB_RUN_ID']}
        (OUT/'receipt.json').write_text(json.dumps(r,sort_keys=True,indent=2)+'\n')
        with zipfile.ZipFile(OUT/'bundle.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(actual):archive.write(SITE/path,'site/'+path)
    else:
        run_id=os.environ['TEST_RUN_ID'];assert run_id.isdigit(),'A successful test run ID is required'
        run=github('/actions/runs/'+run_id)
        assert run['conclusion']=='success' and run['path']=='.github/workflows/promote-verified-production.yml','Test run must be successful and use the promotion workflow'
        artifacts=github('/actions/runs/'+run_id+'/artifacts')['artifacts']
        artifact=next(x for x in artifacts if x['name']=='tested-candidate-'+run_id and not x['expired'])
        unzip_safe(artifact_bytes(artifact['id']),OUT)
        r=receipt();assert r['test_run_id']==run_id
        unzip_safe((OUT/'bundle.zip').read_bytes(),OUT)
        assert validate_site()==r['after'],'Candidate bytes differ from the tested artifact'
        p=cf();d=p['canonical_deployment'];detail=cf('/deployments/'+d['id'])
        assert d['id']==r['baseline_id'],'Production changed since testing; retest this candidate'
        assert config(p)==r['baseline_config'],'Production bindings/configuration changed'
        assert canonical(detail['files'])==r['baseline_cloud_inventory'] and detail.get('uses_functions') is False,'Production asset inventory changed'
    r=receipt()
    with open(os.environ['GITHUB_ENV'],'a') as env:
        env.write('RELEASE_SOURCE_SHA='+r['source_sha']+'\n')
        env.write('PUBLISH_PROJECT='+('sanksresearchlab' if MODE=='production' else 'sanksresearchlab-test')+'\n')
        env.write('PUBLISH_BRANCH='+('main' if MODE=='production' else r['preview_branch'])+'\n')
    print(json.dumps({k:r[k] for k in ['source_sha','baseline_id','changed','preview_branch']},indent=2))
def verify():
    r=receipt()
    if MODE=='production':
        p=cf();d=p['canonical_deployment']
        assert d['deployment_trigger']['metadata']['commit_hash']==r['source_sha'],'Published source mismatch'
        (OUT/'published.json').write_text(json.dumps({'id':d['id'],'source_sha':r['source_sha']},indent=2)+'\n')
        detail=cf('/deployments/'+d['id'])
        assert detail.get('uses_functions') is False and sorted(x.lstrip('/') for x in detail['files'])==sorted(r['after'])
        assert config(p)==r['baseline_config'],'Account configuration changed during publication'
        base=LIVE
    else:base='https://'+r['preview_branch']+'.sanksresearchlab-test.pages.dev/'
    failures=verify_files(base,r['after'])
    (OUT/'verification.json').write_text(json.dumps({'url':base,'checked':len(r['after']),'failed_paths':failures},indent=2)+'\n')
    assert not failures,'Published bytes failed verification; inspect verification.json'
    print('Verified every file:',base)
def rollback():
    r=receipt();published=json.loads((OUT/'published.json').read_text());assert MODE=='production'
    assert cf()['canonical_deployment']['id']==published['id'],'Another release moved production; stop'
    cf('/deployments/'+r['baseline_id']+'/rollback',method='POST')
    assert not verify_files(LIVE,r['before']),'Rollback verification failed'
    print('Previous production restored and verified')
if __name__=='__main__':
    {'prepare':prepare,'verify':verify,'rollback':rollback}[sys.argv[1]]()
