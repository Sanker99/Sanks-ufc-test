import unittest,sys
from pathlib import Path
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from build_availability import classify,parse
from build_streak_event_snapshot import build
from update_test_data import assess
from verify_stat_samples import metrics,extract

class ResearchIntegrity(unittest.TestCase):
 def setUp(self):self.now=datetime.now(timezone.utc)
 def test_availability_never_infers_green_from_missing_old_or_unknown_reports(self):
  self.assertEqual(classify('Active',self.now.isoformat(),self.now)[0],'available')
  self.assertEqual(classify('Out',self.now.isoformat(),self.now)[0],'out')
  self.assertEqual(classify('Questionable',self.now.isoformat(),self.now)[0],'questionable')
  for status,date in [('Active',None),('Active',(self.now-timedelta(days=4)).isoformat()),('Unknown',self.now.isoformat())]:self.assertEqual(classify(status,date,self.now)[0],'unknown')
 def test_ncaa_requires_exact_id_and_team_not_just_a_matching_name(self):
  roster=[{'id':'ncaa:1','espn_id':'1','name':'Test Player','team_id':'10'}]
  report={'season':{'year':self.now.year},'injuries':[{'id':'10','injuries':[{'athlete':{'id':'2','displayName':'Test Player'},'status':'Active','date':self.now.isoformat()}]}]}
  self.assertEqual(parse('NCAA',report,roster,self.now)['players'],{})
  report['injuries'][0]['injuries'][0]['athlete']['id']='1';self.assertEqual(parse('NCAA',report,roster,self.now)['players']['ncaa:1']['state'],'available')
  report['injuries'][0]['id']='20';self.assertEqual(parse('NCAA',report,roster,self.now)['players'],{})
 def test_event_export_preserves_full_instant_and_empty_photo_coverage(self):
  date=(self.now+timedelta(days=4)).isoformat();event={'id':'7','date':date,'name':'UFC Test','competitions':[{'competitors':[{'id':'99','athlete':{'displayName':'Test Fighter'},'records':[{'name':'overall','summary':'15-3'}]}]}]}
  events,records=build({'events':[event]},{'by_name':{}},{'events':[]},self.now)
  self.assertEqual(events['events'][0]['date'],date);self.assertEqual(events['events'][0]['athlete_ids'],[]);self.assertEqual(events['events'][0]['uncovered_fighters'],['Test Fighter']);self.assertEqual(records['records']['testfighter']['record'],'15-3')
 def test_nested_upstream_failures_are_not_successful_refreshes(self):
  with self.assertRaises(ValueError):assess('NFL',{'sources':{'stats':{'error':'failed'}},'players':[1],'games':[1]})
  self.assertTrue(assess('Availability',{'leagues':{'NCAA':{'partial':True,'scoped_teams':75,'teams_with_current_reports':0}}}))
 def test_secondary_parser_keeps_real_zero_and_missing_distinct(self):
  self.assertEqual(metrics({'keys':['rushingYards','receivingTargets','completions/passingAttempts']},{'stats':['0','--','0/2']}),{'rushing_yards':0,'targets':None,'completions':0,'attempts':2})
  payload={'boxscore':{'players':[{'team':{'id':'10'},'statistics':[{'keys':['rushingYards'],'athletes':[{'athlete':{'id':'2','displayName':'Test Player'},'stats':['7']}]}]}]}}
  self.assertEqual(extract(payload,'NCAA',{'id':'ncaa:1','team_id':'10'},{}),{})
if __name__=='__main__':unittest.main()
