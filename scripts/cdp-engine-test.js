'use strict';

const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { CdpBrowserEngine } = require('../src/main/cdp/cdp-browser-engine');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const profileDir = path.join(os.tmpdir(), `browsme-cdp-enginetest-${Date.now()}`);
  const engine = new CdpBrowserEngine({ userDataDir: profileDir, headless: true });

  let frames = 0;
  engine.on('frame', () => { frames += 1; });
  const urlChanges = [];
  engine.on('url-changed', (url) => urlChanges.push(url));

  try {
    const { browser, version } = await engine.start({
      startUrl: 'about:blank',
      viewport: { width: 1000, height: 700 }
    });
    console.log('started          :', browser.label, '/', version.Browser);

    await engine.startScreencast({ everyNthFrame: 1, quality: 50 });
    await delay(1500);
    await engine.stopScreencast();
    console.log('frames streamed  :', frames);
    assert.ok(frames > 0, 'no screencast frames received');

    await engine.evaluate(`(() => {
      const i = document.createElement('input');
      i.id = 'box';
      document.body.appendChild(i);
      i.focus();
    })()`);
    await engine.insertText('hello browsme');
    const typed = await engine.evaluate(`document.getElementById('box').value`);
    console.log('typed value      :', JSON.stringify(typed));
    assert.strictEqual(typed, 'hello browsme', 'insertText did not reach the focused input');

    const rect = await engine.evaluate(`(() => {
      const b = document.createElement('button');
      b.textContent = 'Go';
      b.style.cssText = 'position:fixed;left:120px;top:90px;width:80px;height:40px';
      b.addEventListener('click', () => { window.__hit = true; });
      document.body.appendChild(b);
      window.__hit = false;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await engine.dispatchMouse({ type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await engine.dispatchMouse({ type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    const hit = await engine.evaluate('window.__hit');
    console.log('mouse click hit  :', hit);
    assert.strictEqual(hit, true, 'mouse event did not reach the button');

    await engine.navigate('https://example.com');
    for (let i = 0; i < 40 && !urlChanges.some((u) => u.includes('example.com')); i += 1) {
      await delay(150);
    }
    const href = await engine.evaluate('location.href');
    console.log('navigated to     :', href);
    assert.ok(href.includes('example.com'), 'navigation did not land on example.com');

    console.log('\n✅ Phase 2 engine PASSED — screencast, typing, mouse, navigation all work.');
  } finally {
    await engine.stop();
    try {
      require('node:fs').rmSync(profileDir, { recursive: true, force: true });
    } catch {
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Phase 2 engine FAILED:', error.message);
  process.exit(1);
});
