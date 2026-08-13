// src/modules/vendors/controller.js
'use strict';
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');

const isAdmin = u => (u?.roles || []).some(r => ['admin','super_admin','moderator'].includes(r));

function actor(req) {
  return {
    id:   req.user?.id,
    role: (req.user?.roles || []).find(r => ['admin','super_admin','moderator','vendor'].includes(r)) || 'unknown',
    meta: { ip: req.ip, ua: req.headers['user-agent'] },
  };
}

const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

// POST /vendors/register
exports.register = wrap(async (req, res) => {
  const vendor = await svc.register(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Vendor application submitted.', data: vendor });
});

// GET /vendors  (list — public sees approved only, admin sees all)
exports.list = wrap(async (req, res) => {
  const result = await svc.list({ ...req.query, actor: actor(req) });
  res.json({ success: true, data: result });
});

// GET /vendors/:id
exports.getById = wrap(async (req, res) => {
  const includePrivate = isAdmin(req.user) || req.user?.id === req.params.id;
  const vendor = await svc.getById(req.params.id, includePrivate);
  res.json({ success: true, data: vendor });
});

// PUT /vendors/profile  (vendor updates their own store)
exports.updateProfile = wrap(async (req, res) => {
  const updated = await svc.updateProfile(req.user.id, req.body);
  res.json({ success: true, data: updated });
});

// PUT /vendors/:id/profile  (admin updates any vendor store)
exports.adminUpdateProfile = wrap(async (req, res) => {
  const updated = await svc.updateProfile(req.params.id, req.body);
  res.json({ success: true, data: updated });
});

// POST /vendors/:id/approve
exports.approve = wrap(async (req, res) => {
  const vendor = await svc.approve(req.params.id, actor(req), req.body.notes);
  res.json({ success: true, message: 'Vendor approved.', data: vendor });
});

// POST /vendors/:id/reject
exports.reject = wrap(async (req, res) => {
  if (!req.body.reason?.trim()) throw new AppError('Rejection reason is required.', 400, 'VALIDATION_ERROR');
  const vendor = await svc.reject(req.params.id, actor(req), req.body.reason);
  res.json({ success: true, message: 'Vendor application rejected.', data: vendor });
});

// POST /vendors/:id/suspend
exports.suspend = wrap(async (req, res) => {
  if (!req.body.reason?.trim()) throw new AppError('Suspension reason is required.', 400, 'VALIDATION_ERROR');
  const vendor = await svc.suspend(req.params.id, actor(req), req.body.reason);
  res.json({ success: true, message: 'Vendor suspended.', data: vendor });
});

// POST /vendors/:id/reinstate
exports.reinstate = wrap(async (req, res) => {
  const vendor = await svc.reinstate(req.params.id, actor(req));
  res.json({ success: true, message: 'Vendor reinstated.', data: vendor });
});

// GET /vendors/me/analytics
exports.myAnalytics = wrap(async (req, res) => {
  const data = await svc.getAnalytics(req.user.id, { period: req.query.period });
  res.json({ success: true, data });
});

// GET /vendors/:id/analytics  (admin)
exports.analytics = wrap(async (req, res) => {
  const data = await svc.getAnalytics(req.params.id, { period: req.query.period });
  res.json({ success: true, data });
});

// ── Withdrawals (vendor self-service) ───────────────────────────────
const withdrawalsSvc = require('../withdrawals/service');

// GET /vendors/withdrawals — balance + request history for the logged-in vendor
exports.myWithdrawals = wrap(async (req, res) => {
  const [wallet, history] = await Promise.all([
    withdrawalsSvc.getBalance(req.user.id),
    withdrawalsSvc.listMine(req.user.id, req.query),
  ]);
  res.json({ success: true, data: { wallet, withdrawals: history } });
});

// POST /vendors/withdrawals — create a withdrawal request
exports.requestWithdrawal = wrap(async (req, res) => {
  const wd = await withdrawalsSvc.requestWithdrawal(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Withdrawal request submitted.', data: wd });
});
