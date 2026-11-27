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
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'delivered'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none',refund_amount:'0.00'}]};
   if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'pending',has_settlement_credits:false,platform_earning_status:null}]};
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
 test('cancels an undispatched paid order and restores only its base inventory during a full refund',async()=>{
  tx.mockImplementation(async(sql,params=[])=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'pending'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'wallet',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'pending',has_settlement_credits:false,platform_earning_status:null}]};
   if(sql.includes('SELECT id,balance FROM wallets'))return{rows:[{id:walletId,balance:'25.00'}]};
   if(sql.includes('SELECT product_id,quantity FROM order_items'))return{rows:[{product_id:'product-1',quantity:2}]};
   if(sql.includes('UPDATE inventory SET quantity=quantity+$1'))return{rows:[{product_id:'product-1'}]};
   if(sql.includes('UPDATE payments SET refund_status'))return{rows:[{id:paymentId,status:'refunded',refund_status:'processed',refund_amount:100}]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{reason:'Customer cancelled before dispatch'},actor))
   .resolves.toMatchObject({id:paymentId,status:'refunded'});
  const stockRestore=tx.mock.calls.find(([sql])=>sql.includes('UPDATE inventory SET quantity=quantity+$1'));
  expect(stockRestore).toBeDefined();
  expect(stockRestore[0]).toContain('variant_id IS NULL');
  expect(tx.mock.calls.some(([sql])=>sql.includes("status='cancelled'")&&sql.includes("payment_status='refunded'"))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO order_status_history'))).toBe(true);
 });
 test('rolls back a pre-dispatch refund if its inventory row cannot be restored',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'pending'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'wallet',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'pending',has_settlement_credits:false,platform_earning_status:null}]};
   if(sql.includes('SELECT id,balance FROM wallets'))return{rows:[{id:walletId,balance:'25.00'}]};
   if(sql.includes('SELECT product_id,quantity FROM order_items'))return{rows:[{product_id:'product-missing',quantity:1}]};
   if(sql.includes('UPDATE inventory SET quantity=quantity+$1'))return{rows:[]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{reason:'Customer cancelled'},actor))
   .rejects.toMatchObject({statusCode:409,code:'REFUND_INVENTORY_RESTORE_FAILED'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
  expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE payments SET refund_status'))).toBe(false);
 });
 test('does not automatically refund an order already assigned to a rider or in transit',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'on_the_way'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'pending',has_settlement_credits:false,platform_earning_status:null}]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{reason:'Customer reports delay'},actor))
   .rejects.toMatchObject({statusCode:409,code:'REFUND_ORDER_IN_PROGRESS'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE wallets'))).toBe(false);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 test('blocks a refund when vendor, rider or affiliate earnings have already been settled',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'delivered'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'paid',has_settlement_credits:true,platform_earning_status:'earned'}]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{reason:'Customer refund request'},actor))
   .rejects.toMatchObject({statusCode:409,code:'REFUND_SETTLEMENT_REVERSAL_REQUIRED'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE wallets'))).toBe(false);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
  expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE payments SET refund_status'))).toBe(false);
 });
 test('rejects partial refunds until refund reconciliation supports them',async()=>{
  await expect(refund(paymentId,{amount:20,reason:'Partial adjustment'},actor))
   .rejects.toMatchObject({statusCode:409,code:'PARTIAL_REFUND_NOT_SUPPORTED'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 test('rejects duplicate refund requests without a second wallet credit',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'delivered'}]};
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
   if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'delivered'}]};
   if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100.00',status:'confirmed',refund_status:'none'}]};
   if(sql.includes('SELECT id,balance FROM wallets'))return{rows:[]};
   return{rows:[]};
  });
  await expect(refund(paymentId,{},actor)).rejects.toMatchObject({statusCode:409,code:'REFUND_WALLET_MISSING'});
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO transactions'))).toBe(false);
 });
 describe('settled order financial reversals',()=>{
  const reversalId='66666666-6666-4666-8666-666666666666';
  const vendorId='77777777-7777-4777-8777-777777777777';
  const riderId='88888888-8888-4888-8888-888888888888';
  const affiliateId='99999999-9999-4999-8999-999999999999';
  const vendorWallet='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const riderWallet='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const affiliateWallet='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const customerWallet='dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function prepare({vendorBalance=150,wrongVendor=false,existing=false}={}){
   const lineRows=[];
   const balances=new Map([
    [vendorWallet,vendorBalance],[riderWallet,50],[affiliateWallet,10],[customerWallet,5]
   ]);
   const wallets=[
    {id:vendorWallet,user_id:vendorId,balance:String(vendorBalance),currency:'GMD'},
    {id:riderWallet,user_id:riderId,balance:'50',currency:'GMD'},
    {id:affiliateWallet,user_id:affiliateId,balance:'10',currency:'GMD'},
    {id:customerWallet,user_id:customerId,balance:'5',currency:'GMD'},
   ];
   const original=[
    {id:'original-vendor',wallet_id:vendorWallet,amount:'80',category:'vendor_sale',reference_type:'order_vendor_payout',user_id:wrongVendor?'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee':vendorId},
    {id:'original-rider',wallet_id:riderWallet,amount:'15',category:'delivery_earning',reference_type:'order_rider_payout',user_id:riderId},
    {id:'original-affiliate',wallet_id:affiliateWallet,amount:'2',category:'affiliate_commission',reference_type:'order_affiliate_payout',user_id:affiliateId},
   ];
   tx.mockImplementation(async(sql,params=[])=>{
    if(sql.includes('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:orderId}]};
    if(sql.includes('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:orderId,customer_id:customerId,status:'delivered'}]};
    if(sql.includes('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[{id:paymentId,order_id:orderId,method:'cod',amount:'100',status:'confirmed',refund_status:existing?'requested':'none',refund_amount:'0'}]};
    if(sql.includes('SELECT * FROM financial_reversals WHERE payment_id=$1 FOR UPDATE'))return{rows:existing?[{id:reversalId,payment_id:paymentId,order_id:orderId,amount:'100',status:'recovery_required',reason:'Customer refund'}]:[]};
    if(sql.includes('AS has_settlement_credits'))return{rows:[{commission_status:'paid',has_settlement_credits:true,platform_earning_status:'earned'}]};
    if(sql.includes('INSERT INTO financial_reversals'))return{rows:[{id:reversalId,payment_id:paymentId,amount:'100',status:'recovery_required',reason:'Customer refund'}]};
    if(sql.includes('SELECT id,vendor_id,vendor_payout'))return{rows:[{id:orderId,vendor_id:vendorId,vendor_payout:'80',rider_payout:'15',affiliate_user_id:affiliateId,affiliate_commission_amount:'2',platform_net_fee:'3',platform_fee:'5',payout_fee_recovery_amount:'0',total:'100'}]};
    if(sql.includes('SELECT * FROM commission_records WHERE order_id=$1 FOR UPDATE'))return{rows:[{id:'commission-1',status:'paid',vendor_id:vendorId,affiliate_user_id:affiliateId,order_total:'100',vendor_payout:'80',rider_payout:'15',affiliate_commission_amount:'2',platform_net_amount:'3',commission_amount:'5'}]};
    if(sql.includes('SELECT id,rider_id,status FROM deliveries WHERE order_id=$1 FOR UPDATE'))return{rows:[{id:'delivery-1',rider_id:riderId,status:'delivered'}]};
    if(sql.includes('SELECT * FROM platform_earnings WHERE order_id=$1 FOR UPDATE'))return{rows:[{id:'platform-1',status:'earned',commission_amount:'3',payout_fee_recovery_amount:'0'}]};
    if(sql.includes('reference_type=ANY($2::text[])'))return{rows:original};
    if(sql.includes("FROM rider_earnings")&&sql.includes("type='delivery'"))return{rows:[{id:'rider-earning-1',amount:'15'}]};
    if(sql.includes('WHERE user_id=ANY($1::uuid[])'))return{rows:wallets};
    if(sql.includes('FROM withdrawals'))return{rows:[]};
    if(sql.includes('INSERT INTO financial_reversal_lines')){
      const line={id:'line-'+params[1],reversal_id:params[0],beneficiary_type:params[1],beneficiary_user_id:params[2],wallet_id:params[3],original_transaction_id:params[4],platform_earning_id:params[5],amount:String(params[6])};
      lineRows.push(line);return{rows:[line]};
    }
    if(sql.includes('SELECT * FROM financial_reversal_lines WHERE reversal_id=$1 FOR UPDATE'))return{rows:lineRows};
    if(sql.includes('UPDATE wallets SET balance=balance-$1')){
      const next=balances.get(params[1])-Number(params[0]);balances.set(params[1],next);return{rows:[{balance:String(next)}]};
    }
    if(sql.includes('UPDATE wallets SET balance=balance+$1')){
      const next=balances.get(params[1])+Number(params[0]);balances.set(params[1],next);return{rows:[{balance:String(next)}]};
    }
    if(sql.includes('INSERT INTO transactions')&&sql.includes("'debit'"))return{rows:[{id:'debit-'+params[3]}]};
    if(sql.includes('INSERT INTO transactions')&&sql.includes('payment_refund_credit'))return{rows:[{id:'customer-refund-credit'}]};
    if(sql.includes("UPDATE payments SET refund_status='processed'"))return{rows:[{id:paymentId,status:'refunded',refund_status:'processed',refund_amount:100}]};
    return{rows:[]};
   });
   return{lineRows,balances};
  }

  test('reverses settled vendor, rider and affiliate credits before crediting the customer',async()=>{
   const {lineRows,balances}=prepare();
   const result=await refund(paymentId,{reason:'Approved customer refund'},actor);
   expect(result).toMatchObject({id:paymentId,status:'refunded',refund_status:'processed'});
   expect(tx.mock.calls.filter(([sql])=>sql.includes("INSERT INTO transactions")&&sql.includes("'debit'")&&sql.includes("'refund_reversal'"))).toHaveLength(3);
   expect(tx.mock.calls.some(([sql])=>sql.includes('payment_refund_credit'))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes("SET status='reversed'")&&sql.includes('platform_earnings'))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes("type='deduction'")&&sql.includes('rider_earnings'))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes("SET status='completed'")&&sql.includes('financial_reversals'))).toBe(true);
   expect(lineRows.map(line=>line.beneficiary_type).sort()).toEqual(['affiliate','customer','platform','rider','vendor']);
   expect(balances.get(vendorWallet)).toBe(70);
   expect(balances.get(riderWallet)).toBe(35);
   expect(balances.get(affiliateWallet)).toBe(8);
   expect(balances.get(customerWallet)).toBe(105);
  });

  test('holds the refund for recovery when a beneficiary has withdrawn or reserved too much',async()=>{
   prepare({vendorBalance:20});
   await expect(refund(paymentId,{reason:'Approved customer refund'},actor))
    .rejects.toMatchObject({statusCode:409,code:'REFUND_RECOVERY_REQUIRED'});
   expect(tx.mock.calls.some(([sql])=>sql.includes("SET status='recovery_required'")&&sql.includes('financial_reversals'))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes("UPDATE payments SET refund_status='requested'"))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE wallets SET balance=balance-'))).toBe(false);
   expect(tx.mock.calls.some(([sql])=>sql.includes('payment_refund_credit'))).toBe(false);
  });

  test('holds the refund when the original credit is missing or belongs to the wrong wallet owner',async()=>{
   prepare({wrongVendor:true});
   await expect(refund(paymentId,{reason:'Approved customer refund'},actor))
    .rejects.toMatchObject({statusCode:409,code:'REFUND_RECOVERY_REQUIRED'});
   expect(tx.mock.calls.some(([sql])=>sql.includes("UPDATE payments SET refund_status='requested'"))).toBe(true);
   expect(tx.mock.calls.some(([sql])=>sql.includes('UPDATE wallets SET balance=balance-'))).toBe(false);
   expect(tx.mock.calls.some(([sql])=>sql.includes('payment_refund_credit'))).toBe(false);
  });

  test('allows a recovery retry using the original amount after beneficiary funds are restored',async()=>{
   const {balances}=prepare({vendorBalance:150,existing:true});
   const result=await refund(paymentId,{},actor);
   expect(result).toMatchObject({id:paymentId,status:'refunded',refund_status:'processed'});
   expect(balances.get(vendorWallet)).toBe(70);
   expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO financial_reversals'))).toBe(false);
  });
 });

});
