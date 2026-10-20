import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from audit_ncaa_coverage import inspect_response
class Availability(unittest.TestCase):
 def test_empty_valid_season_is_only_checked_absence_with_complete_team_coverage(self):
  response={'filters':[{'name':'season','value':'2026'}]};p={'id':'ncaa:1','team_id':'10','espn_id':'1'}
  logs,state=inspect_response(p,response,{},2026,True);self.assertEqual(state['state'],'no_recorded_appearances')
  logs,state=inspect_response(p,response,{},2026,False);self.assertEqual(state['state'],'statistics_unavailable')
  with self.assertRaises(ValueError):inspect_response(p,response,{},2025,True)
 def test_verified_log_requires_correct_team_final_game_and_season(self):
  p={'id':'ncaa:1','espn_id':'1','team_id':'10','team':'TEN'};game={'id':'7','week':3,'completed':True,'date':'2026-09-10','home_id':'10','away':'AWY','home':'TEN'}
  response={'filters':[{'name':'season','value':'2026'}],'names':['rushingYards'],'events':{'7':{'team':{'id':'10'}}},'seasonTypes':[{'displayName':'2026 Regular Season','categories':[{'events':[{'eventId':'7','stats':['0']}]}]}]}
  logs,state=inspect_response(p,response,{'7':game},2026,True);self.assertEqual(logs[0]['metrics']['rushing_yards'],0)
  response['events']['7']['team']['id']='99';logs,state=inspect_response(p,response,{'7':game},2026,True);self.assertFalse(logs)
if __name__=='__main__':unittest.main()
