'use strict';
jest.mock('../config/db',()=>({query:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn()}));
jest.mock('../modules/auth/totp',()=>({decryptSecret:jest.fn(),verifyCode:jest.fn()}));
const {query}=require('../config/db');
const bcrypt=require('bcryptjs');
const totp=require('../modules/auth/totp');
const {requireAdminFactor}=require('./adminFactor');
function run(body){
 const req={body,user:{id:'admin-id'}},res={},next=jest.fn();
 return requireAdminFactor(req,res,next).then(()=>({req,next}));
}
describe('Admin financial factor guard',()=>{
 beforeEach(()=>{jest.clearAllMocks();bcrypt.compare.mockResolvedValue(true);totp.decryptSecret.mockReturnValue('secret');totp.verifyCode.mockReturnValue(true);});
 test('requires the existing PIN while TOTP is disabled',async()=>{
  query.mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:false}]});
  const result=await run({pin:'1234'});
  expect(result.next).toHaveBeenCalledWith();
  expect(result.req.adminFactor).toBe('pin');
 });
 test('requires TOTP and never falls back to PIN when enabled',async()=>{
  query.mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher'}]});
  const result=await run({pin:'1234'});
  expect(result.next).toHaveBeenCalledWith(expect.objectContaining({code:'ADMIN_TOTP_REQUIRED'}));
  expect(bcrypt.compare).not.toHaveBeenCalled();
 });
 test('accepts valid TOTP for enabled Admin account',async()=>{
  query.mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher'}]});
  const result=await run({totpCode:'123456'});
  expect(totp.verifyCode).toHaveBeenCalledWith('secret','123456');
  expect(result.req.adminFactor).toBe('totp');
  expect(result.next).toHaveBeenCalledWith();
 });
 test('rejects an invalid TOTP code without performing the protected action',async()=>{
  query.mockResolvedValue({rows:[{pin_hash:'hash',status:'active',admin_totp_enabled:true,admin_totp_secret_encrypted:'cipher'}]});
  totp.verifyCode.mockReturnValue(false);
  const result=await run({totpCode:'000000'});
  expect(result.next).toHaveBeenCalledWith(expect.objectContaining({code:'INVALID_ADMIN_TOTP'}));
 });
});
