'use strict';

const crypto = require('crypto');

describe('Modem Pay configuration and webhook verification', () => {
  const original = {};
  const keys = ['MODEM_PAY_API_KEY','MODEM_PAY_WEBHOOK_SECRET','MODEM_WEBHOOK_SECRET','MODEM_PAY_SECRET_HASH'];
  beforeEach(() => {
    for (const key of keys) { original[key] = process.env[key]; delete process.env[key]; }
    jest.resetModules();
  });
  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  test('reports webhook configuration as disabled when no signing secret is present', () => {
    const modemPay = require('./modempay');
    expect(modemPay.isWebhookConfigured()).toBe(false);
  });

  test('recognizes the webhook secret variable documented by Modem Pay', () => {
    process.env.MODEM_WEBHOOK_SECRET = 'test-webhook-secret';
    const modemPay = require('./modempay');
    expect(modemPay.isWebhookConfigured()).toBe(true);
  });

  test('requires a non-placeholder server-side API key', () => {
    const modemPay = require('./modempay');
    expect(modemPay.isConfigured()).toBe(false);
    process.env.MODEM_PAY_API_KEY = 'replace_me';
    expect(modemPay.isConfigured()).toBe(false);
    process.env.MODEM_PAY_API_KEY = 'sk_test_marketlink_test_key';
    expect(modemPay.isConfigured()).toBe(true);
  });

  test('verifies the exact raw request body with HMAC-SHA512', () => {
    const secret = 'test-webhook-secret';
    const raw = '{ "event" : "charge.succeeded", "payload": {"amount":100} }';
    process.env.MODEM_WEBHOOK_SECRET = secret;
    const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');
    const modemPay = require('./modempay');
    expect(modemPay.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(modemPay.verifyWebhookSignature(raw, '0'.repeat(128))).toBe(false);
  });

  test('accepts the canonical JSON representation used by the published Node example', () => {
    const secret = 'test-webhook-secret';
    const raw = '{ "event" : "charge.succeeded", "payload": {"amount":100} }';
    const canonical = JSON.stringify(JSON.parse(raw));
    process.env.MODEM_PAY_WEBHOOK_SECRET = secret;
    const signature = crypto.createHmac('sha512', secret).update(canonical).digest('hex');
    const modemPay = require('./modempay');
    expect(modemPay.verifyWebhookSignature(raw, signature, canonical)).toBe(true);
  });

  test('fails closed when no webhook signing secret is configured', () => {
    const modemPay = require('./modempay');
    expect(() => modemPay.verifyWebhookSignature('{}', '0'.repeat(128))).toThrow(
      expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' })
    );
  });
});
