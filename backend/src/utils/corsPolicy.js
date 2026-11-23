'use strict';

const DEPLOYED_ORIGINS = new Set([
  'https://marketlink-gambia-frontend.onrender.com',
  'https://marketlink-gambia-admin.onrender.com',
  'https://royalfintech.github.io',
]);

function isAllowedCorsOrigin(origin, configured = process.env.CORS_ORIGIN || '') {
  if (!origin) return true;
  const configuredOrigins = Array.isArray(configured)
    ? configured.map(value => String(value).trim()).filter(Boolean)
    : String(configured || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowed = new Set([...DEPLOYED_ORIGINS, ...configuredOrigins]);
  if (allowed.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'http:') return false;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch (error) {
    return false;
  }
}

module.exports = { isAllowedCorsOrigin };
