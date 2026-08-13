'use strict';
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
  return w;
}

async function requestWithdrawal(userId, { amount, payoutMethod, payoutDetails }) {
  amount = parseFloat(amount);
  if (!(amount > 0)) throw new AppError('Withdrawal amount must be greater than zero.', 400, 'INVALID_AMOUNT');
  if (amount < MIN_WITHDRAWAL) throw new AppError(`Minimum withdrawal is ${MIN_WITHDRAWAL} GMD.`, 400, 'BELOW_MINIMUM');
  if (!payoutMethod) throw new AppError('A payout method is required.', 400, 'PAYOUT_METHOD_REQUIRED');

  return withTransaction(async (client) => {
    // Lock the wallet row for the duration of this transaction so two simultaneous
    // withdrawal requests can't both read the same balance and both succeed.
    const { rows: [wallet] } = await client.query(
      'SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!wallet) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');

    // Reserve against balance minus anything already pending, so a user can't queue up
    // multiple withdrawal requests that together exceed their real balance.
    const { rows: [pendingRow] } = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS pending FROM withdrawals
       WHERE user_id=$1 AND status='processing'`, [userId]);
    const available = parseFloat(wallet.balance) - parseFloat(pendingRow.pending);
    if (amount > available) {
      throw new AppError(
        `Insufficient available balance. Available: ${available.toFixed(2)}, requested: ${amount.toFixed(2)}.`,
        400, 'INSUFFICIENT_BALANCE');
    }

    const { rows: [wd] } = await client.query(
      `INSERT INTO withdrawals (user_id,wallet_id,amount,payout_method,payout_details,status)
       VALUES ($1,$2,$3,$4,$5,'processing') RETURNING *`,
      [userId, wallet.id, amount, payoutMethod, payoutDetails ? JSON.stringify(payoutDetails) : null]);
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
     WHERE w.status='processing'
     ORDER BY w.created_at ASC LIMIT $1 OFFSET $2`,
    [limit, off]);
  return rows;
}

// Admin approves: debits the wallet, writes a transaction record, marks completed.
async function approve(withdrawalId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows: [wd] } = await client.query(
      'SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');
    if (wd.status !== 'processing') throw new AppError(`Withdrawal already ${wd.status}.`, 400, 'ALREADY_PROCESSED');

    const { rows: [wallet] } = await client.query(
      'SELECT * FROM wallets WHERE id=$1 FOR UPDATE', [wd.wallet_id]);
    if (parseFloat(wallet.balance) < parseFloat(wd.amount)) {
      throw new AppError('Wallet balance is insufficient to complete this withdrawal.', 400, 'INSUFFICIENT_BALANCE');
    }
    const newBalance = parseFloat(wallet.balance) - parseFloat(wd.amount);
    await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [newBalance, wallet.id]);
    await client.query(
      `INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description)
       VALUES ($1,'debit','withdrawal',$2,$3,'withdrawal',$4,'Withdrawal payout')`,
      [wallet.id, wd.amount, newBalance, wd.id]);
    const { rows: [updated] } = await client.query(
      `UPDATE withdrawals SET status='completed', processed_by=$1, processed_at=now() WHERE id=$2 RETURNING *`,
      [adminUserId, withdrawalId]);
    return updated;
  });
}

async function reject(withdrawalId, adminUserId) {
  const { rows: [wd] } = await query('SELECT * FROM withdrawals WHERE id=$1', [withdrawalId]);
  if (!wd) throw new AppError('Withdrawal not found.', 404, 'WITHDRAWAL_NOT_FOUND');
  if (wd.status !== 'processing') throw new AppError(`Withdrawal already ${wd.status}.`, 400, 'ALREADY_PROCESSED');
  const { rows: [updated] } = await query(
    `UPDATE withdrawals SET status='rejected', processed_by=$1, processed_at=now() WHERE id=$2 RETURNING *`,
    [adminUserId, withdrawalId]);
  return updated;
}

module.exports = { getBalance, requestWithdrawal, listMine, listPendingForAdmin, approve, reject };
