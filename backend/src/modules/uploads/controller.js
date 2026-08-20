// src/modules/uploads/controller.js
'use strict';
const multer = require('multer');
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(`File type not allowed: ${file.mimetype}`, 400, 'INVALID_FILE_TYPE'));
  },
});

const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch(e) { next(e); } };

exports.uploadMiddleware = upload.single('file');

exports.uploadFile = wrap(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded. Send file as multipart/form-data field "file".', 400, 'NO_FILE');
  const purpose = req.body.purpose || req.query.purpose || 'general';
  const result = await svc.upload(req.file, purpose, req.user.id);
  res.status(201).json({ success: true, data: result });
});

exports.deleteFile = wrap(async (req, res) => {
  const result = await svc.deleteFile(req.params.id, req.user.id, req.user.roles);
  res.json({ success: true, data: result });
});
