jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({send:jest.fn().mockResolvedValue({}),pushToUser:jest.fn().mockResolvedValue({})}));

const {query,withTransaction}=require('../../config/db');
const notificationsService=require('../notifications/service');
const {assignRider,listAvailableRiders,acceptDelivery,reassignDelivery,processDispatchTimers}=require('./service');

describe('vendor and rider assignment lifecycle',()=>{
  let clientQuery;
  const vendor={id:'vendor-1',roles:['vendor']};
  const riderId='rider-1';
  const deliveryId='delivery-1';

  beforeEach(()=>{
    jest.clearAllMocks();
    clientQuery=jest.fn();
    withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
  });

  test('assigns an approved online rider and creates one pending assignment',async()=>{
    const updated={id:deliveryId,order_id:'order-1',rider_id:riderId,status:'assigned'};
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{vendor_id:vendor.id,status:'awaiting_rider',delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',status:'unassigned',rider_id:null}]})
      .mockResolvedValueOnce({rows:[{user_id:riderId}]})
      .mockResolvedValueOnce({rows:[{delivery_fee:null,delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[updated]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});

    const result=await assignRider(deliveryId,riderId,vendor);

    expect(result).toEqual(updated);
    expect(clientQuery.mock.calls[0][0]).toMatch(/SELECT order_id FROM deliveries/);
    expect(clientQuery.mock.calls[1][0]).toMatch(/FROM orders WHERE id=\$1 FOR UPDATE/);
    expect(clientQuery.mock.calls[2][0]).toMatch(/FROM deliveries WHERE id=\$1 AND order_id=\$2 FOR UPDATE/);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE deliveries SET rider_id=\$1,status='assigned'/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE orders SET status='rider_assigned'/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO rider_assignments/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO notifications/.test(sql))).toBe(true);
  });

  test('does not assign a quoted rider before the vendor marks the order ready',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{vendor_id:vendor.id,status:'preparing',delivery_fee_quote_id:'quote-1'}]});

    await expect(assignRider(deliveryId,riderId,vendor)).rejects.toMatchObject({code:'DELIVERY_NOT_READY'});
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  test('does not allow another vendor to assign a rider to this delivery',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{vendor_id:vendor.id,status:'awaiting_rider',delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',status:'unassigned'}]});

    await expect(assignRider(deliveryId,riderId,{id:'other-vendor',roles:['vendor']}))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  test('rejects a rider who is not approved and online before writing an assignment',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{vendor_id:vendor.id,status:'awaiting_rider',delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',status:'unassigned'}]})
      .mockResolvedValueOnce({rows:[]});

    await expect(assignRider(deliveryId,riderId,vendor)).rejects.toMatchObject({code:'RIDER_UNAVAILABLE'});
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE deliveries|INSERT INTO rider_assignments/.test(sql))).toBe(false);
  });

  test('rejects a rider who already has another active delivery',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{vendor_id:vendor.id,status:'awaiting_rider',delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',status:'unassigned'}]})
      .mockResolvedValueOnce({rows:[{user_id:riderId}]})
      .mockResolvedValueOnce({rows:[{delivery_fee:null,delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:'other-delivery'}]});

    await expect(assignRider(deliveryId,riderId,vendor)).rejects.toMatchObject({code:'RIDER_HAS_ACTIVE_DELIVERY'});
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE deliveries|INSERT INTO rider_assignments/.test(sql))).toBe(false);
  });

  test('only the order vendor or Admin can search available riders',async()=>{
    query.mockResolvedValueOnce({rows:[{id:deliveryId,vendor_id:vendor.id,status:'unassigned',order_status:'awaiting_rider',delivery_fee_quote_id:null,pickup_lat:null,pickup_lng:null}]});

    await expect(listAvailableRiders(deliveryId,'other-vendor',['vendor']))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('does not show riders for a quoted order before it is ready',async()=>{
    query.mockResolvedValueOnce({rows:[{id:deliveryId,vendor_id:vendor.id,status:'unassigned',order_status:'preparing',delivery_fee_quote_id:'quote-1',pickup_lat:13.4,pickup_lng:-16.6}]});

    await expect(listAvailableRiders(deliveryId,vendor.id,['vendor']))
      .rejects.toMatchObject({code:'DELIVERY_NOT_READY'});
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('an assigned rider can accept only after the vendor has marked the order ready',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{id:'order-1',status:'preparing'}]});

    await expect(acceptDelivery(deliveryId,riderId)).rejects.toMatchObject({code:'DELIVERY_NOT_READY'});
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  test('accepts the assigned rider request and notifies the customer and vendor',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{id:'order-1',status:'rider_assigned',customer_id:'customer-1',vendor_id:vendor.id,order_number:'ML-1001'}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',rider_id:riderId,status:'assigned'}]})
      .mockResolvedValueOnce({rows:[{user_id:riderId,is_online:true}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{delivery_fee:null,delivery_fee_quote_id:null}]})
      .mockResolvedValueOnce({rows:[{id:'assignment-1'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});

    const result=await acceptDelivery(deliveryId,riderId);

    expect(result).toMatchObject({id:deliveryId,rider_id:riderId,status:'assigned'});
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE rider_assignments SET status='accepted'/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.filter(([sql])=>/INSERT INTO notifications/.test(sql))).toHaveLength(2);
  });
  test('manual vendor replacement releases the old rider and searches again without changing the delivery fee',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{order_id:'order-1'}]})
      .mockResolvedValueOnce({rows:[{id:'order-1',vendor_id:vendor.id,status:'rider_assigned',order_number:'ML-1001'}]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,order_id:'order-1',rider_id:riderId,status:'assigned'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{id:deliveryId,status:'unassigned',rider_id:null}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});
    query
      .mockResolvedValueOnce({rows:[{id:deliveryId,vendor_id:vendor.id,status:'unassigned',order_status:'awaiting_rider',delivery_fee_quote_id:null,pickup_lat:null,pickup_lng:null}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});

    const result=await reassignDelivery(deliveryId,vendor);

    expect(result).toMatchObject({deliveryId,releasedRiderId:riderId,assigned:false,reason:'NO_AVAILABLE_RIDER'});
    expect(clientQuery.mock.calls.some(([sql])=>/SET status='reassigned'/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE deliveries SET rider_id=NULL,status='unassigned'/.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE orders SET status='awaiting_rider'/.test(sql))).toBe(true);
    expect(notificationsService.send).toHaveBeenCalledWith(expect.objectContaining({
      userId:vendor.id,title:'No replacement rider available yet'
    }));
  });

  test('sends the first pending-request reminder only once when its timer becomes due',async()=>{
    const old=new Date(Date.now()-40000);
    const future=new Date(Date.now()+50000);
    clientQuery
      .mockResolvedValueOnce({rows:[{locked:true}]})
      .mockResolvedValueOnce({rows:[{
        id:'assignment-1',delivery_id:deliveryId,rider_id:riderId,status:'pending',
        created_at:old,response_deadline_at:future,pickup_deadline_at:null,
        reminder_1_sent_at:null,reminder_2_sent_at:null,pickup_reminder_sent_at:null,
        order_id:'order-1',vendor_id:vendor.id,order_number:'ML-1001'
      }]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});

    const result=await processDispatchTimers();

    expect(result.processed).toBe(1);
    expect(clientQuery.mock.calls.some(([sql])=>/SET reminder_1_sent_at=now\(\)/.test(sql))).toBe(true);
    expect(notificationsService.send).toHaveBeenCalledWith(expect.objectContaining({
      userId:riderId,type:'delivery_reminder',title:'Delivery request reminder',
      channels:expect.objectContaining({push:true})
    }));
  });

  test('does not run dispatch timers when another backend instance owns the advisory lock',async()=>{
    clientQuery.mockResolvedValueOnce({rows:[{locked:false}]});
    const result=await processDispatchTimers();
    expect(result).toEqual({processed:0});
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

});
