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
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Not authenticated.', 401));
    const has = roles.some(r => (req.user.roles || []).includes(r));
    if (!has) return next(new AppError('Permission denied.', 403, 'FORBIDDEN'));
    next();
  };
}
module.exports = { authenticate, authorize };
