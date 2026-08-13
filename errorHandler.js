const logger = require('../utils/logger');
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}
function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
}
function errorHandler(err, req, res, next) {
  if (!err.isOperational) logger.error('Unexpected error', { message: err.message, stack: err.stack });
  if (err.code === '23505') return res.status(409).json({ success: false, error: 'A record with these details already exists.', code: 'DUPLICATE_ENTRY' });
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ success: false, error: 'Invalid token.', code: 'INVALID_TOKEN' });
  if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'Token expired.', code: 'TOKEN_EXPIRED' });
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(statusCode).json({
    success: false,
    error: err.isOperational ? err.message : (isProd ? 'An unexpected error occurred.' : err.message),
    ...(err.code ? { code: err.code } : {}),
    ...(isProd ? {} : { stack: err.stack }),
  });
}
module.exports = { notFound, errorHandler, AppError };
