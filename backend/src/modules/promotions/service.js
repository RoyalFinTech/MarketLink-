'use strict';
const { query } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

async function createRequest(userId, input) {
  const {rows:[vendor]} = await query('SELECT user_id,business_name FROM vendors WHERE user_id=$1',[userId]);
  if (!vendor) throw new AppError('Complete your vendor application before requesting a promotion.',403,'VENDOR_PROFILE_REQUIRED');
  const title=String(input.title||'').trim();
  if (!title) throw new AppError('Enter a title for your promotion.',400,'PROMOTION_TITLE_REQUIRED');
  const duration=Number(input.durationHours);
  if (!Number.isInteger(duration)||duration<1||duration>720) throw new AppError('Choose a promotion duration from 1 hour to 30 days.',400,'PROMOTION_DURATION_INVALID');
  const budget=Number(input.requestedBudgetGmd||0);
  if (!Number.isFinite(budget)||budget<0) throw new AppError('Enter a valid suggested budget in Gambian dalasi.',400,'PROMOTION_BUDGET_INVALID');
  const placement=['featured_banner','search_boost','vendor_spotlight','category_banner'].includes(input.placement)?input.placement:'featured_banner';
  const {rows:[record]}=await query(
    'INSERT INTO vendor_promotion_requests (vendor_id,created_by,title,description,banner_url,placement,duration_hours,requested_budget_gmd) VALUES ($1,$1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [userId,title,String(input.description||'').trim()||null,input.bannerUrl||null,placement,duration,budget]
  );
  return record;
}
async function myRequests(userId) {
  const {rows}=await query('SELECT * FROM vendor_promotion_requests WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 100',[userId]);
  return rows;
}
async function adminList(filters={}) {
  const values=[];let where='';
  if(filters.status){values.push(filters.status);where='WHERE p.status=$1';}
  values.push(Math.min(100,Math.max(1,Number(filters.limit)||50)));
  const {rows}=await query(
    'SELECT p.*,v.business_name,u.full_name AS vendor_contact_name,u.phone AS vendor_phone FROM vendor_promotion_requests p JOIN vendors v ON v.user_id=p.vendor_id JOIN users u ON u.id=p.created_by '+where+' ORDER BY p.created_at DESC LIMIT $'+values.length,
    values
  );
  return rows;
}
async function adminReview(id,adminId,input) {
  const {rows:[existing]}=await query('SELECT * FROM vendor_promotion_requests WHERE id=$1',[id]);
  if(!existing)throw new AppError('Promotion request not found.',404,'PROMOTION_NOT_FOUND');
  const status=input.status||existing.status;
  const paymentStatus=input.paymentStatus||existing.payment_status;
  if(status==='published'&&paymentStatus!=='paid')throw new AppError('Confirm payment before publishing a promotion.',409,'PROMOTION_PAYMENT_REQUIRED');
  if(status==='published'&&!existing.banner_url)throw new AppError('Add or request a valid banner image before publishing.',409,'PROMOTION_BANNER_REQUIRED');
  const startsAt=input.startsAt===undefined?existing.starts_at:input.startsAt;
  const endsAt=input.endsAt===undefined?existing.ends_at:input.endsAt;
  if(startsAt&&endsAt&&new Date(endsAt)<=new Date(startsAt))throw new AppError('The promotion end time must be after its start time.',400,'PROMOTION_DATES_INVALID');
  const {rows:[updated]}=await query(
    'UPDATE vendor_promotion_requests SET status=$2,payment_status=$3,admin_notes=COALESCE($4,admin_notes),reviewed_by=$5,reviewed_at=NOW(),starts_at=$6,ends_at=$7,published_at=CASE WHEN $2=\'published\' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW() WHERE id=$1 RETURNING *',
    [id,status,paymentStatus,input.adminNotes===undefined?null:String(input.adminNotes||'').trim()||null,adminId,startsAt,endsAt]
  );
  return updated;
}
module.exports={createRequest,myRequests,adminList,adminReview};
