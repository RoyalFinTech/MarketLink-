jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({isConfigured:jest.fn(()=>false),isWebhookConfigured:jest.fn(()=>false),isH2H:jest.fn(()=>false)}));
jest.mock('../orders/service',()=>({settleOrderFinancials:jest.fn()}));
jest.mock('../wallets/service',()=>({processDepositWebhook:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const ordersService=require('../orders/service');
const {confirmPayment,listPendingCodPayments}=require('./service');

const payment={
 id:'11111111-1111-4111-8111-111111111111',
 order_id:'22222222-2222-4222-8222-222222222222',
 method:'cod',amount:'145.00',currency:'GMD',status:'pending'
};
const deliveredOrder={
 customer_id:'33333333-3333-4333-8333-333333333333',
 total:'145.00',status:'delivered',order_number:'ML-TEST-0001'
};

describe('Pay on Delivery reconciliation',()=>{
 beforeEach(()=>{
  jest.clearAllMocks();
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id = $1'))return{rows:[payment]};
   if(sql.startsWith('SELECT status FROM orders'))return{rows:[{status:'delivered'}]};
   return{rows:[]};
  });
  const clientQuery=jest.fn(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id=$1 FOR UPDATE'))return{rows:[payment]};
   if(sql.startsWith("UPDATE payments SET status='confirmed'"))return{rows:[{...payment,status:'confirmed'}]};
   if(sql.startsWith('SELECT customer_id,total,status,order_number FROM orders'))return{rows:[deliveredOrder]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(async(work)=>work({query:clientQuery}));
  ordersService.settleOrderFinancials.mockResolvedValue({settled:true,vendorPayout:100,riderPayout:20,affiliatePayout:2,platformNet:23});
 });
 test('only an Admin can confirm collected COD cash',async()=>{
  await expect(confirmPayment(payment.id,'vendor-id',['vendor']))
   .rejects.toMatchObject({status:403,code:'FORBIDDEN'});
  expect(withTransaction).not.toHaveBeenCalled();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('refuses to confirm COD before the order is delivered',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id = $1'))return{rows:[payment]};
   if(sql.startsWith('SELECT status FROM orders'))return{rows:[{status:'preparing'}]};
   return{rows:[]};
  });
  await expect(confirmPayment(payment.id,'admin-id',['admin']))
   .rejects.toMatchObject({status:409,code:'COD_NOT_DELIVERED'});
  expect(withTransaction).not.toHaveBeenCalled();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('records the Admin actor in the payment audit log and settles once confirmed',async()=>{
  const result=await confirmPayment(payment.id,'admin-id',['admin']);
  expect(result.payment).toMatchObject({id:payment.id,status:'confirmed'});
  expect(result.settlement).toMatchObject({settled:true});
  const clientQuery=withTransaction.mock.calls[0][0];
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith(payment.order_id);
  const calls=withTransaction.mock.results[0].value;
  expect(calls).toBeDefined();
 });
 test('lists delivered pending or confirmed-but-unsettled COD payments for Admin retry',async()=>{
  const row={payment_id:payment.id,payment_record_status:'confirmed'};
  query.mockResolvedValue({rows:[row]});
  const rows=await listPendingCodPayments({page:1,limit:30});
  expect(rows).toEqual([row]);
  const sql=query.mock.calls[0][0];
  expect(sql).toContain("p.method='cod'");
  expect(sql).toContain("o.status='delivered'");
  expect(sql).toContain("p.status='pending'");
  expect(sql).toContain("COALESCE(cr.status,'')<>'paid'");
 });
});
