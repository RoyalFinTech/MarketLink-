// src/modules/vendors/service.js
// Vendor registration, KYC approval workflow, store profile, analytics.
'use strict';

const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

function actorLog(actor, action, entityId, before, after) {
  return query(
    `INSERT INTO admin_action_logs
       (actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent)
     VALUES ($1,$2,$3,'vendor',$4,$5,$6,$7,$8)`,
    [actor.id, actor.role, action, String(entityId),
     before ? JSON.stringify(before) : null,
     after  ? JSON.stringify(after)  : null,
     actor.meta?.ip || null, actor.meta?.ua || null]
  ).catch(err => logger.error('Vendor audit log failed', { err: err.message }));
}

// ── REGISTER (called after user account already exists) ──────────────
async function register(userId, data) {
  const { businessName, businessCategory, businessAddress, phone, email,
          description, nationalId, latitude, longitude } = data;

  if (!businessName?.trim()) throw new AppError('Business name is required.', 400, 'VALIDATION_ERROR');

  // Check user exists and doesn't already have a vendor profile
  const { rows: existing } = await query(
    'SELECT user_id FROM vendors WHERE user_id = $1', [userId]);
  if (existing.length) throw new AppError('A vendor profile already exists for this account.', 409, 'VENDOR_EXISTS');

  return withTransaction(async (client) => {
    const { rows: [vendor] } = await client.query(
      `INSERT INTO vendors
         (user_id, business_name, business_category, business_address, phone, email,
          description, national_id, latitude, longitude, kyc_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
      [userId, businessName.trim(), businessCategory || null, businessAddress || null,
       phone || null, email || null, description || null,
       nationalId || null, latitude || null, longitude || null]
    );

    // Grant vendor role to user
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'vendor'
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // Create wallet if not exists
    await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);

    logger.info('Vendor registered', { userId, businessName });
    return vendor;
  });
}

// ── GET VENDOR (public store view) ───────────────────────────────────
async function getById(userId, includePrivate = false) {
  const { rows } = await query(
    `SELECT v.*,
            u.full_name AS owner_name,
            u.phone     AS owner_phone,
            u.email     AS owner_email,
            (SELECT count(*) FROM products p
             WHERE p.vendor_id = v.user_id AND p.status = 'active') AS active_products
     FROM vendors v
     JOIN users u ON u.id = v.user_id
     WHERE v.user_id = $1`,
    [userId]
  );
  if (!rows.length) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  const v = rows[0];
  if (!includePrivate) {
    // Strip sensitive KYC fields from public view
    delete v.national_id; delete v.kyc_notes; delete v.suspension_reason;
    delete v.owner_phone; delete v.owner_email;
  }
  return v;
}

// ── LIST (admin: all vendors; public: approved only) ─────────────────
async function list({ page = 1, limit = 20, search, kycStatus, category, isOpen, actor }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const isAdmin = actor && ['admin','super_admin','moderator'].includes(actor.role);
  const conditions = [], params = [];
  let pi = 1;

  if (!isAdmin) {
    conditions.push("v.kyc_status = 'approved'");
    conditions.push('v.vacation_mode = FALSE');
  } else if (kycStatus) {
    conditions.push(`v.kyc_status = $${pi++}`);
    params.push(kycStatus);
  }

  if (search) {
    conditions.push(`(v.business_name ILIKE $${pi} OR v.business_category ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }
  if (category) {
    conditions.push(`v.business_category ILIKE $${pi++}`);
    params.push(`%${category}%`);
  }
  if (isOpen !== undefined) {
    conditions.push(`v.is_open = $${pi++}`);
    params.push(isOpen === 'true' || isOpen === true);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [data, count] = await Promise.all([
    query(
      `SELECT v.user_id, v.business_name, v.business_category, v.business_address,
              v.logo_url, v.banner_url, v.description, v.rating_avg, v.rating_count,
              v.is_open, v.vacation_mode, v.kyc_status, v.commission_pct,
              v.total_sales, v.total_revenue, v.created_at,
              u.full_name AS owner_name,
              (SELECT count(*) FROM products p
               WHERE p.vendor_id = v.user_id AND p.status = 'active') AS active_products
       FROM vendors v
       JOIN users u ON u.id = v.user_id
       ${where}
       ORDER BY v.rating_avg DESC, v.total_sales DESC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit_, offset]
    ),
    query(`SELECT count(*) FROM vendors v ${where}`, params),
  ]);

  return {
    items: data.rows,
    total: parseInt(count.rows[0].count),
    page: parseInt(page), limit: limit_,
    totalPages: Math.ceil(parseInt(count.rows[0].count) / limit_),
  };
}

// ── UPDATE STORE PROFILE ─────────────────────────────────────────────
async function updateProfile(userId, data) {
  const allowed = {
    businessName: 'business_name', businessCategory: 'business_category',
    businessAddress: 'business_address', phone: 'phone', email: 'email',
    description: 'description', logoUrl: 'logo_url', bannerUrl: 'banner_url',
    returnPolicy: 'return_policy', minOrderValue: 'min_order_value',
    deliveryTimeMin: 'delivery_time_min', deliveryTimeMax: 'delivery_time_max',
    latitude: 'latitude', longitude: 'longitude',
    isOpen: 'is_open', vacationMode: 'vacation_mode',
  };

  const sets = [], params = []; let pi = 1;
  for (const [jsKey, col] of Object.entries(allowed)) {
    if (data[jsKey] !== undefined) {
      sets.push(`${col} = $${pi++}`);
      params.push(data[jsKey]);
    }
  }
  if (!sets.length) throw new AppError('No valid fields to update.', 400, 'VALIDATION_ERROR');

  params.push(userId);
  const { rows: [updated] } = await query(
    `UPDATE vendors SET ${sets.join(', ')} WHERE user_id = $${pi} RETURNING *`,
    params
  );
  if (!updated) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  return updated;
}

// ── KYC APPROVAL WORKFLOW ────────────────────────────────────────────
async function approve(vendorId, actor, notes) {
  const { rows } = await query('SELECT * FROM vendors WHERE user_id = $1', [vendorId]);
  if (!rows.length) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  const before = rows[0];

  if (before.kyc_status === 'approved') {
    throw new AppError('Vendor is already approved.', 400, 'ALREADY_APPROVED');
  }

  const { rows: [updated] } = await query(
    `UPDATE vendors
     SET kyc_status = 'approved', kyc_reviewed_by = $1, kyc_reviewed_at = now(), kyc_notes = $2
     WHERE user_id = $3 RETURNING *`,
    [actor.id, notes || null, vendorId]
  );

  // Notify vendor
  await query(
    `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
     VALUES ($1,'vendor_approved','Application Approved 🎉',
             'Congratulations! Your vendor application has been approved. You can now start listing products.',
             'vendor',$1)`,
    [vendorId]
  );

  await actorLog(actor, 'vendor.approved', vendorId, before, updated);
  logger.info('Vendor approved', { vendorId, actor: actor.id });
  return updated;
}

async function reject(vendorId, actor, reason) {
  if (!reason?.trim()) throw new AppError('Rejection reason is required.', 400, 'VALIDATION_ERROR');
  const { rows } = await query('SELECT * FROM vendors WHERE user_id = $1', [vendorId]);
  if (!rows.length) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  const before = rows[0];

  const { rows: [updated] } = await query(
    `UPDATE vendors
     SET kyc_status = 'rejected', kyc_reviewed_by = $1, kyc_reviewed_at = now(), kyc_notes = $2
     WHERE user_id = $3 RETURNING *`,
    [actor.id, reason.trim(), vendorId]
  );

  await query(
    `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
     VALUES ($1,'vendor_rejected','Application Update',
             $2,'vendor',$1)`,
    [vendorId, `Your vendor application was not approved. Reason: ${reason.trim()}`]
  );

  await actorLog(actor, 'vendor.rejected', vendorId, before, updated);
  return updated;
}

async function suspend(vendorId, actor, reason) {
  if (!reason?.trim()) throw new AppError('Suspension reason is required.', 400, 'VALIDATION_ERROR');
  const { rows } = await query('SELECT * FROM vendors WHERE user_id = $1', [vendorId]);
  if (!rows.length) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  const before = rows[0];

  const { rows: [updated] } = await query(
    `UPDATE vendors
     SET kyc_status = 'suspended', suspension_reason = $1, kyc_reviewed_by = $2, kyc_reviewed_at = now()
     WHERE user_id = $3 RETURNING *`,
    [reason.trim(), actor.id, vendorId]
  );

  await query(
    `UPDATE users SET status = 'suspended' WHERE id = $1`, [vendorId]);

  await actorLog(actor, 'vendor.suspended', vendorId, before, updated);
  return updated;
}

async function reinstate(vendorId, actor) {
  const { rows: [updated] } = await query(
    `UPDATE vendors SET kyc_status = 'approved', suspension_reason = NULL,
                        kyc_reviewed_by = $1, kyc_reviewed_at = now()
     WHERE user_id = $2 RETURNING *`,
    [actor.id, vendorId]
  );
  if (!updated) throw new AppError('Vendor not found.', 404, 'VENDOR_NOT_FOUND');
  await query(`UPDATE users SET status = 'active' WHERE id = $1`, [vendorId]);
  await actorLog(actor, 'vendor.reinstated', vendorId, null, updated);
  return updated;
}

// ── ANALYTICS ────────────────────────────────────────────────────────
async function getAnalytics(vendorId, { period = '30d' } = {}) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const [summary, daily, topProducts, recentOrders] = await Promise.all([
    // Overall summary
    query(
      `SELECT
         count(*)                                    AS total_orders,
         coalesce(sum(o.total), 0)                  AS total_revenue,
         coalesce(avg(o.total), 0)                  AS avg_order_value,
         count(*) FILTER (WHERE o.status='delivered') AS completed_orders,
         count(*) FILTER (WHERE o.status='cancelled') AS cancelled_orders
       FROM orders o
       WHERE o.vendor_id = $1
         AND o.placed_at >= now() - ($2 || ' days')::INTERVAL`,
      [vendorId, days]
    ),
    // Daily revenue for chart
    query(
      `SELECT date_trunc('day', placed_at) AS day,
              count(*)                      AS orders,
              coalesce(sum(total), 0)       AS revenue
       FROM orders
       WHERE vendor_id = $1
         AND placed_at >= now() - ($2 || ' days')::INTERVAL
       GROUP BY 1 ORDER BY 1`,
      [vendorId, days]
    ),
    // Top products by sales
    query(
      `SELECT oi.product_name_snapshot AS name,
              sum(oi.quantity)         AS units_sold,
              sum(oi.line_total)       AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.vendor_id = $1
         AND o.placed_at >= now() - ($2 || ' days')::INTERVAL
         AND o.status = 'delivered'
       GROUP BY 1
       ORDER BY units_sold DESC LIMIT 5`,
      [vendorId, days]
    ),
    // Recent orders
    query(
      `SELECT o.id, o.order_number, o.status, o.total, o.placed_at,
              u.full_name AS customer_name
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       WHERE o.vendor_id = $1
       ORDER BY o.placed_at DESC LIMIT 10`,
      [vendorId]
    ),
  ]);

  return {
    period,
    summary: summary.rows[0],
    dailyChart: daily.rows,
    topProducts: topProducts.rows,
    recentOrders: recentOrders.rows,
  };
}

module.exports = { register, getById, list, updateProfile, approve, reject, suspend, reinstate, getAnalytics };
