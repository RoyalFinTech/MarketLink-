'use strict';

const {
  DEFAULT_SMART_RIDER_DISPATCH_POLICY,
  normaliseSmartRiderDispatchPolicy,
  validateSmartRiderDispatchPolicy,
} = require('./dispatchPolicy');

describe('Smart Rider Dispatch policy', () => {
  test('supplies the existing production timer defaults', () => {
    expect(normaliseSmartRiderDispatchPolicy(null)).toEqual(DEFAULT_SMART_RIDER_DISPATCH_POLICY);
  });

  test('accepts a coherent Admin timer configuration', () => {
    expect(validateSmartRiderDispatchPolicy({
      firstReminderSeconds: 20,
      secondReminderSeconds: 45,
      responseDeadlineSeconds: 75,
      pickupReminderSeconds: 180,
      pickupDeadlineSeconds: 420,
      reassignDelaySeconds: 30,
      retrySearchIntervalSeconds: 90,
      maxAutoDispatchAttempts: 5,
    })).toMatchObject({
      firstReminderSeconds: 20,
      secondReminderSeconds: 45,
      responseDeadlineSeconds: 75,
      pickupReminderSeconds: 180,
      pickupDeadlineSeconds: 420,
      maxAutoDispatchAttempts: 5,
    });
  });

  test('rejects reminders that cannot occur before the response deadline', () => {
    expect(() => validateSmartRiderDispatchPolicy({
      firstReminderSeconds: 60,
      secondReminderSeconds: 90,
      responseDeadlineSeconds: 90,
    })).toThrow(/first reminder must be earlier/i);
  });

  test('rejects a pickup reminder at or after the pickup deadline', () => {
    expect(() => validateSmartRiderDispatchPolicy({
      pickupReminderSeconds: 480,
      pickupDeadlineSeconds: 480,
    })).toThrow(/pickup reminder must be earlier/i);
  });

  test('rejects unsafe timer ranges and non-integer values', () => {
    expect(() => validateSmartRiderDispatchPolicy({ firstReminderSeconds: 1 })).toThrow(/whole number/i);
    expect(() => validateSmartRiderDispatchPolicy({ retrySearchIntervalSeconds: 1.5 })).toThrow(/whole number/i);
  });

  test('normalises persisted JSON strings and ignores unknown keys', () => {
    expect(normaliseSmartRiderDispatchPolicy(JSON.stringify({
      firstReminderSeconds: 25,
      unknown: 'ignored',
    }))).toMatchObject({ firstReminderSeconds: 25, secondReminderSeconds: 60 });
  });
});
