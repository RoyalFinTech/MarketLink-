// src/modules/notifications/routes.js
'use strict';
const router = require('express').Router();
const { body, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
router.get('/', authenticate, [
  query('unreadOnly').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], validate, ctrl.list);
router.post('/read', authenticate, [body('ids').optional().isArray(), body('ids.*').optional().isUUID()], validate, ctrl.markRead);
router.get('/unread-count', authenticate, ctrl.unreadCount);
router.post('/push-token', authenticate, [
  body('token').isString().trim().isLength({ min: 20, max: 4096 }),
  body('platform').optional().isIn(['web', 'ios', 'android'])
], validate, ctrl.registerPushToken);
router.delete('/push-token', authenticate, [
  body('token').isString().trim().isLength({ min: 20, max: 4096 })
], validate, ctrl.removePushToken);
router.post('/send', authenticate, authorize('admin', 'super_admin'), [
  body('userId').isUUID(),
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('body').optional().isString().isLength({ max: 4000 }),
  body('type').optional().isString().isLength({ max: 80 }),
  body('referenceType').optional().isString().isLength({ max: 80 }),
  body('referenceId').optional({ nullable: true }).isUUID(),
  body('data').optional().isObject()
], validate, ctrl.sendToUser);
module.exports = router;
