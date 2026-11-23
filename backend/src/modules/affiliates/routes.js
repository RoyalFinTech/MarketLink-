'use strict';
const router=require('express').Router();
const { param, body }=require('express-validator');
const { validate }=require('../../middleware/validate');
const { authenticate }=require('../../middleware/auth');
const ctrl=require('./controller');
const marketerCtrl=require('./marketerController');

// Public referral resolution/click tracking. No private affiliate data is exposed.
router.get('/resolve/:code',param('code').isLength({min:3,max:20}).trim().escape(),validate,ctrl.resolve);
router.post('/click',body('code').isLength({min:3,max:20}).trim().escape(),validate,ctrl.click);
router.get('/me',authenticate,ctrl.me);
router.get('/marketer/status',authenticate,marketerCtrl.status);
router.post('/marketer/apply',authenticate,[
 body('legalName').isString().trim().isLength({min:2,max:150}),
 body('residentialAddress').isString().trim().isLength({min:5,max:500}),
 body('marketingChannels').isArray({min:1,max:8}),
 body('marketingPlan').isString().trim().isLength({min:30,max:3000}),
 body('identityDocumentUrl').isString().trim().notEmpty().isLength({max:1000}),
 body('selfieUrl').isString().trim().notEmpty().isLength({max:1000}),
 body('addressProofUrl').optional({nullable:true}).isString().trim().isLength({max:1000}),
 body('socialLinks').optional().isObject(),
],validate,marketerCtrl.apply);
router.get('/marketer/dashboard',authenticate,marketerCtrl.dashboard);
module.exports=router;
