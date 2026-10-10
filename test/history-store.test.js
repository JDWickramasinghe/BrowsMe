'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { HistoryStore } = require('../src/main/history-store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'browsme-history-'));
}

test('history records visits most-recent-first and ignores non-http URLs', () => {
  const store = new HistoryStore(tempDir());
  assert.equal(store.record({ url: 'https://a.example/', title: 'A' }), true);
  assert.equal(store.record({ url: 'https://b.example/', title: 'B' }), true);
  assert.equal(store.record({ url: 'browsme://newtab/index.html', title: 'New' }), false);
  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].url, 'https://b.example/');
  assert.equal(list[1].url, 'https://a.example/');
});

test('repeated visits to the same page within a minute refresh in place', () => {
  const store = new HistoryStore(tempDir());
  const now = Date.now();
  store.record({ url: 'https://a.example/', title: 'A', at: now });
  store.record({ url: 'https://a.example/', title: 'A — updated', at: now + 5000 });
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'A — updated');
});

test('history search filters by url and title; remove and clear work', () => {
  const store = new HistoryStore(tempDir());
  store.record({ url: 'https://example.com/pricing', title: 'Pricing' });
  store.record({ url: 'https://news.example/world', title: 'World news' });
  assert.equal(store.list({ query: 'pricing' }).length, 1);
  assert.equal(store.list({ query: 'news' }).length, 1);
  assert.equal(store.list({ query: 'nothing-here' }).length, 0);
  assert.equal(store.remove('https://example.com/pricing'), 1);
  assert.equal(store.list().length, 1);
  store.clear();
  assert.equal(store.list().length, 0);
});

test('history persists across store instances', () => {
  const dir = tempDir();
  const store = new HistoryStore(dir);
  store.record({ url: 'https://persist.example/', title: 'Persisted' });
  store.persist();
  const reopened = new HistoryStore(dir);
  assert.equal(reopened.list()[0].url, 'https://persist.example/');
});
