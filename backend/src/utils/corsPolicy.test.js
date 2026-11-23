'use strict';
const { isAllowedCorsOrigin } = require('./corsPolicy');

describe('MarketLink CORS origin allowlist',()=>{
 test.each([
  'https://marketlink-gambia-frontend.onrender.com',
  'https://marketlink-gambia-admin.onrender.com',
  'https://royalfintech.github.io',
 ])('allows exact production frontend origin %s',origin=>{
  expect(isAllowedCorsOrigin(origin,'')).toBe(true);
 });
 test('allows explicit CORS_ORIGIN deployment entries',()=>{
  expect(isAllowedCorsOrigin('https://private-marketlink.example.com','https://private-marketlink.example.com,https://staff.example.com')).toBe(true);
 });
 test('allows localhost development ports only over HTTP',()=>{
  expect(isAllowedCorsOrigin('http://localhost:3010','')).toBe(true);
  expect(isAllowedCorsOrigin('http://127.0.0.1:5501','')).toBe(true);
  expect(isAllowedCorsOrigin('https://localhost:3010','')).toBe(false);
 });
 test.each([
  'https://attacker.github.io',
  'https://marketlink-phishing.vercel.app',
  'https://marketlink-mirror.netlify.app',
  'https://marketlink.replit.dev',
  'https://other.repl.co',
  'https://untrusted.onrender.com',
 ])('rejects unconfigured hosted origin %s',origin=>{
  expect(isAllowedCorsOrigin(origin,'')).toBe(false);
 });
 test('rejects non-HTTP protocols and malformed origins',()=>{
  expect(isAllowedCorsOrigin('file://marketlink','')).toBe(false);
  expect(isAllowedCorsOrigin('not-an-origin','')).toBe(false);
 });
});
