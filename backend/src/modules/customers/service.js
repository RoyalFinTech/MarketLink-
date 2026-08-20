// src/modules/customers/service.js
'use strict';

const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ── GET PROFILE ──────────────────────────────────────────────────────
async function getProfile(customerId) {
  const { rows } = await query(
    `SELECT c.*, u.full_name, u.phone, u.email, u.status, u.created_at AS joined_at,
            w.balance AS wallet_balance,
            (SELECT count(*) FROM orders o WHERE o.customer_id = c.user_id) AS total_orders,
            (SELECT coalesce(sum(o.total),0) FROM orders o
             WHERE o.customer_id = c.user_id AND o.status = 'delivered') AS total_spent,
            (SELECT count(*) FROM wishlist_items wi WHERE wi.customer_id = c.user_id) AS wishlist_count
     FROM customers c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN wallets w ON w.user_id = c.user_id
     WHERE c.user_id = $1`,
    [customerId]
  );
  if (!rows.length) throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
  return rows[0];
}

// ── UPDATE PROFILE ───────────────────────────────────────────────────
async function updateProfile(customerId, data) {
  const { fullName, dateOfBirth, gender, profilePhotoUrl } = data;
  const userSets = [], custSets = [], userParams = [], custParams = [];
  let upi = 1, cpi = 1;

  if (fullName !== undefined) {
    userSets.push(`full_name = $${upi++}`);
    userParams.push(fullName.trim());
  }
  if (dateOfBirth !== undefined) { custSets.push(`date_of_birth = $${cpi++}`); custParams.push(dateOfBirth); }
  if (gender      !== undefined) { custSets.push(`gender = $${cpi++}`);        custParams.push(gender); }
  if (profilePhotoUrl !== undefined) {
    custSets.push(`profile_photo_url = $${cpi++}`);
    custParams.push(profilePhotoUrl);
  }

  await withTransaction(async (client) => {
    if (userSets.length) {
      userParams.push(customerId);
      await client.query(`UPDATE users SET ${userSets.join(', ')} WHERE id = $${upi}`, userParams);
    }
    if (custSets.length) {
      custParams.push(customerId);
      await client.query(`UPDATE customers SET ${custSets.join(', ')} WHERE user_id = $${cpi}`, custParams);
    }
  });

  return getProfile(customerId);
}

// ── ADDRESSES ─────────────────────────────────────────────────────────
async function listAddresses(customerId) {
  const { rows } = await query(
    `SELECT * FROM delivery_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [customerId]
  );
  return rows;
}

async function addAddress(customerId, data) {
  const { label, fullAddress, area, latitude, longitude, isDefault = false } = data;
  if (!fullAddress?.trim()) throw new AppError('Full address is required.', 400, 'VALIDATION_ERROR');

  return withTransaction(async (client) => {
    if (isDefault) {
      await client.query(
        'UPDATE delivery_addresses SET is_default = FALSE WHERE customer_id = $1', [customerId]);
    }
    const { rows: [addr] } = await client.query(
      `INSERT INTO delivery_addresses
         (customer_id, label, full_address, area, latitude, longitude, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [customerId, label || 'Home', fullAddress.trim(), area || null,
       latitude || null, longitude || null, isDefault]
    );
    return addr;
  });
}

async function updateAddress(customerId, addressId, data) {
  const allowed = {
    label: 'label', fullAddress: 'full_address', area: 'area',
    latitude: 'latitude', longitude: 'longitude', isDefault: 'is_default',
  };
  const sets = [], params = []; let pi = 1;
  for (const [jsKey, col] of Object.entries(allowed)) {
    if (data[jsKey] !== undefined) { sets.push(`${col} = $${pi++}`); params.push(data[jsKey]); }
  }
  if (!sets.length) throw new AppError('No fields to update.', 400, 'VALIDATION_ERROR');

  return withTransaction(async (client) => {
    if (data.isDefault) {
      await client.query(
        'UPDATE delivery_addresses SET is_default = FALSE WHERE customer_id = $1', [customerId]);
    }
    params.push(addressId, customerId);
    const { rows: [addr] } = await client.query(
      `UPDATE delivery_addresses SET ${sets.join(', ')}
       WHERE id = $${pi} AND customer_id = $${pi+1} RETURNING *`,
      params
    );
    if (!addr) throw new AppError('Address not found.', 404, 'ADDRESS_NOT_FOUND');
    return addr;
  });
}

async function deleteAddress(customerId, addressId) {
  const { rows: [addr] } = await query(
    `DELETE FROM delivery_addresses WHERE id = $1 AND customer_id = $2 RETURNING id`,
    [addressId, customerId]
  );
  if (!addr) throw new AppError('Address not found.', 404, 'ADDRESS_NOT_FOUND');
  return { deleted: true, id: addressId };
}

// ── WISHLIST ──────────────────────────────────────────────────────────
async function getWishlist(customerId, { page = 1, limit = 20 }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const { rows } = await query(
    `SELECT wi.id, wi.added_at,
            p.id AS product_id, p.name, p.slug, p.price, p.compare_at_price,
            p.rating_avg, p.status,
            (SELECT image_url FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_primary = TRUE LIMIT 1) AS image,
            v.business_name AS vendor_name
     FROM wishlist_items wi
     JOIN products p  ON p.id = wi.product_id
     JOIN vendors  v  ON v.user_id = p.vendor_id
     WHERE wi.customer_id = $1
     ORDER BY wi.added_at DESC
     LIMIT $2 OFFSET $3`,
    [customerId, limit_, offset]
  );
  return rows;
}

async function addToWishlist(customerId, productId) {
  const { rows: [prod] } = await query('SELECT id FROM products WHERE id = $1', [productId]);
  if (!prod) throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');
  const { rows: [item] } = await query(
    `INSERT INTO wishlist_items (customer_id, product_id)
     VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`,
    [customerId, productId]
  );
  return item || { customer_id: customerId, product_id: productId, already_saved: true };
}

async function removeFromWishlist(customerId, productId) {
  const { rows: [item] } = await query(
    `DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2 RETURNING id`,
    [customerId, productId]
  );
  if (!item) throw new AppError('Item not in wishlist.', 404, 'NOT_IN_WISHLIST');
  return { removed: true, productId };
}

// ── ORDER HISTORY ─────────────────────────────────────────────────────
async function getOrderHistory(customerId, { page = 1, limit = 20, status }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const conditions = ['o.customer_id = $1'];
  const params = [customerId]; let pi = 2;
  if (status) { conditions.push(`o.status = $${pi++}`); params.push(status); }

  const [data, count] = await Promise.all([
    query(
      `SELECT o.id, o.order_number, o.status, o.total, o.payment_method, o.payment_status,
              o.placed_at, o.delivered_at,
              v.business_name AS vendor_name, v.logo_url AS vendor_logo,
              (SELECT json_agg(json_build_object(
                 'name', oi.product_name_snapshot,
                 'qty',  oi.quantity,
                 'price',oi.unit_price_snapshot))
               FROM order_items oi WHERE oi.order_id = o.id) AS items,
              d.status AS delivery_status, d.rider_id
       FROM orders o
       JOIN vendors v ON v.user_id = o.vendor_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.placed_at DESC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit_, offset]
    ),
    query(`SELECT count(*) FROM orders o WHERE ${conditions.join(' AND ')}`, params),
  ]);

  return {
    items: data.rows,
    total: parseInt(count.rows[0].count),
    page: parseInt(page), limit: limit_,
    totalPages: Math.ceil(parseInt(count.rows[0].count) / limit_),
  };
}

// ── WALLET ────────────────────────────────────────────────────────────
async function getWallet(customerId) {
  const { rows: [wallet] } = await query(
    `SELECT w.*, u.full_name
     FROM wallets w JOIN users u ON u.id = w.user_id
     WHERE w.user_id = $1`, [customerId]
  );
  if (!wallet) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');
  return wallet;
}

async function getWalletTransactions(customerId, { page = 1, limit = 20 }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const { rows: [w] } = await query('SELECT id FROM wallets WHERE user_id = $1', [customerId]);
  if (!w) throw new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND');
  const { rows } = await query(
    `SELECT * FROM transactions WHERE wallet_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [w.id, limit_, offset]
  );
  return rows;
}

// ── LOYALTY POINTS ────────────────────────────────────────────────────
async function getLoyaltyPoints(customerId) {
  const { rows: [c] } = await query(
    'SELECT reward_points FROM customers WHERE user_id = $1', [customerId]);
  if (!c) throw new AppError('Customer not found.', 404, 'CUSTOMER_NOT_FOUND');
  const { rows: txns } = await query(
    `SELECT * FROM loyalty_transactions WHERE customer_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [customerId]
  );
  return { points: c.reward_points, transactions: txns };
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
async function getNotifications(customerId, { page = 1, limit = 20, unreadOnly = false }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const extra = unreadOnly ? 'AND read_at IS NULL' : '';
  const { rows } = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1 ${extra}
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [customerId, limit_, offset]
  );
  return rows;
}

async function markNotificationsRead(customerId, ids) {
  if (ids && ids.length) {
    await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
      [customerId, ids]
    );
  } else {
    await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [customerId]
    );
  }
  return { success: true };
}

// ── ADMIN: list all customers ─────────────────────────────────────────
async function list({ page = 1, limit = 20, search, status }) {
  const limit_ = Math.min(parseInt(limit) || 20, 100);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const conditions = [], params = []; let pi = 1;

  if (search) {
    conditions.push(`(u.full_name ILIKE $${pi} OR u.phone ILIKE $${pi} OR u.email ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }
  if (status) { conditions.push(`u.status = $${pi++}`); params.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [data, count] = await Promise.all([
    query(
      `SELECT c.user_id, u.full_name, u.phone, u.email, u.status, u.created_at,
              c.reward_points, c.referral_code,
              w.balance AS wallet_balance,
              (SELECT count(*) FROM orders o WHERE o.customer_id = c.user_id) AS total_orders
       FROM customers c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN wallets w ON w.user_id = c.user_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit_, offset]
    ),
    query(
      `SELECT count(*) FROM customers c JOIN users u ON u.id = c.user_id ${where}`,
      params
    ),
  ]);

  return {
    items: data.rows,
    total: parseInt(count.rows[0].count),
    page: parseInt(page), limit: limit_,
    totalPages: Math.ceil(parseInt(count.rows[0].count) / limit_),
  };
}

module.exports = {
  getProfile, updateProfile,
  listAddresses, addAddress, updateAddress, deleteAddress,
  getWishlist, addToWishlist, removeFromWishlist,
  getOrderHistory, getWallet, getWalletTransactions,
  getLoyaltyPoints, getNotifications, markNotificationsRead,
  list,
};
