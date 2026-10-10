'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  atomicWriteFileSync,
  getBackupPath,
  readRecoverableFileSync
} = require('../src/main/atomic-store');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browsme-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function parseJson(bytes) {
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

test('atomic writes retain the previous valid file as a backup', (t) => {
  const directory = temporaryDirectory(t);
  const filePath = path.join(directory, 'settings.json');

  atomicWriteFileSync(filePath, '{"version":1}', { validateExisting: parseJson });
  atomicWriteFileSync(filePath, '{"version":2}', { validateExisting: parseJson });

  assert.deepEqual(parseJson(fs.readFileSync(filePath)), { version: 2 });
  assert.deepEqual(parseJson(fs.readFileSync(getBackupPath(filePath))), { version: 1 });
  assert.deepEqual(
    fs.readdirSync(directory).filter((name) => name.endsWith('.tmp') || name.endsWith('.previous')),
    []
  );
});

test('a valid backup recovers and repairs a corrupt primary', (t) => {
  const directory = temporaryDirectory(t);
  const filePath = path.join(directory, 'settings.json');

  atomicWriteFileSync(filePath, '{"version":1}', { validateExisting: parseJson });
  atomicWriteFileSync(filePath, '{"version":2}', { validateExisting: parseJson });
  fs.writeFileSync(filePath, '{broken');

  const recovered = readRecoverableFileSync(filePath, parseJson);

  assert.deepEqual(recovered, { version: 1 });
  assert.deepEqual(parseJson(fs.readFileSync(filePath)), { version: 1 });
});

test('an invalid primary does not replace an existing valid backup', (t) => {
  const directory = temporaryDirectory(t);
  const filePath = path.join(directory, 'settings.json');

  atomicWriteFileSync(filePath, '{"version":1}', { validateExisting: parseJson });
  atomicWriteFileSync(filePath, '{"version":2}', { validateExisting: parseJson });
  fs.writeFileSync(filePath, '{broken');
  atomicWriteFileSync(filePath, '{"version":3}', { validateExisting: parseJson });

  assert.deepEqual(parseJson(fs.readFileSync(filePath)), { version: 3 });
  assert.deepEqual(parseJson(fs.readFileSync(getBackupPath(filePath))), { version: 1 });
});

test('AI memory never writes when safeStorage is unavailable', (t) => {
  const directory = temporaryDirectory(t);
  const filePath = path.join(directory, 'ai-memory.dat');
  const legacy = Buffer.from('{"version":1,"conversation":[],"facts":[]}');
  fs.writeFileSync(filePath, legacy);

  const originalLoad = Module._load;
  Module._load = function loadWithUnavailableSafeStorage(request, parent, isMain) {
    if (request === 'electron') {
      return {
        safeStorage: {
          isEncryptionAvailable: () => false,
          decryptString: () => {
            throw new Error('unavailable');
          },
          encryptString: () => {
            throw new Error('unavailable');
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let MemoryStore;
  try {
    delete require.cache[require.resolve('../src/main/memory-store')];
    ({ MemoryStore } = require('../src/main/memory-store'));
  } finally {
    Module._load = originalLoad;
  }

  const memory = new MemoryStore(directory);
  memory.appendConversation('private prompt', 'private answer');
  memory.remember('private', 'fact');

  assert.deepEqual(fs.readFileSync(filePath), legacy);
  assert.equal(fs.existsSync(getBackupPath(filePath)), false);
  assert.equal(memory.getStatus().persistent, false);
});
