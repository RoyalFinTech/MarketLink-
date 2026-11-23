jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({pushToUser:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const notificationsService=require('../notifications/service');
const {getDeliveryHistory,updateLocation}=require('./service');

describe('rider delivery history cash reconciliation data',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('returns COD payment and remittance status without multiplying delivery rows',async()=>{
  const row={id:'delivery-1',payment_method:'cod',cod_payment_id:'payment-1',cod_payment_amount:'145.00',cod_remittance_status:'rejected',cod_remittance_review_note:'Reference not found in company statement'};
  query.mockResolvedValue({rows:[row]});
  const result=await getDeliveryHistory('rider-1',{page:1,limit:20});
  expect(result).toEqual([row]);
  const [sql,params]=query.mock.calls[0];
  expect(sql).toContain('LEFT JOIN LATERAL');
  expect(sql).toContain("p.method='cod'");
  expect(sql).toContain('LEFT JOIN cod_cash_remittances');
  expect(sql).toContain('ccr.status AS cod_remittance_status');
  expect(sql).toContain('ccr.review_note AS cod_remittance_review_note');
  expect(sql).toContain('LEFT JOIN LATERAL');
  expect(params).toEqual(['rider-1',20,0]);
 });
});


describe('rider live GPS and arrival alerts', () => {
  let clientQuery;
  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery=jest.fn();
    withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
  });

  const activeDelivery={
    id:'delivery-1',order_id:'order-1',rider_id:'rider-1',status:'in_transit',
    customer_id:'customer-1',order_number:'ORD-2026-00001',
    dropoff_lat:'13.4535000',dropoff_lng:'-16.5775000'
  };

  test('creates one customer arrival notification inside the locked delivery transaction and sends push after commit',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[activeDelivery]})
      .mockResolvedValueOnce({rows:[{user_id:'rider-1'}]})
      .mockResolvedValueOnce({rows:[{recorded_at:'2026-11-23T06:00:00.000Z'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{id:'notification-1'}]});
    notificationsService.pushToUser.mockResolvedValue({sent:true,sentCount:1});
    query.mockResolvedValueOnce({rows:[]});

    const result=await updateLocation('rider-1',{
      lat:13.4532,lng:-16.5775,deliveryId:'delivery-1',accuracy:12
    });

    expect(result).toMatchObject({sharedForDelivery:true,arrivalNotified:true});
    expect(clientQuery.mock.calls[0][0]).toMatch(/FOR UPDATE OF d/i);
    expect(clientQuery.mock.calls[0][0]).toContain('COALESCE(d.dropoff_lat,da.latitude)');
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO rider_location_pings/i.test(sql))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO notifications/i.test(sql))).toBe(true);
    expect(notificationsService.pushToUser).toHaveBeenCalledWith('customer-1',expect.objectContaining({
      title:'Your rider is nearby',
      data:expect.objectContaining({type:'rider_arriving',deliveryId:'delivery-1'})
    }));
    expect(query).toHaveBeenCalledWith('UPDATE notifications SET channel_push=TRUE WHERE id=$1',['notification-1']);
  });

  test('does not trigger an arrival alert from an inaccurate GPS fix',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[activeDelivery]})
      .mockResolvedValueOnce({rows:[{user_id:'rider-1'}]})
      .mockResolvedValueOnce({rows:[{recorded_at:'2026-11-23T06:00:00.000Z'}]});

    const result=await updateLocation('rider-1',{
      lat:13.4532,lng:-16.5775,deliveryId:'delivery-1',accuracy:600
    });

    expect(result.arrivalNotified).toBe(false);
    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(notificationsService.pushToUser).not.toHaveBeenCalled();
  });

  test('does not create a second arrival alert for the same delivery',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[activeDelivery]})
      .mockResolvedValueOnce({rows:[{user_id:'rider-1'}]})
      .mockResolvedValueOnce({rows:[{recorded_at:'2026-11-23T06:00:00.000Z'}]})
      .mockResolvedValueOnce({rows:[{id:'notification-existing'}]});

    const result=await updateLocation('rider-1',{
      lat:13.4532,lng:-16.5775,deliveryId:'delivery-1',accuracy:12
    });

    expect(result.arrivalNotified).toBe(false);
    expect(clientQuery).toHaveBeenCalledTimes(4);
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO notifications/i.test(sql))).toBe(false);
    expect(notificationsService.pushToUser).not.toHaveBeenCalled();
  });
});
