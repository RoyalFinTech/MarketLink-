// src/modules/riders/controller.js
'use strict';
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');

const isAdmin = u => (u?.roles || []).some(r => ['admin','super_admin','moderator'].includes(r));

function actor(req) {
  return {
    id:   req.user?.id,
    role: (req.user?.roles || []).find(r =>
      ['admin','super_admin','moderator','rider'].includes(r)) || 'unknown',
    meta: { ip: req.ip, ua: req.headers['user-agent'] },
  };
}

const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

exports.register = wrap(async (req, res) => {
  const rider = await svc.register(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Rider application submitted.', data: rider });
});

exports.list = wrap(async (req, res) => {
  const result = await svc.list({ ...req.query, isAdmin: isAdmin(req.user) });
  res.json({ success: true, data: result });
});

exports.getById = wrap(async (req, res) => {
  const includePrivate = isAdmin(req.user) || req.user?.id === req.params.id;
  const rider = await svc.getById(req.params.id, includePrivate);
  res.json({ success: true, data: rider });
});

// Rider updates their own profile
exports.updateProfile = wrap(async (req, res) => {
  const updated = await svc.updateProfile(req.user.id, req.body);
  res.json({ success: true, data: updated });
});

// Toggle availability (rider only, must be approved)
exports.setAvailability = wrap(async (req, res) => {
  if (req.body.isOnline === undefined) {
    throw new AppError('isOnline field is required.', 400, 'VALIDATION_ERROR');
  }
  const result = await svc.setAvailability(req.user.id, req.body.isOnline);
  res.json({ success: true, data: result });
});

// GPS location ping from rider app
exports.updateLocation = wrap(async (req, res) => {
  const { lat, lng, deliveryId } = req.body;
  if (!lat || !lng) throw new AppError('lat and lng are required.', 400, 'VALIDATION_ERROR');
  const result = await svc.updateLocation(req.user.id, { lat, lng, deliveryId });
  res.json({ success: true, data: result });
});

// Own delivery history
exports.myDeliveries = wrap(async (req, res) => {
  const rows = await svc.getDeliveryHistory(req.user.id, req.query);
  res.json({ success: true, data: rows });
});

// Own earnings
exports.myEarnings = wrap(async (req, res) => {
  const data = await svc.getEarnings(req.user.id, req.query);
  res.json({ success: true, data });
});

// Admin: any rider's deliveries
exports.riderDeliveries = wrap(async (req, res) => {
  const rows = await svc.getDeliveryHistory(req.params.id, req.query);
  res.json({ success: true, data: rows });
});

// Admin: any rider's earnings
exports.riderEarnings = wrap(async (req, res) => {
  const data = await svc.getEarnings(req.params.id, req.query);
  res.json({ success: true, data });
});

exports.approve    = wrap(async (req, res) => {
  const rider = await svc.approve(req.params.id, actor(req), req.body.notes);
  res.json({ success: true, message: 'Rider approved.', data: rider });
});

exports.reject = wrap(async (req, res) => {
  const rider = await svc.reject(req.params.id, actor(req), req.body.reason);
  res.json({ success: true, message: 'Rider rejected.', data: rider });
});

exports.suspend = wrap(async (req, res) => {
  const rider = await svc.suspend(req.params.id, actor(req), req.body.reason);
  res.json({ success: true, message: 'Rider suspended.', data: rider });
});

exports.reinstate = wrap(async (req, res) => {
  const rider = await svc.reinstate(req.params.id, actor(req));
  res.json({ success: true, message: 'Rider reinstated.', data: rider });
});

// ── Withdrawals (rider self-service) ────────────────────────────────
const withdrawalsSvc = require('../withdrawals/service');

// GET /riders/me/withdrawals — balance + request history for the logged-in rider
exports.myWithdrawals = wrap(async (req, res) => {
  const [wallet, history] = await Promise.all([
    withdrawalsSvc.getBalance(req.user.id),
    withdrawalsSvc.listMine(req.user.id, req.query),
  ]);
  res.json({ success: true, data: { wallet, withdrawals: history } });
});

// POST /riders/me/withdrawals — create a withdrawal request
exports.requestWithdrawal = wrap(async (req, res) => {
  const wd = await withdrawalsSvc.requestWithdrawal(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Withdrawal request submitted.', data: wd });
});
