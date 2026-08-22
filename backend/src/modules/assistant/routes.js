'use strict';
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { query } = require('../../config/db');
const ctrl = require('./controller');

// Best-effort authentication: if a valid bearer token is present, attach
// req.user (same shape as the real `authenticate` middleware) so the
// assistant can prioritize the caller's real role. Unlike `authenticate`,
// a missing or invalid token is NOT an error — the assistant is also
// usable by guests browsing the storefront pre-login.
async function optionalAuth(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return next();
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_ACCESS_SECRET);
    const { rows } = await query(
      `SELECT u.id, u.status, array_agg(r.name) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 GROUP BY u.id`, [decoded.sub]);
    if (rows.length && rows[0].status !== 'suspended' && rows[0].status !== 'deleted') req.user = rows[0];
    next();
  } catch (e) {
    next(); // invalid/expired token → treat as guest rather than failing the request
  }
}

router.post('/ask',
  optionalAuth,
  [
    body('question').trim().notEmpty().withMessage('Question is required.').isLength({ max: 500 }),
    body('role').optional().isIn(['customer', 'vendor', 'rider', 'admin']),
    body('sessionId').optional().isString().isLength({ max: 100 }),
  ],
  validate, ctrl.ask
);

router.get('/stats', ctrl.stats);

module.exports = router;
