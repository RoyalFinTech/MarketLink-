'use strict';
const totp=require('./totp');
describe('MarketLink Admin TOTP primitives',()=>{
 const oldSecret=process.env.JWT_ACCESS_SECRET;
 beforeEach(()=>{process.env.JWT_ACCESS_SECRET='marketlink-test-access-secret-with-at-least-32-characters';});
 afterAll(()=>{if(oldSecret===undefined)delete process.env.JWT_ACCESS_SECRET;else process.env.JWT_ACCESS_SECRET=oldSecret;});
 test('verifies the RFC 6238 SHA1 six-digit test vector',()=>{
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(totp.verifyCode(secret,'287082',59000)).toBe(true);
  expect(totp.verifyCode(secret,'287083',59000)).toBe(false);
  expect(totp.verifyCode(secret,'12345',59000)).toBe(false);
 });
 test('encrypts and decrypts a generated secret using authenticated encryption',()=>{
  const secret=totp.generateSecret(),ciphertext=totp.encryptSecret(secret);
  expect(ciphertext).not.toContain(secret);
  expect(totp.decryptSecret(ciphertext)).toBe(secret);
  const tampered=ciphertext.slice(0,-2)+'AA';
  expect(()=>totp.decryptSecret(tampered)).toThrow();
 });
 test('builds a standards-compatible otpauth URI',()=>{
  const uri=totp.provisioningUri('ABC234','admin@example.test');
  expect(uri).toContain('otpauth://totp/');
  expect(uri).toContain('secret=ABC234');
  expect(uri).toContain('issuer=MarketLink%20Gambia');
  expect(uri).toContain('digits=6&period=30');
 });
});
