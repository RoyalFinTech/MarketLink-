// src/modules/vendors/routes.js
'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate }            = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');

const ADMIN = ['admin', 'super_admin', 'moderator'];

// ── Public ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /vendors:
 *   get:
 *     summary: List vendors (approved only for public; all for admins)
 *     tags: [Vendors]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: isOpen
 *         schema: { type: boolean }
 *       - in: query
 *         name: kycStatus
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, suspended]
 *         description: Admin only
 */
router.get('/', ctrl.list);

/**
 * @swagger
 * /vendors/withdrawals:
 *   get:
 *     summary: Vendor's wallet balance and withdrawal history
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Request a withdrawal from the vendor's wallet balance
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
// IMPORTANT: this must be registered before GET /:id, otherwise Express
// would try to match "withdrawals" as a vendor :id (and fail UUID validation).
router.get('/withdrawals',
  authenticate, authorize('vendor'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['processing', 'completed', 'rejected']),
  ],
  validate, ctrl.myWithdrawals
);
router.post('/withdrawals',
  authenticate, authorize('vendor'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero.'),
    body('payoutMethod').trim().notEmpty().withMessage('Payout method is required.'),
    body('payoutDetails').optional().isObject(),
  ],
  validate, ctrl.requestWithdrawal
);

// ── Vendor self-service ───────────────────────────────────────────────
// NOTE: literal routes (/register, /profile, /me/analytics, /withdrawals)
// must all be registered before GET /:id further below — see the same
// note in riders/routes.js for why (Express registration-order matching).
/**
 * @swagger
 * /vendors/register:
 *   post:
 *     summary: Register as a vendor (requires customer account first)
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/register',
  authenticate,
  [
    body('businessName')
      .trim().notEmpty().withMessage('Business name is required.')
      .isLength({ max: 150 }).withMessage('Business name must be 150 chars or fewer.'),
    body('businessCategory')
      .optional().trim().isLength({ max: 80 }),
    body('businessAddress')
      .optional().trim().isLength({ max: 500 }),
    body('phone')
      .optional().isMobilePhone('any').withMessage('Invalid phone number.'),
    body('email')
      .optional().isEmail().normalizeEmail().withMessage('Invalid email address.'),
    body('description')
      .optional().trim().isLength({ max: 2000 }),
    body('nationalId')
      .optional().trim().isLength({ max: 60 }),
    body('latitude')
      .optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('longitude')
      .optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  ],
  validate, ctrl.register
);

/**
 * @swagger
 * /vendors/profile:
 *   put:
 *     summary: Vendor updates their own store profile
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/profile',
  authenticate, authorize('vendor'),
  [
    body('businessName').optional().trim().notEmpty().isLength({ max: 150 }),
    body('businessCategory').optional().trim().isLength({ max: 80 }),
    body('businessAddress').optional().trim().isLength({ max: 500 }),
    body('phone').optional().isMobilePhone('any'),
    body('email').optional().isEmail().normalizeEmail(),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('logoUrl').optional({ nullable: true }).isURL(),
    body('bannerUrl').optional({ nullable: true }).isURL(),
    body('returnPolicy').optional().trim().isLength({ max: 2000 }),
    body('minOrderValue').optional().isFloat({ min: 0 }),
    body('deliveryTimeMin').optional().isInt({ min: 0 }),
    body('deliveryTimeMax').optional().isInt({ min: 0 }),
    body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
    body('isOpen').optional().isBoolean(),
    body('vacationMode').optional().isBoolean(),
  ],
  validate, ctrl.updateProfile
);

/**
 * @swagger
 * /vendors/me/analytics:
 *   get:
 *     summary: Vendor analytics dashboard (own store)
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [7d, 30d, 90d], default: 30d }
 */
router.get('/me/analytics',
  authenticate, authorize('vendor'),
  [query('period').optional().isIn(['7d', '30d', '90d'])],
  validate, ctrl.myAnalytics
);

/**
 * @swagger
 * /vendors/{id}:
 *   get:
 *     summary: Get vendor store profile
 *     tags: [Vendors]
 */
// Registered after every literal self-service route above (see note near top of file).
router.get('/:id',
  [param('id').isUUID().withMessage('Invalid vendor ID.')],
  validate, ctrl.getById
);

// ── Admin workflow ────────────────────────────────────────────────────
/**
 * @swagger
 * /vendors/{id}/profile:
 *   put:
 *     summary: Admin updates any vendor profile
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/profile',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid vendor ID.'),
    body('commissionPct')
      .optional().isFloat({ min: 0, max: 100 }).withMessage('Commission must be 0-100.'),
    body('isOpen').optional().isBoolean(),
    body('vacationMode').optional().isBoolean(),
  ],
  validate, ctrl.adminUpdateProfile
);

/**
 * @swagger
 * /vendors/{id}/approve:
 *   post:
 *     summary: Approve a pending vendor application
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/approve',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid vendor ID.'),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  validate, ctrl.approve
);

/**
 * @swagger
 * /vendors/{id}/reject:
 *   post:
 *     summary: Reject a vendor application
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/reject',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid vendor ID.'),
    body('reason').trim().notEmpty().withMessage('Rejection reason is required.')
      .isLength({ max: 1000 }),
  ],
  validate, ctrl.reject
);

/**
 * @swagger
 * /vendors/{id}/suspend:
 *   post:
 *     summary: Suspend an approved vendor
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/suspend',
  authenticate, authorize('admin', 'super_admin'),
  [
    param('id').isUUID().withMessage('Invalid vendor ID.'),
    body('reason').trim().notEmpty().withMessage('Suspension reason is required.')
      .isLength({ max: 1000 }),
  ],
  validate, ctrl.suspend
);

/**
 * @swagger
 * /vendors/{id}/reinstate:
 *   post:
 *     summary: Reinstate a suspended vendor
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/reinstate',
  authenticate, authorize('admin', 'super_admin'),
  [param('id').isUUID().withMessage('Invalid vendor ID.')],
  validate, ctrl.reinstate
);

/**
 * @swagger
 * /vendors/{id}/analytics:
 *   get:
 *     summary: Admin view of any vendor's analytics
 *     tags: [Vendors]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/analytics',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid vendor ID.'),
    query('period').optional().isIn(['7d', '30d', '90d']),
  ],
  validate, ctrl.analytics
);

module.exports = router;
