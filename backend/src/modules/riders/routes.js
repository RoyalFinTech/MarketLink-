// src/modules/riders/routes.js
'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate }            = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');

const ADMIN = ['admin', 'super_admin', 'moderator'];

// ── Public ────────────────────────────────────────────────────────────
router.get('/', ctrl.list);

// ── Rider self-service ────────────────────────────────────────────────
// NOTE: all literal routes below (/register, /profile, /me/..., /location,
// /availability) MUST be registered before the GET /:id route further down.
// Express matches routes in registration order, and /:id matches any single
// path segment — including "me" — so if it came first, /me/earnings etc.
// would be swallowed by /:id (id="me"), fail UUID validation, and 400.
router.post('/register',
  authenticate,
  [
    body('vehicleType')
      .optional().isIn(['motorbike','bicycle','car','van'])
      .withMessage('vehicleType must be motorbike, bicycle, car, or van.'),
    body('plateNumber')
      .optional().trim().isLength({ max: 30 }),
    body('licenseNumber')
      .optional().trim().isLength({ max: 60 }),
    body('nationalId')
      .optional().trim().isLength({ max: 60 }),
    body('emergencyContact')
      .optional().trim().isLength({ max: 20 }),
    body('address')
      .optional().trim().isLength({ max: 500 }),
    body('deliveryZone')
      .optional().trim().isLength({ max: 120 }),
  ],
  validate, ctrl.register
);

router.put('/profile',
  authenticate, authorize('rider'),
  [
    body('vehicleType').optional().isIn(['motorbike','bicycle','car','van']),
    body('plateNumber').optional().trim().isLength({ max: 30 }),
    body('emergencyContact').optional().trim().isLength({ max: 20 }),
    body('address').optional().trim().isLength({ max: 500 }),
    body('deliveryZone').optional().trim().isLength({ max: 120 }),
    body('profilePhotoUrl').optional({ nullable: true }).isURL(),
  ],
  validate, ctrl.updateProfile
);

router.patch('/availability',
  authenticate, authorize('rider'),
  [body('isOnline').isBoolean().withMessage('isOnline must be a boolean.')],
  validate, ctrl.setAvailability
);

router.post('/location',
  authenticate, authorize('rider'),
  [
    body('lat').isFloat({ min: -90,  max: 90  }).withMessage('Invalid latitude.'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
    body('deliveryId').optional({ nullable: true }).isUUID(),
  ],
  validate, ctrl.updateLocation
);

router.get('/me/deliveries',
  authenticate, authorize('rider'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['unassigned','assigned','picked_up','in_transit','delivered','failed','cancelled']),
  ],
  validate, ctrl.myDeliveries
);

router.get('/me/earnings',
  authenticate, authorize('rider'),
  [
    query('period').optional().isIn(['7d','30d','90d']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate, ctrl.myEarnings
);

router.get('/me/withdrawals',
  authenticate, authorize('rider'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['processing','completed','rejected']),
  ],
  validate, ctrl.myWithdrawals
);
router.post('/me/withdrawals',
  authenticate, authorize('rider'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero.'),
    body('payoutMethod').trim().notEmpty().withMessage('Payout method is required.'),
    body('payoutDetails').optional().isObject(),
  ],
  validate, ctrl.requestWithdrawal
);

// GET /riders/:id — public rider profile lookup. Registered after every
// literal self-service route above (see note near top of file).
router.get('/:id',
  [param('id').isUUID().withMessage('Invalid rider ID.')],
  validate, ctrl.getById
);

// ── Admin workflow ────────────────────────────────────────────────────
router.post('/:id/approve',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid rider ID.'),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  validate, ctrl.approve
);

router.post('/:id/reject',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid rider ID.'),
    body('reason').trim().notEmpty().withMessage('Reason is required.')
      .isLength({ max: 1000 }),
  ],
  validate, ctrl.reject
);

router.post('/:id/suspend',
  authenticate, authorize('admin', 'super_admin'),
  [
    param('id').isUUID().withMessage('Invalid rider ID.'),
    body('reason').trim().notEmpty().withMessage('Reason is required.')
      .isLength({ max: 1000 }),
  ],
  validate, ctrl.suspend
);

router.post('/:id/reinstate',
  authenticate, authorize('admin', 'super_admin'),
  [param('id').isUUID().withMessage('Invalid rider ID.')],
  validate, ctrl.reinstate
);

router.get('/:id/deliveries',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid rider ID.'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['unassigned','assigned','picked_up','in_transit','delivered','failed','cancelled']),
  ],
  validate, ctrl.riderDeliveries
);

router.get('/:id/earnings',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID().withMessage('Invalid rider ID.'),
    query('period').optional().isIn(['7d','30d','90d']),
  ],
  validate, ctrl.riderEarnings
);

module.exports = router;
