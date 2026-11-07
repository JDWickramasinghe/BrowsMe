'use strict';

// Headless exercise of the agent-facing automation on CdpBrowserEngine:
// snapshot (ref tagging), typeRef, clickRef, pressKey.
// Run: node scripts/cdp-automation-test.js

const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { CdpBrowserEngine } = require('../src/main/cdp/cdp-browser-engine');

async function main() {
  const profileDir = path.join(os.tmpdir(), `browsme-cdp-auto-${Date.now()}`);
  const engine = new CdpBrowserEngine({ userDataDir: profileDir, headless: true });

  try {
    await engine.start({ startUrl: 'about:blank', viewport: { width: 1000, height: 700 } });

    await engine.evaluate(`(() => {
      document.body.innerHTML =
        '<input id="email" placeholder="Email"><button id="go">Sign in</button>';
      window.__clicked = false;
      document.getElementById('go').addEventListener('click', () => { window.__clicked = true; });
      return true;
    })()`);

    const snap = await engine.snapshot();
    console.log('snapshot elements:', snap.elements.map((e) => `${e.ref}:${e.role}:${e.name}`).join(' | '));
    assert.ok(snap.elements.length >= 2, 'expected input + button in snapshot');

    const field = snap.elements.find((e) => e.role === 'input' || /email/i.test(e.name));
    const button = snap.elements.find((e) => /sign in/i.test(e.name) || e.role === 'button');
    assert.ok(field && button, 'could not locate field and button refs');

    await engine.typeRef(field.ref, 'user@example.com');
    const value = await engine.evaluate(`document.getElementById('email').value`);
    console.log('typed into field :', JSON.stringify(value));
    assert.strictEqual(value, 'user@example.com', 'typeRef did not set the field value');

    await engine.clickRef(button.ref);
    const clicked = await engine.evaluate('window.__clicked');
    console.log('clicked button   :', clicked);
    assert.strictEqual(clicked, true, 'clickRef did not trigger the button');

    await engine.pressKey('Enter');
    console.log('pressKey(Enter)  : ok');

    console.log('\n✅ Phase 3 automation PASSED — snapshot, typeRef, clickRef, pressKey all work.');
  } finally {
    await engine.stop();
    try {
      require('node:fs').rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Phase 3 automation FAILED:', error.message);
  process.exit(1);
});
