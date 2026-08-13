'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Knowledge Service — search/matching over BOTH knowledge sources:
//   1. the static 35-entry KB (src/knowledge/marketlink-kb.js, untouched)
//   2. admin-authored entries in the `knowledge_entries` table
//
// This remains deterministic rule-based search — NOT semantic AI, NOT an
// LLM — just a better deterministic ranker: synonym expansion, light
// stemming, and small-edit-distance tolerance for typos, on top of the
// original keyword/token-overlap scoring.
//
//   MarketLink Assistant → Knowledge Service → [Static KB + Admin DB] → Answer
// ═══════════════════════════════════════════════════════════════════════
const { KNOWLEDGE_BASE } = require('../../knowledge/marketlink-kb');
const knowledgeRepo = require('./knowledgeRepo');

const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','do','does','did','how','what','when','where','why','who',
  'i','my','me','you','your','it','its','to','of','in','on','for','and','or','can','could','would',
  'should','with','about','this','that','these','those','be','has','have','had','will','if','so',
  'please','pls','kindly','just','like','want','need','im',
]);

// Small synonym groups — each word in a group is treated as interchangeable
// with the others for matching purposes. This is what lets "buy", "order",
// and "purchase" all resolve to the same intent without needing every
// literal phrasing spelled out in every KB entry's keywords.
const SYNONYM_GROUPS = [
  ['order','buy','purchase','checkout','food','item'],
  ['cancel','cancelled','canceled','cancellation','stop','undo'],
  ['track','tracking','trace','follow','locate','find'],
  ['withdraw','withdrawal','payout','cashout','cash','out'],
  ['wallet','balance','funds','money'],
  ['register','signup','join','create'],
  ['login','signin','log'],
  ['deliver','delivery','shipping','dropoff','drop'],
  ['pay','payment','paying','paid'],
  ['vendor','store','shop','seller','restaurant'],
  ['rider','driver','courier'],
  ['accept','approve','confirm'],
  ['reject','decline','refuse'],
  ['help','support','assist','contact'],
  ['start','begin','how'],
];
const SYNONYM_MAP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) SYNONYM_MAP.set(word, group);
}

// Very light stemmer — strips common English suffixes so "orders",
// "ordering", "ordered" all collapse toward "order". Deliberately crude;
// this is not a real linguistic stemmer, just enough to catch the common
// cases without a dependency.
function stem(word) {
  return word
    .replace(/(ing|ations?|ments?|ies|ied)$/, '')
    .replace(/(ed|es|s)$/, '') || word;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter(t => t && !STOPWORDS.has(t));
}

// Expand a token list with synonyms + stems, for a richer set to compare
// against. Kept small — this is not meant to explode combinatorially.
function expand(tokens) {
  const out = new Set();
  for (const t of tokens) {
    out.add(t);
    out.add(stem(t));
    const syns = SYNONYM_MAP.get(t) || SYNONYM_MAP.get(stem(t));
    if (syns) syns.forEach(s => out.add(s));
  }
  return out;
}

function levenshteinAtMost1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (s.length === l.length) { i++; j++; } else { j++; }
  }
  edits += (l.length - j) + (s.length - i);
  return edits <= 1;
}

function buildIndexEntry(entry, source) {
  const kwTokens = (entry.keywords || []).flatMap(tokenize);
  const qTokens = tokenize(entry.question);
  const synTokens = (entry.synonyms || []).flatMap(tokenize);
  const rawTokens = [...kwTokens, ...qTokens, ...synTokens];
  return {
    entry, source,
    keywordPhrases: (entry.keywords || []).map(normalize),
    tokenSet: expand(rawTokens),
    rawTokenList: [...new Set(rawTokens)],
  };
}

const STATIC_INDEX = KNOWLEDGE_BASE.map(e => buildIndexEntry(e, 'static'));

let adminCache = { at: 0, index: [] };
const ADMIN_CACHE_TTL_MS = 5000;

async function refreshAdminIndex() {
  const now = Date.now();
  if (now - adminCache.at < ADMIN_CACHE_TTL_MS) return adminCache.index;
  const rows = await knowledgeRepo.listActiveForMatching();
  adminCache = {
    at: now,
    index: rows.map(row => buildIndexEntry({
      id: row.id,
      category: row.category,
      roles: row.roles,
      keywords: row.keywords,
      synonyms: row.synonyms,
      question: row.question,
      answer: row.answer,
      details: row.details,
      examples: row.examples,
      relatedTopics: row.related_topics,
      followUps: row.follow_ups,
      tone: row.tone,
      priority: row.priority,
    }, 'admin')),
  };
  return adminCache.index;
}

const MIN_SCORE_THRESHOLD = 1.2;

function scoreEntry(indexed, normalizedQuestion, questionTokens, expandedQuestionTokens, role) {
  let score = 0;

  for (const phrase of indexed.keywordPhrases) {
    if (phrase && normalizedQuestion.includes(phrase)) score += 3;
  }

  if (questionTokens.length) {
    let overlap = 0;
    for (const t of expandedQuestionTokens) if (indexed.tokenSet.has(t)) overlap++;
    score += Math.min(overlap, questionTokens.length * 2) / questionTokens.length;

    for (const qt of questionTokens) {
      if (qt.length < 4 || (expandedQuestionTokens.has(qt) && indexed.tokenSet.has(qt))) continue;
      if (indexed.rawTokenList.some(kt => kt.length >= 4 && levenshteinAtMost1(qt, kt))) {
        score += 0.6;
        break;
      }
    }
  }

  const roles = indexed.entry.roles || ['all'];
  if (role && (roles.includes('all') || roles.includes(role))) score += 0.5;
  else if (!role && roles.includes('all')) score += 0.2;

  if (indexed.source === 'admin') {
    score += 1.0;
    score += Math.max(0, Math.min(2, (indexed.entry.priority || 0) / 25));
  }

  return score;
}

async function search(question, role) {
  const normalizedQuestion = normalize(question);
  const questionTokens = tokenize(question);
  if (!normalizedQuestion) return null;
  const expandedQuestionTokens = expand(questionTokens);

  const adminIndex = await refreshAdminIndex();
  const fullIndex = [...adminIndex, ...STATIC_INDEX];

  let best = null;
  for (const indexed of fullIndex) {
    const score = scoreEntry(indexed, normalizedQuestion, questionTokens, expandedQuestionTokens, role);
    if (!best || score > best.score) best = { entry: indexed.entry, score, source: indexed.source };
  }
  if (!best || best.score < MIN_SCORE_THRESHOLD) return null;
  return best;
}

async function relatedByCategory(category, excludeId, limit = 3) {
  const adminIndex = await refreshAdminIndex();
  const pool = [...adminIndex.map(i => i.entry), ...KNOWLEDGE_BASE];
  const seen = new Set();
  const out = [];
  for (const e of pool) {
    if (e.category !== category || e.id === excludeId || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, question: e.question });
    if (out.length >= limit) break;
  }
  return out;
}

async function entryCounts() {
  const adminIndex = await refreshAdminIndex();
  return { static: KNOWLEDGE_BASE.length, admin: adminIndex.length, total: KNOWLEDGE_BASE.length + adminIndex.length };
}

/** Force the admin-knowledge cache to refetch on the next search — called after any admin CRUD write. */
function invalidateAdminCache() {
  adminCache = { at: 0, index: [] };
}

module.exports = { search, relatedByCategory, entryCounts, invalidateAdminCache, normalize, tokenize, MIN_SCORE_THRESHOLD };
