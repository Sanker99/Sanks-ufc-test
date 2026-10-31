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
        expected={'index.html':promote.sha(raw),'parlay/index.html':promote.sha(raw),'assets/app.js':promote.sha(b'approved')}
        with patch.object(promote,'fetch_bytes',side_effect=lambda url:raw+beacon if url.endswith('index.html') else b'unexpected'):
            self.assertEqual(promote.verify_files('https://example.invalid/',expected),['assets/app.js'])
    def test_inventory_fingerprints_are_order_independent_and_content_sensitive(self):
        self.assertEqual(promote.canonical({'a':'1','b':'2'}),promote.canonical({'b':'2','a':'1'}))
        self.assertNotEqual(promote.canonical({'a':'1'}),promote.canonical({'a':'2'}))
    def test_reviewed_provenance_requires_exact_deployment_label_and_inventory(self):
        deployment={'id':'reviewed-id','deployment_trigger':{'metadata':{'commit_hash':'a'*40}}}
        registry={'reviewed-id':{'workflow_commit':'a'*40,'source_commit':'b'*40}}
        with patch.object(promote.subprocess,'run'),patch.object(promote.subprocess,'check_output',return_value=b'{"index.html":"abc"}'):
            baseline,source=promote.baseline_manifest(deployment,{'/index.html':'cloud-hash'},registry)
            self.assertEqual(source,'b'*40);self.assertEqual(baseline,{'index.html':'abc'})
            with self.assertRaises(AssertionError):promote.baseline_manifest(deployment,{'/other.html':'hash'},registry)
            altered={'id':'reviewed-id','deployment_trigger':{'metadata':{'commit_hash':'c'*40}}}
            with self.assertRaises(AssertionError):promote.baseline_manifest(altered,{'/index.html':'cloud-hash'},registry)
    def test_unknown_provenance_uses_its_own_commit_without_a_fallback(self):
        deployment={'id':'unknown-id','deployment_trigger':{'metadata':{'commit_hash':'c'*40}}}
        with patch.object(promote.subprocess,'run') as fetch,patch.object(promote.subprocess,'check_output',return_value=b'{"index.html":"abc"}'):
            _,source=promote.baseline_manifest(deployment,{'/index.html':'hash'},{})
            self.assertEqual(source,'c'*40);self.assertEqual(fetch.call_args.args[0],['git','fetch','origin','c'*40])
    def test_html_verification_rejects_other_changes_and_duplicate_analytics(self):
        raw=b'<html>original</html>'
        beacon=b'<!-- Cloudflare Pages Analytics --><script src="https://static.cloudflareinsights.com/beacon.min.js"></script><!-- Cloudflare Pages Analytics -->'
        expected={'parlay/index.html':promote.sha(raw)}
        for changed in [raw+b'<script>unexpected</script>'+beacon,raw+beacon+beacon]:
            with patch.object(promote,'fetch_bytes',return_value=changed):
                self.assertEqual(promote.verify_files('https://example.invalid/',expected),['parlay/index.html'])
if __name__=='__main__':unittest.main()
