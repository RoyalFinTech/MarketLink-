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
                  coalesce(sum(CASE WHEN placed_at>=now()-INTERVAL '7 days' THEN total END),0) AS total_7d,
                  coalesce(sum(platform_net_fee),0) AS platform_net_30d
           FROM orders WHERE status='delivered' AND payment_status='confirmed'
             AND placed_at>=now()-INTERVAL '30 days'`),
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
      platformNetRevenue30d: parseFloat(revenue.rows[0].platform_net_30d),
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
            COALESCE(c.profile_photo_url,rp.profile_photo_url,v.logo_url) AS profile_photo_url,
            array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
     FROM users u LEFT JOIN customers c ON c.user_id=u.id
     LEFT JOIN vendors v ON v.user_id=u.id
     LEFT JOIN riders rp ON rp.user_id=u.id ${join}
     WHERE ${conds.join(' AND ')}
     GROUP BY u.id,c.profile_photo_url,rp.profile_photo_url,v.logo_url
     ORDER BY u.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]);
  const { rows:[c] } = await query(`SELECT count(DISTINCT u.id) FROM users u ${join} WHERE ${conds.join(' AND ')}`, params);
  return { items: rows, total: parseInt(c.count), page: parseInt(page), limit: limit_, totalPages: Math.ceil(parseInt(c.count)/limit_) };
}

async function suspendUser(userId, reason, actor) {
  return withTransaction(async (client) => {
    if (String(actor.id) === String(userId)) {
      throw new (require('../../middleware/errorHandler').AppError)('Administrators cannot suspend their own account.', 403, 'SELF_SUSPENSION_BLOCKED');
    }
    const { rows:[target] } = await client.query(
      'SELECT id,full_name,status FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!target) throw new (require('../../middleware/errorHandler').AppError)('User not found.', 404, 'USER_NOT_FOUND');
    const { rows: targetRoles } = await client.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [userId]);
    const privileged = targetRoles.some(row => ['admin','super_admin'].includes(row.name));
    if (privileged && actor.role !== 'super_admin') {
      throw new (require('../../middleware/errorHandler').AppError)('Only a super administrator can suspend another administrator.', 403, 'ADMIN_TARGET_RESTRICTED');
    }
    if (targetRoles.some(row => row.name === 'super_admin') && target.status === 'active') {
      const { rows:[count] } = await client.query(
        `SELECT count(*)::int AS active_super_admins
         FROM users u JOIN user_roles ur ON ur.user_id=u.id
         JOIN roles r ON r.id=ur.role_id
         WHERE r.name='super_admin' AND u.status='active'`);
      if (Number(count.active_super_admins) <= 1) {
        throw new (require('../../middleware/errorHandler').AppError)('The last active super administrator cannot be suspended.', 409, 'LAST_SUPER_ADMIN_PROTECTED');
      }
    }
    const { rows:[u] } = await client.query(
      `UPDATE users SET status='suspended',updated_at=now() WHERE id=$1 RETURNING id,full_name,status`, [userId]);
    await client.query('INSERT INTO suspensions (user_id,reason,suspended_by) VALUES ($1,$2,$3)', [userId,reason,actor.id]);
    await client.query(
      `INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id,after_data)
       VALUES ($1,$2,'user.suspended','user',$3,$4)`,
      [actor.id,actor.role,userId,JSON.stringify({reason})]);
    return u;
  });
}

async function reinstateUser(userId, actor) {
  return withTransaction(async (client) => {
    const { rows:[target] } = await client.query(
      'SELECT id,full_name FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!target) throw new (require('../../middleware/errorHandler').AppError)('User not found.', 404, 'USER_NOT_FOUND');
    const { rows: targetRoles } = await client.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [userId]);
    if (targetRoles.some(row => ['admin','super_admin'].includes(row.name)) && actor.role !== 'super_admin') {
      throw new (require('../../middleware/errorHandler').AppError)('Only a super administrator can reinstate another administrator.', 403, 'ADMIN_TARGET_RESTRICTED');
    }
    const { rows:[u] } = await client.query(
      `UPDATE users SET status='active',updated_at=now() WHERE id=$1 RETURNING id,full_name,status`, [userId]);
    await client.query('UPDATE suspensions SET lifted_at=now() WHERE user_id=$1 AND lifted_at IS NULL', [userId]);
    await client.query(
      `INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id)
       VALUES ($1,$2,'user.reinstated','user',$3)`,
      [actor.id,actor.role,userId]);
    return u;
  });
}

async function getAnalytics({ period='30d' }) {
  const days = period==='7d'?7:period==='90d'?90:30;
  const [dailyRevenue, ordersByStatus, topCategories, signups, comparison] = await Promise.all([
    query(`WITH calendar AS (
             SELECT generate_series(
               date_trunc('day',now())-($1::int*INTERVAL '1 day'),
               date_trunc('day',now())-INTERVAL '1 day',INTERVAL '1 day'
             ) AS day
           )
           SELECT calendar.day,
                  count(o.id)::int AS orders,
                  coalesce(sum(o.total),0) AS revenue,
                  coalesce(sum(o.platform_fee),0) AS platform_gross_commission,
                  coalesce(sum(o.affiliate_commission_amount),0) AS affiliate_commission,
                  coalesce(sum(o.platform_net_fee),0) AS platform_net_revenue
           FROM calendar
           LEFT JOIN orders o ON o.placed_at>=calendar.day
             AND o.placed_at<calendar.day+INTERVAL '1 day'
             AND o.status='delivered' AND o.payment_status='confirmed'
           GROUP BY calendar.day ORDER BY calendar.day`, [days]),
    query(`SELECT status, count(*)::int AS count
           FROM orders WHERE placed_at>=date_trunc('day',now())-($1::int*INTERVAL '1 day')
             AND placed_at<date_trunc('day',now())
           GROUP BY status ORDER BY count DESC`, [days]),
    query(`SELECT c.name, count(DISTINCT p.id)::int AS products,
                  count(DISTINCT o.id)::int AS orders
           FROM categories c LEFT JOIN products p ON p.category_id=c.id
           LEFT JOIN order_items oi ON oi.product_id=p.id
           LEFT JOIN orders o ON o.id=oi.order_id AND o.placed_at>=date_trunc('day',now())-($1::int*INTERVAL '1 day') AND o.placed_at<date_trunc('day',now())
             AND o.status='delivered' AND o.payment_status='confirmed'
           WHERE c.deleted_at IS NULL GROUP BY c.id,c.name
           ORDER BY orders DESC,products DESC LIMIT 8`, [days]),
    query(`SELECT date_trunc('day',created_at) AS day, count(*)::int AS users
           FROM users WHERE created_at>=date_trunc('day',now())-($1::int*INTERVAL '1 day')
             AND created_at<date_trunc('day',now())
           GROUP BY 1 ORDER BY 1`, [days]),
    query(`SELECT
             coalesce(sum(total) FILTER (WHERE placed_at>=date_trunc('day',now())-($1::int*INTERVAL '1 day') AND placed_at<date_trunc('day',now())
               AND status='delivered' AND payment_status='confirmed'),0) AS current_gmv,
             coalesce(sum(total) FILTER (WHERE placed_at>=date_trunc('day',now())-((2*$1::int)*INTERVAL '1 day')
               AND placed_at<date_trunc('day',now())-($1::int*INTERVAL '1 day')
               AND status='delivered' AND payment_status='confirmed'),0) AS previous_gmv,
             coalesce(sum(platform_net_fee) FILTER (WHERE placed_at>=date_trunc('day',now())-($1::int*INTERVAL '1 day') AND placed_at<date_trunc('day',now())
               AND status='delivered' AND payment_status='confirmed'),0) AS current_net,
             coalesce(sum(platform_net_fee) FILTER (WHERE placed_at>=date_trunc('day',now())-((2*$1::int)*INTERVAL '1 day')
               AND placed_at<date_trunc('day',now())-($1::int*INTERVAL '1 day')
               AND status='delivered' AND payment_status='confirmed'),0) AS previous_net
           FROM orders
           WHERE placed_at>=date_trunc('day',now())-((2*$1::int)*INTERVAL '1 day')
             AND placed_at<date_trunc('day',now())`, [days]),
  ]);
  const currentGmv=Number(comparison.rows[0].current_gmv||0);
  const previousGmv=Number(comparison.rows[0].previous_gmv||0);
  const currentNet=Number(comparison.rows[0].current_net||0);
  const previousNet=Number(comparison.rows[0].previous_net||0);
  const change=(current,previous)=>previous>0?Number(((current-previous)/previous*100).toFixed(1)):null;
  const trend={
    currentGmv,previousGmv,gmvChangePct:change(currentGmv,previousGmv),
    currentPlatformNet:currentNet,previousPlatformNet:previousNet,
    platformNetChangePct:change(currentNet,previousNet),
  };
  const totalOrders=ordersByStatus.rows.reduce((sum,row)=>sum+Number(row.count||0),0);
  const deliveredOrders=dailyRevenue.rows.reduce((sum,row)=>sum+Number(row.orders||0),0);
  const totalSignups=signups.rows.reduce((sum,row)=>sum+Number(row.users||0),0);
  const topCategory=topCategories.rows.find(row=>Number(row.orders)>0);
  const insights=[];
  if(deliveredOrders===0){
    insights.push({type:'attention',title:'No confirmed completed sales yet',detail:'There are no delivered orders with confirmed payment in this period. Revenue charts correctly remain at zero; complete a real test order after payment credentials are configured.',recommendation:'Prioritise one controlled customer order and verify its payment, delivery and settlement records end to end.'});
  } else if(trend.gmvChangePct!==null){
    insights.push({type:trend.gmvChangePct>=0?'positive':'attention',title:trend.gmvChangePct>=0?'Marketplace sales are up':'Marketplace sales are down',detail:'Confirmed GMV is '+Math.abs(trend.gmvChangePct)+'% '+(trend.gmvChangePct>=0?'higher':'lower')+' than the preceding '+days+'-day period.',recommendation:trend.gmvChangePct>=0?'Identify the vendors and categories contributing to growth and maintain their stock and rider coverage.':'Review vendor availability, product visibility, pricing and delivery completion to identify the cause of the decline.'});
  } else {
    insights.push({type:'info',title:'Sales baseline established',detail:'Confirmed GMV is recorded, but the preceding period had no confirmed sales for a percentage comparison.',recommendation:'Use this period as the baseline and compare the next reporting period.'});
  }
  if(totalOrders>deliveredOrders){
    const unfinished=totalOrders-deliveredOrders;
    insights.push({type:'attention',title:'Orders still need operational follow-up',detail:unfinished+' orders in the selected period are not counted as confirmed delivered sales.',recommendation:'Review the order-status breakdown and follow up on stuck, cancelled or awaiting-rider orders.'});
  }
  if(topCategory){
    insights.push({type:'positive',title:'Leading sales category: '+topCategory.name,detail:Number(topCategory.orders)+' confirmed delivered orders are attributed to this category.',recommendation:'Check stock availability and vendor coverage in this category before increasing promotions.'});
  }
  insights.push({type:'info',title:'Customer acquisition',detail:totalSignups+' new user registrations were recorded in the selected period.',recommendation:totalSignups>0?'Track how many new registrations become first-time buyers; registrations alone are not revenue.':'Review acquisition channels and marketplace visibility once the customer experience is ready.'});
  return {
    period,days,dailyRevenue:dailyRevenue.rows,ordersByStatus:ordersByStatus.rows,
    topCategories:topCategories.rows,signups:signups.rows,trend,
    totals:{orders:totalOrders,deliveredOrders,signups:totalSignups},
    insights:{summary:deliveredOrders===0?'The selected period has no confirmed delivered sales. Operational and customer activity should be reviewed before drawing revenue conclusions.':'The summary is based on delivered orders with confirmed payments, with GMV and MarketLink net commission tracked separately.',items:insights,method:'Automated, rules-based analysis of live MarketLink records; no external AI model or estimated revenue is used.'}
  };
}

async function getSystemSettings() {
  const { rows } = await query('SELECT * FROM system_settings ORDER BY category, key');
  // Redact on the server. Hiding a secret in the browser UI is not protection:
  // the raw API response would still expose it in DevTools and network logs.
  return rows.map(row => {
    const isSecret = /(secret|token|password|api.?key|private|credential)/i.test(String(row.key || ''));
    return isSecret ? { ...row, value: '[protected]', is_secret: true } : { ...row, is_secret: false };
  });
}

async function updateSystemSetting(key, value, actorId) {
  if (/(secret|token|password|api.?key|private|credential)/i.test(String(key || ''))) {
    throw new (require('../../middleware/errorHandler').AppError)(
      'Provider credentials and secrets must be stored in Render environment variables, not system settings.',
      400,
      'SECRET_MUST_USE_ENVIRONMENT'
    );
  }
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
      `SELECT date_trunc('day',o.placed_at) AS day,
              count(*)::int AS orders,
              coalesce(sum(o.total),0) AS gross_order_value,
              coalesce(sum(o.subtotal-o.discount_amount),0) AS net_merchandise,
              coalesce(sum(o.platform_fee),0) AS platform_gross_commission,
              coalesce(sum(o.affiliate_commission_amount),0) AS affiliate_commission,
              coalesce(sum(o.platform_net_fee),0) AS platform_net_revenue,
              coalesce(sum(o.vendor_payout),0) AS vendor_payouts,
              coalesce(sum(o.rider_payout),0) AS rider_payouts
       FROM orders o
       WHERE o.placed_at BETWEEN $1 AND $2
         AND o.status='delivered' AND o.payment_status='confirmed'
       GROUP BY 1 ORDER BY 1`, [start, end]);
    return rows;
  }
  if (type==='vendors') {
    const { rows } = await query(
      `SELECT v.business_name, count(DISTINCT o.id) AS orders, coalesce(sum(o.total),0) AS revenue,
              v.rating_avg, v.kyc_status
       FROM vendors v LEFT JOIN orders o ON o.vendor_id=v.user_id
         AND o.placed_at BETWEEN $1 AND $2
         AND o.status='delivered' AND o.payment_status='confirmed'
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

async function getAffiliateDirectory({page=1,limit=50,search}={}) {
  const page_=Math.max(parseInt(page,10)||1,1),limit_=Math.min(Math.max(parseInt(limit,10)||50,1),100),offset=(page_-1)*limit_;
  const params=[],where=[];
  if(search){params.push('%'+String(search).trim().slice(0,120)+'%');where.push('(u.full_name ILIKE $1 OR u.phone ILIKE $1 OR u.email ILIKE $1 OR a.affiliate_code ILIKE $1)');}
  const whereSql=where.length?'WHERE '+where.join(' AND '):'';
  const {rows}=await query(`SELECT a.user_id,a.affiliate_code,a.commission_pct,a.total_clicks,a.total_orders,
      a.total_earnings,a.created_at,u.full_name,u.phone,u.email,u.status,
      coalesce(w.balance,0) AS wallet_balance,
      coalesce((SELECT count(*)::int FROM orders o WHERE o.affiliate_user_id=a.user_id AND o.status='delivered' AND o.payment_status='confirmed'),0) AS delivered_orders,
      coalesce((SELECT sum(o.affiliate_commission_amount) FROM orders o WHERE o.affiliate_user_id=a.user_id AND o.status='delivered' AND o.payment_status='confirmed'),0) AS settled_commission
    FROM affiliates a JOIN users u ON u.id=a.user_id
    LEFT JOIN wallets w ON w.user_id=a.user_id
    ${whereSql}
    ORDER BY a.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit_,offset]);
  const {rows:[count]}=await query(`SELECT count(*)::int AS total FROM affiliates a JOIN users u ON u.id=a.user_id ${whereSql}`,params);
  return {items:rows,total:Number(count.total||0),page:page_,limit:limit_,totalPages:Math.ceil(Number(count.total||0)/limit_)};
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
 const {rows:[user]}=await query("SELECT u.id,u.full_name,u.phone,u.email,u.status,u.created_at,u.last_login_at,COALESCE(c.profile_photo_url,rp.profile_photo_url,v.logo_url) AS profile_photo_url,array_agg(DISTINCT role.name) FILTER(WHERE role.name IS NOT NULL) AS roles,(SELECT count(*)::int FROM support_tickets st WHERE st.raised_by=u.id) AS support_tickets,(SELECT count(*)::int FROM orders o WHERE o.customer_id=u.id) AS orders_count FROM users u LEFT JOIN customers c ON c.user_id=u.id LEFT JOIN vendors v ON v.user_id=u.id LEFT JOIN riders rp ON rp.user_id=u.id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles role ON role.id=ur.role_id WHERE u.id=$1 GROUP BY u.id,c.profile_photo_url,rp.profile_photo_url,v.logo_url",[userId]);
 if(!user){const e=new Error('CRM user not found.');e.status=404;e.code='USER_NOT_FOUND';throw e;}
 const [customer,vendor,rider,notes]=await Promise.all([
  // Return only CRM-safe profile fields. Identity numbers and raw KYC document URLs
  // remain in the protected verification workflow, not the general CRM profile.
  query(`SELECT display_name,bio,date_of_birth,gender,profile_photo_url,reward_points,created_at,updated_at
         FROM customers WHERE user_id=$1`,[userId]),
  query(`SELECT business_name,business_category,business_category_group,business_address,phone,email,whatsapp_number,
                description,logo_url,banner_url,services_offered,working_days,opening_time,closing_time,
                return_policy,min_order_value,delivery_time_min,delivery_time_max,is_open,vacation_mode,
                commission_pct,rating_avg,rating_count,total_sales,total_revenue,kyc_status,created_at,updated_at
         FROM vendors WHERE user_id=$1`,[userId]),
  query(`SELECT full_name,email,address,mobile_number,whatsapp_number,profile_photo_url,vehicle_type,plate_number,
                emergency_contact,delivery_zone,kyc_status,is_online,location_sharing_enabled,
                rating_avg,rating_count,total_deliveries,total_earnings,acceptance_rate,created_at,updated_at
         FROM riders WHERE user_id=$1`,[userId]),
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


async function listAdminConversations({page=1,limit=30,search}={}) {
  const page_=Math.max(parseInt(page,10)||1,1),limit_=Math.min(Math.max(parseInt(limit,10)||30,1),100),offset=(page_-1)*limit_;
  const params=[],where=[];
  if(search){
    params.push('%'+String(search).trim().slice(0,120)+'%');
    const p='$'+params.length;
    where.push('(ua.full_name ILIKE '+p+' OR ua.phone ILIKE '+p+' OR ub.full_name ILIKE '+p+' OR ub.phone ILIKE '+p+' OR va.business_name ILIKE '+p+' OR vb.business_name ILIKE '+p+' OR o.order_number ILIKE '+p+')');
  }
  const whereSql=where.length?'WHERE '+where.join(' AND '):'';
  const {rows}=await query(
    `SELECT c.id,c.order_id,c.created_at,
       c.participant_a AS participant_a_id,ua.full_name AS participant_a_name,ua.phone AS participant_a_phone,
       c.participant_b AS participant_b_id,ub.full_name AS participant_b_name,ub.phone AS participant_b_phone,
       COALESCE(va.business_name,vb.business_name) AS vendor_name,o.order_number,
       lm.body AS last_message,lm.created_at AS last_message_at,lm.sender_id AS last_sender_id,
       (SELECT count(*)::int FROM messages unread
        WHERE unread.conversation_id=c.id AND unread.read_at IS NULL
          AND unread.sender_id IN (c.participant_a,c.participant_b)
          AND NOT EXISTS (
            SELECT 1 FROM user_roles unread_ur JOIN roles unread_role ON unread_role.id=unread_ur.role_id
            WHERE unread_ur.user_id=unread.sender_id AND unread_role.name IN ('admin','super_admin')
          )) AS unread_messages
     FROM conversations c
     JOIN users ua ON ua.id=c.participant_a
     JOIN users ub ON ub.id=c.participant_b
     LEFT JOIN vendors va ON va.user_id=c.participant_a
     LEFT JOIN vendors vb ON vb.user_id=c.participant_b
     LEFT JOIN orders o ON o.id=c.order_id
     LEFT JOIN LATERAL (SELECT body,created_at,sender_id FROM messages
       WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
     ${whereSql}
     ORDER BY COALESCE(lm.created_at,c.created_at) DESC
     LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit_,offset]
  );
  const {rows:[count]}=await query(
    `SELECT count(*)::int AS total FROM conversations c
      JOIN users ua ON ua.id=c.participant_a JOIN users ub ON ub.id=c.participant_b
      LEFT JOIN vendors va ON va.user_id=c.participant_a LEFT JOIN vendors vb ON vb.user_id=c.participant_b
      LEFT JOIN orders o ON o.id=c.order_id ${whereSql}`,params
  );
  const total=Number(count.total||0);
  return {items:rows,total,page:page_,limit:limit_,totalPages:Math.ceil(total/limit_)};
}

async function startAdminConversation(participantUserId,actor){
  const targetId=String(participantUserId||'').trim();
  if(!targetId||targetId===String(actor&&actor.id||'')){
    throw new (require('../../middleware/errorHandler').AppError)('Choose a different customer, vendor or rider account.',400,'INVALID_CHAT_PARTICIPANT');
  }
  return withTransaction(async client=>{
    const {rows:[participant]}=await client.query(
      'SELECT id,full_name,phone,status FROM users WHERE id=$1 FOR SHARE',[targetId]
    );
    if(!participant)throw new (require('../../middleware/errorHandler').AppError)('The selected MarketLink account was not found.',404,'USER_NOT_FOUND');
    if(participant.status!=='active')throw new (require('../../middleware/errorHandler').AppError)('Direct chat can only be started with an active account.',409,'USER_NOT_ACTIVE');
    const {rows:roles}=await client.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1',[targetId]
    );
    if(!roles.some(row=>['customer','vendor','rider'].includes(row.name))){
      throw new (require('../../middleware/errorHandler').AppError)('Direct chat is available for customer, vendor and rider accounts only.',403,'CHAT_ROLE_NOT_ALLOWED');
    }
    const actorId=String(actor.id);
    const a=actorId<targetId?actorId:targetId,b=actorId<targetId?targetId:actorId;
    const {rows:[conversation]}=await client.query(
      'INSERT INTO conversations(participant_a,participant_b) VALUES($1,$2) ON CONFLICT (participant_a,participant_b) WHERE order_id IS NULL DO UPDATE SET participant_a=EXCLUDED.participant_a RETURNING *',
      [a,b]
    );
    await client.query(
      `INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data)
       VALUES($1,$2,'chat.admin_conversation_started','conversation',$3,$4)`,
      [actor.id,actor.role||'admin',conversation.id,JSON.stringify({participantUserId:targetId,participantName:participant.full_name})]
    );
    return {conversation,participant};
  });
}

async function getAdminConversationMessages(conversationId,{limit=100}={}) {
  const {rows:[conversation]}=await query(
    `SELECT c.id,c.order_id,c.created_at,
       c.participant_a AS participant_a_id,ua.full_name AS participant_a_name,ua.phone AS participant_a_phone,
       c.participant_b AS participant_b_id,ub.full_name AS participant_b_name,ub.phone AS participant_b_phone,
       COALESCE(va.business_name,vb.business_name) AS vendor_name,o.order_number
     FROM conversations c JOIN users ua ON ua.id=c.participant_a JOIN users ub ON ub.id=c.participant_b
     LEFT JOIN vendors va ON va.user_id=c.participant_a LEFT JOIN vendors vb ON vb.user_id=c.participant_b
     LEFT JOIN orders o ON o.id=c.order_id WHERE c.id=$1`,[conversationId]
  );
  if(!conversation)throw new (require('../../middleware/errorHandler').AppError)('Conversation not found.',404,'CONVERSATION_NOT_FOUND');
  const limit_=Math.min(Math.max(parseInt(limit,10)||100,1),100);
  const {rows}=await query(
    `SELECT m.id,m.conversation_id,m.sender_id,m.body,m.attachment_url,m.status,m.created_at,m.read_at,
       u.full_name AS sender_name,
       CASE WHEN EXISTS (
              SELECT 1 FROM user_roles sender_ur JOIN roles sender_role ON sender_role.id=sender_ur.role_id
              WHERE sender_ur.user_id=m.sender_id AND sender_role.name IN ('admin','super_admin')
            ) THEN 'admin'
            WHEN m.sender_id=$2 THEN 'participant_a'
            WHEN m.sender_id=$3 THEN 'participant_b' ELSE 'admin' END AS sender_type
     FROM messages m JOIN users u ON u.id=m.sender_id
     WHERE m.conversation_id=$1 ORDER BY m.created_at DESC LIMIT $4`,
    [conversationId,conversation.participant_a_id,conversation.participant_b_id,limit_]
  );
  return {conversation,messages:rows.reverse()};
}

async function sendAdminConversationMessage(conversationId,body,actor) {
  const text=String(body||'').trim();
  if(!text||text.length>4000)throw new (require('../../middleware/errorHandler').AppError)('Message must contain 1–4000 characters.',400,'INVALID_MESSAGE');
  return withTransaction(async client=>{
    const {rows:[conversation]}=await client.query(
      'SELECT id,participant_a,participant_b FROM conversations WHERE id=$1 FOR UPDATE',[conversationId]
    );
    if(!conversation)throw new (require('../../middleware/errorHandler').AppError)('Conversation not found.',404,'CONVERSATION_NOT_FOUND');
    const {rows:[message]}=await client.query(
      `INSERT INTO messages(conversation_id,sender_id,body,status)
       VALUES($1,$2,$3,'sent') RETURNING id,conversation_id,sender_id,body,status,created_at`,
      [conversationId,actor.id,text]
    );
    const recipientIds=[conversation.participant_a,conversation.participant_b]
      .filter(userId=>String(userId)!==String(actor.id));
    if(recipientIds.length){
      await client.query(
        `INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id)
         SELECT recipient_id,'chat_message','MarketLink support replied',
           'An administrator replied in your MarketLink conversation.','conversation',$2
         FROM unnest($1::uuid[]) AS recipient_id`,
        [recipientIds,conversationId]
      );
    }
    await client.query(
      `INSERT INTO admin_action_logs(actor_id,actor_role,action,entity_type,entity_id,after_data)
       VALUES($1,$2,'chat.admin_reply_sent','conversation',$3,$4)`,
      [actor.id,actor.role||'admin',conversationId,JSON.stringify({messageId:message.id,recipientIds})]
    );
    return message;
  });
}

module.exports = { getDashboard, getUsers, suspendUser, reinstateUser, getAnalytics, getSystemSettings, updateSystemSetting, getAuditLogs, getReports, getAffiliateDirectory, getAdminTransactions, getFailedPayments, retryFinancialSettlement, listSupportTickets, getSupportTicket, updateSupportTicket, replySupportTicket, getCrmProfile, addCrmNote, listAdminConversations, startAdminConversation, getAdminConversationMessages, sendAdminConversationMessage };
