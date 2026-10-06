const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { AppError } = require('./errorHandler');
async function authenticate(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) throw new AppError('No token provided.', 401, 'MISSING_TOKEN');
    const token = h.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.phone, u.email, u.status, array_agg(r.name) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 GROUP BY u.id`, [decoded.sub]);
    if (!rows.length) throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
    const user = rows[0];
    if (user.status === 'suspended') throw new AppError('Account suspended.', 403, 'ACCOUNT_SUSPENDED');
    if (user.status === 'deleted') throw new AppError('Account does not exist.', 401, 'USER_NOT_FOUND');
    req.user = user;
    next();
  } catch (err) { next(err); }
}
async function authorize(...roles) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new AppError('Not authenticated.', 401));
      const has = roles.some(r => (req.user.roles || []).includes(r));
      if (!has) return next(new AppError('Permission denied.', 403, 'FORBIDDEN'));

      // A vendor/rider role alone is never sufficient for operational access.
      // KYC approval must also exist in the database, so a pending application
      // cannot create products, accept orders, request payouts, go online, etc.
      if (roles.includes('vendor') && (req.user.roles || []).includes('vendor')) {
        const { rows } = await query(
          `SELECT kyc_status FROM vendors WHERE user_id = $1`, [req.user.id]
        );
        if (!rows.length || rows[0].kyc_status !== 'approved') {
          return next(new AppError('Vendor account is pending approval.', 403, 'VENDOR_NOT_APPROVED'));
        }
      }
      if (roles.includes('rider') && (req.user.roles || []).includes('rider')) {
        const { rows } = await query(
          `SELECT kyc_status FROM riders WHERE user_id = $1`, [req.user.id]
        );
        if (!rows.length || rows[0].kyc_status !== 'approved') {
          return next(new AppError('Rider account is pending approval.', 403, 'RIDER_NOT_APPROVED'));
        }
      }
      next();
    } catch (err) { next(err); }
  };
}
module.exports = { authenticate, authorize };