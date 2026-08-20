// src/modules/payments/service.js
// Abstract payment service with provider adapters.
// Credentials required: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY, FLUTTERWAVE_SECRET_KEY
// Set these in .env — the adapters below will be no-ops until real keys are provided.
'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ── Provider interface ─────────────────────────────────────────────────
// Each adapter must implement: charge(params), refund(params), verify(ref)
// New providers: add an adapter below and register it in PROVIDERS map.

const stripeAdapter = {
  name: 'stripe',
  charge: async ({ amount, currency, email, metadata, idempotencyKey }) => {
    if (!process.env.STRIPE_SECRET_KEY) throw new AppError('Stripe not configured.', 503, 'PROVIDER_UNAVAILABLE');
    // Real implementation: const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const pi = await stripe.paymentIntents.create({ amount: Math.round(amount*100), currency, ... });
    throw new AppError('Stripe integration requires STRIPE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  refund: async ({ providerRef, amount }) => {
    if (!process.env.STRIPE_SECRET_KEY) throw new AppError('Stripe not configured.', 503, 'PROVIDER_UNAVAILABLE');
    throw new AppError('Stripe integration requires STRIPE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  verify: async (ref) => {
    throw new AppError('Stripe integration requires STRIPE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
};

const paystackAdapter = {
  name: 'paystack',
  charge: async ({ amount, currency, email, metadata, idempotencyKey }) => {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new AppError('Paystack not configured.', 503, 'PROVIDER_UNAVAILABLE');
    // Real: const res = await fetch('https://api.paystack.co/transaction/initialize', {
    //   method:'POST', headers:{'Authorization':'Bearer '+process.env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json'},
    //   body: JSON.stringify({ email, amount: Math.round(amount*100), currency, metadata, reference: idempotencyKey })
    // });
    throw new AppError('Paystack integration requires PAYSTACK_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  refund: async ({ providerRef, amount }) => {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new AppError('Paystack not configured.', 503, 'PROVIDER_UNAVAILABLE');
    throw new AppError('Paystack integration requires PAYSTACK_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  verify: async (ref) => {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new AppError('Paystack not configured.', 503, 'PROVIDER_UNAVAILABLE');
    throw new AppError('Paystack integration requires PAYSTACK_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
};

const flutterwaveAdapter = {
  name: 'flutterwave',
  charge: async ({ amount, currency, email, metadata, idempotencyKey }) => {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError('Flutterwave not configured.', 503, 'PROVIDER_UNAVAILABLE');
    throw new AppError('Flutterwave integration requires FLUTTERWAVE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  refund: async ({ providerRef, amount }) => {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError('Flutterwave not configured.', 503, 'PROVIDER_UNAVAILABLE');
    throw new AppError('Flutterwave integration requires FLUTTERWAVE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
  verify: async (ref) => {
    throw new AppError('Flutterwave integration requires FLUTTERWAVE_SECRET_KEY in .env', 503, 'PROVIDER_UNAVAILABLE');
  },
};

const PROVIDERS = { stripe: stripeAdapter, paystack: paystackAdapter, flutterwave: flutterwaveAdapter };

// ── Idempotency ────────────────────────────────────────────────────────
async function checkIdempotency(key) {
  const { rows } = await query(
    `SELECT * FROM payments WHERE provider_ref = $1 AND status IN ('confirmed','pending')`, [key]);
  return rows.length ? rows[0] : null;
}

// ── INITIATE PAYMENT ──────────────────────────────────────────────────
async function initiatePayment({ orderId, method, amount, currency='GMD', customerId }) {
  const { rows: [order] } = await query(
    'SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [orderId, customerId]);
  if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
  if (order.payment_status === 'confirmed')
    throw new AppError('Order is already paid.', 400, 'ALREADY_PAID');

  // Generate idempotency key: orderId + method ensures one payment record per order/method combo
  const idempotencyKey = `${orderId}:${method}`;
  const existing = await checkIdempotency(idempotencyKey);
  if (existing) return { existing: true, payment: existing };

  if (method === 'cod') {
    const { rows: [payment] } = await query(
      `INSERT INTO payments (order_id, method, amount, currency, status)
       VALUES ($1,'cod',$2,$3,'pending') RETURNING *`,
      [orderId, amount, currency]);
    return { payment, action: 'cod_pending' };
  }

  const provider = PROVIDERS[method];
  if (!provider) throw new AppError(`Payment method "${method}" is not supported.`, 400, 'UNSUPPORTED_METHOD');

  const { rows: [user] } = await query('SELECT email FROM users WHERE id = $1', [customerId]);
  const chargeResult = await provider.charge({
    amount, currency, email: user?.email, idempotencyKey,
    metadata: { orderId, customerId },
  });

  const { rows: [payment] } = await query(
    `INSERT INTO payments (order_id, method, provider_ref, amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
    [orderId, method, chargeResult.reference || idempotencyKey, amount, currency]);
  return { payment, action: 'redirect', redirectUrl: chargeResult.authorizationUrl };
}

// ── VERIFY / CONFIRM ──────────────────────────────────────────────────
async function confirmPayment(paymentId, actorId, roles) {
  const { rows: [payment] } = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (!payment) throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
  if (payment.status === 'confirmed') return payment;
  const isAdmin = (roles||[]).some(r => ['admin','super_admin'].includes(r));
  if (payment.method === 'cod') {
    if (!isAdmin) throw new AppError('Only admins can confirm COD payments.', 403, 'FORBIDDEN');
  } else {
    const provider = PROVIDERS[payment.method];
    if (provider) await provider.verify(payment.provider_ref);
  }

  return withTransaction(async (client) => {
    const { rows: [updated] } = await client.query(
      `UPDATE payments SET status = 'confirmed', paid_at = now() WHERE id = $1 RETURNING *`, [paymentId]);
    await client.query(
      `UPDATE orders SET payment_status = 'confirmed' WHERE id = $1`, [payment.order_id]);
    const { rows: [o] } = await client.query(
      'SELECT customer_id, total, vendor_id FROM orders WHERE id = $1', [payment.order_id]);
    if (o) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES ($1,'payment_confirmed','Payment Confirmed ✅','Your payment of D $2 has been confirmed.','payment',$3)`,
        [o.customer_id, o.total, paymentId]);
    }
    logger.info('Payment confirmed', { paymentId, orderId: payment.order_id });
    return updated;
  });
}

// ── REFUND ────────────────────────────────────────────────────────────
async function refund(paymentId, { amount, reason }, actor) {
  const { rows: [payment] } = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (!payment) throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
  if (payment.status !== 'confirmed') throw new AppError('Only confirmed payments can be refunded.', 400, 'NOT_CONFIRMED');
  if (payment.refund_status === 'processed') throw new AppError('Payment already refunded.', 400, 'ALREADY_REFUNDED');
  const refundAmount = amount || payment.amount;
  if (refundAmount > payment.amount) throw new AppError('Refund amount exceeds payment amount.', 400, 'INVALID_AMOUNT');

  if (payment.method !== 'cod') {
    const provider = PROVIDERS[payment.method];
    if (provider) await provider.refund({ providerRef: payment.provider_ref, amount: refundAmount });
  }

  return withTransaction(async (client) => {
    const { rows: [updated] } = await client.query(
      `UPDATE payments SET refund_status = 'processed', refund_amount = $1,
                           status = CASE WHEN $1 = amount THEN 'refunded' ELSE status END
       WHERE id = $2 RETURNING *`, [refundAmount, paymentId]);
    const { rows: [o] } = await client.query(
      'SELECT customer_id FROM orders WHERE id = $1', [payment.order_id]);
    if (o) {
      const { rows: [w] } = await client.query('SELECT id, balance FROM wallets WHERE user_id = $1', [o.customer_id]);
      if (w) {
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [refundAmount, w.id]);
        await client.query(
          `INSERT INTO transactions (wallet_id, type, category, amount, balance_after, reference_type, reference_id, description)
           VALUES ($1,'credit','refund',$2,$3,'payment',$4,$5)`,
          [w.id, refundAmount, w.balance + refundAmount, paymentId, reason || 'Order refund']);
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1,'refund_processed','Refund Processed 💰',$2)`,
          [o.customer_id, `D ${refundAmount} has been refunded to your wallet.`]);
      }
    }
    await query(
      `INSERT INTO admin_action_logs (actor_id, actor_role, action, entity_type, entity_id, after_data)
       VALUES ($1,$2,'payment.refunded','payment',$3,$4)`,
      [actor.id, actor.role, paymentId, JSON.stringify({ refundAmount, reason })]);
    return updated;
  });
}

async function getHistory(customerId, { page=1, limit=20 }) {
  const limit_ = Math.min(parseInt(limit)||20, 100);
  const offset = (Math.max(parseInt(page)||1,1)-1)*limit_;
  const { rows } = await query(
    `SELECT p.*, o.order_number FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.customer_id = $1
     ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [customerId, limit_, offset]);
  return rows;
}

module.exports = { initiatePayment, confirmPayment, refund, getHistory };
