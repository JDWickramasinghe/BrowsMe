'use strict';

// Fallback browser for machines with no Chromium-family browser installed.
// Downloads Google's official, standalone "Chrome for Testing" build into the app's
// own data folder and returns a path to its executable. It is a genuine Chrome
// build, so Google treats it like normal Chrome for sign-in.
//
// Extraction uses the OS's own tools (bsdtar on Windows/macOS, unzip on Linux), so
// no third-party npm dependency is added.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { PassThrough } = require('node:stream');

const INDEX_URL =
  'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';

const SUBDIR = 'chrome-for-testing';

function platformKey() {
  if (process.platform === 'win32') {
    return process.arch === 'ia32' ? 'win32' : 'win64';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  }
  return 'linux64';
}

function binaryRelativePath(key = platformKey()) {
  switch (key) {
    case 'win64':
      return path.join('chrome-win64', 'chrome.exe');
    case 'win32':
      return path.join('chrome-win32', 'chrome.exe');
    case 'mac-x64':
      return path.join('chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    case 'mac-arm64':
      return path.join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    default:
      return path.join('chrome-linux64', 'chrome');
  }
}

function installDir(userDataDir) {
  return path.join(userDataDir, SUBDIR);
}

// Path to an already-downloaded Chrome for Testing binary, or '' if not present.
function installedBinary(userDataDir) {
  const binary = path.join(installDir(userDataDir), binaryRelativePath());
  try {
    return fs.existsSync(binary) ? binary : '';
  } catch {
    return '';
  }
}

async function resolveDownload() {
  const response = await fetch(INDEX_URL);
  if (!response.ok) throw new Error('CFT_INDEX_FAILED');
  const data = await response.json();
  const stable = data && data.channels && data.channels.Stable;
  if (!stable || !stable.downloads || !Array.isArray(stable.downloads.chrome)) {
    throw new Error('CFT_NO_STABLE_CHANNEL');
  }
  const key = platformKey();
  const entry = stable.downloads.chrome.find((item) => item.platform === key);
  if (!entry) throw new Error(`CFT_NO_PLATFORM:${key}`);
  return { version: stable.version, url: entry.url, platform: key };
}

function extractZip(zipPath, destination) {
  const attempts = process.platform === 'win32'
    ? [['tar', ['-xf', zipPath, '-C', destination]]]
    : [
        ['unzip', ['-q', '-o', zipPath, '-d', destination]],
        ['tar', ['-xf', zipPath, '-C', destination]]
      ];
  let lastError;
  for (const [command, commandArgs] of attempts) {
    try {
      execFileSync(command, commandArgs, { stdio: 'ignore' });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`CFT_UNZIP_FAILED:${lastError ? lastError.message : 'no extractor available'}`);
}

// Downloads + extracts Chrome for Testing. onProgress receives { received, total, percent }.
async function download({ userDataDir, onProgress = () => {} }) {
  const { version, url } = await resolveDownload();
  const destination = installDir(userDataDir);
  fs.mkdirSync(destination, { recursive: true });
  const zipPath = path.join(destination, 'chrome-for-testing.zip');

  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('CFT_DOWNLOAD_FAILED');
  const total = Number(response.headers.get('content-length')) || 0;

  let received = 0;
  const counter = new PassThrough();
  counter.on('data', (chunk) => {
    received += chunk.length;
    onProgress({ received, total, percent: total ? Math.round((received / total) * 100) : 0 });
  });

  await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(zipPath));
  extractZip(zipPath, destination);
  try {
    fs.rmSync(zipPath, { force: true });
  } catch {
    // ignore
  }

  const binary = path.join(destination, binaryRelativePath());
  if (!fs.existsSync(binary)) throw new Error('CFT_EXTRACT_FAILED');
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binary, 0o755);
    } catch {
      // ignore
    }
  }
  return { version, binary };
}

module.exports = { platformKey, binaryRelativePath, installedBinary, resolveDownload, download, installDir };
