/* MarketLink Admin-only entry point.
   The shared app shell has a customer splash watchdog that normally routes to
   onboarding after ~5 seconds. In the admin deployment, keep all customer
   navigation inside the admin sign-in screen instead. */
(function () {
  'use strict';

  window.__ML_ADMIN_PORTAL_MODE = true;

  function openAdmin() {
    if (typeof window.openAdminLogin === 'function') {
      window.openAdminLogin();
      return true;
    }
    return false;
  }

  // The splash watchdog calls goOnboard after its animation. Override both
  // customer entry points so that timer cannot replace the admin login.
  window.goOnboard = openAdmin;
  window.goAuth = openAdmin;

  // Also guard direct navigation calls from any shared customer startup code.
  if (typeof window.showScreen === 'function' && !window.__ML_ADMIN_SHOWSCREEN_GUARD) {
    var originalShowScreen = window.showScreen;
    window.showScreen = function (id) {
      if (id === 'scr-onboard' || id === 'scr-auth' || id === 'scr-splash') {
        return openAdmin();
      }
      return originalShowScreen.apply(this, arguments);
    };
    window.__ML_ADMIN_SHOWSCREEN_GUARD = true;
  }

  // Open immediately after the shared app scripts have defined admin login.
  if (!openAdmin()) {
    document.addEventListener('DOMContentLoaded', openAdmin, { once: true });
    window.addEventListener('load', openAdmin, { once: true });
  }
})();
