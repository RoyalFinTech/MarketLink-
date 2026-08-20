// src/modules/customers/routes.js
'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate }            = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const ADMIN = ['admin','super_admin','moderator'];

// Own profile
router.get('/me',              authenticate, ctrl.getMyProfile);
router.put('/me',              authenticate, [
  body('fullName').optional().trim().notEmpty().isLength({ max: 150 }),
  body('dateOfBirth').optional({ nullable: true }).isISO8601().withMessage('Invalid date.'),
  body('gender').optional({ nullable: true }).isIn(['male','female','other','prefer_not_to_say']),
  body('profilePhotoUrl').optional({ nullable: true }).isURL(),
], validate, ctrl.updateMyProfile);

// Addresses
router.get('/me/addresses',    authenticate, ctrl.listAddresses);
router.post('/me/addresses',   authenticate, [
  body('label').optional().trim().isLength({ max: 50 }),
  body('fullAddress').trim().notEmpty().withMessage('Full address is required.').isLength({ max: 500 }),
  body('area').optional().trim().isLength({ max: 120 }),
  body('latitude').optional({ nullable: true }).isFloat({ min: -90,  max: 90  }),
  body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  body('isDefault').optional().isBoolean(),
], validate, ctrl.addAddress);
router.put('/me/addresses/:addressId',    authenticate, [param('addressId').isUUID()], validate, ctrl.updateAddress);
router.delete('/me/addresses/:addressId', authenticate, [param('addressId').isUUID()], validate, ctrl.deleteAddress);

// Wishlist
router.get('/me/wishlist',     authenticate, authorize('customer'), ctrl.getWishlist);
router.post('/me/wishlist/:productId', authenticate, authorize('customer'),
  [param('productId').isUUID()], validate, ctrl.addToWishlist);
router.delete('/me/wishlist/:productId', authenticate, authorize('customer'),
  [param('productId').isUUID()], validate, ctrl.removeWishlist);

// Order history
router.get('/me/orders',       authenticate, [
  query('status').optional().isIn(['pending','accepted','preparing','awaiting_rider',
    'rider_assigned','picked_up','on_the_way','delivered','cancelled','failed','refunded']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], validate, ctrl.orderHistory);

// Wallet
router.get('/me/wallet',       authenticate, ctrl.getWallet);
router.get('/me/wallet/transactions', authenticate, ctrl.getWalletTxns);

// Loyalty
router.get('/me/loyalty',      authenticate, ctrl.getLoyalty);

// Notifications
router.get('/me/notifications', authenticate, [
  query('unreadOnly').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
], validate, ctrl.getNotifications);
router.post('/me/notifications/read', authenticate, [
  body('ids').optional().isArray(),
  body('ids.*').optional().isUUID(),
], validate, ctrl.markRead);

// Admin
router.get('/',  authenticate, authorize(...ADMIN), ctrl.list);
router.get('/:id', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.getById);

module.exports = router;
