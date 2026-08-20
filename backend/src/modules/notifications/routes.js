// src/modules/notifications/routes.js
'use strict';
const router = require('express').Router();
const { body, query } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./controller');
router.get('/', authenticate, [query('unreadOnly').optional().isBoolean(), query('page').optional().isInt({min:1})], validate, ctrl.list);
router.post('/read', authenticate, [body('ids').optional().isArray(), body('ids.*').optional().isUUID()], validate, ctrl.markRead);
router.get('/unread-count', authenticate, ctrl.unreadCount);
module.exports = router;
