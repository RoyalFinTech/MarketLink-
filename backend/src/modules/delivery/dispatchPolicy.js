'use strict';

const DEFAULT_SMART_RIDER_DISPATCH_POLICY = Object.freeze({
  automationEnabled: true,
  remindersEnabled: true,
  autoReassignEnabled: true,
  autoSearchEnabled: true,
  firstReminderSeconds: 30,
  secondReminderSeconds: 60,
  responseDeadlineSeconds: 90,
  pickupReminderSeconds: 240,
  pickupDeadlineSeconds: 480,
  reassignDelaySeconds: 0,
  retrySearchIntervalSeconds: 60,
  maxAutoDispatchAttempts: 0,
});

const NUMERIC_RULES = {
  firstReminderSeconds: [5, 600],
  secondReminderSeconds: [6, 900],
  responseDeadlineSeconds: [10, 1800],
  pickupReminderSeconds: [5, 1800],
  pickupDeadlineSeconds: [10, 3600],
  reassignDelaySeconds: [0, 600],
  retrySearchIntervalSeconds: [5, 1800],
  maxAutoDispatchAttempts: [0, 100],
};

function normaliseSmartRiderDispatchPolicy(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { source = {}; }
  }
  source = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const result = { ...DEFAULT_SMART_RIDER_DISPATCH_POLICY };
  for (const key of Object.keys(result)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
  }
  for (const key of ['automationEnabled','remindersEnabled','autoReassignEnabled','autoSearchEnabled']) {
    result[key] = result[key] !== false;
  }
  for (const [key, [min, max]] of Object.entries(NUMERIC_RULES)) {
    const number = Number(result[key]);
    result[key] = Number.isInteger(number) && number >= min && number <= max
      ? number : DEFAULT_SMART_RIDER_DISPATCH_POLICY[key];
  }
  return result;
}

function validateSmartRiderDispatchPolicy(input, current = DEFAULT_SMART_RIDER_DISPATCH_POLICY) {
  const AppError = require('../../middleware/errorHandler').AppError;
  const merged = normaliseSmartRiderDispatchPolicy({ ...current, ...(input || {}) });
  for (const [key, [min, max]] of Object.entries(NUMERIC_RULES)) {
    const raw = input && input[key] !== undefined ? Number(input[key]) : merged[key];
    if (!Number.isInteger(raw) || raw < min || raw > max) {
      throw new AppError(key + ' must be a whole number between ' + min + ' and ' + max + '.', 400, 'INVALID_DISPATCH_POLICY');
    }
    merged[key] = raw;
  }
  for (const key of ['automationEnabled','remindersEnabled','autoReassignEnabled','autoSearchEnabled']) {
    if (input && input[key] !== undefined && typeof input[key] !== 'boolean') {
      throw new AppError(key + ' must be true or false.', 400, 'INVALID_DISPATCH_POLICY');
    }
  }
  if (merged.firstReminderSeconds >= merged.secondReminderSeconds ||
      merged.secondReminderSeconds >= merged.responseDeadlineSeconds) {
    throw new AppError('The first reminder must be earlier than the second reminder, and both must be before the rider response deadline.', 400, 'INVALID_DISPATCH_POLICY');
  }
  if (merged.pickupReminderSeconds >= merged.pickupDeadlineSeconds) {
    throw new AppError('The pickup reminder must be earlier than the pickup deadline.', 400, 'INVALID_DISPATCH_POLICY');
  }
  return merged;
}

module.exports = {
  DEFAULT_SMART_RIDER_DISPATCH_POLICY,
  normaliseSmartRiderDispatchPolicy,
  validateSmartRiderDispatchPolicy,
};
