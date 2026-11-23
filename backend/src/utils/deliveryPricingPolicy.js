'use strict';

const DEFAULT_DELIVERY_PRICING_POLICY = Object.freeze({
  baseFeeGmd: 150,
  perKmFeeGmd: 10,
  minimumFeeGmd: 150,
  minimumAllowedFeeGmd: 150,
  maximumFeeGmd: 5000,
  allowRiderOverrides: true,
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
    allowRiderOverrides: source.allowRiderOverrides !== false,
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

 
function validateRiderDeliveryOverride(input = {}, policyValue) {
  const policy = normaliseDeliveryPricingPolicy(policyValue);
  const baseFeeGmd = Number(input.baseFeeGmd);
  const perKmFeeGmd = Number(input.perKmFeeGmd);
  const minimumFeeGmd = Number(input.minimumFeeGmd);
  if (![baseFeeGmd, perKmFeeGmd, minimumFeeGmd].every(Number.isFinite) ||
      baseFeeGmd < 0 || baseFeeGmd > policy.maximumFeeGmd ||
      perKmFeeGmd < 0 || perKmFeeGmd > 500 ||
      minimumFeeGmd < policy.minimumAllowedFeeGmd || minimumFeeGmd > policy.maximumFeeGmd) {
    const error = new Error('Enter a valid GMD rider tariff inside the administrator-approved limits.');
    error.statusCode = 400;
    error.code = 'INVALID_RIDER_PRICING_OVERRIDE';
    throw error;
  }
  const rawRates = input.routeRates === undefined ? [] : input.routeRates;
  if (!Array.isArray(rawRates) || rawRates.length > 20) {
    const error = new Error('An Admin rider override can contain up to 20 fixed pickup-to-destination prices.');
    error.statusCode = 400;
    error.code = 'INVALID_RIDER_PRICING_OVERRIDE';
    throw error;
  }
  const seen = new Set();
  const routeRates = rawRates.map((rate, index) => {
    const originArea = String(rate && rate.originArea || '').trim();
    const destinationArea = String(rate && rate.destinationArea || '').trim();
    const fixedFeeGmd = Number(rate && (rate.fixedFeeGmd ?? rate.fixedFee));
    if (!originArea || !destinationArea || originArea.length > 120 || destinationArea.length > 120 ||
        !Number.isFinite(fixedFeeGmd) || fixedFeeGmd < policy.minimumAllowedFeeGmd || fixedFeeGmd > policy.maximumFeeGmd) {
      const error = new Error('Fixed route ' + (index + 1) + ' needs two locality names and a fare within the Admin-approved GMD range.');
      error.statusCode = 400;
      error.code = 'INVALID_RIDER_PRICING_OVERRIDE';
      throw error;
    }
    const key = originArea.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() +
      '|' + destinationArea.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) {
      const error = new Error('Duplicate Admin fixed route at row ' + (index + 1) + '.');
      error.statusCode = 400;
      error.code = 'DUPLICATE_RIDER_PRICING_ROUTE';
      throw error;
    }
    seen.add(key);
    return { originArea, destinationArea, fixedFeeGmd: Number(fixedFeeGmd.toFixed(2)) };
  });
  return {
    enabled: input.enabled !== false,
    baseFeeGmd: Number(baseFeeGmd.toFixed(2)),
    perKmFeeGmd: Number(perKmFeeGmd.toFixed(2)),
    minimumFeeGmd: Number(minimumFeeGmd.toFixed(2)),
    routeRates,
  };
}

function resolveRiderDeliveryTariff(rider, riderRouteRates = [], policyValue) {
  const policy = normaliseDeliveryPricingPolicy(policyValue);
  if (rider && rider.admin_delivery_pricing_override != null) {
    const override = parsePolicyValue(rider.admin_delivery_pricing_override);
    const validated = validateRiderDeliveryOverride(override, policy);
    return {
      enabled: validated.enabled,
      baseFeeGmd: validated.baseFeeGmd,
      perKmFeeGmd: validated.perKmFeeGmd,
      minimumFeeGmd: validated.minimumFeeGmd,
      routeRates: validated.routeRates.map(rate => ({
        origin_area: rate.originArea,
        destination_area: rate.destinationArea,
        fixed_fee_gmd: rate.fixedFeeGmd,
      })),
      adminOverrideActive: true,
    };
  }
  return {
    enabled: Boolean(rider && rider.delivery_pricing_enabled && policy.allowRiderOverrides),
    baseFeeGmd: rider && rider.delivery_base_fee_gmd == null ? policy.baseFeeGmd : Number(rider.delivery_base_fee_gmd),
    perKmFeeGmd: rider && rider.delivery_per_km_fee_gmd == null ? policy.perKmFeeGmd : Number(rider.delivery_per_km_fee_gmd),
    minimumFeeGmd: rider && rider.delivery_min_fee_gmd == null ? policy.minimumFeeGmd : Math.max(policy.minimumAllowedFeeGmd, Number(rider.delivery_min_fee_gmd)),
    routeRates: Array.isArray(riderRouteRates) ? riderRouteRates : [],
    adminOverrideActive: false,
  };
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
  validateRiderDeliveryOverride,
  resolveRiderDeliveryTariff,
  applyDeliveryPricingLimits,
};
