'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Live-data intents — the architectural seam between "knowledge questions"
// (answered from the KB) and "live account questions" (answered from real,
// authenticated backend data). Per spec: wallet balance, order status, and
// similar facts must NEVER be answered from free-text knowledge content —
// only from verified backend queries, scoped to the requesting user.
//
// Detected intents that require authentication but aren't logged in get a
// clear "please log in" reply rather than silently falling through to a
// generic KB answer that could look like it's answering the live question.
// ═══════════════════════════════════════════════════════════════════════
const { query } = require('../../config/db');

const WALLET_RE = /\b(wallet\s*balance|my\s*balance|balance\s*(in\s*)?(my\s*)?wallet|how\s*much.*(wallet|balance)|check\s*my\s*wallet)\b/;
const ORDER_STATUS_RE = /\b(where.*(my|the)\s*order|order\s*status|status\s*of\s*(my|the)\s*order|track\s*(my|the)?\s*order|is\s*my\s*order)\b/;

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** @returns {'wallet_balance'|'order_status'|null} */
function detectIntent(question) {
  const q = normalize(question);
  if (WALLET_RE.test(q)) return 'wallet_balance';
  if (ORDER_STATUS_RE.test(q)) return 'order_status';
  return null;
}

async function resolveWalletBalance(userId) {
  const { rows } = await query('SELECT balance, currency FROM wallets WHERE user_id=$1', [userId]);
  if (!rows.length) {
    return "I couldn't find a wallet on your account — that shouldn't normally happen, so please contact MarketLink support if this persists.";
  }
  const { balance, currency } = rows[0];
  return `Your current wallet balance is ${Number(balance).toFixed(2)} ${currency || 'GMD'}. This is live from your account, not an estimate.`;
}

async function resolveOrderStatus(userId, roles) {
  // Customers: their own most recent non-final order. Vendors/riders asking
  // "where is my order" almost always still mean an order tied to their
  // own account, so we scope by the same rule regardless of role — this
  // never looks up another user's order.
  const { rows } = await query(
    `SELECT order_number, status, placed_at FROM orders
     WHERE customer_id=$1 ORDER BY placed_at DESC LIMIT 1`, [userId]);
  if (!rows.length) {
    return "I don't see any orders on your account yet. Once you place one, I'll be able to tell you exactly where it stands.";
  }
  const o = rows[0];
  const STATUS_TEXT = {
    pending: "waiting for the vendor to accept it",
    accepted: "accepted by the vendor and about to be prepared",
    preparing: "being prepared by the vendor",
    awaiting_rider: "ready and waiting for a rider to be assigned",
    rider_assigned: "assigned to a rider, awaiting pickup",
    picked_up: "picked up by your rider",
    on_the_way: "on the way to you",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  const desc = STATUS_TEXT[o.status] || o.status;
  return `Your most recent order (#${o.order_number}) is currently ${desc}. This is live from your account — not a general answer.`;
}

/**
 * @param {string} question
 * @param {object|null} user - req.user (has .id, .roles) or null for guests
 * @returns {Promise<{handled: boolean, answer?: string}>}
 */
async function tryResolve(question, user) {
  const intent = detectIntent(question);
  if (!intent) return { handled: false };

  if (!user) {
    return {
      handled: true,
      answer: "I can look that up for you, but you'll need to be logged in first so I only show you your own account information.",
    };
  }

  if (intent === 'wallet_balance') return { handled: true, answer: await resolveWalletBalance(user.id) };
  if (intent === 'order_status') return { handled: true, answer: await resolveOrderStatus(user.id, user.roles) };
  return { handled: false };
}

module.exports = { detectIntent, tryResolve };
