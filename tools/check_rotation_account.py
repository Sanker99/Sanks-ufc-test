"""Read Cloudflare metadata without printing tokens, bindings, or secret values.

Audit mode records sanitized metadata. Publish mode also requires an independently
reviewed complete inventory/routing/bindings attestation pinned to this deployment.
It does not infer inventory completeness from public HTTP paths.
"""
import argparse
import hashlib
import json
import os
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PROJECT='sanksresearchlab'

def api(path, method="GET"):
    account=os.environ['CLOUDFLARE_ACCOUNT_ID']
    token=os.environ['CLOUDFLARE_API_TOKEN']
    req=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{PROJECT}{path}',
                              headers={'Authorization':'Bearer '+token}, method=method)
    with urllib.request.urlopen(req,timeout=60) as response:
        body=json.load(response)
    if not body.get('success'):
        raise RuntimeError('Cloudflare read failed; review account permissions')
    return body['result']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--publish-gate',action='store_true')
    args=parser.parse_args()
    project=api('')
    deployment=project['canonical_deployment']
    if project['name']!=PROJECT or deployment['environment']!='production':
        raise SystemExit('ABORT: wrong project or environment')
    # Fingerprint metadata locally; never log configuration values.
    config={k:project.get(k) for k in ['deployment_configs','source','build_config','production_branch']}
    fingerprint=hashlib.sha256(json.dumps(config,sort_keys=True).encode()).hexdigest()
    result={'project':PROJECT,'deployment_id':deployment['id'],'created_on':deployment.get('created_on'),
            'url':deployment.get('url'),'configuration_sha256':fingerprint,
            'inventory_verified':False,'publish_authorized':False}
    out=ROOT/'work/rotation-audit';out.mkdir(parents=True,exist_ok=True)
    (out/'account-metadata.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    if args.publish_gate:
        review_path=ROOT/'.github/deployment-manifests/rotation-account-review.json'
        if not review_path.is_file():
            raise SystemExit('ABORT: authenticated full inventory/routing/bindings review has not been recorded')
        review=json.loads(review_path.read_text())
        release=json.loads((out/'release.json').read_text())
        inventory_sha=hashlib.sha256(json.dumps(release['before'],sort_keys=True).encode()).hexdigest()
        required={'project':PROJECT,'deployment_id':deployment['id'],
                  'configuration_sha256':fingerprint,'inventory_sha256':inventory_sha,
                  'complete_inventory_verified':True,'static_deployment_verified':True,
                  'routing_preserved':True,'bindings_preserved':True,'rollback_verified':True}
        if any(review.get(k)!=v for k,v in required.items()):
            raise SystemExit('ABORT: current account/bundle differs from the reviewed release')
        if not deployment['id'].startswith('da2507d2-'):
            raise SystemExit('ABORT: production moved beyond the audited snapshot')
        detail=api('/deployments/'+deployment['id'])
        cloud_files=detail.get('files')
        if detail.get('uses_functions') is not False or not isinstance(cloud_files,dict):
            raise SystemExit('ABORT: deployment mode or file manifest changed')
        if sorted(p.lstrip('/') for p in cloud_files) != sorted(release['before']):
            raise SystemExit('ABORT: account asset paths differ from the complete audited inventory')
        cloud_sha=hashlib.sha256(json.dumps(cloud_files,sort_keys=True).encode()).hexdigest()
        if cloud_sha != review['cloudflare_inventory_sha256']:
            raise SystemExit('ABORT: account asset hashes changed')
        if detail.get('latest_stage',{}).get('status')!='success':
            raise SystemExit('ABORT: rollback baseline is not a successful deployment')
        print('Authenticated production preservation gate passed')

if __name__=='__main__':main()
