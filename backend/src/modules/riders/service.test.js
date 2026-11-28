jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../notifications/service',()=>({pushToUser:jest.fn()}));
jest.mock('../uploads/service',()=>({assertOwnedUploadReference:jest.fn().mockResolvedValue(true)}));

const {query,withTransaction}=require('../../config/db');
const notificationsService=require('../notifications/service');
const {assertOwnedUploadReference}=require('../uploads/service');
const {getDeliveryHistory,getEarnings,updateLocation,register,approve,updateProfile,setAvailability,updateDeliveryPricing}=require('./service');

describe('rider profile updates',()=>{
 const riderId='33333333-3333-4333-8333-333333333333';
 beforeEach(()=>jest.clearAllMocks());
 test('binds rider profile field and owner ID as parameters',async()=>{
  query.mockResolvedValueOnce({rows:[{user_id:riderId,whatsapp_number:'+220831234567'}]});
  const result=await updateProfile(riderId,{whatsappNumber:'+220831234567'});
  expect(result.whatsapp_number).toBe('+220831234567');
  expect(query.mock.calls[0][0]).toContain('whatsapp_number = $1 WHERE user_id = $2 RETURNING *');
  expect(query.mock.calls[0][1]).toEqual(['+220831234567',riderId]);
 });
});

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



describe('rider earnings reversal accounting',()=>{
 beforeEach(()=>jest.clearAllMocks());

 test('summarises deduction entries as negative amounts instead of extra earnings',async()=>{
  query.mockResolvedValueOnce({rows:[{
   total_earnings:'93.00',paid_earnings:'93.00',pending_earnings:'0.00',total_entries:4
  }]}).mockResolvedValueOnce({rows:[]});
  const result=await getEarnings('rider-1',{page:1,limit:20,period:'30d'});
  expect(result.summary).toMatchObject({total_earnings:'93.00',paid_earnings:'93.00'});
  expect(query.mock.calls[0][0]).toContain("CASE WHEN type='deduction' THEN -amount ELSE amount END");
  expect(query.mock.calls[0][0]).toContain('AS total_earnings');
  expect(query.mock.calls[0][0]).toContain('AS paid_earnings');
  expect(query.mock.calls[0][0]).toContain('AS pending_earnings');
 });

 test('delivery history nets an order reversal deduction against the original delivery earning',async()=>{
  query.mockResolvedValueOnce({rows:[{amount:'0.00'}]});
  const result=await getDeliveryHistory('rider-1',{page:1,limit:20});
  expect(result[0].amount).toBe('0.00');
  expect(query.mock.calls[0][0]).toContain("CASE WHEN re.type='deduction' THEN -re.amount ELSE re.amount END");
  expect(query.mock.calls[0][0]).toContain('SUM');
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


describe('Admin-controlled rider delivery tariffs',()=>{
 const riderId='33333333-3333-4333-8333-333333333333';
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  clientQuery=jest.fn();
  withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
 });

 test('allows an approved rider online when an enabled Admin override supplies the tariff',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:riderId,delivery_pricing_enabled:false,delivery_base_fee_gmd:null,delivery_per_km_fee_gmd:null,delivery_min_fee_gmd:null,admin_delivery_pricing_override:{enabled:true,baseFeeGmd:220,perKmFeeGmd:12,minimumFeeGmd:150,routeRates:[]}}]})
   .mockResolvedValueOnce({rows:[{value:{baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000,allowRiderOverrides:false}}]})
   .mockResolvedValueOnce({rows:[{user_id:riderId,is_online:true}]});
  const result=await setAvailability(riderId,true);
  expect(result).toMatchObject({user_id:riderId,is_online:true});
  expect(clientQuery.mock.calls[2][0]).toContain('UPDATE riders SET is_online=$1');
 });

 test('blocks a rider online when global self-service is disabled and no Admin override exists',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:riderId,delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:12,delivery_min_fee_gmd:150,admin_delivery_pricing_override:null}]})
   .mockResolvedValueOnce({rows:[{value:{baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000,allowRiderOverrides:false}}]});
  await expect(setAvailability(riderId,true)).rejects.toMatchObject({statusCode:409,code:'DELIVERY_PRICING_REQUIRED'});
  expect(clientQuery).toHaveBeenCalledTimes(2);
 });

 test('rejects rider self-service price changes while an individual Admin override is active',async()=>{
  query
   .mockResolvedValueOnce({rows:[{value:{baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000,allowRiderOverrides:true}}]})
   .mockResolvedValueOnce({rows:[{admin_delivery_pricing_override:{enabled:true,baseFeeGmd:300,perKmFeeGmd:15,minimumFeeGmd:200,routeRates:[]}}]});
  await expect(updateDeliveryPricing(riderId,{baseFee:220,perKmFee:12,minimumFee:150}))
   .rejects.toMatchObject({statusCode:403,code:'DELIVERY_PRICING_ADMIN_LOCKED'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});

describe('rider application registration and approval',()=>{
 const userId='33333333-3333-4333-8333-333333333333';
 const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  clientQuery=jest.fn();
  withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
 });
 test('stores the rider application as pending, assigns the role, creates a wallet and alerts admins',async()=>{
  query.mockResolvedValueOnce({rows:[]});
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:userId,kyc_status:'pending'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  const result=await register(userId,{
   vehicleType:'motorbike',plateNumber:'KM-1234',licenseNumber:'DL-12345',
   mobileNumber:'+220871234567',whatsappNumber:'+220831234567',
   address:'Bakoteh, Kanifing Municipality',profilePhotoUrl:'https://api.marketlink.test/photo.jpg',
   idDocumentUrl:'https://api.marketlink.test/id.pdf',licenseDocumentUrl:'https://api.marketlink.test/license.pdf'
  });
  expect(result).toMatchObject({user_id:userId,kyc_status:'pending'});
  expect(assertOwnedUploadReference).toHaveBeenCalledWith('https://api.marketlink.test/id.pdf',userId,'rider-document','document','Rider identity document');
  expect(assertOwnedUploadReference).toHaveBeenCalledWith('https://api.marketlink.test/license.pdf',userId,'license-document','document','Rider driving licence');
  expect(clientQuery.mock.calls[0][0]).toContain("VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',FALSE)");
  expect(clientQuery.mock.calls[0][1]).toContain('+220871234567');
  expect(clientQuery.mock.calls[0][1]).toContain('+220831234567');
  expect(clientQuery.mock.calls[1][0]).toContain("name = 'rider'");
  expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO wallets');
  expect(clientQuery.mock.calls[3][0]).toContain('rider_application_submitted');
  expect(clientQuery.mock.calls[3][0]).toContain("r.name IN ('admin','super_admin','moderator')");
 });
 test('rejects a non-migrated or invalid Gambian rider mobile number before creating a record',async()=>{
  await expect(register(userId,{mobileNumber:'+2201234567',whatsappNumber:'+220871234567'}))
   .rejects.toMatchObject({statusCode:400,code:'INVALID_PHONE'});
  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('admin approval changes KYC state and sends the rider an approval notification',async()=>{
  const before={user_id:userId,kyc_status:'pending'};
  const updated={user_id:userId,kyc_status:'approved'};
  query
   .mockResolvedValueOnce({rows:[before]})
   .mockResolvedValueOnce({rows:[updated]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  const result=await approve(userId,{id:adminId,role:'admin'},'Documents reviewed');
  expect(result).toEqual(updated);
  expect(query.mock.calls[1][0]).toContain("SET kyc_status = 'approved'");
  expect(query.mock.calls[1][1]).toEqual([adminId,'Documents reviewed',userId]);
  expect(query.mock.calls[2][0]).toContain('rider_approved');
 });
});
