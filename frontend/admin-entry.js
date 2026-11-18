/* MarketLink Admin-only entry point.
   This file is injected only into the separate Render admin static-site build.
   Authentication remains server-authoritative through the MarketLink API. */
(function () {
  'use strict';
  function enterAdminPortal() {
    if (typeof window.openAdminLogin === 'function') {
      window.openAdminLogin();
      return true;
    }
    return false;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!enterAdminPortal()) {
        window.addEventListener('load', enterAdminPortal, { once: true });
      }
    }, { once: true });
  } else if (!enterAdminPortal()) {
    window.addEventListener('load', enterAdminPortal, { once: true });
  }
})();
