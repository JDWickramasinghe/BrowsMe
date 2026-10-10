'use strict';

const RELIABILITY_MODES = Object.freeze({
  FAST: 'fast',
  RELIABLE: 'reliable',
  MAXIMUM: 'maximum'
});

const RELIABILITY_MODE_VALUES = new Set(Object.values(RELIABILITY_MODES));

const RELIABILITY_PROFILES = Object.freeze({
  [RELIABILITY_MODES.FAST]: Object.freeze({
    mode: RELIABILITY_MODES.FAST,
    label: 'Fast',
    thinking: 'disabled',
    reasoningEffort: null,
    maxSteps: 18,
    maxToolCalls: 36,
    maxTokens: 4096,
    apiAttempts: 2,
    completionChecks: 1
  }),
  [RELIABILITY_MODES.RELIABLE]: Object.freeze({
    mode: RELIABILITY_MODES.RELIABLE,
    label: 'Reliable',
    thinking: 'enabled',
    reasoningEffort: 'high',
    maxSteps: 30,
    maxToolCalls: 60,
    maxTokens: 8192,
    apiAttempts: 3,
    completionChecks: 2
  }),
  [RELIABILITY_MODES.MAXIMUM]: Object.freeze({
    mode: RELIABILITY_MODES.MAXIMUM,
    label: 'Maximum',
    thinking: 'enabled',
    reasoningEffort: 'max',
    maxSteps: 44,
    maxToolCalls: 88,
    maxTokens: 12288,
    apiAttempts: 4,
    completionChecks: 3
  })
});

function normalizeReliabilityMode(value) {
  return RELIABILITY_MODE_VALUES.has(value)
    ? value
    : RELIABILITY_MODES.RELIABLE;
}

function getReliabilityProfile(value) {
  return RELIABILITY_PROFILES[normalizeReliabilityMode(value)];
}

module.exports = {
  RELIABILITY_MODES,
  RELIABILITY_MODE_VALUES,
  RELIABILITY_PROFILES,
  getReliabilityProfile,
  normalizeReliabilityMode
};
