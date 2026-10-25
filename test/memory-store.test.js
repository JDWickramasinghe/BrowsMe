'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function loadMemoryStore() {
  const originalLoad = Module._load;
  Module._load = function loadWithStubbedSafeStorage(request, parent, isMain) {
    if (request === 'electron') {
      return {
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (str) => Buffer.from(String(str), 'utf8'),
          decryptString: (buf) => Buffer.from(buf).toString('utf8')
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../src/main/memory-store')];
    return require('../src/main/memory-store').MemoryStore;
  } finally {
    Module._load = originalLoad;
  }
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'browsme-mem-'));
}

test('a fresh store always has one active session', () => {
  const MemoryStore = loadMemoryStore();
  const mem = new MemoryStore(tempDir());
  assert.equal(mem.listSessions().length, 1);
  assert.ok(mem.getActiveSessionId());
});

test('a legacy v1 conversation migrates into a titled session, facts preserved', () => {
  const MemoryStore = loadMemoryStore();
  const dir = tempDir();
  const legacy = {
    version: 1,
    conversation: [
      { role: 'user', content: 'Summarize the news', timestamp: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Done.', timestamp: '2026-01-01T00:00:01.000Z' }
    ],
    facts: [{ key: 'currency', value: 'LKR', updatedAt: '2026-01-01T00:00:00.000Z' }]
  };
  fs.writeFileSync(path.join(dir, 'ai-memory.dat'), Buffer.concat([Buffer.from('BME1'), Buffer.from(JSON.stringify(legacy))]));
  const mem = new MemoryStore(dir);
  const sessions = mem.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, 'Summarize the news');
  assert.equal(sessions[0].messageCount, 2);
  assert.deepEqual(mem.listFacts().map((f) => f.key), ['currency']);
});

test('new / switch / rename / delete sessions behave and persist', () => {
  const MemoryStore = loadMemoryStore();
  const dir = tempDir();
  const mem = new MemoryStore(dir);
  const first = mem.getActiveSessionId();
  const second = mem.createSession('Research');
  assert.equal(mem.getActiveSessionId(), second.id);
  assert.equal(mem.listSessions().length, 2);

  mem.switchSession(first);
  assert.equal(mem.getActiveSessionId(), first);

  mem.renameSession(first, 'Renamed');
  assert.equal(mem.listSessions().find((s) => s.id === first).title, 'Renamed');

  const reopened = new MemoryStore(dir);
  assert.equal(reopened.listSessions().length, 2);
  assert.ok(reopened.listSessions().some((s) => s.title === 'Renamed'));

  assert.equal(reopened.deleteSession(second.id), true);
  assert.equal(reopened.listSessions().length, 1);
  assert.equal(reopened.getActiveSessionId(), first, 'deleting the active session falls back to a remaining one');
});

test('appendConversation writes to the active session and auto-titles it', () => {
  const MemoryStore = loadMemoryStore();
  const mem = new MemoryStore(tempDir());
  mem.appendConversation('Find the cheapest flight to Tokyo', 'Looking…');
  const active = mem.listSessions().find((s) => s.active);
  assert.equal(active.title, 'Find the cheapest flight to Tokyo');
  assert.equal(mem.getSessionMessages(active.id).length, 2);

  mem.remember('pref', 'LKR');
  mem.createSession('Another chat');
  assert.deepEqual(mem.listFacts().map((f) => f.key), ['pref']);
});

test('exportSession renders the conversation as markdown', () => {
  const MemoryStore = loadMemoryStore();
  const mem = new MemoryStore(tempDir());
  mem.appendConversation('Hello there', 'Hi!');
  const md = mem.exportSession(mem.getActiveSessionId());
  assert.match(md, /^# /);
  assert.match(md, /\*\*You\*\*/);
  assert.match(md, /\*\*BrowsMe\*\*/);
  assert.match(md, /Hello there/);
});
