"""Stage the V5 static site without deploying or contacting Cloudflare."""
import json
import shutil
import zipfile
from pathlib import Path


def package(root, destination):
    root, destination = Path(root), Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    site = destination / 'site'
    site.mkdir(exist_ok=True)
    sources = {str(p.relative_to(root)).replace('\\', '/'): p
               for directory in ('assets', 'data', 'parlay')
               for p in (root / directory).rglob('*') if p.is_file() and not (directory == 'parlay' and ('tests' in p.parts or 'tools' in p.parts or p.suffix == '.md'))}
    for name in ('index.html', '_headers', 'sanks-header.png', 'data.json', 'injuries.json', 'ufc-data.json'):
        if (root / name).is_file():
            sources[name] = root / name
    # Populate canonical NFL paths when only the legacy root snapshots exist.
    for name in ('data.json', 'injuries.json'):
        sources.setdefault('data/' + name, root / name)
    for name, source in sources.items():
        if name.endswith('.json'):
            json.loads(source.read_text(encoding='utf-8'))
        target = site / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    archive = destination / 'sanks-v5-preview.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for name in sorted(sources):
            output.write(site / name, arcname=name)
    print(f'Staged {len(sources)} files in {site}')
    print(f'Preview upload package: {archive}')
    return archive


if __name__ == '__main__':
    repository = Path(__file__).resolve().parents[1]
    package(repository, repository / 'work' / 'v5-preview')
