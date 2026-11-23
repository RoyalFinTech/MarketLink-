/* MarketLink Admin-only entry point.
   Injected only by the separate Render Admin site's build.
   Keep all presentation and routing changes isolated from the customer app. */
(function () {
  'use strict';

  window.__ML_ADMIN_PORTAL_MODE = true;

  // The shared shell contains the normal MarketLink splash. On the
  // dedicated Admin host it is allowed to complete once; index.html then
  // routes directly to the Admin login instead of customer onboarding.
  // Remove stale PWA control/caches without forcing a second page reload.
  (function clearCustomerPwaCacheFromAdminOrigin() {
    if (!('serviceWorker' in navigator)) return;
    Promise.all([
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
      }).catch(function () {}),
      ('caches' in window ? caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }) : Promise.resolve())
    ]).catch(function (error) {
      if (window.console && console.warn) console.warn('[MarketLink Admin] PWA cleanup skipped:', error);
    });
  })();

  // The shared Admin dashboard references AdminSession, but the production
  // bundle does not define it. Keep this lightweight identity marker local to
  // the dedicated Admin deployment; authentication remains in ML_API/backend.
  if (!window.AdminSession) {
    window.AdminSession = {
      staffId: null,
      active: false,
      startedAt: null,
      start: function (staffId) {
        this.staffId = String(staffId || 'Admin');
        this.active = true;
        this.startedAt = Date.now();
      },
      end: function () {
        this.staffId = null;
        this.active = false;
        this.startedAt = null;
      }
    };
  }

  var style = document.createElement('style');
  style.id = 'ml-admin-isolation-style';
  style.textContent = [
    '#scr-onboard,#scr-auth,#scr-returning{display:none!important;visibility:hidden!important;pointer-events:none!important}',
    '#scr-admin-login,#scr-app{visibility:visible}',
    '#scr-admin-login.active{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;min-height:100dvh!important}',
    'html:has(#scr-admin-login.active),body:has(#scr-admin-login.active){height:auto!important;min-height:100%!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important}',
    '#scr-admin-login.active{height:auto!important;max-height:none!important;overflow:visible!important;touch-action:pan-y!important;padding-bottom:calc(32px + env(safe-area-inset-bottom))!important}',
    /* Keep the login page scrollable even while its authentication request is pending. */
    'html:has(#scr-admin-login.active),body:has(#scr-admin-login.active),body:has(#scr-admin-login.active) #app{height:auto!important;min-height:100%!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important;touch-action:pan-y!important}',
    'body:has(#scr-admin-login.active) #scr-admin-login,body:has(#scr-admin-login.active) #scr-admin-login *{touch-action:pan-y!important}',
    '#scr-admin-login.active #admin-auth-err{position:relative!important;z-index:1!important;max-height:none!important;overflow:visible!important;white-space:normal!important}',
    '#scr-admin-login.active #admin-auth-err{display:block;min-height:0;max-width:100%;overflow-wrap:anywhere}',
    '#scr-admin-login.active #admin-lbtn[aria-busy=true]{opacity:1!important;filter:none!important;cursor:progress!important;min-height:54px!important}',
    '#scr-admin-login.active #admin-lbtn:disabled{opacity:1!important;-webkit-text-fill-color:#fff!important;color:#fff!important;background:#173d52!important}',

    '#scr-admin-login.active~#ml-live-promo-ticker,#ml-live-promo-ticker,#ml-install-prompt{display:none!important}',
    /* Admin portal: light by default, and follows the device appearance in dark mode. */
    '#scr-admin-login{background:#f4f7fb!important;color:#152536!important;overflow-y:auto!important;height:auto!important;min-height:100%!important;padding-bottom:28px!important;color-scheme:light}',
    '#scr-admin-login .ml-admin-hero{position:relative;overflow:hidden;padding:34px 22px 28px;text-align:center;background:linear-gradient(145deg,#ffffff 0%,#eaf2f8 62%,#fff7e6 100%);border-bottom:1px solid rgba(16,48,68,.12)}',
    '#scr-admin-login .ml-admin-brandmark{position:relative;width:112px;height:90px;margin:0 auto 13px;display:flex;align-items:center;justify-content:center}',
    '#scr-admin-login .ml-admin-brandmark img{display:block;width:104px;height:84px;object-fit:contain;filter:drop-shadow(0 7px 12px rgba(16,48,68,.13))}',
    '#scr-admin-login .ml-admin-shield{position:absolute;right:-3px;bottom:0;width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:#fff;border:1px solid rgba(18,111,116,.28);box-shadow:0 3px 12px rgba(16,48,68,.13);font-size:18px}',
    '#scr-admin-login .ml-admin-title{margin:0;color:#102d40;font-size:23px;line-height:1.2;font-weight:850;letter-spacing:-.035em}',
    '#scr-admin-login .ml-admin-subtitle{margin:8px auto 0;max-width:320px;color:#526779;font-size:13px;line-height:1.55}',
    '#scr-admin-login .ml-admin-card{width:min(100% - 32px,460px);margin:24px auto 0;padding:22px 19px 20px;background:#fff;border:1px solid #dce5ec;border-radius:20px;box-shadow:0 12px 35px rgba(20,47,68,.08)}',
    '#scr-admin-login .ml-admin-kicker{margin:0 0 17px;color:#176b70;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}',
    '#scr-admin-login .ml-admin-label{display:block;margin:0 0 7px;color:#344b5d;font-size:12px;font-weight:750}',
    '#scr-admin-login #ml-admin-phone-slot{min-height:54px;margin-bottom:17px;border:1px solid #cbd8e2;border-radius:13px;overflow:hidden;background:#fff}',
    '#scr-admin-login .ml-admin-phone{display:grid;grid-template-columns:auto minmax(0,1fr);min-height:54px;background:#fff}',
    '#scr-admin-login .ml-admin-country{display:flex;align-items:center;gap:7px;padding:0 11px;background:#eef4f8;color:#18384d;font-size:13px;font-weight:800;white-space:nowrap}',
    '#scr-admin-login #admin-operator{grid-column:2;grid-row:1;width:100%;min-width:0;height:52px;padding:0 9px;border:0;border-bottom:1px solid #e6edf2;background:#fff;color:#18384d;font-size:12px;font-weight:750}',
    '#scr-admin-login #admin-national{grid-column:1/-1;width:100%;height:48px;box-sizing:border-box;border:0;border-top:1px solid #e6edf2;border-radius:0;background:#fff;color:#142b3d;-webkit-text-fill-color:#142b3d;padding:12px 14px;font-size:16px;letter-spacing:.08em}',
    '#scr-admin-login #admin-national::placeholder{color:#8495a3;-webkit-text-fill-color:#8495a3;opacity:1}',

    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone{margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#fff!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone>span{background:#eef4f8!important;color:#18384d!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone select,#scr-admin-login #ml-admin-phone-slot .ml-gm-phone input{background:#fff!important;color:#18384d!important;-webkit-text-fill-color:#18384d!important;color-scheme:light!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-phone-guidance{display:none!important}',
    '#scr-admin-login #admin-password{display:block;width:100%;box-sizing:border-box;min-height:54px;margin:0 0 18px;padding:13px 15px;border:1px solid #cbd8e2;border-radius:13px;background:#fff;color:#142b3d;-webkit-text-fill-color:#142b3d;font-size:20px;font-weight:750;letter-spacing:.32em;text-align:left;outline:none;color-scheme:light}',
    '#scr-admin-login #admin-password:focus,#scr-admin-login #ml-admin-phone-slot:focus-within{border-color:#d39b2b;box-shadow:0 0 0 3px rgba(211,155,43,.15)}',
    '#scr-admin-login #admin-lbtn{width:100%;min-height:52px;border:0!important;border-radius:13px!important;background:linear-gradient(100deg,#126f74,#0b505a)!important;color:#fff!important;font-size:15px!important;font-weight:800!important;box-shadow:0 8px 18px rgba(18,111,116,.2)}',
    '#scr-admin-login #admin-lbtn:disabled{opacity:.65}',
    '#scr-admin-login .ml-admin-security{display:flex;gap:10px;align-items:flex-start;margin:17px 2px 0;padding:12px 13px;border:1px solid #e7dfc9;border-radius:12px;background:#fffaf0;color:#5b5545;font-size:11px;line-height:1.55}',
    '#scr-admin-login .ml-admin-security strong{display:block;color:#755719;font-size:11px;margin-bottom:2px}',
    '#scr-admin-login #admin-auth-err{margin:0 0 14px!important;border-radius:11px!important;font-size:12px!important}',
    '#scr-admin-login .ml-admin-footer{margin:17px auto 0;text-align:center;color:#718393;font-size:10px;line-height:1.5}',
    '@media(max-width:480px){#scr-admin-login .ml-admin-hero{padding:26px 18px 23px}#scr-admin-login .ml-admin-title{font-size:21px}#scr-admin-login .ml-admin-card{margin-top:18px;padding:19px 15px}}',
    /* Admin-only dashboard viewport: the shared shell's inline overflow:hidden was clipping the live control center. */
    '#scr-app{height:auto!important;min-height:100dvh!important;overflow:visible!important}',
    '#tab-admindash{height:auto!important;min-height:100dvh!important;overflow:visible!important;overscroll-behavior-y:contain!important}',
    '#tab-admindash #adash-body{height:auto!important;min-height:100dvh!important;overflow:visible!important}',
    '#tab-admindash .ml-premium-home{min-height:100dvh!important;overflow:visible!important}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  // The auth controller wraps login data as { success, data: { user, roles/tokens } }.
  // Some shared API-client versions unwrap one level while others return the envelope.
  // Normalize all supported shapes only in this isolated Admin deployment.
  function normalizeAdminAuthResponse() {
    var auth = window.ML_API && window.ML_API.auth;
    if (!auth || typeof auth.login !== 'function' || auth.login.__mlAdminResponseNormalized) return;
    var originalLogin = auth.login;
    var normalizedLogin = async function () {
      var response = await originalLogin.apply(this, arguments);
      var payload = response;
      var user = null;
      for (var depth = 0; depth < 4 && payload && typeof payload === 'object'; depth++) {
        if (payload.user && typeof payload.user === 'object') {
          user = payload.user;
          break;
        }
        if (payload.data && typeof payload.data === 'object') {
          payload = payload.data;
          continue;
        }
        break;
      }
      if (!user && payload && typeof payload === 'object' && Array.isArray(payload.roles)) user = payload;
      if (!user) return response;
      var roles = Array.isArray(user.roles) ? user.roles :
        (payload && Array.isArray(payload.roles) ? payload.roles :
        (response && Array.isArray(response.roles) ? response.roles : []));
      var accessToken = (payload && payload.accessToken) || (response && response.accessToken) || null;
      var refreshToken = (payload && payload.refreshToken) || (response && response.refreshToken) || null;
      return Object.assign({}, user, { roles: roles, accessToken: accessToken, refreshToken: refreshToken });
    };
    normalizedLogin.__mlAdminResponseNormalized = true;
    auth.login = normalizedLogin;
  }

  function buildAdminLogin() {
    var screen = document.getElementById('scr-admin-login');
    if (!screen) return;
    var complete = screen.querySelector('#admin-password') && screen.querySelector('#admin-lbtn') && screen.querySelector('.ml-admin-shield') && screen.querySelector('.ml-admin-brandmark img') && screen.querySelector('#admin-national');
    if (screen.getAttribute('data-ml-admin-redesigned') === '1' && complete) return;
    screen.innerHTML =
      '<section class="ml-admin-hero">' +
        '<div class="ml-admin-brandmark"><img src="./assets/marketlink-logo.png" alt="MarketLink Gambia logo" onerror="this.onerror=null;this.src=\'https://marketlink-gambia-frontend.onrender.com/assets/marketlink-logo.png\';"><span class="ml-admin-shield" aria-hidden="true">🛡️</span></div>' +
        '<h1 class="ml-admin-title">MarketLink Admin Portal</h1>' +
        '<p class="ml-admin-subtitle">Secure access for authorised MarketLink administrators and staff.</p>' +
      '</section>' +
      '<section class="ml-admin-card" aria-label="Administrator sign in">' +
        '<p class="ml-admin-kicker">Administrator sign in</p>' +
        '<div id="admin-auth-err" role="alert" aria-live="polite" style="display:none"></div>' +
        '<label class="ml-admin-label" for="admin-national">Gambian mobile number</label>' +
        '<div id="ml-admin-phone-slot"><div class="ml-admin-phone"><span class="ml-admin-country"><b>🇬🇲</b> +220</span><select id="admin-operator" aria-label="Mobile network"><option value="AFRICELL">Africell (87)</option><option value="QCELL">QCell (83)</option><option value="COMIUM">Comium (86)</option><option value="GAMCEL">Gamcel (legacy 7 digits)</option></select><input class="inp" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="7" id="admin-national" placeholder="7 digits after prefix; Gamcel legacy" aria-label="Seven digits after prefix for migrated networks; Gamcel remains seven digits in Phase 1"></div><input type="hidden" id="admin-staffid" value=""></div>' +
        '<label class="ml-admin-label" for="admin-password">4-digit security PIN</label>' +
        '<input class="inp" type="password" id="admin-password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Enter your PIN" aria-label="Four digit administrator PIN" onkeydown="if(event.key===\'Enter\')doAdminLogin()">' +
        '<button class="btn" type="button" id="admin-lbtn" onclick="doAdminLogin()">Sign in securely</button>' +
        '<div class="ml-admin-security"><span aria-hidden="true">🔒</span><div><strong>Restricted administrator area</strong>Only approved MarketLink admin accounts can enter. Access is verified securely by the MarketLink server.</div></div>' +
        '<p class="ml-admin-footer">MarketLink Gambia · Royal FinTech Company</p>' +
      '</section>';
    screen.setAttribute('data-ml-admin-redesigned', '1');
  }

  function installAdminPhoneSubmit() {
    if (window.__ML_ADMIN_PHONE_SUBMIT || typeof window.doAdminLogin !== 'function') return;
    var original = window.doAdminLogin;
    window.doAdminLogin = function () {
      var operator = document.getElementById('admin-operator');
      var national = document.getElementById('admin-national');
      var hidden = document.getElementById('admin-staffid');
      if (operator && national && hidden) {
        var digits = String(national.value || '').replace(/\D/g, '');
        if (digits.length !== 7) {
          var err = document.getElementById('admin-auth-err');
          if (err) { err.textContent = 'Enter 7 digits after the network prefix, or the existing 7-digit Gamcel number.'; err.style.display = 'block'; }
          national.focus();
          return;
        }
        var prefixes = { AFRICELL: '87', QCELL: '83', COMIUM: '86', GAMCEL: '' };
        if (operator.value === 'GAMCEL' && digits.charAt(0) !== '9') {
          var gamcelErr = document.getElementById('admin-auth-err');
          if (gamcelErr) { gamcelErr.textContent = 'Gamcel numbers must start with 9. Please check the number.'; gamcelErr.style.display = 'block'; }
          national.focus();
          return;
        }
        hidden.value = (prefixes[operator.value] || '') + digits;
      }
      return original.apply(this, arguments);
    };
    window.__ML_ADMIN_PHONE_SUBMIT = true;
  }

  // Capture Admin login intent before the shared inline handler runs.
  // This bridge does not depend on when premium-marketlink.js publishes doAdminLogin.
  function syncAdminPhoneFromSelection() {
    var operator = document.getElementById('admin-operator');
    var national = document.getElementById('admin-national');
    var hidden = document.getElementById('admin-staffid');
    if (!operator || !national || !hidden) return false;
    var digits = String(national.value || '').replace(/\D/g, '');
    var err = document.getElementById('admin-auth-err');
    if (digits.length !== 7) {
      if (err) { err.textContent = 'Enter the 7 digits after the selected network prefix (9 digits total).'; err.style.display = 'block'; }
      return false;
    }
    var rules = {
      AFRICELL: { prefix: '87', legacy: /^(2|7|40|41)/ },
      QCELL: { prefix: '83', legacy: /^(3|5)/ },
      COMIUM: { prefix: '86', legacy: /^(6|8)/ },
      GAMCEL: { prefix: '', legacy: /^9/ }
    };
    var rule = rules[operator.value];
    if (!rule || !rule.legacy.test(digits)) {
      if (err) { err.textContent = 'The number does not match the selected network. Check the number and network, then try again.'; err.style.display = 'block'; }
      national.focus();
      return false;
    }
    hidden.value = rule.prefix + digits;
    if (err) { err.textContent = ''; err.style.display = 'none'; }
    return true;
  }

  if (!window.__ML_ADMIN_PHONE_BRIDGE) {
    window.__ML_ADMIN_PHONE_BRIDGE = true;
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('#admin-lbtn') : null;
      if (target) syncAdminPhoneFromSelection();
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.target && event.target.id === 'admin-password' && event.key === 'Enter') {
        syncAdminPhoneFromSelection();
      }
    }, true);
    document.addEventListener('change', function (event) {
      var national = document.getElementById('admin-national');
      if (event.target && (event.target.id === 'admin-national' || event.target.id === 'admin-operator') &&
          national && String(national.value || '').replace(/\D/g, '').length === 7) {
        syncAdminPhoneFromSelection();
      }
    }, true);
  }

  function unlockAdminLoginViewport() {
    var login = document.getElementById('scr-admin-login');
    if (!login || !login.classList.contains('active')) return;
    var app = document.getElementById('app');
    var html = document.documentElement;
    var body = document.body;
    // The shared customer shell locks #app to 100vh with overflow:hidden.
    // Do not rely on :has() support in mobile WebViews: set actual scroll
    // containers inline while the Admin login is the active screen.
    if (app) {
      app.style.setProperty('position', 'relative', 'important');
      app.style.setProperty('inset', 'auto', 'important');
      app.style.setProperty('height', 'auto', 'important');
      app.style.setProperty('min-height', '100dvh', 'important');
      app.style.setProperty('max-height', 'none', 'important');
      app.style.setProperty('overflow-x', 'hidden', 'important');
      app.style.setProperty('overflow-y', 'visible', 'important');
    }
    login.style.setProperty('position', 'relative', 'important');
    login.style.setProperty('inset', 'auto', 'important');
    login.style.setProperty('width', '100%', 'important');
    login.style.setProperty('height', 'auto', 'important');
    login.style.setProperty('min-height', '100dvh', 'important');
    login.style.setProperty('max-height', 'none', 'important');
    login.style.setProperty('overflow', 'visible', 'important');
    login.style.setProperty('touch-action', 'pan-y', 'important');
    [html, body].forEach(function (node) {
      if (!node) return;
      node.style.setProperty('height', 'auto', 'important');
      node.style.setProperty('min-height', '100%', 'important');
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('overflow-x', 'hidden', 'important');
      node.style.setProperty('overflow-y', 'auto', 'important');
      node.style.setProperty('touch-action', 'pan-y', 'important');
    });
  }

  function openAdmin() {
    buildAdminLogin();
    if (typeof window.openAdminLogin === 'function') {
      try {
        window.openAdminLogin();
        var opened = document.getElementById('scr-admin-login');
        if (opened && opened.classList.contains('active')) {
          unlockAdminLoginViewport();
          return true;
        }
      } catch (error) {
        // Fall through to the isolated Admin-only screen activation below.
      }
    }
    var login = document.getElementById('scr-admin-login');
    if (login) {
      document.querySelectorAll('.screen.active').forEach(function (screen) {
        screen.classList.remove('active');
      });
      login.style.setProperty('display', 'block', 'important');
      login.style.setProperty('visibility', 'visible', 'important');
      login.style.setProperty('pointer-events', 'auto', 'important');
      login.removeAttribute('aria-hidden');
      login.classList.add('active');
      unlockAdminLoginViewport();
      return true;
    }
    return false;
  }


  // Premium responsive Admin workspace. This runs only on the dedicated Admin site.

  function adminSafe(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  async function adminAuditView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Admin audit trail</h3><p>Loading recent activity…</p></div>';
    try{
      var r=await ML_API.admin.auditLogs({page:1,limit:50}),rows=Array.isArray(r.data)?r.data:(r.data&&r.data.items)||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Admin audit trail</h3><button onclick="window.__ML_ADMIN_AUDIT()">Refresh</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">🛡️</div><div class="copy"><b>'+adminSafe(x.action||'Admin action')+'</b><span>'+adminSafe(x.actor_name||x.actor_id||'Administrator')+' · '+adminSafe(x.entity_type||'system')+'</span><small>'+adminSafe(x.created_at?new Date(x.created_at).toLocaleString():'')+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No audit entries</b><span>No administrative activity was returned.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Audit trail unavailable</b><span>'+adminSafe(e.error||e.message||'Could not load audit records.')+'</span></div>';}
  }
  async function adminCommissionSettingsView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Commission control</h3><p>Loading protected finance settings…</p></div>';
    try{
      var data=await adminRequest('/admin/commission-settings','GET');
      var pool=Number(data.marketplaceCommissionPct||0),affiliate=Number(data.affiliateCommissionPct||0),withdrawalFee=Number(data.withdrawalServiceFeePct==null?2:data.withdrawalServiceFeePct),payoutRecovery=Number(data.payoutFeeRecoveryPct==null?2:data.payoutFeeRecoveryPct);
      var retained=Number(data.marketlinkRetainedPct||0),vendor=Number(data.vendorPayoutPct||0),delivery=Number(data.baseDeliveryFeeGmd||25);
      var deliveryPolicy={};try{deliveryPolicy=await adminRequest('/admin/delivery-pricing-settings','GET')||{};}catch(deliveryPolicyError){}
      var deliveryBase=Number(deliveryPolicy.baseFeeGmd==null?150:deliveryPolicy.baseFeeGmd),deliveryPerKm=Number(deliveryPolicy.perKmFeeGmd==null?10:deliveryPolicy.perKmFeeGmd),deliveryMinimum=Number(deliveryPolicy.minimumFeeGmd==null?150:deliveryPolicy.minimumFeeGmd),deliveryAllowedMinimum=Number(deliveryPolicy.minimumAllowedFeeGmd==null?1:deliveryPolicy.minimumAllowedFeeGmd),deliveryMaximum=Number(deliveryPolicy.maximumFeeGmd==null?5000:deliveryPolicy.maximumFeeGmd);
      var feeReport={};try{feeReport=await adminRequest('/admin/withdrawal-fees','GET')||{};}catch(feeReportError){}
      var feeSummary=feeReport.summary||{},feeRows=Array.isArray(feeReport.items)?feeReport.items:[];
      root.innerHTML='<div class="ml-premium-home">'+
        '<div class="ml-section-head"><div><div class="ml-eyebrow">FINANCE · COMMISSION POLICY</div><h3>Commission control</h3><p style="margin:5px 0;color:var(--mu)">Controls the actual split recorded on new orders and distributed after confirmed payment and successful delivery.</p></div><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_COMMISSION()">↻ Refresh</button></div>'+
        '<div class="ml-stat-grid">'+
          '<div class="ml-stat"><div class="ml-stat-label">Total marketplace pool</div><div class="ml-stat-value" id="ml-commission-pool-stat">'+pool.toFixed(2)+'%</div></div>'+
          '<div class="ml-stat"><div class="ml-stat-label">MarketLink retained (with affiliate)</div><div class="ml-stat-value" id="ml-commission-retained-stat">'+retained.toFixed(2)+'%</div></div>'+
          '<div class="ml-stat"><div class="ml-stat-label">Affiliate reward (eligible referral)</div><div class="ml-stat-value" id="ml-commission-affiliate-stat">'+affiliate.toFixed(2)+'%</div></div>'+
          '<div class="ml-stat"><div class="ml-stat-label">Vendor net merchandise</div><div class="ml-stat-value" id="ml-commission-vendor-stat">'+vendor.toFixed(2)+'%</div></div>'+
        '</div>'+
        '<div class="ml-profile-card" style="margin-top:14px;padding:16px">'+
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">'+
            '<label style="display:block">Total marketplace commission (%)<input id="ml-commission-pool" type="number" inputmode="decimal" min="0" max="20" step="0.01" value="'+pool.toFixed(2)+'" oninput="window.__ML_ADMIN_COMMISSION_PREVIEW()" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"><small style="display:block;color:var(--mu);margin-top:5px">Deducted from discounted merchandise proceeds, not added to customer checkout.</small></label>'+
            '<label style="display:block">Affiliate reward (%)<input id="ml-commission-affiliate" type="number" inputmode="decimal" min="0" max="20" step="0.01" value="'+affiliate.toFixed(2)+'" oninput="window.__ML_ADMIN_COMMISSION_PREVIEW()" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"><small style="display:block;color:var(--mu);margin-top:5px">Paid only for a qualifying referral after delivery and payment confirmation.</small></label>'+
            '<label style="display:block">DAHA Wallet withdrawal service fee (%)<input id="ml-commission-withdrawal-fee" type="number" inputmode="decimal" min="0" max="10" step="0.01" value="'+withdrawalFee.toFixed(2)+'" oninput="window.__ML_ADMIN_COMMISSION_PREVIEW()" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"><small style="display:block;color:var(--mu);margin-top:5px">Applies to customer cash-outs only. Vendor, rider and affiliate marketplace payouts are not charged a second withdrawal percentage because their provider transfer costs are funded by the payout provision already included in customer order totals.</small></label>'+
            '<label style="display:block">Customer order payout-cost recovery (%)<input id="ml-commission-payout-recovery" type="number" inputmode="decimal" min="0" max="10" step="0.01" value="'+payoutRecovery.toFixed(2)+'" oninput="window.__ML_ADMIN_COMMISSION_PREVIEW()" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"><small style="display:block;color:var(--mu);margin-top:5px">Included in the customer’s single all-in total, calculated on vendor, rider and affiliate wallet payouts. No separate fee row is shown at checkout.</small></label>'+
          '</div>'+
          '<div class="ml-wallet-note" style="margin:14px 0;padding:13px;border-radius:12px"><b>Illustrative D100 customer DAHA Wallet withdrawal</b><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:10px"><div><small>Recipient receives</small><div style="font-size:19px;font-weight:800">D 100.00</div></div><div><small>DAHA service fee ('+withdrawalFee.toFixed(2)+'%)</small><div id="ml-withdrawal-fee-example" style="font-size:19px;font-weight:800">D '+withdrawalFee.toFixed(2)+'</div></div><div><small>Total wallet debit</small><div id="ml-withdrawal-debit-example" style="font-size:19px;font-weight:800">D '+(100+withdrawalFee).toFixed(2)+'</div></div></div><small style="display:block;color:var(--mu);margin-top:8px">This fee applies to customer DAHA Wallet cash-outs, including funds deposited directly and withdrawn without a marketplace purchase. Vendor, rider and affiliate marketplace withdrawals are fee-free at cash-out; their transfer costs are already covered by the customer-funded order recovery.</small></div>'+
          '<input type="hidden" id="ml-commission-delivery-fee" value="'+delivery.toFixed(2)+'">'+
          '<div class="ml-wallet-note" style="margin:14px 0;padding:13px;border-radius:12px"><b>Illustrative D100 merchandise order</b><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:10px"><div><small>Vendor payout</small><div id="ml-commission-example-vendor" style="font-weight:800;font-size:19px">D '+(100*vendor/100).toFixed(2)+'</div></div><div><small>Affiliate payout (referral)</small><div id="ml-commission-example-affiliate" style="font-weight:800;font-size:19px">D '+(100*affiliate/100).toFixed(2)+'</div></div><div><small>MarketLink retains (with referral)</small><div id="ml-commission-example-retained" style="font-weight:800;font-size:19px">D '+(100*retained/100).toFixed(2)+'</div></div><div><small>MarketLink retains (no referral)</small><div id="ml-commission-example-no-referral" style="font-weight:800;font-size:19px">D '+(100*pool/100).toFixed(2)+'</div></div><div><small>Rider delivery amount</small><div style="font-weight:800;font-size:19px">D '+delivery.toFixed(2)+'</div></div><div><small>Included payout provision</small><div id="ml-commission-example-recovery" style="font-weight:800;font-size:19px">D '+((100*(100-pool)/100+delivery+100*affiliate/100)*payoutRecovery/100).toFixed(2)+'</div></div><div><small>Customer all-in total (single amount)</small><div id="ml-commission-example-total" style="font-weight:800;font-size:19px">D '+(100+delivery+((100*(100-pool)/100+delivery+100*affiliate/100)*payoutRecovery/100)).toFixed(2)+'</div></div></div><small style="display:block;margin-top:8px;color:var(--mu)">The affiliate share is paid only when the order has a qualifying referral. Without a referral, MarketLink retains the full commission pool. The 5% marketplace pool is unchanged. The separate payout-cost provision is included in the single customer total.</small></div>'+
          '<div class="ml-wallet-note" style="margin:14px 0;padding:13px;border-radius:12px"><b>Live percentage split preview</b><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-top:10px"><div><small>MarketLink keeps</small><div id="ml-commission-preview-retained" style="font-weight:800;font-size:20px">'+retained.toFixed(2)+'%</div></div><div><small>Affiliate receives</small><div id="ml-commission-preview-affiliate" style="font-weight:800;font-size:20px">'+affiliate.toFixed(2)+'%</div></div><div><small>Vendor receives</small><div id="ml-commission-preview-vendor" style="font-weight:800;font-size:20px">'+vendor.toFixed(2)+'%</div></div></div><small style="display:block;margin-top:8px;color:var(--mu)">MarketLink retained share = total pool minus affiliate reward. Affiliate reward cannot exceed the total pool.</small></div>'+
          '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center"><button class="ml-btn ml-btn-primary" id="ml-commission-save" onclick="window.__ML_ADMIN_COMMISSION_SAVE()">Save commission settings</button><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_COMMISSION()">Discard changes</button></div>'+
          '<small style="display:block;margin-top:10px;color:var(--mu)">Changes apply to future orders only. Existing orders keep the commission percentages recorded when they were placed.</small>'+
        '</div>'+
        '<section class="ml-profile-card" style="margin-top:14px;padding:18px;border:1px solid rgba(213,172,82,.28)"><div class="ml-section-head"><div><div class="ml-eyebrow">ADMIN DELIVERY TARIFF</div><h3>Delivery price controls</h3><p style="margin:5px 0;color:var(--mu)">Sets the starter price used in rider profiles and the allowed range for all vendor-to-customer delivery quotes. Rider-specific distance and route prices remain available inside these limits.</p></div></div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">'+
          '<label>Default base fare (GMD)<input id="ml-delivery-base" type="number" min="0" max="2000" step="0.01" value="'+deliveryBase.toFixed(2)+'" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"></label>'+
          '<label>Default per kilometre (GMD)<input id="ml-delivery-per-km" type="number" min="0" max="500" step="0.01" value="'+deliveryPerKm.toFixed(2)+'" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"></label>'+
          '<label>Default minimum fare (GMD)<input id="ml-delivery-minimum" type="number" min="0.01" max="5000" step="0.01" value="'+deliveryMinimum.toFixed(2)+'" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"></label>'+
          '<label>Lowest permitted fare (GMD)<input id="ml-delivery-allowed-min" type="number" min="0.01" max="5000" step="0.01" value="'+deliveryAllowedMinimum.toFixed(2)+'" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"></label>'+
          '<label>Highest permitted fare (GMD)<input id="ml-delivery-maximum" type="number" min="0.01" max="5000" step="0.01" value="'+deliveryMaximum.toFixed(2)+'" style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--tx)"></label>'+
        '</div>'+
        '<div class="ml-wallet-note" style="margin:13px 0">Starter tariff: <b>D 150.00 + D 10.00 per estimated kilometre, with a D 150.00 minimum.</b> Riders can edit their own rate and add fixed routes; the Admin-approved minimum and maximum are enforced when customers receive quotes.</div>'+
        '<div style="display:flex;gap:9px;flex-wrap:wrap"><button class="ml-btn ml-btn-primary" id="ml-delivery-policy-save" onclick="window.__ML_ADMIN_DELIVERY_SAVE()">Save delivery price controls</button><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_COMMISSION()">Discard changes</button></div></section>'+
        '<section class="ml-profile-card" style="margin-top:14px;padding:16px"><div class="ml-section-head"><div><div class="ml-eyebrow">PAYOUT COST CONTROL</div><h3>DAHA withdrawal fee reconciliation</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_COMMISSION()">Refresh</button></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">DAHA wallet cash-out fees</div><div class="ml-stat-value">D '+Number(feeSummary.service_fees_earned||0).toFixed(2)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Order payout recovery</div><div class="ml-stat-value">D '+Number(feeSummary.payout_fee_recovery_earned||0).toFixed(2)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Modem Pay payout fees</div><div class="ml-stat-value">D '+Number(feeSummary.provider_fees_paid||0).toFixed(2)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Net recovery after provider fees</div><div class="ml-stat-value">D '+Number(feeSummary.platform_net_margin||0).toFixed(2)+'</div></div></div>'+
        (feeRows.length?'<div class="ml-profile-card" style="margin-top:10px">'+feeRows.slice(0,12).map(function(x){return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(x.account_name||'Wallet user')+' · '+adminSafe(String(x.payout_method||'').toUpperCase())+'</b><span>Payout D '+Number(x.amount||0).toFixed(2)+' · DAHA fee D '+Number(x.service_fee_amount||0).toFixed(2)+'</span><small>Provider fee '+(x.provider_fee_amount==null?'not returned':('D '+Number(x.provider_fee_amount).toFixed(2)))+' · MarketLink margin '+(x.platform_fee_margin==null?'pending':('D '+Number(x.platform_fee_margin).toFixed(2)))+' · '+adminSafe(String(x.provider_fee_source||'fee quote pending').replace(/_/g,' '))+'</small></div><strong>'+adminSafe(String(x.status||'').replace(/_/g,' '))+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><span>No DAHA withdrawal fee records yet. Completed payouts will appear here after the first real payout.</span></div>')+
        '<small style="display:block;color:var(--mu);margin-top:9px">Order recovery is reconciled against actual Modem Pay transfer costs. A negative net means provider costs exceeded recovery and are borne by MarketLink.</small></section>'+
        '<div class="ml-profile-card" style="margin-top:14px;padding:16px"><b>How MarketLink distributes funds</b><p style="color:var(--mu);margin:8px 0">The vendor sets the retail product price. The commission pool is deducted from the discounted merchandise subtotal. After delivery and confirmed payment, the backend credits the vendor and qualifying affiliate DAHA Wallets and records MarketLink’s retained share. The rider receives the delivery fee, currently D '+delivery.toFixed(2)+' per order, separately from the merchandise split. After settlement these amounts credit DAHA Wallets; external Wave/AfriMoney transfers use the separate Admin-approved withdrawal flow.</p><p style="color:var(--mu);margin:8px 0"><b>Payment gateway fee:</b> New customer orders include the configured payout-cost provision within one all-in total. Vendor, rider and affiliate wallet withdrawals do not receive a second DAHA percentage fee; actual transfer costs are reconciled against the order-funded provision.</p></div>'+
      '</div>';
      window.__ML_ADMIN_COMMISSION_PREVIEW();
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Commission settings unavailable</b><span>'+adminSafe(e.message||'Could not load finance settings.')+'</span></div>';}
  }
  window.__ML_ADMIN_COMMISSION_PREVIEW=function(){
    var poolEl=document.getElementById('ml-commission-pool'),affiliateEl=document.getElementById('ml-commission-affiliate'),withdrawalFeeEl=document.getElementById('ml-commission-withdrawal-fee'),recoveryEl=document.getElementById('ml-commission-payout-recovery');if(!poolEl||!affiliateEl||!withdrawalFeeEl||!recoveryEl)return;
    var pool=Number(poolEl.value),affiliate=Number(affiliateEl.value),withdrawalFee=Number(withdrawalFeeEl.value),payoutRecovery=Number(recoveryEl.value),valid=Number.isFinite(pool)&&Number.isFinite(affiliate)&&Number.isFinite(withdrawalFee)&&Number.isFinite(payoutRecovery)&&pool>=0&&pool<=20&&affiliate>=0&&affiliate<=pool&&withdrawalFee>=0&&withdrawalFee<=10&&payoutRecovery>=0&&payoutRecovery<=10;
    var retained=valid?pool-affiliate:0,vendor=valid?100-pool:0;
    [['ml-commission-preview-retained',retained],['ml-commission-preview-affiliate',affiliate],['ml-commission-preview-vendor',vendor]].forEach(function(pair){var el=document.getElementById(pair[0]);if(el)el.textContent=valid?pair[1].toFixed(2)+'%':'—';});
    [['ml-commission-retained-stat',retained],['ml-commission-affiliate-stat',affiliate],['ml-commission-vendor-stat',vendor],['ml-commission-pool-stat',pool]].forEach(function(pair){var el=document.getElementById(pair[0]);if(el)el.textContent=valid?pair[1].toFixed(2)+'%':'—';});
    var exampleVendor=document.getElementById('ml-commission-example-vendor');if(exampleVendor)exampleVendor.textContent=valid?'D '+vendor.toFixed(2):'—';
    var exampleAffiliate=document.getElementById('ml-commission-example-affiliate');if(exampleAffiliate)exampleAffiliate.textContent=valid?'D '+affiliate.toFixed(2):'—';
    var exampleRetained=document.getElementById('ml-commission-example-retained');if(exampleRetained)exampleRetained.textContent=valid?'D '+retained.toFixed(2):'—';
    var exampleNoReferral=document.getElementById('ml-commission-example-no-referral');if(exampleNoReferral)exampleNoReferral.textContent=valid?'D '+pool.toFixed(2):'—';
    var withdrawalFeeExample=document.getElementById('ml-withdrawal-fee-example');if(withdrawalFeeExample)withdrawalFeeExample.textContent=valid?'D '+withdrawalFee.toFixed(2):'—';
    var withdrawalDebitExample=document.getElementById('ml-withdrawal-debit-example');if(withdrawalDebitExample)withdrawalDebitExample.textContent=valid?'D '+(100+withdrawalFee).toFixed(2):'—';
    var payoutRecoveryExample=document.getElementById('ml-commission-example-recovery'),exampleTotal=document.getElementById('ml-commission-example-total');var recoveryBase=100*(100-pool)/100+delivery+100*affiliate/100;var recoveryAmount=valid?recoveryBase*payoutRecovery/100:0;if(payoutRecoveryExample)payoutRecoveryExample.textContent=valid?'D '+recoveryAmount.toFixed(2):'—';if(exampleTotal)exampleTotal.textContent=valid?'D '+(100+delivery+recoveryAmount).toFixed(2):'—';
    var save=document.getElementById('ml-commission-save');if(save)save.disabled=!valid;
  };
  window.__ML_ADMIN_COMMISSION_SAVE=async function(){
    var poolEl=document.getElementById('ml-commission-pool'),affiliateEl=document.getElementById('ml-commission-affiliate'),withdrawalFeeEl=document.getElementById('ml-commission-withdrawal-fee'),recoveryEl=document.getElementById('ml-commission-payout-recovery');if(!poolEl||!affiliateEl||!withdrawalFeeEl||!recoveryEl)return;
    var marketplaceCommissionPct=Number(poolEl.value),affiliateCommissionPct=Number(affiliateEl.value),withdrawalServiceFeePct=Number(withdrawalFeeEl.value),payoutFeeRecoveryPct=Number(recoveryEl.value);
    if(!Number.isFinite(marketplaceCommissionPct)||!Number.isFinite(affiliateCommissionPct)||!Number.isFinite(withdrawalServiceFeePct)||!Number.isFinite(payoutFeeRecoveryPct)||marketplaceCommissionPct<0||marketplaceCommissionPct>20||affiliateCommissionPct<0||affiliateCommissionPct>marketplaceCommissionPct||withdrawalServiceFeePct<0||withdrawalServiceFeePct>10||payoutFeeRecoveryPct<0||payoutFeeRecoveryPct>10){
      if(window.toast)window.toast('Affiliate reward must be between zero and the total commission pool; total commission is capped at 20%.','error');return;
    }
    var button=document.getElementById('ml-commission-save');if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      await adminRequest('/admin/commission-settings','PUT',{marketplaceCommissionPct,affiliateCommissionPct,withdrawalServiceFeePct,payoutFeeRecoveryPct});
      if(window.toast)window.toast('Finance settings saved. The marketplace pool and order payout recovery apply to new orders; customer DAHA cash-out fees apply to new withdrawals.','success');
      await adminCommissionSettingsView();
    }catch(e){if(window.toast)window.toast(e.message||'Could not save commission settings.','error');if(button){button.disabled=false;button.textContent='Save commission settings';}}
  };
  window.__ML_ADMIN_DELIVERY_SAVE=async function(){
    var read=function(id){var el=document.getElementById(id);return el?Number(el.value):NaN;};
    var payload={
      baseFeeGmd:read('ml-delivery-base'),
      perKmFeeGmd:read('ml-delivery-per-km'),
      minimumFeeGmd:read('ml-delivery-minimum'),
      minimumAllowedFeeGmd:read('ml-delivery-allowed-min'),
      maximumFeeGmd:read('ml-delivery-maximum')
    };
    if(!Object.keys(payload).every(function(key){return Number.isFinite(payload[key]);})||
       payload.baseFeeGmd<0||payload.baseFeeGmd>2000||payload.perKmFeeGmd<0||payload.perKmFeeGmd>500||
       payload.minimumFeeGmd<=0||payload.minimumAllowedFeeGmd<=0||
       payload.maximumFeeGmd<payload.minimumAllowedFeeGmd||payload.maximumFeeGmd>5000||
       payload.minimumFeeGmd<payload.minimumAllowedFeeGmd||payload.minimumFeeGmd>payload.maximumFeeGmd||
       payload.baseFeeGmd>payload.maximumFeeGmd){
      if(window.toast)window.toast('Check the GMD amounts. Defaults and rider fares must stay inside the permitted minimum and maximum.','error');
      return;
    }
    var button=document.getElementById('ml-delivery-policy-save');if(button){button.disabled=true;button.textContent='Saving delivery controls…';}
    try{
      await adminRequest('/admin/delivery-pricing-settings','PUT',payload);
      if(window.toast)window.toast('Delivery pricing controls saved. New quotes will use the updated policy.','success');
      await adminCommissionSettingsView();
    }catch(e){
      if(window.toast)window.toast(e.message||'Could not save delivery pricing controls.','error');
      if(button){button.disabled=false;button.textContent='Save delivery price controls';}
    }
  };
  window.__ML_ADMIN_COMMISSION=adminCommissionSettingsView;

  async function adminSettingsView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>System settings</h3><p>Loading protected settings…</p></div>';
    try{
      var r=await ML_API.admin.settings(),rows=Array.isArray(r.data)?r.data:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>System settings</h3><span>Read-only inspection</span></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){var k=String(x.key||''),secret=/secret|token|password|api.?key|private/i.test(k),v=secret?'•••••••• (protected)':(typeof x.value==='string'?x.value:JSON.stringify(x.value));return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(k)+'</b><span>'+adminSafe(x.category||'general')+' · '+adminSafe(v||'Not set')+'</span></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No settings returned</b><span>The production settings table returned no rows.</span></div>')+
      '<div class="ml-wallet-note" style="margin-top:12px;padding:12px;border-radius:12px">Sensitive values are masked. Provider secrets must remain in backend environment variables.</div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Settings unavailable</b><span>'+adminSafe(e.error||e.message||'Your account may require super-admin permission.')+'</span></div>';}
  }
  window.__ML_ADMIN_AUDIT=adminAuditView;
  window.__ML_ADMIN_SETTINGS=adminSettingsView;

  async function adminPromotionsView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Promotion requests</h3><p>Loading vendor requests…</p></div>';
    try{
      var r=await ML_API.promotions.adminList({page:1,limit:50}),d=r.data,rows=Array.isArray(d)?d:(d&&(d.items||d.requests))||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Promotion requests</h3><button onclick="window.__ML_ADMIN_PROMOTIONS()">Refresh</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">🎫</div><div class="copy"><b>'+adminSafe(x.title||x.business_name||x.vendor_name||'Promotion request')+'</b><span>'+adminSafe(x.status||'pending')+' · '+adminSafe(x.vendor_name||x.business_name||'Vendor')+'</span><small>'+adminSafe(x.placement||'featured_banner')+' · '+adminSafe(x.payment_status||'unpaid')+' · '+adminSafe(x.created_at?new Date(x.created_at).toLocaleString():'')+'</small><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+(x.payment_status!=='paid'&&x.status!=='rejected'&&x.status!=='cancelled'?'<button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_PROMO_PAID(\''+adminSafe(x.id)+'\')">Record GMD payment</button>':'')+(x.status==='pending'?'<button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'reviewing\')">Mark reviewing</button>':'')+(x.status==='pending'||x.status==='reviewing'?'<button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'approved\')">Approve</button>':'')+(x.status==='approved'&&x.payment_status==='paid'&&x.banner_url?'<button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'published\')">Publish</button>':'')+(x.status!=='published'&&x.status!=='rejected'&&x.status!=='cancelled'?'<button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'rejected\')">Reject</button>':'')+'</div></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No promotion requests</b><span>The live API returned no promotion requests for review.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Promotion requests unavailable</b><span>'+adminSafe(e.error||e.message||'Could not load promotion requests.')+'</span></div>';}
  }
  window.__ML_ADMIN_PROMOTIONS=adminPromotionsView;
  window.__ML_ADMIN_PROMO_PAID=async function(id){
    var reference=window.prompt('Enter the Modem Pay transaction reference or company-statement reference confirming this promotion payment:','');
    if(reference===null)return;
    reference=String(reference||'').trim();
    if(!reference){if(typeof window.toast==='function')window.toast('A payment reference is required before marking this request paid.','error');return;}
    try{
      await ML_API.promotions.adminReview(id,{paymentStatus:'paid',paymentReference:reference,adminNotes:'Admin checked the reference against the company account statement.'});
      if(typeof window.toast==='function')window.toast('Payment reference recorded. Promotion can now be approved and published.','success');
      await adminPromotionsView();
    }catch(e){if(typeof window.toast==='function')window.toast(e.error||e.message||'Could not record promotion payment.','error');}
  };
  window.__ML_ADMIN_PROMO_REVIEW=async function(id,status){
    var note=window.prompt('Optional admin note for this promotion:','');
    if(note===null)return;
    try{
      await ML_API.promotions.adminReview(id,{status:status,adminNotes:note});
      if(typeof window.toast==='function')window.toast('Promotion request updated.','success');
      await adminPromotionsView();
    }catch(e){if(typeof window.toast==='function')window.toast(e.error||e.message||'Could not update promotion request.','error');}
  };


  async function adminRequest(path,method,body){
    var token=window.ML_API&&typeof ML_API.getAccessToken==='function'?ML_API.getAccessToken():null;
    if(!token)throw new Error('Your Admin session has expired. Sign in again.');
    var base=String(window.ML_API_URL||'https://marketlink-gambia.onrender.com/api/v1').replace(/\/+$/,'');
    if(!/\/api\/v1$/.test(base))base+='/api/v1';
    var response=await fetch(base+path,{method:method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    var data={};try{data=await response.json();}catch(_){}
    if(!response.ok||data.success===false)throw new Error(data.error||data.message||('Request failed ('+response.status+').'));
    return data.data;
  }
  function adminFormatDate(value){return value?new Date(value).toLocaleString():'—';}
  var adminChatSelectedId=null;
  async function adminChatView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Customer chat inbox</h3><p>Loading customer and vendor conversations…</p></div>';
    try{
      var term=String((document.getElementById('ml-admin-chat-search')||{}).value||'').trim();
      var params=new URLSearchParams({page:'1',limit:'50'});if(term)params.set('search',term);
      var data=await adminRequest('/admin/conversations?'+params.toString(),'GET'),rows=Array.isArray(data.items)?data.items:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>Customer chat inbox</h3><p style="margin:5px 0;color:var(--mu)">Protected conversations between MarketLink customers and vendors</p></div><button onclick="window.__ML_ADMIN_CHAT()">Refresh</button></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin:12px 0"><label class="ml-admin-label" for="ml-admin-chat-search">Search participant, phone, vendor or order</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ml-admin-chat-search" class="inp" maxlength="120" value="'+adminSafe(term)+'" placeholder="Search conversations" style="flex:1;min-width:180px"><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CHAT()">Search</button></div></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Conversations</div><div class="ml-stat-value">'+Number(data.total||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Unread messages</div><div class="ml-stat-value">'+rows.reduce(function(sum,x){return sum+Number(x.unread_messages||0);},0)+'</div></div></div>'+
        (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){var title=[x.participant_a_name,x.participant_b_name].filter(Boolean).join(' ↔ ');return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer" onclick="window.__ML_ADMIN_CHAT_OPEN(\''+adminSafe(x.id)+'\')"><div class="ico">💬</div><div class="copy"><b>'+adminSafe(title||'MarketLink conversation')+'</b><span>'+adminSafe(x.vendor_name||'Customer / vendor chat')+(x.order_number?' · Order '+adminSafe(x.order_number):'')+'</span><small>'+adminSafe(x.last_message||'No messages yet')+' · '+adminFormatDate(x.last_message_at||x.created_at)+'</small></div>'+(Number(x.unread_messages||0)?'<strong style="color:#D9A441">'+Number(x.unread_messages)+' new</strong>':'<span>›</span>')+'</button>';}).join('')+'</div>':'<div class="ml-empty"><b>No conversations yet</b><span>Customer and vendor chats will appear here when a conversation is started.</span></div>')+'</div>';
      var input=document.getElementById('ml-admin-chat-search');if(input)input.addEventListener('keydown',function(e){if(e.key==='Enter')window.__ML_ADMIN_CHAT();});
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Chat inbox unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CHAT()">Retry</button></div>';}
  }
  async function adminChatOpen(id){
    adminChatSelectedId=String(id||'');var root=document.getElementById('adash-body');if(!root||!adminChatSelectedId)return;
    root.innerHTML='<div class="ml-premium-home"><p>Loading conversation…</p></div>';
    try{
      var data=await adminRequest('/admin/conversations/'+encodeURIComponent(adminChatSelectedId)+'/messages?limit=100','GET');
      var c=data.conversation||{},messages=Array.isArray(data.messages)?data.messages:[];
      var people=[c.participant_a_name,c.participant_b_name].filter(Boolean).join(' ↔ ');
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>Conversation</h3><p style="margin:5px 0;color:var(--mu)">'+adminSafe(people||'MarketLink chat')+' · '+adminSafe(c.vendor_name||'Marketplace')+(c.order_number?' · Order '+adminSafe(c.order_number):'')+'</p></div><button onclick="window.__ML_ADMIN_CHAT()">← Inbox</button></div>'+
        '<div class="ml-profile-card" style="padding:12px;max-height:55vh;overflow:auto">'+(messages.length?messages.map(function(m){var own=m.sender_type==='admin';return '<div style="display:flex;justify-content:'+(own?'flex-end':'flex-start')+';margin:8px 0"><div style="max-width:88%;padding:10px 12px;border-radius:13px;background:'+(own?'rgba(217,164,65,.18)':'rgba(148,163,184,.12)')+';border:1px solid '+(own?'rgba(217,164,65,.35)':'var(--bd,rgba(148,163,184,.2))')+'"><b style="display:block;font-size:11px;margin-bottom:4px">'+adminSafe(own?'MarketLink Admin':m.sender_name||'Participant')+'</b><div style="font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere">'+adminSafe(m.body||'')+'</div><small style="display:block;margin-top:5px;color:var(--mu)">'+adminFormatDate(m.created_at)+(own?' · Sent':'')+'</small></div></div>';}).join(''):'<div class="ml-empty">No messages in this conversation yet.</div>')+'</div>'+
        '<div class="ml-profile-card" style="padding:14px;margin-top:12px"><label class="ml-admin-label" for="ml-admin-chat-reply">Reply to both conversation participants</label><textarea id="ml-admin-chat-reply" class="inp" rows="3" maxlength="4000" placeholder="Write a clear, helpful reply…"></textarea><button class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.__ML_ADMIN_CHAT_SEND(\''+adminSafe(c.id)+'\')">Send Admin reply</button><p style="font-size:11px;color:var(--mu);margin:8px 0 0">Your reply is sent under your Admin account and both participants receive an in-app notification. The action is recorded in the Admin audit log.</p></div></div>';
      var box=root.querySelector('.ml-profile-card[style*="max-height"]');if(box)box.scrollTop=box.scrollHeight;
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Conversation unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CHAT()">Back to inbox</button></div>';}
  }
  async function adminChatSend(id){
    var field=document.getElementById('ml-admin-chat-reply'),body=String(field&&field.value||'').trim();
    if(!body){if(window.toast)window.toast('Write a reply before sending.','error');return;}
    try{await adminRequest('/admin/conversations/'+encodeURIComponent(id)+'/messages','POST',{body:body});if(window.toast)window.toast('Admin reply sent to both participants.','success');await adminChatOpen(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  window.__ML_ADMIN_CHAT=adminChatView;
  window.__ML_ADMIN_CHAT_OPEN=adminChatOpen;
  window.__ML_ADMIN_CHAT_SEND=adminChatSend;
  async function adminStartChat(userId){
    try{
      var result=await adminRequest('/admin/conversations','POST',{participantUserId:userId});
      var conversation=result&&result.conversation;
      if(!conversation||!conversation.id)throw new Error('MarketLink did not return a conversation reference.');
      await adminNavigate('chat');
      await adminChatOpen(conversation.id);
      if(window.toast)window.toast('Direct chat opened. You can now send a message.','success');
    }catch(e){if(window.toast)window.toast(e.message||'Could not start a direct chat.','error');}
  }
  window.__ML_ADMIN_START_CHAT=adminStartChat;

  async function adminCrmView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Customer relationship management</h3><p>Loading the protected customer, vendor and rider directory…</p></div>';
    try{
      var term=String((document.getElementById('ml-admin-crm-search')||{}).value||'').trim();
      var role=String((document.getElementById('ml-admin-crm-role')||{}).value||'').trim();
      var status=String((document.getElementById('ml-admin-crm-status')||{}).value||'').trim();
      var params=new URLSearchParams({page:'1',limit:'50'});
      if(term)params.set('search',term);
      if(role)params.set('role',role);
      if(status)params.set('status',status);
      var data=await adminRequest('/admin/users?'+params.toString(),'GET');
      var rows=Array.isArray(data.items)?data.items:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>CRM directory</h3><p style="margin:5px 0;color:var(--mu)">Protected customer, vendor and rider records</p></div><button onclick="window.__ML_ADMIN_CRM()">Refresh</button></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin:12px 0"><label class="ml-admin-label" for="ml-admin-crm-search">Search name, phone or email</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ml-admin-crm-search" class="inp" maxlength="200" value="'+adminSafe(term)+'" placeholder="Search MarketLink users" style="flex:1;min-width:180px"><select id="ml-admin-crm-role" class="inp" style="flex:0 1 150px"><option value="">All roles</option><option value="customer">Customers</option><option value="vendor">Vendors</option><option value="rider">Riders</option><option value="admin">Admins</option><option value="super_admin">Super admins</option></select><select id="ml-admin-crm-status" class="inp" style="flex:0 1 130px"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select><button type="button" class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CRM()">Search</button></div></div>'+
        '<div class="ml-section-head"><h3>People and accounts</h3><span>'+adminSafe(data.total||rows.length)+' records</span></div>'+
        (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){var photo=x.profile_photo_url?'<img class="ml-crm-avatar" src="'+adminSafe(x.profile_photo_url)+'" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><span class="ml-crm-avatar-fallback" style="display:none">♙</span>':'<span class="ml-crm-avatar-fallback">♙</span>';return '<button type="button" class="ml-profile-row ml-crm-user-row" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer" onclick="window.__ML_ADMIN_CRM_PROFILE(\''+adminSafe(x.id)+'\')">'+photo+'<div class="copy"><b>'+adminSafe(x.full_name||'MarketLink user')+'</b><span>'+adminSafe(x.phone||'No phone')+' · '+adminSafe(x.email||'No email')+'</span><small>'+adminSafe((x.roles||[]).join(', ')||'No role')+' · '+adminSafe(x.status||'unknown')+' · Joined '+adminFormatDate(x.created_at)+'</small></div><span aria-hidden="true">›</span></button>';}).join('')+'</div>':'<div class="ml-empty"><b>No matching accounts</b><span>Try another name, phone number, email, role or status.</span></div>')+'</div>';
      var roleSelect=document.getElementById('ml-admin-crm-role'),statusSelect=document.getElementById('ml-admin-crm-status');
      if(roleSelect)roleSelect.value=role;
      if(statusSelect)statusSelect.value=status;
      var searchInput=document.getElementById('ml-admin-crm-search');
      if(searchInput)searchInput.addEventListener('keydown',function(event){if(event.key==='Enter')window.__ML_ADMIN_CRM();});
    }catch(e){root.innerHTML='<div class="ml-empty"><b>CRM directory unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CRM()">Retry</button></div>';}
  }
  async function adminAccessManagement(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Staff & access management</h3><p>Loading MarketLink accounts…</p></div>';
    try{
      var term=String((document.getElementById('ml-admin-access-search')||{}).value||'').trim();
      var params=new URLSearchParams({page:'1',limit:'100',status:'active'});
      if(term)params.set('search',term);
      var data=await adminRequest('/admin/users?'+params.toString(),'GET');
      var rows=Array.isArray(data.items)?data.items:[];
      var canGrant=data.canManageAdminRoles===true;
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>Staff & access management</h3><p style="margin:5px 0;color:var(--mu)">Find an existing MarketLink account and grant administrator access</p></div><button type="button" onclick="window.__ML_ADMIN_ACCESS()">Refresh</button></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin:12px 0"><label class="ml-admin-label" for="ml-admin-access-search">Search active users by name, phone or email</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ml-admin-access-search" class="inp" maxlength="120" value="'+adminSafe(term)+'" placeholder="Search MarketLink users" style="flex:1;min-width:180px"><button type="button" class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_ACCESS()">Search accounts</button></div>'+
        (canGrant?'<p style="font-size:11px;color:var(--mu);margin:10px 0 0">Administrator grants are recorded in the audit trail. This action grants the Admin role only; it never grants super administrator access.</p>':'<p style="font-size:11px;color:var(--mu);margin:10px 0 0">Read-only view. Only a super administrator can grant administrator access.</p>')+'</div>'+
        '<div class="ml-section-head"><h3>Active MarketLink accounts</h3><span>'+adminSafe(data.total||rows.length)+' accounts</span></div>'+
        (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){
          var roles=Array.isArray(x.roles)?x.roles:[];
          var hasAdmin=roles.indexOf('admin')>=0||roles.indexOf('super_admin')>=0;
          var action=hasAdmin?'<span class="ml-access-assigned">Admin access already active</span>':(canGrant?'<button type="button" class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.__ML_ADMIN_GRANT_ROLE(\''+adminSafe(x.id)+'\')">Grant Admin role</button>':'<span style="font-size:11px;color:var(--mu)">No admin access</span>');
          return '<div class="ml-profile-row" style="align-items:center;gap:12px"><div class="copy" style="min-width:0;flex:1"><b>'+adminSafe(x.full_name||'MarketLink user')+'</b><span>'+adminSafe(x.phone||'No phone')+' · '+adminSafe(x.email||'No email')+'</span><small>'+adminSafe(roles.join(', ')||'No role')+' · '+adminSafe(x.status||'active')+'</small>'+action+'</div></div>';
        }).join('')+'</div>':'<div class="ml-empty"><b>No active accounts found</b><span>Try a different name, phone number or email.</span></div>')+'</div>';
      var search=document.getElementById('ml-admin-access-search');
      if(search)search.addEventListener('keydown',function(event){if(event.key==='Enter')window.__ML_ADMIN_ACCESS();});
    }catch(e){
      root.innerHTML='<div class="ml-empty"><b>Access management unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_ACCESS()">Retry</button></div>';
    }
  }
  async function adminGrantRole(id){
    if(!id)return;
    if(!window.confirm('Grant the Admin role to this account? The account will be able to sign in to the MarketLink Admin Portal using its existing phone number and PIN.'))return;
    try{
      var result=await adminRequest('/admin/users/'+encodeURIComponent(id)+'/roles','POST',{role:'admin'});
      if(window.toast)window.toast(result.alreadyAssigned?'This account already has administrator access.':'Administrator access granted. Ask the user to sign in again to refresh their role.','success');
      await adminAccessManagement();
    }catch(e){if(window.toast)window.toast(e.message||'Could not grant administrator access.','error');}
  }
  window.__ML_ADMIN_ACCESS=adminAccessManagement;
  window.__ML_ADMIN_GRANT_ROLE=adminGrantRole;

  async function adminSupportQueue(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Customer support desk</h3><p>Loading the live support queue…</p></div>';
    try{
      var status=String((document.getElementById('ml-admin-support-status')||{}).value||'').trim();
      var term=String((document.getElementById('ml-admin-support-search')||{}).value||'').trim();
      var params=new URLSearchParams({page:'1',limit:'50'});
      if(status)params.set('status',status);
      if(term)params.set('search',term);
      var data=await adminRequest('/admin/support-tickets?'+params.toString(),'GET'),rows=Array.isArray(data.items)?data.items:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>Support desk</h3><p style="margin:5px 0;color:var(--mu)">Review and respond to customer, vendor and rider requests</p></div><button onclick="window.__ML_ADMIN_SUPPORT()">Refresh</button></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin:12px 0"><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="ml-admin-support-status" class="inp" style="flex:0 1 160px"><option value="">All statuses</option><option value="open">Open</option><option value="pending">Pending</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><input id="ml-admin-support-search" class="inp" maxlength="200" value="'+adminSafe(term)+'" placeholder="Search ticket, subject, name or phone" style="flex:1;min-width:180px"><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_SUPPORT()">Filter</button></div></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Open</div><div class="ml-stat-value">'+rows.filter(function(x){return x.status==='open';}).length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Escalated</div><div class="ml-stat-value">'+rows.filter(function(x){return x.status==='escalated';}).length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Total matches</div><div class="ml-stat-value">'+adminSafe(data.total||0)+'</div></div></div>'+
        (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer" onclick="window.__ML_ADMIN_TICKET(\''+adminSafe(x.id)+'\')"><div class="ico">🎧</div><div class="copy"><b>'+adminSafe(x.ticket_number||'Support ticket')+' · '+adminSafe(x.subject||'No subject')+'</b><span>'+adminSafe(x.requester_name||'MarketLink user')+' · '+adminSafe(x.requester_phone||'No phone')+'</span><small>'+adminSafe(x.category||'general')+' · '+adminSafe(x.priority||'normal')+' priority · '+adminSafe(x.status||'open')+' · '+adminFormatDate(x.created_at)+'</small></div><span>›</span></button>';}).join('')+'</div>':'<div class="ml-empty"><b>No support tickets found</b><span>There are no tickets matching these filters.</span></div>')+'</div>';
      var statusSelect=document.getElementById('ml-admin-support-status');if(statusSelect)statusSelect.value=status;
      var searchInput=document.getElementById('ml-admin-support-search');if(searchInput)searchInput.addEventListener('keydown',function(event){if(event.key==='Enter')window.__ML_ADMIN_SUPPORT();});
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Support queue unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_SUPPORT()">Retry</button></div>';}
  }
  async function adminTicketDetail(id){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><p>Loading support conversation…</p></div>';
    try{
      var data=await adminRequest('/admin/support-tickets/'+encodeURIComponent(id),'GET'),t=data.ticket||{},replies=Array.isArray(data.replies)?data.replies:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Support conversation</h3><button onclick="window.__ML_ADMIN_SUPPORT()">← Support queue</button></div><div class="ml-profile-card" style="padding:16px"><h3 style="margin:0 0 8px">'+adminSafe(t.ticket_number||'Support ticket')+' · '+adminSafe(t.subject||'No subject')+'</h3><p style="color:var(--mu);font-size:12px">'+adminSafe(t.requester_name||'MarketLink user')+' · '+adminSafe(t.requester_phone||'')+' · '+adminSafe(t.requester_email||'')+'</p><p style="font-size:12px;line-height:1.7;white-space:pre-wrap">'+adminSafe(t.description||'')+'</p><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="ml-admin-label">Status<select id="ml-admin-ticket-status" class="inp"><option value="open">Open</option><option value="pending">Pending</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label class="ml-admin-label">Priority<select id="ml-admin-ticket-priority" class="inp"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><button class="ml-btn ml-btn-secondary" style="margin-top:10px" onclick="window.__ML_ADMIN_TICKET_SAVE(\''+adminSafe(t.id)+'\')">Save ticket status</button></div><div class="ml-section-head"><h3>Conversation</h3></div><div class="ml-profile-card">'+(replies.length?replies.map(function(r){return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(r.sender_name||'Participant')+'</b><span style="white-space:pre-wrap">'+adminSafe(r.body)+'</span><small>'+adminFormatDate(r.created_at)+'</small></div></div>';}).join(''):'<div class="ml-empty">No replies yet.</div>')+'</div><div class="ml-profile-card" style="padding:14px"><label class="ml-admin-label" for="ml-admin-ticket-reply">Reply to requester</label><textarea id="ml-admin-ticket-reply" class="inp" rows="4" maxlength="4000" placeholder="Write a helpful response…"></textarea><button class="ml-btn ml-btn-primary" style="margin-top:9px" onclick="window.__ML_ADMIN_TICKET_REPLY(\''+adminSafe(t.id)+'\')">Send reply</button></div></div>';
      var st=document.getElementById('ml-admin-ticket-status'),pr=document.getElementById('ml-admin-ticket-priority');if(st)st.value=t.status||'open';if(pr)pr.value=t.priority||'medium';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Support ticket unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminTicketSave(id){
    var status=document.getElementById('ml-admin-ticket-status'),priority=document.getElementById('ml-admin-ticket-priority');
    try{await adminRequest('/admin/support-tickets/'+encodeURIComponent(id),'PATCH',{status:status&&status.value,priority:priority&&priority.value});if(window.toast)window.toast('Support ticket updated.','success');await adminTicketDetail(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  async function adminTicketReply(id){
    var field=document.getElementById('ml-admin-ticket-reply'),body=String(field&&field.value||'').trim();
    if(!body){if(window.toast)window.toast('Write a reply before sending.','error');return;}
    try{await adminRequest('/admin/support-tickets/'+encodeURIComponent(id)+'/replies','POST',{body:body});if(window.toast)window.toast('Reply sent to the requester.','success');await adminTicketDetail(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  function adminCrmFieldLabel(key){
    return String(key||'').replace(/_/g,' ').replace(/\b\w/g,function(ch){return ch.toUpperCase();});
  }
  function adminCrmValue(value){
    if(value===null||value===undefined||value==='')return 'Not provided';
    if(typeof value==='boolean')return value?'Yes':'No';
    if(Array.isArray(value))return value.join(', ')||'Not provided';
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  }
  function adminCrmSection(title,record,exclude){
    if(!record)return '';
    var skip=new Set(['user_id','id','created_at','updated_at','password_hash','pin_hash','national_id','id_document_url','license_document_url','vehicle_photo_url','kyc_reviewed_by']);
    (exclude||[]).forEach(function(k){skip.add(k);});
    var fields=Object.keys(record).filter(function(k){return !skip.has(k)&&record[k]!==null&&record[k]!==''&&(typeof record[k]!=='object'||Array.isArray(record[k]));});
    if(!fields.length)return '';
    return '<section class="ml-crm-detail-section"><h4>'+adminSafe(title)+'</h4><div class="ml-crm-detail-grid">'+fields.map(function(k){return '<div class="ml-crm-detail-field"><small>'+adminSafe(adminCrmFieldLabel(k))+'</small><b>'+adminSafe(adminCrmValue(record[k]))+'</b></div>';}).join('')+'</div></section>';
  }
  function adminCrmDetails(data){
    var sections='';
    sections+=adminCrmSection('Account information',data.user,['profile_photo_url','roles','status','last_login_at']);
    sections+=adminCrmSection('Customer profile',data.customer,['profile_photo_url','referral_code','referred_by']);
    sections+=adminCrmSection('Vendor profile',data.vendor,['logo_url','banner_url','shop_photo_url','id_document_url']);
    sections+=adminCrmSection('Rider profile',data.rider,['profile_photo_url','id_document_url','license_document_url','vehicle_photo_url']);
    return sections?'<div class="ml-crm-details">'+sections+'</div>':'<div class="ml-empty">No additional profile details have been provided yet.</div>';
  }

  async function adminCrmProfile(id){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><p>Loading CRM profile…</p></div>';
    try{
      var d=await adminRequest('/admin/users/'+encodeURIComponent(id)+'/profile','GET'),u=d.user;
      var canStartChat=(u.roles||[]).some(function(role){return ['customer','vendor','rider'].indexOf(role)>=0;});
      var startChatButton=canStartChat?'<button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_START_CHAT(\''+adminSafe(u.id)+'\')">Start direct chat</button>':'';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>CRM profile</h3><div style="display:flex;gap:8px;flex-wrap:wrap">'+startChatButton+'<button onclick="window.__ML_ADMIN_CRM()">← Directory</button></div></div><div class="ml-profile-card"><div class="ml-profile-row ml-crm-profile-head">'+(u.profile_photo_url?'<img class="ml-crm-profile-photo" src="'+adminSafe(u.profile_photo_url)+'" alt="'+adminSafe(u.full_name)+' profile photo" onerror="this.onerror=null;var p=document.createElement(\'div\');p.className=\'ml-crm-profile-placeholder\';p.textContent=\'♙\';this.replaceWith(p)">':'<div class="ml-crm-profile-placeholder">♙</div>')+'<div class="copy"><b>'+adminSafe(u.full_name)+'</b><span>'+adminSafe(u.phone)+' · '+adminSafe(u.email||'No email')+'</span><small>'+adminSafe((u.roles||[]).join(', '))+' · '+adminSafe(u.status)+'</small><small>Orders: '+adminSafe(u.orders_count)+' · Support tickets: '+adminSafe(u.support_tickets)+'</small></div></div></div>'+adminCrmDetails(d)+'<div class="ml-section-head"><h3>Internal CRM notes</h3></div><div class="ml-profile-card" style="padding:14px"><textarea id="ml-admin-crm-note" class="inp" rows="3" maxlength="4000" placeholder="Add a private note for authorised MarketLink staff…"></textarea><button class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.__ML_ADMIN_CRM_NOTE(\''+adminSafe(u.id)+'\')">Save private note</button></div>'+
      ((d.notes||[]).length?'<div class="ml-profile-card">'+d.notes.map(function(n){return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(n.author_name||'Admin')+'</b><span>'+adminSafe(n.note)+'</span><small>'+adminFormatDate(n.created_at)+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty">No internal notes recorded.</div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>CRM profile unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminCrmAddNote(id){
    var field=document.getElementById('ml-admin-crm-note'),note=String(field&&field.value||'').trim();if(!note){if(window.toast)window.toast('Enter a note first.','error');return;}
    try{await adminRequest('/admin/users/'+encodeURIComponent(id)+'/notes','POST',{note:note});if(window.toast)window.toast('Private CRM note saved.','success');await adminCrmProfile(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  window.__ML_ADMIN_SUPPORT=adminSupportQueue;
  window.__ML_ADMIN_TICKET=adminTicketDetail;
  window.__ML_ADMIN_TICKET_SAVE=adminTicketSave;
  window.__ML_ADMIN_TICKET_REPLY=adminTicketReply;
  window.__ML_ADMIN_CRM=adminCrmView;
  window.__ML_ADMIN_CRM_PROFILE=adminCrmProfile;
  window.__ML_ADMIN_CRM_NOTE=adminCrmAddNote;


  var adminCampaignSelectedRecipients = {};
  async function adminCampaignView(){
    adminCampaignSelectedRecipients={};
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Communications centre</h3><p>Loading campaign history…</p></div>';
    try{
      var d=await adminRequest('/notifications/admin/campaigns?page=1&limit=50','GET'),rows=d.items||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Communications centre</h3><button onclick="window.__ML_ADMIN_CAMPAIGNS()">Refresh</button></div><div class="ml-profile-card" style="padding:14px;margin:12px 0"><h3 style="margin:0 0 12px">Create a campaign draft</h3><label class="ml-admin-label" for="ml-campaign-title">Message title</label><input id="ml-campaign-title" class="inp" maxlength="200" placeholder="e.g. MarketLink service update"><label class="ml-admin-label" for="ml-campaign-body" style="margin-top:10px">Message</label><textarea id="ml-campaign-body" class="inp" rows="3" maxlength="4000" placeholder="Write the message for recipients…"></textarea><label class="ml-admin-label" for="ml-campaign-audience" style="margin-top:10px">Audience</label><select id="ml-campaign-audience" class="inp" onchange="window.__ML_ADMIN_CAMPAIGN_AUDIENCE_CHANGE()"><option value="all">All active users</option><option value="customers">Customers</option><option value="vendors">Vendors</option><option value="riders">Riders</option><option value="admins">Administrators</option><option value="selected">Select individual people</option></select><div id="ml-campaign-recipient-picker" style="display:none;margin:12px 0;padding:12px;border:1px solid var(--bd);border-radius:12px"><label class="ml-admin-label" for="ml-campaign-recipient-search">Find a customer, vendor or rider</label><div style="display:flex;gap:8px"><input id="ml-campaign-recipient-search" class="inp" maxlength="100" placeholder="Search name, phone or email"><button type="button" class="ml-btn" onclick="window.__ML_ADMIN_CAMPAIGN_SEARCH()">Search</button></div><div id="ml-campaign-recipient-results" style="margin-top:10px"><small>Search the directory, then select recipients below.</small></div><div id="ml-campaign-recipient-count" style="margin-top:8px;font-size:12px;font-weight:700">0 selected (maximum 100)</div></div><div style="display:flex;gap:14px;flex-wrap:wrap;margin:12px 0"><label><input type="checkbox" id="ml-campaign-email"> Email</label><label><input type="checkbox" id="ml-campaign-sms"> SMS</label><label><input type="checkbox" id="ml-campaign-push"> Push</label><span style="font-size:11px;color:var(--mu)">🔔 In-app notifications are always included; email, SMS and push are optional provider channels.</span></div><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CAMPAIGN_CREATE()">Save campaign draft</button></div><div class="ml-section-head"><h3>Campaign history</h3></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">📣</div><div class="copy"><b>'+adminSafe(x.title)+'</b><span>'+adminSafe(x.audience)+' · '+adminSafe(x.status)+'</span><small>Recipients '+adminSafe(x.recipient_count)+' · Sent '+adminSafe(x.sent_count)+' · Failed/partial '+adminSafe(x.failed_count)+' · '+adminFormatDate(x.created_at)+'</small>'+(x.status==='draft'?'<button class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.__ML_ADMIN_CAMPAIGN_SEND(&quot;'+adminSafe(x.id)+'&quot;)">Send campaign</button>':'')+'</div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No campaigns yet</b><span>Drafts and sent campaigns will appear here.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Communications centre unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminCampaignSearchRecipients(){
    var input=document.getElementById('ml-campaign-recipient-search'),target=document.getElementById('ml-campaign-recipient-results');
    if(!input||!target)return;
    var term=String(input.value||'').trim();
    if(term.length<2){target.innerHTML='<small>Enter at least two characters to search.</small>';return;}
    target.innerHTML='<small>Searching the secure directory…</small>';
    try{
      var result=await adminRequest('/admin/users?search='+encodeURIComponent(term)+'&status=active&page=1&limit=25','GET');
      var users=(result.items||[]).filter(function(person){return (person.roles||[]).some(function(role){return ['customer','vendor','rider'].includes(role);});});
      target.innerHTML=users.length?users.map(function(person){
        var id=String(person.id||''),checked=!!adminCampaignSelectedRecipients[id];
        return '<label style="display:flex;align-items:center;gap:9px;padding:9px 4px;border-bottom:1px solid var(--bd);font-size:12px"><input type="checkbox" '+(checked?'checked':'')+' onchange="window.__ML_ADMIN_CAMPAIGN_SELECT(\''+adminSafe(id)+'\',this.checked)"><span style="min-width:0"><b>'+adminSafe(person.full_name||'MarketLink user')+'</b><br><small>'+adminSafe(person.phone||'No phone')+' · '+adminSafe((person.roles||[]).join(', '))+'</small></span></label>';
      }).join(''):'<small>No matching active users found.</small>';
    }catch(error){target.innerHTML='<small>'+adminSafe(error.message||'Directory search failed.')+'</small>';}
  }
  function adminCampaignSelectRecipient(id,checked){
    if(checked){if(Object.keys(adminCampaignSelectedRecipients).length>=100){if(window.toast)window.toast('A campaign can target up to 100 individual recipients.','error');return;}adminCampaignSelectedRecipients[id]=true;}
    else delete adminCampaignSelectedRecipients[id];
    var count=document.getElementById('ml-campaign-recipient-count');
    if(count)count.textContent=Object.keys(adminCampaignSelectedRecipients).length+' selected (maximum 100)';
    var input=document.querySelector('#ml-campaign-recipient-results input[type="checkbox"][onchange*="'+id+'"]');
    if(input)input.checked=!!adminCampaignSelectedRecipients[id];
  }
  function adminCampaignAudienceChange(){
    var audience=document.getElementById('ml-campaign-audience'),picker=document.getElementById('ml-campaign-recipient-picker');
    if(picker)picker.style.display=audience&&audience.value==='selected'?'block':'none';
    if(!audience||audience.value!=='selected'){
      adminCampaignSelectedRecipients={};
      var count=document.getElementById('ml-campaign-recipient-count');if(count)count.textContent='0 selected (maximum 100)';
    }
  }
  window.__ML_ADMIN_CAMPAIGN_SEARCH=adminCampaignSearchRecipients;
  window.__ML_ADMIN_CAMPAIGN_SELECT=adminCampaignSelectRecipient;
  window.__ML_ADMIN_CAMPAIGN_AUDIENCE_CHANGE=adminCampaignAudienceChange;
  async function adminCampaignCreate(){
    var title=String(document.getElementById('ml-campaign-title').value||'').trim(),body=String(document.getElementById('ml-campaign-body').value||'').trim(),audience=document.getElementById('ml-campaign-audience').value;
    if(!title){if(window.toast)window.toast('Enter a campaign title.','error');return;}
    var channels={email:document.getElementById('ml-campaign-email').checked,sms:document.getElementById('ml-campaign-sms').checked,push:document.getElementById('ml-campaign-push').checked};
    var recipientIds=Object.keys(adminCampaignSelectedRecipients);
    if(audience==='selected'&&(!recipientIds.length||recipientIds.length>100)){if(window.toast)window.toast('Select between 1 and 100 people for this campaign.','error');return;}
    try{await adminRequest('/notifications/admin/campaigns','POST',{title:title,body:body,audience:audience,channels:channels,recipientIds:audience==='selected'?recipientIds:[]});if(window.toast)window.toast('Campaign draft saved.','success');await adminCampaignView();}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  async function adminCampaignSend(id){
    if(!window.confirm('Send this campaign to the selected audience now? This action will contact real users.'))return;
    try{var r=await adminRequest('/notifications/admin/campaigns/'+encodeURIComponent(id)+'/send','POST',{});if(window.toast)window.toast('Campaign processed. '+(r.sent_count||0)+' sent; '+(r.failed_count||0)+' failed or partial.','success');await adminCampaignView();}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  window.__ML_ADMIN_CAMPAIGNS=adminCampaignView;
  window.__ML_ADMIN_CAMPAIGN_CREATE=adminCampaignCreate;
  window.__ML_ADMIN_CAMPAIGN_SEND=adminCampaignSend;

  // MarketLink AI Training & Experimentation Centre.
  // This manages the production retrieval knowledge base; it does not fine-tune model weights.
  var adminAiDraftData = null;
  async function adminAiTrainingView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>🧠 MarketLink AI Training Centre</h3><p>Loading approved knowledge and live assistant tools…</p></div>';
    try{
      var result=await adminRequest('/admin/knowledge?page=1&limit=50','GET');
      var rows=Array.isArray(result)?result:(Array.isArray(result.items)?result.items:[]);
      root.innerHTML='<div class="ml-premium-home">'+
        '<div class="ml-section-head"><div><div class="ml-eyebrow">ROYAL FINTECH · MARKETLINK AI</div><h3>🧠 AI Training & Experimentation</h3><p style="margin:5px 0;color:var(--mu)">Teach MarketLink local knowledge, test answers and review what is active.</p></div><button onclick="window.__ML_ADMIN_AI()">🔄 Refresh</button></div>'+
        '<div class="ml-wallet-note">Important: MarketLink Assistant currently uses a searchable knowledge base. Saving approved entries updates what the assistant can retrieve; it does not fine-tune an external model or change model weights.</div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Knowledge entries loaded</div><div class="ml-stat-value">'+rows.length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Active entries</div><div class="ml-stat-value">'+rows.filter(function(x){return x.status==='active';}).length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Inactive entries</div><div class="ml-stat-value">'+rows.filter(function(x){return x.status==='inactive';}).length+'</div></div></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin-top:12px"><h3>🎓 Teach MarketLink a new word, phrase or rule</h3><p style="color:var(--mu);font-size:12px">Add Gambian expressions, local terminology, marketplace policies, delivery instructions and approved answers.</p><label class="ml-admin-label">Knowledge statement</label><textarea id="ml-ai-teach-statement" class="inp" rows="4" maxlength="2000" placeholder="Example: In The Gambia, customers may say “send am” when asking a vendor to arrange delivery. In MarketLink, guide them to place an order and confirm the delivery address."></textarea><button class="ml-btn ml-btn-primary" style="margin-top:10px" onclick="window.__ML_ADMIN_AI_DRAFT()">✨ Create teaching draft</button><div id="ml-ai-teach-preview" style="margin-top:10px"></div></div>'+
        '<div class="ml-profile-card" style="padding:14px;margin-top:12px"><h3>🧪 Test the live MarketLink Assistant</h3><p style="color:var(--mu);font-size:12px">Ask a question and inspect the actual production assistant response before changing knowledge.</p><label class="ml-admin-label">Test question</label><textarea id="ml-ai-test-question" class="inp" rows="2" maxlength="500" placeholder="Try a local word or customer question…"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><select id="ml-ai-test-role" class="inp" style="flex:1;min-width:140px"><option value="customer">Customer context</option><option value="vendor">Vendor context</option><option value="rider">Rider context</option><option value="admin">Admin context</option></select><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_AI_TEST()">▶ Test assistant</button></div><div id="ml-ai-test-result" style="margin-top:12px"></div></div>'+
        '<div class="ml-section-head"><h3>📚 Knowledge currently available to MarketLink AI</h3><span>'+rows.length+' entries</span></div>'+
        (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">📘</div><div class="copy"><b>'+adminSafe(x.title||'Untitled knowledge')+'</b><span>'+adminSafe(x.category||'general')+' · '+adminSafe((x.roles||[]).join(', ')||'all roles')+'</span><small>'+adminSafe(x.status||'unknown')+' · Priority '+adminSafe(x.priority||0)+'</small><small>'+adminSafe(x.answer||'')+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No knowledge entries returned</b><span>Create an approved teaching entry to begin.</span></div>')+
        '</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>AI Training Centre unavailable</b><span>'+adminSafe(e.message)+'</span><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_AI()">Retry</button></div>';}
  }
  async function adminAiDraft(){
    var field=document.getElementById('ml-ai-teach-statement'),preview=document.getElementById('ml-ai-teach-preview'),statement=String(field&&field.value||'').trim();
    if(!statement){if(window.toast)window.toast('Enter a word, phrase or rule to teach.','error');return;}
    if(preview)preview.textContent='Preparing a draft…';
    try{
      var d=await adminRequest('/admin/knowledge/teach','POST',{statement:statement,save:false});
      adminAiDraftData=d;
      if(preview)preview.innerHTML='<div class="ml-wallet-note"><b>Review this draft before adding it:</b><br>Title: '+adminSafe(d.title)+'<br>Category: '+adminSafe(d.category)+'<br>Question: '+adminSafe(d.question)+'<br>Answer: '+adminSafe(d.answer)+'<br>Keywords: '+adminSafe((d.keywords||[]).join(', '))+'<div style="margin-top:10px"><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_AI_SAVE()">✅ Add approved knowledge</button> <button class="ml-btn" onclick="window.__ML_ADMIN_AI_DRAFT()">↻ Regenerate draft</button></div></div>';
    }catch(e){if(preview)preview.textContent=e.message;}
  }
  async function adminAiSaveDraft(){
    if(!adminAiDraftData)return;
    try{
      await adminRequest('/admin/knowledge','POST',adminAiDraftData);
      adminAiDraftData=null;if(window.toast)window.toast('Knowledge entry saved. MarketLink AI can now retrieve it.','success');
      await adminAiTrainingView();
    }catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  async function adminAiTest(){
    var question=String((document.getElementById('ml-ai-test-question')||{}).value||'').trim();
    var role=String((document.getElementById('ml-ai-test-role')||{}).value||'customer');
    var target=document.getElementById('ml-ai-test-result');
    if(!question){if(window.toast)window.toast('Enter a test question.','error');return;}
    if(target)target.textContent='Asking the live MarketLink Assistant…';
    try{
      var result=await adminRequest('/assistant/ask','POST',{question:question,role:role});
      if(target)target.innerHTML='<div class="ml-wallet-note"><b>🤖 Assistant response</b><p style="white-space:pre-wrap">'+adminSafe(result.answer||result.reply||result.message||JSON.stringify(result))+'</p><small>Source: '+adminSafe(result.source||'unknown')+' · Confidence: '+adminSafe(result.confidence||'not rated')+' · Matched knowledge ID: '+adminSafe(result.matchedEntryId||'none')+' · '+adminSafe(role)+' context</small>'+(result.relatedQuestions&&result.relatedQuestions.length?'<p><b>Related questions</b><br>'+result.relatedQuestions.map(adminSafe).join('<br>')+'</p>':'')+'</div>';
    }catch(e){if(target)target.innerHTML='<div class="ml-empty"><b>Test failed</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  window.__ML_ADMIN_AI=adminAiTrainingView;
  window.__ML_ADMIN_AI_DRAFT=adminAiDraft;
  window.__ML_ADMIN_AI_SAVE=adminAiSaveDraft;
  window.__ML_ADMIN_AI_TEST=adminAiTest;


  async function adminAffiliateDirectory(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-eyebrow">PARTNER NETWORK</div><h3>Affiliate partners</h3><p>Loading affiliate accounts and settled rewards…</p></div>';
    try{
      var data=await adminRequest('/admin/affiliates?page=1&limit=100','GET');
      var rows=Array.isArray(data.items)?data.items:(Array.isArray(data)?data:[]);
      var totals=rows.reduce(function(a,x){a.clicks+=Number(x.total_clicks||0);a.orders+=Number(x.delivered_orders||0);a.earned+=Number(x.settled_commission||0);a.wallet+=Number(x.wallet_balance||0);return a;},{clicks:0,orders:0,earned:0,wallet:0});
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">PARTNER NETWORK · FINANCE</div><h3>Affiliate partners</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_AFFILIATES()">↻ Refresh</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 14px;padding:12px;border-radius:12px"><b>Affiliate programme guide:</b> The current reward is 2% of eligible discounted merchandise, funded from MarketLink’s 5% platform commission. It is not added to the customer’s bill. Rewards are credited to the affiliate’s DAHA Wallet only after successful delivery and confirmed payment. Withdrawals remain subject to the normal payout review and minimum withdrawal rules.</div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Affiliate accounts</div><div class="ml-stat-value">'+Number(data.total||rows.length)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Tracked clicks (listed)</div><div class="ml-stat-value">'+totals.clicks+'</div></div><div class="ml-stat"><div class="ml-stat-label">Delivered referred orders</div><div class="ml-stat-value">'+totals.orders+'</div></div><div class="ml-stat"><div class="ml-stat-label">Settled affiliate rewards</div><div class="ml-stat-value">D '+totals.earned.toFixed(2)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Affiliate wallet balances</div><div class="ml-stat-value">D '+totals.wallet.toFixed(2)+'</div></div></div>'+
      (rows.length?'<div class="ml-profile-card" style="margin-top:14px">'+rows.map(function(x){
        var name=adminSafe(x.full_name||'Affiliate partner'),code=adminSafe(x.affiliate_code||'');
        return '<div class="ml-profile-row"><div class="ico">🔗</div><div class="copy"><b>'+name+'</b><span>Code: '+code+' · '+adminSafe(x.phone||x.email||'No contact details')+'</span><small>'+Number(x.total_clicks||0)+' clicks · '+Number(x.delivered_orders||0)+' delivered orders · Rate '+Number(x.commission_pct||0)+'%</small><small>Settled rewards D '+Number(x.settled_commission||0).toFixed(2)+' · Wallet D '+Number(x.wallet_balance||0).toFixed(2)+' · Account '+adminSafe(x.status||'active')+'</small><button class="ml-btn ml-btn-secondary" style="margin-top:7px;font-size:10px;padding:6px 9px" onclick="window.__ML_ADMIN_AFFILIATE_COPY(&quot;'+code+'&quot;)">Copy referral link</button></div></div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No affiliate accounts yet</b><span>Affiliate users will appear here after they activate the programme from their MarketLink profile. No commissions have been generated from orders yet.</span></div>')+
      '<div class="ml-wallet-note" style="margin-top:12px;padding:12px;border-radius:12px">Admin control: use the DAHA ledger and Withdrawals pages to inspect actual wallet credits and payout requests. This directory is a reporting view; it does not manually create, approve or pay commissions.</div></div>';
    }catch(e){
      root.innerHTML='<div class="ml-empty"><b>Affiliate directory unavailable</b><span>'+adminSafe(e.error||e.message||'Could not load affiliate records.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:10px" onclick="window.__ML_ADMIN_AFFILIATES()">Retry</button></div>';
    }
  }
  window.__ML_ADMIN_AFFILIATES=adminAffiliateDirectory;
  window.__ML_ADMIN_AFFILIATE_COPY=function(code){
    if(!code)return;
    var link='https://marketlink-gambia-frontend.onrender.com/?ref='+encodeURIComponent(code);
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(function(){if(window.toast)window.toast('Affiliate link copied.','success');}).catch(function(){window.prompt('Copy affiliate link:',link);});}
    else window.prompt('Copy affiliate link:',link);
  };

  function adminNavigate(key) {
    var api = window.ML_Premium || {};
    var routes = {
      overview: function () { if (api.adminRefresh) api.adminRefresh(); },
      audit: adminAuditView,
      support: adminSupportQueue,
      chat: adminChatView,
      communications: adminCampaignView,
      crm: adminCrmView,
      access: adminAccessManagement,
      settings: adminSettingsView,
      vendors: function () { if (api.adminApprovals) api.adminApprovals('vendor'); },
      riders: function () { if (api.adminApprovals) api.adminApprovals('rider'); },
      promotions: adminPromotionsView,
      affiliates: adminAffiliateDirectory,
      analytics: function () { if (api.refreshAdminAnalytics) api.refreshAdminAnalytics(); },
      revenue: function () { if (api.refreshAdminRevenue) api.refreshAdminRevenue(); },
      payouts: function () { if (api.refreshAdminPayouts) api.refreshAdminPayouts(); },
      reconciliation: function () { if (api.refreshFinancialReconciliation) api.refreshFinancialReconciliation(); },
      commission: adminCommissionSettingsView,
      ledger: function () { if (api.refreshAdminTransactions) api.refreshAdminTransactions(1); },
      exceptions: function () { if (api.refreshAdminFailedPayments) api.refreshAdminFailedPayments(1); },
      users: function () { if (api.adminUsers) api.adminUsers(); },
      ai: adminAiTrainingView
    };
    var pendingRoute = routes[key] ? routes[key]() : null;
    document.querySelectorAll('[data-ml-admin-route]').forEach(function (el) {
      var active = el.getAttribute('data-ml-admin-route') === key;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-current', active ? 'page' : 'false');
    });
    var drawer = document.getElementById('ml-admin-drawer');
    if (drawer) drawer.classList.remove('is-open');
    return pendingRoute;
  }

  function applyAdminTheme(){
    var root=document.getElementById('ml-admin-workspace');if(!root)return;
    var theme='light';try{theme=localStorage.getItem('ml_admin_theme')||'light';}catch(e){}
    root.classList.toggle('ml-admin-dark',theme==='dark');
    var toggle=document.getElementById('ml-admin-theme-toggle');
    if(toggle){toggle.setAttribute('aria-pressed',theme==='dark'?'true':'false');toggle.querySelector('.ml-admin-theme-icon').textContent=theme==='dark'?'☾':'☀';toggle.querySelector('.ml-admin-theme-label').textContent=theme==='dark'?'Dark mode':'Daylight mode';}
    document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';
  }
  function toggleAdminTheme(){
    var root=document.getElementById('ml-admin-workspace');if(!root)return;
    var next=root.classList.contains('ml-admin-dark')?'light':'dark';
    try{localStorage.setItem('ml_admin_theme',next);}catch(e){}
    root.classList.toggle('ml-admin-dark',next==='dark');applyAdminTheme();
  }

  function ensureAdminWorkspace() {
    var tab = document.getElementById('tab-admindash');
    var body = document.getElementById('adash-body');
    if (!tab || !body) return;
    var mounted = document.getElementById('ml-admin-workspace');
    if (mounted) {
      var mountedContent = mounted.querySelector('#ml-admin-content');
      if (mountedContent && body.parentNode !== mountedContent) mountedContent.appendChild(body);
      applyAdminTheme();
      tab.setAttribute('data-ml-admin-workspace', '1');
      tab.style.cssText = 'display:block!important;position:relative!important;inset:auto!important;float:none!important;clear:both!important;left:0!important;right:auto!important;transform:none!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important;padding:0!important;height:auto!important;min-height:100vh!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important;background:#f3f6fa;';
      body.style.cssText = 'display:block!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;float:none!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:clamp(14px,2.4vw,30px)!important;box-sizing:border-box!important;height:auto!important;min-height:55vh!important;max-height:none!important;overflow:visible!important;overflow-x:hidden!important;';
      return;
    }
    // Recover from a stale marker left by an interrupted/older mount.
    tab.removeAttribute('data-ml-admin-workspace');
    tab.setAttribute('data-ml-admin-workspace', '1');
    tab.style.cssText = 'display:block!important;position:relative!important;inset:auto!important;float:none!important;clear:both!important;left:0!important;right:auto!important;transform:none!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important;padding:0!important;height:auto!important;min-height:100vh!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important;background:#f3f6fa;';
    var shell = document.createElement('div');
    shell.id = 'ml-admin-workspace';
    shell.innerHTML =
      '<aside class="ml-admin-sidebar"><div class="ml-admin-side-brand"><img src="./assets/marketlink-logo.png" alt="MarketLink" onerror="this.onerror=null;this.src=\'https://marketlink-gambia-frontend.onrender.com/assets/marketlink-logo.png\';"><div><b>MARKETLINK</b><span>ADMINISTRATION</span></div></div>' +
      '<div class="ml-admin-side-label">🧭 WORKSPACE</div>' +
      '<nav class="ml-admin-nav" aria-label="Admin navigation">' +
      '<button data-ml-admin-route="overview" class="is-active"><span>🏠</span>Overview</button>' +
      '<button data-ml-admin-route="vendors"><span>🏪</span>Vendor approvals</button>' +
      '<button data-ml-admin-route="riders"><span>🛵</span>Rider approvals</button>' +
      '<button data-ml-admin-route="promotions"><span>🎯</span>Promotions</button>' +
      '<button data-ml-admin-route="affiliates"><span>🔗</span>Affiliate partners</button>' +
      '<div class="ml-admin-side-label">📈 INSIGHTS & FINANCE</div>' +
      '<button data-ml-admin-route="analytics"><span>📊</span>Analytics</button>' +
      '<button data-ml-admin-route="revenue"><span>💹</span>Revenue reports</button>' +
      '<button data-ml-admin-route="payouts"><span>💸</span>Withdrawals</button>' +
      '<button data-ml-admin-route="reconciliation"><span>🧾</span>Reconciliation</button>' +
      '<button data-ml-admin-route="commission"><span>⚖️</span>Commission control</button>' +
      '<button data-ml-admin-route="ledger"><span>📒</span>DAHA ledger</button>' +
      '<button data-ml-admin-route="exceptions"><span>🚨</span>Payment exceptions</button>' +
      '<div class="ml-admin-side-label">🛠️ MANAGEMENT</div>' +
      '<button data-ml-admin-route="audit"><span>🕵️</span>Audit trail</button>' +
      '<button data-ml-admin-route="support"><span>🎧</span>Support desk</button>' +
      '<button data-ml-admin-route="chat"><span>💬</span>Customer chat</button>' +
      '<button data-ml-admin-route="communications"><span>📨</span>Communications</button>' +
      '<button data-ml-admin-route="crm"><span>👥</span>CRM directory</button>' +
      '<button data-ml-admin-route="access"><span>🛡️</span>Staff & access</button>' +
      '<button data-ml-admin-route="settings"><span>⚙️</span>System settings</button>' +
      '<button data-ml-admin-route="ai"><span>🤖</span>AI operations</button>' +
      '</nav><div class="ml-admin-side-foot"><span class="ml-admin-secure-dot"></span> Protected operations<br><small>Powered by Royal FinTech</small></div></aside>' +
      '<div class="ml-admin-main"><header class="ml-admin-topbar"><button id="ml-admin-menu" class="ml-admin-menu" aria-label="Open navigation">🧭</button><img class="ml-admin-top-logo" src="./assets/marketlink-logo.png" alt="MarketLink Gambia" onerror="this.onerror=null;this.src=\'https://marketlink-gambia-frontend.onrender.com/assets/marketlink-logo.png\';"><div class="ml-admin-crumb"><span>MarketLink</span><b>/ Admin workspace</b></div><div class="ml-admin-top-actions"><span class="ml-admin-live"><i></i> Production</span><button class="ml-admin-refresh" id="ml-admin-refresh">🔄 <span>Refresh</span></button><button class="ml-admin-signout" id="ml-admin-signout">🚪 Sign out</button></div></header>' +
      '<div class="ml-admin-pagehead"><div><div class="ml-admin-overline">ROYAL FINTECH · OPERATIONS</div><h1>Administration</h1><p>Monitor and manage the MarketLink marketplace.</p></div><div class="ml-admin-date" id="ml-admin-date"></div></div>' +
      '<main class="ml-admin-content" id="ml-admin-content"></main></div>' +
      '<div class="ml-admin-mobilebar"><button data-ml-admin-route="overview" class="is-active"><b>🏠</b><span>Home</span></button><button data-ml-admin-route="vendors"><b>🏪</b><span>Vendors</span></button><button data-ml-admin-route="analytics"><b>📊</b><span>Insights</span></button><button data-ml-admin-route="payouts"><b>💸</b><span>Finance</span></button><button id="ml-admin-more"><b>🧭</b><span>More</span></button></div>' +
      '<div id="ml-admin-drawer" class="ml-admin-drawer"><div class="ml-admin-drawer-panel"><div class="ml-admin-drawer-head"><button type="button" class="ml-admin-drawer-brand" id="ml-admin-drawer-brand" aria-label="Close menu"><img src="./assets/marketlink-logo.png" alt="MarketLink Gambia" onerror="this.onerror=null;this.src=\'https://marketlink-gambia-frontend.onrender.com/assets/marketlink-logo.png\';"><span><b>MARKETLINK</b><small>ADMINISTRATION</small></span></button><button id="ml-admin-drawer-close" aria-label="Close navigation">✖️</button></div><div class="ml-admin-theme-row"><span>🎨 Appearance</span><button type="button" id="ml-admin-theme-toggle" aria-pressed="false"><span class="ml-admin-theme-icon">☀</span><span class="ml-admin-theme-label">Daylight</span><i></i></button></div><div class="ml-admin-drawer-links"></div><div class="ml-admin-drawer-foot">Protected administrator access<br><b>Royal FinTech Company</b></div></div></div>';
    tab.insertBefore(shell, body);
    document.getElementById('ml-admin-content').appendChild(body);
    body.style.cssText = 'display:block!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;float:none!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:clamp(14px,2.4vw,30px)!important;box-sizing:border-box!important;height:auto!important;min-height:55vh!important;max-height:none!important;overflow:visible!important;overflow-x:hidden!important;';
    var nav = shell.querySelector('.ml-admin-nav');
    var drawerLinks = shell.querySelector('.ml-admin-drawer-links');
    drawerLinks.innerHTML = nav.innerHTML;
    applyAdminTheme();
    shell.addEventListener('click', function (event) {
      if (event.target.closest('#ml-admin-drawer-brand') || event.target.closest('#ml-admin-drawer-close')) {
        document.getElementById('ml-admin-drawer').classList.remove('is-open');
        return;
      }
      if (event.target.closest('#ml-admin-theme-toggle')) { toggleAdminTheme(); return; }
      if (event.target.id === 'ml-admin-drawer') { event.target.classList.remove('is-open'); return; }
      var route = event.target.closest('[data-ml-admin-route]');
      if (route) { adminNavigate(route.getAttribute('data-ml-admin-route')); return; }
      if (event.target.closest('#ml-admin-menu') || event.target.closest('#ml-admin-more')) {
        document.getElementById('ml-admin-drawer').classList.add('is-open');
      }
      if (event.target.closest('#ml-admin-drawer-close')) {
        document.getElementById('ml-admin-drawer').classList.remove('is-open');
      }
      if (event.target.closest('#ml-admin-refresh')) {
        var refreshButton = document.getElementById('ml-admin-refresh');
        if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Refreshing…'; }
        adminNavigate('overview');
        window.setTimeout(function () {
          var current = document.getElementById('ml-admin-refresh');
          if (current) { current.disabled = false; current.innerHTML = '↻ <span>Refresh</span>'; }
        }, 900);
      }
      if (event.target.closest('#ml-admin-signout') && typeof window.adminLogout === 'function') window.adminLogout();
    });
    var date = document.getElementById('ml-admin-date');
    if (date) date.textContent = new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
    // The premium dashboard loader was started by switchTab('admindash').
    // Mounting the shell must not start another concurrent overview request.
    document.querySelectorAll('[data-ml-admin-route]').forEach(function (el) {
      var active = el.getAttribute('data-ml-admin-route') === 'overview';
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function installAdminWorkspaceStyles() {
    if (document.getElementById('ml-admin-workspace-style')) return;
    var css = document.createElement('style');
    css.id = 'ml-admin-workspace-style';
    css.textContent = [
      'html:has(#ml-admin-workspace),body:has(#ml-admin-workspace){width:100%!important;max-width:none!important;height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important}',
      'body:has(#ml-admin-workspace) #app{display:block!important;position:relative!important;width:100%!important;max-width:none!important;height:auto!important;min-height:100dvh!important;max-height:none!important;margin:0!important;overflow:visible!important}',
      'body:has(#ml-admin-workspace) #app,body:has(#ml-admin-workspace) #scr-app,body:has(#ml-admin-workspace) #tab-admindash{display:block!important;position:relative!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:0!important;left:auto!important;right:auto!important;transform:none!important;float:none!important}',
      'body:has(#ml-admin-workspace) .ml-admin-main{display:block!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;float:none!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;grid-column:1/-1!important}',
      '#tab-admindash>#ml-admin-workspace{display:grid!important;grid-template-columns:252px minmax(0,1fr)!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;box-sizing:border-box!important}',
      'body:has(#ml-admin-workspace) #scr-app{display:block!important;position:relative!important;inset:auto!important;width:100%!important;max-width:none!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important}',
      'body:has(#ml-admin-workspace) #scr-admin-login:not(.active){display:none!important;visibility:hidden!important;pointer-events:none!important}',
      '#tab-admindash{display:block!important;width:100%!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important;overscroll-behavior-y:auto!important}',
      '#tab-admindash>#ml-admin-workspace{display:grid!important;min-height:100vh!important;height:auto!important;overflow:visible!important}',
      '#tab-admindash #ml-admin-content,#tab-admindash #adash-body{display:block!important;height:auto!important;min-height:55vh!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important}',
      '#scr-app:has(#ml-admin-workspace),body:has(#ml-admin-workspace),html:has(#ml-admin-workspace){width:100%!important;max-width:none!important;height:auto!important;min-height:100vh!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important}',
      '#scr-app:has(#ml-admin-workspace){background:#f3f6fa!important;color:#14283a!important;min-height:100vh!important;height:auto!important;overflow:visible!important}',
      '#ml-admin-workspace{--ink:#14283a;--muted:#718397;--line:#e2e9f0;--gold:#d6a43b;--teal:#147b78;display:grid;grid-template-columns:252px minmax(0,1fr);width:100vw!important;max-width:100vw!important;min-width:0!important;min-height:100vh;background:#f3f6fa;color:var(--ink);font-family:Inter,system-ui,-apple-system,sans-serif;box-sizing:border-box!important}',
      '.ml-admin-sidebar{position:sticky;top:0;height:100vh;overflow:auto;background:#102638;color:#eaf1f5;padding:24px 16px;box-sizing:border-box;display:flex;flex-direction:column;z-index:20}',
      '.ml-admin-side-brand{display:flex;align-items:center;gap:11px;padding:4px 8px 26px;border-bottom:1px solid rgba(255,255,255,.1)}.ml-admin-side-brand img{width:45px;height:45px;object-fit:contain}.ml-admin-side-brand b{display:block;font-size:14px;letter-spacing:.12em}.ml-admin-side-brand span{display:block;color:#8fa8b8;font-size:9px;letter-spacing:.16em;margin-top:4px}',
      '.ml-admin-side-label{padding:22px 10px 8px;color:#7793a5;font-size:9px;font-weight:800;letter-spacing:.16em}.ml-admin-nav{display:grid;gap:4px}.ml-admin-nav button,.ml-admin-drawer-links button{border:0;background:transparent;color:#c0cfda;border-radius:10px;padding:11px 12px;text-align:left;font-size:12px;font-weight:650;display:flex;align-items:center;gap:12px;cursor:pointer}.ml-admin-nav button span,.ml-admin-drawer-links button span{width:20px;color:#e1b75b;font-size:17px;text-align:center}.ml-admin-nav button:hover,.ml-admin-nav button.is-active,.ml-admin-drawer-links button.is-active{background:rgba(255,255,255,.1);color:#fff}.ml-admin-side-foot{margin-top:auto;padding:18px 10px 4px;border-top:1px solid rgba(255,255,255,.1);font-size:10px;color:#a9bfcd;line-height:1.8}.ml-admin-side-foot small{color:#7995a7}.ml-admin-secure-dot{display:inline-block;width:7px;height:7px;background:#2ac58c;border-radius:50%;margin-right:6px}',
      '.ml-admin-main{min-width:0}.ml-admin-topbar{height:70px;display:flex;align-items:center;gap:18px;padding:0 34px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}.ml-admin-crumb{font-size:12px;color:#91a0af;flex:1}.ml-admin-crumb b{color:#344c60;margin-left:7px}.ml-admin-top-actions{display:flex;align-items:center;gap:14px}.ml-admin-live{font-size:10px;color:#16836e;font-weight:800}.ml-admin-live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#21b77b;margin-right:6px}.ml-admin-refresh,.ml-admin-signout{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 13px;color:#284255;font-size:11px;font-weight:750}.ml-admin-signout{background:#fff8ec;border-color:#f1dfbd;color:#88601b}.ml-admin-menu{display:none}',
      '.ml-admin-pagehead{display:flex;align-items:flex-end;justify-content:space-between;padding:30px 36px 20px}.ml-admin-overline{font-size:9px;letter-spacing:.18em;color:#16817b;font-weight:850}.ml-admin-pagehead h1{font-size:27px;letter-spacing:-.04em;margin:7px 0;color:#14283a}.ml-admin-pagehead p{margin:0;color:#788b9b;font-size:12px}.ml-admin-date{font-size:11px;color:#718397}.ml-admin-content{padding:0 36px 42px;min-width:0}.ml-admin-content .ml-premium-home{max-width:none!important;padding:0!important}.ml-admin-content .ml-home-top{background:linear-gradient(120deg,#102d42,#145c62)!important;border-radius:18px!important;padding:26px!important;margin-bottom:18px!important}.ml-admin-content .ml-admin-hero-panel{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;min-height:220px;position:relative;overflow:hidden;background:radial-gradient(circle at 85% 18%,rgba(74,191,181,.22),transparent 34%),linear-gradient(120deg,#102d42,#145c62)!important;border-radius:20px!important;padding:26px!important;margin-bottom:18px!important;box-sizing:border-box!important}.ml-admin-hero-copy{position:relative;z-index:1;flex:1 1 0;min-width:0}.ml-admin-hero-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:14px}.ml-admin-secure-label{color:#c5e8e2;font-size:10px;font-weight:700}.ml-admin-promo-button{margin-top:16px!important;min-height:42px}.ml-admin-hero-art{flex:0 0 220px;width:220px;max-width:38%;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:.98}.ml-admin-hero-art svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 10px 18px rgba(0,0,0,.14))}.ml-admin-art-caption{margin-top:-2px;color:#b8e4df;font-size:8px;font-weight:850;letter-spacing:.2em;text-align:center}.ml-admin-content .ml-admin-hero-panel .ml-hero-title{max-width:520px!important;font-size:clamp(23px,3vw,32px)!important;line-height:1.08!important}.ml-admin-content .ml-admin-hero-panel .ml-hero-sub{max-width:470px!important;color:#c4d9e0!important;font-size:13px!important;line-height:1.65!important}@media(max-width:720px){.ml-admin-content .ml-admin-hero-panel{gap:8px!important;min-height:208px;padding:19px!important}.ml-admin-hero-art{flex-basis:180px;width:180px;max-width:34%}.ml-admin-content .ml-admin-hero-panel .ml-hero-title{font-size:clamp(20px,4vw,27px)!important}.ml-admin-content .ml-admin-hero-panel .ml-hero-sub{font-size:11px!important}.ml-admin-secure-label{font-size:9px}}@media(max-width:480px){.ml-admin-content .ml-admin-hero-panel{display:block!important;min-height:0;padding:20px!important}.ml-admin-hero-art{display:none}.ml-admin-content .ml-admin-hero-panel .ml-hero-title{max-width:none!important;font-size:23px!important}.ml-admin-content .ml-admin-hero-panel .ml-hero-sub{max-width:38ch!important}}.ml-admin-content .ml-hero-title{font-size:25px!important}.ml-admin-content .ml-hero-sub{max-width:620px}.ml-admin-content .ml-live-dot{color:#a7f0d3}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important}.ml-admin-content .ml-stat,.ml-admin-content .ml-promo,.ml-admin-content .ml-profile-card{border:1px solid #e0e8ef!important;border-radius:16px!important;box-shadow:0 5px 20px rgba(28,57,78,.045)!important}.ml-admin-content .ml-stat{background:#fff!important;padding:19px!important}.ml-admin-content .ml-stat-label{color:#718397!important}.ml-admin-content .ml-stat-value{color:#14283a!important;font-size:25px!important}.ml-admin-content .ml-promo{background:#fff!important;color:#14283a!important;padding:18px!important}.ml-admin-content .ml-promo strong{color:#14283a!important}.ml-admin-content .ml-promo span{color:#718397!important}.ml-admin-content .ml-section-head{margin-top:22px!important}.ml-admin-content .ml-section-head h3{color:#193449!important}.ml-admin-content .ml-profile-row{border-bottom-color:#edf1f5!important}.ml-admin-content .ml-profile-row .copy b{color:#203b50!important}.ml-admin-content .ml-profile-row .copy span,.ml-admin-content .ml-profile-row .copy small{color:#718397!important}.ml-admin-content .ml-wallet-note{background:#fff!important;border:1px solid #e5ebf1!important;color:#607488!important}.ml-admin-content .ml-empty{background:#fff!important;border:1px dashed #dce5ec!important;color:#617487!important}.ml-admin-content .ml-empty b{color:#243e52!important}',
      '.ml-admin-mobilebar,.ml-admin-drawer{display:none}',
      '@media(max-width:1050px){#ml-admin-workspace{grid-template-columns:218px minmax(0,1fr)}.ml-admin-content{padding:0 22px 36px}.ml-admin-pagehead{padding:25px 22px 18px}.ml-admin-topbar{padding:0 22px}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:720px){#ml-admin-workspace{display:block;padding-bottom:76px}.ml-admin-sidebar{display:none}.ml-admin-topbar{height:58px;padding:0 14px;gap:10px}.ml-admin-menu{display:inline-flex;border:1px solid #e2e9f0;background:#fff;border-radius:9px;width:38px;height:36px;align-items:center;justify-content:center;color:#17364b;font-size:17px}.ml-admin-crumb{font-size:10px}.ml-admin-top-actions{gap:7px}.ml-admin-live{font-size:9px}.ml-admin-refresh,.ml-admin-signout{padding:8px 9px;font-size:10px}.ml-admin-refresh span{display:none}.ml-admin-pagehead{padding:20px 16px 15px;align-items:flex-start}.ml-admin-pagehead h1{font-size:23px}.ml-admin-date{font-size:9px}.ml-admin-content{padding:0 14px 28px}.ml-admin-content .ml-home-top{padding:20px!important;display:block!important}.ml-admin-content .ml-hero-title{font-size:23px!important;max-width:260px}.ml-admin-content .ml-hero-sub{font-size:12px!important;line-height:1.55}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}.ml-admin-content .ml-stat{padding:15px!important;min-width:0}.ml-admin-content .ml-stat-value{font-size:22px!important}.ml-admin-content .ml-promo-strip{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}.ml-admin-content .ml-section-head{gap:10px;align-items:center}.ml-admin-content .ml-section-head h3{font-size:14px}.ml-admin-mobilebar{position:fixed;display:grid;grid-template-columns:repeat(5,1fr);left:0;right:0;bottom:0;z-index:30;background:rgba(255,255,255,.97);border-top:1px solid #dfe7ed;padding:7px 5px calc(7px + env(safe-area-inset-bottom));box-shadow:0 -5px 20px rgba(22,46,64,.08)}.ml-admin-mobilebar button{border:0;background:transparent;color:#738597;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9px;font-weight:700}.ml-admin-mobilebar button b{font-size:18px;font-weight:500}.ml-admin-mobilebar button.is-active{color:#147b78}.ml-admin-drawer{display:block;position:fixed;inset:0;z-index:60;background:rgba(7,20,31,.45);pointer-events:none;opacity:0;transition:opacity .2s}.ml-admin-drawer.is-open{opacity:1;pointer-events:auto}.ml-admin-drawer-links{position:absolute;left:0;top:0;bottom:0;width:min(82vw,330px);overflow:auto;background:#102638;padding:18px 14px 30px;transform:translateX(-102%);transition:transform .22s}.ml-admin-drawer.is-open .ml-admin-drawer-links{transform:translateX(0)}.ml-admin-drawer-head{position:absolute;left:0;top:0;width:min(82vw,330px);height:58px;box-sizing:border-box;background:#102638;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:0 17px;z-index:1}.ml-admin-drawer-head button{border:0;background:transparent;color:#fff;font-size:26px}.ml-admin-drawer-links{padding-top:68px}.ml-admin-drawer-links .ml-admin-side-label{display:none}}',
      '#ml-admin-workspace.ml-admin-dark{background:#0b1722;color:#eaf2f7}#ml-admin-workspace.ml-admin-dark .ml-admin-main{background:#0b1722}#ml-admin-workspace.ml-admin-dark .ml-admin-topbar{background:#102232;border-color:#263d4d}#ml-admin-workspace.ml-admin-dark .ml-admin-crumb,#ml-admin-workspace.ml-admin-dark .ml-admin-date{color:#9aafbd}#ml-admin-workspace.ml-admin-dark .ml-admin-crumb b,#ml-admin-workspace.ml-admin-dark .ml-admin-pagehead h1{color:#f0f5f8}#ml-admin-workspace.ml-admin-dark .ml-admin-pagehead p{color:#a1b4c1}#ml-admin-workspace.ml-admin-dark .ml-admin-refresh,#ml-admin-workspace.ml-admin-dark .ml-admin-menu{background:#172b3a;border-color:#30495b;color:#edf4f7}#ml-admin-workspace.ml-admin-dark .ml-admin-signout{background:#342d20;border-color:#65512c;color:#f3d28b}#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-stat,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-promo,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-profile-card,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-wallet-note,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-empty{background:#122433!important;border-color:#2b4354!important;color:#c4d2dc!important}#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-stat-label,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-promo span,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-profile-row .copy span,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-profile-row .copy small{color:#a0b2bf!important}#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-stat-value,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-promo strong,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-section-head h3,#ml-admin-workspace.ml-admin-dark .ml-admin-content .ml-profile-row .copy b{color:#edf4f8!important}#ml-admin-workspace.ml-admin-dark .ml-admin-mobilebar{background:rgba(15,32,46,.98);border-color:#2b4354}#ml-admin-workspace.ml-admin-dark .ml-admin-mobilebar button{color:#9db0bd}#ml-admin-workspace.ml-admin-dark .ml-admin-mobilebar button.is-active{color:#63d0c2}',
      '@media(prefers-reduced-motion:reduce){#ml-admin-workspace *{transition:none!important;scroll-behavior:auto!important}}',
      '/* Admin responsive shell, explicit theme and reliable page scrolling */',
      'CRM profile photos and directory avatars',
      'CRM full profile detail sections',
      '.ml-crm-details{display:grid;gap:14px;margin:14px 0 22px}.ml-crm-detail-section{background:#fff;border:1px solid #e2eaf0;border-radius:16px;padding:16px;box-shadow:0 5px 18px rgba(24,51,71,.035)}.ml-crm-detail-section h4{margin:0 0 13px;color:#18354a;font-size:13px;font-weight:800;letter-spacing:.02em}.ml-crm-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ml-crm-detail-field{min-width:0;border-bottom:1px solid #edf1f4;padding:0 0 9px}.ml-crm-detail-field small{display:block;color:#718392;font-size:10px;margin-bottom:5px;text-transform:uppercase;letter-spacing:.055em}.ml-crm-detail-field b{display:block;color:#21394b;font-size:12px;font-weight:650;overflow-wrap:anywhere;white-space:pre-wrap}',
      '#ml-admin-workspace.ml-admin-dark .ml-crm-detail-section{background:#122433;border-color:#2b4354}#ml-admin-workspace.ml-admin-dark .ml-crm-detail-section h4,#ml-admin-workspace.ml-admin-dark .ml-crm-detail-field b{color:#edf4f8}#ml-admin-workspace.ml-admin-dark .ml-crm-detail-field{border-color:#2b4354}#ml-admin-workspace.ml-admin-dark .ml-crm-detail-field small{color:#9aafbd}',
      '@media(max-width:520px){.ml-crm-detail-grid{grid-template-columns:minmax(0,1fr);gap:9px}.ml-crm-detail-section{padding:13px}}',
      
      '.ml-crm-user-row{display:flex!important;align-items:center;gap:13px;padding:13px!important}.ml-crm-avatar,.ml-crm-avatar-fallback{width:48px;height:48px;flex:0 0 48px;border-radius:50%;object-fit:cover;border:2px solid #dce8ed;background:#eaf2f5}.ml-crm-avatar-fallback{display:grid;place-items:center;color:#537184;font-size:20px}.ml-crm-profile-head{align-items:center;gap:16px;padding:18px!important}.ml-crm-profile-photo,.ml-crm-profile-placeholder{width:88px;height:88px;flex:0 0 88px;object-fit:cover;border-radius:22px;border:3px solid #e5edf2;background:#edf3f6}.ml-crm-profile-placeholder{display:grid;place-items:center;font-size:30px;color:#5e7788}',
      '#ml-admin-workspace.ml-admin-dark .ml-crm-avatar,#ml-admin-workspace.ml-admin-dark .ml-crm-avatar-fallback,#ml-admin-workspace.ml-admin-dark .ml-crm-profile-photo,#ml-admin-workspace.ml-admin-dark .ml-crm-profile-placeholder{border-color:#344c5d;background:#1b3040;color:#dce8ef}',
      '@media(max-width:520px){.ml-crm-profile-photo,.ml-crm-profile-placeholder{width:68px;height:68px;flex-basis:68px;border-radius:18px}.ml-crm-avatar,.ml-crm-avatar-fallback{width:42px;height:42px;flex-basis:42px}}',
      
      'html:has(#ml-admin-workspace),body:has(#ml-admin-workspace),#scr-app:has(#ml-admin-workspace),#tab-admindash:has(#ml-admin-workspace){height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain}',
      '#scr-app:has(#ml-admin-workspace){position:relative!important;inset:auto!important;width:100%!important;max-width:none!important;height:auto!important;min-height:100dvh!important;overflow:visible!important}',
      '#ml-admin-workspace{min-height:100dvh!important;height:auto!important;overflow:visible!important}',
      '.ml-admin-main{min-height:100dvh!important;height:auto!important;overflow:visible!important}',
      '.ml-admin-content{min-height:55vh;overflow:visible!important;padding-bottom:calc(40px + env(safe-area-inset-bottom))!important}',
      '.ml-admin-menu{display:inline-flex!important;flex:0 0 auto;align-items:center;justify-content:center;width:40px;height:38px;border:1px solid #dce5ed;background:#fff;border-radius:11px;color:#17364b;font-size:19px;cursor:pointer}',
      '.ml-admin-top-logo{width:34px;height:34px;object-fit:contain;flex:0 0 auto;margin-right:2px}',
      '.ml-admin-drawer{display:block!important;position:fixed;inset:0;z-index:1000;background:rgba(7,20,31,.5);backdrop-filter:blur(4px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s,visibility .2s}',
      '.ml-admin-drawer.is-open{opacity:1;visibility:visible;pointer-events:auto}',
      '.ml-admin-drawer-panel{position:absolute;left:0;top:0;bottom:0;width:min(86vw,360px);max-width:100%;overflow-y:auto;overscroll-behavior:contain;background:#102638;color:#f3f7fa;box-shadow:18px 0 50px rgba(0,0,0,.2);transform:translateX(-102%);transition:transform .24s;padding:0 16px calc(24px + env(safe-area-inset-bottom));box-sizing:border-box}',
      '.ml-admin-drawer.is-open .ml-admin-drawer-panel{transform:translateX(0)}',
      '.ml-admin-drawer-head{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.12);gap:12px}',
      '.ml-admin-drawer-head{position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:88px!important;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.12);gap:12px}',
      '.ml-admin-drawer-links{position:relative!important;left:auto!important;top:auto!important;bottom:auto!important;width:100%!important;max-height:none!important;overflow:visible!important;background:transparent!important;transform:none!important;transition:none!important;padding:16px 0!important}',
      '.ml-admin-drawer.is-open .ml-admin-drawer-links{transform:none!important}',
      '#ml-admin-workspace.ml-admin-dark .ml-admin-content .inp,#ml-admin-workspace.ml-admin-dark .ml-admin-content input,#ml-admin-workspace.ml-admin-dark .ml-admin-content textarea,#ml-admin-workspace.ml-admin-dark .ml-admin-content select{background:#0d1e2b!important;color:#edf4f8!important;border-color:#385164!important;color-scheme:dark}',
      '#ml-admin-workspace.ml-admin-dark .ml-admin-content input::placeholder,#ml-admin-workspace.ml-admin-dark .ml-admin-content textarea::placeholder{color:#91a7b6!important}',
      '#ml-admin-workspace.ml-admin-dark .ml-admin-content button:not(.ml-btn-primary){color:#dce8ef}',
      '.ml-admin-content .ml-profile-card{overflow:hidden}',
      '.ml-admin-content .ml-stat,.ml-admin-content .ml-profile-card,.ml-admin-content .ml-promo{transition:transform .18s ease,box-shadow .18s ease}',
      '@media(hover:hover){.ml-admin-content .ml-stat:hover,.ml-admin-content .ml-profile-card:hover,.ml-admin-content .ml-promo:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(24,51,71,.09)!important}}',
      
      '.ml-admin-drawer-brand{display:flex;align-items:center;gap:13px;border:0;background:transparent;color:#fff;text-align:left;cursor:pointer;padding:8px 0;min-width:0}',
      '.ml-admin-drawer-brand img{width:70px;height:62px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.2))}',
      '.ml-admin-drawer-brand b{display:block;font-size:14px;letter-spacing:.14em}.ml-admin-drawer-brand small{display:block;color:#9db5c5;font-size:9px;letter-spacing:.18em;margin-top:5px}',
      '.ml-admin-drawer-head>button:last-child{border:0;background:rgba(255,255,255,.1);color:#fff;border-radius:10px;width:36px;height:36px;font-size:24px;cursor:pointer}',
      '.ml-admin-theme-row{display:flex;align-items:center;justify-content:space-between;padding:16px 2px;border-bottom:1px solid rgba(255,255,255,.12);font-size:12px;color:#d4e0e8}',
      '.ml-admin-theme-row button{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.08);color:#fff;padding:8px 11px;font-size:11px;font-weight:750;cursor:pointer}',
      '.ml-admin-theme-row button i{width:8px;height:8px;border-radius:50%;background:#f3c45e;box-shadow:0 0 0 3px rgba(243,196,94,.15)}',
      '.ml-admin-drawer-links{display:grid;gap:5px;padding:16px 0}.ml-admin-drawer-links .ml-admin-side-label{display:block!important}',
      '.ml-admin-drawer-links button{min-height:42px;font-size:13px}',
      '.ml-admin-drawer-foot{border-top:1px solid rgba(255,255,255,.12);padding:16px 5px 5px;color:#9fb2c0;font-size:10px;line-height:1.8}.ml-admin-drawer-foot b{color:#f2c66a}',
      '#ml-admin-workspace:not(.ml-admin-dark){background:#f3f6fa!important;color:#14283a!important;color-scheme:light}',
      '#ml-admin-workspace:not(.ml-admin-dark) .ml-admin-main,#ml-admin-workspace:not(.ml-admin-dark) .ml-admin-topbar{background:#fff!important;color:#14283a!important}',
      '#ml-admin-workspace:not(.ml-admin-dark) .ml-admin-pagehead h1,#ml-admin-workspace:not(.ml-admin-dark) .ml-admin-section h2{color:#14283a!important}',
      '@media(max-width:720px){#ml-admin-workspace{padding-bottom:calc(76px + env(safe-area-inset-bottom))!important}.ml-admin-topbar{gap:8px;padding:0 12px}.ml-admin-top-logo{width:30px;height:30px}.ml-admin-crumb{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ml-admin-top-actions{gap:5px}.ml-admin-signout{font-size:9px!important;padding:7px!important}.ml-admin-pagehead{padding-top:18px}.ml-admin-content{padding-bottom:calc(110px + env(safe-area-inset-bottom))!important}.ml-admin-mobilebar{padding-bottom:calc(9px + env(safe-area-inset-bottom))!important}.ml-admin-drawer-panel{width:min(88vw,360px)}}',
      '@media(min-width:721px){.ml-admin-drawer-panel{width:340px}.ml-admin-drawer-links{padding-top:18px}}'
    ].join('');
    document.head.appendChild(css);
    // Keep the dedicated Admin workspace as the only scroll container after
    // authentication; the shared customer shell was originally viewport-locked.
    if (!document.getElementById('ml-admin-viewport-fix')) {
      var viewportFix = document.createElement('style');
      viewportFix.id = 'ml-admin-viewport-fix';
      viewportFix.textContent = [
        'html:has(#ml-admin-workspace),body:has(#ml-admin-workspace){width:100%!important;min-width:0!important;height:auto!important;min-height:100%!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important}',
        'body{margin:0!important;width:100%!important;min-width:0!important;max-width:none!important}',
        '#app,#scr-app,#tab-admindash{width:100vw!important;min-width:100vw!important;max-width:100vw!important;box-sizing:border-box!important;margin-left:0!important;margin-right:0!important}',
        '#ml-admin-workspace,#ml-admin-workspace .ml-admin-main,#ml-admin-workspace .ml-admin-content{width:100%!important;min-width:0!important;max-width:none!important;box-sizing:border-box!important}',
        '#ml-admin-workspace{display:grid!important;grid-template-columns:252px minmax(0,1fr)!important;width:100vw!important;min-width:100vw!important;max-width:100vw!important;margin:0!important}',
        '#ml-admin-workspace .ml-admin-main{width:100%!important;min-width:0!important;max-width:none!important}',
        '@media(max-width:720px){#ml-admin-workspace{display:block!important;width:100vw!important;min-width:100vw!important;max-width:100vw!important}#ml-admin-workspace .ml-admin-main{width:100%!important;min-width:0!important}}',
        'body:has(#ml-admin-workspace) #app{display:block!important;position:relative!important;inset:auto!important;width:100%!important;max-width:none!important;height:auto!important;min-height:100dvh!important;max-height:none!important;margin:0!important;overflow:visible!important}',
        'body:has(#ml-admin-workspace) #scr-app{display:block!important;position:relative!important;inset:auto!important;width:100%!important;max-width:none!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important}',
        'body:has(#ml-admin-workspace) #scr-admin-login:not(.active){display:none!important;visibility:hidden!important;pointer-events:none!important}',
        'body:has(#ml-admin-workspace) #tab-admindash{display:block!important;width:100%!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important}',
        'body:has(#ml-admin-workspace) #tab-admindash,#tab-admindash>#ml-admin-workspace,#ml-admin-workspace,.ml-admin-main,.ml-admin-content,#adash-body{box-sizing:border-box;max-height:none!important;overflow:visible!important;overflow-y:visible!important}',
        '#ml-admin-workspace{width:100%!important;min-width:0!important;min-height:100dvh!important;height:auto!important}',
        '#ml-admin-workspace .ml-admin-content{width:100%!important;min-width:0!important;padding-bottom:calc(120px + env(safe-area-inset-bottom))!important}',
        '@media(max-width:720px){#ml-admin-workspace{display:block!important;padding-bottom:calc(76px + env(safe-area-inset-bottom))!important}#ml-admin-workspace .ml-admin-main{width:100%!important;min-width:0!important}#ml-admin-workspace .ml-admin-mobilebar{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:100!important}}',
        '#scr-admin-login .ml-admin-phone{grid-template-columns:104px minmax(0,1fr)!important;grid-template-rows:52px 56px!important;width:100%!important;min-width:0!important}',
        '#scr-admin-login .ml-admin-country{grid-column:1!important;grid-row:1!important;justify-content:center!important;padding:0 8px!important;font-size:12px!important}',
        '#scr-admin-login #admin-operator{grid-column:2!important;grid-row:1!important;width:100%!important;min-width:0!important;height:52px!important;box-sizing:border-box!important;appearance:auto!important;color-scheme:light!important;background:#fff!important;color:#18384d!important;-webkit-text-fill-color:#18384d!important}',
        '#scr-admin-login #admin-national{grid-column:1/3!important;grid-row:2!important;width:100%!important;min-width:0!important;height:56px!important;box-sizing:border-box!important;border:0!important;border-top:1px solid #e6edf2!important;border-radius:0 0 12px 12px!important;background:#f3f7fb!important;color:#18384d!important;-webkit-text-fill-color:#18384d!important;color-scheme:light!important}',
        '#scr-admin-login #ml-admin-phone-slot{width:100%!important;overflow:hidden!important;border-radius:13px!important;background:#fff!important;box-shadow:0 4px 14px rgba(18,48,68,.05)!important}',
        '@media(max-width:380px){#scr-admin-login .ml-admin-phone{grid-template-columns:90px minmax(0,1fr)!important}#scr-admin-login .ml-admin-country{font-size:11px!important}}'
      ].join('');
      document.head.appendChild(viewportFix);
    }
  }

  function installAdminTabIsolation() {
    if (typeof window.switchTab !== 'function' || window.switchTab.__mlAdminPremiumIsolated) return;
    var originalSwitchTab = window.switchTab;
    var isolatedSwitchTab = function (tabName) {
      var result = originalSwitchTab.apply(this, arguments);
      if (tabName === 'admindash') {
        // Let the shared app update its internal tab state, then force the
        // dedicated premium Admin shell to own the visible dashboard surface.
        ensureAdminWorkspace();
        window.setTimeout(function () {
          ensureAdminWorkspace();
          var adminTab = document.getElementById('tab-admindash');
          var appScreen = document.getElementById('scr-app');
          if (adminTab) {
            adminTab.style.setProperty('display', 'block', 'important');
            adminTab.style.setProperty('height', 'auto', 'important');
            adminTab.style.setProperty('min-height', '100vh', 'important');
            adminTab.style.setProperty('overflow', 'visible', 'important');
          }
          if (appScreen) appScreen.style.setProperty('overflow', 'visible', 'important');
          // switchTab('admindash') already starts the overview request. Only
          // mark the Overview navigation item active here; do not fire a
          // second or third dashboard refresh during the login transition.
          document.querySelectorAll('[data-ml-admin-route]').forEach(function (el) {
            var active = el.getAttribute('data-ml-admin-route') === 'overview';
            el.classList.toggle('is-active', active);
            el.setAttribute('aria-current', active ? 'page' : 'false');
          });
        }, 0);
      }
      return result;
    };
    isolatedSwitchTab.__mlAdminPremiumIsolated = true;
    window.switchTab = isolatedSwitchTab;
  }

  function installAdminGuards() {
    installAdminWorkspaceStyles();
    installAdminTabIsolation();
    if (document.getElementById('scr-app') && document.getElementById('scr-app').classList.contains('active')) ensureAdminWorkspace();
    buildAdminLogin();
    if (document.getElementById('scr-admin-login') &&
        document.getElementById('scr-admin-login').classList.contains('active')) {
      unlockAdminLoginViewport();
    }
    normalizeAdminAuthResponse();
    window.goOnboard = openAdmin;
    window.goAuth = openAdmin;
    window.__mlRouteAfterSplash = openAdmin;
    window.mlForgetRememberedDevice = openAdmin;

    if (typeof window.showScreen === 'function' && !window.__ML_ADMIN_SHOWSCREEN_GUARD) {
      var originalShowScreen = window.showScreen;
      window.showScreen = function (id) {
        if (id === 'scr-onboard' || id === 'scr-auth' ||
            id === 'scr-splash' || id === 'scr-returning') return openAdmin();
        var result = originalShowScreen.apply(this, arguments);
        if (id === 'scr-app') {
          window.setTimeout(function () { installAdminWorkspaceStyles(); ensureAdminWorkspace(); }, 0);
        }
        return result;
      };
      window.__ML_ADMIN_SHOWSCREEN_GUARD = true;
    }

    if (!window.__ML_ADMIN_SCREEN_OBSERVER && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        // This observer is only needed to keep the dedicated host on the Admin
        // login until authentication. Once the authenticated app is active,
        // mount the workspace once and disconnect. Observing every dashboard
        // class/DOM mutation after login caused unnecessary repeated work on
        // low-memory mobile browsers.
        var appScreen = document.getElementById('scr-app');
        if (appScreen && appScreen.classList.contains('active') &&
            window.AdminSession && window.AdminSession.active) {
          installAdminWorkspaceStyles();
          ensureAdminWorkspace();
          if (window.__ML_ADMIN_SCREEN_OBSERVER) {
            window.__ML_ADMIN_SCREEN_OBSERVER.disconnect();
            window.__ML_ADMIN_SCREEN_OBSERVER = null;
          }
          return;
        }
        var activeAdminLogin = document.getElementById('scr-admin-login');
        if (activeAdminLogin && activeAdminLogin.classList.contains('active')) {
          var adminPin = activeAdminLogin.querySelector('#admin-password');
          var adminButton = activeAdminLogin.querySelector('#admin-lbtn');
          var adminShield = activeAdminLogin.querySelector('.ml-admin-shield');
          if (!adminPin || !adminButton || !adminShield) buildAdminLogin();
        }
        var customerScreen = document.querySelector(
          '#scr-onboard.active,#scr-auth.active,#scr-returning.active'
        );
        if (!customerScreen) return;
        customerScreen.classList.remove('active');
        openAdmin();
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      window.__ML_ADMIN_SCREEN_OBSERVER = observer;
    }

    var app = document.getElementById('scr-app');
    var login = document.getElementById('scr-admin-login');
    if (app && app.classList.contains('active')) return;
    var splash = document.getElementById('scr-splash');
    if (login && !login.classList.contains('active') && !(splash && splash.classList.contains('active'))) openAdmin();
  }

  function enablePinAutofillAndSubmit() {
    // Never submit automatically when the PIN reaches four digits.
    // Mobile keyboards/autofill may dispatch input/change before the user
    // has finished reviewing the phone/network fields. Require explicit tap
    // on Sign in or deliberate Enter from the PIN field.
    var pin = document.getElementById('admin-password');
    if (pin) {
      pin.setAttribute('autocomplete', 'off');
      pin.setAttribute('inputmode', 'numeric');
      pin.setAttribute('maxlength', '4');
    }
  }

  function installAdminExplicitSubmit() {
    if (window.__ML_ADMIN_EXPLICIT_SUBMIT_INSTALLED) return;
    var button = document.getElementById('admin-lbtn');
    var pin = document.getElementById('admin-password');
    if (!button || !pin) return;
    window.__ML_ADMIN_EXPLICIT_SUBMIT_INSTALLED = true;
    function submit(event) {
      if (event) { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) event.stopImmediatePropagation(); }
      if (window.__ML_ADMIN_SUBMIT_DISPATCHING || window.__ML_ADMIN_LOGIN_IN_FLIGHT) return;
      var login = window.doAdminLogin;
      if (typeof login !== 'function') {
        var err = document.getElementById('admin-auth-err');
        if (err) { err.textContent = 'Secure sign-in is still starting. Please wait a moment and try again.'; err.style.display = 'block'; }
        return;
      }
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Connecting securely…';
      var errBox = document.getElementById('admin-auth-err');
      if (errBox) { errBox.textContent = 'Connecting to the MarketLink server securely…'; errBox.style.display = 'block'; errBox.setAttribute('role','status'); }
      window.__ML_ADMIN_SUBMIT_DISPATCHING = true;
      Promise.resolve().then(function () { return login(); }).catch(function (error) {
        var box = document.getElementById('admin-auth-err');
        if (box) { box.textContent = String(error && (error.message || error.error) || 'Sign-in could not be completed. Please try again.'); box.style.display = 'block'; box.setAttribute('role','alert'); }
      }).finally(function () {
        window.__ML_ADMIN_SUBMIT_DISPATCHING = false;
        var active = document.getElementById('scr-admin-login');
        if (active && active.classList.contains('active')) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = 'Sign in securely';
        }
      });
    }
    button.removeAttribute('onclick');
    button.addEventListener('click', submit, true);
    pin.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') submit(event);
    }, true);
  }

  function showAdminBootDiagnostic(error) {
    var active = document.querySelector('.screen.active');
    if (active) return;
    var login = document.getElementById('scr-admin-login');
    if (login) {
      login.classList.add('active');
      login.style.display = 'block';
      var note = document.getElementById('ml-admin-boot-diagnostic');
      if (!note) {
        note = document.createElement('div');
        note.id = 'ml-admin-boot-diagnostic';
        note.setAttribute('role', 'alert');
        note.style.cssText = 'max-width:460px;margin:12px auto;padding:12px 14px;border:1px solid #d97706;border-radius:12px;background:#fff7ed;color:#7c2d12;font:12px/1.5 system-ui,sans-serif;overflow-wrap:anywhere';
        login.appendChild(note);
      }
      note.textContent = 'Admin portal startup recovered. ' + String(error && error.message || 'A page component did not initialize.') + ' You can still sign in; if this persists, send this message to support.';
    }
  }

  try {
    installAdminGuards();
    normalizeAdminAuthResponse();
    installAdminPhoneSubmit();
    enablePinAutofillAndSubmit();
    installAdminExplicitSubmit();
  } catch (bootError) {
    showAdminBootDiagnostic(bootError);
    if (window.console && console.error) console.error('[MarketLink Admin] Startup recovery:', bootError);
  }
  window.addEventListener('error', function (event) {
    if (!document.querySelector('.screen.active')) showAdminBootDiagnostic(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', function (event) {
    if (!document.querySelector('.screen.active')) showAdminBootDiagnostic(event.reason);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); installAdminExplicitSubmit(); }, 50);
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); installAdminExplicitSubmit(); }, 250);
    }, { once: true });
  } else {
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 50);
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 250);
  }
})();