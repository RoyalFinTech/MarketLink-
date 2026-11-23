'use strict';

const {
  haversineKm,
  estimateRoadDistanceKm,
  normalizeArea,
  matchingRouteRate,
  calculateDeliveryFare,
} = require('./deliveryPricing');

describe('delivery pricing calculator', () => {
  test('estimates distance from saved vendor and customer GPS coordinates', () => {
    const km = haversineKm(
      { latitude: 13.4549, longitude: -16.5790 },
      { latitude: 13.4300, longitude: -16.6700 }
    );
    expect(km).toBeGreaterThan(9);
    expect(km).toBeLessThan(11);
    expect(estimateRoadDistanceKm(
      { latitude: 13.4549, longitude: -16.5790 },
      { latitude: 13.4300, longitude: -16.6700 }
    )).toBeGreaterThan(km);
  });

  test('rejects missing GPS rather than falling back to an invented flat delivery price', () => {
    expect(haversineKm({ latitude: null, longitude: 0 }, { latitude: 1, longitude: 1 })).toBeNull();
    expect(haversineKm({ latitude: '', longitude: 0 }, { latitude: 1, longitude: 1 })).toBeNull();
    expect(haversineKm({ latitude: undefined, longitude: 0 }, { latitude: 1, longitude: 1 })).toBeNull();
    expect(estimateRoadDistanceKm({}, {})).toBeNull();
  });

  test('normalizes Gambian locality labels and matches a saved rider route', () => {
    expect(normalizeArea('  Serrekunda, KMC  ')).toBe('serrekunda kmc');
    const lane = matchingRouteRate([
      { origin_area: 'Serrekunda', destination_area: 'Brikama', fixed_fee: '65.00' }
    ], 'SERREKUNDA', ' Brikama ');
    expect(lane.fixed_fee).toBe('65.00');
  });

  test('matches a locality within a full pickup or customer address', () => {
    const lane = matchingRouteRate([
      { origin_area: 'Serrekunda', destination_area: 'Brikama', fixed_fee: '65.00' }
    ], 'Kairaba Avenue, Serrekunda, The Gambia', 'Brikama New Town, West Coast Region');
    expect(lane.fixed_fee).toBe('65.00');
  });

  test('uses a rider route price before the per-kilometre formula', () => {
    expect(calculateDeliveryFare({ fixedFee: 65, baseFee: 20, perKmFee: 5, minimumFee: 25, distanceKm: 8 })).toBe(65);
  });

  test('calculates the rider default fare and enforces the minimum', () => {
    expect(calculateDeliveryFare({ baseFee: 20, perKmFee: 5, minimumFee: 25, distanceKm: 8 })).toBe(60);
    expect(calculateDeliveryFare({ baseFee: 10, perKmFee: 2, minimumFee: 25, distanceKm: 3 })).toBe(25);
  });
});
