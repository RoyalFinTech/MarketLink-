'use strict';
const svc = require('./service');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

// POST /assistant/ask — works for guests and authenticated users alike.
// If the request is authenticated (see optionalAuth in routes.js), the
// user's real role takes priority over any role claimed in the body, and
// live-account-data intents (wallet balance, order status) become available.
exports.ask = wrap(async (req, res) => {
  const data = await svc.ask({
    question: req.body.question,
    userRoles: req.user ? req.user.roles : null,
    claimedRole: req.body.role,
    user: req.user || null,
    sessionId: req.body.sessionId ? String(req.body.sessionId).slice(0, 100) : null,
  });
  res.json({ success: true, data });
});

exports.stats = wrap(async (req, res) => {
  res.json({ success: true, data: await svc.stats() });
});
