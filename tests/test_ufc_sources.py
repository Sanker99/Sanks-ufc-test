import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from ufc_round_stats import aggregate,seconds
from build_ufc_csv import parse_scheduled_rounds,landed_count
class UfcSources(unittest.TestCase):
 def test_time_format(self):
  self.assertEqual(landed_count('0.0',30),0)
  self.assertEqual(landed_count('2.0',30),2)
  self.assertIsNone(landed_count('2.5',30))
  self.assertEqual(parse_scheduled_rounds('5 Rnd (5-5-5-5-5)'),5)
  self.assertIsNone(parse_scheduled_rounds('3 Rnd + OT (5-5-5-5)'))
  self.assertIsNone(parse_scheduled_rounds('1 Rnd (20)'))
  self.assertIsNone(seconds('--'));self.assertEqual(seconds('0:00'),0)
 def test_missing_duplicate_conflicting_rounds(self):
  base={'EVENT':'Event','BOUT':'A vs. B','FIGHTER':'A','SIG.STR.':'10 of 20','TOTAL STR.':'20 of 30','TD':'1 of 2','SUB.ATT':'1','CTRL':'1:30'}
  result=[{'EVENT':'Event','BOUT':'A vs. B','ROUND':'2','TIME':'5:00','TIME FORMAT':'3 Rnd (5-5-5)'}]
  r1={**base,'ROUND':'Round 1'};r2={**base,'ROUND':'Round 2'}
  d,c=aggregate([r1,r1,r2],result);self.assertEqual(next(iter(d.values()))['control_seconds'],180);self.assertEqual(c['duplicate_round_rows'],1)
  d,c=aggregate([r1],result);self.assertNotIn('control_seconds',next(iter(d.values())))
  d,c=aggregate([r1,{**r1,'CTRL':'2:00'},r2],result);self.assertNotIn('control_seconds',next(iter(d.values())))
if __name__=='__main__':unittest.main()
