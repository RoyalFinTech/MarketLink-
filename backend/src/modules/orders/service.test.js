jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { query, withTransaction } = require('../../config/db');
const { updateStatus } = require('./service');

describe('order status concurrency', () => {
  let clientQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation((callback) => callback({ query: clientQuery }));
  });

  test('rejects an order update when another action changed its state first', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'order-1',
        status: 'pending',
        vendor_id: 'vendor-1',
        payment_status: 'pending',
      }],
    });
    clientQuery.mockResolvedValueOnce({ rows: [] });

    await expect(updateStatus('order-1', 'accepted', 'vendor-1', ['vendor'], 'Accepted'))
      .rejects.toMatchObject({ code: 'ORDER_STATE_CHANGED', statusCode: 409 });

    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toMatch(/status=\$3/i);
  });

  test('does not repeat cancellation side effects for an already-cancelled order', async () => {
    const cancelled = {
      id: 'order-1',
      status: 'cancelled',
      vendor_id: 'vendor-1',
      payment_status: 'pending',
    };
    query.mockResolvedValueOnce({ rows: [cancelled] });

    await expect(updateStatus('order-1', 'cancelled', 'admin-1', ['admin'], 'Retry'))
      .resolves.toEqual(cancelled);

    expect(withTransaction).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
