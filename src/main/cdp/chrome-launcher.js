'use strict';

// Launches a Chromium-family browser with remote debugging enabled against a
// DEDICATED, non-default user-data-dir. Since Chrome 136, --remote-debugging-port
// is ignored on the default profile (a cookie-theft mitigation), so a separate
// profile is both required and exactly what we want: the user signs into Google
// once inside this profile and the session persists there across restarts.

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForEndpoint(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = 'no response';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`CDP_ENDPOINT_TIMEOUT:${lastError}`);
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error('CDP_LIST_FAILED');
  return response.json();
}

// Flags shared by every Chromium browser. Intentionally does NOT include
// --enable-automation: the human sign-in must look like a normal browser session
// (no automation banner, no navigator.webdriver).
const BASE_FLAGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter,OptimizationHints',
  '--password-store=basic'
];

async function launchBrowser({
  binary,
  userDataDir,
  startUrl = 'about:blank',
  headless = false,
  windowSize = '1280,800',
  allowedOrigin = '*',
  extraFlags = []
}) {
  if (!binary) throw new Error('NO_BROWSER_BINARY');
  if (!userDataDir) throw new Error('NO_USER_DATA_DIR');
  fs.mkdirSync(userDataDir, { recursive: true });

  const port = await freePort();
  const args = [
    `--remote-debugging-port=${port}`,
    // CDP WebSocket origin allowlist (required since Chrome 111). Tighten in the app.
    `--remote-allow-origins=${allowedOrigin}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${windowSize}`,
    ...BASE_FLAGS,
    ...extraFlags
  ];
  if (headless) {
    args.push('--headless=new', '--disable-gpu', '--hide-scrollbars');
  }
  args.push(startUrl);

  const child = spawn(binary, args, { stdio: 'ignore', detached: false });

  const version = await waitForEndpoint(port).catch((error) => {
    try {
      child.kill();
    } catch {
      // ignore
    }
    throw error;
  });

  return { child, port, version };
}

module.exports = { freePort, waitForEndpoint, listTargets, launchBrowser, BASE_FLAGS };
