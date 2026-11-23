// src/modules/riders/service.js
// Rider registration, availability, delivery assignment, history, earnings, location.
'use strict';

const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const { assertOwnedUploadReference } = require('../uploads/service');
const notificationsService = require('../notifications/service');
const { normalizePhone } = require('../../utils/phone');
const { normaliseDeliveryPricingPolicy } = require('../../utils/deliveryPricingPolicy');
function normalizeGambianContact(value, label) {
  if (value == null || String(value).trim() === '') return null;
  try {
    const parsed = normalizePhone(String(value), 'GM');
    if (!parsed.e164.startsWith('+220') || String(parsed.national).length !== 9) throw new Error('Invalid Gambian mobile number');
    return parsed.e164;
  } catch (error) {
    throw new AppError((label || 'Contact number') + ' must be a valid Gambian mobile number with 9 national digits.', 400, 'INVALID_PHONE');
  }
}


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
  const { vehicleType, plateNumber, licenseNumber, nationalId, idDocumentUrl,
          licenseDocumentUrl, vehiclePhotoUrl, profilePhotoUrl, emergencyContact, address, deliveryZone,
          mobileNumber, whatsappNumber, latitude, longitude } = data;
  const normalizedMobileNumber = normalizeGambianContact(mobileNumber, 'Rider mobile number');
  const riderFiles = [
    [idDocumentUrl, 'rider-document', 'document', 'Rider identity document'],
    [licenseDocumentUrl, 'license-document', 'document', 'Rider driving licence'],
    [vehiclePhotoUrl, 'rider-photo', 'image', 'Rider vehicle photo'],
    [profilePhotoUrl, 'profile-photo', 'image', 'Rider profile photo'],
  ];
  for (const [url, purpose, type, label] of riderFiles) {
    if (url) await assertOwnedUploadReference(url, userId, purpose, type, label);
  }
  const normalizedWhatsapp = normalizeGambianContact(whatsappNumber, 'Rider WhatsApp contact');

  const { rows: existing } = await query(
    'SELECT user_id FROM riders WHERE user_id = $1', [userId]);
  if (existing.length) throw new AppError('A rider profile already exists for this account.', 409, 'RIDER_EXISTS');

  return withTransaction(async (client) => {
    const { rows: [rider] } = await client.query(
      `INSERT INTO riders
         (user_id, vehicle_type, plate_number, license_number, national_id,
          id_document_url, license_document_url, vehicle_photo_url, profile_photo_url,
          emergency_contact, address, delivery_zone, mobile_number, whatsapp_number, current_lat, current_lng, kyc_status, is_online)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',FALSE) RETURNING *`,
      [userId, vehicleType || null, plateNumber || null, licenseNumber || null,
       nationalId || null, idDocumentUrl || null, licenseDocumentUrl || null, vehiclePhotoUrl || null, profilePhotoUrl || null,
       emergencyContact || null, address || null, deliveryZone || null, normalizedMobileNumber, normalizedWhatsapp, latitude ?? null, longitude ?? null]
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

    // Notify administrators that a new rider application needs review.
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       SELECT DISTINCT ur.user_id, 'rider_application_submitted', 'New rider application', $2, 'rider', $1
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE r.name IN ('admin','super_admin','moderator')`,
      [userId, `Rider application from user ${userId} is awaiting review.`]
    );

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
    // Public rider lookups must not expose private KYC documents, personal
    // contact details, emergency contacts, financial totals, or live GPS.
    // Only approved riders have a public profile.
    if (r.kyc_status !== 'approved') {
      throw new AppError('Rider not found.', 404, 'RIDER_NOT_FOUND');
    }
    return {
      user_id: r.user_id,
      full_name: r.full_name,
      vehicle_type: r.vehicle_type,
      delivery_zone: r.delivery_zone,
      profile_photo_url: r.profile_photo_url,
      rating_avg: r.rating_avg,
      rating_count: r.rating_count,
      total_deliveries: r.total_deliveries,
      completed_deliveries: r.completed_deliveries,
      acceptance_rate: r.acceptance_rate,
    };
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
      `SELECT r.user_id, r.vehicle_type, r.kyc_status,
              r.is_online, r.delivery_zone, r.rating_avg, r.rating_count,
              r.total_deliveries, r.acceptance_rate, r.profile_photo_url,
              u.full_name
              ${isAdmin ? `, r.plate_number, r.total_earnings, r.current_lat, r.current_lng, r.last_location_at,
                u.phone, r.address, r.emergency_contact, r.license_number, r.national_id,
                r.id_document_url, r.license_document_url, r.vehicle_photo_url, r.mobile_number, r.whatsapp_number, u.email` : ''}
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
  if (data.profilePhotoUrl !== undefined) await assertOwnedUploadReference(data.profilePhotoUrl,userId,'profile-photo','image','Rider profile photo');
  const allowed = {
    vehicleType: 'vehicle_type', plateNumber: 'plate_number',
    licenseNumber: 'license_number', emergencyContact: 'emergency_contact',
    address: 'address', deliveryZone: 'delivery_zone', mobileNumber: 'mobile_number', whatsappNumber: 'whatsapp_number',
    profilePhotoUrl: 'profile_photo_url',
  };
  const sets = [], params = []; let pi = 1;
  for (const [jsKey, col] of Object.entries(allowed)) {
    if (data[jsKey] !== undefined) {
      sets.push(col + ' = ' + String.fromCharCode(36) + pi++);
      const value = jsKey === 'mobileNumber'
        ? normalizeGambianContact(data[jsKey], 'Rider mobile number')
        : jsKey === 'whatsappNumber'
          ? normalizeGambianContact(data[jsKey], 'Rider WhatsApp contact')
          : data[jsKey];
      params.push(value);
    }
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
  return withTransaction(async (client) => {
    const {rows:[rider]}=await client.query(
      "SELECT user_id,delivery_pricing_enabled,delivery_base_fee_gmd,delivery_per_km_fee_gmd,delivery_min_fee_gmd FROM riders WHERE user_id=$1 AND kyc_status='approved' FOR UPDATE",[userId]);
    if(!rider)throw new AppError('Only approved riders can toggle availability.',403,'NOT_APPROVED');
    if(Boolean(isOnline) && (!rider.delivery_pricing_enabled ||
       rider.delivery_base_fee_gmd===null || rider.delivery_per_km_fee_gmd===null || rider.delivery_min_fee_gmd===null)) {
      throw new AppError('Save your delivery prices in Rider Dashboard → Pricing before going online.',409,'DELIVERY_PRICING_REQUIRED');
    }
    if(!isOnline) {
      const {rows:[active]}=await client.query(
        "SELECT d.id FROM deliveries d JOIN orders reserved_order ON reserved_order.id=d.order_id WHERE d.rider_id=$1 AND (d.status IN ('assigned','picked_up','in_transit') OR (d.status='unassigned' AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned'))) LIMIT 1",
        [userId]);
      if(active)throw new AppError(
        'Finish or decline your active delivery before going offline. Keep GPS sharing available so the customer can track this delivery.',
        409,'ACTIVE_DELIVERY_IN_PROGRESS');
    }
    const {rows:[updated]}=await client.query(
      "UPDATE riders SET is_online=$1,location_sharing_enabled=CASE WHEN $1 THEN location_sharing_enabled ELSE FALSE END,"+
      "location_sharing_delivery_id=CASE WHEN $1 THEN location_sharing_delivery_id ELSE NULL END,"+
      "current_lat=CASE WHEN $1 THEN current_lat ELSE NULL END,current_lng=CASE WHEN $1 THEN current_lng ELSE NULL END,"+
      "last_location_at=CASE WHEN $1 THEN last_location_at ELSE NULL END "+
      "WHERE user_id=$2 RETURNING user_id,is_online,kyc_status,location_sharing_enabled",
      [Boolean(isOnline),userId]);
    return updated;
  });
}


// ── LOCATION UPDATE (GPS ping from rider app) ────────────────────────
function distanceMeters(lat1,lng1,lat2,lng2) {
  const toRadians=value=>Number(value)*Math.PI/180;
  const dLat=toRadians(Number(lat2)-Number(lat1));
  const dLng=toRadians(Number(lng2)-Number(lng1));
  const a=Math.sin(dLat/2)**2+
    Math.cos(toRadians(lat1))*Math.cos(toRadians(lat2))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}

// ── LOCATION UPDATE (GPS ping from rider app) ────────────────────────
async function updateLocation(userId, { lat, lng, deliveryId, accuracy }) {
  // With no delivery ID this is an opt-in availability ping. It is only
  // accepted for an approved online rider who has no active delivery.
  if (!deliveryId) {
    const {rows:[updatedRider]}=await query(
      "UPDATE riders SET current_lat=$1,current_lng=$2,last_location_at=now(),location_sharing_enabled=TRUE,location_sharing_delivery_id=NULL "+
      "WHERE user_id=$3 AND is_online=TRUE AND kyc_status='approved' "+
      "AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.rider_id=$3 AND d.status IN ('assigned','picked_up','in_transit')) "+
      "RETURNING user_id",
      [lat,lng,userId]
    );
    if(!updatedRider)throw new AppError(
      'Go online and finish any active delivery before sharing your availability location.',
      409,'RIDER_NOT_AVAILABLE'
    );
    return { sharedForAvailability:true, updatedAt:new Date() };
  }

  // Lock the delivery before changing the rider GPS state. This serializes
  // nearby-arrival checks so repeated location pings create only one alert.
  const result = await withTransaction(async client => {
    const {rows:[delivery]}=await client.query(
      `SELECT d.id,d.order_id,d.rider_id,d.status,o.customer_id,o.order_number,
              COALESCE(d.dropoff_lat,da.latitude) AS dropoff_lat,
              COALESCE(d.dropoff_lng,da.longitude) AS dropoff_lng
       FROM deliveries d
       JOIN orders o ON o.id=d.order_id
       LEFT JOIN delivery_addresses da ON da.id=o.delivery_address_id
       WHERE d.id=$1
       FOR UPDATE OF d`,
      [deliveryId]
    );
    if(!delivery)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    if(String(delivery.rider_id)!==String(userId)){
      throw new AppError('You can only share your location for a delivery assigned to you.',403,'FORBIDDEN');
    }
    if(!['assigned','picked_up','in_transit'].includes(String(delivery.status))){
      throw new AppError('Location updates are only accepted for an active delivery.',409,'DELIVERY_NOT_ACTIVE');
    }

    const {rows:[updatedRider]}=await client.query(
      "UPDATE riders SET current_lat=$1,current_lng=$2,last_location_at=now(),location_sharing_enabled=TRUE,location_sharing_delivery_id=$4 WHERE user_id=$3 AND is_online=TRUE AND kyc_status='approved' RETURNING user_id",
      [lat,lng,userId,deliveryId]
    );
    if(!updatedRider)throw new AppError('Go online before sharing GPS for this delivery.',409,'RIDER_OFFLINE');

    const {rows:[ping]}=await client.query(
      `INSERT INTO rider_location_pings (rider_id, delivery_id, lat, lng)
       VALUES ($1,$2,$3,$4) RETURNING recorded_at`,
      [userId,deliveryId,lat,lng]
    );

    const preciseEnough=accuracy!==undefined&&accuracy!==null&&
      Number.isFinite(Number(accuracy))&&Number(accuracy)>=0&&Number(accuracy)<=120;
    const hasDestination=delivery.dropoff_lat!==null&&delivery.dropoff_lat!==undefined&&
      delivery.dropoff_lng!==null&&delivery.dropoff_lng!==undefined;
    const isNearCustomer=preciseEnough&&hasDestination&&
      ['picked_up','in_transit'].includes(String(delivery.status))&&
      distanceMeters(lat,lng,delivery.dropoff_lat,delivery.dropoff_lng)<=250;

    let arrivalNotification=null;
    if(isNearCustomer){
      const {rows:[existing]}=await client.query(
        "SELECT id FROM notifications WHERE user_id=$1 AND type='rider_arriving' AND reference_type='delivery' AND reference_id=$2 LIMIT 1",
        [delivery.customer_id,deliveryId]
      );
      if(!existing){
        const body='Your MarketLink rider is within about 250 metres of your delivery address. Please get ready to receive your order.';
        const {rows:[created]}=await client.query(
          `INSERT INTO notifications
             (user_id,type,title,body,reference_type,reference_id,channel_inapp,channel_email,channel_sms,channel_push)
           VALUES ($1,'rider_arriving','Your rider is nearby',$2,'delivery',$3,TRUE,FALSE,FALSE,FALSE)
           RETURNING id`,
          [delivery.customer_id,body,deliveryId]
        );
        if(created)arrivalNotification={id:created.id,userId:delivery.customer_id,body};
      }
    }
    return {updatedAt:ping&&ping.recorded_at?ping.recorded_at:new Date(),arrivalNotification};
  });

  if(result.arrivalNotification){
    try{
      const pushResult=await notificationsService.pushToUser(result.arrivalNotification.userId,{
        title:'Your rider is nearby',
        body:result.arrivalNotification.body,
        data:{type:'rider_arriving',deliveryId:String(deliveryId),url:'https://marketlink-gambia-frontend.onrender.com/'}
      });
      if(pushResult&&pushResult.sent){
        await query('UPDATE notifications SET channel_push=TRUE WHERE id=$1',[result.arrivalNotification.id]);
      }
    }catch(pushError){
      logger.warn('Rider arrival push notification could not be delivered',{deliveryId,error:pushError.message});
    }
  }

  return {
    sharedForDelivery:true,
    updatedAt:result.updatedAt,
    arrivalNotified:Boolean(result.arrivalNotification)
  };
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
            o.order_number, o.total AS order_total, o.payment_method, o.status AS order_status,
            p.id AS cod_payment_id, p.amount AS cod_payment_amount,
            ccr.status AS cod_remittance_status,
            ccr.review_note AS cod_remittance_review_note,
            ccr.provider_reference AS cod_remittance_reference,
            ccr.deposit_method AS cod_remittance_method,
            v.business_name AS vendor_name,
            (SELECT ra.status FROM rider_assignments ra
             WHERE ra.delivery_id = d.id AND ra.rider_id = d.rider_id
             ORDER BY ra.created_at DESC LIMIT 1) AS assignment_status,
            COALESCE(re.amount,o.rider_payout,0) AS earning
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     JOIN vendors v ON v.user_id = o.vendor_id
     LEFT JOIN LATERAL (
       SELECT p.id,p.amount,p.status FROM payments p
       WHERE p.order_id=o.id AND p.method='cod'
       ORDER BY p.created_at DESC LIMIT 1
     ) p ON TRUE
     LEFT JOIN cod_cash_remittances ccr ON ccr.payment_id=p.id
     LEFT JOIN LATERAL (
       SELECT amount FROM rider_earnings re
       WHERE re.delivery_id=d.id ORDER BY re.created_at DESC,re.id DESC LIMIT 1
     ) re ON TRUE
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
         AND re.created_at >= now() - ($2 || ' days')::INTERVAL
       ORDER BY re.created_at DESC
       LIMIT $3 OFFSET $4`,
      [riderId, days, limit_, offset]
    ),
  ]);

  return { period, summary: summary.rows[0], entries: entries.rows };
}


/* ── RIDER DELIVERY PRICING ──────────────────────────────────────────
 * Riders own their delivery tariffs. Exact area-to-area prices override
 * their default base + per-kilometre schedule.
 */
async function getDeliveryPricing(userId) {
  const { rows: [rider] } = await query(
    `SELECT delivery_pricing_enabled,delivery_base_fee_gmd,delivery_per_km_fee_gmd,delivery_min_fee_gmd
     FROM riders WHERE user_id=$1`, [userId]
  );
  if (!rider) throw new AppError('Rider profile not found.', 404, 'RIDER_NOT_FOUND');
  const { rows: [policyRow] } = await query(
    "SELECT value FROM system_settings WHERE key=$1", ['delivery_pricing_policy']
  );
  const policy = normaliseDeliveryPricingPolicy(policyRow?.value);
  const { rows: routeRates } = await query(
    `SELECT id,origin_area,destination_area,fixed_fee_gmd,is_active
     FROM rider_delivery_rates WHERE rider_id=$1 ORDER BY origin_area,destination_area`, [userId]
  );
  return {
    enabled: Boolean(rider.delivery_pricing_enabled),
    // New and not-yet-configured riders see the admin's GMD starter tariff.
    // They must still save and enable the tariff before becoming quote-eligible.
    baseFee: rider.delivery_base_fee_gmd == null ? policy.baseFeeGmd : Number(rider.delivery_base_fee_gmd),
    perKmFee: rider.delivery_per_km_fee_gmd == null ? policy.perKmFeeGmd : Number(rider.delivery_per_km_fee_gmd),
    minimumFee: rider.delivery_min_fee_gmd == null ? policy.minimumFeeGmd : Math.max(policy.minimumAllowedFeeGmd, Number(rider.delivery_min_fee_gmd)),
    adminPolicy: policy,
    routeRates: routeRates.map(rate => ({
      id: rate.id,
      originArea: rate.origin_area,
      destinationArea: rate.destination_area,
      fixedFee: Number(rate.fixed_fee_gmd),
      active: Boolean(rate.is_active),
    })),
  };
}

async function updateDeliveryPricing(userId, data = {}) {
  const enabled = data.enabled === undefined ? true : data.enabled === true;
  const baseFee = Number(data.baseFee);
  const perKmFee = Number(data.perKmFee);
  const minimumFee = Number(data.minimumFee);
  const { rows: [policyRow] } = await query(
    "SELECT value FROM system_settings WHERE key=$1", ['delivery_pricing_policy']
  );
  const policy = normaliseDeliveryPricingPolicy(policyRow?.value);
  if (![baseFee, perKmFee, minimumFee].every(Number.isFinite) ||
      baseFee < 0 || baseFee > 2000 || baseFee > policy.maximumFeeGmd ||
      perKmFee < 0 || perKmFee > 500 ||
      minimumFee < policy.minimumAllowedFeeGmd || minimumFee > policy.maximumFeeGmd) {
    throw new AppError(
      'Enter valid GMD rates inside the administrator-approved limits. The current rider defaults are D' +
      policy.baseFeeGmd.toFixed(2) + ' base, D' + policy.perKmFeeGmd.toFixed(2) +
      ' per kilometre and D' + policy.minimumFeeGmd.toFixed(2) + ' minimum.',
      400,
      'INVALID_DELIVERY_PRICING'
    );
  }
  const rawRates = data.routeRates === undefined ? [] : data.routeRates;
  if (!Array.isArray(rawRates) || rawRates.length > 20) {
    throw new AppError('You can save up to 20 fixed pickup-to-destination prices.', 400, 'INVALID_ROUTE_RATES');
  }
  const seen = new Set();
  const routes = rawRates.map((rate, index) => {
    const originArea = String(rate && rate.originArea || '').trim();
    const destinationArea = String(rate && rate.destinationArea || '').trim();
    const fixedFee = Number(rate && rate.fixedFee);
    if (!originArea || !destinationArea || originArea.length > 120 || destinationArea.length > 120 ||
        !Number.isFinite(fixedFee) || fixedFee < policy.minimumAllowedFeeGmd || fixedFee > policy.maximumFeeGmd) {
      throw new AppError(
        'Each saved route needs a pickup area, destination area and a fare between D' +
        policy.minimumAllowedFeeGmd.toFixed(2) + ' and D' + policy.maximumFeeGmd.toFixed(2) + '.',
        400,
        'INVALID_ROUTE_RATE'
      );
    }
    const key = originArea.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ') +
      '|' + destinationArea.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ');
    if (seen.has(key)) throw new AppError('Duplicate pickup-to-destination route on row ' + (index + 1) + '.', 400, 'DUPLICATE_ROUTE_RATE');
    seen.add(key);
    return { originArea, destinationArea, fixedFee: Math.round(fixedFee * 100) / 100 };
  });

  await withTransaction(async client => {
    const { rows: [updated] } = await client.query(
      `UPDATE riders SET delivery_pricing_enabled=$1,delivery_base_fee_gmd=$2,
       delivery_per_km_fee_gmd=$3,delivery_min_fee_gmd=$4,updated_at=now()
       WHERE user_id=$5 RETURNING user_id`,
      [enabled, baseFee, perKmFee, minimumFee, userId]
    );
    if (!updated) throw new AppError('Rider profile not found.', 404, 'RIDER_NOT_FOUND');
    await client.query('DELETE FROM rider_delivery_rates WHERE rider_id=$1', [userId]);
    for (const route of routes) {
      await client.query(
        `INSERT INTO rider_delivery_rates (rider_id,origin_area,destination_area,fixed_fee_gmd)
         VALUES ($1,$2,$3,$4)`,
        [userId, route.originArea, route.destinationArea, route.fixedFee]
      );
    }
  });
  return getDeliveryPricing(userId);
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

// Rider delivery earnings and DAHA wallet credits are settled only by
// ordersService.settleOrderFinancials after payment confirmation and delivery.
module.exports = {
  register, getById, list, updateProfile, setAvailability, updateLocation,
  getDeliveryPricing, updateDeliveryPricing,
  getDeliveryHistory, getEarnings, approve, reject, suspend, reinstate,
};
