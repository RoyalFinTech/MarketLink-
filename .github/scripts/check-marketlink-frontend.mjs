import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve('frontend');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
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

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length >= 24, 'PNG is too small: ' + filePath);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Invalid PNG signature: ' + filePath);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes) {
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone', 'PWA must use standalone display mode');
assert.equal(manifest.background_color, '#FFFFFF', 'PWA launch background must be white');
assert.ok(manifest.icons.length >= 1, 'PWA must declare at least one icon');
for (const icon of manifest.icons) {
  const iconPath = path.resolve(root, icon.src);
  assert.ok(fs.existsSync(iconPath), 'Missing PWA icon: ' + icon.src);
  if (icon.type === 'image/png') {
    const actual = pngDimensions(iconPath);
    const expected = String(icon.sizes || '').match(/^(\d+)x(\d+)$/);
    assert.ok(expected, 'PNG icon must declare explicit dimensions: ' + icon.src);
    assert.equal(actual.width, Number(expected[1]), 'Wrong PNG icon width: ' + icon.src);
    assert.equal(actual.height, Number(expected[2]), 'Wrong PNG icon height: ' + icon.src);
  }
}

const htmlJs = html.match(/<script\b[^>]*\bsrc=["']([^"']*premium-marketlink\.js[^"']*)["'][^>]*>/i);
const shellJs = serviceWorker.match(/["'](\.\/premium-marketlink\.js\?[^"']+)["']/i);
assert.ok(htmlJs && shellJs, 'Homepage and service worker must both reference premium-marketlink.js');
assert.equal(htmlJs[1], shellJs[1], 'Service worker must cache the exact premium JS URL used by the homepage');
assert.match(serviceWorker, /CACHE_NAME\s*=\s*['"]marketlink-shell-v\d+['"]/, 'Service worker shell cache must be versioned');

const ogPreviewPath = path.join(root, 'assets', 'marketlink-og-preview.jpg');
assert.ok(fs.existsSync(ogPreviewPath), 'MarketLink WhatsApp/Open Graph preview image is missing');
const ogDimensions = jpegDimensions(fs.readFileSync(ogPreviewPath));
assert.deepEqual(ogDimensions, { width: 1200, height: 630 }, 'Open Graph preview must be exactly 1200 × 630 pixels');
assert.match(html, /property=["']og:image["']/, 'Open Graph image metadata is missing');
assert.match(html, /property=["']og:image:width["']\s+content=["']1200["']/, 'Open Graph image width metadata is missing');
assert.match(html, /property=["']og:image:height["']\s+content=["']630["']/, 'Open Graph image height metadata is missing');
const expectedOgUrl = 'https://marketlink-gambia-frontend.onrender.com/assets/marketlink-og-preview.jpg?v=20261104-r3';
assert.ok(html.includes('property="og:image" content="' + expectedOgUrl + '"'), 'Open Graph image URL must be current');
assert.ok(html.includes('property="og:image:secure_url" content="' + expectedOgUrl + '"'), 'Secure Open Graph image URL must match');
assert.ok(html.includes('name="twitter:image" content="' + expectedOgUrl + '"'), 'Twitter image URL must match');
assert.ok(fs.existsSync(path.join(root, 'assets', 'marketlink-logo.png')), 'Official MarketLink logo is missing');
assert.ok(fs.existsSync(path.join(root, 'assets', 'daha-wallet-eagle.webp')), 'Official DAHA eagle asset is missing');
assert.ok(fs.existsSync(path.join(root, 'assets', 'apple-touch-icon-180.png')), 'Apple touch icon is missing');

assert.match(html, /rel=["']manifest["'][^>]*manifest\.webmanifest/i, 'HTML must link the PWA manifest');
assert.match(html, /id=["']scr-returning["']/, 'Returning-user PIN screen is missing');
assert.match(html, /navigator\.serviceWorker\.register/, 'Service worker registration is missing');
assert.match(html, /ml_onboarding_seen_v1/, 'Onboarding completion must persist');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /#scr-onboard\.ml-onboard-screen\{background:#fff!important\}/, 'Onboarding white theme override is missing');
console.log('MarketLink frontend checks passed: external JS, ' + inlineCount + ' inline scripts, synchronized PWA cache, manifest/icons, 1200 × 630 social image, returning PIN route and white first-run theme.');
