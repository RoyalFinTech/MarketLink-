'use strict';

const { AppError } = require('../middleware/errorHandler');
const BASE_URL = process.env.MODEM_PAY_BASE_URL || 'https://api.modempay.com/v1';

function getApiKey() {
  const key = process.env.MODEM_PAY_API_KEY;
  if (!key) throw new AppError('Modem Pay is not configured on the server.', 503, 'PROVIDER_UNAVAILABLE');
  return key;
}

async function modemRequest(path, { method='GET', body, idempotencyKey } = {}) {
  const headers = { Authorization: 'Bearer ' + getApiKey(), 'Content-Type': 'application/json', Accept: 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(BASE_URL + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok || data?.status === false) {
    const message = data?.message || data?.error || ('Modem Pay request failed with HTTP ' + response.status);
    throw new AppError(message, response.status >= 500 ? 503 : 400, 'MODEM_PAY_ERROR');
  }
  return data;
}

async function createPaymentIntent({ amount, currency='GMD', metadata={}, title, description, returnUrl, cancelUrl, idempotencyKey }) {
  const response = await modemRequest('/payments', {
    method: 'POST',
    idempotencyKey,
    body: { data: {
      amount: Number(amount), currency, metadata, title, description,
      return_url: returnUrl, cancel_url: cancelUrl, from_sdk: false,
    }},
  });
  const data = response?.data || response;
  if (!data?.payment_link) throw new AppError('Modem Pay did not return a payment link.', 502, 'PROVIDER_INVALID_RESPONSE');
  return {
    reference: data.intent_secret || data.id || data.payment_intent_id || idempotencyKey,
    paymentLink: data.payment_link,
    intentSecret: data.intent_secret || null,
    status: data.status || null,
    raw: data,
  };
}

async function initiateTransfer({ amount, currency='GMD', network, accountNumber, beneficiaryName, narration, metadata, idempotencyKey }) {
  if (!network || !accountNumber || !beneficiaryName) {
    throw new AppError('Payout requires network, account number and beneficiary name.', 400, 'INVALID_PAYOUT_DETAILS');
  }
  return modemRequest('/transfers', {
    method: 'POST',
    idempotencyKey,
    body: {
      amount: Number(amount), currency, network, account_number: accountNumber,
      beneficiary_name: beneficiaryName, narration, metadata,
    },
  });
}

function verifyWebhookSignature(rawBody, signature) {
  const crypto = require('crypto');
  const secret = process.env.MODEM_PAY_WEBHOOK_SECRET || process.env.MODEM_PAY_SECRET_HASH;
  if (!secret) throw new AppError('Modem Pay webhook secret is not configured.', 503, 'PROVIDER_UNAVAILABLE');
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createPaymentIntent, initiateTransfer, verifyWebhookSignature };
