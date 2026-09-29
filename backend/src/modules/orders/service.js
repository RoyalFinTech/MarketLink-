'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
function genNum() { return `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,'0')}`; }
async function placeOrder({ customerId, vendorId, items, deliveryAddressId, paymentMethod, couponCode }) {
  for (const item of items) {
    const { rows } = await query("SELECT p.status,inv.quantity FROM products p LEFT JOIN inventory inv ON inv.product_id=p.id AND inv.variant_id IS NULL WHERE p.id=$1", [item.productId]);
    if (!rows.length || rows[0].status!=='active') throw new AppError(`Product ${item.productId} unavailable.`,400,'PRODUCT_UNAVAILABLE');
    if (rows[0].quantity!==null && rows[0].quantity < item.quantity) throw new AppError(`Insufficient stock for ${item.productId}.`,400,'INSUFFICIENT_STOCK');
  }
  let coupon=null, discount=0;
  if (couponCode) {
    const { rows:[c] } = await query("SELECT * FROM coupons WHERE code=$1 AND is_active=TRUE AND (expires_at IS NULL OR expires_at>now())", [couponCode]);
    if (!c) throw new AppError('Invalid coupon.',400,'INVALID_COUPON');
    coupon = c;
  }
  return withTransaction(async (client) => {
    let sub=0; const lines=[];
    for (const item of items) {
      const { rows:[p] } = await client.query('SELECT id,name,price FROM products WHERE id=$1',[item.productId]);
      const lt = p.price * item.quantity; sub += lt;
      lines.push({ productId:p.id, name:p.name, price:p.price, qty:item.quantity, lt });
    }
    // Transparent marketplace pricing: vendors set their own retail price.
    // MarketLink earns 5% of discounted merchandise; delivery is a separate customer-facing fee.
    // The delivery fee is reserved for the rider rather than hidden inside the product price.
    const fee = Number(process.env.MARKETLINK_BASE_DELIVERY_FEE_GMD || 25);
    const commPct = Number(process.env.MARKETLINK_PLATFORM_COMMISSION_PCT || 5);
    if (!Number.isFinite(fee) || fee < 0) throw new AppError('Invalid delivery fee configuration.',500,'FEE_CONFIG_ERROR');
    if (!Number.isFinite(commPct) || commPct < 0 || commPct > 20) throw new AppError('Invalid platform commission configuration.',500,'FEE_CONFIG_ERROR');
    if (coupon) discount = coupon.discount_type==='percent' ? parseFloat((sub*coupon.discount_value/100).toFixed(2)) : Math.min(coupon.discount_value,sub);
    const discountedSubtotal = Math.max(0, sub-discount);
    const platFee = parseFloat((discountedSubtotal*commPct/100).toFixed(2));
    const vendorPayout = parseFloat((discountedSubtotal-platFee).toFixed(2));
    const riderPayout = parseFloat(fee.toFixed(2));
    const total = parseFloat((discountedSubtotal+fee).toFixed(2));
    const { rows:[order] } = await client.query(
      "INSERT INTO orders (order_number,customer_id,vendor_id,delivery_address_id,payment_method,subtotal,delivery_fee,discount_amount,platform_fee,platform_fee_pct,vendor_payout,rider_payout,total,coupon_id,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending','pending') RETURNING *",
      [genNum(),customerId,vendorId,deliveryAddressId||null,paymentMethod,sub,fee,discount,platFee,commPct,vendorPayout,riderPayout,total,coupon?.id||null]);
    for (const li of lines) await client.query("INSERT INTO order_items (order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6)",[order.id,li.productId,li.name,li.price,li.qty,li.lt]);
    for (const item of items) await client.query("UPDATE inventory SET quantity=quantity-$1 WHERE product_id=$2 AND quantity>=$1",[item.quantity,item.productId]);
    if (coupon) await client.query("INSERT INTO coupon_redemptions (coupon_id,customer_id,order_id) VALUES($1,$2,$3)",[coupon.id,customerId,order.id]);
    await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES($1,'pending','Order placed')",[order.id]);
    await client.query("INSERT INTO deliveries (order_id,status) VALUES($1,'unassigned')",[order.id]);
    await client.query("INSERT INTO commission_records (order_id,vendor_id,order_total,commission_pct,commission_amount,vendor_payout,rider_payout,platform_fee_pct) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[order.id,vendorId,total,commPct,platFee,vendorPayout,riderPayout,commPct]);
    return { order, lineItems: lines };
  });
}
async function getById(id, userId, roles) {
  const { rows } = await query(`SELECT o.*,u.full_name AS customer_name,v.business_name AS vendor_name,json_agg(json_build_object('name',oi.product_name_snapshot,'qty',oi.quantity,'price',oi.unit_price_snapshot,'total',oi.line_total)) AS items,d.status AS delivery_status,d.rider_id FROM orders o JOIN users u ON u.id=o.customer_id JOIN vendors v ON v.user_id=o.vendor_id JOIN order_items oi ON oi.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=$1 GROUP BY o.id,u.full_name,v.business_name,d.status,d.rider_id`,[id]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  const o=rows[0]; const adm=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!adm && o.customer_id!==userId && o.vendor_id!==userId && o.rider_id!==userId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  return o;
}
async function listForCustomer(customerId, { page=1, limit=20, status }) {
  const off=(page-1)*limit, conds=['o.customer_id=$1'], params=[customerId];
  if (status) { conds.push(`o.status=$${params.length+1}`); params.push(status); }
  const { rows } = await query(`SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.placed_at,v.business_name AS vendor_name FROM orders o JOIN vendors v ON v.user_id=o.vendor_id WHERE ${conds.join(' AND ')} ORDER BY o.placed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,off]);
  return rows;
}
async function listForVendor(vendorId, { page=1, limit=20, status }) {
  const off=(page-1)*limit, conds=['o.vendor_id=$1'], params=[vendorId];
  if (status) { conds.push(`o.status=$${params.length+1}`); params.push(status); }
  const { rows } = await query(
    `SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.payment_status,o.placed_at,
            u.full_name AS customer_name, d.status AS delivery_status, d.rider_id
     FROM orders o
     JOIN users u ON u.id=o.customer_id
     LEFT JOIN deliveries d ON d.order_id=o.id
     WHERE ${conds.join(' AND ')}
     ORDER BY o.placed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit,off]);
  return rows;
}

// Valid forward transitions, keyed by current status → { role: [allowed next statuses] }.
// admin/super_admin may move an order to any of the listed next statuses for any role at that step.
const TRANSITIONS = {
  pending:        { vendor: ['accepted','cancelled'] },
  accepted:       { vendor: ['preparing','cancelled'] },
  preparing:      { vendor: ['awaiting_rider'] },
  awaiting_rider: { rider:  ['rider_assigned'] },
  rider_assigned: { rider:  ['picked_up'] },
  picked_up:      { rider:  ['on_the_way'] },
  on_the_way:     { rider:  ['delivered'] },
};
const ALL_STATUSES = ['pending','accepted','preparing','awaiting_rider','rider_assigned','picked_up','on_the_way','delivered','cancelled'];

async function _loadOrderForMutation(orderId) {
  const { rows } = await query(
    `SELECT o.*, d.id AS delivery_id, d.rider_id
     FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id
     WHERE o.id=$1`, [orderId]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  return rows[0];
}

// Central authorization + state-machine check. Used by every code path that mutates order status,
// including vendor accept/reject and rider delivery-status updates — nothing bypasses this.
function _assertTransitionAllowed(order, targetStatus, userId, roles) {
  const isAdmin = (roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (isAdmin) {
    if (!ALL_STATUSES.includes(targetStatus)) throw new AppError('Invalid status.',400,'INVALID_STATUS');
    return;
  }
  const isVendor = (roles||[]).includes('vendor') && order.vendor_id===userId;
  const isRider  = (roles||[]).includes('rider')  && order.rider_id===userId;
  if (!isVendor && !isRider) throw new AppError('You are not authorized to modify this order.',403,'FORBIDDEN');

  const step = TRANSITIONS[order.status];
  if (!step) throw new AppError(`Order in status "${order.status}" cannot be changed further.`,400,'INVALID_STATUS_TRANSITION');
  const allowedForVendor = isVendor ? (step.vendor||[]) : [];
  const allowedForRider  = isRider  ? (step.rider||[])  : [];
  const allowed = [...allowedForVendor, ...allowedForRider];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(`Cannot move order from "${order.status}" to "${targetStatus}".`,400,'INVALID_STATUS_TRANSITION');
  }
}

async function updateStatus(orderId, status, userId, roles, note) {
  if (!ALL_STATUSES.includes(status)) throw new AppError('Invalid status.',400,'INVALID_STATUS');
  const order = await _loadOrderForMutation(orderId);
  _assertTransitionAllowed(order, status, userId, roles);

  return withTransaction(async (client) => {
    const { rows:[o] } = await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',[status,orderId]);
    await client.query('INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[orderId,status,userId,note||null]);

    if (status==='delivered') {
      await client.query('UPDATE orders SET delivered_at=now() WHERE id=$1',[orderId]);
      await client.query("UPDATE deliveries SET status='delivered',delivered_at=now() WHERE order_id=$1",[orderId]);
    }
    if (status==='rider_assigned') {
      await client.query("UPDATE deliveries SET status='assigned' WHERE order_id=$1",[orderId]);
    }
    if (status==='picked_up') {
      await client.query("UPDATE deliveries SET status='picked_up',picked_up_at=now() WHERE order_id=$1",[orderId]);
    }
    if (status==='on_the_way') {
      await client.query("UPDATE deliveries SET status='in_transit' WHERE order_id=$1",[orderId]);
    }
    if (status==='cancelled') {
      // Restock: return each line item's quantity to inventory since the sale did not complete.
      const { rows: items } = await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);
      for (const it of items) {
        await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND quantity IS NOT NULL',[it.quantity,it.product_id]);
      }
      await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);
    }
    return o;
  });
}

// Vendor-specific convenience wrappers — same authorization + transition logic as updateStatus,
// scoped to the two actions a vendor actually takes on a fresh order.
async function vendorAccept(orderId, vendorUserId, roles) {
  return updateStatus(orderId,'accepted',vendorUserId,roles,'Accepted by vendor');
}
async function vendorReject(orderId, vendorUserId, roles, reason) {
  if (!reason || !reason.trim()) throw new AppError('A rejection reason is required.',400,'REASON_REQUIRED');
  return updateStatus(orderId,'cancelled',vendorUserId,roles,`Rejected by vendor: ${reason}`);
}

async function cancel(orderId, userId, roles, reason) {
  const { rows } = await query('SELECT * FROM orders WHERE id=$1',[orderId]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  const o=rows[0]; const adm=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!adm && o.customer_id!==userId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  if (!['pending','accepted'].includes(o.status)) throw new AppError(`Cannot cancel order with status: ${o.status}.`,400,'CANNOT_CANCEL');
  // Customer cancellation bypasses the vendor/rider transition map (it's a distinct actor path)
  // but reuses the same status-history + restock logic via a direct transaction.
  return withTransaction(async (client) => {
    const { rows:[updated] } = await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',['cancelled',orderId]);
    await client.query('INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[orderId,'cancelled',userId,reason||'Cancelled by customer']);
    const { rows: items } = await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);
    for (const it of items) {
      await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND quantity IS NOT NULL',[it.quantity,it.product_id]);
    }
    await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);
    return updated;
  });
}
module.exports = { placeOrder, getById, listForCustomer, listForVendor, updateStatus, vendorAccept, vendorReject, cancel, settleOrderFinancials };async function settleOrderFinancials(orderId) {
  return withTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      `SELECT o.*, d.rider_id
       FROM orders o
       LEFT JOIN deliveries d ON d.order_id=o.id
       WHERE o.id=$1
       FOR UPDATE`, [orderId]);
    if (!order) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
    if (order.payment_status !== 'confirmed') return { settled:false, reason:'PAYMENT_NOT_CONFIRMED' };

    const { rows: [commission] } = await client.query(
      'SELECT * FROM commission_records WHERE order_id=$1 FOR UPDATE', [orderId]);
    if (!commission || commission.status === 'paid') return { settled:true, alreadySettled:true };

    const vendorAmount = Number(order.vendor_payout || 0);
    const riderAmount = Number(order.rider_payout || 0);

    // Credit vendor exactly once after confirmed payment.
    let { rows: [vendorWallet] } = await client.query(
      'SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE', [order.vendor_id]);
    if (!vendorWallet) {
      ({ rows: [vendorWallet] } = await client.query(
        'INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,\'GMD\') RETURNING *',
        [order.vendor_id]));
    }
    const vendorNext = Number(vendorWallet.balance) + vendorAmount;
    await client.query('UPDATE wallets SET balance=$1,updated_at=now() WHERE id=$2',[vendorNext,vendorWallet.id]);
    await client.query(
      `INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description)
       VALUES($1,'credit','vendor_sale',$2,$3,'order_vendor_payout',$4,'MarketLink vendor payout')`,
      [vendorWallet.id,vendorAmount,vendorNext,orderId]);

    // Credit rider with the full delivery fee. Rider earnings are separate from the vendor sale.
    if (order.rider_id && riderAmount > 0) {
      let { rows: [riderWallet] } = await client.query(
        'SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE', [order.rider_id]);
      if (!riderWallet) {
        ({ rows: [riderWallet] } = await client.query(
          'INSERT INTO wallets (user_id,balance,currency) VALUES($1,0,\'GMD\') RETURNING *',
          [order.rider_id]));
      }
      const riderNext = Number(riderWallet.balance) + riderAmount;
      await client.query('UPDATE wallets SET balance=$1,updated_at=now() WHERE id=$2',[riderNext,riderWallet.id]);
      await client.query(
        `INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description)
         VALUES($1,'credit','delivery_earning',$2,$3,'order_rider_payout',$4,'MarketLink delivery payout')`,
        [riderWallet.id,riderAmount,riderNext,orderId]);
      await client.query(
        `INSERT INTO rider_earnings (rider_id,delivery_id,order_id,amount,type,description,paid_at)
         VALUES($1,(SELECT id FROM deliveries WHERE order_id=$2),$2,$3,'delivery','MarketLink delivery payout',now())`,
        [order.rider_id,orderId,riderAmount]);
      await client.query(
        'UPDATE riders SET total_earnings=COALESCE(total_earnings,0)+$1,total_deliveries=COALESCE(total_deliveries,0)+1 WHERE user_id=$2',
        [riderAmount,order.rider_id]);
    }

    await client.query("UPDATE commission_records SET status='paid' WHERE id=$1",[commission.id]);
    return { settled:true, vendorPayout:vendorAmount, riderPayout:riderAmount };
  });
}

async function updateStatus(orderId, status, userId, roles, note) {
  if (!ALL_STATUSES.includes(status)) throw new AppError('Invalid status.',400,'INVALID_STATUS');
  const order = await _loadOrderForMutation(orderId);
  _assertTransitionAllowed(order, status, userId, roles);

  return withTransaction(async (client) => {
    const { rows:[o] } = await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',[status,orderId]);
    await client.query('INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[orderId,status,userId,note||null]);

    if (status==='delivered') {
      await client.query('UPDATE orders SET delivered_at=now() WHERE id=$1',[orderId]);
      await client.query("UPDATE deliveries SET status='delivered',delivered_at=now() WHERE order_id=$1",[orderId]);
    }
    if (status==='rider_assigned') {
      await client.query("UPDATE deliveries SET status='assigned' WHERE order_id=$1",[orderId]);
    }
    if (status==='picked_up') {
      await client.query("UPDATE deliveries SET status='picked_up',picked_up_at=now() WHERE order_id=$1",[orderId]);
    }
    if (status==='on_the_way') {
      await client.query("UPDATE deliveries SET status='in_transit' WHERE order_id=$1",[orderId]);
    }
    if (status==='cancelled') {
      // Restock: return each line item's quantity to inventory since the sale did not complete.
      const { rows: items } = await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);
      for (const it of items) {
        await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND quantity IS NOT NULL',[it.quantity,it.product_id]);
      }
      await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);
    }
    return o;
  });
}

// Vendor-specific convenience wrappers — same authorization + transition logic as updateStatus,
// scoped to the two actions a vendor actually takes on a fresh order.
async function vendorAccept(orderId, vendorUserId, roles) {
  return updateStatus(orderId,'accepted',vendorUserId,roles,'Accepted by vendor');
}
async function vendorReject(orderId, vendorUserId, roles, reason) {
  if (!reason || !reason.trim()) throw new AppError('A rejection reason is required.',400,'REASON_REQUIRED');
  return updateStatus(orderId,'cancelled',vendorUserId,roles,`Rejected by vendor: ${reason}`);
}

async function cancel(orderId, userId, roles, reason) {
  const { rows } = await query('SELECT * FROM orders WHERE id=$1',[orderId]);
  if (!rows.length) throw new AppError('Order not found.',404,'ORDER_NOT_FOUND');
  const o=rows[0]; const adm=(roles||[]).some(r=>['admin','super_admin'].includes(r));
  if (!adm && o.customer_id!==userId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  if (!['pending','accepted'].includes(o.status)) throw new AppError(`Cannot cancel order with status: ${o.status}.`,400,'CANNOT_CANCEL');
  // Customer cancellation bypasses the vendor/rider transition map (it's a distinct actor path)
  // but reuses the same status-history + restock logic via a direct transaction.
  return withTransaction(async (client) => {
    const { rows:[updated] } = await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',['cancelled',orderId]);
    await client.query('INSERT INTO order_status_history (order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[orderId,'cancelled',userId,reason||'Cancelled by customer']);
    const { rows: items } = await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId]);
    for (const it of items) {
      await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE product_id=$2 AND quantity IS NOT NULL',[it.quantity,it.product_id]);
    }
    await client.query("UPDATE deliveries SET status='cancelled' WHERE order_id=$1 AND status NOT IN ('delivered')",[orderId]);
    return updated;
  });
}
module.exports = { placeOrder, getById, listForCustomer, listForVendor, updateStatus, vendorAccept, vendorReject, cancel };
