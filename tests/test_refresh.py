import unittest,tempfile,json,sys,os
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import update_test_data
class Refresh(unittest.TestCase):
 def test_failure_retains_previous_valid_bytes(self):
  base=Path(__file__).resolve().parents[1]/'work/test-temp';base.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=base) as folder:
   root=Path(folder);(root/'data').mkdir();p=root/'data/data.json';original=b'{"players":[{"id":"one"}],"games":[],"updated":"2026-01-01T00:00:00+00:00"}';p.write_bytes(original)
   with patch.object(update_test_data,'ROOT',root),patch.object(update_test_data.subprocess,'run',return_value=SimpleNamespace(returncode=1,stderr='Temporary source failure',stdout='')):
    result=update_test_data.main(True,['NFL'])
   self.assertEqual(p.read_bytes(),original);self.assertTrue(result['feeds']['NFL']['cached'])
 def test_production_target_is_rejected(self):
  with patch.dict(os.environ,{'SANKS_TARGET_PROJECT':'production'}):
   with self.assertRaises(RuntimeError):update_test_data.main()
if __name__=='__main__':unittest.main()
