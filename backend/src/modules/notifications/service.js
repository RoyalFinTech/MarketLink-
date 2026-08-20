// src/modules/notifications/service.js
// Email: requires RESEND_API_KEY or SENDGRID_API_KEY
// SMS: requires AFRICASTALKING_API_KEY + AFRICASTALKING_USERNAME
// Push: requires FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL
'use strict';
const { query } = require('../../config/db');
const logger = require('../../utils/logger');

// ── In-app ───────────────────────────────────────────────────────────
async function send({ userId, type, title, body, referenceType, referenceId, channels={} }) {
  const { rows: [n] } = await query(
    `INSERT INTO notifications
       (user_id, type, title, body, reference_type, reference_id,
        channel_inapp, channel_email, channel_sms, channel_push)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9) RETURNING *`,
    [userId, type, title, body||null, referenceType||null, referenceId||null,
     !!channels.email, !!channels.sms, !!channels.push]);

  if (channels.email && channels.emailAddress) {
    sendEmail({ to: channels.emailAddress, subject: title, text: body }).catch(()=>{});
  }
  if (channels.sms && channels.phone) {
    sendSms({ to: channels.phone, message: `${title}: ${body}` }).catch(()=>{});
  }
  return n;
}

async function getForUser(userId, { page=1, limit=20, unreadOnly=false }) {
  const limit_ = Math.min(parseInt(limit)||20, 100);
  const offset = (Math.max(parseInt(page)||1,1)-1)*limit_;
  const extra = unreadOnly ? 'AND read_at IS NULL' : '';
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id=$1 ${extra}
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit_, offset]);
  return rows;
}

async function markRead(userId, ids) {
  if (ids?.length) {
    await query(
      `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=ANY($2::uuid[]) AND read_at IS NULL`,
      [userId, ids]);
  } else {
    await query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [userId]);
  }
}

async function getUnreadCount(userId) {
  const { rows:[r] } = await query(
    `SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [userId]);
  return parseInt(r.count);
}

// ── Email abstraction ─────────────────────────────────────────────────
async function sendEmail({ to, subject, text, html }) {
  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    logger.warn('Email not sent — no email provider configured', { to, subject });
    return { sent: false, reason: 'No email provider configured. Set RESEND_API_KEY or SENDGRID_API_KEY in .env' };
  }
  try {
    if (process.env.RESEND_API_KEY) {
      // const { Resend } = require('resend');
      // const resend = new Resend(process.env.RESEND_API_KEY);
      // await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, text, html });
      logger.info('Email sent via Resend (stub)', { to, subject });
      return { sent: true, provider: 'resend' };
    }
  } catch(err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ── SMS abstraction ───────────────────────────────────────────────────
async function sendSms({ to, message }) {
  if (!process.env.AFRICASTALKING_API_KEY) {
    logger.warn('SMS not sent — AFRICASTALKING_API_KEY not configured', { to });
    return { sent: false, reason: 'Set AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME in .env' };
  }
  try {
    // const AT = require('africastalking')({
    //   apiKey: process.env.AFRICASTALKING_API_KEY,
    //   username: process.env.AFRICASTALKING_USERNAME,
    // });
    // await AT.SMS.send({ to: [to], message, from: 'MarketLink' });
    logger.info('SMS sent via Africa\'s Talking (stub)', { to });
    return { sent: true, provider: 'africastalking' };
  } catch(err) {
    logger.error('SMS send failed', { to, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ── Push abstraction ──────────────────────────────────────────────────
async function sendPush({ token, title, body, data }) {
  if (!process.env.FIREBASE_PROJECT_ID) {
    logger.warn('Push not sent — Firebase not configured');
    return { sent: false, reason: 'Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL in .env' };
  }
  try {
    // const admin = require('firebase-admin');
    // if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({...}) });
    // await admin.messaging().send({ token, notification: { title, body }, data });
    logger.info('Push sent via FCM (stub)', { title });
    return { sent: true, provider: 'fcm' };
  } catch(err) {
    logger.error('Push send failed', { error: err.message });
    return { sent: false, error: err.message };
  }
}

module.exports = { send, getForUser, markRead, getUnreadCount, sendEmail, sendSms, sendPush };
