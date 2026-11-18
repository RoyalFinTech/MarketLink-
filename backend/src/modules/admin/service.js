// src/modules/admin/service.js
'use strict';
const { query, withTransaction } = require('../../config/db');

async function getDashboard() {
  const [customers, vendors, riders, orders, revenue, pendingApprovals, recentOrders, topVendors] = await Promise.all([
    query(`SELECT count(*) FROM customers c JOIN users u ON u.id=c.user_id WHERE u.status='active'`),
    query(`SELECT count(*) FROM vendors WHERE kyc_status='approved'`),
    query(`SELECT count(*) FROM riders WHERE kyc_status='approved' AND is_online=TRUE`),
    query(`SELECT count(*), count(*) FILTER (WHERE status='delivered') AS completed,
                 count(*) FILTER (WHERE status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way')) AS active
           FROM orders WHERE placed_at >= now() - INTERVAL '30 days'`),
    query(`SELECT coalesce(sum(total),0) AS total_30d,
                  coalesce(sum(CASE WHEN placed_at>=now()-INTERVAL '7 days' THEN total END),0) AS total_7d
           FROM orders WHERE status='delivered'`),
    query(`SELECT
             (SELECT count(*) FROM vendors WHERE kyc_status='pending') AS pending_vendors,
             (SELECT count(*) FROM riders  WHERE kyc_status='pending') AS pending_riders,
             (SELECT count(*) FROM support_tickets WHERE status='open') AS open_tickets`),
    query(`SELECT o.id, o.order_number, o.status, o.total, o.placed_at,
                  u.full_name AS customer_name, v.business_name AS vendor_name
           FROM orders o JOIN users u ON u.id=o.customer_id JOIN vendors v ON v.user_id=o.vendor_id
           ORDER BY o.placed_at DESC LIMIT 10`),
    query(`SELECT v.user_id, v.business_name, v.rating_avg, v.total_sales, v.total_revenue
           FROM vendors v WHERE v.kyc_status='approved'
           ORDER BY v.total_revenue DESC LIMIT 5`),
  ]);
  return {
    stats: {
      activeCustomers:  parseInt(customers.rows[0].count),
      approvedVendors:  parseInt(vendors.rows[0].count),
      onlineRiders:     parseInt(riders.rows[0].count),
      orders30d:        parseInt(orders.rows[0].count),
      completedOrders:  parseInt(orders.rows[0].completed),
      activeOrders:     parseInt(orders.rows[0].active),
      revenue30d:       parseFloat(revenue.rows[0].total_30d),
      revenue7d:        parseFloat(revenue.rows[0].total_7d),
    },
    pendingApprovals: pendingApprovals.rows[0],
    recentOrders: recentOrders.rows,
    topVendors: topVendors.rows,
  };
}

async function getUsers({ page=1, limit=20, search, role, status }) {
  const limit_ = Math.min(parseInt(limit)||20, 100);
  const offset = (Math.max(parseInt(page)||1,1)-1)*limit_;
  const conds=['1=1'], params=[]; let pi=1;
  if (search) { conds.push(`(u.full_name ILIKE $${pi} OR u.phone ILIKE $${pi} OR u.email ILIKE $${pi})`); params.push(`%${search}%`); pi++; }
  if (status) { conds.push(`u.status=$${pi++}`); params.push(status); }
  if (role)   { conds.push(`r.name=$${pi++}`);   params.push(role); }
  const join = role ? 'JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id' : 'LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id';
  const { rows } = await query(
    `SELECT DISTINCT u.id, u.full_name, u.phone, u.email, u.status, u.created_at, u.last_login_at,
            array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
     FROM users u ${join}
     WHERE ${conds.join(' AND ')}
     GROUP BY u.id
     ORDER BY u.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]);
  const { rows:[c] } = await query(`SELECT count(DISTINCT u.id) FROM users u ${join} WHERE ${conds.join(' AND ')}`, params);
  return { items: rows, total: parseInt(c.count), page: parseInt(page), limit: limit_, totalPages: Math.ceil(parseInt(c.count)/limit_) };
}

async function suspendUser(userId, reason, actor) {
  const { rows:[u] } = await query(`UPDATE users SET status='suspended' WHERE id=$1 RETURNING id,full_name,status`, [userId]);
  if (!u) throw require('../../middleware/errorHandler').AppError('User not found.', 404, 'USER_NOT_FOUND');
  await query(`INSERT INTO suspensions (user_id,reason,suspended_by) VALUES ($1,$2,$3)`, [userId,reason,actor.id]);
  await query(`INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES ($1,$2,'user.suspended','user',$3,$4)`,
    [actor.id,actor.role,userId,JSON.stringify({reason})]);
  return u;
}

async function reinstateUser(userId, actor) {
  const { rows:[u] } = await query(`UPDATE users SET status='active' WHERE id=$1 RETURNING id,full_name,status`, [userId]);
  if (!u) throw require('../../middleware/errorHandler').AppError('User not found.', 404, 'USER_NOT_FOUND');
  await query(`UPDATE suspensions SET lifted_at=now() WHERE user_id=$1 AND lifted_at IS NULL`, [userId]);
  await query(`INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id) VALUES ($1,$2,'user.reinstated','user',$3)`,
    [actor.id,actor.role,userId]);
  return u;
}

async function getAnalytics({ period='30d' }) {
  const days = period==='7d'?7:period==='90d'?90:30;
  const [dailyRevenue, ordersByStatus, topCategories, signups] = await Promise.all([
    query(`SELECT date_trunc('day',placed_at) AS day, count(*) AS orders, coalesce(sum(total),0) AS revenue
           FROM orders WHERE placed_at>=now()-($1||' days')::INTERVAL GROUP BY 1 ORDER BY 1`, [days]),
    query(`SELECT status, count(*) FROM orders WHERE placed_at>=now()-($1||' days')::INTERVAL GROUP BY status`, [days]),
    query(`SELECT c.name, count(p.id) AS products, count(DISTINCT o.id) AS orders
           FROM categories c LEFT JOIN products p ON p.category_id=c.id
           LEFT JOIN order_items oi ON oi.product_id=p.id LEFT JOIN orders o ON o.id=oi.order_id
           WHERE c.deleted_at IS NULL GROUP BY c.id,c.name ORDER BY orders DESC LIMIT 10`, []),
    query(`SELECT date_trunc('day',created_at) AS day, count(*) AS users
           FROM users WHERE created_at>=now()-($1||' days')::INTERVAL GROUP BY 1 ORDER BY 1`, [days]),
  ]);
  return { period, dailyRevenue: dailyRevenue.rows, ordersByStatus: ordersByStatus.rows, topCategories: topCategories.rows, signups: signups.rows };
}

async function getSystemSettings() {
  const { rows } = await query('SELECT * FROM system_settings ORDER BY category, key');
  return rows;
}

async function updateSystemSetting(key, value, actorId) {
  const { rows:[s] } = await query(
    `INSERT INTO system_settings (key, value, category, updated_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()
     RETURNING *`,
    [key, JSON.stringify(value), (key.split('_')[0])||'general', actorId]);
  return s;
}

async function getAuditLogs({ page=1, limit=20, actorId, action, entityType }) {
  const limit_ = Math.min(parseInt(limit)||20, 100);
  const offset = (Math.max(parseInt(page)||1,1)-1)*limit_;
  const conds=[], params=[]; let pi=1;
  if (actorId)    { conds.push(`l.actor_id=$${pi++}`);    params.push(actorId); }
  if (action)     { conds.push(`l.action ILIKE $${pi++}`);params.push(`%${action}%`); }
  if (entityType) { conds.push(`l.entity_type=$${pi++}`); params.push(entityType); }
  const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
  const { rows } = await query(
    `SELECT l.*, u.full_name AS actor_name FROM admin_action_logs l
     LEFT JOIN users u ON u.id=l.actor_id ${where}
     ORDER BY l.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]);
  return rows;
}

async function getReports({ type, startDate, endDate }) {
  const start = startDate || new Date(Date.now()-30*24*60*60*1000).toISOString();
  const end   = endDate   || new Date().toISOString();
  if (type==='revenue') {
    const { rows } = await query(
      `SELECT date_trunc('day',placed_at) AS day, sum(total) AS revenue, count(*) AS orders,
              sum(platform_fee) AS platform_fees
       FROM orders WHERE placed_at BETWEEN $1 AND $2 AND status='delivered'
       GROUP BY 1 ORDER BY 1`, [start, end]);
    return rows;
  }
  if (type==='vendors') {
    const { rows } = await query(
      `SELECT v.business_name, count(DISTINCT o.id) AS orders, sum(o.total) AS revenue,
              v.rating_avg, v.kyc_status
       FROM vendors v LEFT JOIN orders o ON o.vendor_id=v.user_id AND o.placed_at BETWEEN $1 AND $2
       GROUP BY v.user_id, v.business_name, v.rating_avg, v.kyc_status
       ORDER BY revenue DESC NULLS LAST LIMIT 50`, [start, end]);
    return rows;
  }
  if (type==='riders') {
    const { rows } = await query(
      `SELECT u.full_name, r.vehicle_type, r.total_deliveries, r.total_earnings,
              r.rating_avg, r.acceptance_rate
       FROM riders r JOIN users u ON u.id=r.user_id
       WHERE r.kyc_status='approved'
       ORDER BY r.total_deliveries DESC LIMIT 50`, []);
    return rows;
  }
  throw require('../../middleware/errorHandler').AppError('Unknown report type. Use: revenue, vendors, riders', 400, 'INVALID_REPORT_TYPE');
}




async function getAdminTransactions({ page=1, limit=50, type, category } = {}) {
  const page_ = Math.max(parseInt(page,10)||1,1);
  const limit_ = Math.min(Math.max(parseInt(limit,10)||50,1),100);
  const offset = (page_-1)*limit_;
  const where = ['1=1'], params = [];
  if (type) { params.push(type); where.push(`t.type=$${params.length}`); }
  if (category) { params.push(category); where.push(`t.category=$${params.length}`); }
  const whereSql = where.join(' AND ');
  const { rows } = await query(
    `SELECT t.id,t.type,t.category,t.amount,t.balance_after,t.reference_type,t.reference_id,
            t.description,t.created_at,w.currency,u.full_name AS account_name
     FROM transactions t
     JOIN wallets w ON w.id=t.wallet_id
     LEFT JOIN users u ON u.id=w.user_id
     WHERE ${whereSql}
     ORDER BY t.created_at DESC,t.id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit_,offset]
  );
  const { rows:[count] } = await query(
    `SELECT count(*)::int AS total FROM transactions t WHERE ${whereSql}`, params
  );
  const total = Number(count.total||0);
  return { items:rows,total,page:page_,limit:limit_,totalPages:Math.ceil(total/limit_) };
}

async function getFailedPayments({ page=1, limit=50, method } = {}) {
  const page_ = Math.max(parseInt(page,10)||1,1);
  const limit_ = Math.min(Math.max(parseInt(limit,10)||50,1),100);
  const offset = (page_-1)*limit_;
  const where = [`(p.status='failed' OR (p.status='pending' AND p.created_at < now()-INTERVAL '15 minutes'))`];
  const params = [];
  if (method) { params.push(method); where.push(`p.method=$${params.length}`); }
  const whereSql = where.join(' AND ');
  const { rows } = await query(
    `SELECT p.id,p.order_id,o.order_number,p.method,p.amount,p.currency,p.status,
            p.refund_status,p.refund_amount,p.created_at,o.status AS order_status,
            o.payment_status
     FROM payments p
     JOIN orders o ON o.id=p.order_id
     WHERE ${whereSql}
     ORDER BY p.created_at ASC,p.id ASC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit_,offset]
  );
  const { rows:[count] } = await query(
    `SELECT count(*)::int AS total FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${whereSql}`,
    params
  );
  const total = Number(count.total||0);
  return { items:rows,total,page:page_,limit:limit_,totalPages:Math.ceil(total/limit_) };
}

/**
 * Retry only the existing locked, idempotent order settlement routine.
 * The initial audit row is committed before the financial operation begins.
 */
async function retryFinancialSettlement(orderId, actor, reason) {
  const ordersService = require('../orders/service');
  const { rows: [audit] } = await query(
    `INSERT INTO admin_action_logs
      (actor_id,actor_role,action,entity_type,entity_id,after_data)
     VALUES ($1,$2,'financial.settlement_retry_requested','order',$3,$4)
     RETURNING id`,
    [actor.id, actor.role || 'admin', orderId, JSON.stringify({ reason, idempotencyScope: 'order:' + orderId })]
  );
  let result;
  try {
    result = await ordersService.settleOrderFinancials(orderId);
  } catch (error) {
    await query(
      `UPDATE admin_action_logs SET action='financial.settlement_retry_failed',after_data=$1
       WHERE id=$2`,
      [JSON.stringify({ reason, errorCode: error.code || 'SETTLEMENT_RETRY_FAILED' }), audit.id]
    ).catch(() => null);
    throw error;
  }
  if (result && result.settled === false) {
    await query(
      `UPDATE admin_action_logs SET action='financial.settlement_retry_not_eligible',after_data=$1
       WHERE id=$2`,
      [JSON.stringify({ reason, result }), audit.id]
    ).catch(() => null);
    return result;
  }
  await query(
    `UPDATE admin_action_logs SET action='financial.settlement_retry_completed',after_data=$1
     WHERE id=$2`,
    [JSON.stringify({ reason, result }), audit.id]
  ).catch(() => null);
  return result;
}



async function listSupportTickets({page=1,limit=25,status,priority,category,search}={}){
 const page_=Math.max(parseInt(page,10)||1,1),limit_=Math.min(Math.max(parseInt(limit,10)||25,1),100),offset=(page_-1)*limit_;
 const where=['1=1'],params=[];
 if(status){params.push(status);where.push('t.status=$'+params.length);}
 if(priority){params.push(priority);where.push('t.priority=$'+params.length);}
 if(category){params.push(category);where.push('t.category=$'+params.length);}
 if(search){params.push('%'+search+'%');const p='$'+params.length;where.push('(t.ticket_number ILIKE '+p+' OR t.subject ILIKE '+p+' OR t.description ILIKE '+p+' OR u.full_name ILIKE '+p+' OR u.phone ILIKE '+p+')');}
 const sql=where.join(' AND ');
 const {rows}=await query("SELECT t.id,t.ticket_number,t.category,t.subject,t.description,t.priority,t.status,t.order_id,t.against_user,t.assigned_to,t.created_at,t.updated_at,t.resolved_at,t.closed_at,u.full_name AS requester_name,u.phone AS requester_phone,u.email AS requester_email,a.full_name AS assignee_name,(SELECT count(*)::int FROM support_ticket_replies r WHERE r.ticket_id=t.id) AS reply_count FROM support_tickets t JOIN users u ON u.id=t.raised_by LEFT JOIN users a ON a.id=t.assigned_to WHERE "+sql+" ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at ASC LIMIT $"+(params.length+1)+" OFFSET $"+(params.length+2),[...params,limit_,offset]);
 const {rows:[count]}=await query("SELECT count(*)::int AS total FROM support_tickets t JOIN users u ON u.id=t.raised_by WHERE "+sql,params);
 return {items:rows,total:count.total,page:page_,limit:limit_,totalPages:Math.ceil(count.total/limit_)};
}
async function getSupportTicket(ticketId){
 const {rows:[ticket]}=await query("SELECT t.*,u.full_name AS requester_name,u.phone AS requester_phone,u.email AS requester_email,a.full_name AS assignee_name FROM support_tickets t JOIN users u ON u.id=t.raised_by LEFT JOIN users a ON a.id=t.assigned_to WHERE t.id=$1",[ticketId]);
 if(!ticket){const e=new Error('Support ticket not found.');e.status=404;e.code='TICKET_NOT_FOUND';throw e;}
 const {rows:replies}=await query("SELECT r.id,r.sender_id,r.body,r.created_at,u.full_name AS sender_name FROM support_ticket_replies r JOIN users u ON u.id=r.sender_id WHERE r.ticket_id=$1 ORDER BY r.created_at ASC",[ticketId]);
 return {ticket,replies};
}
async function updateSupportTicket(ticketId,patch,actor){
 if(patch.status&&!['open','pending','escalated','resolved','closed'].includes(patch.status)){const e=new Error('Invalid support ticket status.');e.status=400;e.code='INVALID_TICKET_STATUS';throw e;}
 if(patch.priority&&!['low','medium','high'].includes(patch.priority)){const e=new Error('Invalid support ticket priority.');e.status=400;e.code='INVALID_TICKET_PRIORITY';throw e;}
 if(patch.assignedTo){const {rows:[admin]}=await query('SELECT user_id FROM admins WHERE user_id=$1',[patch.assignedTo]);if(!admin){const e=new Error('The selected assignee is not an administrator.');e.status=400;e.code='INVALID_TICKET_ASSIGNEE';throw e;}}
 const {rows:[ticket]}=await query("UPDATE support_tickets SET status=COALESCE($2,status),priority=COALESCE($3,priority),assigned_to=CASE WHEN $4::boolean THEN $5::uuid ELSE assigned_to END,resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at,now()) WHEN $2 IS NOT NULL THEN NULL ELSE resolved_at END,closed_at=CASE WHEN $2='closed' THEN COALESCE(closed_at,now()) WHEN $2 IS NOT NULL THEN NULL ELSE closed_at END,updated_at=now() WHERE id=$1 RETURNING *",[ticketId,patch.status||null,patch.priority||null,Object.prototype.hasOwnProperty.call(patch,'assignedTo'),patch.assignedTo||null]);
 if(!ticket){const e=new Error('Support ticket not found.');e.status=404;e.code='TICKET_NOT_FOUND';throw e;}
 await query("INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES($1,$2,'support.ticket_updated','support_ticket',$3,$4)",[actor.id,actor.role||'admin',ticketId,JSON.stringify({status:ticket.status,priority:ticket.priority,assignedTo:ticket.assigned_to})]);
 return ticket;
}
async function replySupportTicket(ticketId,body,actor){
 return withTransaction(async client=>{
  const {rows:[ticket]}=await client.query('SELECT id,raised_by,status FROM support_tickets WHERE id=$1 FOR UPDATE',[ticketId]);
  if(!ticket){const e=new Error('Support ticket not found.');e.status=404;e.code='TICKET_NOT_FOUND';throw e;}
  const {rows:[reply]}=await client.query('INSERT INTO support_ticket_replies(ticket_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,ticket_id,sender_id,body,created_at',[ticketId,actor.id,body]);
  await client.query("UPDATE support_tickets SET status=CASE WHEN status='open' THEN 'pending' ELSE status END,updated_at=now() WHERE id=$1",[ticketId]);
  await client.query("INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id,channel_inapp) VALUES($1,'support_ticket_reply','Support ticket updated',$2,'support_ticket',$3,TRUE)",[ticket.raised_by,'An administrator replied to your support request.',ticketId]);
  await client.query("INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES($1,$2,'support.ticket_replied','support_ticket',$3,$4)",[actor.id,actor.role||'admin',ticketId,JSON.stringify({replyId:reply.id})]);
  return reply;
 });
}
async function getCrmProfile(userId){
 const {rows:[user]}=await query("SELECT u.id,u.full_name,u.phone,u.email,u.status,u.created_at,u.last_login_at,array_agg(DISTINCT r.name) FILTER(WHERE r.name IS NOT NULL) AS roles,(SELECT count(*)::int FROM support_tickets st WHERE st.raised_by=u.id) AS support_tickets,(SELECT count(*)::int FROM orders o WHERE o.customer_id=u.id) AS orders_count FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 GROUP BY u.id",[userId]);
 if(!user){const e=new Error('CRM user not found.');e.status=404;e.code='USER_NOT_FOUND';throw e;}
 const [customer,vendor,rider,notes]=await Promise.all([
  query('SELECT * FROM customers WHERE user_id=$1',[userId]),query('SELECT * FROM vendors WHERE user_id=$1',[userId]),query('SELECT * FROM riders WHERE user_id=$1',[userId]),
  query("SELECT n.id,n.note,n.created_at,a.full_name AS author_name FROM admin_crm_notes n JOIN users a ON a.id=n.author_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50",[userId])
 ]);
 return {user,customer:customer.rows[0]||null,vendor:vendor.rows[0]||null,rider:rider.rows[0]||null,notes:notes.rows};
}
async function addCrmNote(userId,note,actor){
 const {rows:[exists]}=await query('SELECT id FROM users WHERE id=$1',[userId]);
 if(!exists){const e=new Error('CRM user not found.');e.status=404;e.code='USER_NOT_FOUND';throw e;}
 const {rows:[created]}=await query('INSERT INTO admin_crm_notes(user_id,author_id,note) VALUES($1,$2,$3) RETURNING *',[userId,actor.id,note]);
 await query("INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data) VALUES($1,$2,'crm.note_added','user',$3,$4)",[actor.id,actor.role||'admin',userId,JSON.stringify({noteId:created.id})]);
 return created;
}

module.exports = { getDashboard, getUsers, suspendUser, reinstateUser, getAnalytics, getSystemSettings, updateSystemSetting, getAuditLogs, getReports, getAdminTransactions, getFailedPayments, retryFinancialSettlement, listSupportTickets, getSupportTicket, updateSupportTicket, replySupportTicket, getCrmProfile, addCrmNote };
