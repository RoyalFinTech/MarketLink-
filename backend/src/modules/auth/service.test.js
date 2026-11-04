jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({sendSms:jest.fn()}));
const {query}=require('../../config/db'),notifications=require('../notifications/service');
const {registerInitiate,requestPinReset}=require('./service');
describe('OTP delivery mode',()=>{
 const oldEnv={...process.env};
 beforeEach(()=>{jest.clearAllMocks();process.env.OTP_EXPIRY_MINUTES='5';query.mockImplementation(async sql=>{if(sql.startsWith('SELECT id FROM users WHERE phone=$1'))return{rows:[]};if(sql.startsWith('INSERT INTO otp_verifications'))return{rows:[{id:'otp-id'}]};return{rows:[]};});});
 afterAll(()=>{process.env=oldEnv;});
 test('dev mode returns dashboard OTP and sends no SMS',async()=>{
  process.env.OTP_DEV_MODE='true';const r=await registerInitiate({fullName:'Test',phone:'871234567'});expect(r.devOtp).toMatch(/^\d{6}$/);expect(notifications.sendSms).not.toHaveBeenCalled();
 });
 test('when dev mode is off it sends and hides OTP',async()=>{
  process.env.OTP_DEV_MODE='false';notifications.sendSms.mockResolvedValue({sent:true,provider:'twilio'});const r=await registerInitiate({fullName:'Test',phone:'871234567'});expect(r).not.toHaveProperty('devOtp');expect(notifications.sendSms).toHaveBeenCalledWith(expect.objectContaining({to:'+220871234567',message:expect.stringMatching(/\d{6}/)}));
 });
 test('deletes OTP after provider rejection',async()=>{
  process.env.OTP_DEV_MODE='false';notifications.sendSms.mockResolvedValue({sent:false,provider:'twilio'});await expect(registerInitiate({fullName:'Test',phone:'871234567'})).rejects.toMatchObject({code:'OTP_DELIVERY_FAILED',status:503});expect(query).toHaveBeenCalledWith('DELETE FROM otp_verifications WHERE id=$1 AND verified_at IS NULL',['otp-id']);
 });
 test('PIN reset keeps development OTP response',async()=>{
  process.env.OTP_DEV_MODE='true';query.mockImplementation(async sql=>{if(sql.startsWith('SELECT id FROM users WHERE phone=$1 AND status'))return{rows:[{id:'user-id'}]};if(sql.startsWith('INSERT INTO otp_verifications'))return{rows:[{id:'otp-id'}]};return{rows:[]};});const r=await requestPinReset('871234567');expect(r.devOtp).toMatch(/^\d{6}$/);expect(notifications.sendSms).not.toHaveBeenCalled();
 });
});
