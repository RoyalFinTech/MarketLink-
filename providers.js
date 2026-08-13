'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Assistant providers — pluggable answer sources.
//
// Today, only the knowledge-base provider exists and no external AI API
// key is required or called. To add a real LLM later (Anthropic, OpenAI,
// etc.), implement a new provider with the same shape:
//
//   { name: string, answer: async ({ question, role }) => {
//       answer: string, source: string, confidence: 'high'|'low'|null,
//       matchedEntryId: string|null, relatedQuestions: [{id,question}]
//   } }
//
// and set ASSISTANT_PROVIDER=<name> in .env. No other file needs to change —
// service.js reads process.env.ASSISTANT_PROVIDER to pick the active one.
// ═══════════════════════════════════════════════════════════════════════
const knowledgeService = require('./knowledgeService');

const knowledgeProvider = {
  name: 'knowledge_base',
  async answer({ question, role }) {
    const match = knowledgeService.search(question, role);
    if (!match) {
      return {
        answer: "I don't have reliable information on that yet. Try asking about orders, payments, your wallet, or how to become a vendor or rider — or reach MarketLink support directly.",
        source: 'knowledge_base',
        confidence: null,
        matchedEntryId: null,
        relatedQuestions: [],
      };
    }
    return {
      answer: match.entry.answer,
      source: 'knowledge_base',
      confidence: match.score >= 3 ? 'high' : 'low',
      matchedEntryId: match.entry.id,
      relatedQuestions: knowledgeService.relatedByCategory(match.entry.category, match.entry.id),
    };
  },
};

// ── Example of the future shape (NOT active, NOT required, no key needed
// today). Left commented so the intended extension point is obvious:
//
// const llmProvider = {
//   name: 'anthropic',
//   async answer({ question, role }) {
//     if (!process.env.ANTHROPIC_API_KEY) {
//       throw new AppError('AI provider not configured.', 503, 'PROVIDER_UNAVAILABLE');
//     }
//     // Could still ground the LLM in KNOWLEDGE_BASE entries (RAG-style)
//     // rather than replacing the knowledge base outright.
//     ...
//   },
// };

const PROVIDERS = { knowledge_base: knowledgeProvider };

function getActiveProvider() {
  const name = process.env.ASSISTANT_PROVIDER || 'knowledge_base';
  return PROVIDERS[name] || knowledgeProvider;
}

module.exports = { getActiveProvider, PROVIDERS };
