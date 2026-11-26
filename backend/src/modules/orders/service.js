'use strict';
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const notificationsService = require('../notifications/service');
const { SETTING_KEYS, commissionSettingsFromRows, payoutFeeRecoveryPctFromRows } = require('../../utils/marketplaceCommission');
const { calculatePayoutFeeRecovery } = require('../../utils/payoutFeeRecovery');
const { normaliseDeliveryPricingPolicy, resolveRiderDeliveryTariff, applyDeliveryPricingLimits } = require('../../utils/deliveryPricingPolicy');
const { haversineKm, estimateRoadDistanceKm, matchingRouteRate, calculateDeliveryFare, roundGmd } = require('../../utils/deliveryPricing');
function genNum() { return `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,'0')}`; }


function buildCheckoutFingerprint({customerId,vendorId,deliveryAddressId,riderId,items,couponId,discount,marketplaceCommissionPct,affiliateUserId,affiliateCommissionPct,payoutFeeRecoveryPct,deliveryFee}) {
  const payload={
    customerId:String(customerId),vendorId:String(vendorId),deliveryAddressId:String(deliveryAddressId),riderId:String(riderId),
    items:(items||[]).map(item=>({productId:String(item.productId),quantity:Number(item.qty==null?item.quantity:item.qty),unitPrice:roundGmd(item.unitPrice==null?item.price:item.unitPrice)})).sort((a,b)=>a.productId.localeCompare(b.productId)),
    couponId:couponId?String(couponId):null,discount:roundGmd(discount||0),
    marketplaceCommissionPct:roundGmd(marketplaceCommissionPct||0),
    affiliateUserId:affiliateUserId?String(affiliateUserId):null,
    affiliateCommissionPct:roundGmd(affiliateCommissionPct||0),
    payoutFeeRecoveryPct:roundGmd(payoutFeeRecoveryPct||0),
    deliveryFee:roundGmd(deliveryFee||0),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function calculateCheckoutPreview(client,{customerId,vendorId,deliveryAddressId,items,couponCode,affiliateCode}) {
  if(!Array.isArray(items)||!items.length)throw new AppError('Add products to your cart before requesting a delivery total.',400,'EMPTY_ORDER');
  let subtotal=0;
  const previewItems=[];
  const seen=new Set();
  for(const item of items){
    if(!item||!item.productId||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1)throw new AppError('Each cart item must have a valid product and positive integer quantity.',400,'INVALID_ORDER_ITEM');
    const {rows:[product]}=await client.query(
      'SELECT p.id,p.vendor_id,p.name,CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END AS price,p.status,v.kyc_status AS vendor_kyc_status FROM products p JOIN vendors v ON v.user_id=p.vendor_id WHERE p.id=$1',
      [item.productId]
    );
    if(!product||product.status!=='active'||product.vendor_kyc_status!=='approved')throw new AppError('A product in your cart is no longer available.',409,'PRODUCT_UNAVAILABLE');
    if(String(product.vendor_id)!==String(vendorId))throw new AppError('Checkout must contain products from one selected vendor.',400,'VENDOR_MISMATCH');
    if(seen.has(String(product.id)))throw new AppError('Remove duplicate product rows before requesting a delivery total.',400,'DUPLICATE_ORDER_ITEM');
    seen.add(String(product.id));
    const {rows:[inventory]}=await client.query('SELECT quantity FROM inventory WHERE product_id=$1 AND variant_id IS NULL',[product.id]);
    if(!inventory||inventory.quantity==null||Number(inventory.quantity)<Number(item.quantity))throw new AppError('A product in your cart does not have enough available stock.',409,'INSUFFICIENT_STOCK');
    subtotal+=Number(product.price)*Number(item.quantity);
    previewItems.push({productId:String(product.id),qty:Number(item.quantity),unitPrice:Number(product.price)});
  }
  let discount=0,couponId=null;
  if(couponCode){
    const {rows:[coupon]}=await client.query(
      "SELECT * FROM coupons WHERE code=$1 AND is_active=TRUE AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now())",
      [String(couponCode).trim().toUpperCase()]
    );
    if(!coupon)throw new AppError('Invalid or expired coupon.',400,'INVALID_COUPON');
    if(coupon.vendor_id&&String(coupon.vendor_id)!==String(vendorId))throw new AppError('This coupon is not valid for this vendor.',400,'INVALID_COUPON_VENDOR');
    if(subtotal<Number(coupon.min_order_value||0))throw new AppError('Your cart does not meet the minimum order value for this coupon.',400,'COUPON_MIN_ORDER');
    const {rows:[usage]}=await client.query(
      'SELECT count(*)::int AS total,count(*) FILTER (WHERE customer_id=$2)::int AS customer_total FROM coupon_redemptions WHERE coupon_id=$1',
      [coupon.id,customerId]
    );
    if(coupon.max_uses!==null&&Number(usage.total)>=Number(coupon.max_uses))throw new AppError('This coupon has reached its usage limit.',400,'COUPON_MAX_USES');
    if(Number(usage.customer_total)>=Number(coupon.max_uses_per_user||1))throw new AppError('You have already used this coupon the maximum number of times.',400,'COUPON_USER_LIMIT');
    couponId=coupon.id;
    discount=coupon.discount_type==='percent'?Number((subtotal*Number(coupon.discount_value)/100).toFixed(2)):Math.min(Number(coupon.discount_value),subtotal);
  }
  const {rows:settingRows}=await client.query(
    "SELECT key,value #>> '{}' AS value FROM system_settings WHERE key=ANY($1::text[])",
    [[SETTING_KEYS.marketplace,SETTING_KEYS.affiliate,SETTING_KEYS.payoutRecovery]]
  );
  const settings=commissionSettingsFromRows(settingRows);
  let affiliateAmount=0,affiliateUserId=null;
  if(affiliateCode){
    const {rows:[affiliate]}=await client.query("SELECT a.user_id,a.affiliate_code FROM affiliates a JOIN users u ON u.id=a.user_id WHERE a.affiliate_code=$1 AND a.marketer_status='approved' AND u.status='active'",[String(affiliateCode).trim().toUpperCase()]);
    if(affiliate&&String(affiliate.user_id)!==String(customerId)){
      affiliateUserId=affiliate.user_id;
      affiliateAmount=Number((Math.max(0,subtotal-discount)*settings.affiliateCommissionPct/100).toFixed(2));
    }
  }
  const discountedSubtotal=Math.max(0,subtotal-discount);
  const platformFee=Number((discountedSubtotal*settings.marketplaceCommissionPct/100).toFixed(2));
  const vendorPayout=Number((discountedSubtotal-platformFee).toFixed(2));
  return {
    discountedSubtotal,
    vendorPayout,
    affiliatePayout:affiliateAmount,
    payoutFeeRecoveryPct:payoutFeeRecoveryPctFromRows(settingRows),
    marketplaceCommissionPct:settings.marketplaceCommissionPct,
    affiliateCommissionPct:affiliateUserId?settings.affiliateCommissionPct:0,
    affiliateUserId,
    couponId,
    discount,
    items:previewItems,
  };
}

async function quoteDeliveryOptions({ customerId, vendorId, deliveryAddressId, items, couponCode, affiliateCode }) {
  if (!vendorId || !deliveryAddressId) throw new AppError('Choose a vendor and saved delivery address before requesting delivery prices.', 400, 'DELIVERY_QUOTE_INPUT_REQUIRED');
  return withTransaction(async client => {
    const checkoutPreview=await calculateCheckoutPreview(client,{customerId,vendorId,deliveryAddressId,items,couponCode,affiliateCode});
    const { rows: [address] } = await client.query(
      'SELECT id,full_address,area,latitude,longitude FROM delivery_addresses WHERE id=$1 AND customer_id=$2',
      [deliveryAddressId, customerId]
    );
    if (!address) throw new AppError('The selected delivery address does not belong to your account.', 403, 'DELIVERY_ADDRESS_FORBIDDEN');
    const { rows: [vendor] } = await client.query(
      "SELECT user_id,business_name,business_address,latitude,longitude,kyc_status FROM vendors WHERE user_id=$1",
      [vendorId]
    );
    if (!vendor || vendor.kyc_status !== 'approved') throw new AppError('This vendor is not available for delivery quotes.', 404, 'VENDOR_NOT_AVAILABLE');
    const pickup = { latitude: vendor.latitude, longitude: vendor.longitude };
    const dropoff = { latitude: address.latitude, longitude: address.longitude };
    const straightLine = haversineKm(pickup, dropoff);
    if (straightLine === null || straightLine < 0.01) {
      throw new AppError('GPS coordinates are required for both the vendor pickup and your saved delivery address. Update the address or vendor location before checkout.', 409, 'DELIVERY_GPS_REQUIRED');
    }
    const factor = Number(process.env.MARKETLINK_ROAD_DISTANCE_FACTOR || 1.25);
    let routeDistance;
    try { routeDistance = estimateRoadDistanceKm(pickup, dropoff, factor); }
    catch (error) { throw new AppError('Delivery route distance configuration is invalid.', 500, 'DELIVERY_ROUTE_CONFIG_ERROR'); }

    const { rows: [deliveryPolicyRow] } = await client.query(
      "SELECT value FROM system_settings WHERE key=$1", ['delivery_pricing_policy']
    );
    const deliveryPolicy = normaliseDeliveryPricingPolicy(deliveryPolicyRow?.value);

    // Release expired, unused quotes for this customer before creating the next set.
    await client.query(
      "UPDATE delivery_fee_quotes SET status='expired' WHERE customer_id=$1 AND status='quoted' AND expires_at<=now()",
      [customerId]
    );
    const { rows: riders } = await client.query(
      `SELECT r.user_id AS rider_id,r.vehicle_type,r.rating_avg,r.rating_count,
              r.delivery_pricing_enabled,r.delivery_base_fee_gmd,r.delivery_per_km_fee_gmd,r.delivery_min_fee_gmd,
              r.admin_delivery_pricing_override,u.full_name
       FROM riders r JOIN users u ON u.id=r.user_id
       WHERE r.kyc_status='approved' AND r.is_online=TRUE
         AND (r.admin_delivery_pricing_override IS NOT NULL OR (r.delivery_pricing_enabled=TRUE AND $1::boolean=TRUE))
         AND NOT EXISTS (
           SELECT 1 FROM deliveries active
           WHERE active.rider_id=r.user_id AND (
             active.status IN ('assigned','picked_up','in_transit')
             OR (active.status='unassigned' AND EXISTS (
               SELECT 1 FROM orders reserved_order
               WHERE reserved_order.id=active.order_id
                 AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned')
             ))
           )
         )
       ORDER BY r.rating_avg DESC,r.rating_count DESC
       LIMIT 20`, [deliveryPolicy.allowRiderOverrides]
    );
    if (!riders.length) {
      return {
        origin: vendor.business_address || vendor.business_name,
        destination: address.area || address.full_address,
        straightLineDistanceKm: roundGmd(straightLine),
        estimatedRouteDistanceKm: routeDistance,
        quoteExpiresInMinutes: 15,
        quotes: [],
      };
    }
    const riderIds = riders.map(row => row.rider_id);
    const { rows: lanes } = await client.query(
      'SELECT rider_id,origin_area,destination_area,fixed_fee_gmd FROM rider_delivery_rates WHERE rider_id=ANY($1::uuid[]) AND is_active=TRUE',
      [riderIds]
    );
    const originArea = vendor.business_address || vendor.business_name;
    const destinationArea = address.area || address.full_address;
    const laneMap = new Map();
    for (const lane of lanes) {
      if (!laneMap.has(lane.rider_id)) laneMap.set(lane.rider_id, []);
      laneMap.get(lane.rider_id).push(lane);
    }
    const quotes = [];
    for (const rider of riders) {
      const effectiveTariff = resolveRiderDeliveryTariff(rider, laneMap.get(rider.rider_id) || [], deliveryPolicy);
      if (!effectiveTariff.enabled) continue;
      const lane = matchingRouteRate(effectiveTariff.routeRates, originArea, destinationArea);
      let fee;
      try {
        fee = applyDeliveryPricingLimits(calculateDeliveryFare({
          fixedFee: lane ? (lane.fixed_fee_gmd ?? lane.fixedFeeGmd) : null,
          baseFee: effectiveTariff.baseFeeGmd,
          perKmFee: effectiveTariff.perKmFeeGmd,
          minimumFee: effectiveTariff.minimumFeeGmd,
          distanceKm: routeDistance,
        }), deliveryPolicy);
      } catch (error) {
        logger.warn('Rider delivery pricing skipped because the saved tariff is invalid', { riderId: rider.rider_id, error: error.message });
        continue;
      }
      const { rows: [quote] } = await client.query(
        `INSERT INTO delivery_fee_quotes
          (customer_id,vendor_id,delivery_address_id,rider_id,origin_area,destination_area,
           pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,straight_line_distance_km,
           route_distance_km,pricing_mode,base_fee_gmd,per_km_fee_gmd,minimum_fee_gmd,delivery_fee_gmd,
           estimated_customer_total,payout_fee_recovery_pct,checkout_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id,delivery_fee_gmd,estimated_customer_total,payout_fee_recovery_pct,checkout_fingerprint,route_distance_km,pricing_mode,expires_at`,
        [customerId,vendorId,deliveryAddressId,rider.rider_id,originArea,destinationArea,
         Number(vendor.latitude),Number(vendor.longitude),Number(address.latitude),Number(address.longitude),
         Math.max(0.01,roundGmd(straightLine)),routeDistance,lane?'route_fixed':'per_kilometre',
         lane?null:Number(effectiveTariff.baseFeeGmd),lane?null:Number(effectiveTariff.perKmFeeGmd),
         lane?null:Number(effectiveTariff.minimumFeeGmd),fee,
         roundGmd(checkoutPreview.discountedSubtotal+fee+calculatePayoutFeeRecovery({vendorPayout:checkoutPreview.vendorPayout,riderPayout:fee,affiliatePayout:checkoutPreview.affiliatePayout,pct:checkoutPreview.payoutFeeRecoveryPct}).payoutFeeRecoveryAmount),
         checkoutPreview.payoutFeeRecoveryPct,
         buildCheckoutFingerprint({customerId,vendorId,deliveryAddressId,riderId:rider.rider_id,items:checkoutPreview.items,couponId:checkoutPreview.couponId,discount:checkoutPreview.discount,marketplaceCommissionPct:checkoutPreview.marketplaceCommissionPct,affiliateUserId:checkoutPreview.affiliateUserId,affiliateCommissionPct:checkoutPreview.affiliateCommissionPct,payoutFeeRecoveryPct:checkoutPreview.payoutFeeRecoveryPct,deliveryFee:fee})]
      );
      quotes.push({
        quoteId: quote.id,
        riderId: rider.rider_id,
        riderName: rider.full_name || 'MarketLink Rider',
        vehicleType: rider.vehicle_type || 'Delivery rider',
        rating: Number(rider.rating_avg || 0),
        ratingCount: Number(rider.rating_count || 0),
        deliveryFee: Number(quote.delivery_fee_gmd),
        estimatedCustomerTotal: Number(quote.estimated_customer_total),
        estimatedRouteDistanceKm: Number(quote.route_distance_km),
        pricingMode: quote.pricing_mode,
        expiresAt: quote.expires_at,
      });
    }
    quotes.sort((a,b) => a.deliveryFee - b.deliveryFee || b.rating - a.rating);
    return {
      origin: vendor.business_address || vendor.business_name,
      destination: address.area || address.full_address,
      straightLineDistanceKm: roundGmd(straightLine),
      estimatedRouteDistanceKm: routeDistance,
      quoteExpiresInMinutes: 15,
      quotes,
    };
  });
}

async function placeOrder({ customerId, vendorId, items, deliveryAddressId, deliveryFeeQuoteId, paymentMethod, couponCode, affiliateCode }) {
  paymentMethod=String(paymentMethod||'').toLowerCase();
  if(!['cod','wallet','wave','afrimoney','qmoney','modempay'].includes(paymentMethod))throw new AppError('Choose an enabled MarketLink payment method.',400,'UNSUPPORTED_PAYMENT_METHOD');
  if (!Array.isArray(items) || !items.length) throw new AppError('Order must contain at least one item.',400,'EMPTY_ORDER');
  if (!vendorId) throw new AppError('Vendor is required.',400,'VENDOR_REQUIRED');
  if (!deliveryAddressId) throw new AppError('Select a saved delivery address before placing your order.',400,'DELIVERY_ADDRESS_REQUIRED');
  if (!deliveryFeeQuoteId) throw new AppError('Select an available rider price before placing your order.',400,'DELIVERY_QUOTE_REQUIRED');
  for (const item of items) {
    if (!item || !item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
      throw new AppError('Each order item must have a valid product and positive integer quantity.',400,'INVALID_ORDER_ITEM');
    }
  }

  const result = await withTransaction(async (client) => {
    let deliveryAddress = null;
    if (deliveryAddressId) {
      const { rows:[address] } = await client.query(
        'SELECT id,latitude,longitude FROM delivery_addresses WHERE id=$1 AND customer_id=$2',
        [deliveryAddressId, customerId]
      );
      if (!address) throw new AppError('The selected delivery address does not belong to your account.',403,'DELIVERY_ADDRESS_FORBIDDEN');
      deliveryAddress = address;
    }
    if (deliveryAddress?.latitude == null || deliveryAddress?.longitude == null) {
      throw new AppError('Save GPS coordinates for your delivery address before checkout.', 409, 'DELIVERY_GPS_REQUIRED');
    }
    const { rows: [deliveryQuote] } = await client.query(
      `SELECT * FROM delivery_fee_quotes
       WHERE id=$1 AND customer_id=$2 AND vendor_id=$3 AND delivery_address_id=$4
         AND status='quoted' AND expires_at>now()
       FOR UPDATE`,
      [deliveryFeeQuoteId, customerId, vendorId, deliveryAddressId]
    );
    if (!deliveryQuote) {
      // A customer may lose the HTTP response after the order transaction commits.
      // The consumed quote is the checkout idempotency key: recover that exact
      // order instead of making the customer start over or creating a duplicate.
      const { rows: [consumedQuote] } = await client.query(
        `SELECT * FROM delivery_fee_quotes
         WHERE id=$1 AND customer_id=$2 AND vendor_id=$3 AND delivery_address_id=$4
           AND status='consumed' AND order_id IS NOT NULL
         FOR UPDATE`,
        [deliveryFeeQuoteId, customerId, vendorId, deliveryAddressId]
      );
      if (!consumedQuote) {
        throw new AppError('This rider price has expired or is no longer available. Refresh delivery prices and choose again.', 409, 'DELIVERY_QUOTE_EXPIRED');
      }

      const { rows: [existingOrder] } = await client.query(
        `SELECT * FROM orders
         WHERE id=$1 AND customer_id=$2 AND vendor_id=$3
           AND delivery_address_id=$4 AND delivery_fee_quote_id=$5
         FOR UPDATE`,
        [consumedQuote.order_id, customerId, vendorId, deliveryAddressId, deliveryFeeQuoteId]
      );
      if (!existingOrder) throw new AppError('The used checkout quote could not be matched to your order. Contact MarketLink support before retrying.', 409, 'CHECKOUT_RETRY_MISMATCH');
      if (String(existingOrder.payment_method || '').toLowerCase() !== paymentMethod) {
        throw new AppError('This checkout quote already belongs to an order with a different payment method. Open My Orders to continue that order.', 409, 'CHECKOUT_RETRY_MISMATCH');
      }

      const { rows: existingLines } = await client.query(
        `SELECT product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total
         FROM order_items WHERE order_id=$1 ORDER BY product_id,quantity`,
        [existingOrder.id]
      );
      const requestedItems = items.map(item => ({
        productId:String(item.productId), quantity:Number(item.quantity),
      })).sort((a,b) => a.productId.localeCompare(b.productId) || a.quantity-b.quantity);
      const storedItems = existingLines.map(line => ({
        productId:String(line.product_id), quantity:Number(line.quantity),
      })).sort((a,b) => a.productId.localeCompare(b.productId) || a.quantity-b.quantity);
      if (JSON.stringify(requestedItems) !== JSON.stringify(storedItems)) {
        throw new AppError('This checkout quote was already used for a different cart. Refresh checkout before placing another order.', 409, 'CHECKOUT_RETRY_MISMATCH');
      }

      const recoveredFingerprint = buildCheckoutFingerprint({
        customerId, vendorId, deliveryAddressId, riderId:consumedQuote.rider_id,
        items:existingLines.map(line => ({
          productId:line.product_id, qty:Number(line.quantity), unitPrice:Number(line.unit_price_snapshot),
        })),
        couponId:existingOrder.coupon_id,
        discount:Number(existingOrder.discount_amount || 0),
        marketplaceCommissionPct:Number(existingOrder.platform_fee_pct || 0),
        affiliateUserId:existingOrder.affiliate_user_id,
        affiliateCommissionPct:Number(existingOrder.affiliate_commission_pct || 0),
        payoutFeeRecoveryPct:Number(existingOrder.payout_fee_recovery_pct || 0),
        deliveryFee:Number(existingOrder.delivery_fee || 0),
      });
      if (recoveredFingerprint !== String(consumedQuote.checkout_fingerprint || '')) {
        throw new AppError('The saved order no longer matches its original checkout quote. Contact MarketLink support before retrying.', 409, 'CHECKOUT_RETRY_MISMATCH');
      }

      return {
        order:existingOrder,
        lineItems:existingLines.map(line => ({
          productId:line.product_id, name:line.product_name_snapshot,
          price:Number(line.unit_price_snapshot), qty:Number(line.quantity), lt:Number(line.line_total),
        })),
        recovered:true,
      };
    }
    if (deliveryQuote.estimated_customer_total == null || deliveryQuote.payout_fee_recovery_pct == null || !deliveryQuote.checkout_fingerprint) throw new AppError('Your selected rider price needs refreshing before checkout. Request a fresh total and try again.',409,'CHECKOUT_QUOTE_REFRESH_REQUIRED');
    if (Number(deliveryQuote.dropoff_lat) !== Number(deliveryAddress.latitude) ||
        Number(deliveryQuote.dropoff_lng) !== Number(deliveryAddress.longitude)) {
      throw new AppError('Your saved delivery coordinates changed. Request a fresh delivery price.', 409, 'DELIVERY_ADDRESS_CHANGED');
    }
    const { rows: [lockedRider] } = await client.query(
      "SELECT user_id FROM riders WHERE user_id=$1 AND kyc_status='approved' AND is_online=TRUE AND ((admin_delivery_pricing_override IS NOT NULL AND COALESCE(admin_delivery_pricing_override->>'enabled','true') <> 'false') OR (admin_delivery_pricing_override IS NULL AND delivery_pricing_enabled=TRUE)) FOR UPDATE",
      [deliveryQuote.rider_id]
    );
    if (!lockedRider) throw new AppError('The selected rider is no longer online. Refresh delivery prices and choose another rider.', 409, 'RIDER_QUOTE_NO_LONGER_AVAILABLE');
    const { rows: [busyRider] } = await client.query(
      "SELECT d.id FROM deliveries d JOIN orders reserved_order ON reserved_order.id=d.order_id WHERE d.rider_id=$1 AND (d.status IN ('assigned','picked_up','in_transit') OR (d.status='unassigned' AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned'))) LIMIT 1",
      [deliveryQuote.rider_id]
    );
    if (busyRider) throw new AppError('The selected rider has just accepted another delivery. Refresh delivery prices and choose another rider.', 409, 'RIDER_QUOTE_NO_LONGER_AVAILABLE');
    const fee = Number(deliveryQuote.delivery_fee_gmd);
    if (!Number.isFinite(fee) || fee <= 0) throw new AppError('The selected rider quote has an invalid delivery fee.', 500, 'DELIVERY_QUOTE_INVALID');
    let sub=0; const lines=[];
    const lockedProductIds = new Set();
    for (const item of items) {
      const qty = Number(item.quantity);
      const { rows:[p] } = await client.query(
        'SELECT p.id,p.vendor_id,p.name,CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END AS price,p.status,v.kyc_status AS vendor_kyc_status FROM products p JOIN vendors v ON v.user_id=p.vendor_id WHERE p.id=$1 FOR UPDATE OF p',
        [item.productId]
      );
      if (!p || p.status!=='active' || p.vendor_kyc_status!=='approved') {
        throw new AppError(`Product ${item.productId} unavailable.`,400,'PRODUCT_UNAVAILABLE');
      }
      if (p.vendor_id !== vendorId) throw new AppError(`Product ${item.productId} does not belong to the selected vendor.`,400,'VENDOR_MISMATCH');
      const { rows:[inv] } = await client.query('SELECT quantity FROM inventory WHERE product_id=$1 AND variant_id IS NULL FOR UPDATE',[item.productId]);
      if (inv && inv.quantity < qty) throw new AppError(`Insufficient stock for ${item.productId}.`,400,'INSUFFICIENT_STOCK');
      if (!inv && !lockedProductIds.has(item.productId)) throw new AppError(`Inventory is unavailable for ${item.productId}.`,400,'INVENTORY_UNAVAILABLE');
      const lt = Number(p.price) * qty; sub += lt;
      lines.push({ productId:p.id, name:p.name, price:Number(p.price), qty, lt });
      lockedProductIds.add(item.productId);
    }

    let coupon=null, discount=0;
    if (couponCode) {
      const { rows:[c] } = await client.query("SELECT * FROM coupons WHERE code=$1 AND is_active=TRUE AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE", [String(couponCode).trim().toUpperCase()]);
      if (!c) throw new AppError('Invalid or expired coupon.',400,'INVALID_COUPON');
      if (c.vendor_id && c.vendor_id !== vendorId) throw new AppError('This coupon is not valid for this vendor.',400,'INVALID_COUPON_VENDOR');
      if (Number(sub) < Number(c.min_order_value || 0)) throw new AppError(`Minimum order value for this coupon is D${Number(c.min_order_value).toFixed(2)}.`,400,'COUPON_MIN_ORDER');
      const { rows:[usage] } = await client.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE customer_id=$2)::int AS customer_total FROM coupon_redemptions WHERE coupon_id=$1',[c.id,customerId]);
      if (c.max_uses !== null && Number(usage.total) >= Number(c.max_uses)) throw new AppError('This coupon has reached its usage limit.',400,'COUPON_MAX_USES');
      if (Number(usage.customer_total) >= Number(c.max_uses_per_user || 1)) throw new AppError('You have already used this coupon the maximum number of times.',400,'COUPON_USER_LIMIT');
      coupon = c;
      discount = c.discount_type==='percent' ? parseFloat((sub*Number(c.discount_value)/100).toFixed(2)) : Math.min(Number(c.discount_value),sub);
    }

    // Transparent marketplace pricing: vendor sets retail price; MarketLink commission is not added to checkout.
    const { rows: commissionSettingRows } = await client.query(
      "SELECT key,value #>> '{}' AS value FROM system_settings WHERE key=ANY($1::text[])",
      [[SETTING_KEYS.marketplace, SETTING_KEYS.affiliate, SETTING_KEYS.payoutRecovery]]
    );
    const commissionSettings = commissionSettingsFromRows(commissionSettingRows);
    const commPct = commissionSettings.marketplaceCommissionPct;
    const affiliateDefaultPct = commissionSettings.affiliateCommissionPct;
    if (!Number.isFinite(commPct) || commPct < 0 || commPct > 20) throw new AppError('Invalid platform commission configuration.',500,'FEE_CONFIG_ERROR');
    if (affiliateDefaultPct > commPct) throw new AppError('Platform commission must cover the affiliate reward.',500,'FEE_CONFIG_ERROR');

    const discountedSubtotal = Math.max(0, sub-discount);
    const platFee = parseFloat((discountedSubtotal*commPct/100).toFixed(2));

    // Affiliate reward is funded entirely from MarketLink's commission, never added to customer checkout.
    let affiliate=null;
    let affiliatePct=0;
    if (affiliateCode) {
      const { rows:[a] } = await client.query("SELECT a.user_id,a.affiliate_code FROM affiliates a JOIN users u ON u.id=a.user_id WHERE a.affiliate_code=$1 AND a.marketer_status='approved' AND u.status='active'",[String(affiliateCode).trim().toUpperCase()]);
      if (a && a.user_id !== customerId) {
        affiliate=a;
        affiliatePct=affiliateDefaultPct;
      }
    }
    const affiliateAmount = affiliate ? parseFloat((discountedSubtotal*affiliatePct/100).toFixed(2)) : 0;
    const platformNetFee = parseFloat(Math.max(0,platFee-affiliateAmount).toFixed(2));
    const vendorPayout = parseFloat((discountedSubtotal-platFee).toFixed(2));
    const riderPayout = parseFloat(fee.toFixed(2));
    const configuredPayoutRecoveryPct=payoutFeeRecoveryPctFromRows(commissionSettingRows);
    const quotePayoutRecoveryPct=Number(deliveryQuote.payout_fee_recovery_pct);
    if(!Number.isFinite(quotePayoutRecoveryPct)||Math.abs(configuredPayoutRecoveryPct-quotePayoutRecoveryPct)>0.001) throw new AppError('MarketLink checkout pricing changed while your rider price was open. Refresh delivery prices to confirm the latest total.',409,'CHECKOUT_PRICING_SETTINGS_CHANGED');
    const payoutRecovery = calculatePayoutFeeRecovery({
      vendorPayout,
      riderPayout,
      affiliatePayout: affiliateAmount,
      pct: quotePayoutRecoveryPct,
    });
    const total = parseFloat((discountedSubtotal+fee+payoutRecovery.payoutFeeRecoveryAmount).toFixed(2));
    const checkoutFingerprint=buildCheckoutFingerprint({
      customerId,vendorId,deliveryAddressId,riderId:deliveryQuote.rider_id,
      items:lines.map(line=>({productId:line.productId,qty:line.qty,unitPrice:line.price})),
      couponId:coupon?.id||null,discount,marketplaceCommissionPct:commPct,
      affiliateUserId:affiliate?.user_id||null,affiliateCommissionPct:affiliatePct,
      payoutFeeRecoveryPct:quotePayoutRecoveryPct,deliveryFee:fee,
    });
    if(checkoutFingerprint!==String(deliveryQuote.checkout_fingerprint)||Math.abs(total-Number(deliveryQuote.estimated_customer_total))>0.01) throw new AppError('Your cart prices or discount changed after the delivery quote. Refresh the rider prices and review the new total before paying.',409,'CHECKOUT_TOTAL_CHANGED');

    const { rows:[order] } = await client.query(
      "INSERT INTO orders (order_number,customer_id,vendor_id,delivery_address_id,delivery_fee_quote_id,payment_method,subtotal,delivery_fee,discount_amount,platform_fee,platform_fee_pct,vendor_payout,rider_payout,total,coupon_id,affiliate_user_id,affiliate_commission_pct,affiliate_commission_amount,platform_net_fee,payout_fee_recovery_pct,payout_fee_recovery_amount,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'pending','pending') RETURNING *",
      [genNum(),customerId,vendorId,deliveryAddressId,deliveryFeeQuoteId,paymentMethod,sub,fee,discount,platFee,commPct,vendorPayout,riderPayout,total,coupon?.id||null,affiliate?.user_id||null,affiliatePct,affiliateAmount,platformNetFee,payoutRecovery.payoutFeeRecoveryPct,payoutRecovery.payoutFeeRecoveryAmount]);
    for (const li of lines) await client.query("INSERT INTO order_items (order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6)",[order.id,li.productId,li.name,li.price,li.qty,li.lt]);
    for (const item of items) {
      const { rows:[updated] } = await client.query("UPDATE inventory SET quantity=quantity-$1 WHERE product_id=$2 AND variant_id IS NULL AND quantity>=$1 RETURNING quantity",[Number(item.quantity),item.productId]);
      if (!updated) throw new AppError(`Insufficient stock for ${item.productId}.`,400,'INSUFFICIENT_STOCK');
    }
    if (coupon) await client.query("INSERT INTO coupon_redemptions (coupon_id,customer_id,order_id) VALUES($1,$2,$3)",[coupon.id,customerId,order.id]);
    // total_orders is a settled-order metric; it is incremented only by settleOrderFinancials().
    await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES($1,'pending','Order placed')",[order.id]);
    const { rows: [delivery] } = await client.query(
      `INSERT INTO deliveries
        (order_id,rider_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'unassigned') RETURNING id`,
      [order.id,deliveryQuote.rider_id,deliveryQuote.pickup_lat,deliveryQuote.pickup_lng,
       deliveryQuote.dropoff_lat,deliveryQuote.dropoff_lng,deliveryQuote.route_distance_km]
    );
    await client.query(
      `INSERT INTO rider_assignments (delivery_id,rider_id,assigned_by,assignment_type,status)
       VALUES ($1,$2,$3,'manual','pending')`,
      [delivery.id,deliveryQuote.rider_id,customerId]
    );
    // The quoted rider is reserved now; notify them only after the vendor marks the order ready for pickup.
    const { rows: [consumedQuote] } = await client.query(
      `UPDATE delivery_fee_quotes SET status='consumed',order_id=$1,consumed_at=now()
       WHERE id=$2 AND status='quoted' AND expires_at>now() RETURNING id`,
      [order.id,deliveryFeeQuoteId]
    );
    if (!consumedQuote) throw new AppError('The selected rider quote expired before the order was secured. Please refresh checkout.',409,'DELIVERY_QUOTE_EXPIRED');
    await client.query("INSERT INTO commission_records (order_id,vendor_id,order_total,commission_pct,commission_amount,vendor_payout,rider_payout,platform_fee_pct,affiliate_user_id,affiliate_commission_pct,affiliate_commission_amount,platform_net_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[order.id,vendorId,total,commPct,platFee,vendorPayout,riderPayout,commPct,affiliate?.user_id||null,affiliatePct,affiliateAmount,platformNetFee]);
    return { order, lineItems: lines };
  });

  // Alert the vendor only after the order is committed. Recovered checkout
  // responses must not send a second "new order" alert.
  if(result&&result.order&&!result.recovered){
    try{
      const {rows:[vendor]}=await query(
        'SELECT u.id,u.phone,u.email FROM users u JOIN vendors v ON v.user_id=u.id WHERE u.id=$1',
        [result.order.vendor_id]
      );
      if(vendor){
        const isCod=String(result.order.payment_method||'').toLowerCase()==='cod';
        const amount=Number(result.order.total||0).toFixed(2);
        await notificationsService.send({
          userId:vendor.id,
          type:isCod?'order_received_cod':'order_received_payment_pending',
          title:isCod?'New Cash on Delivery order':'New MarketLink order received',
          body:isCod
            ?'Order '+result.order.order_number+' is confirmed as Cash on Delivery for D '+amount+'. Prepare the items and collect payment on delivery.'
            :'Order '+result.order.order_number+' has been placed for D '+amount+'. Payment is not yet confirmed; check payment status before dispatch or handover.',
          referenceType:'order',referenceId:result.order.id,
          channels:{push:true,sms:true,phone:vendor.phone||null,email:!!(vendor.email&&(process.env.RESEND_API_KEY||process.env.SENDGRID_API_KEY)),emailAddress:vendor.email||null,
            data:{orderId:String(result.order.id),orderNumber:String(result.order.order_number),paymentMethod:String(result.order.payment_method||'')}}
        });
      }
    }catch(error){logger.warn('Vendor order notification deferred after order commit',{orderId:result.order.id,error:error.message});}
  }
  return result;
}

async function getById(id, userId, roles) {
  const { rows } = await query(`
    SELECT o.*,
      EXISTS(SELECT 1 FROM payments pending_payment WHERE pending_payment.order_id=o.id AND pending_payment.method<>'cod' AND pending_payment.status='pending') AS payment_attempt_pending,
      (SELECT json_build_object('id',latest_payment.id,'method',latest_payment.method,'status',latest_payment.status)
       FROM payments latest_payment
       WHERE latest_payment.order_id=o.id AND latest_payment.status IN ('pending','confirmed')
       ORDER BY latest_payment.created_at DESC LIMIT 1) AS payment_attempt,
      u.full_name AS customer_name,
      v.business_name AS vendor_name,
      v.phone AS vendor_phone,v.whatsapp_number AS vendor_whatsapp_number,
      COALESCE(json_agg(json_build_object(
        'name',oi.product_name_snapshot,'qty',oi.quantity,
        'price',oi.unit_price_snapshot,'total',oi.line_total
      ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items,
      d.id AS delivery_id,
      d.status AS delivery_status,
      d.rider_id,
      d.distance_km,
      d.estimated_minutes,
      d.picked_up_at,
      d.delivered_at,
      (SELECT ru.full_name FROM users ru WHERE ru.id=d.rider_id) AS rider_name,
      (SELECT rr.whatsapp_number FROM riders rr WHERE rr.user_id=d.rider_id) AS rider_whatsapp_number,
      COALESCE((
        SELECT json_agg(json_build_object(
          'status',h.status,'note',h.note,'changed_at',h.created_at
        ) ORDER BY h.created_at ASC)
        FROM order_status_history h WHERE h.order_id=o.id
      ),'[]'::json) AS status_history
    FROM orders o
    JOIN users u ON u.id=o.customer_id
    JOIN vendors v ON v.user_id=o.vendor_id
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN deliveries d ON d.order_id=o.id
    WHERE o.id=$1
    GROUP BY o.id,u.full_name,v.business_name,v.phone,v.whatsapp_number,d.id,d.status,d.rider_id,
      d.distance_km,d.estimated_minutes,d.picked_up_at,d.delivered_at
  `,[id]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  const o=rows[0]; const adm=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!adm && o.customer_id!==userId && o.vendor_id!==userId && o.rider_id!==userId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  // Rider WhatsApp is private contact data: expose it only to the customer who owns this order.
  if (String(o.customer_id)!==String(userId)) {
    delete o.rider_whatsapp_number;
    delete o.vendor_phone;
    delete o.vendor_whatsapp_number;
  }
  return o;
}
async function listForCustomer(customerId, { page=1, limit=20, status }) {
  const page_=Math.max(parseInt(page,10)||1,1), limit_=Math.min(Math.max(parseInt(limit,10)||20,1),100), off=(page_-1)*limit_;
  const conds=['o.customer_id=$1'], params=[customerId];
  if (status) { conds.push(`o.status=${params.length+1}`); params.push(status); }
  const { rows } = await query(`
    SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.placed_at,
           v.business_name AS vendor_name,v.phone AS vendor_phone,v.whatsapp_number AS vendor_whatsapp_number,
           COALESCE(
             json_agg(
               json_build_object(
                 'product_id', oi.product_id,
                 'name', oi.product_name_snapshot,
                 'unit_price', oi.unit_price_snapshot,
                 'qty', oi.quantity,
                 'line_total', oi.line_total
               ) ORDER BY oi.id
             ) FILTER (WHERE oi.id IS NOT NULL),
             '[]'::json
           ) AS items
    FROM orders o
    JOIN vendors v ON v.user_id=o.vendor_id
    LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE ${conds.join(' AND ')}
    GROUP BY o.id, v.business_name,v.phone,v.whatsapp_number
    ORDER BY o.placed_at DESC
    LIMIT ${params.length+1} OFFSET ${params.length+2}
  `,[...params,limit_,off]);
  return rows;
}
async function listForVendor(vendorId, { page=1, limit=20, status }) {
  const page_=Math.max(parseInt(page,10)||1,1), limit_=Math.min(Math.max(parseInt(limit,10)||20,1),100), off=(page_-1)*limit_;
  const conds=['o.vendor_id=$1'], params=[vendorId];
  if (status) { conds.push(`o.status=$${params.length+1}`); params.push(status); }
  const { rows } = await query(`SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.payment_status,o.placed_at,u.full_name AS customer_name,d.id AS delivery_id,d.status AS delivery_status,d.rider_id,ru.full_name AS rider_name,ru.phone AS rider_phone,rr.mobile_number AS rider_mobile_number,rr.whatsapp_number AS rider_whatsapp_number,ra.status AS rider_assignment_status,ra.response_deadline_at AS rider_response_deadline_at,ra.pickup_deadline_at AS rider_pickup_deadline_at,d.distance_km,d.estimated_minutes, (SELECT COALESCE(string_agg(oi.product_name_snapshot || ' × ' || oi.quantity::text, ', ' ORDER BY oi.id), 'No order items recorded') FROM order_items oi WHERE oi.order_id=o.id) AS item_summary FROM orders o JOIN users u ON u.id=o.customer_id LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN users ru ON ru.id=d.rider_id LEFT JOIN riders rr ON rr.user_id=d.rider_id LEFT JOIN LATERAL (SELECT status,response_deadline_at,pickup_deadline_at FROM rider_assignments WHERE delivery_id=d.id AND rider_id=d.rider_id ORDER BY created_at DESC LIMIT 1) ra ON TRUE WHERE ${conds.join(' AND ')} ORDER BY o.placed_at DESC LIMIT ${params.length+1} OFFSET ${params.length+2}`,[...params,limit_,off]);
  return rows;
}

const TRANSITIONS = { pending:{customer:['cancelled'],vendor:['accepted','cancelled']}, accepted:{customer:['cancelled'],vendor:['preparing','cancelled']}, preparing:{vendor:['awaiting_rider']}, awaiting_rider:{rider:['rider_assigned']}, rider_assigned:{rider:['picked_up']}, picked_up:{rider:['on_the_way']}, on_the_way:{rider:['delivered']} };
const ALL_STATUSES=['pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way','delivered','cancelled'];
async function _loadOrderForMutation(orderId){const {rows}=await query(`SELECT o.*,d.id AS delivery_id,d.rider_id FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1`,[orderId]);if(!rows.length)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');return rows[0];}
function _assertTransitionAllowed(order,targetStatus,userId,roles){const isAdmin=(roles||[]).some(r=>['admin','super_admin'].includes(r));if(isAdmin){if(!ALL_STATUSES.includes(targetStatus))throw new AppError('Invalid status.',400,'INVALID_STATUS');return;}const isCustomer=(roles||[]).includes('customer')&&String(order.customer_id)===String(userId);const isVendor=(roles||[]).includes('vendor')&&String(order.vendor_id)===String(userId);const isRider=(roles||[]).includes('rider')&&String(order.rider_id)===String(userId);if(!isCustomer&&!isVendor&&!isRider)throw new AppError('You are not authorized to modify this order.',403,'FORBIDDEN');const step=TRANSITIONS[order.status];if(!step)throw new AppError('Order in status '+order.status+' cannot be changed further.',400,'INVALID_STATUS_TRANSITION');const allowed=[...(isCustomer?(step.customer||[]):[]),...(isVendor?(step.vendor||[]):[]),...(isRider?(step.rider||[]):[])];if(!allowed.includes(targetStatus))throw new AppError('Cannot move order from '+order.status+' to '+targetStatus+'.',400,'INVALID_STATUS_TRANSITION');}

async function settleOrderFinancials(orderId) {
  return withTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT o.*, d.id AS delivery_id, d.rider_id FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1 FOR UPDATE OF o',
      [orderId]);
    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    if (order.status !== 'delivered') return { settled:false, reason:'ORDER_NOT_DELIVERED' };
    if (order.payment_status !== 'confirmed') return { settled:false, reason:'PAYMENT_NOT_CONFIRMED' };

    const { rows: [commission] } = await client.query(
      'SELECT * FROM commission_records WHERE order_id=$1 FOR UPDATE', [orderId]);
    if (!commission) {
      // Never report success when the authoritative settlement row is missing.
      // An operator must reconcile the order before any wallet credit is attempted.
      throw new AppError(
        'The order settlement record is missing. No wallet balances were changed. An Admin must reconcile this order before settlement.',
        409,
        'SETTLEMENT_RECORD_MISSING'
      );
    }
    if (commission.status === 'paid') {
      return { settled:true, alreadySettled:true };
    }
    if (commission.status !== 'pending') {
      throw new AppError('The order settlement record has an unsupported state. No wallet balances were changed.', 409, 'SETTLEMENT_STATE_INVALID');
    }

    const vendorAmount = Number(order.vendor_payout || 0);
    const riderAmount = Number(order.rider_payout || 0);
    const affiliateAmount = Number(order.affiliate_commission_amount || 0);
    const affiliateCommissionPct = Number(order.affiliate_commission_pct || 0);
    const platformNet = Number(order.platform_net_fee || 0);
    const platformFee = Number(order.platform_fee || 0);
    const payoutFeeRecoveryPct = Number(order.payout_fee_recovery_pct || 0);
    const payoutFeeRecoveryAmount = Number(order.payout_fee_recovery_amount || 0);
    const commissionAmounts = [
      vendorAmount, riderAmount, affiliateAmount, platformNet, platformFee, payoutFeeRecoveryAmount,
      Number(commission.vendor_payout), Number(commission.rider_payout),
      Number(commission.affiliate_commission_amount), Number(commission.platform_net_amount),
      Number(commission.commission_amount), Number(commission.order_total),
    ];
    if (commissionAmounts.some(value => !Number.isFinite(value) || value < 0)) {
      throw new AppError('The order contains invalid financial amounts. No wallet balances were changed.', 409, 'SETTLEMENT_AMOUNT_INVALID');
    }
    const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;
    const expectedPayoutRecovery = calculatePayoutFeeRecovery({
      vendorPayout: vendorAmount, riderPayout: riderAmount,
      affiliatePayout: affiliateAmount, pct: payoutFeeRecoveryPct,
    });
    if (!sameMoney(expectedPayoutRecovery.payoutFeeRecoveryAmount, payoutFeeRecoveryAmount)) {
      throw new AppError('The order payout cost recovery snapshot does not match its payout amounts. No wallet balances were changed.', 409, 'SETTLEMENT_PAYOUT_RECOVERY_MISMATCH');
    }
    if (affiliateAmount > 0 && !order.affiliate_user_id) {
      throw new AppError('This order has an affiliate reward but no affiliate account. No wallet balances were changed.', 409, 'SETTLEMENT_AFFILIATE_MISSING');
    }
    if (
      String(commission.vendor_id) !== String(order.vendor_id) ||
      String(commission.affiliate_user_id || '') !== String(order.affiliate_user_id || '') ||
      !sameMoney(commission.order_total, order.total) ||
      !sameMoney(commission.commission_amount, platformFee) ||
      !sameMoney(commission.vendor_payout, vendorAmount) ||
      !sameMoney(commission.rider_payout, riderAmount) ||
      !sameMoney(commission.affiliate_commission_amount, affiliateAmount) ||
      !sameMoney(commission.affiliate_commission_pct || 0, affiliateCommissionPct) ||
      !sameMoney(commission.platform_net_amount, platformNet)
    ) {
      throw new AppError('The order and commission ledger do not agree. No wallet balances were changed; Admin reconciliation is required.', 409, 'SETTLEMENT_LEDGER_MISMATCH');
    }
    if (riderAmount > 0 && (!order.rider_id || !order.delivery_id)) {
      throw new AppError('This delivered order has a rider payout but no assigned rider and delivery record. No wallet balances were changed.', 409, 'SETTLEMENT_RIDER_MISSING');
    }

    if (vendorAmount > 0) {
      let { rows: [vendorWallet] } = await client.query(
        'SELECT id FROM wallets WHERE user_id=$1 FOR UPDATE', [order.vendor_id]);
      if (!vendorWallet) {
        ({ rows: [vendorWallet] } = await client.query(
          "INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING id",
          [order.vendor_id]));
      }
      const { rows: [credited] } = await client.query(
        'UPDATE wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING balance',
        [vendorAmount, vendorWallet.id]);
      await client.query(
        "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','vendor_sale',$2,$3,'order_vendor_payout',$4,'MarketLink vendor payout credited to DAHA Wallet')",
        [vendorWallet.id, vendorAmount, credited.balance, orderId]);
      await client.query(
        'UPDATE vendors SET total_sales=COALESCE(total_sales,0)+1,total_revenue=COALESCE(total_revenue,0)+$1,updated_at=now() WHERE user_id=$2',
        [vendorAmount,order.vendor_id]);
    }

    if (order.rider_id && riderAmount > 0) {
      let { rows: [riderWallet] } = await client.query(
        'SELECT id FROM wallets WHERE user_id=$1 FOR UPDATE', [order.rider_id]);
      if (!riderWallet) {
        ({ rows: [riderWallet] } = await client.query(
          "INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING id",
          [order.rider_id]));
      }
      const { rows: [credited] } = await client.query(
        'UPDATE wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING balance',
        [riderAmount, riderWallet.id]);
      await client.query(
        "INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','delivery_earning',$2,$3,'order_rider_payout',$4,'MarketLink delivery earning credited to DAHA Wallet')",
        [riderWallet.id, riderAmount, credited.balance, orderId]);
      await client.query(
        "INSERT INTO rider_earnings (rider_id,delivery_id,order_id,amount,type,description,paid_at) VALUES($1,(SELECT id FROM deliveries WHERE order_id=$2),$2,$3,'delivery','Delivery earning credited to DAHA Wallet',now())",
        [order.rider_id, orderId, riderAmount]);
      await client.query(
        'UPDATE riders SET total_earnings=COALESCE(total_earnings,0)+$1,total_deliveries=total_deliveries+1 WHERE user_id=$2',
        [riderAmount, order.rider_id]);
      await client.query(
        "INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES($1,'wallet_funded','DAHA Wallet delivery earning',$2,'order',$3)",
        [order.rider_id, 'Your delivery earning of D ' + riderAmount.toFixed(2) + ' was credited to DAHA Wallet.', orderId]);
    }

    if (order.affiliate_user_id && affiliateAmount > 0) {
      let { rows: [affiliateWallet] } = await client.query(
        'SELECT id FROM wallets WHERE user_id=$1 FOR UPDATE', [order.affiliate_user_id]);
      if (!affiliateWallet) {
        ({ rows: [affiliateWallet] } = await client.query(
          "INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING id",
          [order.affiliate_user_id]));
      }
      const { rows: [credited] } = await client.query(
        'UPDATE wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING balance',
        [affiliateAmount, affiliateWallet.id]);
      await client.query(
        `INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','affiliate_commission',$2,$3,'order_affiliate_payout',$4,'MarketLink affiliate commission (${affiliateCommissionPct}%) credited to DAHA Wallet')`,
        [affiliateWallet.id, affiliateAmount, credited.balance, orderId]);
      await client.query(
        'UPDATE affiliates SET total_earnings=COALESCE(total_earnings,0)+$1,total_orders=total_orders+1 WHERE user_id=$2',
        [affiliateAmount, order.affiliate_user_id]);
      await client.query(
        `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id) VALUES($1,'affiliate_reward','You earned a ${affiliateCommissionPct}% affiliate commission',$2,'order',$3)`,
        [order.affiliate_user_id, 'D ' + affiliateAmount.toFixed(2) + ' (' + affiliateCommissionPct + '% commission) was credited to your DAHA Wallet after successful delivery and payment.', orderId]);
    }

    await client.query(
      "INSERT INTO platform_earnings (order_id,gross_merchandise,discount_amount,commission_pct,commission_amount,payout_fee_recovery_pct,payout_fee_recovery_amount,status,earned_at) VALUES($1,$2,$3,$4,$5,$6,$7,'earned',now()) ON CONFLICT (order_id) DO UPDATE SET commission_amount=EXCLUDED.commission_amount,payout_fee_recovery_pct=EXCLUDED.payout_fee_recovery_pct,payout_fee_recovery_amount=EXCLUDED.payout_fee_recovery_amount,status='earned'",
      [orderId, Number(order.subtotal), Number(order.discount_amount || 0), Number(order.platform_fee_pct || 0), platformNet, payoutFeeRecoveryPct, payoutFeeRecoveryAmount]);
    await client.query("UPDATE commission_records SET status='paid' WHERE id=$1", [commission.id]);

    return {
      settled:true,
      vendorPayout:vendorAmount,
      riderPayout:riderAmount,
      affiliatePayout:affiliateAmount,
      platformNet:platformNet,
      payoutFeeRecoveryAmount:payoutFeeRecoveryAmount,
    };
  });
}

async function updateStatus(orderId,status,userId,roles,note){
  if(!ALL_STATUSES.includes(status))throw new AppError('Invalid status.',400,'INVALID_STATUS');
  const order=await _loadOrderForMutation(orderId);
  _assertTransitionAllowed(order,status,userId,roles);
  if(order.status===status)return order;
  if(status==='cancelled'&&order.payment_method&&order.payment_method!=='cod'&&order.payment_status!=='confirmed'){
    const {rows:[pendingPayment]}=await query("SELECT id FROM payments WHERE order_id=$1 AND method<>'cod' AND status='pending' LIMIT 1",[orderId]);
    if(pendingPayment)throw new AppError('A mobile-money payment is still processing. Check its status before cancelling this order.',409,'PAYMENT_ATTEMPT_PENDING');
  }
  if(status==='cancelled'&&order.payment_status==='confirmed'){
    throw new AppError('This order has a confirmed payment and cannot be cancelled until a supported refund is processed.',409,'PAYMENT_REFUND_REQUIRED');
  }

  const result=await withTransaction(async(client)=>{
    // For cancellation, serialize against provider confirmation using the order
    // row as the first lock in both flows. Recheck payment state inside the
    // transaction; the earlier preflight read can become stale.
    if(status==='cancelled'){
      const {rows:[lockedOrder]}=await client.query(
        'SELECT id,status,payment_status,payment_method FROM orders WHERE id=$1 FOR UPDATE',[orderId]
      );
      if(!lockedOrder||lockedOrder.status!==order.status){
        throw new AppError('This order was updated by another action. Refresh and try again.',409,'ORDER_STATE_CHANGED');
      }
      if(lockedOrder.payment_status==='confirmed'){
        throw new AppError('This order has a confirmed payment and cannot be cancelled until a supported refund is processed.',409,'PAYMENT_REFUND_REQUIRED');
      }
      if(lockedOrder.payment_method&&lockedOrder.payment_method!=='cod'){
        const {rows:[pendingPayment]}=await client.query(
          "SELECT id FROM payments WHERE order_id=$1 AND method<>'cod' AND status='pending' FOR UPDATE",[orderId]
        );
        if(pendingPayment)throw new AppError('A mobile-money payment is still processing. Check its status before cancelling this order.',409,'PAYMENT_ATTEMPT_PENDING');
      }
    }
    // Optimistic concurrency guard: only the state we validated above may be
    // changed. PostgreSQL rechecks this predicate after any competing update.
    const {rows:[updatedOrder]}=await client.query(
      'UPDATE orders SET status=$1 WHERE id=$2 AND status=$3 RETURNING *',
      [status,orderId,order.status]
    );
    if(!updatedOrder){
      throw new AppError('This order was updated by another action. Refresh the vendor dashboard and try again.',409,'ORDER_STATE_CHANGED');
    }

    await client.query(
      'INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',
      [orderId,status,userId,note||null]
    );
    if(status==='delivered'){
      await client.query('UPDATE orders SET delivered_at=now() WHERE id=$1',[orderId]);
      await client.query("UPDATE deliveries SET status='delivered',delivered_at=now() WHERE order_id=$1",[orderId]);
    }
    if(status==='rider_assigned')await client.query("UPDATE deliveries SET status='assigned' WHERE order_id=$1",[orderId]);
    if(status==='awaiting_rider'){
      const { rows: [delivery] } = await client.query(
        `SELECT d.id AS delivery_id,d.rider_id,o.order_number,
                r.kyc_status,r.is_online,
                EXISTS(
                  SELECT 1 FROM deliveries active
                  WHERE active.rider_id=d.rider_id AND active.id<>d.id
                    AND (active.status IN ('assigned','picked_up','in_transit') OR (active.status='unassigned' AND EXISTS (
                       SELECT 1 FROM orders reserved_order
                       WHERE reserved_order.id=active.order_id
                         AND reserved_order.status IN ('pending','accepted','preparing','awaiting_rider','rider_assigned')
                     )))
                ) AS rider_busy
         FROM deliveries d JOIN orders o ON o.id=d.order_id
         LEFT JOIN riders r ON r.user_id=d.rider_id
         WHERE d.order_id=$1 FOR UPDATE OF d`,
        [orderId]
      );
      if(delivery&&delivery.rider_id&&delivery.kyc_status==='approved'&&delivery.is_online&&!delivery.rider_busy){
        await client.query(
          "UPDATE deliveries SET status='assigned',next_auto_dispatch_at=NULL WHERE id=$1 AND status='unassigned'",
          [delivery.delivery_id]
        );
        await client.query(
          "UPDATE rider_assignments SET response_deadline_at=now()+interval '90 seconds',reminder_1_sent_at=NULL,reminder_2_sent_at=NULL WHERE delivery_id=$1 AND rider_id=$2 AND status='pending'",
          [delivery.delivery_id,delivery.rider_id]
        );
        await client.query(
          `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
           VALUES ($1,'delivery_assigned','Your delivery request is ready 🛵',$2,'delivery',$3)`,
          [delivery.rider_id,'The vendor has prepared order '+delivery.order_number+' and marked it ready. Accept or decline the delivery request in your Rider Dashboard.',delivery.delivery_id]
        );
      }else if(delivery&&delivery.rider_id){
        // The quote remains locked, but the first-choice rider is no longer
        // available. Let the vendor reassign to a rider with the same tariff.
        await client.query(
          "UPDATE rider_assignments SET status='reassigned',responded_at=now() WHERE delivery_id=$1 AND rider_id=$2 AND status='pending'",
          [delivery.delivery_id,delivery.rider_id]
        );
        await client.query(
          "UPDATE deliveries SET rider_id=NULL,status='unassigned',next_auto_dispatch_at=now()+interval '1 second',auto_dispatch_attempts=COALESCE(auto_dispatch_attempts,0)+1 WHERE id=$1",
          [delivery.delivery_id]
        );
        await client.query(
          `INSERT INTO notifications (user_id,type,title,body,reference_type,reference_id)
           VALUES ($1,'delivery_rider_unavailable','Selected rider unavailable','The customer-selected rider is no longer online or is busy. Please assign another rider with the same approved delivery fee.','order',$2)`,
          [updatedOrder.vendor_id,orderId]
        );
      }
    }
    if(status==='picked_up')await client.query("UPDATE deliveries SET status='picked_up',picked_up_at=now() WHERE order_id=$1",[orderId]);
    if(status==='on_the_way')await client.query("UPDATE deliveries SET status='in_transit' WHERE order_id=$1",[orderId]);
    if(status==='cancelled'){
      const {rows:items}=await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);
      for(const item of items){
        await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND variant_id IS NULL AND quantity IS NOT NULL',[item.quantity,item.product_id]);
      }
      await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);
    }
    if(status==='delivered'||status==='cancelled'){
      await client.query(
        "UPDATE riders SET location_sharing_enabled=FALSE,location_sharing_delivery_id=NULL,current_lat=NULL,current_lng=NULL,last_location_at=NULL WHERE location_sharing_delivery_id IN (SELECT id FROM deliveries WHERE order_id=$1)",
        [orderId]
      );
    }
    if(status==='awaiting_rider'){
      const { rows:[deliveryState] }=await client.query(
        'SELECT id,status,rider_id FROM deliveries WHERE order_id=$1 LIMIT 1',
        [orderId]
      );
      updatedOrder.delivery_id=deliveryState&&deliveryState.id||null;
      updatedOrder.delivery_status=deliveryState&&deliveryState.status||null;
      updatedOrder.delivery_rider_id=deliveryState&&deliveryState.rider_id||null;
    }
    return updatedOrder;
  });

  if(status==='awaiting_rider'){
    try{
      const {rows:[vendor]}=await query(
        'SELECT u.id,u.phone,u.email,o.order_number FROM orders o JOIN users u ON u.id=o.vendor_id WHERE o.id=$1',
        [orderId]
      );
      if(vendor){
        const assigned=Boolean(result.delivery_rider_id);
        await notificationsService.send({
          userId:vendor.id,
          type:assigned?'order_ready_rider_requested':'order_ready_auto_dispatch_started',
          title:assigned?'Order ready — rider request sent':'Order ready — finding a rider',
          body:assigned
            ?'Order '+vendor.order_number+' is ready. The selected rider has been asked to accept; MarketLink will remind them and automatically seek a replacement if they miss the deadline.'
            :'Order '+vendor.order_number+' is ready. The selected rider is unavailable, so MarketLink has started automatic replacement search. You can also assign another rider manually.',
          referenceType:'order',referenceId:orderId,
          channels:{push:true,sms:true,phone:vendor.phone||null,email:!!(vendor.email&&(process.env.RESEND_API_KEY||process.env.SENDGRID_API_KEY)),emailAddress:vendor.email||null,
            data:{orderId:String(orderId),orderNumber:String(vendor.order_number)}}
        });
      }
      if(result.delivery_rider_id){
        await notificationsService.pushToUser(result.delivery_rider_id,{
          title:'Order ready — accept delivery',
          body:'The vendor has prepared order '+(vendor&&vendor.order_number||'')+'. Please accept or decline the delivery request promptly.',
          data:{orderId:String(orderId),deliveryId:String(result.delivery_id||'')}
        }).catch(()=>null);
      }
    }catch(error){logger.warn('Vendor or rider ready-for-dispatch alert deferred',{orderId,error:error.message});}
  }
  if(status==='delivered')await settleOrderFinancials(orderId);
  return result;
}
async function vendorAccept(orderId,vendorUserId,roles){return updateStatus(orderId,'accepted',vendorUserId,roles,'Accepted by vendor');}
async function vendorReject(orderId,vendorUserId,roles,reason){return updateStatus(orderId,'cancelled',vendorUserId,roles,reason||'Rejected by vendor');}
async function cancel(orderId,userId,roles,reason){return updateStatus(orderId,'cancelled',userId,roles,reason||'Cancelled');}

module.exports={quoteDeliveryOptions,placeOrder,getById,listForCustomer,listForVendor,updateStatus,vendorAccept,vendorReject,cancel,settleOrderFinancials,buildCheckoutFingerprint};