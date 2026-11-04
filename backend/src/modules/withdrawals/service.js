'use strict';
const bcrypt = require('bcryptjs');
const modemPay = require('../../integrations/modempay');
// Shared withdrawal logic for any wallet-holding user (vendors and riders today).
// Reuses the existing generic `wallets` / `transactions` / `withdrawals` tables —
// no new schema needed. Every balance mutation goes through withTransaction with
// a row lock (SELECT ... FOR UPDATE) to prevent concurrent double-withdrawals.
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

const MIN_WITHDRAWAL = 50; // GMD — floor to avoid churn on tiny payout requests

async function getBalance(userId) {
  const { rows: [w] } = await query('SELECT id,balance,currency FROM wallets WHERE user_id=$1', [userId]);
  if (!w) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');
  const { rows: [pending] } = await query(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM withdrawals WHERE user_id=$1 AND status IN ('processing','payout_pending')",
    [userId]
  );
  const reserved = Number(pending && pending.amount || 0);
  const balance = Number(w.balance);
  return Object.assign({}, w, {
    balance: balance,
    reserved_balance: reserved,
    available_balance: Math.max(0, balance - reserved),
  });
}

async function requestWithdrawal(userId, { amount, payoutMethod, payoutDetails, pin } = {}) {
  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) throw new AppError('Withdrawal amount must be greater than zero.', 400, 'INVALID_AMOUNT');
  amount = Math.round(requested * 100) / 100;
  if (amount < MIN_WITHDRAWAL) throw new AppError('Minimum withdrawal is ' + MIN_WITHDRAWAL + ' GMD.', 400, 'BELOW_MINIMUM');
  pin = String(pin || '');
  if (!/^\d{4}$/.test(pin)) throw new AppError('Enter your 4-digit MarketLink PIN to authorize this withdrawal.', 400, 'WITHDRAWAL_PIN_REQUIRED');
  payoutMethod = String(payoutMethod || '').trim().toLowerCase();
  const suppliedDetails = payoutDetails && typeof payoutDetails === 'object' ? payoutDetails : {};

  return withTransaction(async (client) => {
    // Reuse the same PIN as MarketLink login. Never persist or log the clear PIN.
    const { rows: [user] } = await client.query(
      "SELECT pin_hash,status FROM users WHERE id=$1 FOR SHARE", [userId]);
    if (!user || user.status !== 'active') throw new AppError('Your MarketLink account is not active.', 403, 'ACCOUNT_NOT_ACTIVE');
    if (!user.pin_hash || !await bcrypt.compare(pin, user.pin_hash)) {
      throw new AppError('Incorrect MarketLink PIN. No withdrawal was submitted.', 401, 'INVALID_WITHDRAWAL_PIN');
    }

    // Saved payout profiles are defaults, not mandatory login-number matches.
    // A number provided in this withdrawal request always takes priority.
    const { rows: [vendor] } = await client.query('SELECT user_id FROM vendors WHERE user_id=$1', [userId]);
    const { rows: [rider] } = await client.query('SELECT user_id FROM riders WHERE user_id=$1', [userId]);
    let saved = null;
    if (vendor) {
      const { rows: [profile] } = await client.query(
        'SELECT payout_method,account_number,beneficiary_name FROM vendor_payout_profiles WHERE user_id=$1', [userId]);
      saved = profile || null;
    } else if (rider) {
      const { rows: [profile] } = await client.query(
        'SELECT payout_method,account_number,beneficiary_name FROM rider_payout_profiles WHERE user_id=$1', [userId]);
      saved = profile || null;
    }

    payoutMethod = payoutMethod || String(saved && saved.payout_method || '').toLowerCase();
    if (!['wave','afrimoney'].includes(payoutMethod)) {
      throw new AppError('Choose Wave or AfriMoney for your withdrawal payout.', 400, 'UNSUPPORTED_PAYOUT_METHOD');
    }
    const suppliedNumber = suppliedDetails.account_number || suppliedDetails.accountNumber || suppliedDetails.phone || '';
    const accountNumber = String(suppliedNumber || (saved && saved.account_number) || '').replace(/\D/g, '');
    const suppliedName = suppliedDetails.beneficiary_name || suppliedDetails.beneficiaryName || suppliedDetails.name || '';
    const beneficiaryName = String(suppliedName || (saved && saved.beneficiary_name) || '').trim();

    if (!/^(87|86|83)\d{7}$/.test(accountNumber)) {
      throw new AppError('Enter a valid 9-digit Gambian payout number beginning 87, 86 or 83. It may differ from your MarketLink login number.', 400, 'INVALID_ACCOUNT_NUMBER');
    }
    if (!beneficiaryName || beneficiaryName.length > 150) throw new AppError('Enter the account holder name for the payout.', 400, 'BENEFICIARY_REQUIRED');

    const { rows: [wallet] } = await client.query('SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!wallet) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');
    const { rows: [pendingRow] } = await client.query(
      "SELECT COALESCE(SUM(amount),0) AS pending FROM withdrawals WHERE user_id=$1 AND status IN ('processing','payout_pending')", [userId]);
    const available = Number(wallet.balance) - Number(pendingRow.pending || 0);
    if (amount - available > 0.0001) {
      throw new AppError('Insufficient available balance. Available: ' + Math.max(0,available).toFixed(2) + ', requested: ' + amount.toFixed(2) + '.', 400, 'INSUFFICIENT_BALANCE');
    }
    const { rows: [wd] } = await client.query(
      "INSERT INTO withdrawals (user_id,wallet_id,amount,payout_method,payout_details,status) VALUES ($1,$2,$3,$4,$5,'processing') RETURNING *",
      [userId, wallet.id, amount, payoutMethod, JSON.stringify({ account_number: accountNumber, beneficiary_name: beneficiaryName })]);
    return wd;
  });
}

async function listMine(userId, { page = 1, limit = 20, status } = {}) {
  const off = (page - 1) * limit;
  const conds = ['user_id=$1']; const params = [userId];
  if (status) { conds.push(`status=$${params.length + 1}`); params.push(status); }
  const { rows } = await query(
    `SELECT * FROM withdrawals WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, off]);
  return rows;
}

async function listPendingForAdmin({ page = 1, limit = 20 } = {}) {
  const off = (page - 1) * limit;
  const { rows } = await query(
    `SELECT w.*, u.full_name, u.phone, u.email,
            CASE WHEN v.user_id IS NOT NULL THEN 'vendor' WHEN r.user_id IS NOT NULL THEN 'rider' ELSE 'other' END AS user_type
     FROM withdrawals w
     JOIN users u ON u.id = w.user_id
     LEFT JOIN vendors v ON v.user_id = w.user_id
     LEFT JOIN riders  r ON r.user_id = w.user_id
     WHERE w.status IN ('processing','payout_pending')
     ORDER BY w.created_at ASC LIMIT $1 OFFSET $2`,
    [limit, off]);
  return rows;
}

// Admin approval uses Modem Pay mobile-money transfer when configured.
// The wallet is debited only after a successful transfer response/webhook.
async function approve(withdrawalId, adminUserId) {
  if (!modemPay.isConfigured()) {
    throw new AppError('Secure payout processing is not available yet. No payout was sent.', 503, 'PROVIDER_UNAVAILABLE');
  }
  if (!modemPay.isWebhookConfigured()) {
    throw new AppError('Payment confirmation is not configured yet. No payout was sent.', 503, 'PROVIDER_UNAVAILABLE');
  }
  if (modemPay.isH2H() && !modemPay.isH2HApproved()) {
    throw new AppError('Direct mobile-money payouts are not available yet. No payout was sent.', 503, 'PROVIDER_UNAVAILABLE');
  }

  const reservation = await withTransaction(async (client) => {
    const { rows: [wd] } = await client.query(
      'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');

    const retryableUnknown = wd.status === 'payout_pending' &&
      ['unknown','unknown_reference','initiation_unknown'].includes(String(wd.provider_status || '').toLowerCase()) &&
      !wd.provider_ref;
    if (wd.status !== 'processing' && !retryableUnknown) {
      throw new AppError('This withdrawal is already processing or has been settled. Check its provider status before retrying.', 409, 'ALREADY_PROCESSED');
    }

    const network = String(wd.payout_method || '').toLowerCase();
    if (!['wave','afrimoney'].includes(network)) {
      throw new AppError('Only Wave and AfriMoney are supported for DAHA mobile-money payouts.', 400, 'UNSUPPORTED_PAYOUT_METHOD');
    }
    const details = wd.payout_details || {};
    const accountNumber = String(details.account_number || '').replace(/\D/g, '');
    const beneficiaryName = String(details.beneficiary_name || '').trim();
    if (!/^(87|86|83)\d{7}$/.test(accountNumber) || !beneficiaryName) {
      throw new AppError('The saved 9-digit payout destination is incomplete or invalid. Ask the user to update it before payout.', 409, 'INVALID_PAYOUT_DESTINATION');
    }

    const { rows: [wallet] } = await client.query(
      'SELECT id,balance FROM wallets WHERE id=$1 FOR UPDATE', [wd.wallet_id]);
    if (!wallet) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');
    const { rows: [otherPending] } = await client.query(
      "SELECT COALESCE(SUM(amount),0) AS amount FROM withdrawals WHERE user_id=$1 AND id<>$2 AND status IN ('processing','payout_pending')",
      [wd.user_id, wd.id]);
    const available = Number(wallet.balance) - Number(otherPending.amount || 0);
    if (Number(wd.amount) - available > 0.0001) {
      throw new AppError('The available DAHA balance is no longer sufficient for this withdrawal.', 409, 'INSUFFICIENT_BALANCE');
    }

    const { rows: [reserved] } = await client.query(
      "UPDATE withdrawals SET status='payout_pending',provider_status='initiating',processed_by=$1,updated_at=now() WHERE id=$2 RETURNING *",
      [adminUserId, wd.id]);
    return { withdrawal: reserved, network, accountNumber, beneficiaryName };
  });

  const wd = reservation.withdrawal;
  const idempotencyKey = 'marketlink-withdrawal-' + wd.id;
  let transfer;
  try {
    transfer = await modemPay.initiateTransfer({
      amount: Number(wd.amount),
      currency: 'GMD',
      network: reservation.network,
      accountNumber: reservation.accountNumber,
      beneficiaryName: reservation.beneficiaryName,
      narration: 'MarketLink DAHA withdrawal ' + wd.id,
      metadata: { withdrawal_id: wd.id, user_id: wd.user_id },
      idempotencyKey,
    });
  } catch (err) {
    const httpStatus = Number(err && (err.status || err.statusCode) || 0);
    const outcomeUnknown = err && err.code === 'MODEM_PAY_NETWORK_ERROR' || httpStatus === 0 || httpStatus === 429 || httpStatus >= 500;
    if (outcomeUnknown) {
      const { rows: [pending] } = await query(
        "UPDATE withdrawals SET provider_status='unknown',provider_response=$1,updated_at=now() WHERE id=$2 AND status='payout_pending' RETURNING *",
        [JSON.stringify({
          outcome: 'unknown',
          error: String(err && (err.code || err.message) || 'network_error').slice(0,160),
          idempotencyKey,
        }), wd.id]);
      // Keep funds reserved. A retry uses the exact same Idempotency-Key so
      // Modem Pay returns the original transfer instead of paying twice.
      return pending || wd;
    }

    await query(
      "UPDATE withdrawals SET status='rejected',provider_status='initiation_failed',provider_response=$1,processed_at=now(),updated_at=now() WHERE id=$2 AND status='payout_pending'",
      [JSON.stringify({ outcome: 'not_accepted', error: String(err && (err.code || err.message) || 'provider_error').slice(0,160) }), wd.id]);
    throw err;
  }

  const data = transfer && transfer.data ? transfer.data : (transfer || {});
  const providerRef = data.id || data.transfer_reference || data.transaction_reference || data.reference || null;
  const providerStatus = String(data.status || (transfer && transfer.status) || 'pending').toLowerCase();
  const saved = await query(
    "UPDATE withdrawals SET provider_ref=$1,provider_status=$2,provider_response=$3,updated_at=now() WHERE id=$4 AND status='payout_pending' RETURNING *",
    [providerRef ? String(providerRef) : null, providerStatus.slice(0,40), JSON.stringify(data), wd.id]);
  if (!saved.rows.length) throw new AppError('Withdrawal changed while the provider transfer was being recorded.', 409, 'WITHDRAWAL_STATE_CHANGED');

  if (['completed','succeeded','success'].includes(providerStatus)) {
    const result = Object.assign({}, data, {
      metadata: Object.assign({}, data.metadata || {}, { withdrawal_id: wd.id }),
      status: providerStatus,
    });
    return completeProviderWithdrawal(wd.id, result);
  }
  if (['failed','rejected','cancelled'].includes(providerStatus)) {
    const result = Object.assign({}, data, {
      metadata: Object.assign({}, data.metadata || {}, { withdrawal_id: wd.id }),
      status: providerStatus,
    });
    return failProviderWithdrawal(wd.id, result);
  }
  if (!providerRef) {
    const { rows: [pending] } = await query(
      "UPDATE withdrawals SET provider_status='unknown_reference',updated_at=now() WHERE id=$1 AND status='payout_pending' RETURNING *",
      [wd.id]);
    return pending || saved.rows[0];
  }
  return saved.rows[0];
}


async function completeProviderWithdrawal(withdrawalId, transfer = {}) {
  return withTransaction(async (client) => {
    const { rows: [wd] } = await client.query(
      'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    if (wd.status === 'completed') return wd;
    if (wd.status !== 'payout_pending') return { ignored: true, reason: 'withdrawal_not_pending' };

    const metadata = transfer.metadata || {};
    if (metadata.withdrawal_id && String(metadata.withdrawal_id) !== String(wd.id)) {
      return { ignored: true, reason: 'withdrawal_metadata_mismatch' };
    }
    const references = [
      transfer.id, transfer.transfer_reference, transfer.transaction_reference, transfer.reference,
    ].filter(Boolean).map(String);
    if (!wd.provider_ref || !references.includes(String(wd.provider_ref))) {
      return { ignored: true, reason: 'provider_reference_mismatch' };
    }
    const providerAmount = Number(transfer.amount);
    if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - Number(wd.amount)) > 0.01) {
      return { ignored: true, reason: 'amount_mismatch' };
    }
    if (String(transfer.currency || '').toUpperCase() !== 'GMD') {
      return { ignored: true, reason: 'currency_mismatch' };
    }
    if (!['completed','succeeded','success'].includes(String(transfer.status || '').toLowerCase())) {
      return { ignored: true, reason: 'transfer_not_confirmed' };
    }

    const { rows: [wallet] } = await client.query(
      'UPDATE wallets SET balance=balance-$1,updated_at=now() WHERE id=$2 AND balance >= $1 RETURNING id,balance',
      [wd.amount, wd.wallet_id]);
    if (!wallet) throw new AppError('Wallet balance is insufficient after provider confirmation.', 409, 'INSUFFICIENT_BALANCE');

    await client.query(
      "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'debit','withdrawal',$2,$3,'withdrawal',$4,'DAHA withdrawal confirmed by payment partner')",
      [wallet.id, wd.amount, wallet.balance, wd.id]);
    const { rows: [updated] } = await client.query(
      "UPDATE withdrawals SET status='completed',provider_status='completed',provider_response=$1,processed_at=now(),updated_at=now() WHERE id=$2 RETURNING *",
      [JSON.stringify(transfer), wd.id]);
    await client.query(
      "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'withdrawal_completed','DAHA withdrawal completed',$2,'withdrawal',$3)",
      [wd.user_id, 'Your DAHA Wallet withdrawal of D ' + Number(wd.amount).toFixed(2) + ' has been confirmed by our payment partner.', wd.id]);
    return updated;
  });
}


async function failProviderWithdrawal(withdrawalId, transfer = {}) {
  return withTransaction(async (client) => {
    const { rows: [wd] } = await client.query(
      'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    if (wd.status === 'rejected') return wd;
    if (wd.status === 'completed') return { ignored: true, reason: 'already_completed' };
    if (wd.status !== 'payout_pending') return { ignored: true, reason: 'withdrawal_not_pending' };

    const metadata = transfer.metadata || {};
    if (metadata.withdrawal_id && String(metadata.withdrawal_id) !== String(wd.id)) {
      return { ignored: true, reason: 'withdrawal_metadata_mismatch' };
    }
    const references = [
      transfer.id, transfer.transfer_reference, transfer.transaction_reference, transfer.reference,
    ].filter(Boolean).map(String);
    if (!wd.provider_ref || !references.includes(String(wd.provider_ref))) {
      return { ignored: true, reason: 'provider_reference_mismatch' };
    }
    const transferAmount = Number(transfer.amount);
    if (!Number.isFinite(transferAmount) || Math.abs(transferAmount - Number(wd.amount)) > 0.01) {
      return { ignored: true, reason: 'amount_mismatch' };
    }
    if (String(transfer.currency || '').toUpperCase() !== 'GMD') {
      return { ignored: true, reason: 'currency_mismatch' };
    }
    const { rows: [updated] } = await client.query(
      "UPDATE withdrawals SET status='rejected',provider_status=$1,provider_response=$2,processed_at=now(),updated_at=now() WHERE id=$3 RETURNING *",
      [String(transfer.status || 'failed').slice(0,40), JSON.stringify(transfer), wd.id]);
    await client.query(
      "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'withdrawal_failed','DAHA withdrawal not completed',$2,'withdrawal',$3)",
      [wd.user_id, 'Your DAHA Wallet withdrawal of D ' + Number(wd.amount).toFixed(2) + ' was not completed. Your reserved funds are available again.', wd.id]);
    return updated;
  });
}


async function processProviderWebhook(event) {
  const payload = event && event.payload || {};
  const withdrawalId = payload.metadata && payload.metadata.withdrawal_id;
  if (!withdrawalId) return { ignored:true, reason:'missing_withdrawal_id' };
  if (!/^[0-9a-f-]{36}$/i.test(String(withdrawalId))) return { ignored:true, reason:'invalid_withdrawal_id' };

  if (event.event === 'transfer.succeeded') {
    return { processed:true, data:await completeProviderWithdrawal(withdrawalId,payload) };
  }
  if (event.event === 'transfer.flagged') {
    return withTransaction(async (client) => {
      const { rows: [wd] } = await client.query(
        'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
      if (!wd) return { ignored:true, reason:'withdrawal_not_found' };
      const references = [payload.id,payload.transfer_reference,payload.transaction_reference,payload.reference].filter(Boolean).map(String);
      if (wd.status !== 'payout_pending' || !wd.provider_ref || !references.includes(String(wd.provider_ref))) {
        return { ignored:true, reason:'provider_reference_mismatch' };
      }
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || Math.abs(amount - Number(wd.amount)) > 0.01) {
        return { ignored:true, reason:'amount_mismatch' };
      }
      if (String(payload.currency || '').toUpperCase() !== 'GMD') {
        return { ignored:true, reason:'currency_mismatch' };
      }
      const { rows: [updated] } = await client.query(
        "UPDATE withdrawals SET provider_status='flagged',provider_response=$1,updated_at=now() WHERE id=$2 RETURNING id,status,provider_status",
        [JSON.stringify(payload), wd.id]);
      return { processed:true, data:updated || null, held_for_review:true };
    });
  }
  if (event.event === 'transfer.reversed') {
    return withTransaction(async (client) => {
      const { rows: [wd] } = await client.query(
        'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
      if (!wd) return { ignored:true, reason:'withdrawal_not_found' };
      const references = [payload.id,payload.transfer_reference,payload.transaction_reference,payload.reference].filter(Boolean).map(String);
      if (!wd.provider_ref || !references.includes(String(wd.provider_ref))) {
        return { ignored:true, reason:'provider_reference_mismatch' };
      }
      const reversedAmount = Number(payload.amount);
      if (!Number.isFinite(reversedAmount) || Math.abs(reversedAmount - Number(wd.amount)) > 0.01) {
        return { ignored:true, reason:'amount_mismatch' };
      }
      if (String(payload.currency || '').toUpperCase() !== 'GMD') {
        return { ignored:true, reason:'currency_mismatch' };
      }
      if (wd.status === 'rejected' && wd.provider_status === 'reversed') {
        return { duplicate:true, withdrawalId:wd.id };
      }
      if (wd.status === 'payout_pending') {
        const { rows: [updated] } = await client.query(
          "UPDATE withdrawals SET status='rejected',provider_status='reversed',provider_response=$1,processed_at=now(),updated_at=now() WHERE id=$2 RETURNING *",
          [JSON.stringify(payload), wd.id]);
        return { processed:true, data:updated, fundsDebited:false };
      }
      if (wd.status !== 'completed') return { ignored:true, reason:'withdrawal_not_reversible' };
      const { rows: [wallet] } = await client.query(
        'UPDATE wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING id,balance',
        [wd.amount,wd.wallet_id]);
      if (!wallet) throw new AppError('Wallet not found while reversing a payout.',404,'WALLET_NOT_FOUND');
      await client.query(
        "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'credit','withdrawal_reversal',$2,$3,'withdrawal',$4,'DAHA withdrawal reversed by payment partner')",
        [wallet.id,wd.amount,wallet.balance,wd.id]);
      const { rows: [updated] } = await client.query(
        "UPDATE withdrawals SET status='rejected',provider_status='reversed',provider_response=$1,processed_at=now(),updated_at=now() WHERE id=$2 RETURNING *",
        [JSON.stringify(payload),wd.id]);
      await client.query(
        "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'withdrawal_reversed','DAHA withdrawal reversed','The payment partner reversed the payout. The amount has been returned to your DAHA Wallet.','withdrawal',$2)",
        [wd.user_id,wd.id]);
      return { processed:true,data:updated,fundsReturned:true };
    });
  }
  if (['transfer.failed','transfer.cancelled'].includes(event.event)) {
    return { processed:true, data:await failProviderWithdrawal(withdrawalId,payload) };
  }
  return { ignored:true, reason:'unsupported_event' };
}


async function reject(withdrawalId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows: [wd] } = await client.query(
      'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    if (wd.status !== 'processing') {
      throw new AppError('Withdrawal is already ' + wd.status + '. A payout that has already been sent for processing cannot be rejected here.', 409, 'ALREADY_PROCESSED');
    }
    const { rows: [updated] } = await client.query(
      "UPDATE withdrawals SET status='rejected',provider_status='rejected_by_admin',processed_by=$1,processed_at=now(),updated_at=now() WHERE id=$2 AND status='processing' RETURNING *",
      [adminUserId, withdrawalId]);
    if (!updated) throw new AppError('Withdrawal state changed before rejection completed.', 409, 'WITHDRAWAL_STATE_CHANGED');
    await client.query(
      "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'withdrawal_rejected','DAHA withdrawal rejected','Your DAHA Wallet withdrawal request was rejected by MarketLink support. No money was sent.', 'withdrawal',$2)",
      [wd.user_id, wd.id]);
    return updated;
  });
}

module.exports = { getBalance, requestWithdrawal, listMine, listPendingForAdmin, approve, reject, processProviderWebhook };
