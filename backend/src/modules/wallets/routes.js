'use strict';

const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');

const WALLET_ROLES = ['customer', 'vendor', 'rider'];
router.get('/me', authenticate, authorize(...WALLET_ROLES), ctrl.getMine);
router.get('/me/transactions', authenticate, authorize(...WALLET_ROLES), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], validate, ctrl.transactions);
router.get('/me/deposits', authenticate, authorize(...WALLET_ROLES), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], validate, ctrl.deposits);
router.get('/deposits/:id', authenticate, authorize(...WALLET_ROLES), [
  param('id').isUUID(),
], validate, ctrl.getDeposit);
router.post('/deposits', authenticate, authorize(...WALLET_ROLES), [
  body('amount').isFloat({ gt: 0 }),
  body('method').optional().isIn(['modempay', 'wave', 'afrimoney', 'qmoney']),
  body('accountNumber').optional({ checkFalsy: true }).matches(/^\d{7}$/),
], validate, ctrl.createDeposit);
router.post('/deposits/:id/continue', authenticate, authorize(...WALLET_ROLES), [
  param('id').isUUID(),
  body('action').isIn(['confirm', 'pin']),
  body('pin').optional({ checkFalsy: true }).matches(/^\d{4,8}$/),
], validate, ctrl.continueDeposit);
router.get('/vendor/payout-profile', authenticate, authorize('vendor'), ctrl.getVendorPayoutProfile);
router.put('/vendor/payout-profile', authenticate, authorize('vendor'), [
  body('payoutMethod').isIn(['wave','afrimoney']),
  body('accountNumber').matches(/^\d{7}$/),
  body('beneficiaryName').trim().notEmpty().isLength({ max: 150 }),
], validate, ctrl.saveVendorPayoutProfile);
router.get('/rider/payout-profile', authenticate, authorize('rider'), ctrl.getRiderPayoutProfile);
router.put('/rider/payout-profile', authenticate, authorize('rider'), [
  body('payoutMethod').isIn(['wave','afrimoney']),
  body('accountNumber').matches(/^\d{7}$/),
  body('beneficiaryName').trim().notEmpty().isLength({ max: 150 }),
], validate, ctrl.saveRiderPayoutProfile);
router.get('/me/withdrawals', authenticate, authorize(...WALLET_ROLES), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['processing', 'payout_pending', 'completed', 'rejected']),
], validate, ctrl.withdrawals);
router.post('/withdrawals', authenticate, authorize(...WALLET_ROLES), [
  body('amount').isFloat({ gt: 0 }),
  body('payoutMethod').isIn(['wave', 'afrimoney']),
  body('payoutDetails').isObject(),
  body('payoutDetails.account_number').optional().matches(/^\d{7}$/),
  body('payoutDetails.beneficiary_name').optional().trim().notEmpty().isLength({ max: 150 }),
], validate, ctrl.requestWithdrawal);

module.exports = router;
