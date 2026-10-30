'use strict';
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch (e) { next(e); } };
const uidOf = req => String(req.user && req.user.id || '');
async function assertMember(id, uid) {
  const { rows } = await query('SELECT id,participant_a,participant_b,order_id FROM conversations WHERE id=$1 AND (participant_a=$2 OR participant_b=$2)',[id,uid]);
  if (!rows.length) throw new AppError('Conversation not found.',404,'CONVERSATION_NOT_FOUND');
  return rows[0];
}
router.use(authenticate);

router.post('/conversations',wrap(async(req,res)=>{
  const uid=uidOf(req), vendorId=String(req.body.vendorId||'').trim(), orderId=req.body.orderId||null;
  if(!vendorId)throw new AppError('A vendor is required to start a conversation.',400,'VENDOR_REQUIRED');
  if(vendorId===uid)throw new AppError('You cannot message your own account.',400,'SELF_MESSAGE');
  const {rows:vendors}=await query('SELECT user_id,business_name,kyc_status,whatsapp_number FROM vendors WHERE user_id=$1',[vendorId]);
  if(!vendors.length||vendors[0].kyc_status!=='approved')throw new AppError('This vendor is not available for messaging yet.',404,'VENDOR_NOT_AVAILABLE');
  if(orderId){
    const {rows:orders}=await query('SELECT id,customer_id,vendor_id FROM orders WHERE id=$1',[orderId]);
    if(!orders.length||String(orders[0].vendor_id)!==vendorId||String(orders[0].customer_id)!==uid)throw new AppError('That order does not belong to this customer and vendor.',403,'ORDER_ACCESS_DENIED');
  }
  const a=uid<vendorId?uid:vendorId,b=uid<vendorId?vendorId:uid;
  let conversation;
  if(orderId){
    const result=await query('INSERT INTO conversations (participant_a,participant_b,order_id) VALUES ($1,$2,$3) ON CONFLICT (participant_a,participant_b,order_id) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *',[a,b,orderId]);
    conversation=result.rows[0];
  }else{
    const {rows}=await query('SELECT * FROM conversations WHERE participant_a=$1 AND participant_b=$2 AND order_id IS NULL ORDER BY created_at DESC LIMIT 1',[a,b]);
    conversation=rows[0];
    if(!conversation){const result=await query('INSERT INTO conversations (participant_a,participant_b) VALUES ($1,$2) RETURNING *',[a,b]);conversation=result.rows[0];}
  }
  res.status(201).json({success:true,data:{...conversation,vendor:vendors[0]}});
}));

router.get('/conversations',wrap(async(req,res)=>{
  const uid=uidOf(req);
  const {rows}=await query(
    `SELECT c.id,c.order_id,c.created_at,
      CASE WHEN c.participant_a=$1 THEN c.participant_b ELSE c.participant_a END AS other_user_id,
      u.full_name AS other_user_name,u.phone AS other_user_phone,
      v.business_name AS vendor_name,v.whatsapp_number AS vendor_whatsapp,
      lm.body AS last_message,lm.created_at AS last_message_at,
      (SELECT count(*) FROM messages um WHERE um.conversation_id=c.id AND um.sender_id<>$1 AND um.read_at IS NULL) AS unread_count
     FROM conversations c
     JOIN users u ON u.id=CASE WHEN c.participant_a=$1 THEN c.participant_b ELSE c.participant_a END
     LEFT JOIN vendors v ON v.user_id=u.id
     LEFT JOIN LATERAL (SELECT body,created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
     WHERE c.participant_a=$1 OR c.participant_b=$1
     ORDER BY COALESCE(lm.created_at,c.created_at) DESC LIMIT 100`,[uid]);
  res.json({success:true,data:rows});
}));

router.get('/conversations/:id/messages',wrap(async(req,res)=>{
  const uid=uidOf(req),c=await assertMember(req.params.id,uid);
  const limit=Math.min(Math.max(parseInt(req.query.limit,10)||50,1),100),before=req.query.before;
  const params=[c.id,limit];let where='conversation_id=$1';
  if(before){where+=' AND created_at < $3';params.push(before);}
  const {rows}=await query(`SELECT id,conversation_id,sender_id,body,attachment_url,status,created_at,read_at FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT $2`,params);
  await query("UPDATE messages SET status='read',read_at=now() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL",[c.id,uid]);
  res.json({success:true,data:rows.reverse()});
}));

router.post('/conversations/:id/messages',wrap(async(req,res)=>{
  const uid=uidOf(req),c=await assertMember(req.params.id,uid),body=String(req.body.body||'').trim();
  if(!body||body.length>4000)throw new AppError('Message must contain 1–4000 characters.',400,'INVALID_MESSAGE');
  const recipient=String(c.participant_a)===uid?c.participant_b:c.participant_a;
  const message=await withTransaction(async client=>{
    const {rows:[saved]}=await client.query("INSERT INTO messages (conversation_id,sender_id,body,status) VALUES ($1,$2,$3,'sent') RETURNING *",[c.id,uid,body]);
    await client.query("INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES ($1,'chat_message','New MarketLink message',$2,'conversation',$3)",[recipient,'You received a new message in MarketLink.',c.id]);
    return saved;
  });
  res.status(201).json({success:true,data:message});
}));

router.post('/conversations/:id/read',wrap(async(req,res)=>{
  const uid=uidOf(req);await assertMember(req.params.id,uid);
  await query("UPDATE messages SET status='read',read_at=now() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL",[req.params.id,uid]);
  res.json({success:true,message:'Messages marked as read.'});
}));
module.exports=router;
