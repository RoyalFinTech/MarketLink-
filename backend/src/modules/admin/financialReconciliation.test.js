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
      [{ remittance_id: 'remit-1', remittance_status: 'submitted', payment_record_status: 'pending' }],
      [{ kind: 'wallet_transaction_reference', duplicate_count: '2' }],
      [{ id: 'wrong-wallet-credit', vendor_wrong_recipient_count: 1 }],
      [{ reversal_id: 'refund-recovery-1', recovery_reason: 'INSUFFICIENT_BENEFICIARY_BALANCE' }],
    ];
    samples.forEach(rows => query.mockResolvedValueOnce({ rows }));

    const result = await getFinancialReconciliation({ limit: '500' });

    expect(result.readOnly).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.totalFindings).toBe(11);
    expect(result.counts.deliveredWithoutCommission).toBe(1);
    expect(result.counts.pendingSettlement).toBe(1);
    expect(result.counts.amountMismatches).toBe(1);
    expect(result.counts.missingRecipients).toBe(1);
    expect(result.counts.missingWalletCredits).toBe(1);
    expect(result.counts.withdrawalsNeedingAttention).toBe(1);
    expect(result.counts.walletLedgerMismatches).toBe(1);
    expect(result.counts.codRemittancesNeedingAttention).toBe(1);
    expect(result.counts.duplicateReferences).toBe(1);
    expect(result.counts.settlementCreditMismatches).toBe(1);
    expect(result.counts.refundsNeedingRecovery).toBe(1);
    expect(query).toHaveBeenCalledTimes(11);
    expect(query.mock.calls[9][0]).toMatch(/wrong_recipient_count/i);
    expect(query.mock.calls[9][0]).toMatch(/credit_amount/i);
    expect(query.mock.calls[9][0]).toMatch(/payout_fee_recovery_amount/i);
    expect(query.mock.calls[10][0]).toMatch(/FROM financial_reversals/i);
    expect(query.mock.calls[10][0]).toMatch(/recovery_required/i);
    expect(query.mock.calls[7][0]).toMatch(/FROM cod_cash_remittances/i);
    expect(query.mock.calls[7][0]).toMatch(/r.status='submitted'/i);
    expect(query.mock.calls[7][0]).toMatch(/r.status='verified'/i);
    expect(query.mock.calls[0][1]).toEqual([100]);
    expect(query.mock.calls[2][1]).toEqual([0.01, 100]);
    expect(query.mock.calls[4][1]).toEqual([0.01, 100]);
    expect(query.mock.calls[6][0]).toMatch(/LEFT JOIN LATERAL/i);
    expect(query.mock.calls[6][0]).toMatch(/has_no_ledger_entries/i);
    expect(query.mock.calls[6][0]).toMatch(/COALESCE\(latest\.balance_after,0\)/i);
    expect(query.mock.calls.every(([sql]) => /^SELECT/i.test(sql.trim()))).toBe(true);
  });

  test('uses the default limit for invalid input', async () => {
    for (let i = 0; i < 11; i++) query.mockResolvedValueOnce({ rows: [] });
    const result = await getFinancialReconciliation({ limit: 'not-a-number' });
    expect(result.limit).toBe(50);
    expect(result.totalFindings).toBe(0);
  });
});
