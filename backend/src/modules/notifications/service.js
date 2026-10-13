// src/modules/notifications/service.js
// Actual provider adapters. Unconfigured channels return sent:false.
'use strict';
const crypto = require('crypto');
const { query } = require('../../config/db');
const logger = require('../../utils/logger');
let firebaseTokenCache = null;

async function requestWithTimeout(url, options, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, Object.assign({}, options, { signal: controller.signal })); }
  finally { clearTimeout(timer); }
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (firebaseTokenCache && firebaseTokenCache.expiresAt > now + 60) return firebaseTokenCache.token;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!process.env.FIREBASE_PROJECT_ID || !email || !privateKey) {
    throw new Error('Firebase service credentials missing: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.');
  }
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claims;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(privateKey).toString('base64url');
  const response = await requestWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch (_) {}
  if (!response.ok || !data.access_token) throw new Error('Firebase OAuth token exchange failed with HTTP ' + response.status + '.');
  firebaseTokenCache = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}

async function send({ userId, type, title, body, referenceType, referenceId, channels = {} }) {
  const { rows: [notification] } = await query(
    'INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id,channel_inapp,channel_email,channel_sms,channel_push) VALUES ($1,$2,$3,$4,$5,$6,TRUE,FALSE,FALSE,FALSE) RETURNING *',
    [userId, type, title, body || null, referenceType || null, referenceId || null]
  );
  const deliveryResults = {};
  if (channels.email) {
    deliveryResults.email = channels.emailAddress
      ? await sendEmail({ to: channels.emailAddress, subject: title, text: body })
      : { sent: false, reason: 'NO_RECIPIENT_EMAIL' };
  }
  if (channels.sms) {
    deliveryResults.sms = channels.phone
      ? await sendSms({ to: channels.phone, message: String(title || '') + (body ? ': ' + body : '') })
      : { sent: false, reason: 'NO_RECIPIENT_PHONE' };
  }
  if (channels.push) {
    deliveryResults.push = await pushToUser(userId, {
      title, body,
      data: Object.assign({}, channels.data || {}, {
        notificationId: String(notification.id),
        referenceType: referenceType || '',
        referenceId: referenceId ? String(referenceId) : ''
      })
    });
  }
  await query(
    'UPDATE notifications SET channel_email=$1,channel_sms=$2,channel_push=$3 WHERE id=$4',
    [
      !!(deliveryResults.email && deliveryResults.email.sent),
      !!(deliveryResults.sms && deliveryResults.sms.sent),
      !!(deliveryResults.push && deliveryResults.push.sent),
      notification.id
    ]
  );
  return Object.assign({}, notification, { deliveryResults });
}

async function getForUser(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const limit_ = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit_;
  const extra = unreadOnly ? 'AND read_at IS NULL' : '';
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id=$1 ' + extra + ' ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit_, offset]
  );
  return rows;
}
async function markRead(userId, ids) {
  if (ids && ids.length) {
    await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=ANY($2::uuid[]) AND read_at IS NULL', [userId, ids]);
  } else {
    await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [userId]);
  }
}
async function getUnreadCount(userId) {
  const { rows: [row] } = await query('SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL', [userId]);
  return parseInt(row.count, 10);
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'NO_RECIPIENT_EMAIL' };
  try {
    if (process.env.RESEND_API_KEY) {
      const response = await requestWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'MarketLink <marketlinkgambia@gmail.com>',
          to: [to],
          subject: subject || 'MarketLink notification',
          text: text || '',
          html: html || undefined
        })
      });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch (_) {}
      if (!response.ok) {
        logger.error('Resend email provider rejected request', { status: response.status });
        return { sent: false, provider: 'resend', status: response.status, reason: 'PROVIDER_REJECTED' };
      }
      return { sent: true, provider: 'resend', id: data.id || null };
    }
    if (process.env.SENDGRID_API_KEY) {
      const configuredFrom = process.env.EMAIL_FROM;
      if (!configuredFrom) return { sent: false, provider: 'sendgrid', reason: 'EMAIL_FROM_MISSING' };
      const match = configuredFrom.match(/<([^>]+)>/);
      const fromEmail = match ? match[1] : configuredFrom;
      const response = await requestWithTimeout('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.SENDGRID_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject: subject || 'MarketLink notification',
          content: [{ type: html ? 'text/html' : 'text/plain', value: html || text || '' }]
        })
      });
      if (response.status !== 202) {
        logger.error('SendGrid email provider rejected request', { status: response.status });
        return { sent: false, provider: 'sendgrid', status: response.status, reason: 'PROVIDER_REJECTED' };
      }
      return { sent: true, provider: 'sendgrid' };
    }
    return { sent: false, reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  } catch (error) {
    logger.error('Email provider request failed', { provider: process.env.RESEND_API_KEY ? 'resend' : 'sendgrid', error: error.message });
    return { sent: false, reason: 'PROVIDER_REQUEST_FAILED' };
  }
}

async function sendSms({ to, message }) {
  if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
    return { sent: false, reason: 'AFRICASTALKING_API_KEY_AND_USERNAME_REQUIRED' };
  }
  if (!to || !message) return { sent: false, reason: 'RECIPIENT_AND_MESSAGE_REQUIRED' };
  try {
    const form = new URLSearchParams({
      username: process.env.AFRICASTALKING_USERNAME,
      to: String(to),
      message: String(message)
    });
    if (process.env.AFRICASTALKING_SENDER_ID) form.set('from', process.env.AFRICASTALKING_SENDER_ID);
    const response = await requestWithTimeout('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: process.env.AFRICASTALKING_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {}
    const recipients = data.SMSMessageData && data.SMSMessageData.Recipients;
    if (!response.ok || !Array.isArray(recipients) || !recipients.length) {
      logger.warn("Africa's Talking SMS request was not accepted", { status: response.status });
      return { sent: false, provider: 'africastalking', status: response.status, reason: 'PROVIDER_REJECTED' };
    }
    const accepted = recipients.filter(item => ['100', '101', '102'].includes(String(item.statusCode)));
    return { sent: accepted.length > 0, provider: 'africastalking', accepted: accepted.length, failed: recipients.length - accepted.length };
  } catch (error) {
    logger.error('SMS provider request failed', { error: error.message });
    return { sent: false, reason: 'PROVIDER_REQUEST_FAILED' };
  }
}

async function sendPush({ token, title, body, data = {} }) {
  if (!token) return { sent: false, reason: 'DEVICE_TOKEN_REQUIRED' };
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { sent: false, reason: 'FIREBASE_PROJECT_ID_CLIENT_EMAIL_AND_PRIVATE_KEY_REQUIRED' };
  }
  try {
    const accessToken = await getFirebaseAccessToken();
    const safeData = {};
    Object.keys(data || {}).forEach(key => {
      if (/^[A-Za-z0-9_]+$/.test(key)) safeData[key] = String(data[key] == null ? '' : data[key]);
    });
    const message = {
      token,
      notification: { title: String(title || 'MarketLink update'), body: String(body || '') },
      data: safeData,
      webpush: { notification: { title: String(title || 'MarketLink update'), body: String(body || '') } }
    };
    const url = String((data || {}).url || '');
    if (url.startsWith('https://') || url.startsWith('http://')) message.webpush.fcmOptions = { link: url };
    const response = await requestWithTimeout(
      'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(process.env.FIREBASE_PROJECT_ID) + '/messages:send',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      }
    );
    const raw = await response.text();
    if (!response.ok) {
      let providerError = {};
      try { providerError = JSON.parse(raw); } catch (_) {}
      const detail = providerError.error && providerError.error.details && providerError.error.details[0];
      const reason = detail && detail.errorCode ? detail.errorCode : 'PROVIDER_REJECTED';
      return { sent: false, provider: 'fcm', status: response.status, reason };
    }
    let result = {};
    try { result = JSON.parse(raw); } catch (_) {}
    return { sent: true, provider: 'fcm', messageId: result.name || null };
  } catch (error) {
    logger.error('FCM request failed', { error: error.message });
    return { sent: false, provider: 'fcm', reason: 'PROVIDER_REQUEST_FAILED' };
  }
}

async function registerPushToken(userId, token, platform = 'web') {
  if (typeof token !== 'string' || token.trim().length < 20 || token.length > 4096) {
    const error = new Error('Invalid push device token.'); error.status = 400; error.code = 'INVALID_PUSH_TOKEN'; throw error;
  }
  const { rows: [user] } = await query('SELECT device_info FROM users WHERE id=$1', [userId]);
  if (!user) { const error = new Error('User not found.'); error.status = 404; error.code = 'USER_NOT_FOUND'; throw error; }
  let info = user.device_info;
  if (typeof info === 'string') { try { info = JSON.parse(info); } catch (_) { info = {}; } }
  if (!info || typeof info !== 'object' || Array.isArray(info)) info = {};
  const tokens = Array.isArray(info.pushTokens) ? info.pushTokens : [];
  const next = tokens.filter(item => item && item.token !== token);
  next.push({ token, platform: ['web', 'ios', 'android'].includes(platform) ? platform : 'web', updatedAt: new Date().toISOString() });
  info.pushTokens = next.slice(-10);
  await query('UPDATE users SET device_info=$1::jsonb WHERE id=$2', [JSON.stringify(info), userId]);
  return { registered: true, platform: ['web', 'ios', 'android'].includes(platform) ? platform : 'web' };
}

async function removePushToken(userId, token) {
  if (typeof token !== 'string' || !token.trim()) { const error = new Error('A device token is required.'); error.status = 400; error.code = 'PUSH_TOKEN_REQUIRED'; throw error; }
  const { rows: [user] } = await query('SELECT device_info FROM users WHERE id=$1', [userId]);
  if (!user) return { removed: false };
  let info = user.device_info;
  if (typeof info === 'string') { try { info = JSON.parse(info); } catch (_) { info = {}; } }
  if (!info || typeof info !== 'object' || Array.isArray(info)) info = {};
  info.pushTokens = (Array.isArray(info.pushTokens) ? info.pushTokens : []).filter(item => item && item.token !== token);
  await query('UPDATE users SET device_info=$1::jsonb WHERE id=$2', [JSON.stringify(info), userId]);
  return { removed: true };
}

async function pushToUser(userId, notification) {
  const { rows: [user] } = await query('SELECT device_info FROM users WHERE id=$1', [userId]);
  if (!user) return { sent: false, reason: 'USER_NOT_FOUND', sentCount: 0 };
  let info = user.device_info;
  if (typeof info === 'string') { try { info = JSON.parse(info); } catch (_) { info = {}; } }
  const tokens = info && Array.isArray(info.pushTokens) ? info.pushTokens : [];
  if (!tokens.length) return { sent: false, reason: 'NO_REGISTERED_DEVICE', sentCount: 0 };
  const results = await Promise.all(tokens.map(async item => {
    const result = await sendPush({ token: item.token, title: notification.title, body: notification.body, data: notification.data || {} });
    if (!result.sent && ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(String(result.reason))) {
      await removePushToken(userId, item.token).catch(() => {});
    }
    return result;
  }));
  const sentCount = results.filter(result => result.sent).length;
  return { sent: sentCount > 0, sentCount, failedCount: results.length - sentCount, results: results.map(result => ({ sent: result.sent, reason: result.reason || null })) };
}

module.exports = {
  send, getForUser, markRead, getUnreadCount, sendEmail, sendSms, sendPush,
  registerPushToken, removePushToken, pushToUser
};
