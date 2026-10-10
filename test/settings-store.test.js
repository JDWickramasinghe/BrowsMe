'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function loadSettingsStore() {
  const originalLoad = Module._load;
  Module._load = function loadWithSafeStorage(request, parent, isMain) {
    if (request === 'electron') {
      return {
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (value) => Buffer.from(value, 'utf8'),
          decryptString: (value) => Buffer.from(value).toString('utf8')
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../src/main/settings-store')];
    return require('../src/main/settings-store').SettingsStore;
  } finally {
    Module._load = originalLoad;
  }
}

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browsme-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('approval mode persists across SettingsStore instances', (t) => {
  const directory = temporaryDirectory(t);
  const SettingsStore = loadSettingsStore();

  const firstSession = new SettingsStore(directory);
  assert.equal(firstSession.getApprovalMode(), 'ask');
  firstSession.update({ approvalMode: 'full' });

  const nextSession = new SettingsStore(directory);
  assert.equal(nextSession.getApprovalMode(), 'full');
  assert.equal(nextSession.getPublicSettings().approvalMode, 'full');
});

test('task reliability persists across SettingsStore instances', (t) => {
  const directory = temporaryDirectory(t);
  const SettingsStore = loadSettingsStore();

  const firstSession = new SettingsStore(directory);
  assert.equal(firstSession.getAgentReliability(), 'reliable');
  firstSession.update({ agentReliability: 'maximum' });

  const nextSession = new SettingsStore(directory);
  assert.equal(nextSession.getAgentReliability(), 'maximum');
  assert.equal(nextSession.getPublicSettings().agentReliability, 'maximum');
  assert.throws(
    () => nextSession.update({ agentReliability: 'unbounded' }),
    /reliability mode is invalid/
  );
});

test('invalid stored or submitted approval modes fail closed', (t) => {
  const directory = temporaryDirectory(t);
  const SettingsStore = loadSettingsStore();
  fs.writeFileSync(
    path.join(directory, 'settings.json'),
    JSON.stringify({ approvalMode: 'unrestricted-unknown' })
  );

  const settings = new SettingsStore(directory);
  assert.equal(settings.getApprovalMode(), 'ask');
  assert.throws(
    () => settings.update({ approvalMode: 'unrestricted-unknown' }),
    /approval mode is invalid/
  );
  assert.equal(settings.getApprovalMode(), 'ask');
});
