'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Admin Knowledge Center controller. Mounted from admin/routes.js under
// /api/v1/admin/knowledge — kept in this module (not admin/) because it
// owns the same knowledgeRepo/knowledgeService the assistant itself uses.
// ═══════════════════════════════════════════════════════════════════════
const repo = require('./knowledgeRepo');
const knowledgeService = require('./knowledgeService');
const { AppError } = require('../../middleware/errorHandler');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

function actor(req) {
  const role = (req.user?.roles || []).find(r => ['admin', 'super_admin'].includes(r)) || 'admin';
  return { id: req.user.id, role };
}

exports.list = wrap(async (req, res) => {
  const { rows, total } = await repo.list({
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    category: req.query.category,
    role: req.query.role,
    status: req.query.status,
    search: req.query.search,
  });
  res.json({ success: true, data: rows, meta: { total } });
});

exports.getOne = wrap(async (req, res) => {
  res.json({ success: true, data: await repo.getById(req.params.id) });
});

exports.create = wrap(async (req, res) => {
  const row = await repo.create(req.body, actor(req));
  knowledgeService.invalidateAdminCache();
  res.status(201).json({ success: true, message: 'Knowledge entry created.', data: row });
});

exports.update = wrap(async (req, res) => {
  const row = await repo.update(req.params.id, req.body, actor(req));
  knowledgeService.invalidateAdminCache();
  res.json({ success: true, message: 'Knowledge entry updated.', data: row });
});

exports.setStatus = wrap(async (req, res) => {
  const row = await repo.setStatus(req.params.id, req.body.status, actor(req));
  knowledgeService.invalidateAdminCache();
  res.json({ success: true, message: `Knowledge entry ${req.body.status === 'active' ? 'activated' : 'deactivated'}.`, data: row });
});

exports.remove = wrap(async (req, res) => {
  await repo.remove(req.params.id, actor(req));
  knowledgeService.invalidateAdminCache();
  res.json({ success: true, message: 'Knowledge entry deleted.' });
});

exports.history = wrap(async (req, res) => {
  res.json({ success: true, data: await repo.history(req.params.id, req.query) });
});

// ── "Teach MarketLink something new" ────────────────────────────────
// Turns a free-text statement into a draft knowledge entry using simple,
// transparent heuristics — NOT NLP/AI. The admin still reviews and saves
// it (or the caller can pass save:true to store it directly), so nothing
// goes live without a human decision either way.
const STOPWORDS_FOR_KEYWORDS = new Set(['the','a','an','is','are','can','only','once','it','its','to','of','in','on','for','and','or','may','no','not','has','have']);

function draftFromStatement(text) {
  const clean = String(text || '').trim();
  if (!clean) throw new AppError('Statement text is required.', 400, 'STATEMENT_REQUIRED');
  if (clean.length > 2000) throw new AppError('Statement is too long (max 2000 characters).', 400, 'STATEMENT_TOO_LONG');

  const firstSentence = (clean.match(/^[^.!?]+[.!?]?/) || [clean])[0].trim();
  const title = firstSentence.length > 80 ? firstSentence.slice(0, 77) + '…' : firstSentence;

  const words = clean.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOPWORDS_FOR_KEYWORDS.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const keywords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 8);

  // crude category guess from vocabulary — the admin can always correct it
  const CATEGORY_HINTS = {
    orders: ['order','cancel','checkout','cart'],
    payments: ['pay','payment','stripe','card','cod'],
    wallet: ['wallet','balance'],
    withdrawals: ['withdraw','withdrawal','payout'],
    delivery: ['deliver','rider','pickup','gps'],
    vendor: ['vendor','store','shop'],
    rider: ['rider','driver','courier'],
    account: ['login','register','otp','pin','profile'],
    support: ['support','contact','help'],
  };
  let category = 'general';
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some(h => words.includes(h))) { category = cat; break; }
  }

  return {
    title,
    category,
    roles: ['all'],
    question: title.endsWith('?') ? title : `About: ${title}`,
    answer: clean,
    keywords,
    status: 'active',
    priority: 0,
  };
}

exports.teach = wrap(async (req, res) => {
  const draft = draftFromStatement(req.body.statement);
  if (req.body.save === true) {
    const row = await repo.create({ ...draft, ...pickOverrides(req.body) }, actor(req));
    knowledgeService.invalidateAdminCache();
    return res.status(201).json({ success: true, message: 'Learned and saved as a new knowledge entry.', data: row });
  }
  res.json({ success: true, message: 'Draft generated — review and POST to /admin/knowledge/teach with save:true (or edit fields first) to store it.', data: draft });
});

// Lets the admin override any auto-derived field (category, roles, title, etc.)
// in the same request that saves the taught statement.
function pickOverrides(body) {
  const out = {};
  for (const f of ['title', 'category', 'roles', 'question', 'keywords', 'synonyms', 'relatedTopics', 'followUps', 'priority', 'tone']) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}
