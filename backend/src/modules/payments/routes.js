// src/modules/payments/routes.js
'use strict';
const router = require('express').Router();
const { body, param } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const remittancePinLimiter = require('./remittancePinLimiter');
const {adminFactorLimiter,adminFactorLimiterIfAdmin,requireAdminFactor,requireAdminFactorIfAdmin}=require('../../middleware/adminFactor');
const ADMIN = ['admin','super_admin'];
router.get('/methods', authenticate, authorize('customer','vendor','rider'), ctrl.methods);
router.post('/initiate', authenticate, authorize('customer'),
  [body('orderId').isUUID(), body('method').isIn(['cod','wallet','wave','afrimoney','qmoney','modempay']), body('amount').isFloat({min:0}), body('accountNumber').optional({checkFalsy:true}).isString().isLength({max:20}).matches(/^\d+$/).withMessage('Enter the mobile-money number using digits only. The active Modem Pay mode validates its own required number format.')],
  validate, ctrl.initiate);
router.post('/:id/continue', authenticate,
  [param('id').isUUID(), body('action').isIn(['confirm','pin']), body('pin').optional({checkFalsy:true}).matches(/^\d{4,8}$/)],
  validate, ctrl.continue);
router.get('/cod/pending', authenticate, authorize(...ADMIN), ctrl.pendingCod);
router.get('/cod/remittance-instructions',authenticate,authorize('rider'),ctrl.codRemittanceInstructions);
router.post('/cod/:id/remittance', authenticate, authorize('rider'),
  [param('id').isUUID(),body('providerReference').trim().isLength({min:4,max:120}),body('depositMethod').optional().isIn(['wave','afrimoney']),body('proofFileId').isUUID()],
  validate,ctrl.submitCodRemittance);
router.get('/cod/remittances/mine',authenticate,authorize('rider'),ctrl.myCodRemittances);
router.get('/cod/remittances',authenticate,authorize(...ADMIN),ctrl.codRemittances);
router.post('/cod/remittances/:id/review',authenticate,authorize(...ADMIN),remittancePinLimiter,
  [param('id').isUUID(),body('decision').isIn(['verified','rejected']),body('note').optional().trim().isLength({max:500}),body('pin').optional().matches(/^\d{4}$/),body('totpCode').optional().matches(/^\d{6}$/)],
  validate,ctrl.reviewCodRemittance);
router.get('/:id/status', authenticate, [param('id').isUUID()], validate, ctrl.status);
router.post('/:id/confirm', authenticate, adminFactorLimiterIfAdmin,
  [param('id').isUUID(),body('pin').optional().matches(/^\d{4}$/),body('totpCode').optional().matches(/^\d{6}$/)],
  validate, requireAdminFactorIfAdmin, ctrl.confirm);
router.post('/:id/refund', authenticate, authorize(...ADMIN), adminFactorLimiter,
  [param('id').isUUID(), body('amount').optional().isFloat({min:0}), body('reason').optional().trim(),body('pin').optional().matches(/^\d{4}$/),body('totpCode').optional().matches(/^\d{6}$/)],
  validate, requireAdminFactor, ctrl.refund);
router.get('/history', authenticate, ctrl.history);
router.post('/webhook/:provider', ctrl.webhook);
module.exports = router;
