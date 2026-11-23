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

const { query, withTransaction } = require('../../config/db');
const ordersService = require('../orders/service');
const { updateStatus, getTracking } = require('./service');

describe('delivery status transitions', () => {
  let clientQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation((callback) => callback({ query: clientQuery }));
  });

  test('locks and rechecks the delivery before applying a transition', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ order_id: 'order-1' }] }) // delivery snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'delivered' }] }) // locked order
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }] }); // locked delivery

    await expect(updateStatus('delivery-1', 'in_transit', 'rider-1', ['rider']))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(clientQuery.mock.calls[0][0]).toMatch(/SELECT order_id FROM deliveries/i);
    expect(clientQuery.mock.calls[1][0]).toMatch(/FROM orders WHERE id=\$1 FOR UPDATE/i);
    expect(clientQuery.mock.calls[2][0]).toMatch(/FROM deliveries WHERE id=\$1 AND order_id=\$2 FOR UPDATE/i);
    expect(ordersService.settleOrderFinancials).not.toHaveBeenCalled();
  });

  test('retries settlement when the delivery is already marked delivered', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ order_id: 'order-1' }] }) // delivery snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'delivered' }] }) // locked order
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }] }); // locked delivery
    ordersService.settleOrderFinancials.mockResolvedValue({ settled: true });

    const result = await updateStatus('delivery-1', 'delivered', 'rider-1', ['rider']);

    expect(result.status).toBe('delivered');
    expect(result).not.toHaveProperty('settlementRetry');
    expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith('order-1');
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  test('records the order timeline and settles only after delivery is committed', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ order_id: 'order-1' }] }) // delivery snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'on_the_way' }] }) // locked order
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'in_transit' }] }) // locked delivery
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1', order_id: 'order-1', rider_id: 'rider-1', status: 'delivered' }] }) // update delivery
      .mockResolvedValueOnce({ rows: [] }) // update order status
      .mockResolvedValueOnce({ rows: [] }) // append order status history
      .mockResolvedValueOnce({ rows: [{ customer_id: 'customer-1' }] }) // customer lookup
      .mockResolvedValueOnce({ rows: [] }) // customer notification
      .mockResolvedValueOnce({ rows: [] }); // stop delivery GPS sharing

    await updateStatus('delivery-1', 'delivered', 'rider-1', ['rider']);

    expect(clientQuery.mock.calls[0][0]).toMatch(/SELECT order_id FROM deliveries/i);
    expect(clientQuery.mock.calls[1][0]).toMatch(/FROM orders WHERE id=\$1 FOR UPDATE/i);
    expect(clientQuery.mock.calls[2][0]).toMatch(/FROM deliveries WHERE id=\$1 AND order_id=\$2 FOR UPDATE/i);
    expect(clientQuery.mock.calls.some(([sql]) => /INSERT INTO order_status_history/i.test(sql))).toBe(true);
    expect(ordersService.settleOrderFinancials).toHaveBeenCalledWith('order-1');
  });
});


describe('delivery GPS tracking privacy', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the saved address pin and GPS trail only behind the active delivery consent guard', async () => {
    const trail=[{lat:'13.4532',lng:'-16.5775',recorded_at:'2026-11-23T06:00:00.000Z'}];
    query.mockResolvedValueOnce({rows:[{
      id:'delivery-1',customer_id:'customer-1',vendor_id:'vendor-1',rider_id:'rider-1',
      status:'in_transit',dropoff_lat:'13.4532',dropoff_lng:'-16.5775',location_trail:trail
    }]});
    const result=await getTracking('delivery-1','customer-1',['customer']);
    expect(result.location_trail).toEqual(trail);
    expect(result.dropoff_lat).toBe('13.4532');
    const sql=query.mock.calls[0][0];
    expect(sql).toContain('COALESCE(d.dropoff_lat,da.latitude) AS dropoff_lat');
    expect(sql).toContain('LEFT JOIN delivery_addresses da');
    expect(sql).toContain('r.location_sharing_enabled=TRUE');
    expect(sql).toContain('r.location_sharing_delivery_id=d.id');
    expect(sql).toContain('WHERE delivery_id = d.id AND rider_id = d.rider_id');
    expect(sql).toContain('ELSE NULL');
  });

  test('does not reveal delivery tracking data to an unrelated account', async () => {
    query.mockResolvedValueOnce({rows:[{
      id:'delivery-1',customer_id:'customer-1',vendor_id:'vendor-1',rider_id:'rider-1',
      status:'in_transit',location_trail:[{lat:13.45,lng:-16.57}]
    }]});
    await expect(getTracking('delivery-1','stranger-1',['customer']))
      .rejects.toMatchObject({code:'FORBIDDEN'});
  });
});
