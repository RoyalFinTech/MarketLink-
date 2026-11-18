// src/modules/payments/service.js
'use strict';
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const modemPay = require('../../integrations/modempay');
const ordersService = require('../orders/service');
const dahaWalletService = require('../wallets/service');

const modemAdapter = {
  name: 'modempay',
  charge: async ({ amount, currency, metadata, idempotencyKey, method, accountNumber }) => {
    const result = await modemPay.createPaymentIntent({
      amount, currency,
      metadata: { ...metadata, payment_method: method },
      title: 'MarketLink Order Payment',
      description: 'Payment for MarketLink order ' + metadata.orderId,
      returnUrl: process.env.MODEM_PAY_RETURN_URL,
      cancelUrl: process.env.MODEM_PAY_CANCEL_URL,
      callbackUrl: process.env.MODEM_PAY_CALLBACK_URL,
      network: method,
      accountNumber,
      idempotencyKey,
    });
    return {
      reference: result.reference,
      paymentIntentId: result.paymentIntentId,
      paymentLink: result.paymentLink,
      authorizationUrl: result.paymentLink,
      intentSecret: result.intentSecret,
      nextStep: result.nextStep || null,
      status: result.status || null,
      providerStatus: result.status || null,
    };
  },
  refund: async () => { throw new AppError('Refund processing is not enabled in MarketLink yet.', 503, 'PROVIDER_UNAVAILABLE'); },
  verify: async () => { throw new AppError('Payments are confirmed only through verified payment notifications or status checks.', 409, 'WEBHOOK_CONFIRMATION_REQUIRED'); },
};
const stripeAdapter = { name:'stripe', charge:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const paystackAdapter = { name:'paystack', charge:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const flutterwaveAdapter = { name:'flutterwave', charge:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const PROVIDERS = { modempay:modemAdapter, wave:modemAdapter, afrimoney:modemAdapter, qmoney:modemAdapter, stripe:stripeAdapter, paystack:paystackAdapter, flutterwave:flutterwaveAdapter };
async function checkIdempotency(key){const {rows}=await query("SELECT * FROM payments WHERE provider_ref = $1 AND status IN ('confirmed','pending')",[key]);return rows.length?rows[0]:null;}
async function releaseOrderInventoryAfterPaymentFailure(orderId, reason){return withTransaction(async(client)=>{const {rows:[order]}=await client.query('SELECT id,status,payment_status FROM orders WHERE id=$1 FOR UPDATE',[orderId]);if(!order)return{released:false,reason:'ORDER_NOT_FOUND'};if(order.payment_status==='confirmed')return{released:false,reason:'PAYMENT_ALREADY_CONFIRMED'};if(!['pending','accepted','preparing','awaiting_rider'].includes(order.status))return{released:false,reason:'ORDER_NOT_RELEASEABLE'};const {rows:items}=await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);for(const item of items)await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND variant_id IS NULL',[item.quantity,item.product_id]);await client.query("UPDATE orders SET status='cancelled',cancellation_reason=$2 WHERE id=$1",[orderId,reason||'Payment initiation failed; inventory released.']);await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES($1,'cancelled',$2)",[orderId,reason||'Payment initiation failed; inventory released.']);await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')",[orderId]);return{released:true};});}


async function payOrderFromDahaWallet({ orderId, requestedAmount, customerId }) {
  return withTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT id,customer_id,total,payment_status FROM orders WHERE id=$1 AND customer_id=$2 FOR UPDATE',
      [orderId, customerId]
    );
    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');

    const { rows: [existing] } = await client.query(
      "SELECT * FROM payments WHERE order_id=$1 AND method='wallet' AND status='confirmed' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [orderId]
    );
    if (existing) return { payment: existing, action: 'wallet_paid', status: 'confirmed', existing: true };
    if (order.payment_status === 'confirmed') throw new AppError('This order has already been paid.', 409, 'ALREADY_PAID');
    if (Math.abs(requestedAmount - Number(order.total)) > 0.01) {
      throw new AppError('Payment amount does not match the order total.', 400, 'AMOUNT_MISMATCH');
    }

    await client.query(
      "INSERT INTO wallets (user_id,balance,currency) VALUES ($1,0,'GMD') ON CONFLICT (user_id) DO NOTHING",
      [customerId]
    );
    const { rows: [wallet] } = await client.query(
      'SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE',
      [customerId]
    );
    if (!wallet) throw new AppError('DAHA Wallet is not available for this account.', 404, 'WALLET_NOT_FOUND');

    const { rows: [pending] } = await client.query(
      "SELECT COALESCE(SUM(amount),0) AS amount FROM withdrawals WHERE user_id=$1 AND status IN ('processing','payout_pending')",
      [customerId]
    );
    const available = Number(wallet.balance) - Number(pending?.amount || 0);
    if (available + 0.0001 < requestedAmount) {
      throw new AppError(
        'Insufficient DAHA Wallet balance. Available: D ' + Math.max(0,available).toFixed(2) +
        '. Deposit funds into DAHA Wallet, then retry checkout.',
        400,
        'INSUFFICIENT_WALLET_BALANCE'
      );
    }

    const paymentId = crypto.randomUUID();
    const providerRef = 'daha-wallet-' + paymentId;
    const { rows: [payment] } = await client.query(
      "INSERT INTO payments (id,order_id,method,provider_ref,amount,currency,status,paid_at) VALUES ($1,$2,'wallet',$3,$4,'GMD','confirmed',now()) RETURNING *",
      [paymentId, orderId, providerRef, requestedAmount]
    );
    const { rows: [debitedWallet] } = await client.query(
      'UPDATE wallets SET balance=balance-$1,updated_at=now() WHERE id=$2 RETURNING balance',
      [requestedAmount, wallet.id]
    );
    const nextBalance = Number(debitedWallet.balance);
    await client.query(
      "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'debit','purchase',$2,$3,'order',$4,'DAHA Wallet payment for MarketLink order')",
      [wallet.id,requestedAmount,nextBalance,orderId]
    );
    await client.query("UPDATE orders SET payment_status='confirmed' WHERE id=$1",[orderId]);
    await client.query(
      "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'payment_confirmed','DAHA Wallet payment complete',$2,'payment',$3)",
      [customerId,'Your DAHA Wallet payment of D ' + requestedAmount.toFixed(2) + ' is confirmed.',paymentId]
    );
    return { payment, action: 'wallet_paid', status: 'confirmed', walletBalance: nextBalance };
  });
}

async function initiatePayment({ orderId, method, amount, currency='GMD', customerId, accountNumber }) {
  if (!['cod','wallet','wave','afrimoney','qmoney','modempay'].includes(String(method || '').toLowerCase())) {
    throw new AppError('Choose Cash on Delivery, DAHA Wallet, Wave, AfriMoney or QMoney.', 400, 'UNSUPPORTED_METHOD');
  }
  method = String(method).toLowerCase();
  const requestedAmount = Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new AppError('Payment amount must be greater than zero.', 400, 'INVALID_AMOUNT');
  if (String(currency || 'GMD').toUpperCase() !== 'GMD') throw new AppError('MarketLink checkout currently supports Gambian Dalasi (GMD).', 400, 'INVALID_CURRENCY');

  if (method === 'wallet') {
    return payOrderFromDahaWallet({ orderId, requestedAmount, customerId });
  }
  if(method!=='cod'&&(!modemPay.isConfigured()||!modemPay.isWebhookConfigured())) throw new AppError('Secure mobile-money checkout is not available yet. Choose Pay on Delivery or DAHA Wallet.',503,'PROVIDER_UNAVAILABLE');
  if(method!=='cod'&&modemPay.isH2H()&&!modemPay.isH2HApproved()) throw new AppError('Direct mobile-money checkout is not available yet. Choose Pay on Delivery or DAHA Wallet.',503,'PROVIDER_UNAVAILABLE');
  if(modemPay.isH2H()&&!['cod','wave','afrimoney','qmoney'].includes(method)) throw new AppError('Choose Wave, AfriMoney or QMoney for direct mobile-money checkout.',400,'UNSUPPORTED_METHOD');
  if (method!=='cod'&&!modemPay.isH2H()&&requestedAmount<10) throw new AppError('Mobile-money checkout requires a minimum payment of D 10.00.',400,'BELOW_PROVIDER_MINIMUM');

  // Reserve a pending payment while holding the order lock, so two requests cannot
  // both start a provider charge for the same order and method.
  const reservation = await withTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT id, customer_id, total, payment_status FROM orders WHERE id=$1 AND customer_id=$2 FOR UPDATE',
      [orderId, customerId]
    );
    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    if (order.payment_status === 'confirmed') throw new AppError('Order is already paid.', 400, 'ALREADY_PAID');
    if (Math.abs(requestedAmount - Number(order.total)) > 0.01) throw new AppError('Payment amount does not match the order total.', 400, 'AMOUNT_MISMATCH');

    const { rows: [existing] } = await client.query(
      "SELECT * FROM payments WHERE order_id=$1 AND method=$2 AND status IN ('pending','confirmed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [orderId, method]
    );
    if (existing) return { existing, order };

    if (method === 'cod') {
      const { rows: [payment] } = await client.query(
        "INSERT INTO payments (order_id, method, amount, currency, status) VALUES ($1,'cod',$2,'GMD','pending') RETURNING *",
        [orderId, requestedAmount]
      );
      return { payment, order, cashOnDelivery: true };
    }

    const paymentId = crypto.randomUUID();
    const idempotencyKey = 'marketlink-payment-' + paymentId;
    const { rows: [payment] } = await client.query(
      "INSERT INTO payments (id, order_id, method, provider_ref, amount, currency, status) VALUES ($1,$2,$3,$4,$5,'GMD','pending') RETURNING *",
      [paymentId, orderId, method, idempotencyKey, requestedAmount]
    );
    return { payment, order, idempotencyKey };
  });

  if (reservation.existing) {
    return {
      existing: true,
      payment: reservation.existing,
      action: reservation.existing.status === 'confirmed' ? 'confirmed' : 'pending',
    };
  }
  if (reservation.cashOnDelivery) return { payment: reservation.payment, action: 'cod_pending' };

  const payment = reservation.payment;
  const provider = PROVIDERS[method];
  if (!provider) {
    await query("UPDATE payments SET status='failed' WHERE id=$1", [payment.id]);
    throw new AppError('Payment method is not supported.', 400, 'UNSUPPORTED_METHOD');
  }

  let chargeResult;
  try {
    chargeResult = await provider.charge({
      amount: requestedAmount,
      currency: 'GMD',
      method,
      accountNumber,
      idempotencyKey: reservation.idempotencyKey,
      metadata: { orderId, customerId, paymentId: payment.id },
    });
  } catch (err) {
    if(err&&err.code==='MODEM_PAY_NETWORK_ERROR'){
      logger.warn('Modem Pay initiation outcome is unknown; keeping payment pending for reconciliation',{paymentId:payment.id,orderId,method});
      const {rows:[pendingAttempt]}=await query('SELECT * FROM payments WHERE id=$1',[payment.id]);
      return {payment:pendingAttempt||payment,action:'continue',status:'pending',providerStatus:'unknown'};
    }
    try { await query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [payment.id]); }
    catch (updateErr) { logger.error('Could not mark failed payment attempt',{paymentId:payment.id,error:updateErr.message}); }
    if (err && ((err.code === 'PROVIDER_UNAVAILABLE') || (Number(err.status) >= 400 && Number(err.status) < 500))) {
      try { await releaseOrderInventoryAfterPaymentFailure(orderId, err.error || 'Payment initiation failed.'); }
      catch (releaseErr) { logger.error('Failed to release inventory after payment initiation failure',{orderId,error:releaseErr.message}); }
    }
    throw err;
  }

  const { rows: [updatedPayment] } = await query(
    "UPDATE payments SET provider_ref=$2 WHERE id=$1 RETURNING *",
    [payment.id, String(chargeResult.reference || reservation.idempotencyKey)]
  );

  const nextStep = chargeResult.nextStep || null;
  const redirectUrl = chargeResult.paymentLink || chargeResult.authorizationUrl || null;
  if (modemPay.isH2H()) {
    return {
      payment: updatedPayment,
      action: nextStep && nextStep.openExternal && (nextStep.launch_url || redirectUrl) ? 'redirect' : 'continue',
      redirectUrl,
      nextStep,
      providerStatus: chargeResult.status || chargeResult.providerStatus || 'pending',
    };
  }
  return {
    payment: updatedPayment,
    action: 'redirect',
    redirectUrl,
    providerStatus: chargeResult.status || chargeResult.providerStatus || 'pending',
  };
}
async function findOwnedPayment(paymentId, actorId, roles) {
  const { rows: [payment] } = await query(
    'SELECT p.*, o.customer_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1',
    [paymentId]
  );
  if (!payment) throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!isAdmin && String(payment.customer_id)!==String(actorId)) throw new AppError('You are not allowed to view this payment.',403,'FORBIDDEN');
  return payment;
}

async function continuePayment(paymentId, { action, pin }, actorId, roles) {
  const payment = await findOwnedPayment(paymentId, actorId, roles);
  if (payment.status === 'confirmed') return { payment, status:'completed', confirmed:true };
  if (payment.status !== 'pending') throw new AppError('This payment attempt is no longer active. Start a new payment from checkout.',409,'PAYMENT_NOT_ACTIVE');
  if (!modemPay.isH2H()) throw new AppError('This payment requires the secure hosted checkout selected for this transaction.',409,'PAYMENT_FLOW_MISMATCH');

  let providerResponse;
  if (action === 'confirm') providerResponse = await modemPay.confirmCharge(payment.provider_ref);
  else if (action === 'pin') providerResponse = await modemPay.finalizeCharge(payment.provider_ref, pin);
  else throw new AppError('Choose a valid payment confirmation action.',400,'INVALID_PAYMENT_ACTION');

  // A confirm/finalize response is not proof that the customer has paid. Reconcile
  // against the provider transaction endpoint, then wait for the signed webhook if pending.
  let statusData = null;
  try { statusData = await getPaymentStatus(paymentId, actorId, roles); }
  catch (err) {
    logger.warn('Modem Pay status check deferred after customer confirmation',{paymentId,error:err.message});
  }
  return {
    submitted:true,
    providerStatus:String((providerResponse && providerResponse.status) || 'processing').toLowerCase(),
    status:statusData ? statusData.status : 'pending',
    payment:statusData ? statusData.payment : payment,
  };
}

async function getPaymentStatus(paymentId, actorId, roles) {
  let payment = await findOwnedPayment(paymentId, actorId, roles);
  if (payment.status !== 'pending' || !modemPay.isH2H()) {
    return { payment, status:payment.status === 'confirmed' ? 'completed' : payment.status };
  }

  const transaction = await modemPay.getTransaction(payment.provider_ref);
  const providerStatus = String(transaction && transaction.status || 'pending').toLowerCase();
  const nextStep = transaction && (transaction.next_step || transaction.nextStep) || {
    openExternal: Boolean(transaction && (transaction.open_external || transaction.openExternal)),
    launch_url: transaction && (transaction.launch_url || transaction.payment_link) || null,
    auth_mode: transaction && (transaction.auth_mode || transaction.authMode) || null,
    auth_length: transaction && (transaction.auth_length || transaction.authLength) || null,
    confirmation_steps: transaction && (transaction.confirmation_steps || transaction.confirmationSteps) || null
  };
  if (providerStatus === 'completed') {
    const amount = Number(transaction.amount);
    const currency = String(transaction.currency || '').toUpperCase();
    const metadataOrderId = transaction.metadata && transaction.metadata.orderId;
    if (!Number.isFinite(amount) || Math.abs(amount - Number(payment.amount)) > 0.01 || currency !== 'GMD') {
      logger.error('Modem Pay transaction mismatch during status reconciliation',{
        paymentId,orderId:payment.order_id,expectedAmount:payment.amount,receivedAmount:transaction.amount,
        expectedCurrency:payment.currency,receivedCurrency:transaction.currency,
      });
      throw new AppError('The provider transaction does not match this order. MarketLink has not marked it as paid.',409,'PAYMENT_RECONCILIATION_MISMATCH');
    }
    if (metadataOrderId && String(metadataOrderId) !== String(payment.order_id)) {
      logger.error('Modem Pay transaction reference does not match order',{paymentId,orderId:payment.order_id,providerOrderId:metadataOrderId});
      throw new AppError('The provider transaction does not match this order.',409,'PAYMENT_RECONCILIATION_MISMATCH');
    }
    payment = await markPaymentConfirmed(paymentId);
    try { await ordersService.settleOrderFinancials(payment.order_id); }
    catch (e) { logger.warn('Settlement deferred after payment status reconciliation',{paymentId,orderId:payment.order_id,error:e.message}); }
    return { payment, status:'completed', providerStatus };
  }

  if (['failed','cancelled','abandoned','expired'].includes(providerStatus)) {
    await query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'",[paymentId]);
    try { await releaseOrderInventoryAfterPaymentFailure(payment.order_id,'The payment provider reported '+providerStatus+'.'); }
    catch (e) { logger.error('Could not release inventory after provider failure',{paymentId,orderId:payment.order_id,error:e.message}); }
    payment = await findOwnedPayment(paymentId, actorId, roles);
    return { payment, status:'failed', providerStatus };
  }
  return { payment, status:providerStatus === 'processing' ? 'processing' : 'pending', providerStatus, nextStep, redirectUrl:nextStep && nextStep.launch_url || null };
}

async function confirmPayment(paymentId,actorId,roles){
  const {rows:[payment]}=await query('SELECT * FROM payments WHERE id = $1',[paymentId]);
  if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');
  const roleList=Array.isArray(roles)?roles:[];
  const isAdmin=roleList.some(r=>['admin','super_admin'].includes(r));
  if(payment.method==='cod'){
    if(!isAdmin)throw new AppError('Only admins can confirm collected cash for Pay on Delivery orders.',403,'FORBIDDEN');
    const {rows:[remittance]}=await query("SELECT status FROM cod_cash_remittances WHERE payment_id=$1",[paymentId]);
    if(!remittance||remittance.status!=='verified')throw new AppError('Verify the rider’s Wave or AfriMoney cash deposit reference before confirming this Pay on Delivery payment.',409,'COD_REMITTANCE_NOT_VERIFIED');
    const {rows:[order]}=await query('SELECT status FROM orders WHERE id=$1',[payment.order_id]);
    if(!order||order.status!=='delivered'){
      throw new AppError('COD cash can only be reconciled after the order is marked delivered.',409,'COD_NOT_DELIVERED');
    }
    const actor={
      userId:actorId,
      role:roleList.includes('super_admin')?'super_admin':'admin'
    };
    const confirmed=payment.status==='confirmed'?payment:await markPaymentConfirmed(paymentId,actor);
    // COD confirmations run after delivery. Do not hide a confirmed payment if
    // settlement fails: the Admin queue includes confirmed-but-unsettled items
    // so this path can safely retry without creating another wallet credit.
    const settlement=await ordersService.settleOrderFinancials(payment.order_id);
    return {payment:confirmed,settlement};
  }
  if(payment.status==='confirmed')return payment;
  if(PROVIDERS[payment.method]&&PROVIDERS[payment.method]!==modemAdapter){
    await PROVIDERS[payment.method].verify(payment.provider_ref);
  }else{
    throw new AppError('This payment is confirmed by the payment service notification.',409,'WEBHOOK_CONFIRMATION_REQUIRED');
  }
  const confirmed=await markPaymentConfirmed(paymentId);
  try{
    await ordersService.settleOrderFinancials(payment.order_id);
  }catch(e){
    logger.warn('Settlement deferred after payment confirmation',{paymentId,orderId:payment.order_id,error:e.message});
  }
  return confirmed;
}

async function listPendingCodPayments({page=1,limit=30}={}){
  const page_=Math.max(parseInt(page)||1,1);
  const limit_=Math.min(Math.max(parseInt(limit)||30,1),100);
  const offset=(page_-1)*limit_;
  const {rows}=await query(
    `SELECT p.id AS payment_id,p.amount,p.currency,p.status AS payment_record_status,p.created_at,
            o.id AS order_id,o.order_number,o.total,o.status AS order_status,
            o.payment_status,o.placed_at,r.id AS remittance_id,r.status AS remittance_status,
            customer.full_name AS customer_name,
            v.business_name AS vendor_name,
            d.status AS delivery_status,
            rider.full_name AS rider_name
     FROM payments p
     JOIN orders o ON o.id=p.order_id
     JOIN users customer ON customer.id=o.customer_id
     LEFT JOIN vendors v ON v.user_id=o.vendor_id
     LEFT JOIN deliveries d ON d.order_id=o.id
     LEFT JOIN users rider ON rider.id=d.rider_id
     LEFT JOIN commission_records cr ON cr.order_id=o.id
     LEFT JOIN cod_cash_remittances r ON r.payment_id=p.id
     WHERE p.method='cod'
       AND o.status='delivered'
       AND (
         p.status='pending'
         OR (p.status='confirmed' AND COALESCE(cr.status,'')<>'paid')
       )
     ORDER BY p.created_at ASC
     LIMIT $1 OFFSET $2`,
    [limit_,offset]
  );
  return rows;
}


function getCodRemittanceInstructions(){
  const waveNumber=String(process.env.MARKETLINK_COD_WAVE_ACCOUNT_NUMBER||'').replace(/\D/g,'');
  const waveName=String(process.env.MARKETLINK_COD_WAVE_ACCOUNT_NAME||'').trim();
  const afriNumber=String(process.env.MARKETLINK_COD_AFRIMONEY_ACCOUNT_NUMBER||'').replace(/\D/g,'');
  const afriName=String(process.env.MARKETLINK_COD_AFRIMONEY_ACCOUNT_NAME||'').trim();
  const validNumber=value=>/^(87|86|83)\d{7}$/.test(value);
  return {
    currency:'GMD',
    methods:{
      wave:{configured:validNumber(waveNumber)&&!!waveName,accountNumber:validNumber(waveNumber)?waveNumber:null,accountName:waveName||null},
      afrimoney:{configured:validNumber(afriNumber)&&!!afriName,accountNumber:validNumber(afriNumber)?afriNumber:null,accountName:afriName||null}
    }
  };
}

async function submitCodCashRemittance({paymentId,riderId,providerReference,depositMethod='wave',proofFileId}){
  const reference=String(providerReference||'').trim();
  if(reference.length<4||reference.length>120)throw new AppError('Enter the Wave deposit reference from your receipt.',400,'COD_REMITTANCE_REFERENCE_REQUIRED');
  const method=String(depositMethod||'wave').toLowerCase();
  if(!['wave','afrimoney'].includes(method))throw new AppError('Choose Wave or AfriMoney for the cash remittance.',400,'COD_REMITTANCE_METHOD_INVALID');
  const destination=getCodRemittanceInstructions().methods[method];
  if(!destination||!destination.configured)throw new AppError('MarketLink has not published a verified collection account for this deposit method yet. Contact Admin before sending cash.',503,'COD_REMITTANCE_DESTINATION_NOT_CONFIGURED');
  if(!proofFileId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(proofFileId)))throw new AppError('Upload a clear receipt image or PDF before submitting the cash remittance.',400,'COD_REMITTANCE_PROOF_REQUIRED');
  const proofUrl=String(process.env.API_PUBLIC_URL||process.env.PUBLIC_API_URL||process.env.RENDER_EXTERNAL_URL||'https://marketlink-gambia.onrender.com').replace(/\/+$/,'')+'/api/v1/uploads/'+proofFileId+'/content';
  return withTransaction(async(client)=>{
    // Serialize receipt submission against deletion. Whichever operation locks
    // the file row first wins; a deleted file can never be attached afterwards.
    const {rows:[file]}=await client.query(
      "SELECT id FROM file_uploads WHERE id=$1 AND uploaded_by=$2 AND purpose='cod-remittance-document' AND deleted_at IS NULL FOR UPDATE",
      [proofFileId,riderId]
    );
    if(!file)throw new AppError('The receipt file could not be verified. Upload it again from this rider account.',403,'COD_REMITTANCE_PROOF_INVALID');
    const {rows:[payment]}=await client.query(
      `SELECT p.id,p.order_id,p.amount,p.currency,p.method,p.status AS payment_status,
              o.status AS order_status,o.payment_status AS order_payment_status,
              d.id AS delivery_id,d.rider_id,d.status AS delivery_status
       FROM payments p JOIN orders o ON o.id=p.order_id
       JOIN deliveries d ON d.order_id=o.id
       WHERE p.id=$1 FOR UPDATE OF p,o,d`,[paymentId]);
    if(!payment)throw new AppError('Pay on Delivery payment not found.',404,'COD_PAYMENT_NOT_FOUND');
    if(payment.method!=='cod')throw new AppError('This order is not a Pay on Delivery order.',400,'COD_METHOD_REQUIRED');
    if(String(payment.rider_id)!==String(riderId))throw new AppError('Only the rider assigned to this order can submit its cash remittance.',403,'COD_REMITTANCE_FORBIDDEN');
    if(payment.order_status!=='delivered'||payment.delivery_status!=='delivered')throw new AppError('Mark the delivery complete before submitting the cash remittance.',409,'COD_REMITTANCE_NOT_DELIVERED');
    if(payment.payment_status==='confirmed'||payment.order_payment_status==='confirmed')throw new AppError('This order payment has already been confirmed.',409,'COD_ALREADY_CONFIRMED');
    const amount=Number(payment.amount);
    const {rows:[existing]}=await client.query('SELECT * FROM cod_cash_remittances WHERE payment_id=$1 FOR UPDATE',[paymentId]);
    if(existing&&existing.status!=='rejected')return existing;
    if(existing){
      const {rows:[updated]}=await client.query(
        `UPDATE cod_cash_remittances SET rider_id=$1,amount=$2,deposit_method=$3,
          provider_reference=$4,proof_url=$5,status='submitted',submitted_at=now(),
          reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,updated_at=now()
         WHERE id=$6 RETURNING *`,
        [riderId,amount,method,reference,proofUrl||null,existing.id]);
      return updated;
    }
    const {rows:[created]}=await client.query(
      `INSERT INTO cod_cash_remittances
        (payment_id,order_id,rider_id,amount,deposit_method,provider_reference,proof_url)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [paymentId,payment.order_id,riderId,amount,method,reference,proofUrl||null]);
    return created;
  });
}

async function listMyCodCashRemittances(riderId,{page=1,limit=20}={}){
  const page_=Math.max(parseInt(page,10)||1,1),limit_=Math.min(Math.max(parseInt(limit,10)||20,1),50),offset=(page_-1)*limit_;
  const {rows}=await query(
    `SELECT r.id,r.order_id,r.payment_id,r.amount,r.currency,r.deposit_method,
            r.provider_reference,r.proof_url,r.status,r.submitted_at,r.reviewed_at,r.review_note,
            o.order_number
     FROM cod_cash_remittances r JOIN orders o ON o.id=r.order_id
     WHERE r.rider_id=$1 ORDER BY r.submitted_at DESC LIMIT $2 OFFSET $3`,
    [riderId,limit_,offset]);
  return rows;
}

async function listCodCashRemittances({page=1,limit=30,status='submitted'}={}){
  const page_=Math.max(parseInt(page,10)||1,1),limit_=Math.min(Math.max(parseInt(limit,10)||30,1),100),offset=(page_-1)*limit_;
  const allowed=['submitted','verified','rejected','all'];
  const filter=allowed.includes(String(status))?String(status):'submitted';
  const selectSql=`SELECT r.id,r.payment_id,r.order_id,r.rider_id,r.amount,r.currency,r.deposit_method,
            r.provider_reference,r.proof_url,r.status,r.submitted_at,r.reviewed_at,r.review_note,
            o.order_number,o.total,o.status AS order_status,o.payment_status,
            rider.full_name AS rider_name,v.business_name AS vendor_name
     FROM cod_cash_remittances r JOIN orders o ON o.id=r.order_id
     JOIN users rider ON rider.id=r.rider_id
     LEFT JOIN vendors v ON v.user_id=o.vendor_id`;
  // Keep each placeholder layout explicit. This avoids dynamically numbered
  // LIMIT/OFFSET placeholders drifting from the selected status filter.
  const {rows}=filter==='all'
    ? await query(selectSql+` ORDER BY r.submitted_at ASC LIMIT $1 OFFSET $2`,[limit_,offset])
    : await query(selectSql+` WHERE r.status=$1 ORDER BY r.submitted_at ASC LIMIT $2 OFFSET $3`,[filter,limit_,offset]);
  return rows;
}

async function verifyCodCashRemittance(remittanceId,actor,decision='verified',note=''){
  if(!['verified','rejected'].includes(decision))throw new AppError('Invalid cash remittance decision.',400,'COD_REMITTANCE_DECISION_INVALID');
  const {rows:[remittance]}=await withTransaction(async(client)=>{
    const {rows:[r]}=await client.query(
      'SELECT * FROM cod_cash_remittances WHERE id=$1 FOR UPDATE',[remittanceId]);
    if(!r)throw new AppError('Cash remittance record not found.',404,'COD_REMITTANCE_NOT_FOUND');
    const {rows:[paymentCheck]}=await client.query(
      `SELECT p.method,p.amount,p.status AS payment_status,o.status AS order_status,
              d.status AS delivery_status,d.rider_id
       FROM payments p JOIN orders o ON o.id=p.order_id
       JOIN deliveries d ON d.order_id=o.id
       WHERE p.id=$1 FOR UPDATE OF p,o,d`,[r.payment_id]);
    if(!paymentCheck||paymentCheck.method!=='cod')throw new AppError('The linked COD payment could not be validated.',409,'COD_PAYMENT_INVALID');
    if(Math.abs(Number(paymentCheck.amount)-Number(r.amount))>0.01)throw new AppError('The remittance amount no longer matches the order payment.',409,'COD_REMITTANCE_AMOUNT_MISMATCH');
    if(paymentCheck.order_status!=='delivered'||paymentCheck.delivery_status!=='delivered')throw new AppError('The order must remain delivered before its cash remittance can be verified.',409,'COD_REMITTANCE_NOT_DELIVERED');
    if(String(paymentCheck.rider_id)!==String(r.rider_id))throw new AppError('The remittance rider no longer matches the assigned delivery rider.',409,'COD_REMITTANCE_RIDER_MISMATCH');
    if(r.status===decision)return{rows:[r]};
    if(r.status!=='submitted')throw new AppError('This remittance has already been reviewed.',409,'COD_REMITTANCE_ALREADY_REVIEWED');
    const {rows:[updated]}=await client.query(
      `UPDATE cod_cash_remittances SET status=$1,reviewed_by=$2,reviewed_at=now(),
        review_note=$3,updated_at=now() WHERE id=$4 RETURNING *`,
      [decision,actor.id,String(note||'').trim().slice(0,500)||null,remittanceId]);
    await client.query(
      `INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data)
       VALUES($1,$2,$3,'cod_cash_remittance',$4,$5)`,
      [actor.id,actor.role||'admin','payment.cod_remittance_'+decision,remittanceId,
       JSON.stringify({paymentId:r.payment_id,orderId:r.order_id,amount:Number(r.amount),reference:r.provider_reference,note:String(note||'').trim().slice(0,500)})]);
    return{rows:[updated]};
  });
  if(decision==='rejected')return{remittance,settlement:null};
  const {rows:[payment]}=await query('SELECT * FROM payments WHERE id=$1',[remittance.payment_id]);
  if(!payment)throw new AppError('Payment record is missing. The remittance is verified but payment confirmation needs Admin attention.',409,'COD_PAYMENT_MISSING');
  const confirmed=payment.status==='confirmed'?payment:await markPaymentConfirmed(payment.id,{userId:actor.id,role:actor.role||'admin'});
  const settlement=await ordersService.settleOrderFinancials(remittance.order_id);
  return{remittance,payment:confirmed,settlement};
}

async function markPaymentConfirmed(paymentId,actor=null){
  return withTransaction(async(client)=>{
    const {rows:[payment]}=await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[paymentId]);
    if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');
    if(payment.status==='confirmed')return payment;
    const {rows:[updated]}=await client.query(
      `UPDATE payments SET status='confirmed',paid_at=now() WHERE id=$1 RETURNING *`,
      [paymentId]
    );
    await client.query("UPDATE orders SET payment_status='confirmed' WHERE id=$1",[payment.order_id]);
    const {rows:[order]}=await client.query(
      'SELECT customer_id,total,status,order_number FROM orders WHERE id=$1',
      [payment.order_id]
    );
    if(order){
      await client.query(
        `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
         VALUES ($1,'payment_confirmed','Payment Confirmed ✅',$2,'payment',$3)`,
        [order.customer_id,'Your payment of D '+order.total+' has been confirmed.',paymentId]
      );
    }
    // Cash collection is an offline event, so retain an actor and order snapshot
    // in the same transaction as the payment confirmation.
    if(payment.method==='cod'&&actor&&actor.userId){
      await client.query(
        `INSERT INTO admin_action_logs
           (actor_id,actor_role,action,entity_type,entity_id,after_data)
         VALUES ($1,$2,'payment.cod_cash_confirmed','payment',$3,$4)`,
        [actor.userId,actor.role,paymentId,JSON.stringify({
          order_id:payment.order_id,
          order_number:order&&order.order_number||null,
          amount:Number(payment.amount),
          currency:payment.currency||'GMD',
          order_status:order&&order.status||null
        })]
      );
    }
    logger.info('Payment confirmed',{paymentId,orderId:payment.order_id,method:payment.method});
    return updated;
  });
}
async function processWebhook({ event, rawBody }) {
  if (String(event?.event || '').startsWith('transfer.')) {
    const withdrawalsSvc = require('../withdrawals/service');
    return withdrawalsSvc.processProviderWebhook(event);
  }
  if (!event || !event.event) throw new AppError('Invalid payment event.', 400, 'INVALID_WEBHOOK');

  const eventType = String(event.event);
  const payload = event.payload || {};
  const metadata = payload.metadata || {};
  const providerRefs = [
    payload.payment_intent_id,
    payload.paymentIntentId,
    payload.id,
    payload.transaction_reference,
    payload.transaction_id,
    payload.transactionId,
    payload.reference,
  ].filter(Boolean).map(String);
  const eventKey = payload.transaction_reference || payload.id || payload.payment_intent_id ||
    crypto.createHash('sha256').update(rawBody || JSON.stringify(event)).digest('hex');
  const eventId = String(eventType + ':' + eventKey);

  const result = await withTransaction(async (client) => {
    const { rows: inserted } = await client.query(
      "INSERT INTO payment_webhook_events (provider,event_id,event_type,payload) VALUES ('modempay',$1,$2,$3) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id",
      [eventId, eventType, JSON.stringify(event)]
    );
    if (!inserted.length) return { duplicate: true, eventId, eventType };

    if (eventType === 'charge.succeeded') {
      if (String(payload.status || '').toLowerCase() !== 'completed') {
        logger.warn('Ignoring non-completed Modem Pay success event', { eventId, status: payload.status });
        return { processed: true, ignored: true, eventId, eventType, reason: 'status_not_completed' };
      }

      const depositOutcome = await dahaWalletService.processDepositWebhook(client, payload, eventId);
      if (depositOutcome) return depositOutcome;

      const orderId = metadata.orderId || metadata.order_id;
      if (!orderId) {
        logger.warn('Modem Pay charge has no MarketLink orderId metadata', { eventId });
        return { processed: true, ignored: true, eventId, eventType, reason: 'missing_order_id' };
      }

      const paymentId = metadata.paymentId || metadata.payment_id;
      let payment = null;
      if (paymentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(paymentId))) {
        const { rows: [byId] } = await client.query(
          "SELECT p.* FROM payments p WHERE p.id=$1 AND p.order_id=$2 AND p.method IN ('modempay','wave','afrimoney','qmoney') AND p.status='pending' FOR UPDATE",
          [String(paymentId), String(orderId)]
        );
        payment = byId || null;
      }
      if (!payment && providerRefs.length) {
        const { rows: [byReference] } = await client.query(
          "SELECT p.* FROM payments p WHERE p.order_id=$1 AND p.provider_ref=ANY($2::text[]) AND p.method IN ('modempay','wave','afrimoney','qmoney') AND p.status='pending' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE",
          [String(orderId), providerRefs]
        );
        payment = byReference || null;
      }
      if (!payment) {
        logger.warn('Signed Modem Pay success event did not match a pending MarketLink payment', {
          eventId, orderId, providerRefs,
        });
        return { processed: true, ignored: true, eventId, eventType, reason: 'payment_not_matched' };
      }

      const providerAmount = Number(payload.amount);
      if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - Number(payment.amount)) > 0.01) {
        logger.error('Modem Pay amount mismatch', {
          eventId, orderId, paymentId: payment.id, expected: payment.amount, received: payload.amount,
        });
        return { processed: true, ignored: true, eventId, eventType, reason: 'amount_mismatch' };
      }
      if (String(payload.currency || '').toUpperCase() !== String(payment.currency || 'GMD').toUpperCase()) {
        logger.error('Modem Pay currency mismatch', {
          eventId, orderId, paymentId: payment.id, expected: payment.currency, received: payload.currency,
        });
        return { processed: true, ignored: true, eventId, eventType, reason: 'currency_mismatch' };
      }

      await client.query("UPDATE payments SET status='confirmed',paid_at=now() WHERE id=$1", [payment.id]);
      await client.query("UPDATE orders SET payment_status='confirmed' WHERE id=$1", [payment.order_id]);
      const { rows: [order] } = await client.query(
        'SELECT customer_id,total FROM orders WHERE id=$1',
        [payment.order_id]
      );
      if (order) {
        await client.query(
          "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'payment_confirmed','Payment Confirmed ✅',$2,'payment',$3)",
          [order.customer_id, 'Your payment of D ' + order.total + ' has been confirmed.', payment.id]
        );
      }
      logger.info('Modem Pay charge confirmed', { eventId, orderId, paymentId: payment.id });
      return { processed: true, eventId, eventType, paymentId: payment.id, orderId };
    }

    if (['charge.cancelled','charge.failed','charge.expired','payment_intent.cancelled','payment_intent.expired'].includes(eventType)) {
      await dahaWalletService.failDepositWebhook(client, payload, eventType);
      const orderId = metadata.orderId || metadata.order_id;
      const paymentId = metadata.paymentId || metadata.payment_id;
      let payment = null;

      if (orderId && paymentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(paymentId))) {
        const { rows: [byId] } = await client.query(
          "SELECT p.* FROM payments p WHERE p.id=$1 AND p.order_id=$2 AND p.method IN ('modempay','wave','afrimoney','qmoney') AND p.status='pending' FOR UPDATE",
          [String(paymentId), String(orderId)]
        );
        payment = byId || null;
      }
      if (!payment && orderId && providerRefs.length) {
        const { rows: [byReference] } = await client.query(
          "SELECT p.* FROM payments p WHERE p.order_id=$1 AND p.provider_ref=ANY($2::text[]) AND p.method IN ('modempay','wave','afrimoney','qmoney') AND p.status='pending' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE",
          [String(orderId), providerRefs]
        );
        payment = byReference || null;
      }

      if (payment) {
        await client.query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [payment.id]);
        const { rows: [order] } = await client.query(
          'SELECT status FROM orders WHERE id=$1 FOR UPDATE',
          [payment.order_id]
        );
        if (order && !['cancelled','delivered'].includes(order.status)) {
          const { rows: items } = await client.query(
            'SELECT product_id,quantity FROM order_items WHERE order_id=$1',
            [payment.order_id]
          );
          for (const item of items) {
            await client.query(
              'UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND variant_id IS NULL',
              [item.quantity, item.product_id]
            );
          }
          await client.query(
            "UPDATE orders SET status='cancelled',payment_status='failed',cancellation_reason=$2 WHERE id=$1",
            [payment.order_id, 'Payment failed or expired; inventory released.']
          );
          await client.query(
            "INSERT INTO order_status_history (order_id,status,note) VALUES($1,'cancelled',$2)",
            [payment.order_id, 'Payment failed or expired; inventory released.']
          );
          await client.query(
            "UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')",
            [payment.order_id]
          );
        } else if (order) {
          await client.query("UPDATE orders SET payment_status='failed' WHERE id=$1 AND payment_status<>'confirmed'", [payment.order_id]);
        }
      }
    }

    return { processed: true, eventId, eventType };
  });

  if (result?.paymentId && result?.orderId) {
    try {
      await ordersService.settleOrderFinancials(result.orderId);
    } catch (err) {
      logger.warn('Settlement deferred after provider webhook', {
        eventId, orderId: result.orderId, error: err.message,
      });
    }
  }
  return result;
}

async function refund(paymentId,{amount,reason},actor){const {rows:[payment]}=await query('SELECT * FROM payments WHERE id=$1',[paymentId]);if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');if(payment.status!=='confirmed')throw new AppError('Only confirmed payments can be refunded.',400,'NOT_CONFIRMED');if(payment.refund_status==='processed')throw new AppError('Payment already refunded.',400,'ALREADY_REFUNDED');const refundAmount=amount||payment.amount;if(refundAmount>payment.amount)throw new AppError('Refund amount exceeds payment amount.',400,'INVALID_AMOUNT');const provider=PROVIDERS[payment.method];if(payment.method!=='cod'&&provider)await provider.refund({providerRef:payment.provider_ref,amount:refundAmount});return withTransaction(async(client)=>{const {rows:[updated]}=await client.query(`UPDATE payments SET refund_status='processed', refund_amount=$1,status=CASE WHEN $1=amount THEN 'refunded' ELSE status END WHERE id=$2 RETURNING *`,[refundAmount,paymentId]);const {rows:[o]}=await client.query('SELECT customer_id FROM orders WHERE id=$1',[payment.order_id]);if(o){const {rows:[w]}=await client.query('SELECT id,balance FROM wallets WHERE user_id=$1',[o.customer_id]);if(w){await client.query('UPDATE wallets SET balance=balance+$1 WHERE id=$2',[refundAmount,w.id]);await client.query(`INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'credit','refund',$2,$3,'payment',$4,$5)`,[w.id,refundAmount,Number(w.balance)+Number(refundAmount),paymentId,reason||'Order refund']);}}await query(`INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES ($1,$2,'payment.refunded','payment',$3,$4)`,[actor.id,actor.role,paymentId,JSON.stringify({refundAmount,reason})]);return updated;});}
async function getHistory(customerId,{page=1,limit=20}){const limit_=Math.min(parseInt(limit)||20,100);const offset=(Math.max(parseInt(page)||1,1)-1)*limit_;const {rows}=await query(`SELECT p.*,o.order_number FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=$1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,[customerId,limit_,offset]);return rows;}
module.exports={initiatePayment,continuePayment,getPaymentStatus,confirmPayment,listPendingCodPayments,getCodRemittanceInstructions,submitCodCashRemittance,listMyCodCashRemittances,listCodCashRemittances,verifyCodCashRemittance,refund,getHistory,processWebhook,markPaymentConfirmed};