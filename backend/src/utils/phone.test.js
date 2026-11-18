'use strict';
const { normalizePhone, toGambianNational9 } = require('./phone');

describe('Gambian nine-digit migration', () => {
  test('accepts a full nine-digit national number without guessing an unverified carrier prefix', () => {
    expect(toGambianNational9('891234567')).toBe('891234567');
    expect(normalizePhone('891234567', 'GM').e164).toBe('+220891234567');
  });

  test('keeps the legacy seven-digit Gamcel format parseable for existing account lookup only', () => {
    expect(normalizePhone('9123456', 'GM').e164).toBe('+2209123456');
  });

  test('does not treat a seven-digit number as a migrated nine-digit national number', () => {
    expect(toGambianNational9('9123456')).toBeNull();
  });
});
