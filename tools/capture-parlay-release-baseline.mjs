import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const repo='Sanker99/Sanks-ufc-test',source='299cd57226385fa3da0a588a4badfa6e7aae2e0a',expectedDeployment='ab702ea6-94be-44fc-ac18-370df2de0d47';
async function github(path,method='GET',body){const response=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error'});if(!response.ok)throw Error('GitHub release capture '+method+' returned '+response.status);return response.json();}
async function cloudflare(){const url='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/pages/projects/sanksresearchlab';const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error'});if(!response.ok)throw Error('Read-only live deployment check returned '+response.status);const body=await response.json();if(!body.success)throw Error('Read-only live deployment check failed');return body.result;}
const before=await cloudflare();if(before.canonical_deployment.id!==expectedDeployment)throw Error('Live deployment changed; stop and review the new baseline');
const manifestFile=await github('/contents/.github/deployment-manifests/production-content-sha256.json?ref='+source),manifest=JSON.parse(Buffer.from(manifestFile.content,'base64').toString('utf8'));
const commit=await github('/git/commits/'+source),entries=[],changes={};
for(const path of ['assets/experience.js','sanks-tracker.js']){
 const response=await fetch('https://sanksresearchlab.pages.dev/'+path,{headers:{'Cache-Control':'no-cache','User-Agent':'SANKS-verified-promotion/1.0'},redirect:'error'});if(!response.ok)throw Error('Existing public asset returned '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1000000||!bytes.length)throw Error('Unexpected existing asset size');const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 changes[path]={before:manifest[path],live:hash,bytes:bytes.length};manifest[path]=hash;entries.push({path:'production-site/'+path,mode:'100644',type:'blob',content});
}
const after=await cloudflare();if(after.canonical_deployment.id!==expectedDeployment)throw Error('Live deployment changed during read-only capture');
entries.push({path:'.github/deployment-manifests/production-content-sha256.json',mode:'100644',type:'blob',content:JSON.stringify(manifest,null,2)+'\n'});
const tree=await github('/git/trees','POST',{base_tree:commit.tree.sha,tree:entries}),record=await github('/git/commits','POST',{message:'Record the exact current Lab tracker and experience assets before Parlay addition',tree:tree.sha,parents:[source]});
const branch='release/parlay-preserved-baseline-'+process.env.GITHUB_RUN_ID;
console.log(JSON.stringify({deploymentId:expectedDeployment,recordedWorkflowCommit:before.canonical_deployment.deployment_trigger.metadata.commit_hash,sourceCommit:record.sha,tree:tree.sha,branch,changes},null,2));
await github('/git/refs','POST',{ref:'refs/heads/'+branch,sha:record.sha});
await fs.mkdir('work/release-capture',{recursive:true});await fs.writeFile('work/release-capture/receipt.json',JSON.stringify({deploymentId:expectedDeployment,sourceCommit:record.sha,tree:tree.sha,branch,changes},null,2));
