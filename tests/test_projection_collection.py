import unittest
from datetime import datetime,timezone
from tools.build_fantasy_projections import score,parse_table
from tools.build_availability import athlete_id,parse

class ProjectionCollection(unittest.TestCase):
 def test_user_examples_and_negative_rushing(self):
  self.assertEqual(score({'passing_yards':246.3,'passing_tds':2,'interceptions':.7,'rushing_yards':21.9,'rushing_tds':.2}), (20.542,0))
  self.assertEqual(score({'receptions':4.3,'receiving_yards':59.8,'receiving_tds':.3,'rushing_yards':-.5}),(12.03,0))
 def test_bonus_boundaries_unrounded_separate_and_nonstacking(self):
  self.assertEqual(score({'rushing_yards':99.99})[1],0)
  self.assertEqual(score({'rushing_yards':100,'receiving_yards':100})[1],10)
  self.assertEqual(score({'rushing_yards':200})[1],10)
  self.assertEqual(score({'passing_yards':300})[1],5)
  self.assertEqual(score({'passing_yards':400})[1],10)
 def test_broken_or_wrong_week_tables_rejected(self):
  for raw in ['<h1>Week 6 QB rankings</h1>2026','<h1>Week 7 QB rankings</h1>2026<table></table>']:
   with self.assertRaises(ValueError):parse_table(raw,'QB',2026,7)
 def test_espn_https_link_ids_and_conflicting_id_rejected(self):
  a={'links':[{'href':'https://www.espn.com/nfl/player/_/id/123/name'}]}
  self.assertEqual(athlete_id(a),'123');a['id']='456';self.assertEqual(athlete_id(a),'')
 def test_nfl_report_joins_id_and_team_not_name(self):
  now=datetime.now(timezone.utc);roster=[{'id':'00-1','espn_id':'123','name':'Name','team':'PHI'}]
  payload={'season':{'year':now.year},'injuries':[{'id':'21','injuries':[{'athlete':{'links':[{'href':'https://www.espn.com/nfl/player/_/id/123/name'}]},'status':'Active','date':now.isoformat()}]}]}
  self.assertEqual(parse('NFL',payload,roster,now)['players']['00-1']['state'],'available')
  payload['injuries'][0]['id']='6';self.assertEqual(parse('NFL',payload,roster,now)['players'],{})
