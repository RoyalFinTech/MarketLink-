'use strict';

jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
const db = require('../../config/db');
const { adminReview } = require('./service');

describe('Admin promotion review workflow', () => {
  const client = { query: jest.fn() };
  const promotion = {
    id: 'promo-1',
    status: 'approved',
    payment_status: 'unpaid',
    banner_url: 'https://cdn.example.test/banner.jpg',
    starts_at: null,
    ends_at: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.withTransaction.mockImplementation(fn => fn(client));
  });

  test('publishes only an approved, paid promotion and records the payment reference in the audit trail', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [promotion] })
      .mockResolvedValueOnce({ rows: [{ ...promotion, status: 'published', payment_status: 'paid' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await adminReview('promo-1', 'admin-1', {
      status: 'published',
      paymentStatus: 'paid',
      paymentReference: 'MP-TX-1234',
      adminNotes: 'Checked against company statement.',
    });

    expect(result).toMatchObject({ status: 'published', payment_status: 'paid' });
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1][0]).toMatch(/published_at=CASE WHEN \$2='published'/);
    expect(client.query.mock.calls[1][1]).toEqual([
      'promo-1',
      'published',
      'paid',
      expect.stringContaining('MP-TX-1234'),
      'admin-1',
      null,
      null,
    ]);
    expect(client.query.mock.calls[2][0]).toMatch(/promotion\.reviewed/);
    expect(client.query.mock.calls[2][1][3]).toContain('MP-TX-1234');
  });

  test('rejects publishing before approval', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ ...promotion, status: 'pending' }] });

    await expect(adminReview('promo-1', 'admin-1', {
      status: 'published',
      paymentStatus: 'paid',
      paymentReference: 'MP-TX-1234',
    })).rejects.toMatchObject({ code: 'PROMOTION_APPROVAL_REQUIRED' });

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('requires a provider or statement reference before marking a request paid', async () => {
    client.query.mockResolvedValueOnce({ rows: [promotion] });

    await expect(adminReview('promo-1', 'admin-1', {
      paymentStatus: 'paid',
      adminNotes: 'Looks paid.',
    })).rejects.toMatchObject({ code: 'PROMOTION_PAYMENT_REFERENCE_REQUIRED' });

    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
