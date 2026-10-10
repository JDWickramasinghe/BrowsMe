'use strict';

const SEARCH_URL = 'https://www.google.com/search?q=';
const INTERNAL_NEW_TAB = 'browsme://newtab/index.html';
const ALLOWED_TOP_LEVEL_PROTOCOLS = new Set(['https:', 'http:', 'browsme:']);
const SEARCH_ENGINES = Object.freeze({
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { label: 'Brave', url: 'https://search.brave.com/search?q=' }
});

function searchUrlForEngine(engine) {
  const key = String(engine || '').toLowerCase();
  return SEARCH_ENGINES[key] ? SEARCH_ENGINES[key].url : SEARCH_URL;
}

function isLikelySearch(input) {
  if (!input) {
    return false;
  }

  if (/\s/.test(input)) {
    return true;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) {
    return false;
  }

  return !input.includes('.') && input !== 'localhost';
}

function parseHostWithPort(input) {
  const match = String(input || '').match(
    /^(\[[0-9a-f:.]+\]|localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z0-9-]+):(\d{1,5})([/?#].*)?$/i
  );
  if (!match) {
    return null;
  }
  const port = Number(match[2]);
  if (port < 1 || port > 65535) {
    return null;
  }
  return {
    host: match[1],
    suffix: `:${match[2]}${match[3] || ''}`
  };
}

function resolveAddress(rawInput, searchUrl = SEARCH_URL) {
  const input = String(rawInput || '').trim();
  if (!input) {
    return INTERNAL_NEW_TAB;
  }

  if (input === 'about:blank' || input === 'browsme://newtab' || input === INTERNAL_NEW_TAB) {
    return INTERNAL_NEW_TAB;
  }

  const hostWithPort = parseHostWithPort(input);
  if (hostWithPort) {
    const protocol = isPrivateNetworkHost(hostWithPort.host) ? 'http' : 'https';
    return `${protocol}://${hostWithPort.host}${hostWithPort.suffix}`;
  }

  if (isLikelySearch(input)) {
    const prefix = typeof searchUrl === 'string' && searchUrl ? searchUrl : SEARCH_URL;
    return `${prefix}${encodeURIComponent(input)}`;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) {
    return input;
  }

  return `https://${input}`;
}

function isInternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'browsme:' && url.hostname === 'newtab';
  } catch {
    return false;
  }
}

function assertNavigableUrl(rawUrl, options = {}) {
  const { allowInternal = true } = options;
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That address is not a valid URL.');
  }

  if (!ALLOWED_TOP_LEVEL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`The ${url.protocol || 'unknown'} protocol is blocked.`);
  }

  if (url.protocol === 'browsme:' && (!allowInternal || !isInternalUrl(url.href))) {
    throw new Error('That internal browser address is blocked.');
  }

  if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) {
    throw new Error('Addresses containing embedded credentials are blocked.');
  }

  return url.href;
}

function isPrivateNetworkHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::' ||
    host === '::1'
  ) {
    return true;
  }

  let comparableHost = host;
  const mappedIpv4 = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedIpv4) {
    const high = Number.parseInt(mappedIpv4[1], 16);
    const low = Number.parseInt(mappedIpv4[2], 16);
    comparableHost = [
      high >> 8,
      high & 255,
      low >> 8,
      low & 255
    ].join('.');
  }

  const ipv4 = comparableHost.split('.').map(Number);
  if (
    ipv4.length === 4 &&
    ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [first, second] = ipv4;
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19))
    ) {
      return true;
    }
  }

  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(host)) {
    return true;
  }

  return false;
}

function isPrivateNetworkUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (url.protocol === 'http:' || url.protocol === 'https:') && isPrivateNetworkHost(url.hostname);
  } catch {
    return false;
  }
}

function displayUrl(rawUrl) {
  if (isInternalUrl(rawUrl)) {
    return '';
  }

  return String(rawUrl || '');
}

module.exports = {
  INTERNAL_NEW_TAB,
  SEARCH_URL,
  SEARCH_ENGINES,
  searchUrlForEngine,
  assertNavigableUrl,
  displayUrl,
  isInternalUrl,
  isLikelySearch,
  parseHostWithPort,
  isPrivateNetworkHost,
  isPrivateNetworkUrl,
  resolveAddress
};
