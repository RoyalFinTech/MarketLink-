'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

function signAccess(id, roles) { return jwt.sign({ sub: id, roles }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }); }
function signRefresh(id) { return jwt.sign({ sub: id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }); }
function genOtp() { return String(crypto.randomInt(100000, 999999)); }

async function storeOtp(destination, channel, purpose, otp, userId = null) {
  const hash = await bcrypt.hash(otp, 8);
  const exp = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 5) * 60000);
  await query('DELETE FROM otp_verifications WHERE destination=$1 AND purpose=$2 AND verified_at IS NULL', [destination, purpose]);
  await query('INSERT INTO otp_verifications (user_id,destination,channel,code_hash,purpose,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [userId, destination, channel, hash, purpose, exp]);
}

async function verifyOtp(destination, purpose, otp) {
  const { rows } = await query('SELECT * FROM otp_verifications WHERE destination=$1 AND purpose=$2 AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1', [destination, purpose]);
  if (!rows.length) throw new AppError('No OTP was requested for this number.', 400, 'OTP_NOT_FOUND');
  const rec = rows[0];
  if (new Date() > new Date(rec.expires_at)) throw new AppError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  await query('UPDATE otp_verifications SET attempts=attempts+1 WHERE id=$1', [rec.id]);
  if (rec.attempts >= 5) throw new AppError('Too many attempts. Please request a new OTP.', 429, 'OTP_MAX_ATTEMPTS');
  if (!await bcrypt.compare(otp, rec.code_hash)) throw new AppError('Incorrect OTP. Please try again.', 400, 'INVALID_OTP');
  await query('UPDATE otp_verifications SET verified_at=now() WHERE id=$1', [rec.id]);
  return rec;
}

async function registerInitiate({ fullName, phone, userType = 'customer' }) {
  const { rows } = await query('SELECT id FROM users WHERE phone=$1', [phone]);
  if (rows.length) throw new AppError('An account already exists with this phone number.', 409, 'PHONE_ALREADY_REGISTERED');
  const otp = genOtp();
  await storeOtp(phone, 'sms', 'registration', otp);
  logger.info('Registration OTP', { phone, dev: process.env.OTP_DEV_MODE === 'true' });
  return { message: 'OTP sent.', ...(process.env.OTP_DEV_MODE === 'true' ? { devOtp: otp } : {}) };
}

async function registerComplete({ fullName, phone, otp, pin, userType = 'customer' }) {
  await verifyOtp(phone, 'registration', otp);
  const { rows } = await query('SELECT id FROM users WHERE phone=$1', [phone]);
  if (rows.length) throw new AppError('An account already exists with this phone number.', 409, 'PHONE_ALREADY_REGISTERED');
  const hash = await bcrypt.hash(pin, 12);
  return withTransaction(async (client) => {
    const { rows: [user] } = await client.query(
      'INSERT INTO users (full_name,phone,password_hash,pin_hash,phone_verified,status) VALUES($1,$2,$3,$4,TRUE,\'active\') RETURNING id,full_name,phone,status',
      [fullName, phone, hash, hash]);
    const types = Array.isArray(userType) ? userType : [userType];
    for (const t of types) await client.query('INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE name=$2', [user.id, t]);
    if (types.includes('customer')) {
      const ref = 'ML' + Math.random().toString(36).toUpperCase().slice(2,8);
      await client.query('INSERT INTO customers (user_id,referral_code) VALUES($1,$2)', [user.id, ref]);
      await client.query('INSERT INTO wallets (user_id) VALUES($1)', [user.id]);
    }
    const accessToken = signAccess(user.id, types);
    const rt = signRefresh(user.id);
    const rth = await bcrypt.hash(rt, 8);
    await client.query('INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES($1,$2,$3)', [user.id, rth, new Date(Date.now() + 30*24*60*60*1000)]);
    return { user, accessToken, refreshToken: rt, roles: types };
  });
}

async function login({ phone, pin }) {
  const { rows } = await query(
    'SELECT u.id,u.full_name,u.phone,u.pin_hash,u.status,array_agg(r.name) AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.phone=$1 GROUP BY u.id',
    [phone]);
  if (!rows.length) throw new AppError('No account found with this phone number.', 401, 'USER_NOT_FOUND');
  const user = rows[0];
  if (user.status === 'suspended') throw new AppError('Account suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED');
  if (!user.pin_hash) throw new AppError('Account setup incomplete.', 401, 'INCOMPLETE_SETUP');
  if (!await bcrypt.compare(pin, user.pin_hash)) throw new AppError('Incorrect PIN.', 401, 'INVALID_PIN');
  await query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
  const roles = (user.roles || []).filter(Boolean);
  const accessToken = signAccess(user.id, roles);
  const rt = signRefresh(user.id);
  const rth = await bcrypt.hash(rt, 8);
  await query('INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES($1,$2,$3)', [user.id, rth, new Date(Date.now() + 30*24*60*60*1000)]);
  return { user: { id: user.id, fullName: user.full_name, phone: user.phone, roles }, accessToken, refreshToken: rt };
}

async function refreshAccessToken(rt) {
  let decoded;
  try { decoded = jwt.verify(rt, process.env.JWT_REFRESH_SECRET); } catch { throw new AppError('Invalid refresh token.', 401, 'INVALID_REFRESH_TOKEN'); }
  const { rows } = await query('SELECT id,token_hash FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()', [decoded.sub]);
  let matched = null;
  for (const row of rows) { if (await bcrypt.compare(rt, row.token_hash)) { matched = row; break; } }
  if (!matched) throw new AppError('Refresh token not recognised.', 401, 'INVALID_REFRESH_TOKEN');
  await query('UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1', [matched.id]);
  const { rows: roleRows } = await query('SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [decoded.sub]);
  const roles = roleRows.map(r => r.name);
  const newAccess = signAccess(decoded.sub, roles);
  const newRt = signRefresh(decoded.sub);
  const newRth = await bcrypt.hash(newRt, 8);
  await query('INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES($1,$2,$3)', [decoded.sub, newRth, new Date(Date.now() + 30*24*60*60*1000)]);
  return { accessToken: newAccess, refreshToken: newRt };
}

async function logout(userId, rt) {
  if (!rt) return;
  const { rows } = await query('SELECT id,token_hash FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
  for (const row of rows) { if (await bcrypt.compare(rt, row.token_hash)) { await query('UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1', [row.id]); break; } }
}

async function requestPinReset(phone) {
  const { rows } = await query('SELECT id FROM users WHERE phone=$1', [phone]);
  if (rows.length) {
    const otp = genOtp();
    await storeOtp(phone, 'sms', 'password_reset', otp, rows[0].id);
    if (process.env.OTP_DEV_MODE === 'true') return { message: 'OTP sent.', devOtp: otp };
  }
  return { message: 'If an account exists with this number, an OTP has been sent.' };
}

async function confirmPinReset({ phone, otp, newPin }) {
  await verifyOtp(phone, 'password_reset', otp);
  const hash = await bcrypt.hash(newPin, 12);
  await query('UPDATE users SET pin_hash=$1, password_hash=$1 WHERE phone=$2', [hash, phone]);
  return { message: 'PIN reset successfully.' };
}

module.exports = { registerInitiate, registerComplete, login, refreshAccessToken, logout, requestPinReset, confirmPinReset };
