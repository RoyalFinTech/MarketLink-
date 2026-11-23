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
router.post('/users/:id/roles', authenticate, authorize(...SA),
  [param('id').isUUID(), body('role').equals('admin')], validate, ctrl.grantAdminRole);
router.post('/users/:id/suspend', authenticate, authorize(...ADMIN),
  [param('id').isUUID(), body('reason').trim().notEmpty()], validate, ctrl.suspend);
router.post('/users/:id/reinstate', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.reinstate);
router.get('/analytics',   authenticate, authorize(...ADMIN),
  [query('period').optional().isIn(['7d','30d','90d'])], validate, ctrl.analytics);
router.get('/commission-settings', authenticate, authorize(...ADMIN), ctrl.commissionSettings);
router.put('/commission-settings', authenticate, authorize(...ADMIN), [
  body('marketplaceCommissionPct').isFloat({min:0,max:20}),
  body('affiliateCommissionPct').isFloat({min:0,max:20}),
  body('withdrawalServiceFeePct').optional().isFloat({min:0,max:10}),
], validate, ctrl.updateCommissionSettings);
router.get('/settings',    authenticate, authorize(...SA), ctrl.settings);
router.put('/settings/:key', authenticate, authorize(...SA),
  [param('key').trim().notEmpty(), body('value').exists()], validate, ctrl.setSetting);
router.get('/audit-logs',  authenticate, authorize(...ADMIN),
  [query('page').optional().isInt({min:1}), query('limit').optional().isInt({min:1,max:100})],
  validate, ctrl.auditLogs);
router.get('/affiliates', authenticate, authorize(...ADMIN),
  [query('page').optional().isInt({min:1}), query('limit').optional().isInt({min:1,max:100}), query('search').optional().isString().isLength({max:120})],
  validate, ctrl.affiliates);
router.get('/reports',     authenticate, authorize(...ADMIN),
  [query('type').isIn(['revenue','vendors','riders']).withMessage('type must be revenue, vendors, or riders')],
  validate, ctrl.reports);

router.get('/financial-reconciliation', authenticate, authorize(...ADMIN),
  [query('limit').optional().isInt({min:1,max:100})], validate, ctrl.financialReconciliation);
router.get('/transactions', authenticate, authorize(...ADMIN),
  [
    query('page').optional().isInt({min:1}),
    query('limit').optional().isInt({min:1,max:100}),
    query('type').optional().isIn(['credit','debit']),
    query('category').optional().isString().isLength({max:40}),
  ], validate, ctrl.transactions);
router.get('/failed-payments', authenticate, authorize(...ADMIN),
  [
    query('page').optional().isInt({min:1}),
    query('limit').optional().isInt({min:1,max:100}),
    query('method').optional().isString().isLength({max:40}),
  ], validate, ctrl.failedPayments);

router.post('/financial-reconciliation/orders/:id/retry-settlement',
  authenticate, authorize(...ADMIN),
  [
    param('id').isUUID(),
    body('confirmation').equals('RETRY_SETTLEMENT'),
    body('reason').trim().notEmpty().isLength({max:500}),
  ],
  validate, ctrl.retryFinancialSettlement);

router.get('/withdrawal-fees', authenticate, authorize(...ADMIN),
  [query('page').optional().isInt({min:1}), query('limit').optional().isInt({min:1,max:100})], validate, ctrl.withdrawalFeeReport);
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


// ── Admin support desk and CRM ─────────────────────────────────────
router.get('/support-tickets', authenticate, authorize(...ADMIN), [
  query('page').optional().isInt({min:1}),
  query('limit').optional().isInt({min:1,max:100}),
  query('status').optional().isIn(['open','pending','escalated','resolved','closed']),
  query('priority').optional().isIn(['low','medium','high']),
  query('category').optional().isIn(['complaint','feedback','vendor_report','rider_report','appeal']),
  query('search').optional().isString().isLength({max:200}),
], validate, ctrl.supportTickets);
router.get('/support-tickets/:id', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.supportTicket);
router.patch('/support-tickets/:id', authenticate, authorize(...ADMIN), [
  param('id').isUUID(),
  body('status').optional().isIn(['open','pending','escalated','resolved','closed']),
  body('priority').optional().isIn(['low','medium','high']),
  body('assignedTo').optional({nullable:true}).isUUID(),
], validate, ctrl.updateSupportTicket);
router.post('/support-tickets/:id/replies', authenticate, authorize(...ADMIN), [
  param('id').isUUID(), body('body').trim().notEmpty().isLength({max:4000}),
], validate, ctrl.replySupportTicket);

router.post('/conversations', authenticate, authorize(...ADMIN), [
  body('participantUserId').isUUID(),
], validate, ctrl.startConversation);
router.get('/conversations', authenticate, authorize(...ADMIN), [
  query('page').optional().isInt({min:1}),
  query('limit').optional().isInt({min:1,max:100}),
  query('search').optional().isString().isLength({max:120}),
], validate, ctrl.conversations);
router.get('/conversations/:id/messages', authenticate, authorize(...ADMIN), [
  param('id').isUUID(),
  query('limit').optional().isInt({min:1,max:100}),
], validate, ctrl.conversationMessages);
router.post('/conversations/:id/messages', authenticate, authorize(...ADMIN), [
  param('id').isUUID(),
  body('body').trim().notEmpty().isLength({max:4000}),
], validate, ctrl.sendConversationMessage);

router.get('/users/:id/profile', authenticate, authorize(...ADMIN),
  [param('id').isUUID()], validate, ctrl.crmProfile);
router.post('/users/:id/notes', authenticate, authorize(...ADMIN), [
  param('id').isUUID(), body('note').trim().notEmpty().isLength({max:4000}),
], validate, ctrl.addCrmNote);

module.exports = router;
