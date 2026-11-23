'use strict';
jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {query,withTransaction}=require('../../config/db');
const {getMarketplaceCommissionSettings,updateMarketplaceCommissionSettings}=require('./service');
describe('Admin marketplace commission settings',()=>{
 let clientQuery;
 beforeEach(()=>{jest.clearAllMocks();clientQuery=jest.fn();withTransaction.mockImplementation(fn=>fn({query:clientQuery}));});
 test('returns persisted percentages and derived MarketLink retained share',async()=>{
  query.mockResolvedValueOnce({rows:[{key:'marketplace_commission_pct',value:'5.00'},{key:'affiliate_commission_pct',value:'2.00'}]});
  expect(await getMarketplaceCommissionSettings()).toMatchObject({marketplaceCommissionPct:5,affiliateCommissionPct:2,marketlinkRetainedPct:3,vendorPayoutPct:95,customerGatewayFeeEnabled:false,appliesTo:'future_orders_only'});
  expect(query.mock.calls[0][0]).toContain("value #>> '{}'");
 });
 test('saves both rates and writes an Admin audit event in one transaction',async()=>{
  clientQuery.mockResolvedValueOnce({rows:[{key:'marketplace_commission_pct',value:'5.00'},{key:'affiliate_commission_pct',value:'2.00'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]});
  const result=await updateMarketplaceCommissionSettings({marketplaceCommissionPct:10,affiliateCommissionPct:3},{id:'admin-1',role:'admin'});
  expect(result).toMatchObject({marketplaceCommissionPct:10,affiliateCommissionPct:3,marketlinkRetainedPct:7,vendorPayoutPct:90});
  expect(clientQuery).toHaveBeenCalledTimes(4);
  expect(clientQuery.mock.calls[1][1]).toEqual(['marketplace_commission_pct','10','admin-1']);
  expect(clientQuery.mock.calls[2][1]).toEqual(['affiliate_commission_pct','3','admin-1']);
  expect(clientQuery.mock.calls[3][0]).toContain('finance.commission_settings_updated');
 });
 test('rejects affiliate share above pool before starting transaction',async()=>{
  await expect(updateMarketplaceCommissionSettings({marketplaceCommissionPct:5,affiliateCommissionPct:5.1},{id:'admin-1',role:'admin'})).rejects.toMatchObject({statusCode:400,code:'INVALID_COMMISSION_SETTINGS'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});
