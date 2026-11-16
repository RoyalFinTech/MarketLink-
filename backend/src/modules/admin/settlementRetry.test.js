'use strict';

jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('../orders/service', () => ({ settleOrderFinancials: jest.fn() }));

const { query } = require('../../config/db');
const ordersService = require('../orders/service');
const { retryFinancialSettlement } = require('./service');

describe('Admin financial settlement retry', () => {
  const actor = { id: 'admin-user-id', role: 'super_admin' };

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue({ rows: [] });
  });

  test('writes an audit record before invoking the existing idempotent settlement routine', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    ordersService.settleOrderFinancials.mockResolvedValue({ settled: true });

    const result = await retryFinancialSettlement('order-id', actor, 'Verified COD receipt');

    expect(result).toEqual({ settled: true });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringMatching(/INSERT INTO admin_action_logs/i), [
      actor.id, actor.role, 'order-id',
      JSON.stringify({ reason: 'Verified COD receipt', idempotencyScope: 'order:order-id' }),
    ]);
    expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith('order-id');
    expect(query).toHaveBeenNthCalledWith(2, expect.stringMatching(/financial\.settlement_retry_completed/i), [
      JSON.stringify({ reason: 'Verified COD receipt', result: { settled: true } }), 42,
    ]);
  });

  test('records a failed attempt and rethrows settlement validation errors', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 43 }] });
    const error = Object.assign(new Error('Ledger mismatch'), { code: 'SETTLEMENT_LEDGER_MISMATCH' });
    ordersService.settleOrderFinancials.mockRejectedValue(error);

    await expect(retryFinancialSettlement('order-id', actor, 'Reviewed exception'))
      .rejects.toBe(error);

    expect(query).toHaveBeenNthCalledWith(2, expect.stringMatching(/financial\.settlement_retry_failed/i), [
      JSON.stringify({ reason: 'Reviewed exception', errorCode: 'SETTLEMENT_LEDGER_MISMATCH' }), 43,
    ]);

  test('records a non-eligible order without claiming settlement completed', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 44 }] });
    ordersService.settleOrderFinancials.mockResolvedValue({ settled: false, reason: 'PAYMENT_NOT_CONFIRMED' });

    const result = await retryFinancialSettlement('order-id', actor, 'Reviewed payment state');

    expect(result).toEqual({ settled: false, reason: 'PAYMENT_NOT_CONFIRMED' });
    expect(query).toHaveBeenNthCalledWith(2, expect.stringMatching(/financial\\.settlement_retry_not_eligible/i), [
      JSON.stringify({ reason: 'Reviewed payment state', result }), 44,
    ]);
  });
  });
});
