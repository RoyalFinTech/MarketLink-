jest.mock('../../config/db',()=>({query:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
const {query}=require('../../config/db');
const {sendSms,createCampaign}=require('./service');
describe('SMS provider adapter',()=>{
 const oldEnv={...process.env},oldFetch=global.fetch;
 beforeEach(()=>{jest.clearAllMocks();global.fetch=jest.fn();['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY','TWILIO_API_SECRET','TWILIO_FROM_NUMBER','TWILIO_MESSAGING_SERVICE_SID','AFRICASTALKING_API_KEY','AFRICASTALKING_USERNAME'].forEach(k=>delete process.env[k]);});
 afterAll(()=>{process.env=oldEnv;global.fetch=oldFetch;});
 test('Twilio Account SID/Auth Token + Messaging Service',async()=>{
  process.env.SMS_PROVIDER='twilio';process.env.TWILIO_ACCOUNT_SID='AC00000000000000000000000000000000';process.env.TWILIO_AUTH_TOKEN='test';process.env.TWILIO_MESSAGING_SERVICE_SID='MG00000000000000000000000000000000';
  global.fetch.mockResolvedValue({ok:true,status:201,text:async()=>JSON.stringify({sid:'SM-test',status:'queued'})});
  const result=await sendSms({to:'+220871234567',message:'OTP 123456'});expect(result).toMatchObject({sent:true,provider:'twilio',status:'queued'});
  const [url,opts]=global.fetch.mock.calls[0];expect(url).toContain('/Messages.json');expect(opts.headers.Authorization).toBe('Basic '+Buffer.from('AC00000000000000000000000000000000:test').toString('base64'));
  const form=new URLSearchParams(opts.body);expect(form.get('To')).toBe('+220871234567');expect(form.get('MessagingServiceSid')).toBe('MG00000000000000000000000000000000');
 });
 test('Twilio API Key/Secret + From number',async()=>{
  process.env.SMS_PROVIDER='twilio';process.env.TWILIO_ACCOUNT_SID='AC00000000000000000000000000000000';process.env.TWILIO_API_KEY='SK-test';process.env.TWILIO_API_SECRET='secret';process.env.TWILIO_FROM_NUMBER='+15017122661';
  global.fetch.mockResolvedValue({ok:true,status:201,text:async()=>JSON.stringify({sid:'SM-test'})});
  await sendSms({to:'+220871234567',message:'Test'});const [,opts]=global.fetch.mock.calls[0];
  expect(opts.headers.Authorization).toBe('Basic '+Buffer.from('SK-test:secret').toString('base64'));
  expect(new URLSearchParams(opts.body).get('From')).toBe('+15017122661');
 });
 test('fails closed when sender is missing',async()=>{
  process.env.SMS_PROVIDER='twilio';process.env.TWILIO_ACCOUNT_SID='AC-test';process.env.TWILIO_AUTH_TOKEN='token';
  expect(await sendSms({to:'+220871234567',message:'Test'})).toMatchObject({sent:false,reason:'TWILIO_FROM_NUMBER_OR_MESSAGING_SERVICE_REQUIRED'});
  expect(global.fetch).not.toHaveBeenCalled();
 });
 test('keeps Africa\'s Talking compatibility',async()=>{
  process.env.SMS_PROVIDER='africastalking';process.env.AFRICASTALKING_API_KEY='key';process.env.AFRICASTALKING_USERNAME='sandbox';
  global.fetch.mockResolvedValue({ok:true,status:201,text:async()=>JSON.stringify({SMSMessageData:{Recipients:[{statusCode:'101'}]}})});
  expect(await sendSms({to:'+220871234567',message:'Test'})).toMatchObject({sent:true,provider:'africastalking'});
 });
 test('rejects unsupported providers',async()=>{
  process.env.SMS_PROVIDER='bad';expect(await sendSms({to:'+220871234567',message:'Test'})).toMatchObject({sent:false,reason:'UNSUPPORTED_SMS_PROVIDER'});expect(global.fetch).not.toHaveBeenCalled();
 });
});


describe('Admin campaign individual recipient safeguards',()=>{
 const recipientId='22222222-2222-4222-8222-222222222222';
 beforeEach(()=>jest.clearAllMocks());
 test('allows only active customer, vendor or rider accounts for individual campaigns',async()=>{
  query
   .mockResolvedValueOnce({rows:[{id:recipientId}]})
   .mockResolvedValueOnce({rows:[{id:'campaign-1',audience:'selected'}]})
   .mockResolvedValueOnce({rows:[]});
  await createCampaign({title:'Service update',body:'A message',audience:'selected',channels:{},createdBy:'admin-1',recipientIds:[recipientId]});
  expect(query.mock.calls[0][0]).toMatch(/r\.name IN \('customer','vendor','rider'\)/);
  expect(query.mock.calls[1][0]).toMatch(/INSERT INTO notification_campaigns/);
 });
 test('rejects active staff or other non-marketplace accounts as selected recipients',async()=>{
  query.mockResolvedValueOnce({rows:[]});
  await expect(createCampaign({title:'Service update',body:'A message',audience:'selected',channels:{},createdBy:'admin-1',recipientIds:[recipientId]}))
   .rejects.toMatchObject({code:'INVALID_CAMPAIGN_RECIPIENTS',status:400});
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toMatch(/r\.name IN \('customer','vendor','rider'\)/);
 });
});
