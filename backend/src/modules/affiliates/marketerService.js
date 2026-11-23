'use strict';
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const uploads = require('../uploads/service');

const MARKETER_ROLE = 'affiliate_marketer';
const CHANNELS = ['whatsapp','facebook','instagram','tiktok','youtube','website','community','other'];

function cleanText(value, max, label) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw new AppError(label + ' is required and must be no longer than ' + max + ' characters.', 400, 'INVALID_APPLICATION');
  return text;
}
function cleanChannels(value) {
  if (!Array.isArray(value)) throw new AppError('Choose at least one marketing channel.',400,'INVALID_CHANNELS');
  const channels = [...new Set(value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean))];
  if (!channels.length || channels.some(v => !CHANNELS.includes(v))) throw new AppError('Choose valid marketing channels.',400,'INVALID_CHANNELS');
  return channels;
}
function safeSocialLinks(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const key of ['facebook','instagram','tiktok','youtube','website']) {
    const raw = String(input[key] || '').trim();
    if (!raw) continue;
    if (raw.length > 500 || !/^https:\/\//i.test(raw)) throw new AppError('Social links must be secure https URLs.',400,'INVALID_SOCIAL_LINK');
    let parsed;
    try { parsed = new URL(raw); } catch(e) { throw new AppError('A social link is invalid.',400,'INVALID_SOCIAL_LINK'); }
    if (!['https:'].includes(parsed.protocol)) throw new AppError('Social links must use HTTPS.',400,'INVALID_SOCIAL_LINK');
    result[key] = parsed.toString();
  }
  return result;
}
async function ensureAffiliate(client,userId) {
  const {rows:[existing]} = await client.query('SELECT user_id FROM affiliates WHERE user_id=$1 FOR UPDATE',[userId]);
  if (existing) return;
  for (let attempt=0; attempt<5; attempt++) {
    const code='ML'+crypto.randomBytes(4).toString('hex').toUpperCase();
    try {
      await client.query("INSERT INTO affiliates(user_id,affiliate_code,commission_pct) VALUES($1,$2,0)",[userId,code]);
      return;
    } catch(error) {
      if (error.code !== '23505') throw error;
    }
  }
  throw new AppError('Could not prepare your MarketLink referral profile. Please contact support.',500,'AFFILIATE_PROFILE_SETUP_FAILED');
}

async function submitApplication(userId, input) {
  const legalName=cleanText(input.legalName,150,'Legal name');
  const address=cleanText(input.residentialAddress,500,'Residential address');
  const plan=cleanText(input.marketingPlan,3000,'Marketing plan');
  if(plan.length<30) throw new AppError('Please provide at least 30 characters describing how you will promote MarketLink.',400,'MARKETING_PLAN_TOO_SHORT');
  const channels=cleanChannels(input.marketingChannels);
  const social=safeSocialLinks(input.socialLinks);
  const identity=await uploads.assertOwnedUploadReference(input.identityDocumentUrl,userId,'affiliate-document',null,'Identity document');
  const selfie=await uploads.assertOwnedUploadReference(input.selfieUrl,userId,'affiliate-document',null,'KYC selfie');
  const addressProof=input.addressProofUrl
    ? await uploads.assertOwnedUploadReference(input.addressProofUrl,userId,'affiliate-document',null,'Address proof')
    : null;
  if(!identity || !selfie) throw new AppError('Upload both an identity document and a selfie before submitting.',400,'KYC_DOCUMENTS_REQUIRED');

  return withTransaction(async client=>{
    const {rows:[user]}=await client.query("SELECT id,status FROM users WHERE id=$1 FOR UPDATE",[userId]);
    if(!user || user.status!=='active') throw new AppError('Your MarketLink account must be active to apply.',403,'ACCOUNT_NOT_ACTIVE');
    await ensureAffiliate(client,userId);
    const {rows:[current]}=await client.query('SELECT status FROM affiliate_marketer_applications WHERE user_id=$1 FOR UPDATE',[userId]);
    if(current && ['pending','approved','suspended'].includes(current.status)) {
      throw new AppError('You already have an Affiliate Marketer application with status: '+current.status+'.',409,'APPLICATION_ALREADY_EXISTS');
    }
    const {rows:[application]}=await client.query(
      `INSERT INTO affiliate_marketer_applications
       (user_id,status,legal_name,residential_address,marketing_channels,social_links,marketing_plan,
        identity_document_file_id,selfie_file_id,address_proof_file_id,submitted_at,reviewed_at,reviewed_by,rejection_reason,updated_at)
       VALUES($1,'pending',$2,$3,$4,$5::jsonb,$6,$7,$8,$9,now(),NULL,NULL,NULL,now())
       ON CONFLICT(user_id) DO UPDATE SET status='pending',legal_name=EXCLUDED.legal_name,
        residential_address=EXCLUDED.residential_address,marketing_channels=EXCLUDED.marketing_channels,
        social_links=EXCLUDED.social_links,marketing_plan=EXCLUDED.marketing_plan,
        identity_document_file_id=EXCLUDED.identity_document_file_id,selfie_file_id=EXCLUDED.selfie_file_id,
        address_proof_file_id=EXCLUDED.address_proof_file_id,submitted_at=now(),reviewed_at=NULL,
        reviewed_by=NULL,rejection_reason=NULL,updated_at=now()
       RETURNING id,status,submitted_at`,
      [userId,legalName,address,channels,JSON.stringify(social),plan,identity.id,selfie.id,addressProof&&addressProof.id||null]
    );
    await client.query("UPDATE affiliates SET marketer_status='pending',commission_pct=0 WHERE user_id=$1",[userId]);
    await client.query(
      "INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'affiliate_application','Affiliate Marketer application received','Your Affiliate Marketer application has been submitted for Admin review. You will be notified when it is reviewed.','affiliate_application',$2)",
      [userId,application.id]
    );
    return {id:application.id,status:application.status,submittedAt:application.submitted_at};
  });
}

async function getMyStatus(userId) {
  const {rows:[row]}=await query(
    `SELECT a.affiliate_code,a.total_clicks,a.total_orders,a.total_earnings,a.marketer_status,
            app.id AS application_id,app.status AS application_status,app.submitted_at,
            app.reviewed_at,app.rejection_reason
     FROM affiliates a LEFT JOIN affiliate_marketer_applications app ON app.user_id=a.user_id
     WHERE a.user_id=$1`,[userId]
  );
  if(!row) return {referrer:null,application:null,marketerStatus:'not_applied'};
  return {
    referrer:{affiliateCode:row.affiliate_code,totalClicks:Number(row.total_clicks||0),totalOrders:Number(row.total_orders||0)},
    marketerStatus:row.marketer_status,
    application:row.application_id?{id:row.application_id,status:row.application_status,submittedAt:row.submitted_at,reviewedAt:row.reviewed_at,rejectionReason:row.rejection_reason}:null
  };
}

async function getDashboard(userId) {
  const status=await getMyStatus(userId);
  if(status.marketerStatus!=='approved') throw new AppError('Your Affiliate Marketer account must be approved before you can access the marketer dashboard.',403,'AFFILIATE_MARKETER_NOT_APPROVED');
  const [wallet,stats]=await Promise.all([
    query('SELECT balance,currency FROM wallets WHERE user_id=$1',[userId]),
    query(`SELECT count(*) FILTER(WHERE status='delivered' AND payment_status='confirmed')::int AS qualifying_orders,
                  COALESCE(sum(affiliate_commission_amount) FILTER(WHERE status='delivered' AND payment_status='confirmed'),0) AS earned
           FROM orders WHERE affiliate_user_id=$1`,[userId])
  ]);
  return {
    affiliateCode:status.referrer.affiliateCode,
    referralClicks:status.referrer.totalClicks,
    qualifyingOrders:Number(stats.rows[0]?.qualifying_orders||0),
    lifetimeEarned:Number(stats.rows[0]?.earned||0),
    walletBalance:Number(wallet.rows[0]?.balance||0),
    currency:wallet.rows[0]?.currency||'GMD'
  };
}

async function listApplications({page=1,limit=20,status='pending',search}={}) {
  const pageNo=Math.max(1,parseInt(page,10)||1),size=Math.min(100,Math.max(1,parseInt(limit,10)||20)),offset=(pageNo-1)*size;
  const params=[],where=[];
  if(status && status!=='all'){params.push(status);where.push('app.status=$'+params.length);}
  if(search){params.push('%'+String(search).trim().slice(0,120)+'%');where.push('(u.full_name ILIKE $'+params.length+' OR u.phone ILIKE $'+params.length+' OR u.email ILIKE $'+params.length+' OR app.legal_name ILIKE $'+params.length+')');}
  const clause=where.length?'WHERE '+where.join(' AND '):'';
  const {rows}=await query(
    `SELECT app.id,app.user_id,app.status,app.legal_name,app.residential_address,
            app.marketing_channels,app.social_links,app.marketing_plan,
            app.identity_document_file_id,app.selfie_file_id,app.address_proof_file_id,
            app.submitted_at,app.reviewed_at,app.reviewed_by,app.rejection_reason,
            u.full_name,u.phone,u.email,u.status AS account_status
     FROM affiliate_marketer_applications app JOIN users u ON u.id=app.user_id
     ${clause} ORDER BY app.submitted_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,size,offset]
  );
  const count=await query(`SELECT count(*)::int AS total FROM affiliate_marketer_applications app JOIN users u ON u.id=app.user_id ${clause}`,params);
  return {items:rows,total:Number(count.rows[0]?.total||0),page:pageNo,limit:size,totalPages:Math.ceil(Number(count.rows[0]?.total||0)/size)};
}

async function reviewApplication(applicationId,decision,reason,actor) {
  const status=String(decision||'').toLowerCase();
  if(!['approved','rejected','suspended','reinstated'].includes(status)) throw new AppError('Choose approve, reject, suspend or reinstate.',400,'INVALID_REVIEW_ACTION');
  if(status==='rejected' && !String(reason||'').trim()) throw new AppError('A reason is required when rejecting an application.',400,'REJECTION_REASON_REQUIRED');
  return withTransaction(async client=>{
    const {rows:[app]}=await client.query('SELECT * FROM affiliate_marketer_applications WHERE id=$1 FOR UPDATE',[applicationId]);
    if(!app) throw new AppError('Affiliate Marketer application not found.',404,'APPLICATION_NOT_FOUND');
    const nextStatus=status==='reinstated'?'approved':status;
    if(nextStatus==='approved' && !['pending','approved','suspended'].includes(app.status)) throw new AppError('Only a pending or suspended application can be approved.',409,'INVALID_APPLICATION_STATE');
    if(nextStatus==='rejected' && app.status!=='pending') throw new AppError('Only pending applications can be rejected.',409,'INVALID_APPLICATION_STATE');
    if(nextStatus==='suspended' && app.status!=='approved') throw new AppError('Only approved Affiliate Marketers can be suspended.',409,'INVALID_APPLICATION_STATE');
    const {rows:[role]}=await client.query('SELECT id FROM roles WHERE name=$1',[MARKETER_ROLE]);
    if(!role) throw new AppError('Affiliate Marketer role is not configured. Apply the affiliate marketer migration first.',503,'MARKETER_ROLE_MISSING');
    if(nextStatus==='approved') {
      await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT(user_id,role_id) DO NOTHING',[app.user_id,role.id]);
      await client.query("UPDATE affiliates SET marketer_status='approved',commission_pct=2.00,marketer_approved_at=now(),marketer_approved_by=$2 WHERE user_id=$1",[app.user_id,actor.id]);
    } else if(nextStatus==='suspended') {
      await client.query('DELETE FROM user_roles WHERE user_id=$1 AND role_id=$2',[app.user_id,role.id]);
      await client.query("UPDATE affiliates SET marketer_status='suspended' WHERE user_id=$1",[app.user_id]);
    } else {
      await client.query('DELETE FROM user_roles WHERE user_id=$1 AND role_id=$2',[app.user_id,role.id]);
      await client.query("UPDATE affiliates SET marketer_status=$2,commission_pct=0,marketer_approved_at=NULL,marketer_approved_by=NULL WHERE user_id=$1",[app.user_id,nextStatus]);
    }
    const rejectionReason=nextStatus==='rejected'?String(reason||'').trim().slice(0,1000):null;
    const {rows:[updated]}=await client.query(
      `UPDATE affiliate_marketer_applications SET status=$1,reviewed_at=now(),reviewed_by=$2,
       rejection_reason=$3,updated_at=now() WHERE id=$4 RETURNING id,user_id,status,reviewed_at,rejection_reason`,
      [nextStatus,actor.id,rejectionReason,applicationId]
    );
    await client.query(
      `INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
       VALUES($1,$2,$3,'affiliate_marketer_application',$4,$5::jsonb,$6::jsonb)`,
      [actor.id,actor.role||'admin','affiliate_marketer.'+nextStatus,applicationId,
       JSON.stringify({status:app.status,userId:app.user_id}),
       JSON.stringify({status:nextStatus,userId:app.user_id,reason:rejectionReason})]
    );
    await client.query(
      "INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'affiliate_application_review','Affiliate Marketer application update',$2,'affiliate_application',$3)",
      [app.user_id,nextStatus==='approved'?'Your Affiliate Marketer application is approved. Your dedicated dashboard is now available.':nextStatus==='rejected'?'Your Affiliate Marketer application was not approved. Please review the Admin feedback and apply again.':nextStatus==='suspended'?'Your Affiliate Marketer access has been suspended. Contact MarketLink support for assistance.':'Your Affiliate Marketer access has been reinstated.',applicationId]
    );
    return updated;
  });
}

module.exports={submitApplication,getMyStatus,getDashboard,listApplications,reviewApplication,CHANNELS};
