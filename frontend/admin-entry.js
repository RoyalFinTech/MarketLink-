/* MarketLink Admin-only entry point.
   Injected only by the separate Render Admin site's build.
   Keep all presentation and routing changes isolated from the customer app. */
(function () {
  'use strict';

  window.__ML_ADMIN_PORTAL_MODE = true;

  var style = document.createElement('style');
  style.id = 'ml-admin-isolation-style';
  style.textContent = [
    '#scr-splash,#scr-onboard,#scr-auth,#scr-returning{display:none!important;visibility:hidden!important;pointer-events:none!important}',
    '#scr-admin-login,#scr-app{visibility:visible}',
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
    '@media(prefers-color-scheme:dark){#scr-admin-login{background:#09131e!important;color:#eaf2f8!important;color-scheme:dark}#scr-admin-login .ml-admin-hero{background:linear-gradient(145deg,#101e2b 0%,#142b3b 65%,#302817 100%);border-color:rgba(245,184,61,.2)}#scr-admin-login .ml-admin-title{color:#f5f8fb}#scr-admin-login .ml-admin-subtitle{color:#a9bbc8}#scr-admin-login .ml-admin-card{background:#101e2b;border-color:#294052;box-shadow:0 14px 38px rgba(0,0,0,.24)}#scr-admin-login .ml-admin-kicker{color:#70d6c4}#scr-admin-login .ml-admin-label{color:#d0dce5}#scr-admin-login #ml-admin-phone-slot{background:#0b1925;border-color:#395064}#scr-admin-login #ml-admin-phone-slot .ml-gm-phone>span{background:#18384d!important;color:#f4f8fb!important}#scr-admin-login #ml-admin-phone-slot .ml-gm-phone select,#scr-admin-login #ml-admin-phone-slot .ml-gm-phone input{background:#0b1925!important;color:#f4f8fb!important;-webkit-text-fill-color:#f4f8fb!important;color-scheme:dark!important}#scr-admin-login #admin-password{background:#0b1925;color:#f4f8fb;-webkit-text-fill-color:#f4f8fb;border-color:#395064;color-scheme:dark}#scr-admin-login .ml-admin-security{background:#172a32;border-color:#43513d;color:#c4d3d9}#scr-admin-login .ml-admin-security strong{color:#f4cf78}#scr-admin-login .ml-admin-footer{color:#8297a7}}',
    '@media(max-width:480px){#scr-admin-login .ml-admin-hero{padding:26px 18px 23px}#scr-admin-login .ml-admin-title{font-size:21px}#scr-admin-login .ml-admin-card{margin-top:18px;padding:19px 15px}}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  function buildAdminLogin() {
    var screen = document.getElementById('scr-admin-login');
    if (!screen || screen.getAttribute('data-ml-admin-redesigned') === '1') return;
    screen.innerHTML =
      '<section class="ml-admin-hero">' +
        '<div class="ml-admin-brandmark"><img src="./assets/marketlink-logo.png" alt="MarketLink Gambia logo"><span class="ml-admin-shield" aria-hidden="true">🛡️</span></div>' +
        '<h1 class="ml-admin-title">MarketLink Admin Portal</h1>' +
        '<p class="ml-admin-subtitle">Secure access for authorised MarketLink administrators and staff.</p>' +
      '</section>' +
      '<section class="ml-admin-card" aria-label="Administrator sign in">' +
        '<p class="ml-admin-kicker">Administrator sign in</p>' +
        '<div id="admin-auth-err" role="alert" aria-live="polite" style="display:none"></div>' +
        '<label class="ml-admin-label" for="admin-national">Gambian mobile number</label>' +
        '<div id="ml-admin-phone-slot"><input class="inp" type="tel" inputmode="numeric" autocomplete="tel-national" id="admin-staffid" placeholder="7-digit mobile number"></div>' +
        '<label class="ml-admin-label" for="admin-password">4-digit security PIN</label>' +
        '<input class="inp" type="password" id="admin-password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Enter your PIN" aria-label="Four digit administrator PIN" onkeydown="if(event.key===\'Enter\')doAdminLogin()">' +
        '<button class="btn" type="button" id="admin-lbtn" onclick="doAdminLogin()">Sign in securely</button>' +
        '<div class="ml-admin-security"><span aria-hidden="true">🔒</span><div><strong>Restricted administrator area</strong>Only approved MarketLink admin accounts can enter. Access is verified securely by the MarketLink server.</div></div>' +
        '<p class="ml-admin-footer">MarketLink Gambia · Royal FinTech Company</p>' +
      '</section>';
    screen.setAttribute('data-ml-admin-redesigned', '1');
  }

  function openAdmin() {
    buildAdminLogin();
    if (typeof window.openAdminLogin === 'function') {
      window.openAdminLogin();
      return true;
    }
    var login = document.getElementById('scr-admin-login');
    if (login) {
      document.querySelectorAll('.screen.active').forEach(function (screen) {
        screen.classList.remove('active');
      });
      login.classList.add('active');
      return true;
    }
    return false;
  }

  function installAdminGuards() {
    buildAdminLogin();
    window.goOnboard = openAdmin;
    window.goAuth = openAdmin;
    window.__mlRouteAfterSplash = openAdmin;
    window.mlForgetRememberedDevice = openAdmin;

    if (typeof window.showScreen === 'function' && !window.__ML_ADMIN_SHOWSCREEN_GUARD) {
      var originalShowScreen = window.showScreen;
      window.showScreen = function (id) {
        if (id === 'scr-onboard' || id === 'scr-auth' ||
            id === 'scr-splash' || id === 'scr-returning') return openAdmin();
        return originalShowScreen.apply(this, arguments);
      };
      window.__ML_ADMIN_SHOWSCREEN_GUARD = true;
    }

    if (!window.__ML_ADMIN_SCREEN_OBSERVER && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        var customerScreen = document.querySelector(
          '#scr-splash.active,#scr-onboard.active,#scr-auth.active,#scr-returning.active'
        );
        if (!customerScreen) return;
        customerScreen.classList.remove('active');
        openAdmin();
      });
      observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
      window.__ML_ADMIN_SCREEN_OBSERVER = observer;
    }

    var app = document.getElementById('scr-app');
    var login = document.getElementById('scr-admin-login');
    if (app && app.classList.contains('active')) return;
    if (login && !login.classList.contains('active')) openAdmin();
  }

  function enablePinAutofillAndSubmit() {
    var pin = document.getElementById('admin-password');
    if (!pin || pin.dataset.mlAutoSubmit === '1') return;
    pin.dataset.mlAutoSubmit = '1';
    var busy = false;
    function maybeSubmit() {
      var value = String(pin.value || '');
      if (busy || !/^\\d{4}$/.test(value)) return;
      busy = true;
      Promise.resolve().then(function () {
        if (typeof window.doAdminLogin === 'function') window.doAdminLogin();
        window.setTimeout(function () {
          var button = document.getElementById('admin-lbtn');
          if (button && !button.disabled) busy = false;
        }, 1200);
      });
    }
    pin.addEventListener('input', maybeSubmit);
    pin.addEventListener('change', maybeSubmit);
    window.setTimeout(maybeSubmit, 500);
  }

  installAdminGuards();
  enablePinAutofillAndSubmit();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 50);
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 250);
    }, { once: true });
  } else {
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 50);
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 250);
  }
})();
