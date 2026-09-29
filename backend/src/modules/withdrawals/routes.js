'use strict';
const router = require('express').Router();
const { body, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const svc = require('./service');

const WALLET_ROLES = ['vendor', 'rider'];

/**
 * Shared wallet/withdrawal endpoints.
 * Vendor and rider modules also expose role-specific aliases for backwards compatibility.
 */
router.get('/me',
  authenticate,
  authorize(...WALLET_ROLES),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['processing', 'completed', 'rejected']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [wallet, withdrawals] = await Promise.all([
        svc.getBalance(req.user.id),
        svc.listMine(req.user.id, req.query),
      ]);
      res.json({ success: true, data: { wallet, withdrawals } });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/me',
  authenticate,
  authorize(...WALLET_ROLES),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero.'),
    body('payoutMethod').trim().notEmpty().withMessage('Payout method is required.'),
    body('payoutDetails').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const withdrawal = await svc.requestWithdrawal(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted.',
        data: withdrawal,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
