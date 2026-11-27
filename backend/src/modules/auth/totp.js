'use strict';
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g,'');
  let bits = 0, value = 0; const out = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char); if (idx < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function encryptionKey() {
  const master = String(process.env.JWT_ACCESS_SECRET || '');
  if (master.length < 32) throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters before Admin authenticator setup.');
  return crypto.createHash('sha256').update('MarketLink Admin TOTP encryption v1:').update(master).digest();
}
function encryptSecret(secret) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret),'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decryptSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) throw new Error('Encrypted authenticator secret is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[0],'base64'));
  decipher.setAuthTag(Buffer.from(parts[1],'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2],'base64')),decipher.final()]).toString('utf8');
}
function generateSecret() { return base32Encode(crypto.randomBytes(20)); }
function hotp(secret, counter) {
  const key = base32Decode(secret), msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1',key).update(msg).digest();
  const offset = digest[digest.length-1] & 15;
  const binary = ((digest[offset]&127)<<24)|((digest[offset+1]&255)<<16)|((digest[offset+2]&255)<<8)|(digest[offset+3]&255);
  return String(binary % 1000000).padStart(6,'0');
}
function verifyCode(secret, code, now = Date.now()) {
  const value = String(code || '').replace(/\s/g,'');
  if (!/^\d{6}$/.test(value)) return false;
  const counter = Math.floor(now / 30000);
  for (let drift=-1; drift<=1; drift++) {
    const expected = hotp(secret,counter+drift);
    const a=Buffer.from(expected), b=Buffer.from(value);
    if (a.length===b.length && crypto.timingSafeEqual(a,b)) return true;
  }
  return false;
}
function provisioningUri(secret, account) {
  const label = encodeURIComponent('MarketLink Gambia:' + String(account || 'Administrator'));
  return 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=MarketLink%20Gambia&algorithm=SHA1&digits=6&period=30';
}
module.exports = { generateSecret, encryptSecret, decryptSecret, verifyCode, provisioningUri };
