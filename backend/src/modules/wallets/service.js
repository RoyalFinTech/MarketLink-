'use strict';

const crypto = require('crypto');
const { query } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const modemPay = require('../../integrations/modempay');
const withdrawalsService = require('../withdrawals/service');

const DEPOSIT_METHODS = ['modempay', 'wave', 'afrimoney', 'qmoney'];
const PAYOUT_METHODS = ['wave', 'afrimoney'];
const MIN_WITHDRAWAL = 50;

async function ensureWallet(userId) {
  await query(
    "INSERT INTO wallets (user_id, balance, currency) VALUES ($1, 0, 'GMD') ON CONFLICT (user_id) DO NOTHING",
    [userId]
  );
  const { rows: [wallet] } = await query(
    'SELECT w.*, u.full_name FROM wallets w JOIN users u ON u.id = w.user_id WHERE w.user_id=$1',
    [userId]
  );
  if (!wallet) throw new AppError('Wallet could not be created for this account.', 404, 'WALLET_NOT_FOUND');
  return wallet;
}

async function getWallet(userId) {
  const wallet = await ensureWallet(userId);
  const { rows: [pending] } = await query(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM withdrawals WHERE user_id=$1 AND status IN ('processing','payout_pending')",
    [userId]
  );
  const held = Number(pending?.amount || 0);
  return {
    ...wallet,
    balance: Number(wallet.balance),
    reserved_balance: held,
    available_balance: Math.max(0, Number(wallet.balance) - held),
  };
}

async function listTransactions(userId, { page = 1, limit = 30 } = {}) {
  const wallet = await ensureWallet(userId);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 30));
  const { rows } = await query(
    'SELECT * FROM transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [wallet.id, safeLimit, (safePage - 1) * safeLimit]
  );
  return rows;
}

async function listDeposits(userId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20));
  const { rows } = await query(
    'SELECT id, amount, currency, payment_method, status, provider_status, created_at, completed_at FROM wallet_deposits WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, safeLimit, (safePage - 1) * safeLimit]
  );
  return rows;
}

async function getDeposit(userId, depositId) {
  const { rows: [deposit] } = await query(
    'SELECT id, amount, currency, payment_method, status, provider_status, created_at, completed_at FROM wallet_deposits WHERE id=$1 AND user_id=$2',
    [depositId, userId]
  );
  if (!deposit) throw new AppError('DAHA Wallet deposit was not found.', 404, 'DEPOSIT_NOT_FOUND');
  return deposit;
}

async function initiateDeposit(userId, { amount, method = 'modempay', accountNumber }) {
  const value = Number(amount);
  method = String(method || 'modempay').trim().toLowerCase();
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError('Enter a deposit amount greater than zero.', 400, 'INVALID_AMOUNT');
  }
  if (!DEPOSIT_METHODS.includes(method)) {
    throw new AppError('Choose Modem Pay, Wave, AfriMoney or QMoney.', 400, 'UNSUPPORTED_METHOD');
  }
  if (!modemPay.isConfigured() || !modemPay.isWebhookConfigured()) {
    throw new AppError('Modem Pay API credentials and webhook signing configuration are required before DAHA Wallet deposits can be enabled.', 503, 'PROVIDER_UNAVAILABLE');
  }
  if (modemPay.isH2H() && !modemPay.isH2HApproved()) {
    throw new AppError('Direct mobile-money deposits are awaiting Modem Pay H2H partner approval.', 503, 'PROVIDER_UNAVAILABLE');
  }
  if (!modemPay.isH2H() && value < 10) {
    throw new AppError('Modem Pay hosted checkout requires a minimum deposit of D 10.00.', 400, 'BELOW_PROVIDER_MINIMUM');
  }
  if (modemPay.isH2H() && !['wave', 'afrimoney', 'qmoney'].includes(method)) {
    throw new AppError('Choose Wave, AfriMoney or QMoney for direct mobile-money deposits.', 400, 'UNSUPPORTED_METHOD');
  }
  if (modemPay.isH2H() && !/^\d{7}$/.test(String(accountNumber || '').replace(/\D/g, ''))) {
    throw new AppError('Enter the 7-digit mobile-money number without +220.', 400, 'INVALID_ACCOUNT_NUMBER');
  }

  const wallet = await ensureWallet(userId);
  const depositId = crypto.randomUUID();
  const idempotencyKey = 'marketlink-daha-deposit-' + depositId;

  const { rows: [deposit] } = await query(
    "INSERT INTO wallet_deposits (id,user_id,wallet_id,provider,payment_method,idempotency_key,amount,currency,status) VALUES ($1,$2,$3,'modempay',$4,$5,$6,'GMD','initiating') RETURNING *",
    [depositId, userId, wallet.id, method, idempotencyKey, value]
  );

  let charge;
  try {
    charge = await modemPay.createPaymentIntent({
      amount: value,
      currency: 'GMD',
      metadata: { walletDepositId: depositId, userId },
      title: 'DAHA Wallet Deposit',
      description: 'Add funds to DAHA Wallet',
      returnUrl: process.env.MODEM_PAY_RETURN_URL,
      cancelUrl: process.env.MODEM_PAY_CANCEL_URL,
      callbackUrl: process.env.MODEM_PAY_CALLBACK_URL,
      network: method === 'modempay' ? undefined : method,
      accountNumber: accountNumber ? String(accountNumber).replace(/\D/g, '') : undefined,
      idempotencyKey,
    });
  } catch (err) {
    if (err?.code === 'MODEM_PAY_NETWORK_ERROR') {
      const { rows: [pending] } = await query(
        "UPDATE wallet_deposits SET status='pending',provider_status='unknown',updated_at=now() WHERE id=$1 RETURNING id,amount,currency,payment_method,status,provider_status,created_at",
        [depositId]
      );
      return { deposit: pending || deposit, action: 'pending', providerStatus: 'unknown' };
    }
    await query(
      "UPDATE wallet_deposits SET status='failed',provider_status=$2,updated_at=now() WHERE id=$1",
      [depositId, String(err?.code || 'provider_error').slice(0, 40)]
    ).catch(() => {});
    throw err;
  }

  const providerRef = String(charge?.reference || '').trim();
  if (!providerRef) {
    await query(
      "UPDATE wallet_deposits SET status='failed',provider_status='invalid_provider_response',updated_at=now() WHERE id=$1",
      [depositId]
    );
    throw new AppError('Modem Pay did not return a valid deposit reference. No wallet balance was changed.', 502, 'PROVIDER_INVALID_RESPONSE');
  }

  const storedProviderRef = providerRef === idempotencyKey ? null : providerRef;
  const { rows: [updated] } = await query(
    "UPDATE wallet_deposits SET provider_ref=$2,status='pending',provider_status=$3,provider_response=$4,updated_at=now() WHERE id=$1 RETURNING id,amount,currency,payment_method,status,provider_status,created_at",
    [depositId, storedProviderRef, String(charge.status || 'pending').slice(0, 40), JSON.stringify({
      paymentIntentId: charge.paymentIntentId || null,
      nextStep: charge.nextStep || null,
      hasRedirect: Boolean(charge.paymentLink),
    })]
  );

  const nextStep = charge.nextStep || null;
  const redirectUrl = charge.paymentLink || null;
  return {
    deposit: updated,
    provider: 'modempay',
    action: modemPay.isH2H() && !(nextStep?.openExternal && (nextStep.launch_url || redirectUrl)) ? 'continue' : 'redirect',
    redirectUrl,
    nextStep,
    providerStatus: charge.status || 'pending',
  };
}

async function continueDeposit(userId, depositId, { action, pin } = {}) {
  const { rows: [deposit] } = await query(
    'SELECT * FROM wallet_deposits WHERE id=$1 AND user_id=$2',
    [depositId, userId]
  );
  if (!deposit) throw new AppError('DAHA Wallet deposit was not found.', 404, 'DEPOSIT_NOT_FOUND');
  if (deposit.status === 'completed') return { submitted: true, confirmed: true, deposit: await getDeposit(userId, depositId) };
  if (deposit.status !== 'pending' || !deposit.provider_ref) {
    throw new AppError('This deposit is not ready for another provider step.', 409, 'DEPOSIT_NOT_ACTIVE');
  }
  if (!modemPay.isH2H()) throw new AppError('This deposit uses the secure hosted Modem Pay checkout.', 409, 'PAYMENT_FLOW_MISMATCH');

  if (action === 'confirm') await modemPay.confirmCharge(deposit.provider_ref);
  else if (action === 'pin') {
    if (!/^\d{4,8}$/.test(String(pin || ''))) throw new AppError('Enter the provider code requested for this payment.', 400, 'INVALID_PROVIDER_CODE');
    await modemPay.finalizeCharge(deposit.provider_ref, String(pin));
  } else throw new AppError('Choose a valid provider confirmation action.', 400, 'INVALID_PAYMENT_ACTION');

  return { submitted: true, confirmed: false, status: 'pending', deposit: await getDeposit(userId, depositId) };
}

async function listWithdrawals(userId, options = {}) {
  await ensureWallet(userId);
  return withdrawalsService.listMine(userId, options);
}

async function getVendorPayoutProfile(userId) {
  const { rows: [profile] } = await query(
    'SELECT payout_method,account_number,beneficiary_name,updated_at FROM vendor_payout_profiles WHERE user_id=$1',
    [userId]
  );
  return profile || null;
}

async function saveVendorPayoutProfile(userId, { payoutMethod, accountNumber, beneficiaryName } = {}) {
  payoutMethod = String(payoutMethod || '').trim().toLowerCase();
  accountNumber = String(accountNumber || '').replace(/\D/g, '');
  beneficiaryName = String(beneficiaryName || '').trim();
  if (!['wave','afrimoney'].includes(payoutMethod)) {
    throw new AppError('Choose Wave or AfriMoney for your vendor payout destination.', 400, 'UNSUPPORTED_PAYOUT_METHOD');
  }
  if (!/^\d{7}$/.test(accountNumber)) {
    throw new AppError('Enter the 7-digit payout mobile-money number without +220.', 400, 'INVALID_ACCOUNT_NUMBER');
  }
  if (!beneficiaryName || beneficiaryName.length > 150) {
    throw new AppError('Enter the account holder name (maximum 150 characters).', 400, 'BENEFICIARY_REQUIRED');
  }
  const sql = 'INSERT INTO vendor_payout_profiles (user_id,payout_method,account_number,beneficiary_name) ' +
    'VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET ' +
    'payout_method=EXCLUDED.payout_method, account_number=EXCLUDED.account_number, ' +
    'beneficiary_name=EXCLUDED.beneficiary_name, updated_at=now() ' +
    'RETURNING payout_method,account_number,beneficiary_name,updated_at';
  const { rows: [profile] } = await query(sql,[userId,payoutMethod,accountNumber,beneficiaryName]);
  return profile;
}

async function getRiderPayoutProfile(userId) {
  const { rows: [profile] } = await query(
    'SELECT payout_method,account_number,beneficiary_name,updated_at FROM rider_payout_profiles WHERE user_id=$1',
    [userId]
  );
  return profile || null;
}

async function saveRiderPayoutProfile(userId, { payoutMethod, accountNumber, beneficiaryName } = {}) {
  payoutMethod = String(payoutMethod || '').trim().toLowerCase();
  accountNumber = String(accountNumber || '').replace(/\D/g, '');
  beneficiaryName = String(beneficiaryName || '').trim();
  if (!['wave','afrimoney'].includes(payoutMethod)) {
    throw new AppError('Choose Wave or AfriMoney for your rider payout destination.', 400, 'UNSUPPORTED_PAYOUT_METHOD');
  }
  if (!/^\d{7}$/.test(accountNumber)) {
    throw new AppError('Enter the 7-digit payout mobile-money number without +220.', 400, 'INVALID_ACCOUNT_NUMBER');
  }
  if (!beneficiaryName || beneficiaryName.length > 150) {
    throw new AppError('Enter the account holder name (maximum 150 characters).', 400, 'BENEFICIARY_REQUIRED');
  }
  const { rows: [profile] } = await query(
    'INSERT INTO rider_payout_profiles (user_id,payout_method,account_number,beneficiary_name) ' +
    'VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET ' +
    'payout_method=EXCLUDED.payout_method, account_number=EXCLUDED.account_number, ' +
    'beneficiary_name=EXCLUDED.beneficiary_name, updated_at=now() ' +
    'RETURNING payout_method,account_number,beneficiary_name,updated_at',
    [userId,payoutMethod,accountNumber,beneficiaryName]
  );
  return profile;
}

async function requestWithdrawal(userId, { amount, payoutMethod, payoutDetails } = {}) {
  if (Number(amount) < MIN_WITHDRAWAL) {
    throw new AppError('The minimum DAHA Wallet withdrawal is D 50.00.', 400, 'BELOW_MINIMUM');
  }
  await ensureWallet(userId);
  // Role-specific destinations are enforced centrally in withdrawals.service so
  // direct /vendors and /riders endpoints cannot bypass saved payout details.
  return withdrawalsService.requestWithdrawal(userId, { amount, payoutMethod, payoutDetails });
}

async function processDepositWebhook(client, payload, eventId) {
  const metadata = payload?.metadata || {};
  const depositId = metadata.walletDepositId || metadata.wallet_deposit_id || metadata.depositId;
  const externalReference = payload.external_reference || payload.externalReference || metadata.idempotencyKey || metadata.idempotency_key;
  if (!depositId && !externalReference) return null;

  let deposit;
  if (depositId) {
    const { rows: [byId] } = await client.query(
      'SELECT * FROM wallet_deposits WHERE id=$1 FOR UPDATE',
      [String(depositId)]
    );
    deposit = byId;
  }
  if (!deposit && externalReference) {
    const { rows: [byReference] } = await client.query(
      'SELECT * FROM wallet_deposits WHERE idempotency_key=$1 FOR UPDATE',
      [String(externalReference)]
    );
    deposit = byReference;
  }
  if (!deposit) return null;
  if (deposit.status === 'completed') {
    return { duplicate: true, eventId, eventType: 'charge.succeeded', depositId: deposit.id };
  }
  if (!['pending', 'initiating'].includes(String(deposit.status))) {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'deposit_not_pending' };
  }

  const providerRefs = [
    payload.payment_intent_id, payload.paymentIntentId, payload.id,
    payload.transaction_reference, payload.transaction_id, payload.transactionId,
    payload.reference,
  ].filter(Boolean).map(String);
  if (deposit.provider_ref && !providerRefs.includes(String(deposit.provider_ref))) {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'provider_reference_mismatch' };
  }
  if (externalReference && String(externalReference) !== String(deposit.idempotency_key)) {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'idempotency_reference_mismatch' };
  }
  const providerAmount = Number(payload.amount);
  if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - Number(deposit.amount)) > 0.01) {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'amount_mismatch' };
  }
  if (String(payload.currency || '').toUpperCase() !== String(deposit.currency || 'GMD').toUpperCase()) {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'currency_mismatch' };
  }
  if (String(payload.status || '').toLowerCase() !== 'completed') {
    return { processed: true, ignored: true, eventId, depositId: deposit.id, reason: 'status_not_completed' };
  }

  const { rows: [wallet] } = await client.query(
    'SELECT id,balance FROM wallets WHERE id=$1 FOR UPDATE',
    [deposit.wallet_id]
  );
  if (!wallet) throw new AppError('The DAHA Wallet record for this deposit no longer exists.', 409, 'WALLET_NOT_FOUND');
  const { rows: [creditedWallet] } = await client.query(
    'UPDATE wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING balance',
    [deposit.amount, wallet.id]
  );
  const nextBalance = Number(creditedWallet.balance);
  await client.query(
    "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'credit','deposit',$2,$3,'wallet_deposit',$4,'DAHA Wallet deposit confirmed by Modem Pay')",
    [wallet.id, deposit.amount, nextBalance, deposit.id]
  );
  await client.query(
    "UPDATE wallet_deposits SET status='completed',provider_status='completed',completed_at=now(),updated_at=now() WHERE id=$1",
    [deposit.id]
  );
  await client.query(
    "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'wallet_funded','DAHA Wallet funded',$2,'wallet_deposit',$3)",
    [deposit.user_id, 'Your DAHA Wallet deposit of D ' + Number(deposit.amount).toFixed(2) + ' is confirmed.', deposit.id]
  );
  return { processed: true, eventId, depositId: deposit.id, walletBalance: nextBalance };
}

async function failDepositWebhook(client, payload, eventType) {
  const metadata = payload?.metadata || {};
  const depositId = metadata.walletDepositId || metadata.wallet_deposit_id || metadata.depositId;
  if (!depositId) return null;
  const { rows: [deposit] } = await client.query(
    "UPDATE wallet_deposits SET status='failed',provider_status=$2,updated_at=now() WHERE id=$1 AND status IN ('pending','initiating') RETURNING id",
    [String(depositId), String(eventType || 'failed').slice(0, 40)]
  );
  return deposit ? { processed: true, depositId: deposit.id, status: 'failed' } : null;
}

module.exports = {
  ensureWallet, getWallet, listTransactions, listDeposits, getDeposit,
  initiateDeposit, continueDeposit, listWithdrawals, requestWithdrawal,
  getVendorPayoutProfile, saveVendorPayoutProfile,
  getRiderPayoutProfile, saveRiderPayoutProfile,
  processDepositWebhook, failDepositWebhook,
};
