'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Shared phone-number normalization — the ONE place phone logic lives on
// the backend. Every auth code path (register, login, PIN reset) routes
// phone numbers through normalizePhone() before it ever touches a query.
//
// International parsing/validation/formatting is delegated to
// libphonenumber-js — real metadata for the full ITU numbering space,
// not a hand-maintained country list. The one thing no general-purpose
// library can know is The Gambia's September 2026 7-to-9-digit migration
// (PURA National Numbering Plan, 2026) — that's implemented here as a
// pre-processing step specific to Gambia, applied before handing the
// number to libphonenumber-js for final validation/formatting.
//
// Gambian migration facts, and what's actually verified vs. inherited:
//   VERIFIED (PURA public notices + multiple independent news sources
//   quoting PURA's Director General directly, Sept 2026):
//     - New 2-digit prefixes: 87=Africell, 83=QCell, 86=Comium
//     - Mechanism: prefix inserted immediately after the leading zero,
//       ahead of the existing 7-digit subscriber number
//     - "The three licensed mobile network operators" named in this
//       migration are Africell, QCell, and Comium — no source found
//       mentions a fourth operator as part of this migration
//   NOT INDEPENDENTLY VERIFIED (inherited from the original request,
//   not confirmable against PURA's official PDF — it's a scanned
//   document with no extractable text layer):
//     - The exact legacy-range-to-operator boundaries (which old
//       7-digit prefixes belong to which carrier)
//     - Whether a "9xx, no prefix added" range is still accurate/labeled
//       "Gamcel" under the 2026 plan
//   This module keeps the structural behavior (9xx unchanged, no prefix)
//   since nothing found contradicts it, but does NOT assert "Gamcel" as
//   a confirmed brand — it's reported as an unattributed legacy range.
//   This should be re-verified against the actual PURA PDF (human-read
//   or OCR'd) before being treated as fully authoritative.
// ═══════════════════════════════════════════════════════════════════════
const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');

const GAMBIA_OPERATOR_PREFIXES = {
  AFRICELL: { newPrefix: '87', legacyPrefixes: ['2', '7', '40', '41'] },
  QCELL:    { newPrefix: '83', legacyPrefixes: ['3', '5'] },
  COMIUM:   { newPrefix: '86', legacyPrefixes: ['6', '8'] },
  UNATTRIBUTED_9: { newPrefix: null, legacyPrefixes: ['9'] }, // was labeled "Gamcel" in the original spec — not independently verifiable, see note above
};
const GAMBIA_NEW_PREFIXES = { '87': 'AFRICELL', '83': 'QCELL', '86': 'COMIUM' };

/**
 * Detect the Gambian operator for a national number, in either legacy
 * 7-digit or migrated 9-digit form. Never guesses — returns null rather
 * than inventing an operator prefix for an unrecognized range.
 */
function detectGambianOperator(national) {
  const digits = String(national || '').replace(/\D/g, '');
  if (digits.length === 9) {
    const prefix2 = digits.slice(0, 2);
    if (GAMBIA_NEW_PREFIXES[prefix2]) return GAMBIA_NEW_PREFIXES[prefix2];
    if (digits[0] === '9') return 'UNATTRIBUTED_9';
    return null;
  }
  if (digits.length === 7) {
    for (const [op, cfg] of Object.entries(GAMBIA_OPERATOR_PREFIXES)) {
      if (cfg.legacyPrefixes.some(p => digits.startsWith(p))) return op;
    }
  }
  return null;
}

/**
 * Migrate a Gambian national number (legacy 7-digit or already-correct
 * 9-digit) to its canonical 9-digit post-migration form. Returns null if
 * the number can't be confidently mapped — callers must surface this as
 * "please check your Gambian mobile number", never silently guess.
 */
function toGambianNational9(national) {
  const digits = String(national || '').replace(/\D/g, '');
  if (digits.length === 9) {
    const prefix2 = digits.slice(0, 2);
    if (GAMBIA_NEW_PREFIXES[prefix2] || digits[0] === '9') return digits;
    return null;
  }
  if (digits.length === 7) {
    const operator = detectGambianOperator(digits);
    if (!operator) return null;
    const { newPrefix } = GAMBIA_OPERATOR_PREFIXES[operator];
    return newPrefix ? newPrefix + digits : digits;
  }
  return null;
}

/**
 * Normalize any phone input to canonical E.164.
 * @param {string} raw - user-entered phone text, any format
 * @param {string} [defaultCountryIso] - ISO2 country to assume when raw
 *   has no leading '+' (the country selected in the UI). International
 *   input is self-describing via its leading '+' and does not need this.
 * @returns {{ e164: string, countryIso: string, national: string, operator: string|null }}
 * @throws on structurally invalid input.
 */
function normalizePhone(raw, defaultCountryIso) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Phone number is required.');
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);

  // Gambia gets its own pre-processing pass (the 2026 migration is not
  // something any general phone-metadata library knows about) before
  // being handed to libphonenumber-js for final validation/formatting.
  const looksGambian = s.startsWith('+220') || (!s.startsWith('+') && defaultCountryIso === 'GM');
  if (looksGambian) {
    const national = s.startsWith('+220') ? s.slice(4) : s.replace(/\D/g, '');
    const migrated = toGambianNational9(national);
    if (!migrated) throw new Error('Please check your Gambian mobile number.');
    const e164 = '+220' + migrated;
    if (!isValidPhoneNumber(e164)) throw new Error('Please check your Gambian mobile number.');
    return { e164, countryIso: 'GM', national: migrated, operator: detectGambianOperator(migrated) };
  }

  let parsed;
  try {
    parsed = s.startsWith('+')
      ? parsePhoneNumberFromString(s)
      : parsePhoneNumberFromString(s, defaultCountryIso);
  } catch (e) { parsed = undefined; }

  if (!parsed || !parsed.isValid()) {
    throw new Error(defaultCountryIso ? 'Please check your phone number.' : 'Unrecognized or invalid phone number.');
  }
  return { e164: parsed.number, countryIso: parsed.country || null, national: parsed.nationalNumber, operator: null };
}

function toE164(raw, defaultCountryIso) {
  return normalizePhone(raw, defaultCountryIso).e164;
}

module.exports = { normalizePhone, toE164, detectGambianOperator, toGambianNational9, GAMBIA_OPERATOR_PREFIXES };
