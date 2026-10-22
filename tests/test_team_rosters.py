import unittest
from datetime import datetime,timezone
from tools.build_team_rosters import ready_evidence,nfl_depth,college_depth,validate

class TeamRosters(unittest.TestCase):
 def test_ready_requires_active_roster_matching_depth_and_both_clear_injury_fields(self):
  a={'status':{'type':'active'},'injuries':[]};d={'injuries':[]};stamp='2026-10-22T18:00:00Z'
  self.assertEqual(ready_evidence(a,d,stamp,'https://espn.com')['state'],'available')
  self.assertIsNone(ready_evidence(a,None,stamp,''))
  a['injuries']=[{'status':'Questionable'}];self.assertIsNone(ready_evidence(a,d,stamp,''))
  a['injuries']=[];d['injuries']=[{'status':'Out'}];self.assertIsNone(ready_evidence(a,d,stamp,''))
  d['injuries']=[];a['status']['type']='inactive';self.assertIsNone(ready_evidence(a,d,stamp,''))
 def test_nfl_chart_retains_tiers_and_separate_receiver_slots(self):
  rows=nfl_depth({'depthchart':[{'positions':{'wr1':{'athletes':[{'id':'1','displayName':'Starter','injuries':[]},{'id':'2','displayName':'Backup','injuries':[]}]},'wr2':{'athletes':[{'id':'3','displayName':'Other starter','injuries':[]}]},'cb':{'athletes':[{'id':'4','displayName':'Defender'}]}}}]})
  self.assertEqual([(r['espn_id'],r['tier'],r['slot']) for r in rows],[('1',1,'WR1'),('2',2,'WR1'),('3',1,'WR2')])
 def test_wrong_season_team_and_stale_team_roster_are_rejected(self):
  now=datetime(2026,10,22,18,tzinfo=timezone.utc)
  for p in [{'team':{'id':'2'},'season':{'year':2026},'timestamp':now.isoformat()},{'team':{'id':'1'},'season':{'year':2025},'timestamp':now.isoformat()},{'team':{'id':'1'},'season':{'year':2026},'timestamp':'2026-10-20T18:00:00Z'}]:
   with self.assertRaises(ValueError):validate(p,'1',now)
 def test_college_chart_uses_published_order_and_normalizes_last_first(self):
  html='<p>Updated: 10/21/2026 10:24AM ET</p><table><tbody><tr><td>RB</td><td>8</td><td><a>Starter Jr., First RS SO</a></td><td>2</td><td><a>Backup, Second FR</a></td></tr></tbody></table>'
  rows,stamp=college_depth(html,datetime(2026,10,22,18,tzinfo=timezone.utc));self.assertEqual(rows[0]['name'],'First Starter Jr.');self.assertEqual(rows[1]['tier'],2);self.assertEqual(stamp,'2026-10-21T14:24:00+00:00')

 def test_published_snapshot_contains_every_requested_team_and_ready_has_depth(self):
  import json
  from pathlib import Path
  data=json.loads((Path(__file__).resolve().parents[1]/'data/team-rosters.json').read_text(encoding='utf-8'))
  self.assertEqual(len(data['leagues']['NFL']['teams']),32);self.assertEqual(len(data['leagues']['NCAA']['teams']),75)
  for league in data['leagues'].values():
   for team in league['teams'].values():self.assertGreater(team.get('players_matched',0),0)
   for row in league['players'].values():
    if (row.get('availability') or {}).get('state')=='available':self.assertIsNotNone(row['depth'])
