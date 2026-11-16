jest.mock('../../config/db', () => ({ query: jest.fn() }));

const { query } = require('../../config/db');
const { getFinancialReconciliation } = require('./service');

describe('admin financial reconciliation report', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns read-only issue counts and paginated detail rows', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { issue_type: 'ledger_mismatch', severity: 'critical', count: 2 },
        { issue_type: 'withdrawal_stale', severity: 'warning', count: 1 },
      ] })
      .mockResolvedValueOnce({ rows: [
        { issue_type: 'ledger_mismatch', severity: 'critical', reference: 'ML-1001', amount: '25.00' },
      ] });

    const result = await getFinancialReconciliation({ page: 2, limit: 1 });

    expect(result).toMatchObject({
      status: 'attention_required',
      totalIssues: 3,
      counts: { ledger_mismatch: 2, withdrawal_stale: 1 },
      items: [{ reference: 'ML-1001' }],
      page: 2,
      limit: 1,
      totalPages: 3,
      readOnly: true,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual([1, 1]);
    expect(query.mock.calls[0][0]).toMatch(/FROM orders/i);
    expect(query.mock.calls[0][0]).toMatch(/wallet_ledger_mismatch/);
    expect(query.mock.calls[0][0]).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)/i);
  });

  test('returns a clear state when no anomalies are found and caps page size', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getFinancialReconciliation({ page: 0, limit: 500 });

    expect(result).toMatchObject({
      status: 'clear',
      totalIssues: 0,
      counts: {},
      items: [],
      page: 1,
      limit: 100,
      totalPages: 0,
      readOnly: true,
    });
    expect(query.mock.calls[1][1]).toEqual([100, 0]);
  });
});
