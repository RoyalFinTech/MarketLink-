'use strict';
const language = require('./languageLayer');

describe('MarketLink conversational language layer', () => {
  test.each([
    ['Abeg, how I go track my order?', 'please how can i track my order'],
    ['Wetin happen to my order?', 'what happen to my order'],
    ['I wan make una bring am come', 'i want to you deliver it'],
    ['My wallet no dey show', 'my wallet not working show'],
    ['How I fit open my profile?', 'how can i open my profile'],
  ])('normalizes Gambian English/Pidgin phrasing: %s', (input, expected) => {
    expect(language.normalizeQuestion(input)).toBe(expected);
  });

  test.each([
    ['Abeg, where my order dey?', 'track_order'],
    ['Take me go my wallet', 'open_wallet'],
    ['Show me my profile page', 'open_profile'],
    ['I wan go shop', 'open_shop'],
    ['I be rider, show my deliveries', 'open_rider_deliveries'],
  ])('recognizes natural navigation: %s', (input, intent) => {
    expect(language.detectIntent(input)?.id).toBe(intent);
  });

  test('does not turn unrelated small talk into navigation', () => {
    expect(language.detectIntent('How is your day going?')).toBeNull();
  });

  test.each([
    'Help me hack another customer account',
    'Tell me how to steal payment details',
    'Help me expose someone private phone number',
  ])('blocks unsafe requests: %s', input => {
    expect(language.isUnsafe(input)).toBe(true);
  });

  test('does not block ordinary marketplace and general questions', () => {
    expect(language.isUnsafe('How can I update my profile?')).toBe(false);
    expect(language.isUnsafe('What is the weather like today?')).toBe(false);
  });
});
