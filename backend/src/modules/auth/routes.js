'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./controller');
const lim = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders:true, legacyHeaders:false, message: { success: false, error: 'Too many attempts.' } });
const refreshLim = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders:true, legacyHeaders:false,
  message: { success: false, error: 'Too many session refresh attempts.' } });
router.post('/register/initiate', lim, [body('fullName').trim().notEmpty(), body('phone').trim().isLength({min:7,max:20})], validate, ctrl.registerInitiate);
router.post('/register/complete', lim, [body('fullName').trim().notEmpty(), body('phone').trim().notEmpty(), body('otp').isLength({min:6,max:6}).isNumeric(), body('pin').isLength({min:4,max:4}).isNumeric()], validate, ctrl.registerComplete);
router.post('/login', lim, [body('phone').trim().notEmpty(), body('pin').isLength({min:4,max:4}).isNumeric()], validate, ctrl.login);\nrouter.post('/admin/totp/login', totpLoginLim, [body('challengeToken').notEmpty(),body('code').matches(/^\\d{6}$/)], validate, ctrl.verifyAdminTotpLogin);\nrouter.get('/admin/totp/status', authenticate, authorize(...ADMIN), ctrl.adminTotpStatus);\nrouter.post('/admin/totp/setup', authenticate, authorize(...ADMIN), totpSetupLim, ctrl.adminTotpSetup);\nrouter.post('/admin/totp/enable', authenticate, authorize(...ADMIN), totpLoginLim, [body('code').matches(/^\\d{6}$/)], validate, ctrl.adminTotpEnable);\nrouter.post('/admin/totp/disable', authenticate, authorize(...ADMIN), totpLoginLim, [body('pin').matches(/^\\d{4}$/),body('code').matches(/^\\d{6}$/)], validate, ctrl.adminTotpDisable);
router.post('/refresh', refreshLim, [body('refreshToken').notEmpty()], validate, ctrl.refreshToken);
router.post('/logout', authenticate, ctrl.logout);
router.post('/pin-reset/request', lim, [body('phone').trim().notEmpty()], validate, ctrl.requestPinReset);
router.post('/pin-reset/confirm', lim, [body('phone').notEmpty(), body('otp').isLength({min:6,max:6}).isNumeric(), body('newPin').isLength({min:4,max:4}).isNumeric()], validate, ctrl.confirmPinReset);
router.get('/me', authenticate, ctrl.me);
module.exports = router;
