'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RELIABILITY_MODES,
  getReliabilityProfile,
  normalizeReliabilityMode
} = require('../src/main/reliability-policy');

test('reliability mode defaults fail safely to Reliable', () => {
  assert.equal(normalizeReliabilityMode(undefined), RELIABILITY_MODES.RELIABLE);
  assert.equal(normalizeReliabilityMode('unknown'), RELIABILITY_MODES.RELIABLE);
  assert.equal(normalizeReliabilityMode('maximum'), RELIABILITY_MODES.MAXIMUM);
});

test('higher reliability profiles increase reasoning and bounded recovery budgets', () => {
  const fast = getReliabilityProfile('fast');
  const reliable = getReliabilityProfile('reliable');
  const maximum = getReliabilityProfile('maximum');

  assert.equal(fast.thinking, 'disabled');
  assert.equal(reliable.thinking, 'enabled');
  assert.equal(reliable.reasoningEffort, 'high');
  assert.equal(maximum.reasoningEffort, 'max');
  assert.ok(fast.maxSteps < reliable.maxSteps);
  assert.ok(reliable.maxSteps < maximum.maxSteps);
  assert.ok(fast.apiAttempts < maximum.apiAttempts);
  assert.ok(maximum.completionChecks <= 3);
});
