// src/modules/payments/service.js
'use strict';
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const modemPay = require('../../integrations/modempay');
const ordersService = require('../orders/service');

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
      authorizationUrl: result.paymentLink,
      intentSecret: result.intentSecret,
      nextStep: result.nextStep || null,
      providerStatus: result.status || null,
    };
  },
  refund: async () => { throw new AppError('Modem Pay refunds are not enabled in MarketLink yet.', 503, 'PROVIDER_UNAVAILABLE'); },
  verify: async () => { throw new AppError('Modem Pay payments are confirmed by signed webhooks or status checks.', 409, 'WEBHOOK_CONFIRMATION_REQUIRED'); },
};
const stripeAdapter = { name:'stripe', charge:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Stripe integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const paystackAdapter = { name:'paystack', charge:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Paystack integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const flutterwaveAdapter = { name:'flutterwave', charge:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, refund:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');}, verify:async()=>{throw new AppError('Flutterwave integration is not configured.',503,'PROVIDER_UNAVAILABLE');} };
const PROVIDERS = { modempay:modemAdapter, wave:modemAdapter, afrimoney:modemAdapter, qmoney:modemAdapter, stripe:stripeAdapter, paystack:paystackAdapter, flutterwave:flutterwaveAdapter };
async function checkIdempotency(key){const {rows}=await query("SELECT * FROM payments WHERE provider_ref = $1 AND status IN ('confirmed','pending')",[key]);return rows.length?rows[0]:null;}
async function releaseOrderInventoryAfterPaymentFailure(orderId, reason){return withTransaction(async(client)=>{const {rows:[order]}=await client.query('SELECT id,status,payment_status FROM orders WHERE id=$1 FOR UPDATE',[orderId]);if(!order)return{released:false,reason:'ORDER_NOT_FOUND'};if(order.payment_status==='confirmed')return{released:false,reason:'PAYMENT_ALREADY_CONFIRMED'};if(!['pending','accepted','preparing','awaiting_rider'].includes(order.status))return{released:false,reason:'ORDER_NOT_RELEASEABLE'};const {rows:items}=await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);for(const item of items)await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND variant_id IS NULL',[item.quantity,item.product_id]);await client.query("UPDATE orders SET status='cancelled',cancellation_reason=$2 WHERE id=$1",[orderId,reason||'Payment initiation failed; inventory released.']);await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES($1,'cancelled',$2)",[orderId,reason||'Payment initiation failed; inventory released.']);await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')",[orderId]);return{released:true};});}

async function initiatePayment({ orderId, method, amount, currency='GMD', customerId, accountNumber }) {
  if (!['cod','wave','afrimoney','qmoney','modempay'].includes(String(method || '').toLowerCase())) {
    throw new AppError('Choose a supported MarketLink payment method.', 400, 'UNSUPPORTED_METHOD');
  }
  method = String(method).toLowerCase();
  if(method!=='cod'&&!modemPay.isConfigured()) throw new AppError('Modem Pay is not configured yet. Choose Pay on Delivery or try again later.',503,'PROVIDER_UNAVAILABLE');
  if(method!=='cod'&&modemPay.isH2H()&&!modemPay.isH2HApproved()) throw new AppError('Direct mobile-money checkout is waiting for Modem Pay H2H partner approval.',503,'PROVIDER_UNAVAILABLE');
  if(modemPay.isH2H()&&!['cod','wave','afrimoney','qmoney'].includes(method)) throw new AppError('Choose Wave, AfriMoney or QMoney for direct mobile-money checkout.',400,'UNSUPPORTED_METHOD');
  const requestedAmount = Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new AppError('Payment amount must be greater than zero.', 400, 'INVALID_AMOUNT');
  if (method!=='cod'&&!modemPay.isH2H()&&requestedAmount<10) throw new AppError('Modem Pay checkout requires a minimum payment of D 10.00.',400,'BELOW_PROVIDER_MINIMUM');
  if (String(currency || 'GMD').toUpperCase() !== 'GMD') throw new AppError('MarketLink checkout currently supports Gambian Dalasi (GMD).', 400, 'INVALID_CURRENCY');

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
      metadata: { orderId, customerId },
    });
  } catch (err) {
    if(err&&err.code==='MODEM_PAY_NETWORK_ERROR'){
      logger.warn('Modem Pay initiation outcome is unknown; keeping payment pending for reconciliation',{paymentId:payment.id,orderId,method});
      const {rows:[pendingAttempt]}=await query('SELECT * FROM payments WHERE id=$1',[payment.id]);
      return {payment:pendingAttempt||payment,action:'continue',provider:provider.name,status:'pending',providerStatus:'unknown'};
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
  const redirectUrl = chargeResult.authorizationUrl || null;
  if (modemPay.isH2H()) {
    return {
      payment: updatedPayment,
      provider: provider.name,
      action: nextStep && nextStep.openExternal && (nextStep.launch_url || redirectUrl) ? 'redirect' : 'continue',
      redirectUrl,
      nextStep,
      providerStatus: chargeResult.providerStatus || 'pending',
    };
  }
  return {
    payment: updatedPayment,
    action: 'redirect',
    redirectUrl,
    provider: provider.name,
    providerStatus: chargeResult.providerStatus || 'pending',
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
  if (!modemPay.isH2H()) throw new AppError('This payment requires the configured hosted Modem Pay checkout.',409,'PAYMENT_FLOW_MISMATCH');

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
    try { await releaseOrderInventoryAfterPaymentFailure(payment.order_id,'Modem Pay reported '+providerStatus+'.'); }
    catch (e) { logger.error('Could not release inventory after provider failure',{paymentId,orderId:payment.order_id,error:e.message}); }
    payment = await findOwnedPayment(paymentId, actorId, roles);
    return { payment, status:'failed', providerStatus };
  }
  return { payment, status:providerStatus === 'processing' ? 'processing' : 'pending', providerStatus, nextStep, redirectUrl:nextStep && nextStep.launch_url || null };
}

async function confirmPayment(paymentId,actorId,roles){const {rows:[payment]}=await query('SELECT * FROM payments WHERE id = $1',[paymentId]);if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');if(payment.status==='confirmed')return payment;const isAdmin=(roles||[]).some(r=>['admin','super_admin'].includes(r));if(payment.method==='cod'){if(!isAdmin)throw new AppError('Only admins can confirm COD payments.',403,'FORBIDDEN');}else if(PROVIDERS[payment.method]&&PROVIDERS[payment.method]!==modemAdapter){await PROVIDERS[payment.method].verify(payment.provider_ref);}else if(payment.method!=='cod'){throw new AppError('This payment is confirmed by the provider webhook.',409,'WEBHOOK_CONFIRMATION_REQUIRED');}const confirmed=await markPaymentConfirmed(paymentId);try{await ordersService.settleOrderFinancials(payment.order_id);}catch(e){logger.warn('Settlement deferred after payment confirmation',{paymentId,orderId:payment.order_id,error:e.message});}return confirmed;}
async function markPaymentConfirmed(paymentId){return withTransaction(async(client)=>{const {rows:[payment]}=await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[paymentId]);if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');if(payment.status==='confirmed')return payment;const {rows:[updated]}=await client.query(`UPDATE payments SET status='confirmed', paid_at=now() WHERE id=$1 RETURNING *`,[paymentId]);await client.query("UPDATE orders SET payment_status='confirmed' WHERE id=$1",[payment.order_id]);const {rows:[o]}=await client.query('SELECT customer_id,total FROM orders WHERE id=$1',[payment.order_id]);if(o){await client.query(`INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'payment_confirmed','Payment Confirmed ✅',$2,'payment',$3)`,[o.customer_id,'Your payment of D '+o.total+' has been confirmed.',paymentId]);}logger.info('Payment confirmed',{paymentId,orderId:payment.order_id});return updated;});}
async function processWebhook({event,rawBody}){if(String(event?.event||'').startsWith('transfer.')){const withdrawalsSvc=require('../withdrawals/service');return withdrawalsSvc.processProviderWebhook(event);}if(!event||!event.event)throw new AppError('Invalid Modem Pay event.',400,'INVALID_WEBHOOK');const eventType=String(event.event);const payload=event.payload||{};const eventId=String(eventType+':'+(payload.transaction_reference||payload.id||crypto.createHash('sha256').update(rawBody||JSON.stringify(event)).digest('hex')));const result=await withTransaction(async(client)=>{const {rows:inserted}=await client.query(`INSERT INTO payment_webhook_events (provider,event_id,event_type,payload) VALUES ('modempay',$1,$2,$3) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`,[eventId,eventType,JSON.stringify(event)]);if(!inserted.length)return{duplicate:true,eventId,eventType};if(eventType==='charge.succeeded'){if(String(payload.status||'').toLowerCase()!=='completed'){logger.warn('Ignoring non-completed Modem Pay success event',{eventId,status:payload.status});return{processed:true,ignored:true,eventId,eventType,reason:'status_not_completed'};}const orderId=payload?.metadata?.orderId;const transactionRef=payload.transaction_reference||payload.transaction_id||payload.transactionId||payload.id;if(!orderId){logger.warn('Modem Pay charge has no MarketLink orderId metadata',{eventId});return{processed:true,ignored:true,eventId,eventType};}if(!transactionRef){logger.warn('Modem Pay charge has no transaction reference; refusing to confirm a payment',{eventId,orderId});return{processed:true,ignored:true,eventId,eventType,reason:'missing_transaction_reference'};}const {rows:[payment]}=await client.query(`SELECT p.* FROM payments p WHERE p.order_id=$1 AND p.provider_ref=$2 AND p.method IN ('modempay','wave','afrimoney','qmoney') AND p.status='pending' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE`,[orderId,String(transactionRef)]);if(!payment)return{processed:true,ignored:true,eventId,eventType};const providerAmount=Number(payload.amount);if(!Number.isFinite(providerAmount)||Math.abs(providerAmount-Number(payment.amount))>0.01){logger.error('Modem Pay amount mismatch',{eventId,orderId,paymentId:payment.id,expected:payment.amount,received:payload.amount});return{processed:true,ignored:true,eventId,eventType,reason:'amount_mismatch'};}if(String(payload.currency||'').toUpperCase()!==String(payment.currency||'GMD').toUpperCase()){logger.error('Modem Pay currency mismatch',{eventId,orderId,paymentId:payment.id,expected:payment.currency,received:payload.currency});return{processed:true,ignored:true,eventId,eventType,reason:'currency_mismatch'};}await client.query(`UPDATE payments SET status='confirmed', paid_at=now() WHERE id=$1`,[payment.id]);await client.query("UPDATE orders SET payment_status='confirmed' WHERE id=$1",[payment.order_id]);const {rows:[o]}=await client.query('SELECT customer_id,total FROM orders WHERE id=$1',[orderId]);if(o)await client.query(`INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'payment_confirmed','Payment Confirmed ✅',$2,'payment',$3)`,[o.customer_id,'Your payment of D '+o.total+' has been confirmed.',payment.id]);logger.info('Modem Pay charge confirmed',{eventId,orderId,paymentId:payment.id});return{processed:true,eventId,eventType,paymentId:payment.id,orderId};}if(['charge.cancelled','charge.failed','charge.expired','payment_intent.cancelled','payment_intent.expired'].includes(eventType)){const orderId=payload?.metadata?.orderId;const transactionRef=payload.transaction_reference||payload.transaction_id||payload.transactionId||payload.id;if(orderId&&transactionRef){const {rows:failedPayments}=await client.query(`UPDATE payments SET status='failed' WHERE order_id=$1 AND provider_ref=$2 AND method IN ('modempay','wave','afrimoney','qmoney') AND status='pending' RETURNING order_id`,[orderId,String(transactionRef)]);if(failedPayments.length){const {rows:[order]}=await client.query('SELECT status FROM orders WHERE id=$1 FOR UPDATE',[orderId]);if(order&&order.status!=='cancelled'&&order.status!=='delivered'){const {rows:items}=await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);for(const item of items)await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND variant_id IS NULL',[item.quantity,item.product_id]);await client.query("UPDATE orders SET status='cancelled',cancellation_reason=$2 WHERE id=$1",[orderId,'Payment failed or expired; inventory released.']);}}}}return{processed:true,eventId,eventType};});if(result?.paymentId&&result?.orderId){try{await ordersService.settleOrderFinancials(result.orderId);}catch(e){logger.warn('Settlement deferred after provider webhook',{eventId,orderId:result.orderId,error:e.message});}}return result;}
async function refund(paymentId,{amount,reason},actor){const {rows:[payment]}=await query('SELECT * FROM payments WHERE id=$1',[paymentId]);if(!payment)throw new AppError('Payment not found.',404,'PAYMENT_NOT_FOUND');if(payment.status!=='confirmed')throw new AppError('Only confirmed payments can be refunded.',400,'NOT_CONFIRMED');if(payment.refund_status==='processed')throw new AppError('Payment already refunded.',400,'ALREADY_REFUNDED');const refundAmount=amount||payment.amount;if(refundAmount>payment.amount)throw new AppError('Refund amount exceeds payment amount.',400,'INVALID_AMOUNT');const provider=PROVIDERS[payment.method];if(payment.method!=='cod'&&provider)await provider.refund({providerRef:payment.provider_ref,amount:refundAmount});return withTransaction(async(client)=>{const {rows:[updated]}=await client.query(`UPDATE payments SET refund_status='processed', refund_amount=$1,status=CASE WHEN $1=amount THEN 'refunded' ELSE status END WHERE id=$2 RETURNING *`,[refundAmount,paymentId]);const {rows:[o]}=await client.query('SELECT customer_id FROM orders WHERE id=$1',[payment.order_id]);if(o){const {rows:[w]}=await client.query('SELECT id,balance FROM wallets WHERE user_id=$1',[o.customer_id]);if(w){await client.query('UPDATE wallets SET balance=balance+$1 WHERE id=$2',[refundAmount,w.id]);await client.query(`INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'credit','refund',$2,$3,'payment',$4,$5)`,[w.id,refundAmount,Number(w.balance)+Number(refundAmount),paymentId,reason||'Order refund']);}}await query(`INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES ($1,$2,'payment.refunded','payment',$3,$4)`,[actor.id,actor.role,paymentId,JSON.stringify({refundAmount,reason})]);return updated;});}
async function getHistory(customerId,{page=1,limit=20}){const limit_=Math.min(parseInt(limit)||20,100);const offset=(Math.max(parseInt(page)||1,1)-1)*limit_;const {rows}=await query(`SELECT p.*,o.order_number FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=$1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,[customerId,limit_,offset]);return rows;}
module.exports={initiatePayment,continuePayment,getPaymentStatus,confirmPayment,refund,getHistory,processWebhook,markPaymentConfirmed};