// src/modules/delivery/controller.js
'use strict';
const svc = require('./service');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch(e) { next(e); } };
const isAdmin = u => (u?.roles||[]).some(r => ['admin','super_admin','moderator'].includes(r));
exports.list       = wrap(async (req,res) => res.json({ success:true, data: await svc.list({ ...req.query, isAdmin: isAdmin(req.user) }) }));
exports.getById    = wrap(async (req,res) => res.json({ success:true, data: await svc.getById(req.params.id, req.user.id, req.user.roles) }));
exports.getTracking= wrap(async (req,res) => res.json({ success:true, data: await svc.getTracking(req.params.id) }));
exports.assign     = wrap(async (req,res) => res.json({ success:true, data: await svc.assignRider(req.params.id, req.body.riderId, { id: req.user.id, isAuto: false }) }));
exports.updateStatus=wrap(async (req,res) => res.json({ success:true, data: await svc.updateStatus(req.params.id, req.body.status, req.user.id, req.user.roles, req.body) }));
