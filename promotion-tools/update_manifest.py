"""Refresh the tracked manifest after intentional production-site edits."""
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
site=root/'production-site'
assert (site/'index.html').is_file(),'Run from a complete production source checkout'
assert not any(p.is_symlink() for p in site.rglob('*')),'Symlinks are not deployable'
manifest={p.relative_to(site).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in site.rglob('*') if p.is_file()}
out=root/'.github/deployment-manifests/production-content-sha256.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n')
print('Updated content manifest:',len(manifest),'files')
