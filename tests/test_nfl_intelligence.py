import unittest
import json
from datetime import datetime,timezone,timedelta
from pathlib import Path
from tools.build_nfl_intelligence import ppr,WEIGHTS,availability,kickoff
from tools.build_event_times import segment_times

NOW=datetime(2026,10,22,15,tzinfo=timezone.utc)

class IntelligenceTests(unittest.TestCase):
    def sources(self):return {k:{'url':'https://example.com/'+k,'published_at':NOW.isoformat(),'checked_at':NOW.isoformat()} for k in ['rosters','injuries']}
    def test_full_ppr_scoring_fumbles_and_two_point_conversions(self):
        r={k:0 for k in WEIGHTS};r.update(receptions=5,rushing_yards=20,receiving_yards=100,passing_yards=250,passing_tds=2,receiving_tds=1,passing_interceptions=1,fumbles_lost_total=1,receiving_2pt_conversions=1)
        self.assertEqual(ppr(r),39)
        r['receptions']=None;self.assertIsNone(ppr(r))
    def test_real_zero_is_scored(self):self.assertEqual(ppr({k:0 for k in WEIGHTS}),0)
    def test_missing_or_nan_is_not_zero(self):
        for value in ['',None,'nan','inf']:
            r={k:0 for k in WEIGHTS};r['passing_yards']=value;self.assertIsNone(ppr(r))
    def test_missing_injury_entry_and_full_practice_never_clear_player(self):
        p={'team':'PHI'};ro={'team':'PHI','status':'ACT'}
        for injury in [None,{'practice_status':'Full Participation in Practice','report_status':''}]:
            r=availability(p,ro,injury,self.sources(),NOW,7);self.assertEqual(r['designation'],'UNVERIFIED');self.assertFalse(r['verified'])
    def test_questionable_doubtful_out_separate_from_practice(self):
        for designation in ['Questionable','Doubtful','Out']:
            r=availability({'team':'PHI'},{'team':'PHI','status':'ACT'},{'report_status':designation,'practice_status':'Full Participation in Practice'},self.sources(),NOW,7)
            self.assertEqual(r['designation'],designation.upper());self.assertTrue(r['verified']);self.assertEqual(r['practice_status'],'Full Participation in Practice')
    def test_reserve_codes_and_unknown_reserve(self):
        for code,expected in [('R01','IR'),('R04','PUP'),('R05','NFI'),('R999','RESERVE')]:
            r=availability({'team':'PHI'},{'team':'PHI','status':'RES','status_description_abbr':code},None,self.sources(),NOW,7);self.assertEqual(r['designation'],expected)
    def test_stale_sources_and_team_mismatch_never_verify(self):
        for age in [timedelta(days=3),timedelta(minutes=-20)]:
            s=self.sources();s['rosters']['published_at']=(NOW-age).isoformat()
            r=availability({'team':'PHI'},{'team':'PHI','status':'RES','status_description_abbr':'R01'},None,s,NOW,7);self.assertFalse(r['verified'])
        r=availability({'team':'PHI'},{'team':'DAL','status':'RES','status_description_abbr':'R01'},None,self.sources(),NOW,7);self.assertFalse(r['verified'])
    def test_inactive_roster_does_not_imply_official_game_inactive(self):
        r=availability({'team':'PHI'},{'team':'PHI','status':'INA'},None,self.sources(),NOW,7);self.assertEqual(r['designation'],'UNVERIFIED')
    def test_eastern_schedule_converts_with_dst(self):
        self.assertEqual(kickoff({'gameday':'2026-10-25','gametime':'20:20'}).isoformat(),'2026-10-26T00:20:00+00:00')
        self.assertEqual(kickoff({'gameday':'2026-11-08','gametime':'20:20'}).isoformat(),'2026-11-09T01:20:00+00:00')
    def test_ufc_sections_use_published_times_not_spacing(self):
        e={'id':'1','name':'Test'};core=[{'id':'a','date':'2026-10-24T18:00Z','timeValid':True,'cardSegment':{'description':'Main Card'}},{'id':'b','date':'2026-10-24T15:30Z','timeValid':True,'cardSegment':{'description':'Prelims'}}]
        r=segment_times(e,core,NOW.isoformat());self.assertEqual(r['segments']['Main Card']['start'],'2026-10-24T18:00:00+00:00');self.assertEqual(r['segments']['Prelims']['start'],'2026-10-24T15:30:00+00:00');self.assertIsNone(r['segments']['Early Prelims']['start'])
        core.append({'id':'c','date':'2026-10-24T19:00Z','timeValid':True,'cardSegment':{'description':'Main Card'}});self.assertIsNone(segment_times(e,core,NOW.isoformat())['segments']['Main Card']['start'])
    def test_twenty_real_players_independent_scoring_arithmetic(self):
        root=Path(__file__).resolve().parents[1];data=json.loads((root/'data/nfl-intelligence.json').read_text(encoding='utf-8'))
        counts={p:0 for p in ['QB','RB','WR','TE']}
        for p in data['players'].values():
            if p['position'] not in counts or counts[p['position']]>=5:continue
            h=next((h for h in p['history'] if h['actual_ppr'] is not None),None)
            if not h:continue
            s=h['scoring_stats'];independent=round(s['receptions']+(s['rushing_yards']+s['receiving_yards'])/10+s['passing_yards']/25+4*s['passing_tds']+6*(s['rushing_tds']+s['receiving_tds'])-2*(s['passing_interceptions']+s['fumbles_lost_total'])+2*(s['passing_2pt_conversions']+s['rushing_2pt_conversions']+s['receiving_2pt_conversions']),2)
            self.assertEqual(h['actual_ppr'],independent);counts[p['position']]+=1
        self.assertEqual(counts,{'QB':5,'RB':5,'WR':5,'TE':5})
    def test_snapshot_totals_and_missing_weeks(self):
        data=json.loads((Path(__file__).resolve().parents[1]/'data/nfl-intelligence.json').read_text(encoding='utf-8'))
        for p in data['players'].values():
            vals=[h['actual_ppr'] for h in p['history'] if h['actual_ppr'] is not None]
            self.assertEqual(p['season_actual_ppr'],round(sum(vals),2) if vals else None)
            self.assertIsNone(p['projected_ppr'])
            self.assertTrue(all(h['actual_ppr'] is None for h in p['history'] if h['status']=='bye'))

if __name__=='__main__':unittest.main()
