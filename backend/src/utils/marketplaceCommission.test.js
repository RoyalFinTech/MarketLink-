'use strict';
const {AppError}=require('../middleware/errorHandler');
const {commissionSettingsFromRows,validateCommissionSettings}=require('./marketplaceCommission');
describe('MarketLink commission split rules',()=>{
 test('defaults to a 5% pool split into 3% MarketLink and 2% affiliate',()=>{
  expect(commissionSettingsFromRows([])).toEqual({marketplaceCommissionPct:5,affiliateCommissionPct:2,marketlinkRetainedPct:3,vendorPayoutPct:95});
 });
 test('uses persisted settings and calculates retained platform share',()=>{
  expect(commissionSettingsFromRows([{key:'marketplace_commission_pct',value:'10.00'},{key:'affiliate_commission_pct',value:'2.50'}])).toEqual({marketplaceCommissionPct:10,affiliateCommissionPct:2.5,marketlinkRetainedPct:7.5,vendorPayoutPct:90});
 });
 test('rejects affiliate reward greater than pool',()=>{
  let thrown;try{validateCommissionSettings({marketplaceCommissionPct:5,affiliateCommissionPct:5.01});}catch(e){thrown=e;}
  expect(thrown).toMatchObject({statusCode:400,code:'INVALID_COMMISSION_SETTINGS'});
 });
 test('rejects commission above the 20% ceiling',()=>{
  let thrown;try{validateCommissionSettings({marketplaceCommissionPct:20.01,affiliateCommissionPct:2});}catch(e){thrown=e;}
  expect(thrown).toMatchObject({statusCode:400,code:'INVALID_COMMISSION_SETTINGS'});
 });
 test('rejects missing or non-numeric percentages',()=>{
  expect(()=>validateCommissionSettings({marketplaceCommissionPct:5})).toThrow(AppError);
  expect(()=>validateCommissionSettings({marketplaceCommissionPct:'x',affiliateCommissionPct:2})).toThrow(AppError);
 });
});
