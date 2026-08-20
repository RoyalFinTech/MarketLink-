// src/modules/categories/service.js
// Full CRUD for product categories with soft delete, restore, audit logging.
'use strict';

const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ── Slug generator ───────────────────────────────────────────────────
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ── Audit logging ────────────────────────────────────────────────────
async function logAction(actorId, actorRole, action, entityId, before, after, meta = {}) {
  try {
    await query(
      `INSERT INTO admin_action_logs
         (actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent)
       VALUES ($1,$2,$3,'category',$4,$5,$6,$7,$8)`,
      [actorId, actorRole, action, String(entityId),
       before ? JSON.stringify(before) : null,
       after  ? JSON.stringify(after)  : null,
       meta.ip || null, meta.ua || null]
    );
  } catch (err) {
    // Audit failure must never break the primary operation
    logger.error('Audit log write failed', { error: err.message, action, entityId });
  }
}

// ── LIST ─────────────────────────────────────────────────────────────
async function list({ page = 1, limit = 50, search, parentId, includeInactive = false, includeDeleted = false }) {
  const limit_ = Math.min(parseInt(limit) || 50, 200);
  const offset  = (Math.max(parseInt(page) || 1, 1) - 1) * limit_;
  const conditions = [];
  const params = [];
  let pi = 1;

  if (!includeDeleted)   conditions.push('c.deleted_at IS NULL');
  if (!includeInactive)  conditions.push('c.is_active = TRUE');
  if (search) {
    conditions.push(`(name ILIKE $${pi} OR description ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }
  if (parentId !== undefined) {
    if (parentId === null || parentId === 'null') {
      conditions.push('c.parent_id IS NULL');
    } else {
      conditions.push(`c.parent_id = $${pi}`);
      params.push(parseInt(parentId)); pi++;
    }
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT c.*,
              p.name AS parent_name,
              p.slug AS parent_slug,
              (SELECT count(*) FROM categories ch WHERE ch.parent_id = c.id AND ch.deleted_at IS NULL) AS child_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       ${where}
       ORDER BY c.sort_order ASC, c.name ASC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit_, offset]
    ),
    query(`SELECT count(*) FROM categories c ${where}`, params),
  ]);

  return {
    items: dataRes.rows,
    total: parseInt(countRes.rows[0].count),
    page: parseInt(page),
    limit: limit_,
    totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limit_),
  };
}

// ── GET BY ID ────────────────────────────────────────────────────────
async function getById(id) {
  const { rows } = await query(
    `SELECT c.*, p.name AS parent_name, p.slug AS parent_slug
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id
     WHERE c.id = $1`,
    [parseInt(id)]
  );
  if (!rows.length) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
  return rows[0];
}

// ── GET BY SLUG ──────────────────────────────────────────────────────
async function getBySlug(slug) {
  const { rows } = await query(
    `SELECT c.*, p.name AS parent_name, p.slug AS parent_slug
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id
     WHERE c.slug = $1 AND c.deleted_at IS NULL`,
    [slug]
  );
  if (!rows.length) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
  return rows[0];
}

// ── GET TREE (nested structure) ──────────────────────────────────────
async function getTree() {
  const { rows } = await query(
    `SELECT * FROM categories
     WHERE deleted_at IS NULL AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC`
  );
  // Build tree in JS — avoids recursive SQL for portability
  const map = {};
  const roots = [];
  rows.forEach(r => { map[r.id] = { ...r, children: [] }; });
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) {
      map[r.parent_id].children.push(map[r.id]);
    } else {
      roots.push(map[r.id]);
    }
  });
  return roots;
}

// ── CREATE ───────────────────────────────────────────────────────────
async function create(data, actor) {
  const { name, icon, parentId, sortOrder, description, imageUrl, metaTitle, metaDescription } = data;
  if (!name || !name.trim()) throw new AppError('Category name is required.', 400, 'VALIDATION_ERROR');

  let slug = slugify(name.trim());

  // Ensure slug uniqueness by appending a counter if needed
  const { rows: existing } = await query('SELECT id FROM categories WHERE slug LIKE $1', [`${slug}%`]);
  if (existing.length) slug = `${slug}-${existing.length + 1}`;

  // Validate parent exists if provided
  if (parentId) {
    const { rows: parent } = await query('SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL', [parentId]);
    if (!parent.length) throw new AppError('Parent category not found.', 400, 'INVALID_PARENT');
  }

  const { rows: [cat] } = await query(
    `INSERT INTO categories
       (name, slug, icon, parent_id, sort_order, description, image_url, meta_title, meta_description, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING *`,
    [name.trim(), slug, icon || null, parentId || null, sortOrder || 0,
     description || null, imageUrl || null, metaTitle || null, metaDescription || null]
  );

  await logAction(actor.id, actor.role, 'category.created', cat.id, null, cat, actor.meta);
  logger.info('Category created', { id: cat.id, slug: cat.slug, actor: actor.id });
  return cat;
}

// ── UPDATE ───────────────────────────────────────────────────────────
async function update(id, data, actor) {
  const before = await getById(id);
  if (before.deleted_at) throw new AppError('Cannot update a deleted category.', 400, 'CATEGORY_DELETED');

  const allowed = ['name', 'icon', 'parent_id', 'sort_order', 'description',
                   'image_url', 'meta_title', 'meta_description', 'is_active'];
  const sets = [], params = [];
  let pi = 1;

  const fieldMap = {
    name: 'name', icon: 'icon', parentId: 'parent_id', sortOrder: 'sort_order',
    description: 'description', imageUrl: 'image_url',
    metaTitle: 'meta_title', metaDescription: 'meta_description', isActive: 'is_active',
  };

  for (const [jsKey, col] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined) {
      sets.push(`${col} = $${pi++}`);
      params.push(data[jsKey]);
    }
  }

  if (!sets.length) throw new AppError('No valid fields to update.', 400, 'VALIDATION_ERROR');

  // If renaming, regenerate slug
  if (data.name && data.name.trim() !== before.name) {
    const newSlug = slugify(data.name.trim());
    const { rows } = await query('SELECT id FROM categories WHERE slug LIKE $1 AND id != $2', [`${newSlug}%`, parseInt(id)]);
    const finalSlug = rows.length ? `${newSlug}-${rows.length + 1}` : newSlug;
    sets.push(`slug = $${pi++}`);
    params.push(finalSlug);
  }

  // Prevent circular parent reference
  if (data.parentId && parseInt(data.parentId) === parseInt(id)) {
    throw new AppError('A category cannot be its own parent.', 400, 'CIRCULAR_REFERENCE');
  }

  params.push(parseInt(id));
  const { rows: [updated] } = await query(
    `UPDATE categories SET ${sets.join(', ')} WHERE id = $${pi} RETURNING *`,
    params
  );
  if (!updated) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');

  await logAction(actor.id, actor.role, 'category.updated', id, before, updated, actor.meta);
  return updated;
}

// ── SOFT DELETE ──────────────────────────────────────────────────────
async function softDelete(id, actor) {
  const before = await getById(id);
  if (before.deleted_at) throw new AppError('Category is already deleted.', 400, 'ALREADY_DELETED');

  // Check for active products in this category
  const { rows: products } = await query(
    `SELECT count(*) FROM products WHERE category_id = $1 AND status = 'active'`,
    [parseInt(id)]
  );
  if (parseInt(products[0].count) > 0) {
    throw new AppError(
      `Cannot delete: ${products[0].count} active product(s) use this category. Move or archive them first.`,
      409, 'CATEGORY_HAS_PRODUCTS'
    );
  }

  const { rows: [deleted] } = await query(
    `UPDATE categories SET deleted_at = now(), is_active = FALSE WHERE id = $1 RETURNING *`,
    [parseInt(id)]
  );

  await logAction(actor.id, actor.role, 'category.deleted', id, before, deleted, actor.meta);
  logger.info('Category soft-deleted', { id, actor: actor.id });
  return deleted;
}

// ── RESTORE ──────────────────────────────────────────────────────────
async function restore(id, actor) {
  const { rows } = await query('SELECT * FROM categories WHERE id = $1 AND deleted_at IS NOT NULL', [parseInt(id)]);
  if (!rows.length) throw new AppError('Deleted category not found.', 404, 'CATEGORY_NOT_FOUND');
  const before = rows[0];

  const { rows: [restored] } = await query(
    `UPDATE categories SET deleted_at = NULL, is_active = TRUE WHERE id = $1 RETURNING *`,
    [parseInt(id)]
  );
  await logAction(actor.id, actor.role, 'category.restored', id, before, restored, actor.meta);
  return restored;
}

// ── REORDER (bulk sort_order update) ────────────────────────────────
async function reorder(items, actor) {
  // items = [{ id, sortOrder }, ...]
  if (!Array.isArray(items) || !items.length) {
    throw new AppError('Items array is required.', 400, 'VALIDATION_ERROR');
  }

  await withTransaction(async (client) => {
    for (const { id, sortOrder } of items) {
      await client.query(
        'UPDATE categories SET sort_order = $1 WHERE id = $2',
        [parseInt(sortOrder), parseInt(id)]
      );
    }
  });

  await logAction(actor.id, actor.role, 'category.reordered', 'bulk',
    null, { items: items.length }, actor.meta);
  return { reordered: items.length };
}

// ── AUDIT LOG for a specific category ───────────────────────────────
async function getAuditLog(id, { page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT l.*, u.full_name AS actor_name
     FROM admin_action_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.entity_type = 'category' AND l.entity_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2 OFFSET $3`,
    [String(id), parseInt(limit), offset]
  );
  return rows;
}

module.exports = { list, getById, getBySlug, getTree, create, update, softDelete, restore, reorder, getAuditLog };
