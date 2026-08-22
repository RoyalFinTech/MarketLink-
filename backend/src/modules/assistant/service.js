'use strict';
const { AppError } = require('../../middleware/errorHandler');
const { getActiveProvider } = require('./providers');
const knowledgeService = require('./knowledgeService');
const responseBuilder = require('./responseBuilder');
const conversationContext = require('./conversationContext');
const liveData = require('./liveData');

const VALID_ROLES = ['customer', 'vendor', 'rider', 'admin'];

// Prefer the authenticated user's role over any role the client claims in
// the body — the client-supplied role is only a fallback for guests.
function resolveRole(userRoles, claimedRole) {
  if (Array.isArray(userRoles) && userRoles.length) {
    const match = userRoles.find(r => VALID_ROLES.includes(r));
    if (match) return match;
  }
  if (VALID_ROLES.includes(claimedRole)) return claimedRole;
  return undefined;
}

async function ask({ question, userRoles, claimedRole, user, sessionId }) {
  const trimmed = String(question || '').trim();
  if (!trimmed) throw new AppError('A question is required.', 400, 'QUESTION_REQUIRED');
  if (trimmed.length > 500) throw new AppError('Question is too long (max 500 characters).', 400, 'QUESTION_TOO_LONG');

  const role = resolveRole(userRoles, claimedRole);
  const context = sessionId ? conversationContext.get(sessionId) : null;

  const base = { assistantName: 'MarketLink Assistant', question: trimmed, role: role || 'guest', sessionId: sessionId || null };

  // 1) Live-account-data intents (wallet balance, order status) always win —
  //    these must come from real backend data, never from KB text, and
  //    never from the small-talk/greeting path either.
  const live = await liveData.tryResolve(trimmed, user || null);
  if (live.handled) {
    const result = { ...base, answer: live.answer, source: 'live_data', confidence: 'high', matchedEntryId: null, relatedQuestions: [] };
    if (sessionId) conversationContext.record(sessionId, { question: trimmed, answer: live.answer, entryId: null, category: 'live', role });
    return result;
  }

  // 2) Small talk — greetings, thanks, "okay", confusion/tell-me-more.
  const smallTalk = responseBuilder.classifySmallTalk(trimmed);
  if (smallTalk === 'greeting') return finish(base, responseBuilder.pick(responseBuilder.GREETING_REPLIES), null, null, sessionId, role);
  if (smallTalk === 'thanks')   return finish(base, responseBuilder.pick(responseBuilder.THANKS_REPLIES), null, null, sessionId, role);
  if (smallTalk === 'okay')     return finish(base, responseBuilder.pick(responseBuilder.OKAY_REPLIES), null, null, sessionId, role);

  if (smallTalk === 'confusion' || smallTalk === 'tell_more') {
    if (context && context.lastEntryId) {
      const entry = await findEntryById(context.lastEntryId);
      if (entry) {
        const answer = responseBuilder.buildAnswer(entry, { expand: true });
        return finish(base, answer, entry.id, entry.category, sessionId, role, 'knowledge_base', 'high');
      }
    }
    return finish(base, responseBuilder.buildFallback(true), null, null, sessionId, role, 'no_match');
  }

  // 3) Knowledge-base search, with a lightweight context-assisted retry for
  //    short follow-ups like "Can I cancel it?" that don't stand alone well.
  let match = await knowledgeService.search(trimmed, role);
  if (!match && context && context.turns.length) {
    const lastQuestion = context.turns[context.turns.length - 1].question;
    match = await knowledgeService.search(`${lastQuestion} ${trimmed}`, role);
  }

  if (!match) {
    const answer = responseBuilder.buildFallback(false);
    return finish(base, answer, null, null, sessionId, role, 'no_match');
  }

  const answer = responseBuilder.buildAnswer(match.entry, {});
  const relatedQuestions = await knowledgeService.relatedByCategory(match.entry.category, match.entry.id);
  const result = {
    ...base,
    answer,
    source: match.source === 'admin' ? 'admin_knowledge' : 'knowledge_base',
    confidence: match.score >= 3 ? 'high' : 'low',
    matchedEntryId: match.entry.id,
    relatedQuestions,
  };
  if (sessionId) conversationContext.record(sessionId, { question: trimmed, answer, entryId: match.entry.id, category: match.entry.category, role });
  return result;
}

function finish(base, answer, entryId, category, sessionId, role, source = 'small_talk', confidence = null) {
  const result = { ...base, answer, source, confidence, matchedEntryId: entryId, relatedQuestions: [] };
  if (sessionId) conversationContext.record(sessionId, { question: base.question, answer, entryId, category, role });
  return result;
}

// Re-resolve a specific previously-matched entry by id, from either source,
// for the "explain that again" / "tell me more" path.
async function findEntryById(id) {
  const { KNOWLEDGE_BASE } = require('../../knowledge/marketlink-kb');
  const staticHit = KNOWLEDGE_BASE.find(e => e.id === id);
  if (staticHit) return staticHit;
  try {
    const row = await require('./knowledgeRepo').getById(id);
    return {
      id: row.id, category: row.category, roles: row.roles, answer: row.answer,
      details: row.details, examples: row.examples, followUps: row.follow_ups,
    };
  } catch (e) {
    return null;
  }
}

async function stats() {
  const counts = await knowledgeService.entryCounts();
  return {
    knowledgeEntries: counts.total,
    staticEntries: counts.static,
    adminEntries: counts.admin,
    activeProvider: getActiveProvider().name,
  };
}

module.exports = { ask, stats };
