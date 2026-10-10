'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INTERNAL_NEW_TAB,
  assertNavigableUrl,
  isPrivateNetworkUrl,
  resolveAddress,
  searchUrlForEngine
} = require('../src/main/url-utils');

test('resolveAddress converts search text and hostnames', () => {
  assert.equal(resolveAddress(''), INTERNAL_NEW_TAB);
  assert.equal(resolveAddress('example.com'), 'https://example.com');
  assert.equal(resolveAddress('example.com:8080'), 'https://example.com:8080');
  assert.equal(resolveAddress('localhost:3000'), 'http://localhost:3000');
  assert.equal(resolveAddress('[::1]:5173'), 'http://[::1]:5173');
  assert.equal(
    resolveAddress('browser automation'),
    'https://www.google.com/search?q=browser%20automation'
  );
});

test('resolveAddress honors the configured search engine', () => {
  assert.equal(searchUrlForEngine('duckduckgo'), 'https://duckduckgo.com/?q=');
  assert.equal(searchUrlForEngine('unknown'), 'https://www.google.com/search?q=');
  assert.equal(
    resolveAddress('open source', searchUrlForEngine('bing')),
    'https://www.bing.com/search?q=open%20source'
  );
  assert.equal(
    resolveAddress('open source', searchUrlForEngine('duckduckgo')),
    'https://duckduckgo.com/?q=open%20source'
  );
  // A real hostname is still treated as navigation, not search.
  assert.equal(resolveAddress('example.com', searchUrlForEngine('bing')), 'https://example.com');
});

test('assertNavigableUrl blocks privileged and credential-bearing URLs', () => {
  assert.throws(() => assertNavigableUrl('file:///C:/secret.txt'), /protocol is blocked/);
  assert.throws(() => assertNavigableUrl('javascript:alert(1)'), /protocol is blocked/);
  assert.throws(() => assertNavigableUrl('https://user:pass@example.com'), /embedded credentials/);
  assert.equal(assertNavigableUrl('https://example.com/'), 'https://example.com/');
});

test('private network detection covers common local ranges', () => {
  assert.equal(isPrivateNetworkUrl('http://localhost:3000'), true);
  assert.equal(isPrivateNetworkUrl('https://127.0.0.1'), true);
  assert.equal(isPrivateNetworkUrl('https://10.2.3.4'), true);
  assert.equal(isPrivateNetworkUrl('https://172.31.2.3'), true);
  assert.equal(isPrivateNetworkUrl('https://192.168.1.1'), true);
  assert.equal(isPrivateNetworkUrl('https://[::ffff:127.0.0.1]'), true);
  assert.equal(isPrivateNetworkUrl('https://100.64.0.1'), true);
  assert.equal(isPrivateNetworkUrl('https://[::]'), true);
  assert.equal(isPrivateNetworkUrl('https://example.com'), false);
});
