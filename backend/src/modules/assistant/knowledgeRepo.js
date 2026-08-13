'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Admin knowledge repository — DB-backed layer on top of the static
// 35-entry knowledge base (src/knowledge/marketlink-kb.js, untouched).
//
// IMPORTANT: every read here is wrapped so a DB outage degrades to "no
// admin entries available" rather than crashing the assistant — per the
// spec, the app must keep answering from the static KB even if this
// table/connection is down.
// ═══════════════════════════════════════════════════════════════════════
const { query, withTransaction } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

const VALID_ROLES = ['all', 'customer', 'vendor', 'rider', 'admin'];
const VALID_CATEGORIES = ['general','customer','vendor','rider','orders','payments','wallet','withdrawals','delivery','products','account','notifications','support','policies','troubleshooting','other'];
const VALID_TONES = ['friendly', 'neutral', 'formal'];

// Strip anything that could execute or render as markup. Admin knowledge
// text is later rendered as plain text in the chat UI (already
// HTML-escaped there), but we sanitize at write time too — belt and
// braces — so nothing executable ever ends up stored at all.
function sanitize(text, maxLen) {
  if (text === null || text === undefined) return null;
  let s = String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')       // strip all HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')    // strip inline event handlers like onclick=
    .trim();
  if (maxLen) s = s.slice(0, maxLen);
  return s;
}
function sanitizeList(arr, maxItems = 20, maxLen = 120) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => sanitize(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.title !== undefined) {
    out.title = sanitize(body.title, 200);
    if (!out.title) errors.push('title is required');
  }
  if (!partial || body.question !== undefined) {
    out.question = sanitize(body.question, 500);
    if (!out.question) errors.push('question is required');
  }
  if (!partial || body.answer !== undefined) {
    out.answer = sanitize(body.answer, 4000);
    if (!out.answer) errors.push('answer is required');
  }
  if (!partial || body.category !== undefined) {
    out.category = VALID_CATEGORIES.includes(body.category) ? body.category : 'general';
  }
  if (!partial || body.roles !== undefined) {
    const roles = Array.isArray(body.roles) ? body.roles.filter(r => VALID_ROLES.includes(r)) : [];
    out.roles = roles.length ? roles : ['all'];
  }
  if (!partial || body.details !== undefined) out.details = sanitize(body.details, 4000);
  if (!partial || body.keywords !== undefined) out.keywords = sanitizeList(body.keywords, 30, 60);
  if (!partial || body.synonyms !== undefined) out.synonyms = sanitizeList(body.synonyms, 30, 60);
  if (!partial || body.examples !== undefined) out.examples = sanitizeList(body.examples, 10, 300);
  if (!partial || body.relatedTopics !== undefined) out.related_topics = sanitizeList(body.relatedTopics, 10, 60);
  if (!partial || body.followUps !== undefined) out.follow_ups = sanitizeList(body.followUps, 5, 200);
  if (!partial || body.tone !== undefined) out.tone = VALID_TONES.includes(body.tone) ? body.tone : 'friendly';
  if (!partial || body.priority !== undefined) {
    const p = Number(body.priority);
    out.priority = Number.isFinite(p) ? Math.max(-100, Math.min(100, Math.round(p))) : 0;
  }
  if (!partial || body.status !== undefined) {
    out.status = ['active', 'inactive'].includes(body.status) ? body.status : 'active';
  }

  if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
  return out;
}

async function logAction(actorId, actorRole, action, entityId, before, after) {
  try {
    await query(
      `INSERT INTO admin_action_logs (actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
       VALUES ($1,$2,$3,'knowledge_entry',$4,$5,$6)`,
      [actorId, actorRole, action, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
  } catch (e) {
    logger.warn(`knowledge admin_action_logs write failed: ${e.message}`);
  }
}

async function create(body, actor) {
  const v = validatePayload(body);
  const { rows: [row] } = await query(
    `INSERT INTO knowledge_entries
       (title,category,roles,question,answer,details,keywords,synonyms,examples,related_topics,follow_ups,tone,priority,status,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
     RETURNING *`,
    [v.title, v.category, v.roles, v.question, v.answer, v.details, v.keywords, v.synonyms, v.examples, v.related_topics, v.follow_ups, v.tone, v.priority, v.status, actor.id]);
  await logAction(actor.id, actor.role, 'knowledge.created', row.id, null, row);
  return row;
}

async function update(id, body, actor) {
  const v = validatePayload(body, { partial: true });
  const { rows: existingRows } = await query('SELECT * FROM knowledge_entries WHERE id=$1', [id]);
  if (!existingRows.length) throw new AppError('Knowledge entry not found.', 404, 'KNOWLEDGE_NOT_FOUND');
  const before = existingRows[0];

  const fields = Object.keys(v);
  if (!fields.length) return before;
  const setClauses = fields.map((f, i) => `${f}=$${i + 2}`);
  const values = fields.map(f => v[f]);
  const { rows: [row] } = await query(
    `UPDATE knowledge_entries SET ${setClauses.join(', ')}, updated_by=$${fields.length + 2}, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, ...values, actor.id]);
  await logAction(actor.id, actor.role, 'knowledge.updated', id, before, row);
  return row;
}

async function setStatus(id, status, actor) {
  if (!['active', 'inactive'].includes(status)) throw new AppError('Invalid status.', 400, 'INVALID_STATUS');
  const { rows: existingRows } = await query('SELECT * FROM knowledge_entries WHERE id=$1', [id]);
  if (!existingRows.length) throw new AppError('Knowledge entry not found.', 404, 'KNOWLEDGE_NOT_FOUND');
  const { rows: [row] } = await query(
    `UPDATE knowledge_entries SET status=$1, updated_by=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [status, actor.id, id]);
  await logAction(actor.id, actor.role, status === 'active' ? 'knowledge.activated' : 'knowledge.deactivated', id, existingRows[0], row);
  return row;
}

async function remove(id, actor) {
  const { rows: existingRows } = await query('SELECT * FROM knowledge_entries WHERE id=$1', [id]);
  if (!existingRows.length) throw new AppError('Knowledge entry not found.', 404, 'KNOWLEDGE_NOT_FOUND');
  await query('DELETE FROM knowledge_entries WHERE id=$1', [id]);
  await logAction(actor.id, actor.role, 'knowledge.deleted', id, existingRows[0], null);
  return { id };
}

async function getById(id) {
  const { rows } = await query('SELECT * FROM knowledge_entries WHERE id=$1', [id]);
  if (!rows.length) throw new AppError('Knowledge entry not found.', 404, 'KNOWLEDGE_NOT_FOUND');
  return rows[0];
}

async function list({ page = 1, limit = 20, category, role, status, search } = {}) {
  const off = (page - 1) * limit;
  const conds = []; const params = [];
  if (category) { params.push(category); conds.push(`category=$${params.length}`); }
  if (role)     { params.push(role);     conds.push(`$${params.length}=ANY(roles)`); }
  if (status)   { params.push(status);   conds.push(`status=$${params.length}`); }
  if (search)   { params.push(`%${search.toLowerCase()}%`); conds.push(`(lower(title) LIKE $${params.length} OR lower(question) LIKE $${params.length} OR lower(answer) LIKE $${params.length})`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM knowledge_entries ${where} ORDER BY priority DESC, updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, off]);
  const { rows: [{ count }] } = await query(`SELECT COUNT(*) FROM knowledge_entries ${where}`, params);
  return { rows, total: Number(count) };
}

async function history(id, { page = 1, limit = 20 } = {}) {
  const off = (page - 1) * limit;
  const { rows } = await query(
    `SELECT l.*, u.full_name AS actor_name FROM admin_action_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.entity_type='knowledge_entry' AND l.entity_id=$1
     ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
    [id, limit, off]);
  return rows;
}

// Used by the live matching engine — every request. Fails soft (empty
// array + logged warning) rather than throwing, so the assistant keeps
// working from the static KB alone if the DB/table is unavailable.
async function listActiveForMatching() {
  try {
    const { rows } = await query(`SELECT * FROM knowledge_entries WHERE status='active'`);
    return rows;
  } catch (e) {
    logger.warn(`knowledge_entries unavailable, using static KB only: ${e.message}`);
    return [];
  }
}

module.exports = { create, update, setStatus, remove, getById, list, history, listActiveForMatching, VALID_CATEGORIES, VALID_ROLES, VALID_TONES };
