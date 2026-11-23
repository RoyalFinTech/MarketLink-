'use strict';

const EARTH_RADIUS_KM = 6371;
const DEFAULT_ROAD_DISTANCE_FACTOR = 1.25;

function finiteCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function haversineKm(from, to) {
  const lat1 = finiteCoordinate(from && from.latitude, -90, 90);
  const lng1 = finiteCoordinate(from && from.longitude, -180, 180);
  const lat2 = finiteCoordinate(to && to.latitude, -90, 90);
  const lng2 = finiteCoordinate(to && to.longitude, -180, 180);
  if ([lat1, lng1, lat2, lng2].some(value => value === null)) return null;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function estimateRoadDistanceKm(from, to, factor = DEFAULT_ROAD_DISTANCE_FACTOR) {
  const direct = haversineKm(from, to);
  if (direct === null) return null;
  const multiplier = Number(factor);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 3) {
    throw new TypeError('Road distance factor must be between 1 and 3.');
  }
  return Math.max(0.1, Math.round(direct * multiplier * 10) / 10);
}

function normalizeArea(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function roundGmd(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function matchingRouteRate(routeRates, originArea, destinationArea) {
  const origin = normalizeArea(originArea);
  const destination = normalizeArea(destinationArea);
  if (!origin || !destination) return null;
  return (Array.isArray(routeRates) ? routeRates : []).find(rate =>
    normalizeArea(rate.origin_area || rate.originArea) === origin &&
    normalizeArea(rate.destination_area || rate.destinationArea) === destination
  ) || null;
}

function calculateDeliveryFare({ baseFee, perKmFee, minimumFee, fixedFee, distanceKm }) {
  if (fixedFee !== undefined && fixedFee !== null && fixedFee !== '') {
    const fixed = Number(fixedFee);
    if (!Number.isFinite(fixed) || fixed <= 0 || fixed > 5000) {
      throw new TypeError('Fixed route fee must be between D0.01 and D5,000.');
    }
    return roundGmd(fixed);
  }
  const base = Number(baseFee);
  const perKm = Number(perKmFee);
  const minimum = Number(minimumFee);
  const distance = Number(distanceKm);
  if (![base, perKm, minimum, distance].every(Number.isFinite) ||
      base < 0 || perKm < 0 || minimum <= 0 || distance <= 0 ||
      base > 2000 || perKm > 500 || minimum > 5000) {
    throw new TypeError('Rider delivery pricing is incomplete or outside the allowed range.');
  }
  return roundGmd(Math.max(minimum, base + perKm * distance));
}

module.exports = {
  DEFAULT_ROAD_DISTANCE_FACTOR,
  haversineKm,
  estimateRoadDistanceKm,
  normalizeArea,
  matchingRouteRate,
  calculateDeliveryFare,
  roundGmd,
};
