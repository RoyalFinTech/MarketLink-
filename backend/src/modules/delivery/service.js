// src/modules/delivery/service.js
'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const ordersService = require('../orders/service');
const notificationsService = require('../notifications/service');
const { normaliseSmartRiderDispatchPolicy } = require('./dispatchPolicy');

async function getSmartRiderDispatchPolicy() {
  const result=await Promise.resolve(query('SELECT value FROM system_settings WHERE key=$1',['smart_rider_dispatch_policy'])).catch(()=>null);
  const row=result&&result.rows&&result.rows[0];
  return normaliseSmartRiderDispatchPolicy(row&&row.value);
}

const { matchingRouteRate, calculateDeliveryFare } = require('../../utils/deliveryPricing');
const { normaliseDeliveryPricingPolicy, resolveRiderDeliveryTariff, applyDeliveryPricingLimits } = require('../../utils/deliveryPricingPolicy');

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
            r.mobile_number AS rider_mobile_number, r.whatsapp_number AS rider_whatsapp_number,
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
            o.order_number, o.total, o.vendor_id, o.customer_id, o.payment_method,
            p.id AS cod_payment_id, p.amount AS cod_payment_amount,
            ccr.status AS cod_remittance_status,
            u.full_name AS rider_name,
            v.business_name AS vendor_name,
            cu.full_name AS customer_name
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     LEFT JOIN payments p ON p.order_id=o.id AND p.method='cod'
     LEFT JOIN cod_cash_remittances ccr ON ccr.payment_id=p.id
     LEFT JOIN users u ON u.id = d.rider_id
     JOIN vendors v ON v.user_id = o.vendor_id
     JOIN users cu ON cu.id = o.customer_id
     ${where}
     ORDER BY d.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
    [...params, limit_, offset]);
  return rows;
}

async function assertRiderMatchesLockedQuote(client, orderId, riderId) {
  const { rows: [locked] } = await client.query(
    `SELECT o.delivery_fee,o.delivery_fee_quote_id,q.rider_id AS quoted_rider_id,
            q.origin_area,q.destination_area,q.route_distance_km
     FROM orders o
     LEFT JOIN delivery_fee_quotes q ON q.id=o.delivery_fee_quote_id
     WHERE o.id=$1`,
    [orderId]
  );
  if (!locked || !locked.delivery_fee_quote_id) return { fee: null, locked: false };
  // The rider originally selected by the customer must receive the exact
  // stored quote even if they later adjust their future tariff settings.
  if (String(locked.quoted_rider_id) === String(riderId)) {
    return { fee: Number(locked.delivery_fee), locked: true };
  }
  const { rows: [rider] } = await client.query(
    `SELECT delivery_pricing_enabled,delivery_base_fee_gmd,delivery_per_km_fee_gmd,delivery_min_fee_gmd,
            admin_delivery_pricing_override
     FROM riders WHERE user_id=$1`,
    [riderId]
  );
  const { rows: [policyRow] } = await client.query("SELECT value FROM system_settings WHERE key=$1", ['delivery_pricing_policy']);
  const policy = normaliseDeliveryPricingPolicy(policyRow?.value);
  const { rows: lanes } = await client.query(
    'SELECT origin_area,destination_area,fixed_fee_gmd FROM rider_delivery_rates WHERE rider_id=$1 AND is_active=TRUE',
    [riderId]
  );
  const effective = resolveRiderDeliveryTariff(rider, lanes, policy);
  if (!effective.enabled) {
    throw new AppError('This order already has a customer-approved delivery price. Only a rider who is enabled and accepts that same delivery fare can be assigned.',409,'DELIVERY_FEE_MISMATCH');
  }
  const lane = matchingRouteRate(effective.routeRates, locked.origin_area, locked.destination_area);
  let fare;
  try {
    fare = applyDeliveryPricingLimits(calculateDeliveryFare({
      fixedFee: lane ? (lane.fixed_fee_gmd ?? lane.fixedFeeGmd) : null,
      baseFee: effective.baseFeeGmd,
      perKmFee: effective.perKmFeeGmd,
      minimumFee: effective.minimumFeeGmd,
      distanceKm: locked.route_distance_km,
    }), policy);
  } catch (error) {
    throw new AppError('The replacement rider has not configured a valid fare for this route.',409,'DELIVERY_FEE_MISMATCH');
  }
  if (Math.abs(fare - Number(locked.delivery_fee)) > 0.01) {
    throw new AppError(
      'This order has already been paid using a locked delivery fee of D' + Number(locked.delivery_fee).toFixed(2) +
      '. Choose a rider who accepts that same price or request a new customer-approved quote.',
      409,'DELIVERY_FEE_MISMATCH'
    );
  }
  return { fee: fare, locked: true };
}

async function assignRider(deliveryId, riderId, actor) {
  const dispatchPolicy=await getSmartRiderDispatchPolicy();
  return withTransaction(async (client) => {
    // Follow the global lock order: order first, delivery second. This
    // prevents a vendor assignment racing with the "ready for rider" update.
    const { rows: [snapshot] } = await client.query(
      'SELECT order_id FROM deliveries WHERE id=$1',[deliveryId]
    );
    if(!snapshot)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows: [order] } = await client.query(
      'SELECT vendor_id,status,delivery_fee_quote_id FROM orders WHERE id=$1 FOR UPDATE',
      [snapshot.order_id]
    );
    if(!order)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    if(order.delivery_fee_quote_id&&!['awaiting_rider','rider_assigned'].includes(String(order.status))){
      throw new AppError('The vendor must mark this order ready before assigning its quoted rider.',409,'DELIVERY_NOT_READY');
    }
    const { rows: [d] } = await client.query(
      'SELECT * FROM deliveries WHERE id=$1 AND order_id=$2 FOR UPDATE',
      [deliveryId,snapshot.order_id]
    );
    if (!d) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    d.vendor_id=order.vendor_id;

    const actorRoles=actor&&Array.isArray(actor.roles)?actor.roles:[];
    const actorIsAdmin=actorRoles.some(r=>['admin','super_admin','moderator'].includes(r));
    const actorIsVendor=actorRoles.includes('vendor')&&String(d.vendor_id)===String(actor.id);
    if(!actorIsAdmin&&!actorIsVendor)throw new AppError('Only the order’s vendor or an Admin can assign its rider.',403,'FORBIDDEN');
    if (!['unassigned','failed'].includes(d.status)) {
      throw new AppError(`Cannot assign rider to delivery with status: ${d.status}`, 409, 'INVALID_STATUS');
    }

    // The rider row lock serializes competing assignments and online/offline
    // location updates for this rider.
    const { rows: [lockedRider] } = await client.query(
      "SELECT user_id FROM riders WHERE user_id=$1 AND kyc_status='approved' AND is_online=TRUE FOR UPDATE",
      [riderId]
    );
    if(!lockedRider)throw new AppError('Rider not available or not approved.',400,'RIDER_UNAVAILABLE');
    await assertRiderMatchesLockedQuote(client,d.order_id,riderId);

    const {rows:[busy]}=await client.query(
      "SELECT d.id FROM deliveries d JOIN orders reserved_order ON reserved_order.id=d.order_id WHERE d.rider_id=$1 AND d.id<>$2 AND (d.status IN ('assigned','picked_up','in_transit') OR (d.status='unassigned' AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned'))) LIMIT 1",
      [riderId,deliveryId]
    );
    if(busy)throw new AppError('This rider already has an active delivery. Choose another available rider.',409,'RIDER_HAS_ACTIVE_DELIVERY');

    if(d.rider_id)await client.query(
      "UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE user_id=$1 AND location_sharing_delivery_id=$2",
      [d.rider_id,deliveryId]
    );
    const { rows: [updated] } = await client.query(
      "UPDATE deliveries SET rider_id=$1,status='assigned',next_auto_dispatch_at=NULL WHERE id=$2 AND status IN ('unassigned','failed') RETURNING *",
      [riderId, deliveryId]
    );
    if(!updated)throw new AppError('This delivery has already been assigned. Refresh the order and choose again.',409,'DELIVERY_ALREADY_ASSIGNED');

    await client.query("UPDATE orders SET status='rider_assigned' WHERE id=$1",[updated.order_id]);
    await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'rider_assigned',$2)",[updated.order_id,actor?.isAuto?'MarketLink automatically sent a rider request.':'Vendor assigned a rider; awaiting rider acceptance.']);
    await client.query(
      `INSERT INTO rider_assignments (delivery_id, rider_id, assigned_by, assignment_type, status, response_deadline_at)
       VALUES ($1,$2,$3,$4,'pending',$5)`,
      [deliveryId, riderId, actor?.id||null, actor?.isAuto ? 'auto' : 'manual', new Date(Date.now()+dispatchPolicy.responseDeadlineSeconds*1000)]
    );
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES ($1,'delivery_assigned','New Delivery Request 🛵',
               'You have a new delivery. Tap to view details.','delivery',$2)`,
      [riderId, deliveryId]
    );
    await client.query(
      `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
       VALUES ($1,'delivery_assignment_sent','Rider request sent 🛵',$2,'delivery',$3)`,
      [order.vendor_id, 'A delivery request was sent to a rider. MarketLink will remind them and find a replacement if they do not respond in time.', deliveryId]
    );
    logger.info('Rider assigned', { deliveryId, riderId, actor: actor?.id });
    return updated;
  });
}

async function listAvailableRiders(deliveryId, actorId, roles) {
  const {rows:[delivery]}=await query(
    'SELECT d.id,d.order_id,d.status,d.distance_km,o.vendor_id,o.delivery_fee,o.delivery_fee_quote_id,o.status AS order_status,COALESCE(d.pickup_lat,v.latitude) AS pickup_lat,COALESCE(d.pickup_lng,v.longitude) AS pickup_lng FROM deliveries d JOIN orders o ON o.id=d.order_id JOIN vendors v ON v.user_id=o.vendor_id WHERE d.id=$1',
    [deliveryId]
  );
  if(!delivery)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin','moderator'].includes(r));
  if(!isAdmin&&String(delivery.vendor_id)!==String(actorId))throw new AppError('You can only find riders for your own orders.',403,'FORBIDDEN');
  if(!['unassigned','failed'].includes(delivery.status))throw new AppError('Riders can only be searched before pickup and before assignment. Refresh the order status and try again.',409,'INVALID_STATUS');
  if(delivery.delivery_fee_quote_id&&!['awaiting_rider','rider_assigned'].includes(String(delivery.order_status)))throw new AppError('The vendor must mark this order ready before searching for a replacement rider.',409,'DELIVERY_NOT_READY');
  const hasPickup=delivery.pickup_lat!==null&&delivery.pickup_lng!==null;
  const {rows}=await query(
    "SELECT r.user_id AS id,u.full_name,r.vehicle_type,r.delivery_zone,r.rating_avg,r.rating_count,r.delivery_pricing_enabled,r.delivery_base_fee_gmd,r.delivery_per_km_fee_gmd,r.delivery_min_fee_gmd,r.admin_delivery_pricing_override,"+
    "CASE WHEN r.location_sharing_enabled=TRUE "+
      "AND (r.location_sharing_delivery_id=$4 OR r.location_sharing_delivery_id IS NULL) "+
      "AND r.last_location_at >= now()-interval '5 minutes' "+
      "THEN r.last_location_at ELSE NULL END AS last_location_at,"+
    "CASE WHEN $1::boolean AND r.location_sharing_enabled=TRUE "+
      "AND (r.location_sharing_delivery_id=$4 OR r.location_sharing_delivery_id IS NULL) "+
      "AND r.last_location_at >= now()-interval '5 minutes' "+
      "AND r.current_lat IS NOT NULL AND r.current_lng IS NOT NULL "+
      "THEN 6371*2*ASIN(SQRT(LEAST(1,"+
        "POWER(SIN(RADIANS(r.current_lat-$2::numeric)/2),2)+"+
        "COS(RADIANS($2::numeric))*COS(RADIANS(r.current_lat))*"+
        "POWER(SIN(RADIANS(r.current_lng-$3::numeric)/2),2)))) "+
      "ELSE NULL END AS distance_km "+
    "FROM riders r JOIN users u ON u.id=r.user_id "+
    "WHERE r.kyc_status=$5 AND r.is_online=TRUE AND (r.delivery_pricing_enabled=TRUE OR r.admin_delivery_pricing_override IS NOT NULL) "+
    "AND NOT EXISTS (SELECT 1 FROM deliveries active JOIN orders reserved_order ON reserved_order.id=active.order_id WHERE active.rider_id=r.user_id AND (active.status IN ('assigned','picked_up','in_transit') OR (active.status='unassigned' AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned')))) "+
    "AND NOT EXISTS (SELECT 1 FROM rider_assignments declined WHERE declined.delivery_id=$4 AND declined.rider_id=r.user_id AND declined.status IN ('declined','reassigned')) "+
    "ORDER BY distance_km ASC NULLS LAST,r.rating_avg DESC LIMIT 30",
    [hasPickup,delivery.pickup_lat,delivery.pickup_lng,deliveryId,'approved']
  );
  // If this order has a customer-approved delivery quote, vendors may only
  // reassign it to another online rider whose tariff is exactly the same.
  let candidates = rows;
  let lockedQuote = null;
  if (delivery.delivery_fee_quote_id) {
    const { rows: [quote] } = await query(
      `SELECT origin_area,destination_area,route_distance_km,delivery_fee_gmd
       FROM delivery_fee_quotes WHERE id=$1`,
      [delivery.delivery_fee_quote_id]
    );
    lockedQuote = quote || null;
    if (lockedQuote) {
      const { rows: [policyRow] } = await query("SELECT value FROM system_settings WHERE key=$1", ['delivery_pricing_policy']);
      const policy = normaliseDeliveryPricingPolicy(policyRow?.value);
      const { rows: lanes } = await query(
        'SELECT rider_id,origin_area,destination_area,fixed_fee_gmd FROM rider_delivery_rates WHERE rider_id=ANY($1::uuid[]) AND is_active=TRUE',
        [rows.map(row=>row.id)]
      );
      const laneMap = new Map();
      for (const lane of lanes) {
        if (!laneMap.has(lane.rider_id)) laneMap.set(lane.rider_id, []);
        laneMap.get(lane.rider_id).push(lane);
      }
      candidates = rows.filter(r => {
        const effective = resolveRiderDeliveryTariff(r, laneMap.get(r.id) || [], policy);
        if (!effective.enabled) return false;
        const lane = matchingRouteRate(effective.routeRates, lockedQuote.origin_area, lockedQuote.destination_area);
        try {
          const fare = applyDeliveryPricingLimits(calculateDeliveryFare({
            fixedFee: lane ? (lane.fixed_fee_gmd ?? lane.fixedFeeGmd) : null,
            baseFee: effective.baseFeeGmd,
            perKmFee: effective.perKmFeeGmd,
            minimumFee: effective.minimumFeeGmd,
            distanceKm: lockedQuote.route_distance_km,
          }), policy);
          return Math.abs(fare - Number(lockedQuote.delivery_fee_gmd)) <= 0.01;
        } catch (error) { return false; }
      });
    }
  }
  // Return only approximate rider-to-pickup distance. Exact GPS stays server-side.
  return candidates.map(r=>Object.assign({},r,{
    distance_km:r.distance_km===null?null:Number(Number(r.distance_km).toFixed(1)),
    delivery_fee: lockedQuote ? Number(lockedQuote.delivery_fee_gmd) : Number(delivery.delivery_fee || 0),
    location_fresh:!!(r.last_location_at&&Date.now()-new Date(r.last_location_at).getTime()<5*60*1000)
  }));
}

async function acceptDelivery(deliveryId, riderId) {
  const dispatchPolicy=await getSmartRiderDispatchPolicy();
  return withTransaction(async (client) => {
    // Keep the lock order consistent with order status updates: order first,
    // then delivery, then rider. This avoids deadlocks during cancellation
    // or when the vendor marks an order ready at the same time.
    const { rows: [snapshot] } = await client.query(
      'SELECT order_id FROM deliveries WHERE id=$1', [deliveryId]
    );
    if (!snapshot) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows: [order] } = await client.query(
      'SELECT id,status,customer_id,vendor_id,order_number FROM orders WHERE id=$1 FOR UPDATE',
      [snapshot.order_id]
    );
    if (!order) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    if (!['awaiting_rider','rider_assigned'].includes(String(order.status))) {
      throw new AppError('The vendor has not marked this order ready for a rider yet. You will receive the request when it is ready.',409,'DELIVERY_NOT_READY');
    }
    const { rows:[d] } = await client.query(
      'SELECT * FROM deliveries WHERE id=$1 AND order_id=$2 FOR UPDATE',
      [deliveryId,snapshot.order_id]
    );
    if(!d)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows:[rider] } = await client.query(
      "SELECT user_id,is_online FROM riders WHERE user_id=$1 AND kyc_status='approved' FOR UPDATE",
      [riderId]
    );
    if(!rider) throw new AppError('Only an approved rider can accept a delivery.',403,'RIDER_UNAVAILABLE');
    if(!rider.is_online) throw new AppError('Go online before accepting a delivery.',403,'RIDER_OFFLINE');
    const {rows:[busy]}=await client.query(
      "SELECT d.id FROM deliveries d JOIN orders reserved_order ON reserved_order.id=d.order_id WHERE d.rider_id=$1 AND d.id<>$2 AND (d.status IN ('assigned','picked_up','in_transit') OR (d.status='unassigned' AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned'))) LIMIT 1",
      [riderId,deliveryId]
    );
    if(busy)throw new AppError('You already have an active delivery. Complete it before accepting another request.',409,'RIDER_HAS_ACTIVE_DELIVERY');
    await assertRiderMatchesLockedQuote(client,d.order_id,riderId);

    if(d.status!=='assigned' || String(d.rider_id)!==String(riderId)) {
      throw new AppError('This delivery is not assigned to your rider account. Ask the vendor to assign it first.',409,'DELIVERY_NOT_AVAILABLE');
    }
    const { rows:[assignment] } = await client.query(
      "UPDATE rider_assignments SET status='accepted',responded_at=now(),pickup_deadline_at=now()+($3::int * interval '1 second'),pickup_reminder_sent_at=NULL WHERE delivery_id=$1 AND rider_id=$2 AND status='pending' AND (response_deadline_at IS NULL OR response_deadline_at>now()) RETURNING id",
      [deliveryId,riderId,dispatchPolicy.pickupDeadlineSeconds]
    );
    if(!assignment) {
      const { rows:[alreadyAccepted] } = await client.query(
        "SELECT id FROM rider_assignments WHERE delivery_id=$1 AND rider_id=$2 AND status='accepted' AND (pickup_deadline_at IS NULL OR pickup_deadline_at>now()) LIMIT 1",
        [deliveryId,riderId]
      );
      if(!alreadyAccepted)throw new AppError('This rider request has already expired or been reassigned.',409,'DELIVERY_ASSIGNMENT_EXPIRED');
    }
    if(order.status==='awaiting_rider') {
      await client.query("UPDATE orders SET status='rider_assigned' WHERE id=$1",[order.id]);
      await client.query(
        "INSERT INTO order_status_history (order_id,status,note) VALUES($1,'rider_assigned','The selected rider accepted the customer-approved delivery price.')",
        [order.id]
      );
    }
    await client.query(
      `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
       VALUES ($1,'delivery_accepted','Rider confirmed 🛵','Your selected rider has accepted the delivery request.','delivery',$2)`,
      [order.customer_id,deliveryId]
    );
    await client.query(
      `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
       VALUES ($1,'delivery_accepted','Rider confirmed 🛵','The selected rider has accepted order '+$2+'.','delivery',$3)`,
      [order.vendor_id,order.order_number,deliveryId]
    );
    return d;
  });
}
async function declineDelivery(deliveryId, riderId) {
  return withTransaction(async (client) => {
    // Preserve the same lock order used by vendor status updates, assignment
    // and rider acceptance: order first, delivery second.
    const { rows:[snapshot] } = await client.query(
      'SELECT order_id FROM deliveries WHERE id=$1',[deliveryId]
    );
    if(!snapshot)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows:[order] } = await client.query(
      'SELECT id,status,vendor_id FROM orders WHERE id=$1 FOR UPDATE',[snapshot.order_id]
    );
    if(!order)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    const { rows:[d] } = await client.query(
      'SELECT * FROM deliveries WHERE id=$1 AND order_id=$2 FOR UPDATE',
      [deliveryId,snapshot.order_id]
    );
    if(!d)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    if(d.status!=='assigned'||String(d.rider_id)!==String(riderId))
      throw new AppError('You can only decline a delivery assigned to you.',403,'FORBIDDEN');
    await client.query(
      "UPDATE rider_assignments SET status='declined',responded_at=now() WHERE delivery_id=$1 AND rider_id=$2 AND status='pending'",
      [deliveryId,riderId]
    );
    await client.query(
      "UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE user_id=$1 AND location_sharing_delivery_id=$2",
      [riderId,deliveryId]
    );
    const { rows:[updated] } = await client.query(
      "UPDATE deliveries SET rider_id=NULL,status='unassigned' WHERE id=$1 RETURNING *",
      [deliveryId]
    );
    await client.query(
      "UPDATE orders SET status='awaiting_rider' WHERE id=$1",
      [d.order_id]
    );
    await client.query(
      "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_declined','Rider declined delivery','The assigned rider cannot take this delivery. Please choose another rider.','delivery',$2)",
      [order.vendor_id,deliveryId]
    );
    return updated;
  });
}

async function dispatchNextRider(deliveryId, vendorId, orderNumber, notifyNoRider=true, options={}) {
  const policy=await getSmartRiderDispatchPolicy();
  if(options.automatic){
    const {rows:[current]}=await query(
      'SELECT auto_dispatch_attempts FROM deliveries WHERE id=$1 AND status=$2',
      [deliveryId,'unassigned']
    ).catch(()=>({rows:[]}));
    if(!current)return {assigned:false,reason:'DELIVERY_NOT_UNASSIGNED'};
    const attempts=Number(current.auto_dispatch_attempts||0);
    if(policy.maxAutoDispatchAttempts>0&&attempts>=policy.maxAutoDispatchAttempts){
      await query("UPDATE deliveries SET next_auto_dispatch_at=NULL WHERE id=$1 AND status='unassigned'",[deliveryId]).catch(()=>null);
      await notificationsService.send({
        userId:vendorId,type:'delivery_auto_search_paused',title:'Automatic rider search paused',
        body:'MarketLink reached the configured automatic rider-search limit. An Admin or vendor must review this order and request another rider.',
        referenceType:'delivery',referenceId:deliveryId,channels:{push:true,data:{deliveryId:String(deliveryId)}}
      }).catch(()=>null);
      return {assigned:false,reason:'MAX_AUTO_SEARCH_ATTEMPTS'};
    }
    await query("UPDATE deliveries SET auto_dispatch_attempts=COALESCE(auto_dispatch_attempts,0)+1 WHERE id=$1 AND status='unassigned'",[deliveryId]).catch(()=>null);
  }
  let candidates = [];
  try { candidates = await listAvailableRiders(deliveryId, vendorId, ['vendor']); }
  catch (error) { logger.error('Automatic rider search failed', {deliveryId,error:error.message}); }
  for (const candidate of candidates) {
    try {
      const assigned = await assignRider(deliveryId, candidate.id, {id:null,roles:['admin'],isAuto:true});
      await notificationsService.pushToUser(candidate.id, {
        title:'New delivery request 🛵',
        body:'MarketLink has selected you for order '+(orderNumber||'')+'. Please accept promptly.',
        data:{deliveryId:String(deliveryId)}
      }).catch(()=>null);
      await notificationsService.send({
        userId:vendorId,type:'delivery_auto_reassigned',title:'MarketLink selected another rider',
        body:'A new rider request has been sent for order '+(orderNumber||'')+'. The rider has '+policy.responseDeadlineSeconds+' seconds to respond.',
        referenceType:'delivery',referenceId:deliveryId,channels:{push:true,data:{deliveryId:String(deliveryId)}}
      }).catch(()=>null);
      return {assigned:true,riderId:candidate.id,delivery:assigned};
    } catch (error) {
      if (!['RIDER_UNAVAILABLE','RIDER_HAS_ACTIVE_DELIVERY','DELIVERY_FEE_MISMATCH','DELIVERY_ALREADY_ASSIGNED','INVALID_STATUS'].includes(error.code)) {
        logger.warn('Automatic rider candidate could not be assigned', {deliveryId,riderId:candidate.id,code:error.code||null});
      }
    }
  }
  await query("UPDATE deliveries SET next_auto_dispatch_at=now()+($2::int * interval '1 second') WHERE id=$1 AND status='unassigned'",[deliveryId,policy.retrySearchIntervalSeconds]).catch(()=>null);
  if(notifyNoRider) await notificationsService.send({
    userId:vendorId,type:'delivery_no_rider_available',title:'No replacement rider available yet',
    body:'MarketLink could not find an available rider matching this order’s approved delivery price. Your order remains ready; the system will search again automatically.',
    referenceType:'delivery',referenceId:deliveryId,channels:{push:true,data:{deliveryId:String(deliveryId)}}
  }).catch(()=>null);
  return {assigned:false,reason:'NO_AVAILABLE_RIDER'};
}

async function reassignDelivery(deliveryId, actor) {
  const dispatchPolicy=await getSmartRiderDispatchPolicy();
  const released = await withTransaction(async client => {
    const {rows:[snapshot]} = await client.query('SELECT order_id FROM deliveries WHERE id=$1',[deliveryId]);
    if(!snapshot)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const {rows:[order]} = await client.query('SELECT id,vendor_id,status,order_number FROM orders WHERE id=$1 FOR UPDATE',[snapshot.order_id]);
    if(!order)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    const {rows:[delivery]} = await client.query('SELECT * FROM deliveries WHERE id=$1 AND order_id=$2 FOR UPDATE',[deliveryId,snapshot.order_id]);
    if(!delivery)throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const roles=actor&&Array.isArray(actor.roles)?actor.roles:[];
    const admin=roles.some(role=>['admin','super_admin','moderator'].includes(role));
    if(!admin&&(!roles.includes('vendor')||String(order.vendor_id)!==String(actor.id)))throw new AppError('Only this order’s vendor or an Admin can request another rider.',403,'FORBIDDEN');
    if(delivery.status!=='assigned'||!delivery.rider_id)throw new AppError('A rider can only be replaced before pickup while the delivery is assigned.',409,'DELIVERY_NOT_REASSIGNABLE');
    const oldRiderId=delivery.rider_id;
    await client.query(
      "UPDATE rider_assignments SET status='reassigned',responded_at=COALESCE(responded_at,now()) WHERE delivery_id=$1 AND rider_id=$2 AND status IN ('pending','accepted')",
      [deliveryId,oldRiderId]
    );
    await client.query(
      "UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE user_id=$1 AND location_sharing_delivery_id=$2",
      [oldRiderId,deliveryId]
    );
    const {rows:[updated]}=await client.query(
      "UPDATE deliveries SET rider_id=NULL,status='unassigned',next_auto_dispatch_at=now()+($3::int * interval '1 second') WHERE id=$1 AND status='assigned' AND rider_id=$2 RETURNING *",
      [deliveryId,oldRiderId,dispatchPolicy.reassignDelaySeconds]
    );
    if(!updated)throw new AppError('This rider has already started or the delivery has changed. Refresh the order.',409,'DELIVERY_STATE_CHANGED');
    await client.query("UPDATE orders SET status='awaiting_rider' WHERE id=$1",[order.id]);
    await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'awaiting_rider','Previous rider released before pickup; MarketLink is searching for a replacement.')",[order.id]);
    await client.query(
      "INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_reassigned','Delivery request reassigned','The vendor or MarketLink has moved this delivery request to another rider. You are no longer assigned to it.','delivery',$2)",
      [oldRiderId,deliveryId]
    );
    await client.query(
      "INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_reassigned','Finding another rider','The previous rider has been released. MarketLink is searching for an available replacement now.','delivery',$2)",
      [order.vendor_id,deliveryId]
    );
    return {vendorId:order.vendor_id,oldRiderId,orderNumber:order.order_number};
  });
  const result=await dispatchNextRider(deliveryId,released.vendorId,released.orderNumber,true);
  return {deliveryId,releasedRiderId:released.oldRiderId,...result};
}

async function processDispatchTimers() {
  const policy=await getSmartRiderDispatchPolicy();
  if(!policy.automationEnabled)return {processed:0,disabled:true};
  const actions = await withTransaction(async client => {
    const {rows:[lock]}=await client.query('SELECT pg_try_advisory_xact_lock(8100420261126) AS locked');
    if(!lock||!lock.locked)return [];
    const {rows}=await client.query(
      `SELECT ra.id,ra.delivery_id,ra.rider_id,ra.status,ra.created_at,ra.responded_at,
              ra.response_deadline_at,ra.pickup_deadline_at,ra.reminder_1_sent_at,
              ra.reminder_2_sent_at,ra.pickup_reminder_sent_at,d.order_id,
              o.vendor_id,o.order_number
       FROM rider_assignments ra
       JOIN deliveries d ON d.id=ra.delivery_id AND d.rider_id=ra.rider_id
       JOIN orders o ON o.id=d.order_id
       WHERE d.status='assigned' AND (
         (ra.status='pending' AND (
           ($1::boolean AND ra.response_deadline_at<=now()) OR
           ($2::boolean AND (ra.response_deadline_at IS NULL OR ra.response_deadline_at>now()) AND ra.reminder_1_sent_at IS NULL AND ra.created_at<=now()-($3::int * interval '1 second')) OR
           ($2::boolean AND (ra.response_deadline_at IS NULL OR ra.response_deadline_at>now()) AND ra.reminder_2_sent_at IS NULL AND ra.created_at<=now()-($4::int * interval '1 second'))
         )) OR
         (ra.status='accepted' AND (
           ($1::boolean AND ra.pickup_deadline_at<=now()) OR
           ($2::boolean AND (ra.pickup_deadline_at IS NULL OR ra.pickup_deadline_at>now()) AND ra.pickup_reminder_sent_at IS NULL AND ra.responded_at<=now()-($5::int * interval '1 second'))
         ))
       )
       ORDER BY COALESCE(ra.response_deadline_at,ra.pickup_deadline_at,ra.created_at) ASC
       LIMIT 25 FOR UPDATE OF o,d,ra SKIP LOCKED`,
      [policy.autoReassignEnabled,policy.remindersEnabled,policy.firstReminderSeconds,policy.secondReminderSeconds,policy.pickupReminderSeconds]
    );
    const out=[];
    for(const row of rows){
      const expired=policy.autoReassignEnabled&&(
        (row.status==='pending'&&row.response_deadline_at&&new Date(row.response_deadline_at)<=new Date())||
        (row.status==='accepted'&&row.pickup_deadline_at&&new Date(row.pickup_deadline_at)<=new Date())
      );
      if(expired){
        await client.query("UPDATE rider_assignments SET status='reassigned',responded_at=COALESCE(responded_at,now()) WHERE id=$1 AND status IN ('pending','accepted')",[row.id]);
        const {rows:[released]}=await client.query(
          "UPDATE deliveries SET rider_id=NULL,status='unassigned',next_auto_dispatch_at=now()+($3::int * interval '1 second') WHERE id=$1 AND status='assigned' AND rider_id=$2 RETURNING id",
          [row.delivery_id,row.rider_id,policy.reassignDelaySeconds]
        );
        if(!released)continue;
        await client.query("UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE user_id=$1 AND location_sharing_delivery_id=$2",[row.rider_id,row.delivery_id]);
        await client.query("UPDATE orders SET status='awaiting_rider' WHERE id=$1",[row.order_id]);
        await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'awaiting_rider','Rider deadline expired before pickup; MarketLink is searching for a replacement.')",[row.order_id]);
        await client.query("INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_timeout','Delivery request expired','The MarketLink delivery timer expired and this order has been released for reassignment.','delivery',$2)",[row.rider_id,row.delivery_id]);
        await client.query("INSERT INTO notifications(user_id,type,title,body,reference_type,reference_id) VALUES($1,'delivery_timeout','Rider deadline missed','The rider deadline expired. MarketLink is automatically searching for another available rider.','delivery',$2)",[row.vendor_id,row.delivery_id]);
        out.push({kind:'reassign',deliveryId:row.delivery_id,riderId:row.rider_id,vendorId:row.vendor_id,orderNumber:row.order_number});
      } else if(policy.remindersEnabled&&row.status==='pending'&&!row.reminder_1_sent_at&&new Date(row.created_at)<=new Date(Date.now()-policy.firstReminderSeconds*1000)){
        await client.query('UPDATE rider_assignments SET reminder_1_sent_at=now() WHERE id=$1 AND reminder_1_sent_at IS NULL',[row.id]);
        out.push({kind:'reminder',riderId:row.rider_id,deliveryId:row.delivery_id,title:'Delivery request reminder',body:'You have a pending MarketLink delivery request. Please accept or decline it now.'});
      } else if(policy.remindersEnabled&&row.status==='pending'&&!row.reminder_2_sent_at&&new Date(row.created_at)<=new Date(Date.now()-policy.secondReminderSeconds*1000)){
        await client.query('UPDATE rider_assignments SET reminder_2_sent_at=now() WHERE id=$1 AND reminder_2_sent_at IS NULL',[row.id]);
        out.push({kind:'reminder',riderId:row.rider_id,deliveryId:row.delivery_id,title:'Final reminder: delivery request',body:'This delivery request is nearly expired. Accept now if you can complete the pickup on time.'});
      } else if(policy.remindersEnabled&&row.status==='accepted'&&!row.pickup_reminder_sent_at&&row.responded_at&&new Date(row.responded_at)<=new Date(Date.now()-policy.pickupReminderSeconds*1000)){
        await client.query('UPDATE rider_assignments SET pickup_reminder_sent_at=now() WHERE id=$1 AND pickup_reminder_sent_at IS NULL',[row.id]);
        out.push({kind:'reminder',riderId:row.rider_id,deliveryId:row.delivery_id,title:'Pickup time reminder',body:'You accepted this delivery. Please proceed to the vendor and confirm pickup promptly.'});
        out.push({kind:'vendor_reminder',vendorId:row.vendor_id,deliveryId:row.delivery_id,title:'Rider pickup reminder',body:'Your assigned rider has not confirmed pickup yet. You can request another rider if they cannot arrive in time.'});
      }
    }
    if(policy.autoSearchEnabled){
      const {rows:retryRows}=await client.query(
        `SELECT d.id AS delivery_id,o.vendor_id,o.order_number
         FROM deliveries d JOIN orders o ON o.id=d.order_id
         WHERE d.status='unassigned' AND o.status='awaiting_rider'
           AND d.next_auto_dispatch_at IS NOT NULL AND d.next_auto_dispatch_at<=now()
         ORDER BY d.next_auto_dispatch_at ASC
         LIMIT 10 FOR UPDATE OF o,d SKIP LOCKED`
      );
      for(const row of retryRows){
        await client.query("UPDATE deliveries SET next_auto_dispatch_at=now()+($2::int * interval '1 second') WHERE id=$1 AND status='unassigned'",[row.delivery_id,policy.retrySearchIntervalSeconds]);
        out.push({kind:'search',deliveryId:row.delivery_id,vendorId:row.vendor_id,orderNumber:row.order_number});
      }
    }
    return out;
  });
  for(const action of actions){
    if(action.kind==='reminder'){
      await notificationsService.send({userId:action.riderId,type:'delivery_reminder',title:action.title,body:action.body,referenceType:'delivery',referenceId:action.deliveryId,channels:{push:true,data:{deliveryId:String(action.deliveryId)}}}).catch(()=>null);
    }else if(action.kind==='vendor_reminder'){
      await notificationsService.send({userId:action.vendorId,type:'delivery_pickup_delay',title:action.title,body:action.body,referenceType:'delivery',referenceId:action.deliveryId,channels:{push:true,data:{deliveryId:String(action.deliveryId)}}}).catch(()=>null);
    }else if(action.kind==='search'){
      await dispatchNextRider(action.deliveryId,action.vendorId,action.orderNumber,false,{automatic:true});
    }else if(action.kind==='reassign'){
      await notificationsService.pushToUser(action.riderId,{title:'Delivery request expired',body:'The order has been released for reassignment because the delivery timer expired.',data:{deliveryId:String(action.deliveryId)}}).catch(()=>null);
      // The configured reassignment delay is respected by the retry queue.
    }
  }
  return {processed:actions.length};
}

async function updateStatus(deliveryId, newStatus, actorId, roles, extra={}) {
  // Lock order before delivery to match cancellation and rider-accept flows.
  // This gives every delivery state change the same concurrency boundary.
  const result = await withTransaction(async (client) => {
    const { rows: [snapshot] } = await client.query(
      'SELECT order_id FROM deliveries WHERE id=$1', [deliveryId]
    );
    if (!snapshot) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');
    const { rows: [order] } = await client.query(
      'SELECT id,status FROM orders WHERE id=$1 FOR UPDATE', [snapshot.order_id]
    );
    if (!order) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    const { rows: [d] } = await client.query(
      'SELECT * FROM deliveries WHERE id=$1 AND order_id=$2 FOR UPDATE',
      [deliveryId,snapshot.order_id]
    );
    if (!d) throw new AppError('Delivery not found.',404,'DELIVERY_NOT_FOUND');

    const isAdmin = (roles||[]).some(r => ['admin','super_admin'].includes(r));
    const isRider = String(d.rider_id || '') === String(actorId || '');
    if (!isAdmin && !isRider) throw new AppError('Not authorised.',403,'FORBIDDEN');

    // A previous delivery update may have committed while financial
    // settlement failed. Repeating "delivered" is a safe idempotent retry.
    if (newStatus === 'delivered' && d.status === 'delivered') {
      return { ...d, settlementRetry: true };
    }

    const allowed = VALID_TRANSITIONS[d.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new AppError(`Cannot transition from ${d.status} to ${newStatus}.`,400,'INVALID_TRANSITION');
    }
    if (newStatus === 'picked_up' && order.status !== 'rider_assigned') {
      throw new AppError('The vendor must mark the order ready and the rider must accept it before pickup.',409,'ORDER_NOT_READY_FOR_PICKUP');
    }
    if (newStatus === 'picked_up') {
      // Vendor assignment advances the order to rider_assigned while the
      // rider's response is still pending. Require the matching acceptance
      // record as a separate gate before the rider can confirm collection.
      const { rows: [acceptedAssignment] } = await client.query(
        "SELECT id FROM rider_assignments WHERE delivery_id=$1 AND rider_id=$2 AND status='accepted' LIMIT 1",
        [deliveryId,d.rider_id]
      );
      if (!acceptedAssignment) {
        throw new AppError('Accept this delivery request before confirming pickup.',409,'RIDER_ACCEPTANCE_REQUIRED');
      }
    }
    if (newStatus === 'in_transit' && order.status !== 'picked_up') {
      throw new AppError('Confirm pickup before starting the delivery journey.',409,'PICKUP_NOT_CONFIRMED');
    }
    if (newStatus === 'delivered' && order.status !== 'on_the_way') {
      throw new AppError('Start the delivery journey before marking the order delivered.',409,'DELIVERY_NOT_IN_TRANSIT');
    }

    const now = new Date();
    const updates = ['status = $1']; const params = [newStatus];
    let pi = 2;
    if (newStatus === 'picked_up') { updates.push(`picked_up_at = $${pi++}`); params.push(now); }
    if (newStatus === 'delivered') { updates.push(`delivered_at = $${pi++}`); params.push(now); }
    if (extra.proofUrl) { updates.push(`proof_of_delivery_url = $${pi++}`); params.push(extra.proofUrl); }
    params.push(deliveryId);

    const { rows: [updated] } = await client.query(
      `UPDATE deliveries SET ${updates.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!updated) throw new AppError('Delivery changed before the status could be saved. Refresh and try again.',409,'DELIVERY_STATE_CHANGED');

    const orderStatusMap = {
      picked_up: 'picked_up', in_transit: 'on_the_way',
      delivered: 'delivered', cancelled: 'cancelled',
    };
    const orderStatus = orderStatusMap[newStatus];
    if (orderStatus) {
      await client.query(
        `UPDATE orders SET status = $1 ${newStatus === 'delivered' ? ', delivered_at = now()' : ''}
         WHERE id = $2`, [orderStatus,d.order_id]
      );
      const historyNotes = {
        picked_up: 'Rider picked up the order.',
        in_transit: 'Rider is on the way to the customer.',
        delivered: 'Rider marked the order as delivered.',
        cancelled: 'Delivery was cancelled.',
      };
      await client.query(
        'INSERT INTO order_status_history (order_id,status,note) VALUES ($1,$2,$3)',
        [d.order_id,orderStatus,historyNotes[newStatus] || 'Delivery status updated.']
      );
    }

    const custMsgs = {
      picked_up: 'Your order has been picked up! 📦',
      in_transit: 'Your order is on the way! 🛵',
      delivered: 'Your order has been delivered! ✅',
    };
    if (custMsgs[newStatus]) {
      const { rows: [o] } = await client.query(
        'SELECT customer_id FROM orders WHERE id = $1',[d.order_id]
      );
      if (o) await client.query(
        `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
         VALUES ($1,$2,$3,$4,'order',$5)`,
        [o.customer_id,'delivery_update','Order Update',custMsgs[newStatus],d.order_id]
      );
    }

    if (['delivered','failed','cancelled'].includes(newStatus) && d.rider_id) {
      await client.query(
        "UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE user_id=$1 AND location_sharing_delivery_id=$2",
        [d.rider_id,deliveryId]
      );
    }
    return updated;
  });

  // Settlement is separately idempotent and only runs after confirmed payment.
  if (newStatus === 'delivered') await ordersService.settleOrderFinancials(result.order_id);
  if (result.settlementRetry) delete result.settlementRetry;
  return result;
}

async function getTracking(deliveryId, actorId, roles) {
  const { rows: [d] } = await query(
    `SELECT d.id, d.order_id, d.rider_id, d.status, d.estimated_minutes, d.picked_up_at,
            o.customer_id, o.vendor_id,
            COALESCE(d.dropoff_lat,da.latitude) AS dropoff_lat,
            COALESCE(d.dropoff_lng,da.longitude) AS dropoff_lng,
            CASE WHEN r.location_sharing_enabled=TRUE AND r.location_sharing_delivery_id=d.id AND d.status IN ('assigned','picked_up','in_transit') THEN r.current_lat ELSE NULL END AS current_lat,
            CASE WHEN r.location_sharing_enabled=TRUE AND r.location_sharing_delivery_id=d.id AND d.status IN ('assigned','picked_up','in_transit') THEN r.current_lng ELSE NULL END AS current_lng,
            CASE WHEN r.location_sharing_enabled=TRUE AND r.location_sharing_delivery_id=d.id AND d.status IN ('assigned','picked_up','in_transit') THEN r.last_location_at ELSE NULL END AS last_location_at,
            u.full_name AS rider_name, u.phone AS rider_phone,
            r.mobile_number AS rider_mobile_number, r.whatsapp_number AS rider_whatsapp_number,
            CASE WHEN r.location_sharing_enabled=TRUE
                       AND r.location_sharing_delivery_id=d.id
                       AND r.user_id=d.rider_id
                       AND d.status IN ('assigned','picked_up','in_transit')
                 THEN (SELECT json_agg(p ORDER BY p.recorded_at DESC) FROM (
                         SELECT lat, lng, recorded_at FROM rider_location_pings
                         WHERE delivery_id = d.id AND rider_id = d.rider_id
                         ORDER BY recorded_at DESC LIMIT 20
                       ) p)
                 ELSE NULL
            END AS location_trail
     FROM deliveries d
     JOIN orders o ON o.id=d.order_id
     LEFT JOIN delivery_addresses da ON da.id=o.delivery_address_id
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

module.exports = { getById, list, assignRider, listAvailableRiders, acceptDelivery, declineDelivery, reassignDelivery, processDispatchTimers, updateStatus, getTracking, dispatchNextRider, getSmartRiderDispatchPolicy };
