'use strict';
const {
  DEFAULT_DELIVERY_PRICING_POLICY,
  normaliseDeliveryPricingPolicy,
  validateDeliveryPricingPolicy,
  applyDeliveryPricingLimits,
} = require('./deliveryPricingPolicy');

describe('administrator delivery pricing policy', () => {
  test('uses the Gambia D150 starter fare and D10 per kilometre', () => {
    expect(normaliseDeliveryPricingPolicy(null)).toEqual(DEFAULT_DELIVERY_PRICING_POLICY);
  });

  test('normalises JSONB text and object settings', () => {
    const input={baseFeeGmd:180,perKmFeeGmd:12,minimumFeeGmd:160,minimumAllowedFeeGmd:50,maximumFeeGmd:600};
    expect(normaliseDeliveryPricingPolicy(JSON.stringify(input))).toEqual(input);
    expect(normaliseDeliveryPricingPolicy(input)).toEqual(input);
  });

  test('applies the administrator-approved minimum and maximum to a rider quote', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:100,maximumFeeGmd:500};
    expect(applyDeliveryPricingLimits(80,policy)).toBe(100);
    expect(applyDeliveryPricingLimits(640,policy)).toBe(500);
    expect(applyDeliveryPricingLimits(235.555,policy)).toBe(235.56);
  });

  test('rejects a default fare outside the administrator-approved bounds', () => {
    expect(() => validateDeliveryPricingPolicy({
      baseFeeGmd:600,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:100,maximumFeeGmd:500
    })).toThrow(expect.objectContaining({code:'INVALID_DELIVERY_PRICING_POLICY',statusCode:400}));
  });

  test('rejects an inverted minimum/maximum range', () => {
    expect(() => validateDeliveryPricingPolicy({
      baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:600,maximumFeeGmd:500
    })).toThrow(expect.objectContaining({code:'INVALID_DELIVERY_PRICING_POLICY',statusCode:400}));
  });
});
