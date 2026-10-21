import unittest,sys,json
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from build_weather import kickoff_nfl,select_hour,roof_kind
ROOT=Path(__file__).resolve().parents[1]
class Weather(unittest.TestCase):
 def test_kickoff_daylight_saving_conversion(self):
  self.assertEqual(kickoff_nfl({'date':'2026-10-25','time':'13:00'}).hour,17)
  self.assertEqual(kickoff_nfl({'date':'2026-11-08','time':'13:00'}).hour,18)
  self.assertIsNone(kickoff_nfl({'date':'2026-11-08','time':'TBA'}))
 def test_nearest_hour_and_missing_forecast(self):
  d={'hourly':{'time':[1000,4600],'temperature_2m':[0,60]}}
  self.assertEqual(select_hour(d,datetime.fromtimestamp(1000,timezone.utc))['temperature_f'],0)
  self.assertIsNone(select_hour(d,datetime.fromtimestamp(9000,timezone.utc)))
 def test_venue_roof_is_not_inferred_from_field_weather(self):
  self.assertEqual(roof_kind(True,{'closed'}),'retractable')
  self.assertEqual(roof_kind(True,set()),'indoor');self.assertEqual(roof_kind(False,set()),'outdoor');self.assertEqual(roof_kind(None,set()),'unknown')
 def test_actual_five_conference_forecast_coverage_and_source_attribution(self):
  d=json.loads((ROOT/'data/game-weather.json').read_text(encoding='utf-8'));rows=list(d['games'].values())
  conferences={c for r in rows if r['status']=='forecast' and r['league']=='NCAA' for c in r['conferences']}
  self.assertEqual(conferences,{'ACC','Big 12','B1G','PAC-12','SEC'})
  for row in rows:
   if row['status']=='forecast':
    self.assertTrue(row['coordinate_source'].startswith('https://en.wikipedia.org/?curid='));self.assertTrue(row['source_url'].startswith('https://api.open-meteo.com/v1/forecast?'))
    if row['roof_kind']!='outdoor':self.assertEqual(row['scope'],'exterior_only')
   if row['status']=='indoor':self.assertNotIn('temperature_f',row)
  self.assertTrue(any(r['neutral'] for r in rows));self.assertTrue(any(r['roof_kind']=='retractable' for r in rows))
if __name__=='__main__':unittest.main()
