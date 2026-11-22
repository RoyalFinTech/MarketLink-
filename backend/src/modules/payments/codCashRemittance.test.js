jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({isConfigured:jest.fn(()=>false),isWebhookConfigured:jest.fn(()=>false),isH2H:jest.fn(()=>false)}));
jest.mock('../orders/service',()=>({settleOrderFinancials:jest.fn()}));
jest.mock('../wallets/service',()=>({processDepositWebhook:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const ordersService=require('../orders/service');
const {submitCodCashRemittance,verifyCodCashRemittance,getCodRemittanceInstructions}=require('./service');

const paymentId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
const riderId='33333333-3333-4333-8333-333333333333';
const adminId='44444444-4444-4444-8444-444444444444';
const remittanceId='55555555-5555-4555-8555-555555555555';
const proofFileId='77777777-7777-4777-8777-777777777777';
const payment={id:paymentId,order_id:orderId,amount:'145.00',currency:'GMD',method:'cod',status:'pending'};
const remittance={id:remittanceId,payment_id:paymentId,order_id:orderId,rider_id:riderId,amount:'145.00',deposit_method:'wave',provider_reference:'WV-2026-1234',status:'submitted'};

describe('rider cash remittance controls',()=>{
 let tx;
 beforeEach(()=>{
  jest.clearAllMocks();
  process.env.MARKETLINK_COD_WAVE_ACCOUNT_NUMBER='871234567';
  process.env.MARKETLINK_COD_WAVE_ACCOUNT_NAME='MarketLink Gambia';
  process.env.MARKETLINK_COD_AFRIMONEY_ACCOUNT_NUMBER='861234567';
  process.env.MARKETLINK_COD_AFRIMONEY_ACCOUNT_NAME='MarketLink Gambia';
  tx=jest.fn(async(sql,params=[])=>{
   if(sql.includes('SELECT id FROM file_uploads'))return{rows:[{id:proofFileId}]};
   if(sql.includes('SELECT p.id,p.order_id'))return{rows:[{...payment,payment_status:'pending',order_status:'delivered',order_payment_status:'pending',delivery_id:'delivery-1',rider_id:riderId,delivery_status:'delivered'}]};
   if(sql.includes('SELECT * FROM cod_cash_remittances WHERE payment_id'))return{rows:[]};
   if(sql.includes('INSERT INTO cod_cash_remittances'))return{rows:[remittance]};
   if(sql.includes('SELECT * FROM cod_cash_remittances WHERE id'))return{rows:[remittance]};
   if(sql.includes('SELECT p.method,p.amount'))return{rows:[{method:'cod',amount:'145.00',payment_status:'pending',order_status:'delivered',delivery_status:'delivered',rider_id:riderId}]};
   if(sql.includes('UPDATE cod_cash_remittances'))return{rows:[{...remittance,status:params[0]}]};
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,total,status,order_number FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:'customer-1',total:'145.00',status:'delivered',order_number:'ML-123'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[payment]};
   if(sql.includes("UPDATE payments SET status='confirmed'"))return{rows:[{...payment,status:'confirmed'}]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(async(fn)=>fn({query:tx}));
  query.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id FROM file_uploads'))return{rows:[{id:proofFileId}]};
   if(sql==='SELECT * FROM payments WHERE id=$1')return{rows:[payment]};
   return{rows:[]};
  });
  ordersService.settleOrderFinancials.mockResolvedValue({settled:true,vendorPayout:100,riderPayout:25,affiliatePayout:2,platformNet:18});
 });

 test('publishes only valid configured collection account destinations',()=>{
  expect(getCodRemittanceInstructions()).toMatchObject({
   currency:'GMD',
   methods:{
    wave:{configured:true,accountNumber:'871234567',accountName:'MarketLink Gambia'},
    afrimoney:{configured:true,accountNumber:'861234567',accountName:'MarketLink Gambia'}
   }
  });
  process.env.MARKETLINK_COD_WAVE_ACCOUNT_NUMBER='123';
  expect(getCodRemittanceInstructions().methods.wave.configured).toBe(false);
 });
 test('rider submission locks and validates the assigned delivered COD order',async()=>{
  const result=await submitCodCashRemittance({paymentId,riderId,providerReference:'WV-2026-1234',depositMethod:'wave',proofFileId});
  expect(result).toMatchObject({payment_id:paymentId,status:'submitted',provider_reference:'WV-2026-1234'});
  expect(tx.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(tx.mock.calls[1][0]).toMatch(/FOR UPDATE OF p,o,d/i);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO cod_cash_remittances'))).toBe(true);
 });

 test('rejects a rider who is not assigned to the delivery',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id FROM file_uploads'))return{rows:[{id:proofFileId}]};
   if(sql.includes('SELECT p.id,p.order_id'))return{rows:[{...payment,order_status:'delivered',delivery_status:'delivered',rider_id:'another-rider'}]};
   return{rows:[]};
  });
  await expect(submitCodCashRemittance({paymentId,riderId,providerReference:'WV-2026-1234',proofFileId}))
   .rejects.toMatchObject({statusCode:403,code:'COD_REMITTANCE_FORBIDDEN'});
 });

 test('rejects a reference before delivery is complete',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id FROM file_uploads'))return{rows:[{id:proofFileId}]};
   if(sql.includes('SELECT p.id,p.order_id'))return{rows:[{...payment,order_status:'on_the_way',delivery_status:'in_transit',rider_id:riderId}]};
   return{rows:[]};
  });
  await expect(submitCodCashRemittance({paymentId,riderId,providerReference:'WV-2026-1234',proofFileId}))
   .rejects.toMatchObject({statusCode:409,code:'COD_REMITTANCE_NOT_DELIVERED'});
 });

 test('Admin verification records review and only then confirms and settles the order',async()=>{
  const result=await verifyCodCashRemittance(remittanceId,{id:adminId,role:'admin'},'verified','Matched statement');
  expect(result.remittance).toMatchObject({id:remittanceId,status:'verified'});
  expect(result.payment).toMatchObject({id:paymentId,status:'confirmed'});
  expect(result.settlement).toMatchObject({settled:true});
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledTimes(1);
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith(orderId);
  expect(tx.mock.calls.some(([sql])=>sql.includes('admin_action_logs'))).toBe(true);
 });

 test('Admin verification refuses a receipt when the payment amount has changed',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT * FROM cod_cash_remittances WHERE id'))return{rows:[remittance]};
   if(sql.includes('SELECT p.method,p.amount'))return{rows:[{method:'cod',amount:'150.00',order_status:'delivered',delivery_status:'delivered',rider_id:riderId}]};
   return{rows:[]};
  });
  await expect(verifyCodCashRemittance(remittanceId,{id:adminId,role:'admin'},'verified','Matched reference'))
   .rejects.toMatchObject({statusCode:409,code:'COD_REMITTANCE_AMOUNT_MISMATCH'});
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('rejecting a remittance does not confirm payment or release wallet settlement',async()=>{
  const result=await verifyCodCashRemittance(remittanceId,{id:adminId,role:'admin'},'rejected','Reference not found');
  expect(result.remittance).toMatchObject({status:'rejected'});
  expect(result.settlement).toBeNull();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
});
