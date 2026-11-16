'use strict';

jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('../orders/service', () => ({ settleOrderFinancials: jest.fn() }));

const { query } = require('../../config/db');
const { getAdminTransactions, getFailedPayments } = require('./service');

describe('Admin financial feeds', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns paginated wallet transactions with parameterized filters', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1', type: 'credit', amount: '20.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: 21 }] });

    const result = await getAdminTransactions({ page: 2, limit: 10, type: 'credit', category: 'vendor_sale' });

    expect(result).toMatchObject({
      items: [{ id: 'tx-1' }],
      total: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
    expect(query.mock.calls[0][1]).toEqual(['credit', 'vendor_sale', 10, 10]);
    expect(query.mock.calls[1][1]).toEqual(['credit', 'vendor_sale']);
    expect(query.mock.calls[0][0]).toMatch(/FROM transactions/i);
  });

  test('returns paginated failed and stale pending payments without customer contact details', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'payment-1', status: 'failed', order_number: 'ML-100' }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await getFailedPayments({ page: 2, limit: 10, method: 'cod' });

    expect(result).toMatchObject({
      items: [{ id: 'payment-1' }],
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
    });
    expect(query.mock.calls[0][1]).toEqual(['cod', 10, 10]);
    expect(query.mock.calls[0][0]).toMatch(/INTERVAL '15 minutes'/i);
    expect(query.mock.calls[0][0]).not.toMatch(/phone|email/i);
  });
});
