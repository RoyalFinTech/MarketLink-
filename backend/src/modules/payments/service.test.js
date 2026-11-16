jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({isConfigured:jest.fn(()=>false),isWebhookConfigured:jest.fn(()=>false),isH2H:jest.fn(()=>false)}));
jest.mock('../orders/service',()=>({settleOrderFinancials:jest.fn()}));
jest.mock('../wallets/service',()=>({processDepositWebhook:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const ordersService=require('../orders/service');
const {confirmPayment,listPendingCodPayments,initiatePayment}=require('./service');

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
 let transactionQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id = $1'))return{rows:[payment]};
   if(sql.includes('SELECT status FROM cod_cash_remittances'))return{rows:[{status:'verified'}]};
   if(sql.startsWith('SELECT status FROM orders'))return{rows:[{status:'delivered'}]};
   return{rows:[]};
  });
  transactionQuery=jest.fn(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id=$1 FOR UPDATE'))return{rows:[payment]};
   if(sql.startsWith("UPDATE payments SET status='confirmed'"))return{rows:[{...payment,status:'confirmed'}]};
   if(sql.startsWith('SELECT customer_id,total,status,order_number FROM orders'))return{rows:[deliveredOrder]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(async(work)=>work({query:transactionQuery}));
  ordersService.settleOrderFinancials.mockResolvedValue({settled:true,vendorPayout:100,riderPayout:20,affiliatePayout:2,platformNet:23});
 });
 test('checkout creates a pending COD payment without treating cash as paid',async()=>{
  transactionQuery.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT id, customer_id, total, payment_status'))return{rows:[{id:payment.order_id,customer_id:'customer-id',total:'145.00',payment_status:'pending'}]};
   if(sql.startsWith('SELECT * FROM payments WHERE order_id=$1'))return{rows:[]};
   if(sql.startsWith("INSERT INTO payments (order_id, method"))return{rows:[payment]};
   return{rows:[]};
  });
  const result=await initiatePayment({orderId:payment.order_id,method:'cod',amount:145,customerId:'customer-id'});
  expect(result).toMatchObject({payment:{id:payment.id,status:'pending'},action:'cod_pending'});
  expect(transactionQuery.mock.calls.some(([sql])=>sql.includes("VALUES ($1,'cod',$2,'GMD','pending')"))).toBe(true);
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('order checkout rejects methods outside Cash on Delivery and DAHA Wallet',async()=>{
  await expect(initiatePayment({orderId:payment.order_id,method:'wave',amount:145,customerId:'customer-id'}))
   .rejects.toMatchObject({statusCode:400,code:'UNSUPPORTED_METHOD'});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('only an Admin can confirm collected COD cash',async()=>{
  await expect(confirmPayment(payment.id,'vendor-id',['vendor']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  expect(withTransaction).not.toHaveBeenCalled();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('refuses to confirm COD before the order is delivered',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM payments WHERE id = $1'))return{rows:[payment]};
   if(sql.includes('SELECT status FROM cod_cash_remittances'))return{rows:[{status:'verified'}]};
   if(sql.startsWith('SELECT status FROM orders'))return{rows:[{status:'preparing'}]};
   return{rows:[]};
  });
  await expect(confirmPayment(payment.id,'admin-id',['admin']))
   .rejects.toMatchObject({statusCode:409,code:'COD_NOT_DELIVERED'});
  expect(withTransaction).not.toHaveBeenCalled();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('records the Admin actor in the payment audit log and settles once confirmed',async()=>{
  const result=await confirmPayment(payment.id,'admin-id',['admin']);
  expect(result.payment).toMatchObject({id:payment.id,status:'confirmed'});
  expect(result.settlement).toMatchObject({settled:true});
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledTimes(1);
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith(payment.order_id);
  const auditCall=transactionQuery.mock.calls.find(([sql])=>sql.includes("INSERT INTO admin_action_logs"));
  expect(auditCall).toBeDefined();
  expect(auditCall[1]).toEqual(expect.arrayContaining(['admin-id','admin',payment.id]));
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
