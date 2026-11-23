'use strict';

const DEFAULT_DELIVERY_PRICING_POLICY = Object.freeze({
  baseFeeGmd: 150,
  perKmFeeGmd: 10,
  minimumFeeGmd: 150,
  minimumAllowedFeeGmd: 150,
  maximumFeeGmd: 5000,
});

function parsePolicyValue(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normaliseDeliveryPricingPolicy(value) {
  const source = parsePolicyValue(value);
  const policy = {
    baseFeeGmd: Number(source.baseFeeGmd ?? DEFAULT_DELIVERY_PRICING_POLICY.baseFeeGmd),
    perKmFeeGmd: Number(source.perKmFeeGmd ?? DEFAULT_DELIVERY_PRICING_POLICY.perKmFeeGmd),
    minimumFeeGmd: Number(source.minimumFeeGmd ?? DEFAULT_DELIVERY_PRICING_POLICY.minimumFeeGmd),
    minimumAllowedFeeGmd: Number(source.minimumAllowedFeeGmd ?? DEFAULT_DELIVERY_PRICING_POLICY.minimumAllowedFeeGmd),
    maximumFeeGmd: Number(source.maximumFeeGmd ?? DEFAULT_DELIVERY_PRICING_POLICY.maximumFeeGmd),
  };
  const valid = Number.isFinite(policy.baseFeeGmd) && policy.baseFeeGmd >= 0 && policy.baseFeeGmd <= 2000 &&
    Number.isFinite(policy.perKmFeeGmd) && policy.perKmFeeGmd >= 0 && policy.perKmFeeGmd <= 500 &&
    Number.isFinite(policy.minimumFeeGmd) && policy.minimumFeeGmd > 0 && policy.minimumFeeGmd <= 5000 &&
    Number.isFinite(policy.minimumAllowedFeeGmd) && policy.minimumAllowedFeeGmd > 0 && policy.minimumAllowedFeeGmd <= 5000 &&
    Number.isFinite(policy.maximumFeeGmd) && policy.maximumFeeGmd >= policy.minimumAllowedFeeGmd && policy.maximumFeeGmd <= 5000;
  if (!valid) {
    const error = new Error('The administrator delivery pricing policy is invalid. Contact MarketLink support.');
    error.statusCode = 500;
    error.code = 'DELIVERY_PRICING_POLICY_INVALID';
    throw error;
  }
  policy.baseFeeGmd = Number(policy.baseFeeGmd.toFixed(2));
  policy.perKmFeeGmd = Number(policy.perKmFeeGmd.toFixed(2));
  policy.minimumFeeGmd = Number(policy.minimumFeeGmd.toFixed(2));
  policy.minimumAllowedFeeGmd = Number(policy.minimumAllowedFeeGmd.toFixed(2));
  policy.maximumFeeGmd = Number(policy.maximumFeeGmd.toFixed(2));
  return policy;
}

function validateDeliveryPricingPolicy(input = {}) {
  let policy;
  try {
    policy = normaliseDeliveryPricingPolicy(input);
  } catch (cause) {
    const error = new Error(cause.message || 'Enter a valid delivery pricing policy.');
    error.statusCode = 400;
    error.code = 'INVALID_DELIVERY_PRICING_POLICY';
    throw error;
  }
  if (policy.minimumFeeGmd < policy.minimumAllowedFeeGmd || policy.minimumFeeGmd > policy.maximumFeeGmd ||
      policy.baseFeeGmd > policy.maximumFeeGmd) {
    const error = new Error('The default base and minimum delivery fares must stay inside the administrator-approved fee range.');
    error.statusCode = 400;
    error.code = 'INVALID_DELIVERY_PRICING_POLICY';
    throw error;
  }
  return policy;
}

function applyDeliveryPricingLimits(fee, policyValue) {
  const policy = normaliseDeliveryPricingPolicy(policyValue);
  const value = Number(fee);
  if (!Number.isFinite(value) || value < 0) {
    const error = new Error('The calculated delivery fare is invalid.');
    error.statusCode = 500;
    error.code = 'DELIVERY_FARE_INVALID';
    throw error;
  }
  return Number(Math.min(policy.maximumFeeGmd, Math.max(policy.minimumAllowedFeeGmd, value)).toFixed(2));
}

module.exports = {
  DEFAULT_DELIVERY_PRICING_POLICY,
  normaliseDeliveryPricingPolicy,
  validateDeliveryPricingPolicy,
  applyDeliveryPricingLimits,
};
