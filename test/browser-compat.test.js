'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAcceptLanguages,
  buildCompatibleUserAgent,
  isAuthenticationBrowserBlocked,
  systemBrowserAuthenticationUrl,
  safeUrlForModel
} = require('../src/main/browser-compat');

test('compatible user agent removes only app and Electron product tokens', () => {
  const source = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'AppleWebKit/537.36 (KHTML, like Gecko)',
    'BrowsMe/0.1.0',
    'Chrome/144.0.7559.110',
    'Electron/43.2.0',
    'Safari/537.36'
  ].join(' ');

  const compatible = buildCompatibleUserAgent(source);

  assert.equal(
    compatible,
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'AppleWebKit/537.36 (KHTML, like Gecko)',
      'Chrome/144.0.7559.110',
      'Safari/537.36'
    ].join(' ')
  );
  assert.match(compatible, /Chrome\/144\.0\.7559\.110/);
  assert.doesNotMatch(compatible, /(?:BrowsMe|Electron)\//i);
});

test('authentication browser restrictions are detected across providers', () => {
  assert.equal(isAuthenticationBrowserBlocked({ url: 'https://accounts.google.com/v3/signin/rejected?continue=x' }), true);
  assert.equal(isAuthenticationBrowserBlocked({ url: 'https://login.example.com/error?error=disallowed_useragent' }), true);
  assert.equal(isAuthenticationBrowserBlocked({ text: 'This browser or app may not be secure.' }), true);
  assert.equal(isAuthenticationBrowserBlocked({ text: 'Sign in is unavailable in an embedded browser.' }), true);
  assert.equal(isAuthenticationBrowserBlocked({ text: 'This browser is not supported. Please log in using another browser.' }), true);
  assert.equal(isAuthenticationBrowserBlocked({ text: 'Incorrect password. Try again.' }), false);
  assert.equal(isAuthenticationBrowserBlocked({ url: 'https://accounts.google.com/v3/signin/identifier', text: 'Sign in to your account' }), false);
});

test('system-browser authentication restarts at the originating site or Google destination', () => {
  assert.equal(systemBrowserAuthenticationUrl('https://login.example.com/oauth?state=old', 'https://shop.example.com/login'), 'https://shop.example.com/login');
  assert.equal(systemBrowserAuthenticationUrl('https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com%2Fmail%2F'), 'https://mail.google.com/mail/');
  assert.equal(systemBrowserAuthenticationUrl('https://accounts.google.com/v3/signin/rejected'), 'https://accounts.google.com/');
  assert.equal(systemBrowserAuthenticationUrl('https://accounts.google.com.evil.test/v3/signin/rejected?continue=https%3A%2F%2Fother.test'), 'https://accounts.google.com.evil.test/v3/signin/rejected?continue=https%3A%2F%2Fother.test');
  for (const url of ['file:///secret', 'javascript:alert(1)', 'https://user:pass@example.com/', 'not a URL', 'http://example.com/']) {
    assert.equal(systemBrowserAuthenticationUrl(url), '');
    assert.equal(systemBrowserAuthenticationUrl('https://accounts.google.com/v3/signin/rejected?continue=' + encodeURIComponent(url)), '');
  }
});

test('compatible user agent is case-insensitive and normalizes whitespace', () => {
  assert.equal(
    buildCompatibleUserAgent('Mozilla/5.0   browsme/1.2.3  chrome/144.0.0.0 electron/43.2.0'),
    'Mozilla/5.0 chrome/144.0.0.0'
  );
  assert.equal(buildCompatibleUserAgent(''), '');
});

test('accept languages preserve locale preference and add stable fallbacks', () => {
  assert.equal(buildAcceptLanguages('fr-CA'), 'fr-CA,fr,en-US,en');
  assert.equal(buildAcceptLanguages('en-US'), 'en-US,en');
  assert.equal(buildAcceptLanguages(' en '), 'en,en-US');
  assert.equal(buildAcceptLanguages('   '), 'en-US,en');
});

test('model-facing URLs omit credentials, query parameters, and fragments', () => {
  assert.equal(
    safeUrlForModel('https://user:pass@example.com:8443/orders/7?token=secret&email=a%40b.test#payment'),
    'https://example.com:8443/orders/7'
  );
  assert.equal(
    safeUrlForModel('https://example.com/path%20with%20spaces?query=private#private'),
    'https://example.com/path%20with%20spaces'
  );
  assert.equal(safeUrlForModel('not a URL'), '');
  assert.equal(safeUrlForModel(), '');
});
