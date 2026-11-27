'use strict';
const rateLimit = require('express-rate-limit');

// Count only unsuccessful responses so legitimate Admin reviews do not consume
// the failure budget. This is an IP-level guard; account PIN remains bcrypt
// verified inside the review transaction.
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Only a wrong-PIN response (401) consumes the budget. Other errors such as
  // a temporary database/settlement failure must not lock an Admin out.
  skip: (_req, res) => res.statusCode !== 401,
  message: {
    success: false,
    error: 'Too many unsuccessful Admin PIN attempts. Try again in 15 minutes.',
    code: 'COD_REMITTANCE_PIN_RATE_LIMITED',
  },
});
