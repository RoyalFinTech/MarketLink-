'use strict';
const { AppError } = require('../middleware/errorHandler');
const DEFAULT_MARKETPLACE_COMMISSION_PCT = 5;
const DEFAULT_AFFILIATE_COMMISSION_PCT = 2;
const MAX_MARKETPLACE_COMMISSION_PCT = 20;
const SETTING_KEYS = Object.freeze({ marketplace:'marketplace_commission_pct', affiliate:'affiliate_commission_pct', withdrawal:'withdrawal_service_fee_pct' });
function numberFromStoredValue(value,fallback,key) {
  const number = Number(value == null ? fallback : value);
  if (!Number.isFinite(number)) throw new AppError('The stored '+key+' setting is invalid. Finance settings must be corrected before accepting new orders.',500,'COMMISSION_SETTINGS_INVALID');
  return number;
}
function buildCommissionSettings(marketplaceCommissionPct,affiliateCommissionPct,errorStatus=500) {
  const marketplace=Number(marketplaceCommissionPct), affiliate=Number(affiliateCommissionPct);
  if (!Number.isFinite(marketplace)||marketplace<0||marketplace>MAX_MARKETPLACE_COMMISSION_PCT) throw new AppError('Marketplace commission must be between 0% and 20%.',errorStatus,'INVALID_COMMISSION_SETTINGS');
  if (!Number.isFinite(affiliate)||affiliate<0||affiliate>marketplace) throw new AppError('Affiliate reward cannot be negative or greater than the total marketplace commission.',errorStatus,'INVALID_COMMISSION_SETTINGS');
  const round=value=>Number(value.toFixed(2));
  return {marketplaceCommissionPct:round(marketplace),affiliateCommissionPct:round(affiliate),marketlinkRetainedPct:round(marketplace-affiliate),vendorPayoutPct:round(100-marketplace)};
}
function commissionSettingsFromRows(rows) {
  const map=new Map((rows||[]).map(row=>[String(row.key),row.value]));
  return buildCommissionSettings(
    numberFromStoredValue(map.get(SETTING_KEYS.marketplace),DEFAULT_MARKETPLACE_COMMISSION_PCT,SETTING_KEYS.marketplace),
    numberFromStoredValue(map.get(SETTING_KEYS.affiliate),DEFAULT_AFFILIATE_COMMISSION_PCT,SETTING_KEYS.affiliate),
    500
  );
}
function validateCommissionSettings(input) {
  if(!input||input.marketplaceCommissionPct===undefined||input.affiliateCommissionPct===undefined) throw new AppError('Enter both the total marketplace commission and the affiliate reward percentage.',400,'INVALID_COMMISSION_SETTINGS');
  return buildCommissionSettings(input.marketplaceCommissionPct,input.affiliateCommissionPct,400);
}
const { DEFAULT_WITHDRAWAL_SERVICE_FEE_PCT, MAX_WITHDRAWAL_SERVICE_FEE_PCT, validateWithdrawalFeePct } = require('./walletWithdrawalFees');
function withdrawalFeePctFromRows(rows){const map=new Map((rows||[]).map(row=>[String(row.key),row.value]));return validateWithdrawalFeePct(map.get(SETTING_KEYS.withdrawal),500);}
module.exports={DEFAULT_MARKETPLACE_COMMISSION_PCT,DEFAULT_AFFILIATE_COMMISSION_PCT,MAX_MARKETPLACE_COMMISSION_PCT,DEFAULT_WITHDRAWAL_SERVICE_FEE_PCT,MAX_WITHDRAWAL_SERVICE_FEE_PCT,SETTING_KEYS,buildCommissionSettings,commissionSettingsFromRows,validateCommissionSettings,withdrawalFeePctFromRows};
