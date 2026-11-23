'use strict';

const { AppError } = require('../middleware/errorHandler');

const DEFAULT_PAYOUT_FEE_RECOVERY_PCT = 2;
const MAX_PAYOUT_FEE_RECOVERY_PCT = 10;

function roundGmd(value) {
  return Number(Number(value).toFixed(2));
}

function validatePayoutFeeRecoveryPct(value, statusCode = 500) {
  const pct = Number(value == null ? DEFAULT_PAYOUT_FEE_RECOVERY_PCT : value);
  if (!Number.isFinite(pct) || pct < 0 || pct > MAX_PAYOUT_FEE_RECOVERY_PCT) {
    throw new AppError(
      'Payout cost recovery must be between 0% and 10%.',
      statusCode,
      'INVALID_PAYOUT_FEE_RECOVERY'
    );
  }
  return roundGmd(pct);
}

function calculatePayoutFeeRecovery({
  vendorPayout = 0,
  riderPayout = 0,
  affiliatePayout = 0,
  pct = DEFAULT_PAYOUT_FEE_RECOVERY_PCT,
} = {}) {
  const payouts = [vendorPayout, riderPayout, affiliatePayout].map(Number);
  if (payouts.some(value => !Number.isFinite(value) || value < 0)) {
    throw new AppError(
      'The payout amounts are invalid. No recovery amount was calculated.',
      500,
      'PAYOUT_FEE_BASE_INVALID'
    );
  }
  const recoveryPct = validatePayoutFeeRecoveryPct(pct, 500);
  const payoutBase = roundGmd(payouts.reduce((sum, value) => sum + value, 0));
  const recoveryAmount = roundGmd(payoutBase * recoveryPct / 100);
  return {
    payoutBaseGmd: payoutBase,
    payoutFeeRecoveryPct: recoveryPct,
    payoutFeeRecoveryAmount: recoveryAmount,
  };
}

module.exports = {
  DEFAULT_PAYOUT_FEE_RECOVERY_PCT,
  MAX_PAYOUT_FEE_RECOVERY_PCT,
  validatePayoutFeeRecoveryPct,
  calculatePayoutFeeRecovery,
};
