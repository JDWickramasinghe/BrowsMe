'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPROVAL_MODES,
  ALWAYS_PROMPT_KINDS,
  BALANCED_AUTO_APPROVE_KINDS,
  FULL_AUTO_APPROVE_KINDS,
  getApprovalDisposition,
  normalizeApprovalMode
} = require('../src/main/approval-policy');

function disposition(mode, kind, overrides = {}) {
  return getApprovalDisposition(mode, {
    kind,
    actor: 'agent',
    ...overrides
  });
}

test('approval modes normalize invalid or missing values to Ask', () => {
  assert.equal(normalizeApprovalMode(APPROVAL_MODES.ASK), APPROVAL_MODES.ASK);
  assert.equal(normalizeApprovalMode(APPROVAL_MODES.BALANCED), APPROVAL_MODES.BALANCED);
  assert.equal(normalizeApprovalMode(APPROVAL_MODES.FULL), APPROVAL_MODES.FULL);
  assert.equal(normalizeApprovalMode('unrestricted'), APPROVAL_MODES.ASK);
  assert.equal(normalizeApprovalMode(undefined), APPROVAL_MODES.ASK);
});

test('Ask prompts for every known AI browser action', () => {
  for (const kind of FULL_AUTO_APPROVE_KINDS) {
    const result = disposition(APPROVAL_MODES.ASK, kind, { trustedOrigin: true });
    assert.equal(result.action, 'prompt', kind);
    assert.equal(result.reason, 'ask-every-time', kind);
  }
});

test('Approve for me permits routine actions only on a trusted origin', () => {
  for (const kind of BALANCED_AUTO_APPROVE_KINDS) {
    assert.equal(
      disposition(APPROVAL_MODES.BALANCED, kind, { trustedOrigin: true }).action,
      'allow',
      `${kind} should be allowed on a trusted origin`
    );
    assert.equal(
      disposition(APPROVAL_MODES.BALANCED, kind, { trustedOrigin: false }).action,
      'prompt',
      `${kind} should prompt on a new origin`
    );
  }

  const sensitiveKinds = [...FULL_AUTO_APPROVE_KINDS]
    .filter((kind) => !BALANCED_AUTO_APPROVE_KINDS.has(kind));

  for (const kind of sensitiveKinds) {
    assert.equal(
      disposition(APPROVAL_MODES.BALANCED, kind, { trustedOrigin: true }).action,
      'prompt',
      `${kind} should remain sensitive`
    );
  }
});

test('Full access permits only enumerated AI browser actions', () => {
  for (const kind of FULL_AUTO_APPROVE_KINDS) {
    const result = disposition(APPROVAL_MODES.FULL, kind);
    assert.equal(result.action, 'allow', kind);
    assert.equal(result.reason, 'full-access', kind);
  }

  assert.equal(
    disposition(APPROVAL_MODES.FULL, 'unknown-or-future-action').action,
    'prompt'
  );
});

test('automatic approval requires an authenticated agent action', () => {
  for (const actor of [undefined, 'page', 'renderer']) {
    const result = getApprovalDisposition(APPROVAL_MODES.FULL, {
      kind: 'agent-click',
      actor
    });
    assert.equal(result.action, 'prompt');
    assert.equal(result.reason, 'untrusted-actor');
  }
});

test('protected boundaries prompt in every mode', () => {
  for (const mode of Object.values(APPROVAL_MODES)) {
    for (const kind of ALWAYS_PROMPT_KINDS) {
      const result = disposition(mode, kind, { trustedOrigin: true });
      assert.equal(result.action, 'prompt', `${mode}:${kind}`);
      assert.equal(result.reason, 'protected-boundary', `${mode}:${kind}`);
    }
  }
});

test('forcePrompt overrides automatic approval in every mode', () => {
  for (const mode of Object.values(APPROVAL_MODES)) {
    const result = disposition(mode, 'agent-click', {
      trustedOrigin: true,
      forcePrompt: true
    });
    assert.equal(result.action, 'prompt', mode);
    assert.equal(result.reason, 'protected-boundary', mode);
  }
});
