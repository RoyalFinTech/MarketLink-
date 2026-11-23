'use strict';
const {
  DEFAULT_DELIVERY_PRICING_POLICY,
  normaliseDeliveryPricingPolicy,
  validateDeliveryPricingPolicy,
  applyDeliveryPricingLimits,
  validateRiderDeliveryOverride,
  resolveRiderDeliveryTariff,
} = require('./deliveryPricingPolicy');

describe('administrator delivery pricing policy', () => {
  test('uses the Gambia D150 starter fare and D10 per kilometre', () => {
    expect(normaliseDeliveryPricingPolicy(null)).toEqual(DEFAULT_DELIVERY_PRICING_POLICY);
  });

  test('normalises JSONB text and object settings', () => {
    const input={baseFeeGmd:180,perKmFeeGmd:12,minimumFeeGmd:160,minimumAllowedFeeGmd:50,maximumFeeGmd:600};
    expect(normaliseDeliveryPricingPolicy(JSON.stringify(input))).toEqual({...input,allowRiderOverrides:true});
    expect(normaliseDeliveryPricingPolicy(input)).toEqual({...input,allowRiderOverrides:true});
    expect(normaliseDeliveryPricingPolicy({...input,allowRiderOverrides:false}).allowRiderOverrides).toBe(false);
  });

  test('applies the administrator-approved minimum and maximum to a rider quote', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:100,maximumFeeGmd:500};
    expect(applyDeliveryPricingLimits(80,policy)).toBe(100);
    expect(applyDeliveryPricingLimits(640,policy)).toBe(500);
    expect(applyDeliveryPricingLimits(235.555,policy)).toBe(235.56);
  });

  test('rejects a default fare outside the administrator-approved bounds', () => {
    let thrown;
    try {
      validateDeliveryPricingPolicy({baseFeeGmd:600,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:100,maximumFeeGmd:500});
    } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({code:'INVALID_DELIVERY_PRICING_POLICY',statusCode:400});
  });

  test('rejects an inverted minimum/maximum range', () => {
    let thrown;
    try {
      validateDeliveryPricingPolicy({baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:600,maximumFeeGmd:500});
    } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({code:'INVALID_DELIVERY_PRICING_POLICY',statusCode:400});
  });
  test('validates and resolves a separate Admin rider override without changing the rider tariff', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000};
    const savedRider={delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:14,delivery_min_fee_gmd:180};
    const override=validateRiderDeliveryOverride({
      enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200,
      routeRates:[{originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:250}]
    },policy);
    const effective=resolveRiderDeliveryTariff({...savedRider,admin_delivery_pricing_override:override},[],policy);
    expect(effective).toMatchObject({enabled:true,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200,adminOverrideActive:true});
    expect(effective.routeRates[0]).toMatchObject({origin_area:'Serrekunda',destination_area:'Brikama',fixed_fee_gmd:250});
    expect(savedRider.delivery_base_fee_gmd).toBe(220);
  });

  test('lets Admin disable a rider quote or clear the override to restore rider-owned prices', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000};
    const rider={delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:14,delivery_min_fee_gmd:180};
    const off=validateRiderDeliveryOverride({enabled:false,baseFeeGmd:300,perKmFeeGmd:18,minimumFeeGmd:200},policy);
    expect(resolveRiderDeliveryTariff({...rider,admin_delivery_pricing_override:off},[],policy)).toMatchObject({enabled:false,adminOverrideActive:true});
    expect(resolveRiderDeliveryTariff(rider,[],policy)).toMatchObject({enabled:true,baseFeeGmd:220,perKmFeeGmd:14,minimumFeeGmd:180,adminOverrideActive:false});
  });

  test('rejects Admin rider route fares below the Admin floor and duplicate route pairs', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000};
    expect(() => validateRiderDeliveryOverride({
      enabled:true,baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,
      routeRates:[{originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:100}]
    },policy)).toThrow(expect.objectContaining({code:'INVALID_RIDER_PRICING_OVERRIDE'}));
    expect(() => validateRiderDeliveryOverride({
      enabled:true,baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,
      routeRates:[
        {originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:150},
        {originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:160}
      ]
    },policy)).toThrow(expect.objectContaining({code:'DUPLICATE_RIDER_PRICING_ROUTE'}));
  });

  test('re-clamps saved rider and Admin fixed-route tariffs after global price guardrails change', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:200,maximumFeeGmd:800,allowRiderOverrides:true};
    const rider={
      delivery_pricing_enabled:true,delivery_base_fee_gmd:0,delivery_per_km_fee_gmd:10,delivery_min_fee_gmd:150,
      admin_delivery_pricing_override:{
        enabled:true,baseFeeGmd:0,perKmFeeGmd:10,minimumFeeGmd:150,
        routeRates:[{originArea:'Serrekunda',destinationArea:'Brikama',fixedFeeGmd:1000}]
      }
    };
    const effective=resolveRiderDeliveryTariff(rider,[],policy);
    expect(effective.baseFeeGmd).toBe(0);
    expect(effective.minimumFeeGmd).toBe(200);
    expect(effective.routeRates[0].fixed_fee_gmd).toBe(800);
  });

  test('clamps rider-owned saved route rates when Admin raises the permitted minimum', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:200,minimumAllowedFeeGmd:200,maximumFeeGmd:5000,allowRiderOverrides:true};
    const rider={delivery_pricing_enabled:true,delivery_base_fee_gmd:0,delivery_per_km_fee_gmd:10,delivery_min_fee_gmd:150};
    const effective=resolveRiderDeliveryTariff(rider,[{origin_area:'Serrekunda',destination_area:'Brikama',fixed_fee_gmd:'125.00',is_active:true}],policy);
    expect(effective.baseFeeGmd).toBe(0);
    expect(effective.minimumFeeGmd).toBe(200);
    expect(effective.routeRates[0].fixed_fee_gmd).toBe(200);
  });

  test('global policy can switch rider self-service pricing off without changing Admin overrides', () => {
    const policy={baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,minimumAllowedFeeGmd:150,maximumFeeGmd:5000,allowRiderOverrides:false};
    const rider={delivery_pricing_enabled:true,delivery_base_fee_gmd:220,delivery_per_km_fee_gmd:14,delivery_min_fee_gmd:180};
    expect(resolveRiderDeliveryTariff(rider,[],policy)).toMatchObject({enabled:false,adminOverrideActive:false});
    const override={enabled:true,baseFeeGmd:150,perKmFeeGmd:10,minimumFeeGmd:150,routeRates:[]};
    expect(resolveRiderDeliveryTariff({...rider,admin_delivery_pricing_override:override},[],policy)).toMatchObject({enabled:true,adminOverrideActive:true});
  });

});
