jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { query, withTransaction } = require('../../config/db');
const { updateStatus, placeOrder } = require('./service');

describe('order payment method validation',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('rejects unknown payment methods at order creation',async()=>{
  await expect(placeOrder({customerId:'customer-1',vendorId:'vendor-1',items:[{productId:'product-1',quantity:1}],paymentMethod:'unsupported-provider'}))
   .rejects.toMatchObject({statusCode:400,code:'UNSUPPORTED_PAYMENT_METHOD'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});

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


describe('order financial settlement safeguards', () => {
  let clientQuery;

  const baseOrder = {
    id: 'order-1', status: 'delivered', payment_status: 'confirmed',
    vendor_id: 'vendor-1', rider_id: 'rider-1', delivery_id: 'delivery-1',
    affiliate_user_id: null, total: 125, vendor_payout: 95,
    rider_payout: 25, affiliate_commission_amount: 0,
    platform_net_fee: 5, platform_fee: 5,
  };
  const baseCommission = {
    id: 'commission-1', status: 'pending', vendor_id: 'vendor-1',
    affiliate_user_id: null, order_total: 125, commission_amount: 5,
    vendor_payout: 95, rider_payout: 25,
    affiliate_commission_amount: 0, platform_net_amount: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation((callback) => callback({ query: clientQuery }));
  });

  test('refuses to mark settlement paid when the rider recipient is missing', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ ...baseOrder, rider_id: null, delivery_id: null }] })
      .mockResolvedValueOnce({ rows: [baseCommission] });

    await expect(require('./service').settleOrderFinancials('order-1'))
      .rejects.toMatchObject({ code: 'SETTLEMENT_RIDER_MISSING' });

    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE wallets/i.test(sql))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE commission_records SET status='paid'/i.test(sql))).toBe(false);
  });

  test('refuses settlement when the commission ledger differs from the order', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [baseOrder] })
      .mockResolvedValueOnce({ rows: [{ ...baseCommission, rider_payout: 20 }] });

    await expect(require('./service').settleOrderFinancials('order-1'))
      .rejects.toMatchObject({ code: 'SETTLEMENT_LEDGER_MISMATCH' });

    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE wallets/i.test(sql))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE commission_records SET status='paid'/i.test(sql))).toBe(false);
  });

  test('refuses settlement when an affiliate reward has no affiliate recipient', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ ...baseOrder, affiliate_commission_amount: 2 }] })
      .mockResolvedValueOnce({ rows: [{ ...baseCommission, affiliate_commission_amount: 2 }] });

    await expect(require('./service').settleOrderFinancials('order-1'))
      .rejects.toMatchObject({ code: 'SETTLEMENT_AFFILIATE_MISSING' });

    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE wallets/i.test(sql))).toBe(false);
  });
});
