import importlib.util,io,os,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
os.environ.setdefault('CLOUDFLARE_ACCOUNT_ID','test-account')
os.environ.setdefault('PROMOTION_TARGET','test')
spec=importlib.util.spec_from_file_location('promote',Path(__file__).with_name('promote.py'))
promote=importlib.util.module_from_spec(spec);spec.loader.exec_module(promote)
class Tests(unittest.TestCase):
    def test_artifact_path_traversal_is_rejected(self):
        blob=io.BytesIO()
        with zipfile.ZipFile(blob,'w') as z:z.writestr('../escape','x')
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(AssertionError):promote.unzip_safe(blob.getvalue(),Path(tmp))
    def test_live_verification_detects_changed_bytes_and_normalizes_only_analytics(self):
        raw=b'<html>original</html>'
        beacon=b'<!-- Cloudflare Pages Analytics --><script src="https://static.cloudflareinsights.com/beacon.min.js"></script><!-- Cloudflare Pages Analytics -->'
        expected={'index.html':promote.sha(raw),'assets/app.js':promote.sha(b'approved')}
        with patch.object(promote,'fetch_bytes',side_effect=lambda url:raw+beacon if url.endswith('index.html') else b'unexpected'):
            self.assertEqual(promote.verify_files('https://example.invalid/',expected),['assets/app.js'])
    def test_inventory_fingerprints_are_order_independent_and_content_sensitive(self):
        self.assertEqual(promote.canonical({'a':'1','b':'2'}),promote.canonical({'b':'2','a':'1'}))
        self.assertNotEqual(promote.canonical({'a':'1'}),promote.canonical({'a':'2'}))
if __name__=='__main__':unittest.main()
