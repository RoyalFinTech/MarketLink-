'use strict';
const rateLimit=require('express-rate-limit');
const bcrypt=require('bcryptjs');
const {query}=require('../config/db');
const {AppError}=require('./errorHandler');
const totp=require('../modules/auth/totp');

const adminFactorLimiter=rateLimit({
  windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,skipSuccessfulRequests:true,
  message:{success:false,error:'Too many unsuccessful financial approval verification attempts. Try again in 15 minutes.',code:'ADMIN_FACTOR_RATE_LIMITED'}
});

async function requireAdminFactor(req,res,next){
  try{
    const pin=String(req.body&&req.body.pin||'');
    const code=String(req.body&&req.body.totpCode||'');
    const {rows:[admin]}=await query(
      'SELECT pin_hash,status,COALESCE(admin_totp_enabled,FALSE) AS admin_totp_enabled,admin_totp_secret_encrypted FROM users WHERE id=$1',
      [req.user.id]
    );
    if(!admin||admin.status!=='active')throw new AppError('Your administrator account is not active.',403,'ADMIN_ACCOUNT_NOT_ACTIVE');
    if(admin.admin_totp_enabled){
      if(!/^\d{6}$/.test(code))throw new AppError('Enter the current 6-digit authenticator code to approve this financial action.',400,'ADMIN_TOTP_REQUIRED');
      let secret;
      try{secret=totp.decryptSecret(admin.admin_totp_secret_encrypted);}catch{throw new AppError('Authenticator configuration needs administrator recovery.',503,'ADMIN_TOTP_CONFIGURATION_ERROR');}
      if(!totp.verifyCode(secret,code))throw new AppError('Incorrect authenticator code. No financial action was performed.',401,'INVALID_ADMIN_TOTP');
      req.adminFactor='totp';
    }else{
      if(!/^\d{4}$/.test(pin))throw new AppError('Enter your 4-digit Admin PIN to approve this financial action.',400,'ADMIN_PIN_REQUIRED');
      if(!admin.pin_hash||!await bcrypt.compare(pin,admin.pin_hash))throw new AppError('Incorrect Admin PIN. No financial action was performed.',401,'INVALID_ADMIN_PIN');
      req.adminFactor='pin';
    }
    return next();
  }catch(error){return next(error);}
}
module.exports={adminFactorLimiter,requireAdminFactor};
