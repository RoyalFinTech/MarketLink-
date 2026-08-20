// src/modules/delivery/routes.js
'use strict';
const router = require('express').Router();
const { body, param } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const ADMIN = ['admin','super_admin','moderator'];
router.get('/', authenticate, authorize(...ADMIN), ctrl.list);
router.get('/:id', authenticate, [param('id').isUUID()], validate, ctrl.getById);
router.get('/:id/tracking', authenticate, [param('id').isUUID()], validate, ctrl.getTracking);
router.post('/:id/assign', authenticate, authorize(...ADMIN),
  [param('id').isUUID(), body('riderId').isUUID().withMessage('riderId is required.')],
  validate, ctrl.assign);
router.patch('/:id/status', authenticate, authorize('rider',...ADMIN),
  [param('id').isUUID(),
   body('status').isIn(['picked_up','in_transit','delivered','failed','cancelled']).withMessage('Invalid status.'),
   body('proofUrl').optional({ nullable:true }).isURL()],
  validate, ctrl.updateStatus);
module.exports = router;
