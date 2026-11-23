'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
router.post('/delivery-quotes', authenticate, authorize('customer'), [
  body('vendorId').isUUID(),
  body('deliveryAddressId').isUUID(),
], validate, ctrl.deliveryQuotes);
router.post('/', authenticate, authorize('customer'), [body('vendorId').isUUID(), body('deliveryAddressId').isUUID().withMessage('Select a saved delivery address before placing your order.'), body('items').isArray({min:1}), body('items.*.productId').isUUID(), body('items.*.quantity').isInt({min:1}), body('deliveryFeeQuoteId').isUUID().withMessage('Select a current rider delivery price before placing your order.'), body('paymentMethod').notEmpty()], validate, ctrl.place);
router.get('/my', authenticate, [
  query('page').optional().isInt({min:1}),
  query('limit').optional().isInt({min:1,max:100}),
  query('status').optional().isIn(['pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way','delivered','cancelled']),
], validate, ctrl.myOrders);
router.get('/vendor', authenticate, authorize('vendor'), [
  query('page').optional().isInt({min:1}),
  query('limit').optional().isInt({min:1,max:100}),
  query('status').optional().isIn(['pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way','delivered','cancelled']),
], validate, ctrl.vendorOrders);
router.get('/:id', authenticate, [param('id').isUUID()], validate, ctrl.getById);
router.patch('/:id/status', authenticate, authorize('vendor','rider','admin','super_admin'), [param('id').isUUID(), body('status').notEmpty()], validate, ctrl.updateStatus);
router.post('/:id/accept', authenticate, authorize('vendor'), [param('id').isUUID()], validate, ctrl.vendorAccept);
router.post('/:id/reject', authenticate, authorize('vendor'), [param('id').isUUID(), body('reason').trim().notEmpty().isLength({max:500})], validate, ctrl.vendorReject);
router.post('/:id/cancel', authenticate, [param('id').isUUID()], validate, ctrl.cancel);
module.exports = router;
