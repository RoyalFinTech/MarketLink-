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
const htmlCss = html.match(/<link\b[^>]*href=["']([^"']*premium-marketlink\.css[^"']*)["'][^>]*>/i);
const shellCss = serviceWorker.match(/["'](\.\/premium-marketlink\.css\?[^"']+)["']/i);
assert.ok(htmlJs && shellJs, 'Homepage and service worker must both reference premium-marketlink.js');
assert.equal(htmlJs[1], shellJs[1], 'Service worker must cache the exact premium JS URL used by the homepage');
assert.ok(htmlCss && shellCss, 'Homepage and service worker must both reference premium-marketlink.css');
assert.equal(htmlCss[1], shellCss[1], 'Service worker must cache the exact premium CSS URL used by the homepage');
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
assert.match(html, /window\.ML_Premium&&typeof window\.ML_Premium\.load==='function'/, 'goApp must explicitly invoke the premium home renderer');
assert.match(html, /Opening your premium marketplace/, 'goApp must show the premium loading state immediately');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /async function loadLiveHome\(\)[\s\S]*?renderPremiumHome\(\);[\s\S]*?var dataRequest=Promise\.all/, 'Premium home must paint before background API enrichment begins');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /load:loadLiveHome/, 'Premium module must expose the startup entry point used by session restoration');
assert.match(html, /window\.__ML_START_PREMIUM_HOME=startPendingPremiumHome/, 'Session restoration must have a direct premium startup bridge');
assert.match(html, /legacy homepage renderer is intentionally/, 'Legacy home must not render over the premium home');
assert.doesNotMatch(html, /setTimeout\(function\(\)\{goApp\(\);toast\('Welcome,.*?\},(?:300|1000)\);/, 'Successful new-account creation must not wait on arbitrary post-auth timers');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /Do not call or depend on the retired legacy homepage/, 'Premium bundle reconciliation must not depend on legacy renderer');
assert.match(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), /Promise\.all\(APP_SHELL\.filter/, 'PWA installation must tolerate optional asset failures');
assert.match(html, /legacy homepage renderer is intentionally/, 'The legacy homepage must remain a compatibility bridge and never render over the premium home');
assert.doesNotMatch(html, /else\{renderHome\(\);\}/, 'Legacy homepage fallback must be removed');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /reconcilePremiumHomeAfterBundleLoad/, 'Deferred premium bundle must reconcile sessions restored before it loaded');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /!ML_API\|\|!ML_API\.auth/, 'Premium reconciliation must not depend on ML_API initialization order');
assert.match(html, /navigator\.serviceWorker\.register\([^;]*updateViaCache:'none'/, 'PWA registration must bypass stale HTTP-cached service-worker scripts');
assert.match(html, /reg\.update\(\)/, 'PWA must check for the latest service-worker shell on app launch');
assert.ok(html.includes("host==='royalfintech.github.io'") && html.includes("path.indexOf('/MarketLink-/')===0"), 'Legacy Pages entry must be redirected');
assert.ok(html.includes("location.replace('https://marketlink-gambia-frontend.onrender.com/"), 'Legacy Pages must redirect to canonical premium app');
assert.doesNotMatch(html, /Modem Pay|Royal Wallet/i, 'Customer-facing HTML must use private payment branding and DAHA Wallet');
assert.match(html, /premium-canonical-r14/, 'Production shell version marker must be current');
assert.match(html, /marketlink-premium-canonical-r55/, 'Premium JS URL must be revised');
assert.match(html, /marketlink-premium-canonical-r36/, 'Premium CSS URL must be revised');
assert.match(serviceWorker, /marketlink-shell-v62/, 'PWA cache must be bumped');

const premiumJs = fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8');
assert.ok(premiumJs.includes("if(label==='DAHA Wallet')return 'wallet';"), 'DAHA Wallet must route through the backend wallet payment method');
assert.match(premiumJs, /var options=\[\['Cash on Delivery','cod'\],\['DAHA Wallet','wallet'\]\]/, 'Cash on Delivery and DAHA Wallet must always remain available independently of external payment credentials');
assert.match(premiumJs, /capabilities&&capabilities\.directMobileMoney\)options\.push\(\['Wave','wave'\],\['AfriMoney','afrimoney'\],\['QMoney','qmoney'\]\)/, 'Direct mobile-money methods must only appear when the backend explicitly enables them');
assert.ok(premiumJs.includes('startRiderAvailabilityLocationSharing'), 'Rider online mode must support opt-in nearby availability location');
assert.ok(premiumJs.includes('resumeRiderAvailabilityLocationSharing'), 'Rider availability location must resume safely after dashboard refresh');
assert.ok(premiumJs.includes('await ML_API.delivery.decline(String(id))'), 'Rider decline must call the backend and free the delivery assignment');
assert.doesNotMatch(premiumJs, /Delivery decline is not exposed as a separate backend action/, 'Premium rider dashboard must not show a disabled decline placeholder');
assert.ok(premiumJs.includes('Powered by Royal FinTech'), 'DAHA Wallet must show Royal FinTech branding');
assert.ok(premiumJs.includes('confirmCodPayment'), 'Admin dashboard must expose COD reconciliation controls');
assert.ok(premiumJs.includes('pendingCod'), 'Admin dashboard must load the protected COD reconciliation queue');
assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes("pendingCod: function(qs)"), 'Frontend payment API must expose the COD admin queue client');
assert.doesNotMatch(premiumJs, /Modem Pay/i, 'Internal payment gateway name must not appear in customer-facing frontend');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /installPremiumPullToRefresh/, 'Pull-to-refresh handler is missing');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /ml-home-refresh/, 'Premium desktop refresh control is missing');
assert.ok(premiumJs.includes('refreshCurrentView'), 'A shared refresh dispatcher must refresh the active app view');
assert.ok(html.includes("var roleLanding=(preferredRole&&marketLinkRoles.indexOf(preferredRole)>-1)?preferredRole:null;"), 'Sign-in must default to premium home unless a role dashboard was explicitly selected');
assert.match(html, /ml-vendor-dashboard/, 'Vendor dashboard must use the premium responsive shell');
assert.match(html, /ml-rider-dashboard/, 'Rider dashboard must use the premium responsive shell');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /MarketLink premium role dashboards/, 'Premium role dashboard styling must be present');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /@media\(min-width:821px\)\{\s*#app\{width:100%!important;max-width:none!important/, 'Desktop app must not remain trapped in the legacy 430px mobile frame');
assert.doesNotMatch(html, /marketLinkRoles\.indexOf\('vendor'\)>-1\?'vendor':marketLinkRoles\.indexOf\('rider'\)>-1\?'rider'/, 'Role claims must not silently redirect users into legacy role dashboards');
assert.match(fs.readFileSync(path.join(root, 'MarketLink (7).html'), 'utf8'), /ml_release=20261106-premium-r34/, 'Legacy HTML shortcut must force the current canonical app release');
assert.match(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), /marketlink-shell-v62/, 'PWA shell cache must be invalidated for the current release');
assert.match(premiumJs, /id='ml-global-refresh'/, 'Desktop app-wide refresh control is missing');
assert.ok(premiumJs.includes("if(tab==='vendordash')") && premiumJs.includes('return loadVendorLiveData()'), 'Vendor refresh must reload backend data');
assert.ok(premiumJs.includes("if(tab==='riderdash')") && premiumJs.includes('return loadRiderLiveData()'), 'Rider refresh must reload backend data');
assert.ok(premiumJs.includes("apiOk()&&S.vSubTab==='wallet'") && premiumJs.includes("apiOk()&&S.rSubTab==='wallet'"), 'Vendor and rider wallet tabs must route to the shared DAHA ledger');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /\.ml-global-refresh/, 'Desktop global refresh styling is missing');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /font-family:inherit;font-size:13px;font-weight:600;line-height:1\.4/, 'DAHA wallet inputs must use explicit readable typography');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /font:600 13px inherit/, 'Invalid DAHA wallet font shorthand must be removed');
assert.match(html, /ml_onboarding_seen_v1/, 'Onboarding completion must persist');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.css'), 'utf8'), /#scr-onboard\.ml-onboard-screen\{background:#fff!important\}/, 'Onboarding white theme override is missing');
console.log('MarketLink frontend checks passed: external JS, ' + inlineCount + ' inline scripts, synchronized PWA cache, manifest/icons, 1200 × 630 social image, returning PIN route and white first-run theme.');

assert.match(html, /marketlink:premium-ready/, 'App startup must wait for the deferred premium bundle ready event');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /dispatchEvent\(new Event\('marketlink:premium-ready'\)\)/, 'Premium bundle must signal readiness after initialization');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /Module initialization failed before API registration/, 'Premium bundle must surface early initialization exceptions');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /marketlink:premium-error/, 'Premium startup exceptions must emit a diagnostic event');

assert.match(html, /function retryPremiumBundle\(\)[\s\S]*?ml_retry=/, 'Premium startup must force a fresh bundle request when the entry point is missing');
assert.match(html, /var bootDetail=window\.__ML_PREMIUM_BOOT_ERROR\|\|window\.__ML_PREMIUM_SCRIPT_ERROR/, 'Premium retry diagnostic must include captured script execution errors');
assert.match(html, /Release: premium-r55 · Cache: shell-v62/, 'Premium startup diagnostic must identify the deployed release and cache versions');
assert.match(serviceWorker, /isPremiumExecutable[\s\S]*?fetch\(request\)/, 'Premium JavaScript must use network-first delivery to prevent stale bundle cache from masking releases');

assert.match(html, /function marketlinkUploadChoice\(/, 'Vendor and rider onboarding must use the shared device/camera upload control');
assert.match(html, /Choose from device/, 'Onboarding must expose a device file picker');
assert.match(html, /Take photo/, 'Onboarding must expose a camera option');
assert.match(html, /marketlinkUploadChoice\('va-shop-file','photoFile'/, 'Vendor shop logo must offer device and camera selection');
assert.match(html, /marketlinkUploadChoice\('ra-profile-input','profilePhotoFile'/, 'Rider profile photo must offer device and camera selection');
assert.match(html, /var cameraId=id\+'-camera'/, 'Camera capture must be a separate input, not a restriction on the device picker');

assert.match(html, /accept="image\/jpeg,image\/png" capture=/, 'Camera capture must use formats accepted by identity and profile-photo validators');

assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /Cash deposit queue unavailable/, 'Admin must distinguish cash-deposit API errors from an empty queue');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /COD payment queue unavailable/, 'Admin must distinguish COD payment API errors from an empty queue');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /View rider receipt/, 'Admin financial reconciliation must expose the protected rider receipt');
assert.match(fs.readFileSync(path.join(root, 'premium-marketlink.js'), 'utf8'), /Verify deposit/, 'Admin financial reconciliation must expose deposit verification');
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /codRemittanceNote/, 'Rider delivery history must receive the Admin remittance review note');
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /Previous deposit rejected/, 'Riders must see why a cash deposit was rejected before resubmitting');
assert.match(fs.readFileSync(path.join(root, 'admin-entry.js'), 'utf8'), /__ML_ADMIN_START_CHAT/, 'CRM must expose a direct chat action for customer, vendor and rider accounts');
assert.match(fs.readFileSync(path.join(root, 'admin-entry.js'), 'utf8'), /Start direct chat/, 'CRM profile must provide an obvious direct chat control');
assert.ok(fs.readFileSync(path.join(root, 'admin-entry.js'), 'utf8').includes("replace(/\\D/g, '')"), 'Admin phone normalization must strip non-digits before validating the selected network number');
assert.ok(!fs.readFileSync(path.join(root, 'admin-entry.js'), 'utf8').includes(String.raw`replace(/\\D/g, '')`), 'Admin phone selector must not use an escaped literal-backslash regex');
assert.match(html, /id="va-phone" maxlength="9"/, 'Vendor contact input must accept the full nine-digit Gambian number');
assert.match(html, /id="ra-phone" maxlength="9"/, 'Rider contact input must accept the full nine-digit Gambian number');
assert.match(html, /Gamcel is still using its existing 7-digit number/, 'Phone selector must distinguish Gamcel Phase 1 from migrated nine-digit networks');
assert.match(premiumJs, /gamcelLegacy\?\!\/\^\\d\{7\}\$\//, 'Admin login must preserve current Gamcel Phase 1 seven-digit compatibility');
assert.match(html, /slice\(0,9\)/, 'Rider/vendor onboarding must preserve all nine national digits');
assert.match(html, /whatsappNumber:f\.whatsappNumber\|\|null/, 'Vendor application must persist the supplied WhatsApp contact');
assert.match(html, /mobileNumber:f\.whatsappNumber\|\|null/, 'Rider application must persist the supplied nine-digit mobile contact');
assert.match(premiumJs, /ml-daha-deposit-number[\s\S]*?maxlength="7"/, 'DAHA mobile-money deposit must collect seven subscriber digits after a selected network prefix');
assert.match(premiumJs, /id="ml-daha-deposit-prefix"[\s\S]*?Africell \(87\)[\s\S]*?QCell \(83\)[\s\S]*?Comium \(86\)/, 'DAHA deposits must provide the supported Gambian mobile network prefixes');
assert.match(premiumJs, /depositPrefix\+depositDigits/, 'DAHA deposits must compose the full national number before calling the backend');
assert.match(premiumJs, /id="ml-daha-payout-number"[\s\S]*?maxlength="7"/, 'Saved vendor/rider payout profiles must collect seven subscriber digits');
assert.match(premiumJs, /id="ml-daha-withdraw-number"[\s\S]*?maxlength="7"/, 'Withdrawal requests must collect seven subscriber digits');
assert.match(premiumJs, /payoutPrefix\+payoutDigits/, 'Saved payout profiles must compose the full nine-digit national number');
assert.match(premiumJs, /prefix\+subscriber/, 'Withdrawal requests must compose the full nine-digit national number');
assert.match(premiumJs, /id="ml-checkout-mobile-prefix"[\s\S]*?Africell \(87\)[\s\S]*?QCell \(83\)[\s\S]*?Comium \(86\)/, 'Direct customer checkout must offer the supported Gambian network prefixes');
assert.match(premiumJs, /id="ml-checkout-mobile-number"[\s\S]*?maxlength="7"/, 'Direct customer checkout must collect seven subscriber digits after the selected prefix');
assert.match(premiumJs, /accountNumber=checkoutPrefix\+checkoutSubscriber/, 'Direct customer checkout must compose the complete nine-digit national number before payment');
assert.match(premiumJs, /\^\(87\|86\|83\)\\d\{7\}\$/, 'DAHA mobile-money input must validate its two-digit network prefix plus seven digits');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/wallets/service.js'), 'utf8'), /nationalAccountNumber\.slice\(2\)/, 'Backend must send the seven subscriber digits to Modem Pay only after validating the full nine-digit national number');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/wallets/routes.js'), 'utf8'), /matches\(\/\^\(87\|86\|83\)\\d\{7\}\$\/\)/, 'Wallet API must validate full nine-digit Gambian mobile numbers');


assert.match(html, /maxlength="9"[^>]*id="lphone"/, 'Customer login must accept the full nine-digit Gambian national number');
assert.match(html, /maxlength="9"[^>]*id="rphone"/, 'New customer registration must accept nine national digits');
assert.match(html, /Enter the full 9-digit Gambian mobile number/, 'Customer registration must reject legacy seven-digit numbers');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/auth/service.js'), 'utf8'), /canonicalRegistrationPhone/, 'Backend must enforce nine-digit Gambian numbers for new registrations');

assert.match(premiumJs, /function flattenMarketLinkCategoryTree/, 'Customer category rendering must flatten the live parent/child category tree');
assert.match(premiumJs, /flattenMarketLinkCategoryTree\(liveCategories\)/, 'Home and category browsing must expose nested live categories');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/products/service.js'), 'utf8'), /WITH RECURSIVE category_branch/, 'Selecting a parent category must include products in its active child categories');
assert.match(html, /marketlinkLoadVendorCategories/, 'Vendor onboarding must load categories from the live MarketLink category service');
assert.match(html, /dataset\.loaded!==\x271\x27/, 'Vendor onboarding must wait for the live category list instead of submitting stale hard-coded options');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/vendors/service.js'), 'utf8'), /normalizeGambianContact\(whatsappNumber/, 'Vendor backend must validate the independently supplied WhatsApp contact number');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/riders/service.js'), 'utf8'), /normalizeGambianContact\(whatsappNumber/, 'Rider backend must validate the independently supplied WhatsApp contact number');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/uploads/service.js'), 'utf8'), /PROFILE_IMAGE_MIN_DIMENSION = 512/, 'Backend profile photo validation must preserve the minimum image dimensions');
assert.match(premiumJs, /id="ml-daha-withdraw-number"/, 'Withdrawal must retain a manually entered payout destination independent of account sign-in phone');
assert.match(premiumJs, /Cancel order/, 'Customers must see the cancellation action for eligible pending or accepted orders');
assert.match(premiumJs, /ML_API\.orders\.cancel\(id,'Cancelled by customer\.'/,'Customer cancellation must call the authenticated order API');

assert.match(premiumJs, /pendingForThisOrder/, 'Checkout failures must preserve orders with a real pending payment attempt');
assert.match(premiumJs, /Payment could not be completed; order cancelled and stock released/, 'Failed checkout attempts must cancel the unconfirmed order to release inventory');

assert.match(premiumJs, /payment_attempt_pending/, 'Order tracking must respect pending mobile-money attempts before showing cancellation');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/orders/service.js'), 'utf8'), /PAYMENT_ATTEMPT_PENDING/, 'Backend must block cancellation while a mobile-money payment is pending');

assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/products/routes.js'), 'utf8'), /router\.get\('\/mine', authenticate, authorize\('vendor'\), ctrl\.listMine\)/, 'Vendor-only product list must require an authenticated vendor role');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/products/controller.js'), 'utf8'), /includeAllStatuses:true, vendorId:req\.user\.id/, 'Vendor product list must scope unpublished listings to the authenticated owner');
assert.match(fs.readFileSync(path.join(root, '..', 'frontend/index.html'), 'utf8'), /ML_API\.products\.mine\(\{page:1,limit:100,sort:'newest'\}\)/, 'Vendor dashboard must load its own pending and published products');
assert.match(fs.readFileSync(path.join(root, '..', 'backend/src/modules/products/service.js'), 'utf8'), /p\.status,p\.rating_avg/, 'Product list must return publication status for the vendor dashboard');

const authService = fs.readFileSync(path.join(root, '..', 'backend/src/modules/auth/service.js'), 'utf8');
assert.match(authService, /const types=\['customer'\]/, 'Public registration must always create a customer role only; vendor/rider roles come from their application workflows');
assert.doesNotMatch(authService, /Array\.isArray\(userType\).*userType/, 'Client-supplied userType must never grant privileged roles during public registration');
assert.match(premiumJs, /openstreetmap\.org\/export\/embed\.html/, 'Customer order tracking must render an in-page live rider map when a fresh GPS ping exists');
assert.match(premiumJs, /title="Live rider location map"/, 'Live rider map must have an accessible title');

const productService = fs.readFileSync(path.join(root, '..', 'backend/src/modules/products/service.js'), 'utf8');
assert.match(productService, /conds = includeAllStatuses \? \[\] : \["p\.status='active'", "v\.kyc_status='approved'"\]/, 'Public product catalog must exclude products from vendors awaiting approval');
assert.match(productService, /WHERE p\.id=\$1 AND p\.status='active' AND v\.kyc_status='approved'/, 'Public product detail lookup must exclude products from vendors awaiting approval');
assert.match(productService, /SELECT count\(\*\) FROM products p LEFT JOIN vendors v ON v\.user_id=p\.vendor_id/, 'Product count query must join vendors when applying approved-vendor visibility filters');
const orderService = fs.readFileSync(path.join(root, '..', 'backend/src/modules/orders/service.js'), 'utf8');
assert.match(orderService, /JOIN vendors v ON v\.user_id=p\.vendor_id WHERE p\.id=\$1 FOR UPDATE OF p/, 'Checkout must lock the product row while checking vendor approval');
assert.match(orderService, /p\.vendor_kyc_status!=='approved'/, 'Checkout must reject products from unapproved vendors even if a client knows the product ID');

const paymentUi = premiumJs;
assert.match(paymentUi, /\['Cash on Delivery','cod'\]/, 'Checkout must offer Cash on Delivery');
assert.match(paymentUi, /\['DAHA Wallet','wallet'\]/, 'Checkout must offer DAHA Wallet');
assert.match(paymentUi, /window\.ML_Premium\.selectPayment/, 'Payment method choices must call the exported click handler');
assert.match(paymentUi, /selectPayment:selectPayment/, 'Payment method click handler must be exported to the checkout UI');
assert.match(paymentUi, /placeOrder:placeLiveOrder/, 'Checkout submit button must call the authenticated live order flow');
assert.match(paymentUi, /action!=='wallet_paid'/, 'DAHA Wallet checkout must require explicit confirmed wallet-payment response');
assert.match(paymentUi, /action:'cod_pending'/, 'Cash on Delivery must create a pending payment rather than mark cash as received');

const paymentApi = fs.readFileSync(path.join(root, '..', 'frontend/index.html'), 'utf8');
assert.match(paymentApi, /methods: function\(\)\{ return get\('\/payments\/methods'\); \}/, 'Checkout must load enabled payment capabilities from the backend');
assert.match(paymentApi, /initiate: function\(orderId, method, amount, accountNumber\)\{ return post\('\/payments\/initiate'/, 'Checkout must route payment initiation to the authenticated backend endpoint');
const paymentRoutes = fs.readFileSync(path.join(root, '..', 'backend/src/modules/payments/routes.js'), 'utf8');
assert.match(paymentRoutes, /router\.post\('\/initiate', authenticate, authorize\('customer'\)/, 'Payment initiation must require an authenticated customer');
const paymentService = fs.readFileSync(path.join(root, '..', 'backend/src/modules/payments/service.js'), 'utf8');
assert.equal((paymentService.match(/PAYMENT_METHOD_MISMATCH/g) || []).length, 2, 'Both DAHA Wallet and Cash on Delivery must match the payment method saved on the order');
assert.match(paymentService, /SELECT id,customer_id,total,payment_status,payment_method FROM orders WHERE id=\$1 AND customer_id=\$2 FOR UPDATE/, 'DAHA Wallet must lock and verify the customer-owned order and saved payment method');
assert.match(paymentService, /SELECT id, customer_id, total, payment_status, payment_method FROM orders WHERE id=\$1 AND customer_id=\$2 FOR UPDATE/, 'COD must lock and verify the customer-owned order and saved payment method');
const paymentTests = fs.readFileSync(path.join(root, '..', 'backend/src/modules/payments/service.test.js'), 'utf8');
assert.match(paymentTests, /DAHA Wallet checkout debits the authenticated customer wallet and confirms payment atomically/, 'Payment tests must cover a successful DAHA Wallet checkout');
assert.match(paymentTests, /DAHA Wallet refuses checkout when available balance is insufficient/, 'Payment tests must cover insufficient DAHA Wallet funds');
assert.match(paymentTests, /rejects DAHA Wallet payment when the saved order selected Cash on Delivery/, 'Payment tests must block switching COD orders to DAHA Wallet');
assert.match(paymentTests, /rejects Cash on Delivery initiation when the saved order selected DAHA Wallet/, 'Payment tests must block switching DAHA Wallet orders to COD');
