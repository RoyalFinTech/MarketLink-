'use strict';

jest.mock('../../config/db', () => ({ query: jest.fn() }));
const { query } = require('../../config/db');
const { getFinancialReconciliation } = require('./financialReconciliation');

describe('admin financial reconciliation', () => {
  beforeEach(() => query.mockReset());

  test('returns bounded, read-only findings from all reconciliation checks', async () => {
    const samples = [
      [{ id: 'missing-commission', order_number: 'ML-1' }],
      [{ id: 'pending-settlement', order_number: 'ML-2' }],
      [{ id: 'amount-mismatch', order_number: 'ML-3' }],
      [{ id: 'missing-recipient', order_number: 'ML-4' }],
      [{ id: 'missing-credit', order_number: 'ML-5' }],
      [{ id: 'withdrawal', status: 'payout_pending' }],
      [{ wallet_id: 'wallet-1', difference: '2.00' }],
      [{ kind: 'wallet_transaction_reference', duplicate_count: '2' }],
    ];
    samples.forEach(rows => query.mockResolvedValueOnce({ rows }));

    const result = await getFinancialReconciliation({ limit: '500' });

    expect(result.readOnly).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.totalFindings).toBe(8);
    expect(result.counts.deliveredWithoutCommission).toBe(1);
    expect(result.counts.pendingSettlement).toBe(1);
    expect(result.counts.amountMismatches).toBe(1);
    expect(result.counts.missingRecipients).toBe(1);
    expect(result.counts.missingWalletCredits).toBe(1);
    expect(result.counts.withdrawalsNeedingAttention).toBe(1);
    expect(result.counts.walletLedgerMismatches).toBe(1);
    expect(result.counts.duplicateReferences).toBe(1);
    expect(query).toHaveBeenCalledTimes(8);
    expect(query.mock.calls[0][1]).toEqual([100]);
    expect(query.mock.calls[2][1]).toEqual([0.01, 100]);
    expect(query.mock.calls.every(([sql]) => /^SELECT/i.test(sql.trim()))).toBe(true);
  });

  test('uses the default limit for invalid input', async () => {
    for (let i = 0; i < 8; i++) query.mockResolvedValueOnce({ rows: [] });
    const result = await getFinancialReconciliation({ limit: 'not-a-number' });
    expect(result.limit).toBe(50);
    expect(result.totalFindings).toBe(0);
  });
});
