// src/modules/riders/service.js
// Rider registration, availability, delivery assignment, history, earnings, location.
'use strict';

const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

function auditLog(actor, action, entityId, before, after) {
  return query(
    `INSERT INTO admin_action_logs
       (actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent)
     VALUES ($1,$2,$3,'rider',$4,$5,$6,$7,$8)`,
    [actor.id, actor.role, action, String(entityId),
     before ? JSON.stringify(before) : null,
     after  ? JSON.stringify(after)  : null,
     actor.meta?.ip || null, actor.meta?.ua || null]
  ).catch(err => logger.error('Rider audit log failed', { err: err.message }));
}

// ── REGISTER ─────────────────────────────────────────────────────────
async function register(userId, data) {
  const { vehicleType, plateNumber, licenseNumber, nationalId,
          emergencyContact, address, deliveryZone } = data;

  const { rows: existing } = await query(
    'SELECT user_id FROM riders WHERE user_id = $1', [userId]);
  if (existing.length) throw new AppError('A rider profile already exists for this account.', 409, 'RIDER_EXISTS');

  return withTransaction(async (client) => {
    const { rows: [rider] } = await client.query(
      `INSERT INTO riders
         (user_id, vehicle_type, plate_number, license_number, national_id,
          emergency_contact, address, delivery_zone, kyc_status, is_online)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',FALSE) RETURNING *`,
      [userId, vehicleType || null, plateNumber || null, licenseNumber || null,
       nationalId || null, emergencyContact || null, address || null, deliveryZone || null]
    );

    // Grant rider role
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'rider'
       ON CONFLICT DO NOTHING`, [userId]
    );

    // Create wallet if not exists
    await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);

    logger.info('Rider registered', { userId, vehicleType });
    return rider;
  });
}

// ── GET BY ID ────────────────────────────────────────────────────────
async function getById(userId, includePrivate = false) {
  const { rows } = await query(
    `SELECT r.*,
            u.full_name, u.phone, u.email,
            (SELECT count(*) FROM deliveries d WHERE d.rider_id = r.user_id AND d.status = 'delivered') AS completed_deliveries,
            (SELECT coalesce(sum(amount),0) FROM rider_earnings re WHERE re.rider_id = r.user_id AND re.paid_at IS NOT NULL) AS total_paid
     FROM riders r
     JOIN users u ON u.id = r.user_id
     WHERE r.user_id = $1`,
    [userId]
  );
  if (!rows.length) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');
  const r = rows[0];
  if (!includePrivate) {
    delete r.national_id; delete r.kyc_notes; delete r.suspension_reason;
    delete r.license_number;
  }
  return r;
}

// ── LIST ─────────────────────────────────────────────────────────────
async function list({ page = 1, limit = 20, search, kycStatus, isOnline, zone, isAdmin = false }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const conditions = [], params = [];
  let pi = 1;

  if (!isAdmin) conditions.push("r.kyc_status = 'approved'");
  else if (kycStatus) { conditions.push(`r.kyc_status = $${pi++}`); params.push(kycStatus); }

  if (search) {
    conditions.push(`(u.full_name ILIKE $${pi} OR r.vehicle_type ILIKE $${pi} OR r.delivery_zone ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }
  if (isOnline !== undefined) {
    conditions.push(`r.is_online = $${pi++}`);
    params.push(isOnline === 'true' || isOnline === true);
  }
  if (zone) {
    conditions.push(`r.delivery_zone ILIKE $${pi++}`);
    params.push(`%${zone}%`);
  }

  const where = conditions.length
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  const [data, count] = await Promise.all([
    query(
      `SELECT r.user_id, r.vehicle_type, r.plate_number, r.kyc_status,
              r.is_online, r.delivery_zone, r.rating_avg, r.rating_count,
              r.total_deliveries, r.total_earnings, r.acceptance_rate,
              r.current_lat, r.current_lng, r.last_location_at,
              u.full_name, u.phone
       FROM riders r
       JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.is_online DESC, r.rating_avg DESC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit_, offset]
    ),
    query(`SELECT count(*) FROM riders r JOIN users u ON u.id = r.user_id ${where}`, params),
  ]);

  return {
    items: data.rows,
    total: parseInt(count.rows[0].count),
    page: parseInt(page), limit: limit_,
    totalPages: Math.ceil(parseInt(count.rows[0].count) / limit_),
  };
}

// ── UPDATE PROFILE ───────────────────────────────────────────────────
async function updateProfile(userId, data) {
  const allowed = {
    vehicleType: 'vehicle_type', plateNumber: 'plate_number',
    licenseNumber: 'license_number', emergencyContact: 'emergency_contact',
    address: 'address', deliveryZone: 'delivery_zone',
    profilePhotoUrl: 'profile_photo_url',
  };
  const sets = [], params = []; let pi = 1;
  for (const [jsKey, col] of Object.entries(allowed)) {
    if (data[jsKey] !== undefined) { sets.push(`${col} = $${pi++}`); params.push(data[jsKey]); }
  }
  if (!sets.length) throw new AppError('No valid fields to update.', 400, 'VALIDATION_ERROR');
  params.push(userId);
  const { rows: [updated] } = await query(
    `UPDATE riders SET ${sets.join(', ')} WHERE user_id = $${pi} RETURNING *`, params);
  if (!updated) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');
  return updated;
}

// ── AVAILABILITY TOGGLE ──────────────────────────────────────────────
async function setAvailability(userId, isOnline) {
  const { rows: [r] } = await query(
    `UPDATE riders SET is_online = $1, last_location_at = CASE WHEN $1 THEN now() ELSE last_location_at END
     WHERE user_id = $2 AND kyc_status = 'approved'
     RETURNING user_id, is_online, kyc_status`,
    [isOnline, userId]
  );
  if (!r) throw new AppError('Only approved riders can toggle availability.', 403, 'NOT_APPROVED');
  return r;
}

// ── LOCATION UPDATE (GPS ping from rider app) ────────────────────────
async function updateLocation(userId, { lat, lng, deliveryId }) {
  // Update current position on rider record
  await query(
    `UPDATE riders SET current_lat = $1, current_lng = $2, last_location_at = now()
     WHERE user_id = $3`,
    [lat, lng, userId]
  );

  // Append to location ping history for tracking
  await query(
    `INSERT INTO rider_location_pings (rider_id, delivery_id, lat, lng)
     VALUES ($1,$2,$3,$4)`,
    [userId, deliveryId || null, lat, lng]
  );

  return { lat, lng, updatedAt: new Date() };
}

// ── DELIVERY HISTORY ─────────────────────────────────────────────────
async function getDeliveryHistory(riderId, { page = 1, limit = 20, status }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const conditions = ['d.rider_id = $1'];
  const params = [riderId];
  let pi = 2;

  if (status) { conditions.push(`d.status = $${pi++}`); params.push(status); }

  const { rows } = await query(
    `SELECT d.id, d.order_id, d.status, d.distance_km, d.estimated_minutes,
            d.picked_up_at, d.delivered_at, d.created_at,
            o.order_number, o.total AS order_total,
            v.business_name AS vendor_name,
            re.amount AS earning
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     JOIN vendors v ON v.user_id = o.vendor_id
     LEFT JOIN rider_earnings re ON re.delivery_id = d.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.created_at DESC
     LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]
  );
  return rows;
}

// ── EARNINGS ─────────────────────────────────────────────────────────
async function getEarnings(riderId, { page = 1, limit = 20, period = '30d' }) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;

  const [summary, entries] = await Promise.all([
    query(
      `SELECT
         coalesce(sum(amount),0)                      AS total_earnings,
         coalesce(sum(amount) FILTER (WHERE paid_at IS NOT NULL),0) AS paid_earnings,
         coalesce(sum(amount) FILTER (WHERE paid_at IS NULL),0)     AS pending_earnings,
         count(*)                                     AS total_entries
       FROM rider_earnings
       WHERE rider_id = $1
         AND created_at >= now() - ($2 || ' days')::INTERVAL`,
      [riderId, days]
    ),
    query(
      `SELECT re.*, d.id AS delivery_ref, o.order_number
       FROM rider_earnings re
       LEFT JOIN deliveries d ON d.id = re.delivery_id
       LEFT JOIN orders o ON o.id = re.order_id
       WHERE re.rider_id = $1
       ORDER BY re.created_at DESC
       LIMIT $2 OFFSET $3`,
      [riderId, limit_, offset]
    ),
  ]);

  return { period, summary: summary.rows[0], entries: entries.rows };
}

// ── KYC WORKFLOW ─────────────────────────────────────────────────────
async function approve(riderId, actor, notes) {
  const { rows } = await query('SELECT * FROM riders WHERE user_id = $1', [riderId]);
  if (!rows.length) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');
  const before = rows[0];
  if (before.kyc_status === 'approved') throw new AppError('Rider already approved.', 400, 'ALREADY_APPROVED');

  const { rows: [updated] } = await query(
    `UPDATE riders SET kyc_status = 'approved', kyc_reviewed_by = $1,
                       kyc_reviewed_at = now(), kyc_notes = $2
     WHERE user_id = $3 RETURNING *`,
    [actor.id, notes || null, riderId]
  );

  await query(
    `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
     VALUES ($1,'rider_approved','Application Approved 🎉',
             'Your rider application has been approved. Toggle your availability to start receiving deliveries.',
             'rider',$1)`,
    [riderId]
  );

  await auditLog(actor, 'rider.approved', riderId, before, updated);
  return updated;
}

async function reject(riderId, actor, reason) {
  if (!reason?.trim()) throw new AppError('Reason required.', 400, 'VALIDATION_ERROR');
  const { rows } = await query('SELECT * FROM riders WHERE user_id = $1', [riderId]);
  if (!rows.length) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');

  const { rows: [updated] } = await query(
    `UPDATE riders SET kyc_status = 'rejected', kyc_reviewed_by = $1,
                       kyc_reviewed_at = now(), kyc_notes = $2
     WHERE user_id = $3 RETURNING *`,
    [actor.id, reason.trim(), riderId]
  );
  await query(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1,'rider_rejected','Application Update',$2)`,
    [riderId, `Your rider application was not approved. Reason: ${reason.trim()}`]
  );
  await auditLog(actor, 'rider.rejected', riderId, rows[0], updated);
  return updated;
}

async function suspend(riderId, actor, reason) {
  if (!reason?.trim()) throw new AppError('Reason required.', 400, 'VALIDATION_ERROR');
  const { rows } = await query('SELECT * FROM riders WHERE user_id = $1', [riderId]);
  if (!rows.length) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');

  const { rows: [updated] } = await query(
    `UPDATE riders SET kyc_status = 'suspended', is_online = FALSE,
                       suspension_reason = $1, kyc_reviewed_by = $2, kyc_reviewed_at = now()
     WHERE user_id = $3 RETURNING *`,
    [reason.trim(), actor.id, riderId]
  );
  await query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [riderId]);
  await auditLog(actor, 'rider.suspended', riderId, rows[0], updated);
  return updated;
}

async function reinstate(riderId, actor) {
  const { rows: [updated] } = await query(
    `UPDATE riders SET kyc_status = 'approved', suspension_reason = NULL,
                       kyc_reviewed_by = $1, kyc_reviewed_at = now()
     WHERE user_id = $2 RETURNING *`,
    [actor.id, riderId]
  );
  if (!updated) throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');
  await query(`UPDATE users SET status = 'active' WHERE id = $1`, [riderId]);
  await auditLog(actor, 'rider.reinstated', riderId, null, updated);
  return updated;
}

// ── ADD EARNING (called by delivery service on completion) ────────────
async function addEarning(riderId, { deliveryId, orderId, amount, type = 'delivery', description }) {
  const { rows: [earning] } = await query(
    `INSERT INTO rider_earnings (rider_id, delivery_id, order_id, amount, type, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [riderId, deliveryId || null, orderId || null, amount, type, description || null]
  );
  // Update running total on rider record
  await query(
    `UPDATE riders SET total_earnings = total_earnings + $1 WHERE user_id = $2`,
    [amount, riderId]
  );
  // Credit wallet
  const { rows: [wallet] } = await query(
    `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2
     RETURNING id, balance`,
    [amount, riderId]
  );
  if (wallet) {
    await query(
      `INSERT INTO transactions (wallet_id, type, category, amount, balance_after, reference_type, reference_id, description)
       VALUES ($1,'credit','delivery_earning',$2,$3,'delivery',$4,$5)`,
      [wallet.id, amount, wallet.balance, deliveryId, description || 'Delivery earning']
    );
  }
  return earning;
}

module.exports = {
  register, getById, list, updateProfile, setAvailability, updateLocation,
  getDeliveryHistory, getEarnings, approve, reject, suspend, reinstate, addEarning,
};
