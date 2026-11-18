'use strict';

jest.mock('../../config/db', () => ({ query: jest.fn() }));
const { query } = require('../../config/db');
const { getAnalytics } = require('./service');

describe('Admin analytics', () => {
  beforeEach(() => query.mockReset());

  test('returns complete-day revenue series, period comparisons and data-backed recommendations', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ day: '2026-11-17T00:00:00Z', orders: 2, revenue: '100', platform_gross_commission: '8', affiliate_commission: '1', platform_net_revenue: '7' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'delivered', count: 2 }, { status: 'pending', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Groceries', products: 5, orders: 2 }] })
      .mockResolvedValueOnce({ rows: [{ day: '2026-11-17T00:00:00Z', users: 4 }] })
      .mockResolvedValueOnce({ rows: [{ current_gmv: '100', previous_gmv: '50', current_net: '7', previous_net: '5' }] });

    const result = await getAnalytics({ period: '7d' });

    expect(result.period).toBe('7d');
    expect(result.days).toBe(7);
    expect(result.dailyRevenue[0]).toMatchObject({ orders: 2, revenue: '100', platform_net_revenue: '7' });
    expect(result.trend).toMatchObject({
      currentGmv: 100,
      previousGmv: 50,
      gmvChangePct: 100,
      currentPlatformNet: 7,
      previousPlatformNet: 5,
      platformNetChangePct: 40,
    });
    expect(result.totals).toMatchObject({ orders: 3, deliveredOrders: 2, signups: 4 });
    expect(result.insights.items.some(item => item.title === 'Marketplace sales are up')).toBe(true);
    expect(result.insights.items.some(item => item.title === 'Orders still need operational follow-up')).toBe(true);
    expect(result.insights.items.some(item => item.title === 'Leading sales category: Groceries')).toBe(true);
    expect(result.insights.method).toMatch(/rules-based/i);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0][0]).toMatch(/generate_series/i);
    expect(query.mock.calls[0][0]).toMatch(/payment_status='confirmed'/i);
    expect(query.mock.calls[1][0]).toMatch(/date_trunc\('day',now\(\)\)/i);
    expect(query.mock.calls[4][0]).toMatch(/previous_gmv/i);
    expect(query.mock.calls.every(([, params]) => Array.isArray(params))).toBe(true);
  });

  test('does not invent percentage growth or sales when both comparison periods are empty', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ current_gmv: '0', previous_gmv: '0', current_net: '0', previous_net: '0' }] });

    const result = await getAnalytics({ period: '30d' });

    expect(result.trend.gmvChangePct).toBeNull();
    expect(result.trend.platformNetChangePct).toBeNull();
    expect(result.totals).toEqual({ orders: 0, deliveredOrders: 0, signups: 0 });
    expect(result.insights.items[0]).toMatchObject({ type: 'attention', title: 'No confirmed completed sales yet' });
  });
});
