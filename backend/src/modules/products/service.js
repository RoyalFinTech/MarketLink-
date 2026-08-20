'use strict';
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
async function list({ page=1, limit=20, search, categoryId, vendorId, minPrice, maxPrice, sort='newest' }) {
  const off = (page-1) * Math.min(limit,100), conds = ["p.status='active'"], params = []; let pi = 1;
  if (search)     { conds.push(`to_tsvector('english', p.name||' '||coalesce(p.description,'')) @@ plainto_tsquery('english',$${pi++})`); params.push(search); }
  if (categoryId) { conds.push(`p.category_id=$${pi++}`); params.push(categoryId); }
  if (vendorId)   { conds.push(`p.vendor_id=$${pi++}`);   params.push(vendorId); }
  if (minPrice)   { conds.push(`p.price>=$${pi++}`);      params.push(minPrice); }
  if (maxPrice)   { conds.push(`p.price<=$${pi++}`);      params.push(maxPrice); }
  const orderMap = { newest:'p.created_at DESC', price_asc:'p.price ASC', price_desc:'p.price DESC', top_rated:'p.rating_avg DESC' };
  const ob = orderMap[sort]||'p.created_at DESC', wh = conds.length ? 'WHERE '+conds.join(' AND ') : '';
  const [d,c] = await Promise.all([
    query(`SELECT p.id,p.name,p.slug,p.price,p.compare_at_price,p.rating_avg,p.rating_count,p.sold_count,c.name AS category_name,v.business_name AS vendor_name,(SELECT image_url FROM product_images WHERE product_id=p.id AND is_primary=TRUE LIMIT 1) AS primary_image,inv.quantity AS stock FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN vendors v ON v.user_id=p.vendor_id LEFT JOIN inventory inv ON inv.product_id=p.id AND inv.variant_id IS NULL ${wh} ORDER BY ${ob} LIMIT $${pi++} OFFSET $${pi++}`, [...params, limit, off]),
    query(`SELECT count(*) FROM products p ${wh}`, params),
  ]);
  return { items: d.rows, total: parseInt(c.rows[0].count), page, limit, totalPages: Math.ceil(parseInt(c.rows[0].count)/limit) };
}
async function getById(id) {
  const { rows } = await query(`SELECT p.*,c.name AS category_name,v.business_name AS vendor_name,inv.quantity AS stock FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN vendors v ON v.user_id=p.vendor_id LEFT JOIN inventory inv ON inv.product_id=p.id AND inv.variant_id IS NULL WHERE p.id=$1`, [id]);
  if (!rows.length) throw new AppError('Product not found.',404,'PRODUCT_NOT_FOUND');
  return rows[0];
}
async function create({ vendorId, categoryId, brandId, name, description, price, compareAtPrice, sku }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Date.now().toString(36);
  const auto = process.env.PRODUCT_AUTO_APPROVE === 'true';
  const { rows: [p] } = await query(`INSERT INTO products (vendor_id,category_id,brand_id,name,slug,description,price,compare_at_price,sku,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [vendorId, categoryId, brandId||null, name, slug, description||null, price, compareAtPrice||null, sku||null, auto?'active':'pending_review']);
  await query('INSERT INTO inventory (product_id,quantity) VALUES($1,0)', [p.id]);
  return p;
}
async function update(id, vendorId, isAdmin, fields) {
  const { rows } = await query('SELECT vendor_id FROM products WHERE id=$1', [id]);
  if (!rows.length) throw new AppError('Product not found.',404,'PRODUCT_NOT_FOUND');
  if (!isAdmin && rows[0].vendor_id !== vendorId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  const allowed = ['name','description','price','compare_at_price','category_id','brand_id','sku'];
  const sets=[], params=[]; let pi=1;
  for (const [k,v] of Object.entries(fields)) { const col=k.replace(/([A-Z])/g,'_$1').toLowerCase(); if(allowed.includes(col)){sets.push(`${col}=$${pi++}`);params.push(v);} }
  if (!sets.length) throw new AppError('No valid fields.',400);
  params.push(id);
  const { rows:[up] } = await query(`UPDATE products SET ${sets.join(',')} WHERE id=$${pi} RETURNING *`, params);
  return up;
}
async function remove(id, vendorId, isAdmin) {
  const { rows } = await query('SELECT vendor_id FROM products WHERE id=$1', [id]);
  if (!rows.length) throw new AppError('Product not found.',404,'PRODUCT_NOT_FOUND');
  if (!isAdmin && rows[0].vendor_id !== vendorId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  await query("UPDATE products SET status='archived' WHERE id=$1", [id]);
}
async function updateInventory(id, vendorId, isAdmin, { quantity, variantId, lowStockThreshold }) {
  const { rows } = await query('SELECT vendor_id FROM products WHERE id=$1', [id]);
  if (!rows.length) throw new AppError('Product not found.',404,'PRODUCT_NOT_FOUND');
  if (!isAdmin && rows[0].vendor_id !== vendorId) throw new AppError('Forbidden.',403,'FORBIDDEN');
  const { rows:[inv] } = await query(`INSERT INTO inventory (product_id,variant_id,quantity,low_stock_threshold) VALUES($1,$2,$3,$4) ON CONFLICT (product_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,low_stock_threshold=coalesce(EXCLUDED.low_stock_threshold,inventory.low_stock_threshold),updated_at=now() RETURNING *`, [id, variantId||null, quantity, lowStockThreshold||5]);
  return inv;
}
async function updateStatus(id, adminId, { status }) {
  const { rows:[p] } = await query("UPDATE products SET status=$1,approved_by=$2,approved_at=now() WHERE id=$3 RETURNING *", [status, adminId, id]);
  if (!p) throw new AppError('Product not found.',404,'PRODUCT_NOT_FOUND');
  return p;
}
module.exports = { list, getById, create, update, remove, updateInventory, updateStatus };
