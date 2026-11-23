jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({
  isConfigured:jest.fn(),isWebhookConfigured:jest.fn(),isH2H:jest.fn(),isH2HApproved:jest.fn()
}));

const {query,withTransaction}=require('../../config/db');
const modemPay=require('../../integrations/modempay');
const service=require('./service');

const riderId='33333333-3333-4333-8333-333333333333';
const productId='44444444-4444-4444-8444-444444444444';
const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000,allowRiderOverrides:true};
const actor={id:adminId,role:'admin'};

describe('Admin pricing overrides',()=>{
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  clientQuery=jest.fn();
  withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
  query.mockResolvedValue({rows:[{value:policy}]});
 });

 test('sets an individual rider tariff and records before/after audit data',async()=>{
  const override={enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200,routeRates:[{originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:250}],note:'Approved route update'};
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:riderId,delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:14,delivery_min_fee_gmd:180,admin_delivery_pricing_override:null}]})
   .mockResolvedValueOnce({rows:[{user_id:riderId,admin_delivery_pricing_override:override,admin_delivery_pricing_override_at:'2026-11-23T12:00:00.000Z'}]})
   .mockResolvedValueOnce({rows:[]});
  const result=await service.updateAdminRiderPricingOverride(riderId,{
    enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200,
    routeRates:override.routeRates,note:'Approved route update'
  },actor);
  expect(result).toMatchObject({riderId,adminOverrideActive:true});
  expect(clientQuery).toHaveBeenCalledTimes(3);
  expect(clientQuery.mock.calls[1][0]).toContain('admin_delivery_pricing_override=$2::jsonb');
  expect(JSON.parse(clientQuery.mock.calls[1][1][1])).toMatchObject({baseFeeGmd:300,note:'Approved route update'});
  expect(clientQuery.mock.calls[2][0]).toContain('admin_action_logs');
  expect(clientQuery.mock.calls[2][1][2]).toBe('rider.delivery_pricing_override_set');
 });

 test('requires a reason before enabling an individual rider override',async()=>{
  await expect(service.updateAdminRiderPricingOverride(riderId,{
    enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200
  },actor)).rejects.toMatchObject({status:400,code:'ADMIN_PRICE_REASON_REQUIRED'});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('rejects an individual rider fixed route below the current Admin minimum',async()=>{
  await expect(service.updateAdminRiderPricingOverride(riderId,{
    enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200,note:'Test',
    routeRates:[{originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:100}]
  },actor)).rejects.toMatchObject({statusCode:400,code:'INVALID_RIDER_PRICING_OVERRIDE'});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('clears the Admin rider override without overwriting rider-owned tariff columns',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:riderId,delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:14,delivery_min_fee_gmd:180,admin_delivery_pricing_override:{baseFeeGmd:300}}]})
   .mockResolvedValueOnce({rows:[{user_id:riderId,admin_delivery_pricing_override:null,admin_delivery_pricing_override_at:'2026-11-23T12:00:00.000Z'}]})
   .mockResolvedValueOnce({rows:[]});
  const result=await service.updateAdminRiderPricingOverride(riderId,{clearOverride:true},actor);
  expect(result).toMatchObject({riderId,adminOverrideActive:false,adminOverride:null});
  expect(clientQuery.mock.calls[1][0]).toContain('admin_delivery_pricing_override=$2::jsonb');
  expect(clientQuery.mock.calls[1][0]).not.toContain('delivery_base_fee_gmd=');
  expect(clientQuery.mock.calls[2][1][2]).toBe('rider.delivery_pricing_override_cleared');
 });

 test('sets an Admin customer price without changing the vendor-listed price column',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{id:productId,vendor_id:riderId,name:'Rice',price:'100.00',admin_price_override:null,admin_price_override_enabled:false,admin_price_override_note:null}]})
   .mockResolvedValueOnce({rows:[{id:productId,vendor_id:riderId,price:'100.00',admin_price_override:'125.00',admin_price_override_enabled:true,admin_price_override_note:'Price correction',admin_price_override_at:'2026-11-23T12:00:00.000Z'}]})
   .mockResolvedValueOnce({rows:[]});
  const result=await service.updateVendorProductPriceOverride(productId,{enabled:true,price:125,note:'Price correction'},actor);
  expect(result).toMatchObject({productId,vendorListedPrice:100,effectiveCustomerPrice:125,overrideEnabled:true});
  expect(clientQuery.mock.calls[1][0]).toContain('admin_price_override=$2');
  expect(clientQuery.mock.calls[1][0]).not.toMatch(/SET[^]*?price\s*=/i);
  expect(clientQuery.mock.calls[2][1][2]).toBe('product.admin_price_override_set');
 });

 test('restores the current vendor price when an Admin product override is cleared',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{id:productId,vendor_id:riderId,name:'Rice',price:'100.00',admin_price_override:'125.00',admin_price_override_enabled:true,admin_price_override_note:'Price correction'}]})
   .mockResolvedValueOnce({rows:[{id:productId,vendor_id:riderId,price:'100.00',admin_price_override:null,admin_price_override_enabled:false,admin_price_override_note:null,admin_price_override_at:'2026-11-23T12:00:00.000Z'}]})
   .mockResolvedValueOnce({rows:[]});
  const result=await service.updateVendorProductPriceOverride(productId,{enabled:false},actor);
  expect(result).toMatchObject({productId,vendorListedPrice:100,effectiveCustomerPrice:100,overrideEnabled:false});
  expect(clientQuery.mock.calls[2][1][2]).toBe('product.admin_price_override_cleared');
 });

 test('blocks provider checkout readiness until callback, API key and webhook are all configured',async()=>{
  process.env.MODEM_PAY_CALLBACK_URL='';
  modemPay.isConfigured.mockReturnValue(true);
  modemPay.isWebhookConfigured.mockReturnValue(true);
  modemPay.isH2H.mockReturnValue(true);
  modemPay.isH2HApproved.mockReturnValue(true);
  query.mockResolvedValueOnce({rows:[]});
  const result=await service.getPaymentReadiness();
  expect(result.configuration).toMatchObject({
    apiKeyConfigured:true,webhookSecretConfigured:true,h2hApproved:true,
    callbackUrlConfigured:false,mobileMoneyCheckoutReady:false
  });
  expect(result.configuration).not.toHaveProperty('apiKey');
  expect(result.configuration).not.toHaveProperty('webhookSecret');
  expect(result.configuration).toMatchObject({apiKeyConfigured:true,webhookSecretConfigured:true});
 });

});
