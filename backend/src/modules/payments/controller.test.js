jest.mock('./service',()=>({
  processWebhook:jest.fn(),
  initiatePayment:jest.fn(),
  continuePayment:jest.fn(),
  getPaymentStatus:jest.fn(),
  confirmPayment:jest.fn(),
  listPendingCodPayments:jest.fn(),
  getCodRemittanceInstructions:jest.fn(),
  submitCodCashRemittance:jest.fn(),
  listMyCodCashRemittances:jest.fn(),
  listCodCashRemittances:jest.fn(),
  verifyCodCashRemittance:jest.fn(),
  refund:jest.fn(),
  getHistory:jest.fn(),
}));
jest.mock('../../integrations/modempay',()=>({
  isConfigured:jest.fn(),isWebhookConfigured:jest.fn(),isH2H:jest.fn(),isH2HApproved:jest.fn(),
  verifyWebhookSignature:jest.fn()
}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const service=require('./service');
const modemPay=require('../../integrations/modempay');
const controller=require('./controller');

function response(){
 const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
 return res;
}

describe('payment controller provider readiness and webhook body',()=>{
 const oldCallback=process.env.MODEM_PAY_CALLBACK_URL;
 afterEach(()=>{
  jest.clearAllMocks();
  if(oldCallback===undefined)delete process.env.MODEM_PAY_CALLBACK_URL;
  else process.env.MODEM_PAY_CALLBACK_URL=oldCallback;
 });

 test('does not advertise mobile-money methods when the callback URL is missing',async()=>{
  delete process.env.MODEM_PAY_CALLBACK_URL;
  modemPay.isConfigured.mockReturnValue(true);
  modemPay.isWebhookConfigured.mockReturnValue(true);
  modemPay.isH2H.mockReturnValue(false);
  modemPay.isH2HApproved.mockReturnValue(true);
  const res=response();
  await controller.methods({},{...res},jest.fn());
  expect(res.body.data).toMatchObject({configured:false,hostedCheckout:false,directMobileMoney:false,methods:[]});
  expect(JSON.stringify(res.body)).not.toContain('webhookSecret');
 });

 test('advertises hosted checkout only after key, secret and callback are configured',async()=>{
  process.env.MODEM_PAY_CALLBACK_URL='https://marketlink-gambia.onrender.com/api/v1/payments/webhook/modempay';
  modemPay.isConfigured.mockReturnValue(true);
  modemPay.isWebhookConfigured.mockReturnValue(true);
  modemPay.isH2H.mockReturnValue(false);
  modemPay.isH2HApproved.mockReturnValue(true);
  const res=response();
  await controller.methods({},res,jest.fn());
  expect(res.body.data).toMatchObject({configured:true,hostedCheckout:true,directMobileMoney:false,currency:'GMD'});
  expect(res.body.data).not.toHaveProperty('callbackUrl');
 });

 test('uses the raw webhook bytes for signature validation then passes canonical JSON to processing',async()=>{
  const event={event:'charge.succeeded',payload:{amount:145,currency:'GMD'}};
  const raw=Buffer.from('{ "event" : "charge.succeeded", "payload" : { "amount":145, "currency":"GMD" } }');
  modemPay.verifyWebhookSignature.mockReturnValue(true);
  service.processWebhook.mockResolvedValue({processed:true});
  const req={params:{provider:'modempay'},headers:{'x-modem-signature':'signed-value'},body:raw};
  const res=response();
  const next=jest.fn();
  await controller.webhook(req,res,next);
  expect(modemPay.verifyWebhookSignature).toHaveBeenCalledWith(raw.toString('utf8'),'signed-value',JSON.stringify(event));
  expect(service.processWebhook).toHaveBeenCalledWith({event,rawBody:JSON.stringify(event)});
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({received:true,data:{processed:true}});
  expect(next).not.toHaveBeenCalled();
 });

 test('rejects an invalid webhook signature before processing any financial event',async()=>{
  const raw=Buffer.from('{"event":"charge.succeeded","payload":{}}');
  modemPay.verifyWebhookSignature.mockReturnValue(false);
  const res=response();
  await controller.webhook({params:{provider:'modempay'},headers:{'x-modem-signature':'bad'},body:raw},res,jest.fn());
  expect(res.statusCode).toBe(400);
  expect(service.processWebhook).not.toHaveBeenCalled();
 });

 test('rejects an unexpected provider name',async()=>{
  const raw=Buffer.from('{"event":"charge.succeeded","payload":{}}');
  const res=response();
  await controller.webhook({params:{provider:'stripe'},headers:{'x-modem-signature':'sig'},body:raw},res,jest.fn());
  expect(res.statusCode).toBe(404);
  expect(modemPay.verifyWebhookSignature).not.toHaveBeenCalled();
 });
});
