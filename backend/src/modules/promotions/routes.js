'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const ADMIN = ['admin', 'super_admin', 'moderator'];

router.post('/', authenticate, authorize('vendor'), [
  body('title').trim().notEmpty().isLength({max:120}),
  body('description').optional({nullable:true}).trim().isLength({max:2000}),
  body('bannerUrl').optional({nullable:true}).isURL({ require_protocol:true }),
  body('placement').optional().isIn(['featured_banner','search_boost','vendor_spotlight','category_banner']),
  body('durationHours').isInt({min:1,max:720}),
  body('requestedBudgetGmd').optional().isFloat({min:0}),
], validate, ctrl.createRequest);

router.get('/mine', authenticate, authorize('vendor'), ctrl.myRequests);
router.get('/admin/requests', authenticate, authorize(...ADMIN), [
  query('status').optional().isIn(['pending','reviewing','approved','rejected','published','cancelled']),
  query('limit').optional().isInt({min:1,max:100}),
], validate, ctrl.adminList);
router.patch('/admin/requests/:id', authenticate, authorize(...ADMIN), [
  param('id').isUUID(),
  body('status').optional().isIn(['reviewing','approved','rejected','published','cancelled']),
  body('paymentStatus').optional().isIn(['unpaid','pending','paid','refunded']),
  body('adminNotes').optional({nullable:true}).trim().isLength({max:2000}),
  body('startsAt').optional({nullable:true}).isISO8601(),
  body('endsAt').optional({nullable:true}).isISO8601(),
], validate, ctrl.adminReview);

module.exports = router;
