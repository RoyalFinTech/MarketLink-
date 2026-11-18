/* MarketLink Admin-only entry point.
   This file is injected only by the separate Render Admin site's build.
   Do not modify the customer app's routing or authentication. */
(function () {
  'use strict';

  window.__ML_ADMIN_PORTAL_MODE = true;

  // The Admin deployment reuses shared assets and admin modules, but must never
  // display customer splash/onboarding/login/remembered-user screens.
  var style = document.createElement('style');
  style.id = 'ml-admin-isolation-style';
  style.textContent = [
    '#scr-splash,#scr-onboard,#scr-auth,#scr-returning{display:none!important;visibility:hidden!important;pointer-events:none!important}',
    '#scr-admin-login,#scr-app{visibility:visible}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  function openAdmin() {
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
    // These customer functions are reassigned by shared DOMContentLoaded code.
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

    // Some legacy onboarding code uses showOnly()/classList directly and
    // bypasses showScreen(). Observe screen activation as a final boundary.
    if (!window.__ML_ADMIN_SCREEN_OBSERVER && window.MutationObserver) {
      var root = document.documentElement;
      var observer = new MutationObserver(function () {
        var customerScreen = document.querySelector(
          '#scr-splash.active,#scr-onboard.active,#scr-auth.active,#scr-returning.active'
        );
        if (!customerScreen) return;
        customerScreen.classList.remove('active');
        openAdmin();
      });
      observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
      window.__ML_ADMIN_SCREEN_OBSERVER = observer;
    }

    // If a shared startup watchdog has already moved away from Admin, restore
    // the dedicated login. The authenticated admin app screen is left intact.
    var app = document.getElementById('scr-app');
    var login = document.getElementById('scr-admin-login');
    if (app && app.classList.contains('active')) return;
    if (login && !login.classList.contains('active')) openAdmin();
  }

  // Install before splash timers, then again after all shared startup handlers.
  installAdminGuards();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(installAdminGuards, 0);
      window.setTimeout(installAdminGuards, 100);
    }, { once: true });
  } else {
    window.setTimeout(installAdminGuards, 0);
    window.setTimeout(installAdminGuards, 100);
  }
})();