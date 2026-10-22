import unittest
from datetime import datetime,timezone
from tools.build_ncaa_official_availability import parse_reports,designation,team_name

class OfficialAvailability(unittest.TestCase):
 def setUp(self):
  self.now=datetime(2026,10,22,17,tzinfo=timezone.utc)
  self.data={'teams':[{'id':'1','short_name':'Pitt','name':'Pittsburgh Panthers','conference':'ACC'},{'id':'2','short_name':'Miami','name':'Miami Hurricanes','conference':'ACC'}], 'players':[{'id':'p','espn_id':'12','name':'Example Player Jr.','team_id':'1','position':'QB','jersey':'9'}], 'games':[{'id':'g','home_id':'2','away_id':'1','date':'2026-10-24T16:00:00Z','completed':False}]}
  self.payload={'r':{'publishDate':'2026-10-21','postedTime':'19:00:00','conferenceTimeZone':'ET','ReportType':'Initial','footer':{'date':'2026-10-24'},'games':[{'teamName':'Pittsburgh','rows':[{'name':'QB #9 Example Player','status':'Available','exemptStatus':'NonExempt'}]},{'teamName':'Miami','rows':[]}]}}
 def parse(self):return parse_reports('ACC',self.payload,self.data,self.now)
 def test_explicit_available_game_identity_and_eastern_timestamp(self):
  row=self.parse()['players']['p'];self.assertEqual(row['state'],'available');self.assertEqual(row['reported_at'],'2026-10-21T23:00:00+00:00');self.assertEqual(row['game_id'],'g')
 def test_omission_exempt_and_explicit_out_are_distinct(self):
  row=self.payload['r']['games'][0]['rows'][0];row.update(status='Exempt',exemptStatus='Exempt');self.assertEqual(self.parse()['players']['p']['state'],'unknown')
  row.update(status='Out',exemptStatus='Out');self.assertEqual(self.parse()['players']['p']['state'],'out')
  self.payload['r']['games'][0]['rows']=[];self.assertEqual(self.parse()['players'],{})
 def test_wrong_game_old_future_and_completed_reports_rejected(self):
  self.payload['r']['footer']['date']='2026-10-25';self.assertEqual(self.parse()['players'],{})
  self.payload['r']['footer']['date']='2026-10-24';self.payload['r']['publishDate']='2026-10-01';self.assertEqual(self.parse()['players'],{})
  self.payload['r']['publishDate']='2026-10-23';self.assertEqual(self.parse()['players'],{})
  self.payload['r']['publishDate']='2026-10-21';self.data['games'][0]['completed']=True;self.assertEqual(self.parse()['players'],{})
 def test_jersey_changes_do_not_break_unique_full_identity_but_names_do(self):
  self.data['players'][0]['jersey']='19';self.assertFalse(self.parse()['players']['p']['jersey_matches'])
  self.data['players'][0]['name']='Different Player';self.assertEqual(self.parse()['players'],{})
 def test_probable_is_not_ready_and_state_abbreviations_match(self):
  self.assertEqual(designation('Probable'),'questionable');self.assertEqual(designation('Doubtful'),'questionable');self.assertEqual(team_name('Boise St'),'boisestate')
 def test_pac_public_report_has_no_implied_clearance(self):
  for t in self.data['teams']:t['conference']='PAC-12'
  p={'games':[{'gameId':'pac','dateISO':'2026-10-24','updatedAtUTC':'2026-10-22T02:00:00Z','notes':'Advance Report','away':{'name':'Pitt','players':[{'name':'Example Player','position':'QB','status':'Questionable'}]},'home':{'name':'Miami','players':[]}}]}
  r=parse_reports('PAC',p,self.data,self.now);self.assertEqual(r['players']['p']['state'],'questionable');self.assertEqual(len(r['players']),1)
