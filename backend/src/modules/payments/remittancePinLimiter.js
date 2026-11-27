'use strict';
const rateLimit = require('express-rate-limit');

// Match the existing withdrawal PIN limiter: count failed responses, but
// release successful attempts from the budget after the response completes.
// This middleware runs before the controller, so inspecting res.statusCode in
// a pre-request skip callback would always see the default 200 and bypass the
// limiter entirely.
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many unsuccessful Admin PIN attempts. Try again in 15 minutes.',
    code: 'COD_REMITTANCE_PIN_RATE_LIMITED',
  },
});
