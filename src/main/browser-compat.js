'use strict';

function buildCompatibleUserAgent(defaultUserAgent) {
  return String(defaultUserAgent || '')
    .replace(/\s+(?:Electron|BrowsMe)\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildAcceptLanguages(locale) {
  const primary = String(locale || 'en-US').trim() || 'en-US';
  const language = primary.split('-')[0];
  return Array.from(new Set([primary, language, 'en-US', 'en']))
    .filter(Boolean)
    .join(',');
}

function safeUrlForModel(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function isAuthenticationBrowserBlocked({ url = '', text = '' } = {}) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'accounts.google.com' && /\/signin\/rejected(?:\/|$)/i.test(parsed.pathname)) {
      return true;
    }
    if (parsed.searchParams.get('error') === 'disallowed_useragent') {
      return true;
    }
  } catch {

  }
  return /(?:this browser or app may not be secure|disallowed_useragent|(?:sign[ -]?in|log[ -]?in|authentication).{0,100}(?:embedded (?:browser|webview)|unsupported browser)|(?:browser|webview).{0,80}(?:not supported|not secure).{0,100}(?:sign[ -]?in|log[ -]?in|authenticate))/i
    .test(String(text).slice(0, 30000));
}

function systemBrowserAuthenticationUrl(rawUrl, initiatingUrl = '') {

  let target = initiatingUrl || rawUrl;
  try {
    const rejected = new URL(rawUrl);
    if (!initiatingUrl && rejected.hostname === 'accounts.google.com' && /\/signin\/rejected(?:\/|$)/i.test(rejected.pathname)) {
      target = rejected.searchParams.get('continue') || 'https://accounts.google.com/';
    }
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

module.exports = {
  buildAcceptLanguages,
  buildCompatibleUserAgent,
  isAuthenticationBrowserBlocked,
  systemBrowserAuthenticationUrl,
  safeUrlForModel
};
