// src/modules/notifications/controller.js
'use strict';
const svc = require('./service');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
exports.list = wrap(async (req, res) => res.json({ success: true, data: await svc.getForUser(req.user.id, req.query) }));
exports.markRead = wrap(async (req, res) => { await svc.markRead(req.user.id, req.body.ids); res.json({ success: true }); });
exports.unreadCount = wrap(async (req, res) => res.json({ success: true, data: { count: await svc.getUnreadCount(req.user.id) } }));
exports.registerPushToken = wrap(async (req, res) => res.status(201).json({ success: true, data: await svc.registerPushToken(req.user.id, req.body.token, req.body.platform || 'web') }));
exports.removePushToken = wrap(async (req, res) => res.json({ success: true, data: await svc.removePushToken(req.user.id, req.body.token) }));
exports.sendToUser = wrap(async (req, res) => {
  const result = await svc.send({
    userId: req.body.userId,
    type: req.body.type || 'admin_message',
    title: req.body.title,
    body: req.body.body,
    referenceType: req.body.referenceType || 'admin_message',
    referenceId: req.body.referenceId || null,
    channels: { push: true, data: req.body.data || {} }
  });
  res.status(201).json({ success: true, data: result });
});
