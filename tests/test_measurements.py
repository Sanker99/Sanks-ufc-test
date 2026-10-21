import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import build_player_measurements as source


class Measurements(unittest.TestCase):
    def test_same_name_players_keep_exact_provider_identity(self):
        base = Path(__file__).resolve().parents[1] / 'work/test-temp'
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as folder:
            root = Path(folder)
            (root / 'data').mkdir()
            players = [{'id': 'one', 'name': 'Same Name'}, {'id': 'two', 'name': 'Same Name'},
                       {'id': 'unmapped', 'name': 'Same Name'}]
            (root / 'data/data.json').write_text(json.dumps({'players': players}), encoding='utf-8')
            csv = 'gsis_id,espn_id,height,weight\none,101,72,200\ntwo,202,76,240\n'
            athletes = [{'id': '101', 'displayName': 'Same Name', 'height': 73, 'weight': 205},
                        {'id': '202', 'displayName': 'Same Name', 'height': 77, 'weight': 245}]
            def fetch(url):
                return csv if url == source.PLAYERS else json.dumps({'athletes': [{'items': athletes}]})
            with patch.object(source, 'ROOT', root), patch.object(source, 'TEAM_IDS', [1]), patch.object(source, 'fetch', side_effect=fetch):
                source.main()
            output = json.loads((root / 'data/athlete-content.json').read_text(encoding='utf-8'))
            self.assertEqual(output['athletes']['NFL:one']['measurements']['weight'], '205 lbs')
            self.assertEqual(output['athletes']['NFL:two']['measurements']['height'], '6\' 5"')
            self.assertNotIn('NFL:unmapped', output['athletes'])
            self.assertEqual(output['measurement_coverage']['missing_or_partial'], ['unmapped'])

    def test_missing_and_implausible_measurements_are_not_invented(self):
        self.assertIsNone(source.number('', 48, 96))
        self.assertIsNone(source.number('0', 48, 96))
        self.assertIsNone(source.number('999', 100, 500))
        self.assertIsNone(source.number('72.8', 48, 96))
        m = source.measurements(None, 200, 'https://example.com', 'checked')
        self.assertIsNone(m['height'])
        self.assertEqual(m['weight'], '200 lbs')
