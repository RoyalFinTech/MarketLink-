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

async function sendTwilioSms({to,message}){
 const sid=String(process.env.TWILIO_ACCOUNT_SID||'').trim(),key=String(process.env.TWILIO_API_KEY||'').trim(),secret=String(process.env.TWILIO_API_SECRET||'').trim(),token=String(process.env.TWILIO_AUTH_TOKEN||'').trim();
 const useKey=Boolean(key&&secret),username=useKey?key:sid,password=useKey?secret:token,from=String(process.env.TWILIO_FROM_NUMBER||'').trim(),serviceSid=String(process.env.TWILIO_MESSAGING_SERVICE_SID||'').trim();
 if(!sid||!username||!password)return{sent:false,provider:'twilio',reason:'TWILIO_ACCOUNT_AND_API_CREDENTIALS_REQUIRED'};
 if(!from&&!serviceSid)return{sent:false,provider:'twilio',reason:'TWILIO_FROM_NUMBER_OR_MESSAGING_SERVICE_REQUIRED'};
 try{
  const form=new URLSearchParams({To:String(to),Body:String(message)});
  if(serviceSid)form.set('MessagingServiceSid',serviceSid);else form.set('From',from);
  const response=await requestWithTimeout('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64'),Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch(_){}
  if(!response.ok||!data.sid){logger.warn('Twilio SMS request was not accepted',{status:response.status,providerCode:data.code||null});return{sent:false,provider:'twilio',status:response.status,reason:'PROVIDER_REJECTED'};}
  return{sent:true,provider:'twilio',messageSid:data.sid,status:data.status||'accepted'};
 }catch(error){logger.error('Twilio SMS request failed',{error:error.message});return{sent:false,provider:'twilio',reason:'PROVIDER_REQUEST_FAILED'};}
}
async function sendAfricaTalkingSms({to,message}){
 if(!process.env.AFRICASTALKING_API_KEY||!process.env.AFRICASTALKING_USERNAME)return{sent:false,provider:'africastalking',reason:'AFRICASTALKING_API_KEY_AND_USERNAME_REQUIRED'};
 try{
  const form=new URLSearchParams({username:process.env.AFRICASTALKING_USERNAME,to:String(to),message:String(message)});
  if(process.env.AFRICASTALKING_SENDER_ID)form.set('from',process.env.AFRICASTALKING_SENDER_ID);
  const response=await requestWithTimeout('https://api.africastalking.com/version1/messaging',{method:'POST',headers:{apiKey:process.env.AFRICASTALKING_API_KEY,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch(_){}
  const recipients=data.SMSMessageData&&data.SMSMessageData.Recipients;
  if(!response.ok||!Array.isArray(recipients)||!recipients.length){logger.warn("Africa's Talking SMS request was not accepted",{status:response.status});return{sent:false,provider:'africastalking',status:response.status,reason:'PROVIDER_REJECTED'};}
  const accepted=recipients.filter(x=>['100','101','102'].includes(String(x.statusCode)));
  return{sent:accepted.length>0,provider:'africastalking',accepted:accepted.length,failed:recipients.length-accepted.length};
 }catch(error){logger.error("Africa's Talking SMS request failed",{error:error.message});return{sent:false,provider:'africastalking',reason:'PROVIDER_REQUEST_FAILED'};}
}
async function sendSms({to,message}){
 if(!to||!message)return{sent:false,reason:'RECIPIENT_AND_MESSAGE_REQUIRED'};
 const provider=String(process.env.SMS_PROVIDER||'africastalking').trim().toLowerCase();
 if(provider==='twilio')return sendTwilioSms({to,message});
 if(provider==='africastalking'||provider==='africa_talking')return sendAfricaTalkingSms({to,message});
 return{sent:false,provider,reason:'UNSUPPORTED_SMS_PROVIDER'};
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


async function listCampaigns({page=1,limit=25}={}){
 const p=Math.max(parseInt(page,10)||1,1),l=Math.min(Math.max(parseInt(limit,10)||25,1),100),offset=(p-1)*l;
 const {rows}=await query("SELECT id,title,body,audience,channels,status,recipient_count,sent_count,failed_count,created_at,sent_at FROM notification_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2",[l,offset]);
 const {rows:[count]}=await query("SELECT count(*)::int AS total FROM notification_campaigns",[]);
 return {items:rows,total:count.total,page:p,limit:l,totalPages:Math.ceil(count.total/l)};
}
async function createCampaign({title,body,audience,channels,createdBy,recipientIds=[]}){
 const allowed=['all','customers','vendors','riders','admins','selected'];
 if(!allowed.includes(audience)){const e=new Error('Unsupported campaign audience.');e.status=400;e.code='INVALID_CAMPAIGN_AUDIENCE';throw e;}
 const ids=Array.isArray(recipientIds)?Array.from(new Set(recipientIds.map(x=>String(x)))):[];
 if(audience==='selected'&&(!ids.length||ids.length>100)){const e=new Error('Select between 1 and 100 individual recipients.');e.status=400;e.code='CAMPAIGN_RECIPIENTS_REQUIRED';throw e;}
 if(audience!=='selected'&&ids.length){const e=new Error('Individual recipients are only valid for a selected-recipient campaign.');e.status=400;e.code='CAMPAIGN_RECIPIENTS_NOT_ALLOWED';throw e;}
 const safeChannels={inapp:true,email:!!(channels&&channels.email),sms:!!(channels&&channels.sms),push:!!(channels&&channels.push)};
 if(!safeChannels.inapp&&!safeChannels.email&&!safeChannels.sms&&!safeChannels.push){const e=new Error('Select at least one delivery channel.');e.status=400;e.code='CAMPAIGN_CHANNEL_REQUIRED';throw e;}
 const {rows:valid}=ids.length?await query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'",[ids]):{rows:[]};
 if(ids.length&&valid.length!==ids.length){const e=new Error('One or more selected recipients are unavailable or inactive. Refresh the directory and try again.');e.status=400;e.code='INVALID_CAMPAIGN_RECIPIENTS';throw e;}
 const {rows:[campaign]}=await query("INSERT INTO notification_campaigns(title,body,audience,channels,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *",[title,body||null,audience,JSON.stringify(safeChannels),createdBy]);
 if(ids.length) await query("INSERT INTO notification_campaign_recipients(campaign_id,user_id,status) SELECT $1,recipient_id,'queued' FROM unnest($2::uuid[]) AS recipient_id ON CONFLICT(campaign_id,user_id) DO NOTHING",[campaign.id,ids]);
 return campaign;
}
async function sendCampaign(campaignId,actorId){
 const {rows:[campaign]}=await query("UPDATE notification_campaigns SET status='sending',updated_at=now() WHERE id=$1 AND status='draft' RETURNING *",[campaignId]);
 if(!campaign){const e=new Error('Campaign not found or it has already been sent.');e.status=409;e.code='CAMPAIGN_NOT_SENDABLE';throw e;}
 let users=[];
 if(campaign.audience==='selected'){
  const {rows}=await query("SELECT u.id,u.email,u.phone FROM notification_campaign_recipients cr JOIN users u ON u.id=cr.user_id WHERE cr.campaign_id=$1 AND cr.status='queued' AND u.status='active' ORDER BY u.created_at ASC",[campaignId]);
  users=rows;
 }else{
  let audienceSql="u.status='active'";
  if(campaign.audience==='customers')audienceSql+=" AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='customer')";
  if(campaign.audience==='vendors')audienceSql+=" AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='vendor')";
  if(campaign.audience==='riders')audienceSql+=" AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='rider')";
  if(campaign.audience==='admins')audienceSql+=" AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name IN ('admin','super_admin','moderator'))";
  const result=await query("SELECT u.id,u.email,u.phone FROM users u WHERE "+audienceSql+" ORDER BY u.created_at ASC LIMIT 1000",[]);
  users=result.rows;
 }
 await query("UPDATE notification_campaigns SET recipient_count=$2,updated_at=now() WHERE id=$1",[campaignId,users.length]);
 let sent=0,failed=0;
 for(let i=0;i<users.length;i+=5){
  const batch=users.slice(i,i+5);
  await Promise.all(batch.map(async user=>{
   try{
    const result=await send({userId:user.id,type:'admin_campaign',title:campaign.title,body:campaign.body,referenceType:'notification_campaign',referenceId:campaignId,channels:{email:!!campaign.channels.email,emailAddress:user.email,sms:!!campaign.channels.sms,phone:user.phone,push:!!campaign.channels.push,data:{campaignId:String(campaignId)}}});
    const delivery=result.deliveryResults||{},requested=['email','sms','push'].filter(k=>campaign.channels[k]);
    const externalSent=requested.filter(k=>delivery[k]&&delivery[k].sent).length;
    const status=requested.length&&externalSent<requested.length?(externalSent?'partial':'partial'):'sent';
    await query("INSERT INTO notification_campaign_recipients(campaign_id,user_id,status,notification_id,delivery_results,attempted_at) VALUES($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT(campaign_id,user_id) DO UPDATE SET status=EXCLUDED.status,notification_id=EXCLUDED.notification_id,delivery_results=EXCLUDED.delivery_results,attempted_at=now()",[campaignId,user.id,status,result.id,JSON.stringify({inapp:{sent:true},...delivery})]);
    if(status==='sent')sent++;else failed++;
   }catch(error){
    failed++;
    await query("INSERT INTO notification_campaign_recipients(campaign_id,user_id,status,delivery_results,attempted_at) VALUES($1,$2,'failed',$3::jsonb,now()) ON CONFLICT(campaign_id,user_id) DO UPDATE SET status='failed',delivery_results=EXCLUDED.delivery_results,attempted_at=now()",[campaignId,user.id,JSON.stringify({error:error.code||'DELIVERY_FAILED'})]).catch(()=>null);
   }
  }));
 }
 const finalStatus=failed===0?'sent':sent===0?'failed':'partial';
 const {rows:[updated]}=await query("UPDATE notification_campaigns SET status=$2,sent_count=$3,failed_count=$4,sent_at=now(),updated_at=now() WHERE id=$1 RETURNING id,title,audience,status,recipient_count,sent_count,failed_count,sent_at",[campaignId,finalStatus,sent,failed]);
 await query("INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data) SELECT $1,COALESCE((SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.name IN ('admin','super_admin','moderator') LIMIT 1),'admin'),'notification.campaign_sent','notification_campaign',$2,$3::jsonb",[actorId,campaignId,JSON.stringify({audience:campaign.audience,recipientCount:users.length,sent,failed})]).catch(()=>null);
 return updated;
}

module.exports = {
  send, getForUser, markRead, getUnreadCount, sendEmail, sendSms, sendPush,
  registerPushToken, removePushToken, pushToUser, listCampaigns, createCampaign, sendCampaign
};
