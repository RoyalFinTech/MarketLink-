'use strict';
const rateLimit = require('express-rate-limit');
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many unsuccessful withdrawal PIN attempts. Try again in 15 minutes.',
    code: 'WITHDRAWAL_PIN_RATE_LIMITED',
  },
});
