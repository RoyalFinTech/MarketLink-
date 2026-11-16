jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../orders/service', () => ({
  settleOrderFinancials: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { withTransaction } = require('../../config/db');
const ordersService = require('../orders/service');
const { updateStatus } = require('./service');

describe('delivery status transitions', () => {
  let clientQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation((callback) => callback({ query: clientQuery }));
  });

  test('locks and rechecks the delivery before applying a transition', async () => {
    clientQuery.mockResolvedValueOnce({
      rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }],
    });

    await expect(updateStatus('delivery-1', 'in_transit', 'rider-1', ['rider']))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toMatch(/FOR UPDATE/i);
    expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
  });

  test('retries settlement when the delivery is already marked delivered', async () => {
    clientQuery.mockResolvedValueOnce({
      rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }],
    });
    ordersService.settleOrderFinancials.mockResolvedValue({ settled: true });

    const result = await updateStatus('delivery-1', 'delivered', 'rider-1', ['rider']);

    expect(result.status).toBe('delivered');
    expect(result).not.toHaveProperty('settlementRetry');
    expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith('order-1');
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('records the order timeline and settles only after delivery is committed', async () => {
    clientQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'in_transit' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // update order status
      .mockResolvedValueOnce({ rows: [] }) // append order status history
      .mockResolvedValueOnce({ rows: [{ customer_id: 'customer-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // customer notification
      .mockResolvedValueOnce({ rows: [] }); // stop delivery GPS sharing

    await updateStatus('delivery-1', 'delivered', 'rider-1', ['rider']);

    expect(clientQuery.mock.calls[0][0]).toMatch(/FOR UPDATE/i);
    expect(clientQuery.mock.calls.some(([sql]) => /INSERT INTO order_status_history/i.test(sql))).toBe(true);
    expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith('order-1');
  });
});
