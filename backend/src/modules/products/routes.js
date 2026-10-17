'use strict';
const router = require('express').Router();
const { body, param } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', authenticate, authorize('vendor','admin','super_admin'), [
  body('name').trim().notEmpty().isLength({max:200}),
  body('categoryId').isInt({min:1}),
  body('price').isFloat({min:0}),
  body('description').optional().isString().isLength({max:2000}),
  body('imageUrl').optional({nullable:true}).isURL({require_protocol:true}).isLength({max:500}),
  body('compareAtPrice').optional().isFloat({min:0}),
  body('sku').optional().isString().isLength({max:80}),
], validate, ctrl.create);
router.put('/:id', authenticate, authorize('vendor','admin','super_admin'), [param('id').isUUID()], validate, ctrl.update);
router.delete('/:id', authenticate, authorize('vendor','admin','super_admin'), [param('id').isUUID()], validate, ctrl.remove);
router.patch('/:id/inventory', authenticate, authorize('vendor','admin','super_admin'), [param('id').isUUID(), body('quantity').isInt({min:0})], validate, ctrl.updateInventory);
router.patch('/:id/status', authenticate, authorize('admin','super_admin'), [param('id').isUUID(), body('status').isIn(['active','rejected','archived'])], validate, ctrl.updateStatus);
module.exports = router;
