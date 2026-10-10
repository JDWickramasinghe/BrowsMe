'use strict';

const APPROVAL_MODES = Object.freeze({
  ASK: 'ask',
  BALANCED: 'auto-safe',
  FULL: 'full'
});

const APPROVAL_MODE_VALUES = new Set(Object.values(APPROVAL_MODES));

const ALWAYS_PROMPT_KINDS = new Set([
  'local-network',
  'memory-write',
  'memory-delete'
]);

const FULL_AUTO_APPROVE_KINDS = new Set([
  'agent-navigation',
  'sensitive-navigation',
  'agent-click',
  'cross-origin-click',
  'high-impact-click',
  'agent-type',
  'sensitive-entry',
  'password-entry',
  'agent-type-submit',
  'agent-select',
  'form-submission',
  'agent-keypress',
  'agent-activation-key',
  'agent-history-navigation',
  'agent-reload',
  'agent-tab-close'
]);

const BALANCED_AUTO_APPROVE_KINDS = new Set([
  'agent-navigation',
  'agent-click',
  'agent-type',
  'agent-select',
  'agent-keypress',
  'agent-history-navigation'
]);

function normalizeApprovalMode(value) {
  return APPROVAL_MODE_VALUES.has(value) ? value : APPROVAL_MODES.ASK;
}

function getApprovalDisposition(mode, payload = {}) {
  const normalizedMode = normalizeApprovalMode(mode);
  const kind = String(payload.kind || '');

  if (payload.forcePrompt === true || ALWAYS_PROMPT_KINDS.has(kind)) {
    return {
      mode: normalizedMode,
      action: 'prompt',
      reason: 'protected-boundary'
    };
  }

  if (payload.actor !== 'agent') {
    return {
      mode: normalizedMode,
      action: 'prompt',
      reason: 'untrusted-actor'
    };
  }

  if (
    normalizedMode === APPROVAL_MODES.FULL &&
    FULL_AUTO_APPROVE_KINDS.has(kind)
  ) {
    return {
      mode: normalizedMode,
      action: 'allow',
      reason: 'full-access'
    };
  }

  if (
    normalizedMode === APPROVAL_MODES.BALANCED &&
    BALANCED_AUTO_APPROVE_KINDS.has(kind) &&
    payload.trustedOrigin === true
  ) {
    return {
      mode: normalizedMode,
      action: 'allow',
      reason: 'low-risk-browser-action'
    };
  }

  return {
    mode: normalizedMode,
    action: 'prompt',
    reason: normalizedMode === APPROVAL_MODES.ASK
      ? 'ask-every-time'
      : 'potentially-unsafe'
  };
}

module.exports = {
  APPROVAL_MODES,
  APPROVAL_MODE_VALUES,
  ALWAYS_PROMPT_KINDS,
  BALANCED_AUTO_APPROVE_KINDS,
  FULL_AUTO_APPROVE_KINDS,
  getApprovalDisposition,
  normalizeApprovalMode
};
