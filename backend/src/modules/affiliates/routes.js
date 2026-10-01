'use strict';
const router=require('express').Router();
const { param, body }=require('express-validator');
const { validate }=require('../../middleware/validate');
const { authenticate }=require('../../middleware/auth');
const ctrl=require('./controller');

// Public referral resolution/click tracking. No private affiliate data is exposed.
router.get('/resolve/:code',param('code').isLength({min:3,max:20}).trim().escape(),validate,ctrl.resolve);
router.post('/click',body('code').isLength({min:3,max:20}).trim().escape(),validate,ctrl.click);
router.get('/me',authenticate,ctrl.me);
module.exports=router;
