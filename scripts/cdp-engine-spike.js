'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const { findBrowsers, findBestBrowser } = require('../src/main/cdp/browser-finder');
const { launchBrowser, listTargets } = require('../src/main/cdp/chrome-launcher');
const { CdpClient } = require('../src/main/cdp/cdp-client');

function arg(name, fallback) {
  const hit = process.argv.find((value) => value === `--${name}` || value.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const headful = Boolean(arg('headful', false));
  const explicitProfile = arg('profile', '');
  const keepProfile = Boolean(arg('keep', false)) || headful || Boolean(explicitProfile);
  const startUrl = String(arg('url', 'https://example.com'));
  const preferred = arg('browser', '');

  console.log('== BrowsMe CDP engine spike ==\n');

  const detected = findBrowsers();
  console.log('Detected browsers:', detected.map((b) => b.label).join(', ') || '(none)');
  const chosen = findBestBrowser(typeof preferred === 'string' ? preferred : undefined);
  assert.ok(chosen, 'No Chromium-family browser found on this machine');
  console.log('Using            :', chosen.label, '->', chosen.binary);

  const profileDir = explicitProfile
    ? path.resolve(String(explicitProfile))
    : path.join(os.tmpdir(), `browsme-cdp-spike-${Date.now()}`);
  console.log('Profile dir      :', profileDir, headful ? '(headful)' : '(headless)');
  console.log('');

  const { child, port, version } = await launchBrowser({
    binary: chosen.binary,
    userDataDir: profileDir,
    startUrl,
    headless: !headful
  });
  console.log('Launched         :', version.Browser);
  console.log('Debug endpoint   : 127.0.0.1:' + port);

  let client;
  try {
    let pageTarget;
    for (let attempt = 0; attempt < 40 && !pageTarget; attempt += 1) {
      const targets = await listTargets(port);
      pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (!pageTarget) await delay(150);
    }
    assert.ok(pageTarget, 'No page target appeared');

    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    console.log('CDP connected    : yes');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await delay(500);
    const title = await client.send('Runtime.evaluate', {
      expression: 'document.title || location.href',
      returnByValue: true
    });
    console.log('Page control     :', JSON.stringify(title.result.value));

    const framePath = path.join(path.dirname(profileDir), `browsme-cdp-spike-frame-${Date.now()}.jpg`);
    const firstFrame = new Promise((resolve) => {
      client.once('Page.screencastFrame', async (params) => {
        const bytes = Buffer.from(params.data, 'base64');
        try {
          fs.writeFileSync(framePath, bytes);
          await client.send('Page.screencastFrameAck', { sessionId: params.sessionId });
        } catch {
        }
        resolve({
          width: params.metadata.deviceWidth,
          height: params.metadata.deviceHeight,
          bytes: bytes.length
        });
      });
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
    const frame = await Promise.race([
      firstFrame,
      delay(8000).then(() => Promise.reject(new Error('SCREENCAST_TIMEOUT')))
    ]);
    await client.send('Page.stopScreencast').catch(() => {});
    console.log('Screencast frame :', `${frame.width}x${frame.height}, ${frame.bytes} bytes -> ${framePath}`);
    assert.ok(frame.bytes > 0, 'Screencast produced an empty frame');

    if (!headful) {
      await client.send('Runtime.evaluate', {
        expression: `(() => {
          const probe = document.createElement('div');
          probe.id = '__browsme_probe';
          probe.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent';
          probe.addEventListener('click', () => { window.__browsmeClicked = true; });
          document.documentElement.appendChild(probe);
          window.__browsmeClicked = false;
        })();`
      });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 240, y: 240, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 240, y: 240, button: 'left', clickCount: 1 });
      const clicked = await client.send('Runtime.evaluate', { expression: 'window.__browsmeClicked', returnByValue: true });
      await client.send('Runtime.evaluate', { expression: `document.getElementById('__browsme_probe')?.remove();` }).catch(() => {});
      console.log('Input forwarding :', clicked.result.value === true ? 'registered by page' : 'FAILED');
      assert.strictEqual(clicked.result.value, true, 'Synthetic click did not reach the page');
    } else {
      console.log('Input forwarding : skipped (headful — your own clicks drive the page)');
    }

    if (headful) {
      const seconds = Number(arg('wait', 180));
      console.log('');
      console.log(`A real ${chosen.label} window is open at ${startUrl}.`);
      console.log(`Sign in now. Holding ${seconds}s; the profile is kept at:`);
      console.log('  ' + profileDir);
      console.log('Re-run with --url=' + JSON.stringify(startUrl) + ' pointed at the same profile to confirm you stay signed in.');
      await delay(seconds * 1000);
    }

    console.log('\n✅ Phase 1 PASSED — detect + launch + CDP + screencast + input all work.');
  } finally {
    try {
      if (client) client.close();
    } catch {
    }
    try {
      child.kill();
    } catch {
    }
    if (!keepProfile) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
      }
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Phase 1 FAILED:', error.message);
  process.exit(1);
});
