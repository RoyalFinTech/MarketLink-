// src/modules/admin/routes.js
'use strict';
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const knowledgeCtrl = require('../assistant/adminController');
const knowledgeRepo = require('../assistant/knowledgeRepo');
const ADMIN = ['admin','super_admin'];
const SA    = ['super_admin'];

router.get('/dashboard',   authenticate, authorize(...ADMIN), ctrl.dashboard);
router.get('/users',       authenticate, authorize(...ADMIN), ctrl.users);
router.post('/users/:id/suspend', authenticate, authorize(...ADMIN),
  [param('id').isUUID(), body('reason').trim().notEmpty()], validate, ctrl.suspend);
router.post('/users/:id/reinstate', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.reinstate);
router.get('/analytics',   authenticate, authorize(...ADMIN),
  [query('period').optional().isIn(['7d','30d','90d'])], validate, ctrl.analytics);
router.get('/settings',    authenticate, authorize(...SA), ctrl.settings);
router.put('/settings/:key', authenticate, authorize(...SA),
  [param('key').trim().notEmpty(), body('value').exists()], validate, ctrl.setSetting);
router.get('/audit-logs',  authenticate, authorize(...ADMIN),
  [query('page').optional().isInt({min:1}), query('limit').optional().isInt({min:1,max:100})],
  validate, ctrl.auditLogs);
router.get('/reports',     authenticate, authorize(...ADMIN),
  [query('type').isIn(['revenue','vendors','riders']).withMessage('type must be revenue, vendors, or riders')],
  validate, ctrl.reports);

router.get('/withdrawals',  authenticate, authorize(...ADMIN),
  [query('page').optional().isInt({min:1}), query('limit').optional().isInt({min:1,max:100})],
  validate, ctrl.pendingWithdrawals);
router.post('/withdrawals/:id/approve', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.approveWithdrawal);
router.post('/withdrawals/:id/reject',  authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.rejectWithdrawal);

// ── AI Knowledge Training Center ────────────────────────────────────
// Only admin/super_admin — never customers, vendors, or riders — can
// view, create, edit, activate/deactivate, or delete assistant knowledge.
router.get('/knowledge', authenticate, authorize(...ADMIN),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().isIn(knowledgeRepo.VALID_CATEGORIES),
    query('role').optional().isIn(knowledgeRepo.VALID_ROLES),
    query('status').optional().isIn(['active', 'inactive']),
    query('search').optional().isString().isLength({ max: 200 }),
  ], validate, knowledgeCtrl.list);

router.get('/knowledge/:id', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, knowledgeCtrl.getOne);

router.post('/knowledge', authenticate, authorize(...ADMIN),
  [
    body('title').trim().notEmpty().isLength({ max: 200 }),
    body('question').trim().notEmpty().isLength({ max: 500 }),
    body('answer').trim().notEmpty().isLength({ max: 4000 }),
    body('category').optional().isIn(knowledgeRepo.VALID_CATEGORIES),
    body('roles').optional().isArray(),
    body('priority').optional().isInt({ min: -100, max: 100 }),
    body('status').optional().isIn(['active', 'inactive']),
  ], validate, knowledgeCtrl.create);

router.put('/knowledge/:id', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, knowledgeCtrl.update);

router.patch('/knowledge/:id/status', authenticate, authorize(...ADMIN),
  [param('id').isUUID(), body('status').isIn(['active', 'inactive'])], validate, knowledgeCtrl.setStatus);

router.delete('/knowledge/:id', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, knowledgeCtrl.remove);

router.get('/knowledge/:id/history', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, knowledgeCtrl.history);

// "Teach MarketLink Assistant" — free-text statement → draft knowledge entry.
router.post('/knowledge/teach', authenticate, authorize(...ADMIN),
  [body('statement').trim().notEmpty().isLength({ max: 2000 }), body('save').optional().isBoolean()],
  validate, knowledgeCtrl.teach);

module.exports = router;
