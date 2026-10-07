'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
function genNum() { return `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,'0')}`; }

async function placeOrder({ customerId, vendorId, items, deliveryAddressId, paymentMethod, couponCode, affiliateCode }) {
  if (!Array.isArray(items) || !items.length) throw new AppError('Order must contain at least one item.',400,'EMPTY_ORDER');
  if (!vendorId) throw new AppError('Vendor is required.',400,'VENDOR_REQUIRED');
  for (const item of items) {
    if (!item || !item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
      throw new AppError('Each order item must have a valid product and positive integer quantity.',400,'INVALID_ORDER_ITEM');
    }
  }

  return withTransaction(async (client) => {
    let sub=0; const lines=[];
    const lockedProductIds = new Set();
    for (const item of items) {
      const qty = Number(item.quantity);
      const { rows:[p] } = await client.query('SELECT id,vendor_id,name,price,status FROM products WHERE id=$1 FOR UPDATE',[item.productId]);
      if (!p || p.status!=='active') throw new AppError(`Product ${item.productId} unavailable.`,400,'PRODUCT_UNAVAILABLE');
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
    const fee = Number(process.env.MARKETLINK_BASE_DELIVERY_FEE_GMD || 25);
    const commPct = Number(process.env.MARKETLINK_PLATFORM_COMMISSION_PCT || 5);
    const affiliateDefaultPct = Number(process.env.MARKETLINK_AFFILIATE_COMMISSION_PCT || 2);
    if (!Number.isFinite(fee) || fee < 0) throw new AppError('Invalid delivery fee configuration.',500,'FEE_CONFIG_ERROR');
    if (!Number.isFinite(commPct) || commPct < 0 || commPct > 20) throw new AppError('Invalid platform commission configuration.',500,'FEE_CONFIG_ERROR');
    if (!Number.isFinite(affiliateDefaultPct) || affiliateDefaultPct < 0 || affiliateDefaultPct > commPct) throw new AppError('Invalid affiliate commission configuration.',500,'FEE_CONFIG_ERROR');

    const discountedSubtotal = Math.max(0, sub-discount);
    const platFee = parseFloat((discountedSubtotal*commPct/100).toFixed(2));

    // Affiliate reward is funded entirely from MarketLink's commission, never added to customer checkout.
    let affiliate=null;
    let affiliatePct=0;
    if (affiliateCode) {
      const { rows:[a] } = await client.query('SELECT user_id,affiliate_code,commission_pct FROM affiliates WHERE affiliate_code=$1',[String(affiliateCode).trim().toUpperCase()]);
      if (a && a.user_id !== customerId) {
        affiliate=a;
        affiliatePct=Math.min(Number(a.commission_pct || affiliateDefaultPct), commPct);
      }
    }
    const affiliateAmount = affiliate ? parseFloat((discountedSubtotal*affiliatePct/100).toFixed(2)) : 0;
    const platformNetFee = parseFloat(Math.max(0,platFee-affiliateAmount).toFixed(2));
    const vendorPayout = parseFloat((discountedSubtotal-platFee).toFixed(2));
    const riderPayout = parseFloat(fee.toFixed(2));
    const total = parseFloat((discountedSubtotal+fee).toFixed(2));

    const { rows:[order] } = await client.query(
      "INSERT INTO orders (order_number,customer_id,vendor_id,delivery_address_id,payment_method,subtotal,delivery_fee,discount_amount,platform_fee,platform_fee_pct,vendor_payout,rider_payout,total,coupon_id,affiliate_user_id,affiliate_commission_pct,affiliate_commission_amount,platform_net_fee,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending','pending') RETURNING *",
      [genNum(),customerId,vendorId,deliveryAddressId||null,paymentMethod,sub,fee,discount,platFee,commPct,vendorPayout,riderPayout,total,coupon?.id||null,affiliate?.user_id||null,affiliatePct,affiliateAmount,platformNetFee]);
    for (const li of lines) await client.query("INSERT INTO order_items (order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6)",[order.id,li.productId,li.name,li.price,li.qty,li.lt]);
    for (const item of items) {
      const { rows:[updated] } = await client.query("UPDATE inventory SET quantity=quantity-$1 WHERE product_id=$2 AND variant_id IS NULL AND quantity>=$1 RETURNING quantity",[Number(item.quantity),item.productId]);
      if (!updated) throw new AppError(`Insufficient stock for ${item.productId}.`,400,'INSUFFICIENT_STOCK');
    }
    if (coupon) await client.query("INSERT INTO coupon_redemptions (coupon_id,customer_id,order_id) VALUES($1,$2,$3)",[coupon.id,customerId,order.id]);
    // total_orders is a settled-order metric; it is incremented only by settleOrderFinancials().
    await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES($1,'pending','Order placed')",[order.id]);
    await client.query("INSERT INTO deliveries (order_id,status) VALUES($1,'unassigned')",[order.id]);
    await client.query("INSERT INTO commission_records (order_id,vendor_id,order_total,commission_pct,commission_amount,vendor_payout,rider_payout,platform_fee_pct,affiliate_user_id,affiliate_commission_pct,affiliate_commission_amount,platform_net_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[order.id,vendorId,total,commPct,platFee,vendorPayout,riderPayout,commPct,affiliate?.user_id||null,affiliatePct,affiliateAmount,platformNetFee]);
    return { order, lineItems: lines };
  });
}

async function getById(id, userId, roles) {
  const { rows } = await query(`SELECT o.*,u.full_name AS customer_name,v.business_name AS vendor_name,json_agg(json_build_object('name',oi.product_name_snapshot,'qty',oi.quantity,'price',oi.unit_price_snapshot,'total',oi.line_total)) AS items,d.id AS delivery_id,d.status AS delivery_status,d.rider_id FROM orders o JOIN users u ON u.id=o.customer_id JOIN vendors v ON v.user_id=o.vendor_id JOIN order_items oi ON oi.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1 GROUP BY o.id,u.full_name,v.business_name,d.status,d.rider_id`,[id]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  const o=rows[0]; const adm=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!adm && o.customer_id!==userId && o.vendor_id!==userId && o.rider_id!==userId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  return o;
}
async function listForCustomer(customerId, { page=1, limit=20, status }) {
  const off=(page-1)*limit, conds=['o.customer_id=$1'], params=[customerId];
  if (status) { conds.push(`o.status=${params.length+1}`); params.push(status); }
  const { rows } = await query(`
    SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.placed_at,
           v.business_name AS vendor_name,
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
    GROUP BY o.id, v.business_name
    ORDER BY o.placed_at DESC
    LIMIT ${params.length+1} OFFSET ${params.length+2}
  `,[...params,limit,off]);
  return rows;
}
async function listForVendor(vendorId, { page=1, limit=20, status }) {
  const off=(page-1)*limit, conds=['o.vendor_id=$1'], params=[vendorId];
  if (status) { conds.push(`o.status=$${params.length+1}`); params.push(status); }
  const { rows } = await query(`SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.payment_status,o.placed_at,u.full_name AS customer_name,d.status AS delivery_status,d.rider_id FROM orders o JOIN users u ON u.id=o.customer_id LEFT JOIN deliveries d ON d.order_id=o.id WHERE ${conds.join(' AND ')} ORDER BY o.placed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,off]);
  return rows;
}

const TRANSITIONS = { pending:{vendor:['accepted','cancelled']}, accepted:{vendor:['preparing','cancelled']}, preparing:{vendor:['awaiting_rider']}, awaiting_rider:{rider:['rider_assigned']}, rider_assigned:{rider:['picked_up']}, picked_up:{rider:['on_the_way']}, on_the_way:{rider:['delivered']} };
const ALL_STATUSES=['pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way','delivered','cancelled'];
async function _loadOrderForMutation(orderId){const {rows}=await query(`SELECT o.*,d.id AS delivery_id,d.rider_id FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1`,[orderId]);if(!rows.length)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');return rows[0];}
function _assertTransitionAllowed(order,targetStatus,userId,roles){const isAdmin=(roles||[]).some(r=>['admin','super_admin'].includes(r));if(isAdmin){if(!ALL_STATUSES.includes(targetStatus))throw new AppError('Invalid status.',400,'INVALID_STATUS');return;}const isVendor=(roles||[]).includes('vendor')&&order.vendor_id===userId;const isRider=(roles||[]).includes('rider')&&order.rider_id===userId;if(!isVendor&&!isRider)throw new AppError('You are not authorized to modify this order.',403,'FORBIDDEN');const step=TRANSITIONS[order.status];if(!step)throw new AppError(`Order in status "${order.status}" cannot be changed further.`,400,'INVALID_STATUS_TRANSITION');const allowed=[...(isVendor?(step.vendor||[]):[]),...(isRider?(step.rider||[]):[])];if(!allowed.includes(targetStatus))throw new AppError(`Cannot move order from "${order.status}" to "${targetStatus}".`,400,'INVALID_STATUS_TRANSITION');}

async function settleOrderFinancials(orderId){return withTransaction(async(client)=>{
  const {rows:[order]}=await client.query(`SELECT o.*,d.rider_id FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1 FOR UPDATE`,[orderId]);
  if(!order)throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  if(order.payment_status!=='confirmed')return{settled:false,reason:'PAYMENT_NOT_CONFIRMED'};
  const {rows:[commission]}=await client.query('SELECT * FROM commission_records WHERE order_id=$1 FOR UPDATE',[orderId]);
  if(!commission||commission.status==='paid')return{settled:true,alreadySettled:true};

  const vendorAmount=Number(order.vendor_payout||0),riderAmount=Number(order.rider_payout||0),affiliateAmount=Number(order.affiliate_commission_amount||0),platformNet=Number(order.platform_net_fee||0);
  let {rows:[vendorWallet]}=await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',[order.vendor_id]);
  if(!vendorWallet){({rows:[vendorWallet]}=await client.query("INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING *",[order.vendor_id]));}
  const vendorNext=Number(vendorWallet.balance)+vendorAmount;
  await client.query('UPDATE wallets SET balance=$1,updated_at=now() WHERE id=$2',[vendorNext,vendorWallet.id]);
  await client.query(`INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','vendor_sale',$2,$3,'order_vendor_payout',$4,'MarketLink vendor payout')`,[vendorWallet.id,vendorAmount,vendorNext,orderId]);

  if(order.rider_id&&riderAmount>0){let {rows:[riderWallet]}=await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',[order.rider_id]);if(!riderWallet){({rows:[riderWallet]}=await client.query("INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING *",[order.rider_id]));}const riderNext=Number(riderWallet.balance)+riderAmount;await client.query('UPDATE wallets SET balance=$1,updated_at=now() WHERE id=$2',[riderNext,riderWallet.id]);await client.query(`INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','delivery_earning',$2,$3,'order_rider_payout',$4,'MarketLink delivery payout')`,[riderWallet.id,riderAmount,riderNext,orderId]);await client.query(`INSERT INTO rider_earnings (rider_id,delivery_id,order_id,amount,type,description,paid_at) VALUES($1,(SELECT id FROM deliveries WHERE order_id=$2),$2,$3,'delivery','MarketLink delivery payout',now())`,[order.rider_id,orderId,riderAmount]);await client.query('UPDATE riders SET total_earnings=COALESCE(total_earnings,0)+$1,total_deliveries=COALESCE(total_deliveries,0)+1 WHERE user_id=$2',[riderAmount,order.rider_id]);}

  if(order.affiliate_user_id&&affiliateAmount>0){let {rows:[affiliateWallet]}=await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',[order.affiliate_user_id]);if(!affiliateWallet){({rows:[affiliateWallet]}=await client.query("INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,'GMD') RETURNING *",[order.affiliate_user_id]));}const next=Number(affiliateWallet.balance)+affiliateAmount;await client.query('UPDATE wallets SET balance=$1,updated_at=now() WHERE id=$2',[next,affiliateWallet.id]);await client.query(`INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES($1,'credit','affiliate_commission',$2,$3,'order_affiliate_payout',$4,'MarketLink affiliate commission')`,[affiliateWallet.id,affiliateAmount,next,orderId]);await client.query('UPDATE affiliates SET total_earnings=COALESCE(total_earnings,0)+$1,total_orders=total_orders+1 WHERE user_id=$2',[affiliateAmount,order.affiliate_user_id]);}

  await client.query(`INSERT INTO platform_earnings (order_id,gross_merchandise,discount_amount,commission_pct,commission_amount,status,earned_at) VALUES($1,$2,$3,$4,$5,'earned',now()) ON CONFLICT (order_id) DO UPDATE SET commission_amount=EXCLUDED.commission_amount,status='earned'`,[orderId,Number(order.subtotal),Number(order.discount_amount||0),Number(order.platform_fee_pct||0),platformNet]);
  await client.query("UPDATE commission_records SET status='paid' WHERE id=$1",[commission.id]);
  return{settled:true,vendorPayout:vendorAmount,riderPayout:riderAmount,affiliatePayout:affiliateAmount,platformNet:platformNet};
});}

async function updateStatus(orderId,status,userId,roles,note){if(!ALL_STATUSES.includes(status))throw new AppError('Invalid status.',400,'INVALID_STATUS');const order=await _loadOrderForMutation(orderId);_assertTransitionAllowed(order,status,userId,roles);if(status==='cancelled'&&order.payment_status==='confirmed')throw new AppError('This order has a confirmed payment and cannot be cancelled until a supported refund is processed.',409,'PAYMENT_REFUND_REQUIRED');const result=await withTransaction(async(client)=>{const {rows:[o]}=await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',[status,orderId]);await client.query('INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[orderId,status,userId,note||null]);if(status==='delivered'){await client.query('UPDATE orders SET delivered_at=now() WHERE id=$1',[orderId]);await client.query("UPDATE deliveries SET status='delivered',delivered_at=now() WHERE order_id=$1",[orderId]);}if(status==='rider_assigned')await client.query("UPDATE deliveries SET status='assigned' WHERE order_id=$1",[orderId]);if(status==='picked_up')await client.query("UPDATE deliveries SET status='picked_up',picked_up_at=now() WHERE order_id=$1",[orderId]);if(status==='on_the_way')await client.query("UPDATE deliveries SET status='in_transit' WHERE order_id=$1",[orderId]);if(status==='cancelled'){const {rows:items}=await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);for(const it of items)await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND quantity IS NOT NULL',[it.quantity,it.product_id]);await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);}return o;});if(status==='delivered')await settleOrderFinancials(orderId);return result;}
async function vendorAccept(orderId,vendorUserId,roles){return updateStatus(orderId,'accepted',vendorUserId,roles,'Accepted by vendor');}
async function vendorReject(orderId,vendorUserId,roles,reason){return updateStatus(orderId,'cancelled',vendorUserId,roles,reason||'Rejected by vendor');}
async function cancel(orderId,userId,roles,reason){return updateStatus(orderId,'cancelled',userId,roles,reason||'Cancelled');}

module.exports={placeOrder,getById,listForCustomer,listForVendor,updateStatus,vendorAccept,vendorReject,cancel,settleOrderFinancials};