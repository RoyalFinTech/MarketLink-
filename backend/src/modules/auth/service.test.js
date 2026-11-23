jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({sendSms:jest.fn()}));
const {query,withTransaction}=require('../../config/db'),notifications=require('../notifications/service');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {registerInitiate,requestPinReset,refreshAccessToken}=require('./service');
describe('OTP delivery mode',()=>{
 const oldEnv={...process.env};
 beforeEach(()=>{jest.clearAllMocks();process.env.OTP_EXPIRY_MINUTES='5';process.env.NODE_ENV='test';process.env.RENDER='false';query.mockImplementation(async sql=>{if(sql.startsWith('SELECT id FROM users WHERE phone=$1'))return{rows:[]};if(sql.startsWith('INSERT INTO otp_verifications'))return{rows:[{id:'otp-id'}]};return{rows:[]};});});
 afterAll(()=>{process.env=oldEnv;});
 test('dev mode returns dashboard OTP and sends no SMS',async()=>{
  process.env.OTP_DEV_MODE='true';const r=await registerInitiate({fullName:'Test',phone:'871234567'});expect(r.devOtp).toMatch(/^\d{6}$/);expect(notifications.sendSms).not.toHaveBeenCalled();
 });
 test('production never returns a development OTP even when the flag is left enabled',async()=>{
  process.env.OTP_DEV_MODE='true';process.env.NODE_ENV='production';process.env.RENDER='true';
  notifications.sendSms.mockResolvedValue({sent:true,provider:'twilio'});
  const result=await registerInitiate({fullName:'Test',phone:'871234567'});
  expect(result).not.toHaveProperty('devOtp');
  expect(result.message).toBe('OTP sent by SMS.');
  expect(notifications.sendSms).toHaveBeenCalledTimes(1);
 });
 test('when dev mode is off it sends and hides OTP',async()=>{
  process.env.OTP_DEV_MODE='false';notifications.sendSms.mockResolvedValue({sent:true,provider:'twilio'});const r=await registerInitiate({fullName:'Test',phone:'871234567'});expect(r).not.toHaveProperty('devOtp');expect(notifications.sendSms).toHaveBeenCalledWith(expect.objectContaining({to:'+220871234567',message:expect.stringMatching(/\d{6}/)}));
 });
 test('deletes OTP after provider rejection',async()=>{
  process.env.OTP_DEV_MODE='false';notifications.sendSms.mockResolvedValue({sent:false,provider:'twilio'});await expect(registerInitiate({fullName:'Test',phone:'871234567'})).rejects.toMatchObject({code:'OTP_DELIVERY_FAILED',statusCode:503});expect(query).toHaveBeenCalledWith('DELETE FROM otp_verifications WHERE id=$1 AND verified_at IS NULL',['otp-id']);
 });
 test('PIN reset keeps development OTP response',async()=>{
  process.env.OTP_DEV_MODE='true';query.mockImplementation(async sql=>{if(sql.startsWith('SELECT id FROM users WHERE phone=$1 AND status'))return{rows:[{id:'user-id'}]};if(sql.startsWith('INSERT INTO otp_verifications'))return{rows:[{id:'otp-id'}]};return{rows:[]};});const r=await requestPinReset('871234567');expect(r.devOtp).toMatch(/^\d{6}$/);expect(notifications.sendSms).not.toHaveBeenCalled();
 });

 test('rejects legacy seven-digit Gambian numbers for new registrations',async()=>{
  process.env.OTP_DEV_MODE='true';
  await expect(registerInitiate({fullName:'Test',phone:'9123456'})).rejects.toMatchObject({code:'INVALID_PHONE',statusCode:400});
  expect(query).not.toHaveBeenCalled();
 });
 test('accepts a complete nine-digit Gambian number for new registrations',async()=>{
  process.env.OTP_DEV_MODE='true';
  const result=await registerInitiate({fullName:'Test',phone:'871234567'});
  expect(result.phone).toBe('+220871234567');
 });

});

describe('atomic refresh-token rotation',()=>{
 const oldEnv={...process.env};
 const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  process.env.JWT_REFRESH_SECRET='marketlink-test-refresh-secret';
  process.env.JWT_ACCESS_SECRET='marketlink-test-access-secret';
  process.env.JWT_ACCESS_EXPIRES_IN='15m';
  clientQuery=jest.fn();
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
 });
 afterAll(()=>{process.env=oldEnv;});
 test('locks, revokes once, and inserts the replacement token atomically',async()=>{
  const oldToken=jwt.sign({sub:userId},process.env.JWT_REFRESH_SECRET,{expiresIn:'1h'});
  const oldHash=await bcrypt.hash(oldToken,8);
  clientQuery
   .mockResolvedValueOnce({rows:[{id:'old-token',token_hash:oldHash}]})
   .mockResolvedValueOnce({rows:[{id:'old-token'}]})
   .mockResolvedValueOnce({rows:[{name:'customer'}]})
   .mockResolvedValueOnce({rows:[]});
  const result=await refreshAccessToken(oldToken);
  expect(result.refreshToken).toBeTruthy();
  expect(result.refreshToken).not.toBe(oldToken);
  expect(jwt.verify(result.accessToken,process.env.JWT_ACCESS_SECRET).roles).toEqual(['customer']);
  expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(clientQuery.mock.calls[1][0]).toContain('revoked_at IS NULL RETURNING id');
  expect(clientQuery.mock.calls[3][0]).toContain('INSERT INTO refresh_tokens');
  expect(clientQuery).toHaveBeenCalledTimes(4);
  expect(withTransaction).toHaveBeenCalledTimes(1);
 });
 test('rejects a reused or revoked token without creating another session',async()=>{
  const oldToken=jwt.sign({sub:userId},process.env.JWT_REFRESH_SECRET,{expiresIn:'1h'});
  clientQuery.mockResolvedValueOnce({rows:[]});
  await expect(refreshAccessToken(oldToken)).rejects.toMatchObject({statusCode:401,code:'INVALID_REFRESH_TOKEN'});
  expect(clientQuery).toHaveBeenCalledTimes(1);
 });
});
