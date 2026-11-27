'use strict';
jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn(),hash:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({sendSms:jest.fn()}));
jest.mock('./totp',()=>({generateSecret:jest.fn(),encryptSecret:jest.fn(),decryptSecret:jest.fn(),verifyCode:jest.fn(),provisioningUri:jest.fn()}));
const {query,withTransaction}=require('../../config/db');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const totp=require('./totp');
const {login,verifyAdminTotpLogin}=require('./service');
const admin={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',full_name:'MarketLink Admin',phone:'+220871234567',pin_hash:'hash',status:'active',admin_totp_enabled:true,roles:['admin'],affiliate_code:null};
describe('conditional Admin authenticator login',()=>{
 beforeEach(()=>{
  jest.clearAllMocks();
  process.env.JWT_ACCESS_SECRET='marketlink-test-access-secret-with-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET='marketlink-test-refresh-secret-with-at-least-32-characters';
  bcrypt.compare.mockResolvedValue(true);bcrypt.hash.mockResolvedValue('refresh-hash');
  totp.decryptSecret.mockReturnValue('BASE32SECRET');totp.verifyCode.mockReturnValue(true);
  query.mockResolvedValue({rows:[]});
 });
 test('returns a short-lived challenge and no session tokens when Admin two-factor is enabled',async()=>{
  query.mockImplementation(async sql=>sql.startsWith('SELECT u.id,u.full_name')?{rows:[admin]}:{rows:[]});
  const result=await login({phone:'871234567',pin:'1234'});
  expect(result.requiresTwoFactor).toBe(true);
  expect(result.challengeToken).toBeTruthy();
  expect(result).not.toHaveProperty('accessToken');
  expect(result).not.toHaveProperty('refreshToken');
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO admin_totp_login_challenges'),expect.any(Array));
 });
 test('issues the normal session without asking for TOTP when the account is not enabled',async()=>{
  query.mockImplementation(async sql=>{
   if(sql.startsWith('SELECT u.id,u.full_name'))return{rows:[{...admin,admin_totp_enabled:false,roles:['customer']}]};
   return{rows:[]};
  });
  const result=await login({phone:'871234567',pin:'1234'});
  expect(result.accessToken).toBeTruthy();expect(result.refreshToken).toBeTruthy();
  expect(result).not.toHaveProperty('requiresTwoFactor');
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO refresh_tokens'),expect.any(Array));
 });
 test('consumes a valid one-time challenge before issuing the Admin session',async()=>{
  const challengeToken=jwt.sign({sub:admin.id,purpose:'admin_totp_login',jti:'one-time-jti'},process.env.JWT_ACCESS_SECRET,{expiresIn:'5m'});
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'challenge-id',user_id:admin.id,token_jti:'one-time-jti',expires_at:new Date(Date.now()+60000),consumed_at:null}]})
   .mockResolvedValueOnce({rows:[{...admin,admin_totp_secret_encrypted:'cipher'}]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
  const result=await verifyAdminTotpLogin(challengeToken,'123456');
  expect(totp.verifyCode).toHaveBeenCalledWith('BASE32SECRET','123456');
  expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE admin_totp_login_challenges'),['challenge-id']);
  expect(result.accessToken).toBeTruthy();expect(result.refreshToken).toBeTruthy();
 });
 test('does not issue a session for an invalid authenticator code',async()=>{
  const challengeToken=jwt.sign({sub:admin.id,purpose:'admin_totp_login',jti:'bad-code-jti'},process.env.JWT_ACCESS_SECRET,{expiresIn:'5m'});
  withTransaction.mockImplementation(fn=>fn({query:jest.fn()
   .mockResolvedValueOnce({rows:[{id:'challenge-id',expires_at:new Date(Date.now()+60000),consumed_at:null}]})
   .mockResolvedValueOnce({rows:[{...admin,admin_totp_secret_encrypted:'cipher'}]})}));
  totp.verifyCode.mockReturnValue(false);
  await expect(verifyAdminTotpLogin(challengeToken,'000000')).rejects.toMatchObject({code:'INVALID_ADMIN_TOTP',statusCode:401});
  expect(query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO refresh_tokens'),expect.any(Array));
 });
});
