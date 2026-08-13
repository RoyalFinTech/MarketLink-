'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Conversation context — lightweight, in-memory, per-session.
//
// This is intentionally NOT a database table or an "AI memory system": it's
// a small Map keyed by a client-generated sessionId, holding just enough to
// resolve short follow-ups like "Can I cancel it?" after "How do I place an
// order?". Entries expire after SESSION_TTL_MS of inactivity, and the store
// is capped so a flood of sessions can't grow it unbounded.
//
// Caveat (documented, not hidden): since this lives in process memory, it
// does not survive a server restart and won't work across multiple backend
// instances without moving it to shared storage (e.g. Redis) later — fine
// for this phase's "lightweight session context" requirement, not meant to
// be durable long-term memory.
// ═══════════════════════════════════════════════════════════════════════

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes of inactivity
const MAX_SESSIONS = 5000;              // hard cap to bound memory use
const MAX_TURNS = 4;                    // how many prior turns we keep per session

const sessions = new Map();

function touch(sessionId) {
  const now = Date.now();
  let s = sessions.get(sessionId);
  if (!s) {
    // Evict the oldest session if we're at capacity, before adding a new one.
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      if (oldestKey) sessions.delete(oldestKey);
    }
    s = { turns: [], lastTopic: null, lastEntryId: null, lastRole: null, updatedAt: now };
    sessions.set(sessionId, s);
  }
  s.updatedAt = now;
  return s;
}

function get(sessionId) {
  if (!sessionId) return null;
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) { sessions.delete(sessionId); return null; }
  return s;
}

/** Record a completed turn: the question asked, the answer given, and what was matched. */
function record(sessionId, { question, answer, entryId, category, role }) {
  if (!sessionId) return;
  const s = touch(sessionId);
  s.turns.push({ question, answer });
  if (s.turns.length > MAX_TURNS) s.turns.shift();
  if (entryId) { s.lastEntryId = entryId; s.lastTopic = category || s.lastTopic; }
  if (role) s.lastRole = role;
}

/** Periodic sweep of expired sessions — called opportunistically, cheap for a Map this size. */
function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}
setInterval(sweep, 5 * 60 * 1000).unref();

module.exports = { get, record, sweep, SESSION_TTL_MS, MAX_TURNS };
