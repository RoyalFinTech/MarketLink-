// src/modules/notifications/controller.js
'use strict';
const svc = require('./service');
const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };
exports.list       = wrap(async (req,res) => res.json({ success:true, data: await svc.getForUser(req.user.id, req.query) }));
exports.markRead   = wrap(async (req,res) => { await svc.markRead(req.user.id, req.body.ids); res.json({ success:true }); });
exports.unreadCount= wrap(async (req,res) => res.json({ success:true, data: { count: await svc.getUnreadCount(req.user.id) } }));
