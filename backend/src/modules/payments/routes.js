// src/modules/payments/routes.js
'use strict';
const router = require('express').Router();
const { body, param } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const ADMIN = ['admin','super_admin'];
router.get('/methods', authenticate, authorize('customer'), ctrl.methods);
router.post('/initiate', authenticate, authorize('customer'),
  [body('orderId').isUUID(), body('method').isIn(['cod','wave','afrimoney','qmoney','modempay']), body('amount').isFloat({min:0}), body('accountNumber').optional({checkFalsy:true}).matches(/^\d{7}$/)],
  validate, ctrl.initiate);
router.post('/:id/continue', authenticate,
  [param('id').isUUID(), body('action').isIn(['confirm','pin']), body('pin').optional({checkFalsy:true}).matches(/^\d{4,8}$/)],
  validate, ctrl.continue);
router.get('/:id/status', authenticate, [param('id').isUUID()], validate, ctrl.status);
router.post('/:id/confirm', authenticate,
  [param('id').isUUID()], validate, ctrl.confirm);
router.post('/:id/refund', authenticate, authorize(...ADMIN),
  [param('id').isUUID(), body('amount').optional().isFloat({min:0}), body('reason').optional().trim()],
  validate, ctrl.refund);
router.get('/history', authenticate, ctrl.history);
router.post('/webhook/:provider', ctrl.webhook);
module.exports = router;
