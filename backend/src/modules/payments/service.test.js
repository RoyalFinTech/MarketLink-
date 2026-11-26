jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({isConfigured:jest.fn(()=>false),isWebhookConfigured:jest.fn(()=>false),isH2H:jest.fn(()=>false),isH2HApproved:jest.fn(()=>false),createPaymentIntent:jest.fn()}));
jest.mock('../orders/service',()=>({settleOrderFinancials:jest.fn()}));
jest.mock('../wallets/service',()=>({processDepositWebhook:jest.fn(),failDepositWebhook:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const ordersService=require('../orders/service');
const modemPay=require('../../integrations/modempay');
const {confirmPayment,getPaymentStatus,listPendingCodPayments,initiatePayment,submitCodCashRemittance,verifyCodCashRemittance,processWebhook}=require('./service');

const payment={
 id:'11111111-1111-4111-8111-111111111111',
 order_id:'22222222-2222-4222-8222-222222222222',
 method:'cod',amount:'145.00',currency:'GMD',status:'pending'
};
const deliveredOrder={
 customer_id:'33333333-3333-4333-8333-333333333333',
 total:'145.00',status:'delivered',order_number:'ML-TEST-0001'
};

describe('Modem Pay charge success webhook reconciliation',()=>{
 beforeEach(()=>{
  jest.clearAllMocks();
  ordersService.settleOrderFinancials.mockResolvedValue({settled:true});
 });

 test('confirms one matching completed GMD charge and settles it after commit',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'event-1'}]})
   .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'pending',payment_status:'pending'}]})
   .mockResolvedValueOnce({rows:[{...payment,id:payment.id,method:'wave',amount:'145.00',currency:'GMD',status:'pending'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{customer_id:deliveredOrder.customer_id,total:'145.00'}]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const event={event:'charge.succeeded',payload:{
    id:'provider-charge-145',status:'completed',amount:145,currency:'GMD',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
  }};
  const result=await processWebhook({event,rawBody:JSON.stringify(event)});
  expect(result).toMatchObject({processed:true,eventType:'charge.succeeded',paymentId:payment.id,orderId:payment.order_id});
  expect(clientQuery.mock.calls[0][0]).toContain('payment_webhook_events');
  expect(clientQuery.mock.calls[0][0]).toContain('ON CONFLICT (provider,event_id) DO NOTHING');
  expect(clientQuery.mock.calls[1][0]).toContain('orders WHERE id=$1 FOR UPDATE');
  expect(clientQuery.mock.calls[2][0]).toContain('payments p');
  expect(clientQuery.mock.calls[3][0]).toContain("UPDATE payments SET status='confirmed'");
  expect(clientQuery.mock.calls[4][0]).toContain("UPDATE orders SET payment_status='confirmed'");
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledTimes(1);
  expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith(payment.order_id);
 });

 test('deduplicates a repeated signed provider event without confirming or settling twice',async()=>{
  const clientQuery=jest.fn().mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const event={event:'charge.succeeded',payload:{
    id:'provider-charge-duplicate',status:'completed',amount:145,currency:'GMD',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
  }};
  const result=await processWebhook({event,rawBody:JSON.stringify(event)});
  expect(result).toMatchObject({duplicate:true,eventType:'charge.succeeded'});
  expect(clientQuery).toHaveBeenCalledTimes(1);
  expect(clientQuery.mock.calls[0][0]).toContain('ON CONFLICT (provider,event_id) DO NOTHING');
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE payments SET status='confirmed'/.test(sql))).toBe(false);
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('does not confirm or settle a late successful charge for a cancelled order',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'event-cancelled-order'}]})
   .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'cancelled',payment_status:'failed'}]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const event={event:'charge.succeeded',payload:{
    id:'provider-charge-after-cancel',status:'completed',amount:145,currency:'GMD',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
  }};
  const result=await processWebhook({event,rawBody:JSON.stringify(event)});
  expect(result).toMatchObject({processed:true,ignored:true,reason:'order_cancelled_reconciliation_required'});
  expect(clientQuery).toHaveBeenCalledTimes(2);
  expect(clientQuery.mock.calls[1][0]).toContain('orders WHERE id=$1 FOR UPDATE');
  expect(clientQuery.mock.calls.some(([sql])=>/FROM payments p|UPDATE payments SET status='confirmed'|UPDATE orders SET payment_status='confirmed'/.test(sql))).toBe(false);
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('does not confirm or settle a signed provider event with an amount mismatch',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'event-bad-amount'}]})
   .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'pending',payment_status:'pending'}]})
   .mockResolvedValueOnce({rows:[{...payment,method:'wave',amount:'145.00',currency:'GMD',status:'pending'}]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const event={event:'charge.succeeded',payload:{
    id:'provider-charge-wrong-amount',status:'completed',amount:144,currency:'GMD',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
  }};
  const result=await processWebhook({event,rawBody:JSON.stringify(event)});
  expect(result).toMatchObject({processed:true,ignored:true,reason:'amount_mismatch'});
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE payments SET status='confirmed'/.test(sql))).toBe(false);
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE orders SET payment_status='confirmed'/.test(sql))).toBe(false);
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('does not confirm a completed provider event with the wrong currency',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'event-bad-currency'}]})
   .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'pending',payment_status:'pending'}]})
   .mockResolvedValueOnce({rows:[{...payment,method:'wave',amount:'145.00',currency:'GMD',status:'pending'}]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const event={event:'charge.succeeded',payload:{
    id:'provider-charge-wrong-currency',status:'completed',amount:145,currency:'USD',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
  }};
  const result=await processWebhook({event,rawBody:JSON.stringify(event)});
  expect(result).toMatchObject({processed:true,ignored:true,reason:'currency_mismatch'});
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
});

describe('payment webhook lock ordering',()=>{
 beforeEach(()=>jest.clearAllMocks());
  test('locks the order before the payment row when status polling reports provider failure',async()=>{
    modemPay.isH2H.mockReturnValue(true);
    modemPay.getTransaction=jest.fn().mockResolvedValue({status:'failed'});
    let paymentReads=0;
    query.mockImplementation(async(sql)=>{
      if(sql.includes('FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1')){
        paymentReads+=1;
        return{rows:[{...payment,method:'wave',status:paymentReads===1?'pending':'failed',customer_id:'customer-1'}]};
      }
      return{rows:[]};
    });
    const clientQuery=jest.fn()
      .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'pending',payment_status:'pending'}]})
      .mockResolvedValueOnce({rows:[{id:payment.id,status:'pending'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{product_id:'product-1',quantity:2}]})
      .mockResolvedValueOnce({rows:[{product_id:'product-1'}]})
      .mockResolvedValue({rows:[]});
    withTransaction.mockImplementation(async work=>work({query:clientQuery}));

    const result=await getPaymentStatus(payment.id,'customer-1',['customer']);

    expect(clientQuery.mock.calls[0][0]).toContain('FROM orders WHERE id=$1 FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain('FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE');
    expect(clientQuery.mock.calls[2][0]).toContain("UPDATE payments SET status='failed'");
    expect(clientQuery.mock.calls[3][0]).toContain('FROM order_items');
    expect(result).toMatchObject({status:'failed',payment:{status:'failed'}});
  });
 test('locks the order before the payment row when a provider reports payment failure',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'webhook-event-1'}]})
   .mockResolvedValueOnce({rows:[{id:payment.order_id,status:'pending',payment_status:'pending'}]})
   .mockResolvedValueOnce({rows:[{id:payment.id,order_id:payment.order_id,status:'pending',method:'wave'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{product_id:'product-1',quantity:2}]})
   .mockResolvedValue({rows:[]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  await processWebhook({
   event:{event:'charge.failed',payload:{
    id:'provider-charge-1',status:'failed',
    metadata:{orderId:payment.order_id,paymentId:payment.id}
   }},
   rawBody:'{}'
  });
  expect(clientQuery.mock.calls[1][0]).toContain('FROM orders WHERE id=$1 FOR UPDATE');
  expect(clientQuery.mock.calls[2][0]).toContain('FROM payments p');
  expect(clientQuery.mock.calls[2][0]).toContain('FOR UPDATE');
  expect(clientQuery.mock.calls[3][0]).toContain("UPDATE payments SET status='failed'");
 });
});

describe('Pay on Delivery reconciliation',()=>{
 let transactionQuery;
 beforeEach(()=>{
  process.env.MARKETLINK_COD_WAVE_ACCOUNT_NUMBER='871234567';
  process.env.MARKETLINK_COD_WAVE_ACCOUNT_NAME='MarketLink Gambia';
  jest.clearAllMocks();
  query.mockImplementation(async(sql)=>{
   if(sql.includes('FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1'))return{rows:[{...payment,customer_id:deliveredOrder.customer_id}]};
   if(sql.includes('SELECT status FROM cod_cash_remittances'))return{rows:[{status:'verified'}]};
   if(sql.startsWith('SELECT status FROM orders'))return{rows:[{status:'delivered'}]};
   return{rows:[]};
  });
  transactionQuery=jest.fn(async(sql)=>{
   if(sql.startsWith('SELECT order_id FROM payments WHERE id=$1'))return{rows:[{order_id:payment.order_id}]};
   if(sql.startsWith('SELECT id,customer_id,total,status,order_number FROM orders WHERE id=$1 FOR UPDATE'))return{rows:[{id:payment.order_id,...deliveredOrder}]};
   if(sql.startsWith('SELECT * FROM payments WHERE id=$1 AND order_id=$2 FOR UPDATE'))return{rows:[payment]};
   if(sql.startsWith("UPDATE payments SET status='confirmed'"))return{rows:[{...payment,status:'confirmed'}]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(async(work)=>work({query:transactionQuery}));
  ordersService.settleOrderFinancials.mockResolvedValue({settled:true,vendorPayout:100,riderPayout:20,affiliatePayout:2,platformNet:23});
 });
 test('Admin COD remittance review locks payment, order and delivery before the remittance row',async()=>{
  const remittance={
   id:'remittance-1',payment_id:payment.id,order_id:payment.order_id,
   rider_id:'rider-1',amount:'145.00',provider_reference:'WAVE-145',
   status:'submitted'
  };
  transactionQuery.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT payment_id FROM cod_cash_remittances'))return{rows:[{payment_id:payment.id}]};
   if(sql.includes('FROM payments p JOIN orders o ON o.id=p.order_id')&&sql.includes('FOR UPDATE OF p,o,d')){
    return{rows:[{method:'cod',amount:'145.00',payment_status:'pending',order_status:'delivered',delivery_status:'delivered',rider_id:'rider-1'}]};
   }
   if(sql.startsWith('SELECT * FROM cod_cash_remittances'))return{rows:[remittance]};
   if(sql.startsWith('UPDATE cod_cash_remittances SET status=$1'))return{rows:[{...remittance,status:'rejected'}]};
   return{rows:[]};
  });
  const result=await verifyCodCashRemittance('remittance-1',{id:'admin-1',role:'admin'},'rejected','Receipt does not match');
  expect(result).toMatchObject({remittance:{id:'remittance-1',status:'rejected'},settlement:null});
  expect(transactionQuery.mock.calls[0][0]).toBe('SELECT payment_id FROM cod_cash_remittances WHERE id=$1');
  expect(transactionQuery.mock.calls[1][0]).toContain('FOR UPDATE OF p,o,d');
  expect(transactionQuery.mock.calls[2][0]).toBe('SELECT * FROM cod_cash_remittances WHERE id=$1 FOR UPDATE');
  expect(transactionQuery.mock.calls[3][0]).toContain('UPDATE cod_cash_remittances SET status=$1');
  expect(transactionQuery.mock.calls[4][0]).toContain('INSERT INTO admin_action_logs');
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('checkout creates a pending COD payment without treating cash as paid',async()=>{
  transactionQuery.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT id, customer_id, total, payment_status'))return{rows:[{id:payment.order_id,customer_id:'customer-id',total:'145.00',payment_status:'pending',payment_method:'cod'}]};
   if(sql.startsWith('SELECT * FROM payments WHERE order_id=$1'))return{rows:[]};
   if(sql.startsWith("INSERT INTO payments (order_id, method"))return{rows:[payment]};
   return{rows:[]};
  });
  const result=await initiatePayment({orderId:payment.order_id,method:'cod',amount:145,customerId:'customer-id'});
  expect(result).toMatchObject({payment:{id:payment.id,status:'pending'},action:'cod_pending'});
  expect(transactionQuery.mock.calls.some(([sql])=>sql.includes("VALUES ($1,'cod',$2,'GMD','pending')"))).toBe(true);
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });

 test('DAHA Wallet checkout debits the authenticated customer wallet and confirms payment atomically',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:payment.order_id,customer_id:'customer-id',total:'145.00',payment_status:'pending',payment_method:'wallet'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'200.00'}]})
   .mockResolvedValueOnce({rows:[{amount:'0.00'}]})
   .mockResolvedValueOnce({rows:[{...payment,id:'wallet-payment',method:'wallet',status:'confirmed'}]})
   .mockResolvedValueOnce({rows:[{balance:'55.00'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  const result=await initiatePayment({orderId:payment.order_id,method:'wallet',amount:145,customerId:'customer-id'});
  expect(result).toMatchObject({action:'wallet_paid',status:'confirmed',walletBalance:55,payment:{method:'wallet',status:'confirmed'}});
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets SET balance=balance-\$1/i.test(sql))).toBe(true);
  expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO transactions.*'debit','purchase'/i.test(sql))).toBe(true);
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE orders SET payment_status='confirmed'/i.test(sql))).toBe(true);
 });

 test('DAHA Wallet refuses checkout when available balance is insufficient without writing a payment or debit',async()=>{
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:payment.order_id,customer_id:'customer-id',total:'145.00',payment_status:'pending',payment_method:'wallet'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100.00'}]})
   .mockResolvedValueOnce({rows:[{amount:'0.00'}]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  await expect(initiatePayment({orderId:payment.order_id,method:'wallet',amount:145,customerId:'customer-id'}))
   .rejects.toMatchObject({statusCode:400,code:'INSUFFICIENT_WALLET_BALANCE'});
  expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO payments|UPDATE wallets SET balance=balance-|INSERT INTO transactions/i.test(sql))).toBe(false);
 });

 test('rejects DAHA Wallet payment when the saved order selected Cash on Delivery',async()=>{
  const clientQuery=jest.fn().mockResolvedValueOnce({rows:[{
   id:payment.order_id,customer_id:'customer-id',total:'145.00',
   payment_status:'pending',payment_method:'cod'
  }]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  await expect(initiatePayment({
   orderId:payment.order_id,method:'wallet',amount:145,customerId:'customer-id'
  })).rejects.toMatchObject({statusCode:409,code:'PAYMENT_METHOD_MISMATCH'});
  expect(clientQuery).toHaveBeenCalledTimes(1);
  expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO payments|INSERT INTO transactions/i.test(sql))).toBe(false);
 });

 test('rejects Cash on Delivery initiation when the saved order selected DAHA Wallet',async()=>{
  const clientQuery=jest.fn().mockResolvedValueOnce({rows:[{
   id:payment.order_id,customer_id:'customer-id',total:'145.00',
   payment_status:'pending',payment_method:'wallet'
  }]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  await expect(initiatePayment({
   orderId:payment.order_id,method:'cod',amount:145,customerId:'customer-id'
  })).rejects.toMatchObject({statusCode:409,code:'PAYMENT_METHOD_MISMATCH'});
  expect(clientQuery).toHaveBeenCalledTimes(1);
 });

 test('mobile-money method is recognized but blocked until Modem Pay and webhook are configured',async()=>{
  await expect(initiatePayment({orderId:payment.order_id,method:'wave',amount:145,customerId:'customer-id',accountNumber:'871234567'}))
   .rejects.toMatchObject({statusCode:503,code:'PROVIDER_UNAVAILABLE'});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('validates the full nine-digit national number and sends seven subscriber digits to Modem Pay H2H',async()=>{
  modemPay.isConfigured.mockReturnValue(true);
  modemPay.isWebhookConfigured.mockReturnValue(true);
  modemPay.isH2H.mockReturnValue(true);
  modemPay.isH2HApproved.mockReturnValue(true);
  modemPay.createPaymentIntent.mockResolvedValue({reference:'provider-ref-1',status:'pending',nextStep:{}});
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:payment.order_id,customer_id:'customer-id',total:'145.00',payment_status:'pending',payment_method:'wave'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{id:'payment-new',status:'pending',amount:'145.00'}]});
  withTransaction.mockImplementation(async work=>work({query:clientQuery}));
  query.mockResolvedValueOnce({rows:[{id:'payment-new',status:'pending',amount:'145.00'}]});
  await initiatePayment({orderId:payment.order_id,method:'wave',amount:145,customerId:'customer-id',accountNumber:'871234567'});
  expect(modemPay.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({network:'wave',accountNumber:'1234567'}));
 });

 test('rejects a seven-digit customer mobile number for direct H2H checkout',async()=>{
  modemPay.isConfigured.mockReturnValue(true);
  modemPay.isWebhookConfigured.mockReturnValue(true);
  modemPay.isH2H.mockReturnValue(true);
  modemPay.isH2HApproved.mockReturnValue(true);
  await expect(initiatePayment({orderId:payment.order_id,method:'wave',amount:145,customerId:'customer-id',accountNumber:'1234567'}))
   .rejects.toMatchObject({statusCode:400,code:'INVALID_ACCOUNT_NUMBER'});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('only an Admin can confirm collected COD cash',async()=>{
  await expect(confirmPayment(payment.id,'vendor-id',['vendor']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  expect(withTransaction).not.toHaveBeenCalled();
  expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
 });
 test('does not expose another customer\'s already-confirmed mobile-money payment',async()=>{
  const confirmed={...payment,method:'wave',status:'confirmed'};
  query.mockResolvedValueOnce({rows:[{...confirmed,customer_id:'another-customer'}]});
  await expect(confirmPayment(payment.id,'attacker',['customer']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('allows the owning customer to read their already-confirmed payment',async()=>{
  const confirmed={...payment,method:'wave',status:'confirmed'};
  query.mockResolvedValueOnce({rows:[{...confirmed,customer_id:'owner-customer'}]});
  await expect(confirmPayment(payment.id,'owner-customer',['customer']))
   .resolves.toMatchObject({id:payment.id,status:'confirmed'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('refuses to confirm COD before the order is delivered',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.includes('FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1'))return{rows:[{...payment,customer_id:deliveredOrder.customer_id}]};
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
  expect(transactionQuery.mock.calls[1][0]).toContain('orders WHERE id=$1 FOR UPDATE');
  expect(transactionQuery.mock.calls[2][0]).toContain('payments WHERE id=$1 AND order_id=$2 FOR UPDATE');
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
 test('requires a receipt file before accepting a rider cash remittance',async()=>{
  await expect(submitCodCashRemittance({
   paymentId:payment.id,riderId:'44444444-4444-4444-8444-444444444444',
   providerReference:'WAVE-RECEIPT-1',depositMethod:'wave'
  })).rejects.toMatchObject({statusCode:400,code:'COD_REMITTANCE_PROOF_REQUIRED'});
  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('rejects a receipt file that was not uploaded by the submitting rider',async()=>{
  query.mockResolvedValue({rows:[]});
  await expect(submitCodCashRemittance({
   paymentId:payment.id,riderId:'44444444-4444-4444-8444-444444444444',
   providerReference:'WAVE-RECEIPT-2',depositMethod:'wave',
   proofFileId:'55555555-5555-4555-8555-555555555555'
  })).rejects.toMatchObject({statusCode:403,code:'COD_REMITTANCE_PROOF_INVALID'});
  expect(withTransaction).toHaveBeenCalledTimes(1);
  expect(transactionQuery).toHaveBeenCalledTimes(1);
  expect(transactionQuery.mock.calls[0][0]).toContain('uploaded_by=$2');
  expect(transactionQuery.mock.calls[0][0]).toContain('FOR UPDATE');
 });
});
