"""Read-only Cloudflare deployment topology; never prints binding values."""
import hashlib,json,os,urllib.request,urllib.error
from pathlib import Path
ACCOUNT=os.environ['CLOUDFLARE_ACCOUNT_ID']
TOKEN=os.environ['CLOUDFLARE_API_TOKEN']
BASE=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/'
OUT=Path('work/topology-audit');OUT.mkdir(parents=True,exist_ok=True)
def read(path):
    request=urllib.request.Request(BASE+path,headers={'Authorization':'Bearer '+TOKEN})
    try:
        with urllib.request.urlopen(request,timeout=60) as response:
            body=json.load(response)
        if not body.get('success'): return {'read_error':True}
        return body['result']
    except urllib.error.HTTPError as error:
        return {'http_status':error.code}
def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
results=[]
for name in ['sanksresearchlab','sanksresearchlab-test','sanks-ufc-preview','sanks-command-center-production','sanks-command-center-test']:
    p=read(name)
    if 'canonical_deployment' not in p:
        results.append({'project':name,'error':p});continue
    d=p['canonical_deployment'] or {}
    item={'project':name,'project_fields':sorted(p),'production_branch':p.get('production_branch'),
          'canonical_deployment':{k:d.get(k) for k in ['id','created_on','url','environment','is_skipped','aliases','stages']},
          'source':None,'build_config':p.get('build_config'),'configurations':{}}
    source=p.get('source') or {}
    item['source']={'type':source.get('type'),'config':{k:v for k,v in (source.get('config') or {}).items() if k in ['owner','repo_name','production_branch','production_deployments_enabled','preview_deployment_setting','preview_branch_includes','preview_branch_excludes']}}
    for env,conf in (p.get('deployment_configs') or {}).items():
        envvars=conf.get('env_vars') or {}
        bindings={}
        for key,value in conf.items():
            if key.endswith('_bindings') or key in ['d1_databases','kv_namespaces','r2_buckets','services','durable_object_namespaces']:
                bindings[key]=list(value) if isinstance(value,dict) else [{'binding':x.get('binding'),'name':x.get('name')} for x in value] if isinstance(value,list) else str(type(value).__name__)
        item['configurations'][env]={'fields':sorted(conf),'env_var_names':sorted(envvars),'bindings':bindings,'configuration_sha256':fingerprint(conf)}
    if d.get('id'):
        detail=read(name+'/deployments/'+d['id'])
        item['deployment_detail_fields']=sorted(detail)
        item['deployment_metadata']={k:detail.get(k) for k in ['id','created_on','environment','url','deployment_trigger','build_config','latest_stage']}
        secret_vars=[v for v in (detail.get('env_vars') or {}).values() if v.get('type')=='secret_text']
        redacted=(None,'','(secret)','[encrypted]','[REDACTED]')
        item['secret_values_redacted']=all(v.get('value') in redacted for v in secret_vars)
        item['secret_var_count']=len(secret_vars)
        item['uses_functions']=detail.get('uses_functions')
        item['file_count']=len(detail.get('files') or {})
        if name=='sanksresearchlab':
            files=detail.get('files')
            item['files_type']=type(files).__name__
            item['files_sample']=list(files)[:5] if isinstance(files,dict) else []
            if isinstance(files,(dict,list)):
                (OUT/'production-inventory.json').write_text(json.dumps({'deployment_id':d['id'],'uses_functions':detail.get('uses_functions'),'files':files},indent=2)+'\n')
    results.append(item)
(OUT/'topology.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
