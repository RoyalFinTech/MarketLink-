'use strict';
const rateLimit=require('express-rate-limit');
const bcrypt=require('bcryptjs');
const {withTransaction}=require('../config/db');
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
    const factor=await withTransaction(async client=>{
      const {rows:[admin]}=await client.query(
        'SELECT pin_hash,status,COALESCE(admin_totp_enabled,FALSE) AS admin_totp_enabled,admin_totp_secret_encrypted,admin_totp_last_used_step FROM users WHERE id=$1 FOR UPDATE',
        [req.user.id]
      );
      if(!admin||admin.status!=='active')throw new AppError('Your administrator account is not active.',403,'ADMIN_ACCOUNT_NOT_ACTIVE');
      if(admin.admin_totp_enabled){
        if(!/^\d{6}$/.test(code))throw new AppError('Enter the current 6-digit authenticator code to approve this financial action.',400,'ADMIN_TOTP_REQUIRED');
        let secret;
        try{secret=totp.decryptSecret(admin.admin_totp_secret_encrypted);}catch{throw new AppError('Authenticator configuration needs administrator recovery.',503,'ADMIN_TOTP_CONFIGURATION_ERROR');}
        const usedStep=totp.matchingStep(secret,code);
        if(usedStep===null)throw new AppError('Incorrect authenticator code. No financial action was performed.',401,'INVALID_ADMIN_TOTP');
        if(admin.admin_totp_last_used_step!==null&&admin.admin_totp_last_used_step!==undefined&&usedStep<=Number(admin.admin_totp_last_used_step))throw new AppError('This authenticator code has already been used. Wait for the next code.',401,'ADMIN_TOTP_REPLAYED');
        await client.query('UPDATE users SET admin_totp_last_used_step=$1 WHERE id=$2',[usedStep,req.user.id]);
        return 'totp';
      }
      if(!/^\d{4}$/.test(pin))throw new AppError('Enter your 4-digit Admin PIN to approve this financial action.',400,'ADMIN_PIN_REQUIRED');
      if(!admin.pin_hash||!await bcrypt.compare(pin,admin.pin_hash))throw new AppError('Incorrect Admin PIN. No financial action was performed.',401,'INVALID_ADMIN_PIN');
      return 'pin';
    });
    req.adminFactor=factor;
    return next();
  }catch(error){return next(error);}
}
module.exports={adminFactorLimiter,requireAdminFactor};
