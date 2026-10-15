// src/modules/delivery/service.js
'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const ordersService = require('../orders/service');

const VALID_TRANSITIONS = {
  unassigned:  ['assigned','cancelled'],
  assigned:    ['picked_up','cancelled'],
  picked_up:   ['in_transit'],
  in_transit:  ['delivered','failed'],
  delivered:   [],
  failed:      ['assigned'],
  cancelled:   [],
};

async function getById(deliveryId, actorId, roles) {
  const { rows } = await query(
    `SELECT d.*, o.order_number, o.customer_id, o.vendor_id, o.total,
            u.full_name AS rider_name, u.phone AS rider_phone,
            v.business_name AS vendor_name,
            cu.full_name AS customer_name, cu.phone AS customer_phone
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     LEFT JOIN riders r ON r.user_id = d.rider_id
     LEFT JOIN users u ON u.id = r.user_id
     JOIN vendors v ON v.user_id = o.vendor_id
     JOIN users cu ON cu.id = o.customer_id
     WHERE d.id = $1`, [deliveryId]);
  if (!rows.length) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');
  const d = rows[0];
  const isAdmin = (roles||[]).some(r => ['admin','super_admin','moderator'].includes(r));
  if (!isAdmin && d.customer_id !== actorId && d.vendor_id !== actorId && d.rider_id !== actorId)
    throw new AppError('Access denied.', 403, 'FORBIDDEN');
  return d;
}

async function list({ page=1, limit=20, status, riderId, vendorId, isAdmin=false }) {
  const limit_ = Math.min(parseInt(limit)||20, 100);
  const offset = (Math.max(parseInt(page)||1,1)-1) * limit_;
  const conds = [], params = []; let pi = 1;
  if (status)   { conds.push(`d.status = $${pi++}`);   params.push(status); }
  if (riderId)  { conds.push(`d.rider_id = $${pi++}`); params.push(riderId); }
  if (vendorId) { conds.push(`o.vendor_id = $${pi++}`);params.push(vendorId); }
  const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
  const { rows } = await query(
    `SELECT d.id, d.status, d.distance_km, d.estimated_minutes,
            d.picked_up_at, d.delivered_at, d.created_at,
            o.order_number, o.total, o.vendor_id, o.customer_id,
            u.full_name AS rider_name,
            v.business_name AS vendor_name,
            cu.full_name AS customer_name
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     LEFT JOIN users u ON u.id = d.rider_id
     JOIN vendors v ON v.user_id = o.vendor_id
     JOIN users cu ON cu.id = o.customer_id
     ${where}
     ORDER BY d.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]);
  return rows;
}

async function assignRider(deliveryId, riderId, actor) {
  const { rows: [d] } = await query('SELECT d.*,o.vendor_id FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.id = $1', [deliveryId]);
  if (!d) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');
  const actorRoles=actor&&Array.isArray(actor.roles)?actor.roles:[];
  const actorIsAdmin=actorRoles.some(r=>['admin','super_admin','moderator'].includes(r));
  const actorIsVendor=actorRoles.includes('vendor')&&String(d.vendor_id)===String(actor.id);
  if(!actorIsAdmin&&!actorIsVendor)throw new AppError('Only the order’s vendor or an Admin can assign its rider.',403,'FORBIDDEN');
  if (!['unassigned','failed'].includes(d.status))
    throw new AppError(`Cannot assign rider to delivery with status: ${d.status}`, 400, 'INVALID_STATUS');

  const { rows: [rider] } = await query(
    `SELECT user_id FROM riders WHERE user_id = $1 AND kyc_status = 'approved' AND is_online = TRUE`,
    [riderId]);
  if (!rider) throw new AppError('Rider not available or not approved.', 400, 'RIDER_UNAVAILABLE');

  return withTransaction(async (client) => {
    const { rows: [updated] } = await client.query(
      `UPDATE deliveries SET rider_id = $1, status = 'assigned' WHERE id = $2 RETURNING *`,
      [riderId, deliveryId]);
    await client.query(
      `UPDATE orders SET status = 'rider_assigned' WHERE id = $1`, [updated.order_id]);
    await client.query(
      `INSERT INTO rider_assignments (delivery_id, rider_id, assigned_by, assignment_type, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [deliveryId, riderId, actor?.id||null, actor?.isAuto ? 'auto' : 'manual']);
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES ($1,'delivery_assigned','New Delivery Request 🛵',
               'You have a new delivery. Tap to view details.','delivery',$2)`,
      [riderId, deliveryId]);
    logger.info('Rider assigned', { deliveryId, riderId, actor: actor?.id });
    return updated;
  });
}

async function listAvailableRiders(deliveryId, actorId, roles) {
  const {rows:[delivery]}=await query(
    'SELECT d.id,d.status,o.vendor_id,COALESCE(d.pickup_lat,v.latitude) AS pickup_lat,COALESCE(d.pickup_lng,v.longitude) AS pickup_lng FROM deliveries d JOIN orders o ON o.id=d.order_id JOIN vendors v ON v.user_id=o.vendor_id WHERE d.id=$1',
    [deliveryId]
  );
  if(!delivery)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin','moderator'].includes(r));
  if(!isAdmin&&String(delivery.vendor_id)!==String(actorId))throw new AppError('You can only find riders for your own orders.',403,'FORBIDDEN');
  if(!['unassigned','failed','assigned'].includes(delivery.status))throw new AppError('Riders can only be searched before pickup. Refresh the order status and try again.',409,'INVALID_STATUS');
  const hasPickup=delivery.pickup_lat!==null&&delivery.pickup_lng!==null;
  const {rows}=await query(
    'SELECT r.user_id AS id,u.full_name,r.vehicle_type,r.delivery_zone,r.rating_avg,r.rating_count,r.current_lat,r.current_lng,r.last_location_at,CASE WHEN r.current_lat IS NOT NULL AND r.current_lng IS NOT NULL AND $1::boolean THEN 6371*2*ASIN(SQRT(LEAST(1,POWER(SIN(RADIANS(r.current_lat-$2::numeric)/2),2)+COS(RADIANS($2::numeric))*COS(RADIANS(r.current_lat))*POWER(SIN(RADIANS(r.current_lng-$3::numeric)/2),2)))) ELSE NULL END AS distance_km FROM riders r JOIN users u ON u.id=r.user_id WHERE r.kyc_status=$4 AND r.is_online=TRUE ORDER BY distance_km ASC NULLS LAST,r.rating_avg DESC LIMIT 30',
    [hasPickup,delivery.pickup_lat,delivery.pickup_lng,'approved']
  );
  return rows.map(r=>Object.assign({},r,{distance_km:r.distance_km===null?null:Number(Number(r.distance_km).toFixed(1)),location_fresh:!!(r.last_location_at&&Date.now()-new Date(r.last_location_at).getTime()<30*60*1000)}));
}

async function acceptDelivery(deliveryId, riderId) {
  return withTransaction(async (client) => {
    const { rows:[d] } = await client.query('SELECT * FROM deliveries WHERE id=$1 FOR UPDATE',[deliveryId]);
    if(!d) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows:[rider] } = await client.query("SELECT user_id FROM riders WHERE user_id=$1 AND kyc_status='approved'",[riderId]);
    if(!rider) throw new AppError('Only an approved rider can accept a delivery.',403,'RIDER_UNAVAILABLE');
    if(d.status==='assigned' && String(d.rider_id)===String(riderId)) {
      await client.query("UPDATE rider_assignments SET status='accepted',responded_at=now() WHERE delivery_id=$1 AND rider_id=$2 AND status='pending'",[deliveryId,riderId]);
      return d;
    }
    if(d.status!=='unassigned') throw new AppError('This delivery is no longer available.',409,'DELIVERY_NOT_AVAILABLE');
    if(d.rider_id && String(d.rider_id)!==String(riderId)) throw new AppError('This delivery is already assigned.',409,'DELIVERY_NOT_AVAILABLE');
    const { rows:[online] } = await client.query('SELECT user_id FROM riders WHERE user_id=$1 AND is_online=TRUE',[riderId]);
    if(!online) throw new AppError('Go online before accepting an unassigned delivery.',403,'RIDER_OFFLINE');
    const { rows:[updated] } = await client.query("UPDATE deliveries SET rider_id=$1,status='assigned' WHERE id=$2 RETURNING *",[riderId,deliveryId]);
    await client.query("UPDATE orders SET status='rider_assigned' WHERE id=$1",[updated.order_id]);
    await client.query("INSERT INTO rider_assignments (delivery_id,rider_id,assigned_by,assignment_type,status,responded_at) VALUES($1,$2,$2,'self','accepted',now())",[deliveryId,riderId]);
    const { rows:[o] } = await client.query('SELECT customer_id FROM orders WHERE id=$1',[updated.order_id]);
    if(o) await client.query("INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_assigned','Rider Assigned 🛵','A rider has accepted your delivery.','delivery',$2)",[o.customer_id,deliveryId]);
    return updated;
  });
}
async function declineDelivery(deliveryId, riderId) {
  return withTransaction(async (client) => {
    const { rows:[d] } = await client.query('SELECT * FROM deliveries WHERE id=$1 FOR UPDATE',[deliveryId]);
    if(!d) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    if(d.status!=='assigned'||String(d.rider_id)!==String(riderId))
      throw new AppError('You can only decline a delivery assigned to you.',403,'FORBIDDEN');
    await client.query("UPDATE rider_assignments SET status='declined',responded_at=now() WHERE delivery_id=$1 AND rider_id=$2 AND status='pending'",[deliveryId,riderId]);
    const {rows:[updated]}=await client.query("UPDATE deliveries SET rider_id=NULL,status='unassigned' WHERE id=$1 RETURNING *",[deliveryId]);
    await client.query("UPDATE orders SET status='awaiting_rider' WHERE id=$1",[d.order_id]);
    const {rows:[order]}=await client.query('SELECT vendor_id FROM orders WHERE id=$1',[d.order_id]);
    if(order) await client.query("INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_declined','Rider declined delivery','The assigned rider cannot take this delivery. Please choose another rider.','delivery',$2)",[order.vendor_id,deliveryId]);
    return updated;
  });
}
async function updateStatus(deliveryId, newStatus, actorId, roles, extra={}) {
  const { rows: [d] } = await query('SELECT * FROM deliveries WHERE id = $1', [deliveryId]);
  if (!d) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');
  const isAdmin = (roles||[]).some(r => ['admin','super_admin'].includes(r));
  const isRider = d.rider_id === actorId;
  if (!isAdmin && !isRider) throw new AppError('Not authorised.', 403, 'FORBIDDEN');
  const allowed = VALID_TRANSITIONS[d.status] || [];
  if (!allowed.includes(newStatus))
    throw new AppError(`Cannot transition from ${d.status} to ${newStatus}.`, 400, 'INVALID_TRANSITION');

  const now = new Date();
  const updates = ['status = $1']; const params = [newStatus];
  let pi = 2;
  if (newStatus === 'picked_up')  { updates.push(`picked_up_at = $${pi++}`);  params.push(now); }
  if (newStatus === 'delivered')  { updates.push(`delivered_at = $${pi++}`);  params.push(now); }
  if (extra.proofUrl) { updates.push(`proof_of_delivery_url = $${pi++}`); params.push(extra.proofUrl); }
  params.push(deliveryId);

  const result = await withTransaction(async (client) => {
    const { rows: [updated] } = await client.query(
      `UPDATE deliveries SET ${updates.join(', ')} WHERE id = $${pi} RETURNING *`, params);
    // Sync order status
    const orderStatusMap = {
      picked_up: 'picked_up', in_transit: 'on_the_way',
      delivered: 'delivered', cancelled: 'cancelled',
    };
    if (orderStatusMap[newStatus]) {
      await client.query(
        `UPDATE orders SET status = $1 ${newStatus==='delivered'?', delivered_at = now()':''}
         WHERE id = $2`, [orderStatusMap[newStatus], d.order_id]);
    }
    // Notify customer
    const custMsgs = {
      picked_up:  'Your order has been picked up! 📦',
      in_transit: 'Your order is on the way! 🛵',
      delivered:  'Your order has been delivered! ✅',
    };
    if (custMsgs[newStatus]) {
      const { rows: [o] } = await client.query('SELECT customer_id FROM orders WHERE id = $1', [d.order_id]);
      if (o) await client.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,'order',$5)`,
        [o.customer_id, 'delivery_update', 'Order Update', custMsgs[newStatus], d.order_id]);
    }
    return updated;
  });
  if (newStatus === 'delivered') await ordersService.settleOrderFinancials(d.order_id);
  return result;
}

async function getTracking(deliveryId, actorId, roles) {
  const { rows: [d] } = await query(
    `SELECT d.id, d.order_id, d.rider_id, d.status, d.estimated_minutes, d.picked_up_at,
            o.customer_id, o.vendor_id,
            r.current_lat, r.current_lng, r.last_location_at,
            u.full_name AS rider_name,
            (SELECT json_agg(p ORDER BY p.recorded_at DESC) FROM (
               SELECT lat, lng, recorded_at FROM rider_location_pings
               WHERE delivery_id = $1 ORDER BY recorded_at DESC LIMIT 20
             ) p) AS location_trail
     FROM deliveries d
     JOIN orders o ON o.id=d.order_id
     LEFT JOIN riders r ON r.user_id = d.rider_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE d.id = $1`, [deliveryId]);
  if (!d) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin','moderator'].includes(r));
  if (!isAdmin && String(d.customer_id)!==String(actorId) && String(d.vendor_id)!==String(actorId) && String(d.rider_id)!==String(actorId)) {
    throw new AppError('Access denied.',403,'FORBIDDEN');
  }
  delete d.customer_id;
  delete d.vendor_id;
  return d;
}

module.exports = { getById, list, assignRider, listAvailableRiders, acceptDelivery, declineDelivery, updateStatus, getTracking };
