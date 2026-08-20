// src/modules/admin/controller.js
'use strict';
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');
const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };
const actor = req => ({ id: req.user.id, role: (req.user.roles||[])[0] });
exports.dashboard  = wrap(async (req,res) => res.json({ success:true, data: await svc.getDashboard() }));
exports.users      = wrap(async (req,res) => res.json({ success:true, data: await svc.getUsers(req.query) }));
exports.suspend    = wrap(async (req,res) => {
  if (!req.body.reason?.trim()) throw new AppError('Reason required.',400,'VALIDATION_ERROR');
  res.json({ success:true, data: await svc.suspendUser(req.params.id, req.body.reason, actor(req)) });
});
exports.reinstate  = wrap(async (req,res) => res.json({ success:true, data: await svc.reinstateUser(req.params.id, actor(req)) }));
exports.analytics  = wrap(async (req,res) => res.json({ success:true, data: await svc.getAnalytics(req.query) }));
exports.settings   = wrap(async (req,res) => res.json({ success:true, data: await svc.getSystemSettings() }));
exports.setSetting = wrap(async (req,res) => res.json({ success:true, data: await svc.updateSystemSetting(req.params.key, req.body.value, req.user.id) }));
exports.auditLogs  = wrap(async (req,res) => res.json({ success:true, data: await svc.getAuditLogs(req.query) }));
exports.reports    = wrap(async (req,res) => res.json({ success:true, data: await svc.getReports(req.query) }));

// ── Withdrawals (admin approval workflow) ───────────────────────────
const withdrawalsSvc = require('../withdrawals/service');
exports.pendingWithdrawals = wrap(async (req,res) => res.json({ success:true, data: await withdrawalsSvc.listPendingForAdmin(req.query) }));
exports.approveWithdrawal  = wrap(async (req,res) => res.json({ success:true, message:'Withdrawal approved and paid out.', data: await withdrawalsSvc.approve(req.params.id, req.user.id) }));
exports.rejectWithdrawal   = wrap(async (req,res) => res.json({ success:true, message:'Withdrawal rejected.', data: await withdrawalsSvc.reject(req.params.id, req.user.id) }));
