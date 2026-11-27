'use strict';
jest.mock('../config/db',()=>({withTransaction:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn()}));
jest.mock('../modules/auth/totp',()=>({decryptSecret:jest.fn(),verifyCode:jest.fn(),matchingStep:jest.fn()}));
const {withTransaction}=require('../config/db');
const bcrypt=require('bcryptjs');
const totp=require('../modules/auth/totp');
const {requireAdminFactor}=require('./adminFactor');
function run(body){
 const req={body,user:{id:'admin-id'}},res={},next=jest.fn();
 return requireAdminFactor(req,res,next).then(()=>({req,next}));
}
describe('Admin financial factor guard',()=>{
 beforeEach(()=>{jest.clearAllMocks();bcrypt.compare.mockResolvedValue(true);totp.decryptSecret.mockReturnValue('secret');totp.verifyCode.mockReturnValue(true);totp.matchingStep.mockReturnValue(123);});
 test('requires the existing PIN while TOTP is disabled',async()=>{
  withTransaction.mockImplementation(fn=>fn({query:jest.fn().mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:false}]})}));
  const result=await run({pin:'1234'});
  expect(result.next).toHaveBeenCalledWith();
  expect(result.req.adminFactor).toBe('pin');
 });
 test('requires TOTP and never falls back to PIN when enabled',async()=>{
  withTransaction.mockImplementation(fn=>fn({query:jest.fn().mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher',admin_totp_last_used_step:null}]})}));
  const result=await run({pin:'1234'});
  expect(result.next).toHaveBeenCalledWith(expect.objectContaining({code:'ADMIN_TOTP_REQUIRED'}));
  expect(bcrypt.compare).not.toHaveBeenCalled();
 });
 test('accepts valid TOTP for enabled Admin account',async()=>{
  withTransaction.mockImplementation(fn=>fn({query:jest.fn().mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher',admin_totp_last_used_step:null}]})}));
  const result=await run({totpCode:'123456'});
  expect(totp.matchingStep).toHaveBeenCalledWith('secret','123456');
  expect(result.req.adminFactor).toBe('totp');
  expect(result.next).toHaveBeenCalledWith();
 });
 test('rejects an invalid TOTP code without performing the protected action',async()=>{
  withTransaction.mockImplementation(fn=>fn({query:jest.fn().mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher',admin_totp_last_used_step:null}]})}));
  totp.matchingStep.mockReturnValue(null);
  const result=await run({totpCode:'000000'});
  expect(result.next).toHaveBeenCalledWith(expect.objectContaining({code:'INVALID_ADMIN_TOTP'}));
 });
});
