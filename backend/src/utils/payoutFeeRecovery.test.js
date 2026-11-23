'use strict';

const { AppError } = require('../middleware/errorHandler');
const {
  calculatePayoutFeeRecovery,
  validatePayoutFeeRecoveryPct,
} = require('./payoutFeeRecovery');

describe('customer-funded payout fee recovery', () => {
  test('calculates 2% on vendor, rider and affiliate payout amounts', () => {
    expect(calculatePayoutFeeRecovery({
      vendorPayout: 95,
      riderPayout: 25,
      affiliatePayout: 2,
      pct: 2,
    })).toEqual({
      payoutBaseGmd: 122,
      payoutFeeRecoveryPct: 2,
      payoutFeeRecoveryAmount: 2.44,
    });
  });

  test('returns zero when Admin disables the recovery setting', () => {
    expect(calculatePayoutFeeRecovery({
      vendorPayout: 95,
      riderPayout: 25,
      affiliatePayout: 2,
      pct: 0,
    }).payoutFeeRecoveryAmount).toBe(0);
  });

  test('rounds the recovery to two GMD decimals', () => {
    expect(calculatePayoutFeeRecovery({
      vendorPayout: 10.01,
      riderPayout: 1.11,
      affiliatePayout: 0,
      pct: 2,
    }).payoutFeeRecoveryAmount).toBe(0.22);
  });

  test('rejects negative payout amounts', () => {
    expect(() => calculatePayoutFeeRecovery({vendorPayout: -1}))
      .toThrow(AppError);
  });

  test('rejects recovery percentages above the 10% ceiling', () => {
    expect(() => validatePayoutFeeRecoveryPct(10.01, 400))
      .toThrow(AppError);
  });
});
