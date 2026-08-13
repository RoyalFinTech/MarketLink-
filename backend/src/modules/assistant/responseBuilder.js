'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Response builder — turns a matched knowledge entry (or none) into a
// natural-sounding reply, and recognizes small-talk (greetings, thanks,
// confusion) that isn't really a knowledge lookup at all.
//
// This is still template-based, not generative — the "naturalness" comes
// from acknowledging the question, varying phrasing/emoji lightly across
// calls, and pulling in `details`/`followUps` from richer entries rather
// than reciting `answer` verbatim every time. It never invents facts that
// aren't in the matched entry.
// ═══════════════════════════════════════════════════════════════════════

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const GREETING_RE = /^(hi|hello|hey|hiya|good\s?(morning|afternoon|evening)|yo)\b/;
const THANKS_RE = /\b(thanks|thank you|thx|appreciate it|appreciated)\b/;
const OKAY_RE = /^(ok|okay|alright|got it|cool|sure|nice|great|good)\.?$/;
const CONFUSION_RE = /\b(don'?t understand|dont understand|confused|what do you mean|explain (that )?again|can you explain|huh|unclear)\b/;
const TELL_MORE_RE = /\b(tell me more|more info|more details|go on|continue|elaborate)\b/;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Classify small-talk that isn't a knowledge-base lookup.
 * @returns {'greeting'|'thanks'|'okay'|'confusion'|'tell_more'|null}
 */
function classifySmallTalk(question) {
  const q = normalize(question);
  if (!q) return null;
  if (GREETING_RE.test(q)) return 'greeting';
  if (THANKS_RE.test(q)) return 'thanks';
  if (CONFUSION_RE.test(q)) return 'confusion';
  if (TELL_MORE_RE.test(q)) return 'tell_more';
  if (OKAY_RE.test(q)) return 'okay';
  return null;
}

const GREETING_REPLIES = [
  "Hi there! 👋 I'm the MarketLink Assistant. What can I help you with today?",
  "Hello! 😊 Happy to help — ask me about orders, payments, your wallet, or anything else MarketLink.",
  "Hey! What would you like to know about MarketLink?",
];
const THANKS_REPLIES = [
  "You're very welcome! 😊 I'm here if you need anything else.",
  "Anytime! Let me know if anything else comes up.",
  "Glad that helped! 🙂",
];
const OKAY_REPLIES = [
  "Sounds good — anything else I can help with?",
  "👍 Let me know if you have another question.",
  "Great! I'm here if you need me.",
];
const NO_CONTEXT_CONFUSION_REPLIES = [
  "No problem — what would you like me to go over again? Ask about orders, payments, delivery, your wallet, or your MarketLink account and I'll walk you through it.",
];
const NO_MATCH_REPLIES = [
  "I want to make sure I give you the right information, but I don't have anything solid on that yet. Try asking me about orders, payments, delivery, your wallet, or becoming a vendor or rider — or reach out to MarketLink support directly.",
  "Hmm, I'm not confident I have a good answer for that one. I can help with things like placing orders, tracking deliveries, payments, your wallet, or vendor/rider questions — want to try one of those?",
  "I don't have reliable information on that yet, so I'd rather not guess. MarketLink support can help further, or feel free to ask me something about orders, payments, or your account.",
];

/** Build the "no confident match" reply, varying wording and honoring prior confusion context. */
function buildFallback(justAskedToRepeat) {
  if (justAskedToRepeat) return pick(NO_CONTEXT_CONFUSION_REPLIES);
  return pick(NO_MATCH_REPLIES);
}

/**
 * Compose a natural reply from a matched knowledge entry.
 * @param {object} entry - matched knowledge entry (static or admin-authored)
 * @param {object} [opts]
 * @param {boolean} [opts.expand] - true when the user asked "tell me more" /
 *   "explain again" about the same topic — pulls in `details` if present.
 */
function buildAnswer(entry, opts = {}) {
  let text = entry.answer;

  if (opts.expand && entry.details) {
    text += `\n\n${entry.details}`;
  }
  if (Array.isArray(entry.examples) && entry.examples.length && opts.expand) {
    text += `\n\nFor example: ${entry.examples[0]}`;
  }
  if (Array.isArray(entry.followUps) && entry.followUps.length) {
    text += `\n\n${pick(entry.followUps)}`;
  }
  return text;
}

module.exports = { classifySmallTalk, buildFallback, buildAnswer, GREETING_REPLIES, THANKS_REPLIES, OKAY_REPLIES, pick };
