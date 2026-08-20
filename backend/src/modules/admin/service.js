// src/modules/admin/service.js
'use strict';
const { query } = require('../../config/db');

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

module.exports = { getDashboard, getUsers, suspendUser, reinstateUser, getAnalytics, getSystemSettings, updateSystemSetting, getAuditLogs, getReports };
