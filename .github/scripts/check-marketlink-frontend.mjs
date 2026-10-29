import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve('frontend');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const parseJs = (source, label) => {
  try { new vm.Script(source, { filename: label }); }
  catch (error) { throw new Error(label + ': ' + error.message); }
};

for (const file of ['premium-marketlink.js', 'marketlink-i18n.js', 'service-worker.js']) {
  parseJs(fs.readFileSync(path.join(root, file), 'utf8'), file);
}

let inlineCount = 0;
const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
for (const match of html.matchAll(scriptTag)) {
  const attrs = match[1] || '';
  const source = match[2] || '';
  if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["'](?:application\/(?:ld\+json|json))["']/i.test(attrs) || !source.trim()) continue;
  parseJs(source, 'index.html inline script #' + (++inlineCount));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone', 'PWA must use standalone display mode');
assert.equal(manifest.background_color, '#FFFFFF', 'PWA launch background must be white');
assert.ok(manifest.icons.length >= 1, 'PWA must declare at least one icon');
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.resolve(root, icon.src)), 'Missing PWA icon: ' + icon.src);
}
assert.match(html, /rel=["']manifest["'][^>]*manifest\.webmanifest/i, 'HTML must link the PWA manifest');
assert.match(html, /id=["']scr-returning["']/, 'Returning-user PIN screen is missing');
assert.match(html, /navigator\.serviceWorker\.register/, 'Service worker registration is missing');
assert.match(html, /ml_onboarding_seen_v1/, 'Onboarding completion must persist');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /#scr-onboard\.ml-onboard-screen\{background:#fff!important\}/, 'Onboarding white theme override is missing');
console.log('MarketLink frontend checks passed: external JS, ' + inlineCount + ' inline scripts, PWA manifest/icons, returning PIN route and white first-run theme.');
