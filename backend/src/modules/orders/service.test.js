jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { query, withTransaction } = require('../../config/db');
const { updateStatus, placeOrder, getById, listForCustomer, listForVendor, buildCheckoutFingerprint } = require('./service');

describe('order payment method validation',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('rejects unknown payment methods at order creation',async()=>{
  await expect(placeOrder({customerId:'customer-1',vendorId:'vendor-1',items:[{productId:'product-1',quantity:1}],paymentMethod:'unsupported-provider'}))
   .rejects.toMatchObject({statusCode:400,code:'UNSUPPORTED_PAYMENT_METHOD'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});

describe('order history pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  test('clamps customer order history to a safe page size', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listForCustomer('customer-1', { page:'3', limit:'500', status:'delivered' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LIMIT 3 OFFSET 4');
    expect(params).toEqual(['customer-1','delivered',100,200]);
  });

  test('clamps vendor order history pagination independently of query strings', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listForVendor('vendor-1', { page:'2', limit:'9999', status:'accepted' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LIMIT 3 OFFSET 4');
    expect(params).toEqual(['vendor-1','accepted',100,100]);
  });
});

describe('order payment recovery details',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('returns the latest pending or confirmed payment attempt to the order owner',async()=>{
  const attempt={id:'11111111-1111-4111-8111-111111111111',method:'wave',status:'pending'};
  query.mockResolvedValueOnce({rows:[{
   id:'order-1',customer_id:'customer-1',vendor_id:'vendor-1',
   payment_attempt_pending:true,payment_attempt:attempt,items:[]
  }]});
  const result=await getById('order-1','customer-1',['customer']);
  expect(result.payment_attempt).toEqual(attempt);
  expect(result.payment_attempt_pending).toBe(true);
  expect(query.mock.calls[0][0]).toContain("latest_payment.status IN ('pending','confirmed')");
  expect(query.mock.calls[0][0]).toContain('latest_payment.created_at DESC LIMIT 1');
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


describe('order creation ownership safeguards', () => {
  let clientQuery;
  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation(callback => callback({ query: clientQuery }));
  });

  test('rejects an order when no delivery address is supplied', async () => {
    await expect(placeOrder({
      customerId:'customer-1',
      vendorId:'vendor-1',
      items:[{productId:'product-1',quantity:1}],
      paymentMethod:'cod'
    })).rejects.toMatchObject({code:'DELIVERY_ADDRESS_REQUIRED',statusCode:400});
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('requires GPS coordinates for the customer-owned delivery address', async () => {
    clientQuery.mockResolvedValueOnce({rows:[{id:'address-1',latitude:null,longitude:null}]});
    await expect(placeOrder({
      customerId:'customer-1',
      vendorId:'vendor-1',
      items:[{productId:'product-1',quantity:1}],
      paymentMethod:'cod',
      deliveryAddressId:'address-1',
      deliveryFeeQuoteId:'quote-1'
    })).rejects.toMatchObject({code:'DELIVERY_GPS_REQUIRED',statusCode:409});
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('snapshots the all-in order total and uses the customer-approved rider fare', async()=>{
    const fingerprint=buildCheckoutFingerprint({
      customerId:'customer-1',
      vendorId:'vendor-1',
      deliveryAddressId:'address-1',
      riderId:'rider-1',
      items:[{productId:'product-1',qty:1,unitPrice:100}],
      couponId:null,
      discount:0,
      marketplaceCommissionPct:10,
      affiliateUserId:'affiliate-1',
      affiliateCommissionPct:3,
      payoutFeeRecoveryPct:2,
      deliveryFee:25
    });
    const order={id:'order-configured-split',customer_id:'customer-1',vendor_id:'vendor-1',total:127.36};
    clientQuery.mockImplementation(async(sql,params)=>{
      if(sql.includes('FROM delivery_addresses'))return{rows:[{id:'address-1',latitude:'13.45',longitude:'-16.58'}]};
      if(sql.includes('FROM delivery_fee_quotes'))return{rows:[{
        id:'quote-1',rider_id:'rider-1',pickup_lat:'13.44',pickup_lng:'-16.57',
        dropoff_lat:'13.45',dropoff_lng:'-16.58',route_distance_km:'1.50',delivery_fee_gmd:'25.00',
        estimated_customer_total:'127.36',payout_fee_recovery_pct:'2.00',
        checkout_fingerprint:fingerprint
      }]};
      if(sql.includes('FROM riders WHERE user_id'))return{rows:[{user_id:'rider-1'}]};
      if(sql.includes('SELECT d.id FROM deliveries'))return{rows:[]};
      if(sql.includes('FROM products p'))return{rows:[{id:'product-1',vendor_id:'vendor-1',name:'Rice',price:'100.00',vendor_listed_price:'80.00',admin_price_override_enabled:true,status:'active',vendor_kyc_status:'approved'}]};
      if(sql.includes('SELECT quantity FROM inventory'))return{rows:[{quantity:10}]};
      if(sql.includes('FROM system_settings'))return{rows:[{key:'marketplace_commission_pct',value:'10.00'},{key:'affiliate_commission_pct',value:'3.00'},{key:'payout_fee_recovery_pct',value:'2.00'}]};
      if(sql.includes('FROM affiliates WHERE affiliate_code'))return{rows:[{user_id:'affiliate-1',affiliate_code:'AFF123'}]};
      if(sql.startsWith('INSERT INTO orders'))return{rows:[order]};
      if(sql.includes('UPDATE inventory SET quantity=quantity-$1'))return{rows:[{quantity:9}]};
      if(sql.includes('INSERT INTO deliveries'))return{rows:[{id:'delivery-1'}]};
      if(sql.includes("UPDATE delivery_fee_quotes SET status='consumed'"))return{rows:[{id:'quote-1'}]};
      return{rows:[]};
    });
    await placeOrder({
      customerId:'customer-1',vendorId:'vendor-1',
      items:[{productId:'product-1',quantity:1}],
      paymentMethod:'cod',deliveryAddressId:'address-1',
      deliveryFeeQuoteId:'quote-1',affiliateCode:'AFF123'
    });
    const lockedProductQuery=clientQuery.mock.calls.find(([sql])=>sql.includes('FROM products p')&&sql.includes('FOR UPDATE OF p'));
    expect(lockedProductQuery[0]).toContain('CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END AS price');
    expect(lockedProductQuery[0]).toContain('p.price AS vendor_listed_price');
    const orderInsert=clientQuery.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO orders'));
    expect(orderInsert).toBeDefined();
    expect(orderInsert[0]).toContain('payout_fee_recovery_pct');
    expect(orderInsert[0]).toContain('payout_fee_recovery_amount');
    expect(orderInsert[1].slice(6,21)).toEqual([100,25,0,10,10,90,25,127.36,null,'affiliate-1',3,3,7,2,2.36]);
    const deliveryInsert=clientQuery.mock.calls.find(([sql])=>/INSERT INTO deliveries/i.test(sql));
    expect(deliveryInsert).toBeDefined();
    expect(deliveryInsert[0]).toContain('dropoff_lat,dropoff_lng');
    expect(deliveryInsert[1]).toEqual(['order-configured-split','rider-1','13.44','-16.57','13.45','-16.58','1.50']);
  });

  test('rejects a quote if the product price or checkout total changed after the rider quote', async()=>{
    clientQuery.mockImplementation(async(sql)=>{
      if(sql.includes('FROM delivery_addresses'))return{rows:[{id:'address-1',latitude:'13.45',longitude:'-16.58'}]};
      if(sql.includes('FROM delivery_fee_quotes'))return{rows:[{
        id:'quote-1',rider_id:'rider-1',pickup_lat:'13.44',pickup_lng:'-16.57',
        dropoff_lat:'13.45',dropoff_lng:'-16.58',route_distance_km:'1.50',delivery_fee_gmd:'25.00',
        estimated_customer_total:'127.36',payout_fee_recovery_pct:'2.00',
        checkout_fingerprint:'not-the-current-cart-fingerprint'
      }]};
      if(sql.includes('FROM riders WHERE user_id'))return{rows:[{user_id:'rider-1'}]};
      if(sql.includes('SELECT d.id FROM deliveries'))return{rows:[]};
      if(sql.includes('FROM products p'))return{rows:[{id:'product-1',vendor_id:'vendor-1',name:'Rice',price:'101.00',status:'active',vendor_kyc_status:'approved'}]};
      if(sql.includes('SELECT quantity FROM inventory'))return{rows:[{quantity:10}]};
      if(sql.includes('FROM system_settings'))return{rows:[{key:'marketplace_commission_pct',value:'10.00'},{key:'affiliate_commission_pct',value:'3.00'},{key:'payout_fee_recovery_pct',value:'2.00'}]};
      if(sql.includes('FROM affiliates WHERE affiliate_code'))return{rows:[{user_id:'affiliate-1',affiliate_code:'AFF123'}]};
      return{rows:[]};
    });
    await expect(placeOrder({
      customerId:'customer-1',vendorId:'vendor-1',
      items:[{productId:'product-1',quantity:1}],
      paymentMethod:'cod',deliveryAddressId:'address-1',
      deliveryFeeQuoteId:'quote-1',affiliateCode:'AFF123'
    })).rejects.toMatchObject({code:'CHECKOUT_TOTAL_CHANGED',statusCode:409});
    expect(clientQuery.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO orders'))).toBe(false);
  });

  test('rejects a delivery address that belongs to another customer', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [] });
    await expect(placeOrder({
      customerId:'customer-1',
      vendorId:'vendor-1',
      items:[{productId:'product-1',quantity:1}],
      paymentMethod:'cod',
      deliveryAddressId:'foreign-address',
      deliveryFeeQuoteId:'quote-1'
    })).rejects.toMatchObject({code:'DELIVERY_ADDRESS_FORBIDDEN',statusCode:403});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][1]).toEqual(['foreign-address','customer-1']);
  });
});

describe('customer order cancellation permissions', () => {
  let clientQuery;
  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation(callback => callback({ query: clientQuery }));
  });

  test('allows a customer to cancel their own pending order', async () => {
    const order = { id:'order-1', status:'pending', payment_status:'pending', customer_id:'customer-1', vendor_id:'vendor-1', rider_id:null };
    query.mockResolvedValueOnce({ rows:[order] });
    clientQuery.mockResolvedValueOnce({ rows:[order] }).mockResolvedValueOnce({ rows:[{...order,status:'cancelled'}] }).mockResolvedValueOnce({ rows:[] }).mockResolvedValueOnce({ rows:[{product_id:'product-1',quantity:1}] }).mockResolvedValue({ rows:[] });
    await expect(updateStatus('order-1','cancelled','customer-1',['customer'],'Customer requested cancellation')).resolves.toMatchObject({status:'cancelled'});
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE orders SET status/i.test(sql))).toBe(true);
    const inventoryRestore = clientQuery.mock.calls.find(([sql]) => /UPDATE inventory SET quantity=quantity\+\$1/i.test(sql));
    expect(inventoryRestore).toBeDefined();
    expect(inventoryRestore[0]).toContain('variant_id IS NULL');
  });

  test('rechecks pending mobile-money payment under the order lock before cancellation', async () => {
    const order = { id:'order-race', status:'pending', payment_status:'pending', payment_method:'wave', customer_id:'customer-1', vendor_id:'vendor-1', rider_id:null };
    query.mockResolvedValueOnce({ rows:[order] }).mockResolvedValueOnce({ rows:[] });
    clientQuery.mockResolvedValueOnce({ rows:[order] }).mockResolvedValueOnce({ rows:[{id:'payment-pending'}] });
    await expect(updateStatus('order-race','cancelled','customer-1',['customer']))
      .rejects.toMatchObject({code:'PAYMENT_ATTEMPT_PENDING',statusCode:409});
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain("status='pending'");
  });

  test('blocks cancellation while a non-COD payment attempt is still pending', async () => {
    query.mockResolvedValueOnce({ rows:[{ id:'order-pending', status:'pending', payment_status:'pending', payment_method:'wave', customer_id:'customer-1', vendor_id:'vendor-1', rider_id:null }] });
    query.mockResolvedValueOnce({ rows:[{ id:'payment-pending' }] });
    await expect(updateStatus('order-pending','cancelled','customer-1',['customer']))
      .rejects.toMatchObject({code:'PAYMENT_ATTEMPT_PENDING',statusCode:409});
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('does not allow a customer to cancel another customer order', async () => {
    query.mockResolvedValueOnce({ rows:[{ id:'order-2', status:'pending', payment_status:'pending', customer_id:'customer-2', vendor_id:'vendor-1', rider_id:null }] });
    await expect(updateStatus('order-2','cancelled','customer-1',['customer'])).rejects.toMatchObject({code:'FORBIDDEN',statusCode:403});
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('does not allow a customer to cancel after preparation has started', async () => {
    query.mockResolvedValueOnce({ rows:[{ id:'order-3', status:'preparing', payment_status:'pending', customer_id:'customer-1', vendor_id:'vendor-1', rider_id:null }] });
    await expect(updateStatus('order-3','cancelled','customer-1',['customer'])).rejects.toMatchObject({code:'INVALID_STATUS_TRANSITION',statusCode:400});
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
