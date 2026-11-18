jest.mock('./service', () => ({ placeOrder: jest.fn() }));
const svc = require('./service');
const ctrl = require('./controller');

describe('order creation identity binding', () => {
  beforeEach(() => jest.clearAllMocks());

  test('ignores a client-supplied customerId and uses the authenticated account', async () => {
    svc.placeOrder.mockResolvedValue({ order:{ id:'order-1' } });
    const req = {
      user:{ id:'authenticated-customer' },
      body:{ customerId:'another-customer', vendorId:'vendor-1', items:[], paymentMethod:'cod' }
    };
    const res = { status:jest.fn().mockReturnThis(), json:jest.fn() };
    const next = jest.fn();

    await ctrl.place(req,res,next);

    expect(svc.placeOrder).toHaveBeenCalledWith({
      customerId:'authenticated-customer',
      vendorId:'vendor-1',
      items:[],
      paymentMethod:'cod'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});
