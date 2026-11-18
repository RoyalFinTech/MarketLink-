/* MarketLink Admin-only entry point.
   Install the navigation guard after every shared-app DOMContentLoaded handler.
   The customer onboarding bootstrap and returning-user router both replace
   goOnboard/goAuth during DOMContentLoaded, so guarding only at parse time is
   too early. */
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

  function installAdminGuards() {
    // Re-apply after the customer onboarding and PWA routers have initialized.
    window.goOnboard = openAdmin;
    window.goAuth = openAdmin;
    window.__mlRouteAfterSplash = openAdmin;

    // Prevent the shared splash, onboarding, auth, or remembered-customer
    // routes from replacing the admin portal. Admin screens remain available.
    if (typeof window.showScreen === 'function' && !window.__ML_ADMIN_SHOWSCREEN_GUARD) {
      var originalShowScreen = window.showScreen;
      window.showScreen = function (id) {
        if (id === 'scr-onboard' || id === 'scr-auth' ||
            id === 'scr-splash' || id === 'scr-returning') {
          return openAdmin();
        }
        return originalShowScreen.apply(this, arguments);
      };
      window.__ML_ADMIN_SHOWSCREEN_GUARD = true;
    }

    // The splash timer may already have fired on unusually slow devices.
    openAdmin();
  }

  // First pass prevents early navigation; second pass wins over all shared
  // DOMContentLoaded handlers that replace the customer routing functions.
  installAdminGuards();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(installAdminGuards, 0);
    }, { once: true });
  } else {
    window.setTimeout(installAdminGuards, 0);
  }
})();