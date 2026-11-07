'use strict';

// Locates an installed Chromium-family browser to drive over CDP.
// All of these speak the same DevTools protocol with the same launch flags, and
// all are full, legitimate browsers that Google's "secure browser" policy accepts.
// Firefox (WebDriver BiDi) and Safari (WebKit protocol) are NOT CDP and are out of
// scope for this engine.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Priority order. Chrome first (most compatible with Google); Edge is preinstalled
// on every Windows 11 machine, so it is the de-facto fallback there.
const FAMILY = ['chrome', 'edge', 'brave', 'vivaldi', 'opera', 'chromium'];

const LABELS = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  opera: 'Opera',
  chromium: 'Chromium'
};

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore unreadable paths
    }
  }
  return '';
}

function windowsCandidates(env) {
  const pf = env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA || '';
  const join = (...parts) => path.win32.join(...parts);
  return {
    chrome: [
      join(pf, 'Google/Chrome/Application/chrome.exe'),
      join(pf86, 'Google/Chrome/Application/chrome.exe'),
      local && join(local, 'Google/Chrome/Application/chrome.exe')
    ],
    edge: [
      join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
      join(pf, 'Microsoft/Edge/Application/msedge.exe')
    ],
    brave: [
      join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
      join(pf86, 'BraveSoftware/Brave-Browser/Application/brave.exe')
    ],
    vivaldi: [
      local && join(local, 'Vivaldi/Application/vivaldi.exe'),
      join(pf, 'Vivaldi/Application/vivaldi.exe')
    ],
    opera: [local && join(local, 'Programs/Opera/opera.exe')],
    chromium: [local && join(local, 'Chromium/Application/chrome.exe')]
  };
}

function macCandidates() {
  const sys = '/Applications';
  const user = process.env.HOME ? `${process.env.HOME}/Applications` : '';
  const app = (base, rel) => (base ? `${base}/${rel}` : '');
  return {
    chrome: [
      app(sys, 'Google Chrome.app/Contents/MacOS/Google Chrome'),
      app(user, 'Google Chrome.app/Contents/MacOS/Google Chrome')
    ],
    edge: [app(sys, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge')],
    brave: [app(sys, 'Brave Browser.app/Contents/MacOS/Brave Browser')],
    vivaldi: [app(sys, 'Vivaldi.app/Contents/MacOS/Vivaldi')],
    opera: [app(sys, 'Opera.app/Contents/MacOS/Opera')],
    chromium: [app(sys, 'Chromium.app/Contents/MacOS/Chromium')]
  };
}

function onPath(binary) {
  try {
    return execFileSync('which', [binary], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function linuxCandidates() {
  return {
    chrome: [onPath('google-chrome'), onPath('google-chrome-stable'), '/usr/bin/google-chrome', '/opt/google/chrome/chrome'],
    edge: [onPath('microsoft-edge'), onPath('microsoft-edge-stable'), '/usr/bin/microsoft-edge'],
    brave: [onPath('brave-browser'), onPath('brave'), '/usr/bin/brave-browser'],
    vivaldi: [onPath('vivaldi'), '/usr/bin/vivaldi'],
    opera: [onPath('opera')],
    chromium: [onPath('chromium'), onPath('chromium-browser'), '/usr/bin/chromium', '/snap/bin/chromium']
  };
}

function candidatesForPlatform() {
  if (process.platform === 'win32') return windowsCandidates(process.env);
  if (process.platform === 'darwin') return macCandidates();
  return linuxCandidates();
}

// Returns [{ id, label, binary }] in priority order, only those actually installed.
function findBrowsers() {
  const candidates = candidatesForPlatform();
  const found = [];
  for (const id of FAMILY) {
    const binary = firstExisting(candidates[id] || []);
    if (binary) found.push({ id, label: LABELS[id], binary });
  }
  return found;
}

// Pick the preferred browser if installed, else the highest-priority one found.
function findBestBrowser(preferredId) {
  const found = findBrowsers();
  if (preferredId) {
    const match = found.find((browser) => browser.id === preferredId);
    if (match) return match;
  }
  return found[0] || null;
}

module.exports = { findBrowsers, findBestBrowser, FAMILY, LABELS };
