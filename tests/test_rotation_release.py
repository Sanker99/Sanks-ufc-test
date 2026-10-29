import importlib.util
import sys
import unittest
import json
import tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import stage_approved_rotation_release as release

class ReleaseTests(unittest.TestCase):
    def test_unreviewed_source_is_rejected(self):
        with self.assertRaises(ValueError):
            release.approved_replacement(b'unreviewed',b'unreviewed')
    def test_pinned_approved_change(self):
        root=Path(__file__).resolve().parents[1]
        base=root/'approved-base/assets/experience.js'
        update=root/'approved-update/assets/experience.js'
        if not base.exists() or not update.exists():
            self.fail('Pinned approved sources must be checked out before testing')
        self.assertEqual(release.approved_replacement(base.read_bytes(),update.read_bytes()),update.read_bytes())
        with self.assertRaises(ValueError):
            release.approved_replacement(base.read_bytes()+b'\n',update.read_bytes())

    def test_staging_preserves_tracker_and_rejects_inventory_drift(self):
        root=Path(__file__).resolve().parents[1]
        base=(root/'approved-base/assets/experience.js').read_bytes()
        approved=root/'approved-update/assets/experience.js'
        tracker=b'fixture tracker bytes'
        with tempfile.TemporaryDirectory() as temp:
            audit=Path(temp)/'audit'; audit.mkdir()
            files={'assets/experience.js':base,'sanks-tracker.js':tracker,'index.html':b'fixture index'}
            for folder in ['live','snapshot']:
                for name,raw in files.items():
                    dest=audit/folder/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
            rows=[{'path':p,'live_sha256':release.sha(b),'snapshot_sha256':release.sha(b),'equal':True} for p,b in files.items()]
            report={'snapshot':release.SNAPSHOT,'errors':[],'differences':[],'paths_checked':len(files),'results':rows}
            (audit/'comparison.json').write_text(json.dumps(report))
            with patch.object(release,'TRACKER_SHA',release.sha(tracker)):
                result=release.stage(audit,approved,Path(temp)/'site',list(files))
                self.assertEqual(result['changed'],['assets/experience.js'])
                self.assertEqual((Path(temp)/'site/sanks-tracker.js').read_bytes(),tracker)
                self.assertFalse(result['publish_authorized'])
                (audit/'live/extra.txt').write_text('unexpected asset')
                with self.assertRaises(ValueError):
                    release.stage(audit,approved,Path(temp)/'other-site',list(files))

if __name__=='__main__':unittest.main()
