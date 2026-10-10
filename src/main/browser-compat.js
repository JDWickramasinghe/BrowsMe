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

module.exports = {
  buildAcceptLanguages,
  buildCompatibleUserAgent,
  safeUrlForModel
};
