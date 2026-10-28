import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!siteDir) throw new Error('Usage: node integrate-command-center.mjs <staged-site-directory>');
const trackerSource = path.join(repoRoot, 'sanks-tracker.js');
const trackerTarget = path.join(siteDir, 'sanks-tracker.js');
const htmlPath = path.join(siteDir, 'index.html');
let html = await readFile(htmlPath, 'utf8');
const css = '<style id="sanks-admin-link-style">.admin-link{display:inline-flex;align-items:center;justify-content:center;align-self:center;width:max-content;padding:7px 11px;border:1px solid #658784;border-radius:4px;color:#c5d3d1;text-decoration:none;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.14em;white-space:nowrap;opacity:.88;transition:color .15s,border-color .15s,background .15s}.admin-link:hover,.admin-link:focus-visible{color:#fff;border-color:#b7d9d2;background:#16393b;opacity:1}.admin-link:focus-visible{outline:2px solid #b7d9d2;outline-offset:2}@media(max-width:500px){.hero-controls .admin-link{align-self:flex-start}}</style>';
const admin = '<a class="admin-link" href="https://sanks-command-center-production.pages.dev/admin" target="_blank" rel="noopener noreferrer" aria-label="Open Command Center in a new tab">ADMIN</a>';
if (!html.includes('id="sanks-admin-link-style"')) {
  if (!html.includes('</head>')) throw new Error('Could not find </head> to add ADMIN styles');
  html = html.replace('</head>', css + '</head>');
}
if (!/class=["'][^"']*\badmin-link\b/.test(html)) {
  const status = /(<span\s+id=["']status["'][^>]*>[\s\S]*?<\/span>)/;
  if (!status.test(html)) throw new Error('Could not find the existing header status element');
  html = html.replace(status, `$1${admin}`);
} else {
  html = html.replace(/<a\b(?=[^>]*class=["'][^"']*\badmin-link\b)[^>]*>[\s\S]*?<\/a>/, admin);
}
html = html.replace(/<script>\s*window\.SANKS_ANALYTICS_ENDPOINT\s*=\s*["'][^"']*["'];?\s*<\/script>/g, '');
html = html.replace(/<script\s+defer\s+src=["']\/sanks-tracker\.js["']\s*><\/script>/g, '');
if (!html.includes('</body>')) throw new Error('Could not find </body> to add tracker loader');
html = html.replace('</body>', '<script>window.SANKS_ANALYTICS_ENDPOINT="https://sanks-command-center-production.pages.dev/api/collect";</script><script defer src="/sanks-tracker.js"></script></body>');
await copyFile(trackerSource, trackerTarget);
await writeFile(htmlPath, html, 'utf8');
console.log('Command Center integration applied to', siteDir);

