jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({isConfigured:jest.fn(()=>false),isWebhookConfigured:jest.fn(()=>false),isH2H:jest.fn(()=>false),isH2HApproved:jest.fn(()=>false),createPaymentIntent:jest.fn()}));
jest.mock('../orders/service',()=>({settleOrderFinancials:jest.fn()}));
jest.mock('../wallets/service',()=>({processDepositWebhook:jest.fn()}));

const {withTransaction}=require('../../config/db');
const {refund}=require('./service');
const paymentId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
const customerId='33333333-3333-4333-8333-333333333333';
const walletId='44444444-4444-4444-8444-444444444444';
const actor={id:'55555555-5555-4555-8555-555555555555',role:'admin'};

describe('customer payment refunds',()=>{
 let tx;
 beforeEach(()=>{
  jest.clearAllMocks();
  tx=jest.fn(async(sql,params=[])=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none',refund_amount:'0.00'}]};
   if(sql.includes('SELECT id,balance FROM wallets'))return{rows:[{id:walletId,balance:'25.00'}]};
   if(sql.includes('UPDATE payments SET refund_status'))return{rows:[{id:paymentId,status:params[1]?'refunded':'partially_refunded',refund_status:'processed',refund_amount:params[0]}]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(fn=>fn({query:tx}));
 });
 test('credits a full COD refund to DAHA Wallet atomically and marks the order refunded',async()=>{
  const result=await refund(paymentId,{reason:'Customer cancellation'},actor);
  expect(result).toMatchObject({id:paymentId,status:'refunded',refund_status:'processed'});
  expect(tx.mock.calls[1][0]).toContain('orders WHERE id=$1 FOR UPDATE');
  expect(tx.mock.calls[2][0]).toContain('payments WHERE id=$1 AND order_id=$2 FOR UPDATE');
  expect(tx.mock.calls.some(([sql])=>sql.includes("UPDATE orders SET payment_status='refunded'"))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes("INSERT INTO transactions")&&sql.includes("'refund'"))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes("INSERT INTO admin_action_logs")&&sql.includes('payment.refunded'))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes("INSERT INTO notifications")&&sql.includes('payment_refunded'))).toBe(true);
 });
 test('rejects partial refunds until refund reconciliation supports them',async()=>{
  await expect(refund(paymentId,{amount:20,reason:'Partial adjustment'},actor))
   .rejects.toMatchObject({statusCode:409,code:'PARTIAL_REFUND_NOT_SUPPORTED'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 test('rejects duplicate refund requests without a second wallet credit',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'refunded',refund_status:'processed',refund_amount:'100.00'}]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{},actor)).rejects.toMatchObject({statusCode:409,code:'ALREADY_REFUNDED'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 test('rejects an invalid refund amount before wallet credit',async()=>{
  await expect(refund(paymentId,{amount:150},actor)).rejects.toMatchObject({statusCode:400,code:'INVALID_AMOUNT'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 test('fails safely when the customer wallet is missing',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('SELECT id,balance FROM wallets'))return{rows:[]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{},actor)).rejects.toMatchObject({statusCode:409,code:'REFUND_WALLET_MISSING'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
});
