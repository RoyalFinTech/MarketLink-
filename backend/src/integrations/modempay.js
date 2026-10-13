'use strict';

const { AppError } = require('../middleware/errorHandler');

const API_MODE = String(process.env.MODEM_PAY_API_MODE || 'merchant').trim().toLowerCase();
const DEFAULT_BASE_URL = API_MODE === 'h2h'
  ? 'https://api.modempay.com/h2h/v1'
  : 'https://api.modempay.com/v1';
function resolveBaseUrl() {
  const configured=String(process.env.MODEM_PAY_BASE_URL||'').trim();
  if(!configured)return DEFAULT_BASE_URL;
  let parsed;
  try{parsed=new URL(configured);}catch(e){throw new Error('MODEM_PAY_BASE_URL must be a valid URL.');}
  if(parsed.protocol!=='https:'&&!/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname))throw new Error('MODEM_PAY_BASE_URL must use HTTPS.');
  let pathname=parsed.pathname.replace(/\/+$/,'');
  if(API_MODE==='h2h'){
    if(/\/h2h\/v1$/.test(pathname)){}
    else if(/\/v1$/.test(pathname))pathname=pathname.replace(/\/v1$/,'/h2h/v1');
    else pathname=(pathname||'')+'/h2h/v1';
  }else if(!/\/v1$/.test(pathname)){
    pathname=(pathname||'')+'/v1';
  }
  parsed.pathname=pathname;
  parsed.search='';parsed.hash='';
  return parsed.toString().replace(/\/+$/,'');
}
const BASE_URL = resolveBaseUrl();

function isH2H() { return API_MODE === 'h2h'; }
function isH2HApproved() { return !isH2H() || String(process.env.MODEM_PAY_H2H_APPROVED||'').trim().toLowerCase()==='true'; }

function isConfigured() {
  const key=String(process.env.MODEM_PAY_API_KEY||'').trim();
  return Boolean(key && !/(placeholder|replace[_ -]?me|change[_ -]?me|your[_ -]?(api[_ -]?)?key|example[_ -]?key)/i.test(key));
}
function getApiKey() {
  if (!isConfigured()) throw new AppError('Modem Pay is not configured on the server.', 503, 'PROVIDER_UNAVAILABLE');
  return String(process.env.MODEM_PAY_API_KEY).trim();
}

async function modemRequest(path, { method='GET', body, idempotencyKey } = {}) {
  const headers = { Authorization: 'Bearer ' + getApiKey(), Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // The request may have reached the provider before the connection failed.
    // Preserve an unknown payment outcome for reconciliation instead of declaring failure.
    throw new AppError('Modem Pay did not return a response. The payment status must be checked before trying again.', 503, 'MODEM_PAY_NETWORK_ERROR');
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok || data?.status === false) {
    const message = data?.message || data?.error || ('Modem Pay request failed with HTTP ' + response.status);
    throw new AppError(message, response.status >= 500 ? 503 : 400, 'MODEM_PAY_ERROR');
  }
  return data;
}

async function createPaymentIntent({
  amount, currency='GMD', metadata={}, title, description,
  returnUrl, cancelUrl, callbackUrl, network, accountNumber, idempotencyKey,
}) {
  if (isH2H()) {
    if (!['wave', 'afrimoney', 'qmoney', 'aps'].includes(String(network || '').toLowerCase())) {
      throw new AppError('Choose a supported Modem Pay mobile-money network.', 400, 'INVALID_PAYMENT_NETWORK');
    }
    const localAccount = String(accountNumber || '').replace(/[\\s-]/g, '');
    if (!/^\\d{7}$/.test(localAccount)) {
      throw new AppError('Enter the 7-digit mobile-money number without the country code.', 400, 'INVALID_ACCOUNT_NUMBER');
    }
    const response = await modemRequest('/payments', {
      method: 'POST',
      idempotencyKey,
      body: { data: {
        amount: Number(amount), currency: 'GMD', network: String(network).toLowerCase(),
        account_number: localAccount,
        external_reference: String(idempotencyKey || metadata.orderId),
        metadata,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      }},
    });
    const data = response?.data || response;
    const nextStep = data?.next_step || data?.nextStep || {};
    const transactionId = data?.transactionId || data?.transaction_id || data?.id || data?.reference;
    if (!transactionId) throw new AppError('Modem Pay did not return a transaction reference.', 502, 'PROVIDER_INVALID_RESPONSE');
    return {
      reference: String(transactionId),
      paymentIntentId: data?.payment_intent_id || data?.paymentIntentId || null,
      paymentLink: nextStep.launch_url || data?.launch_url || data?.payment_link || null,
      nextStep,
      status: data?.status || 'pending',
      raw: data,
    };
  }

  // Hosted Merchant API flow. Keep this separate from H2H: their URL and
  // request/response contracts are not interchangeable.
  const selectedMethod=String(network||'').toLowerCase();
  const supportedHostedMethods=['wave','afrimoney','qmoney','aps','yonna','card'];
  const response = await modemRequest('/payments', {
    method: 'POST',
    idempotencyKey,
    body: { data: {
      amount: Number(amount), currency, metadata, title, description,
      return_url: returnUrl, cancel_url: cancelUrl,
      ...(supportedHostedMethods.includes(selectedMethod)?{payment_methods:[selectedMethod]}:{}),
      from_sdk: false,
    }},
  });
  const data = response?.data || response;
  if (!data?.payment_link) throw new AppError('Modem Pay did not return a payment link.', 502, 'PROVIDER_INVALID_RESPONSE');
  return {
    reference: data.payment_intent_id || data.id || idempotencyKey,
    paymentIntentId: data.payment_intent_id || data.id || null,
    paymentLink: data.payment_link,
    nextStep: null,
    status: data.status || null,
  };
}

async function confirmCharge(transactionId) {
  if (!isH2H()) throw new AppError('This payment flow does not use H2H confirmation.', 409, 'PAYMENT_FLOW_MISMATCH');
  return modemRequest('/payments/confirm/' + encodeURIComponent(String(transactionId)), { method: 'POST' });
}

async function finalizeCharge(transactionId, pin) {
  if (!isH2H()) throw new AppError('This payment flow does not use H2H PIN confirmation.', 409, 'PAYMENT_FLOW_MISMATCH');
  if (!/^\\d{4,8}$/.test(String(pin || ''))) throw new AppError('Enter the payment authorization code requested by your provider.', 400, 'INVALID_AUTH_CODE');
  // Never log or persist the customer's mobile-money PIN / one-time code.
  return modemRequest('/payments/finalize/' + encodeURIComponent(String(transactionId)), {
    method: 'POST', body: { pin: String(pin) },
  });
}

async function getTransaction(transactionId) {
  if (!isH2H()) throw new AppError('Transaction status lookup requires Modem Pay H2H mode.', 409, 'PAYMENT_FLOW_MISMATCH');
  const response = await modemRequest('/transactions/' + encodeURIComponent(String(transactionId)));
  return response?.data || response;
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
  // Per-payment callback URLs use the SHA-256-hashed API secret. Dashboard-level
  // webhooks use the dedicated webhook signing secret. Do not mix the two keys.
  const hasPerPaymentCallback=Boolean(String(process.env.MODEM_PAY_CALLBACK_URL||'').trim());
  const secret=hasPerPaymentCallback
    ? process.env.MODEM_PAY_SECRET_HASH
    : (process.env.MODEM_PAY_WEBHOOK_SECRET || process.env.MODEM_PAY_SECRET_HASH);
  if (!secret) throw new AppError('Modem Pay webhook signing configuration is missing.', 503, 'PROVIDER_UNAVAILABLE');
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  createPaymentIntent, confirmCharge, finalizeCharge, getTransaction,
  initiateTransfer, verifyWebhookSignature, isH2H, isConfigured, isH2HApproved,
};
