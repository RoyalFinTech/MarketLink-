// src/modules/categories/controller.js
'use strict';
const svc = require('./service');

// Extract actor context from req for audit logging
function actor(req) {
  return {
    id: req.user?.id || null,
    role: (req.user?.roles || []).find(r => ['admin','super_admin','moderator'].includes(r)) || 'unknown',
    meta: { ip: req.ip, ua: req.headers['user-agent'] },
  };
}

const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

exports.list = wrap(async (req, res) => {
  const isAdmin = (req.user?.roles || []).some(r => ['admin','super_admin','moderator'].includes(r));
  const result = await svc.list({
    page:             req.query.page,
    limit:            req.query.limit,
    search:           req.query.search,
    parentId:         req.query.parentId,
    includeInactive:  isAdmin && req.query.includeInactive === 'true',
    includeDeleted:   isAdmin && req.query.includeDeleted  === 'true',
  });
  res.json({ success: true, data: result });
});

exports.getTree = wrap(async (req, res) => {
  const tree = await svc.getTree();
  res.json({ success: true, data: tree });
});

exports.getById = wrap(async (req, res) => {
  const cat = await svc.getById(req.params.id);
  if (cat.deleted_at && !(req.user?.roles || []).some(r => ['admin','super_admin'].includes(r))) {
    throw require('../../middleware/errorHandler').AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
  }
  res.json({ success: true, data: cat });
});

exports.getBySlug = wrap(async (req, res) => {
  res.json({ success: true, data: await svc.getBySlug(req.params.slug) });
});

exports.create = wrap(async (req, res) => {
  const cat = await svc.create(req.body, actor(req));
  res.status(201).json({ success: true, data: cat });
});

exports.update = wrap(async (req, res) => {
  const cat = await svc.update(req.params.id, req.body, actor(req));
  res.json({ success: true, data: cat });
});

exports.softDelete = wrap(async (req, res) => {
  const cat = await svc.softDelete(req.params.id, actor(req));
  res.json({ success: true, message: 'Category deleted.', data: cat });
});

exports.restore = wrap(async (req, res) => {
  const cat = await svc.restore(req.params.id, actor(req));
  res.json({ success: true, message: 'Category restored.', data: cat });
});

exports.reorder = wrap(async (req, res) => {
  const result = await svc.reorder(req.body.items, actor(req));
  res.json({ success: true, data: result });
});

exports.getAuditLog = wrap(async (req, res) => {
  const logs = await svc.getAuditLog(req.params.id, req.query);
  res.json({ success: true, data: logs });
});
