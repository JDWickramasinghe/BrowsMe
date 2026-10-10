'use strict';

const fs = require('node:fs');
const path = require('node:path');

let sequence = 0;

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close: () => socket.close()
  };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      'Evaluation failed.'
    );
  }
  return result.result.value;
}

async function main() {
  const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
  const appTarget = targets.find((target) => target.type === 'page' && target.url === 'browsme://app/index.html');
  if (!appTarget) {
    throw new Error('BrowsMe app target was not found.');
  }
  const client = await connect(appTarget);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Page.reload', { ignoreCache: true });
  await wait(900);

  await evaluate(client, `(() => {
    document.getElementById('settings-overlay').hidden = true;
    document.getElementById('decision-overlay').hidden = true;
    document.getElementById('downloads-popover').hidden = true;
    window.dispatchEvent(new Event('resize'));
    return true;
  })()`);
  await wait(350);

  const initialCount = await evaluate(client, 'document.querySelectorAll(".tab").length');
  await evaluate(client, 'document.getElementById("new-tab").click()');
  await wait(700);
  const afterOpenCount = await evaluate(client, 'document.querySelectorAll(".tab").length');
  await evaluate(client, `(() => {
    const tabs = document.querySelectorAll('.tab');
    tabs[tabs.length - 1]?.querySelector('.tab-close')?.click();
    return true;
  })()`);
  await wait(500);
  const afterCloseCount = await evaluate(client, 'document.querySelectorAll(".tab").length');

  await evaluate(client, 'document.getElementById("ai-toggle").click()');
  await wait(250);
  const closed = await evaluate(client, 'document.getElementById("workspace").classList.contains("ai-closed")');
  await evaluate(client, 'document.getElementById("ai-toggle").click()');
  await wait(250);
  const reopened = await evaluate(client, '!document.getElementById("workspace").classList.contains("ai-closed")');

  const originalApprovalMode = await evaluate(
    client,
    'window.browsme.getInitialState().then((value) => value.settings.approvalMode)'
  );
  const originalReliability = await evaluate(
    client,
    'window.browsme.getInitialState().then((value) => value.settings.agentReliability)'
  );
  await evaluate(client, 'document.getElementById("settings-button").click()');
  await wait(250);
  await evaluate(client, `(() => {
    const full = Array.from(document.querySelectorAll('input[name="approval-mode"]'))
      .find((input) => input.value === 'full');
    full.click();
    const reliability = document.getElementById('agent-reliability');
    reliability.value = 'maximum';
    reliability.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('save-settings').click();
    return true;
  })()`);
  await wait(650);
  const savedThroughUi = await evaluate(
    client,
    'document.getElementById("settings-overlay").hidden'
  );
  await evaluate(client, 'document.getElementById("settings-button").click()');
  await wait(250);
  const approvalUi = await evaluate(client, `(() => {
    const inputs = Array.from(document.querySelectorAll('input[name="approval-mode"]'));
    const fullInput = inputs.find((input) => input.value === 'full');
    const fullCard = fullInput?.closest('.approval-mode-card');
    const reliability = document.getElementById('agent-reliability');
    return {
      count: inputs.length,
      values: inputs.map((input) => input.value),
      fullChecked: Boolean(fullInput?.checked),
      chipText: document.getElementById('approval-mode-chip')?.textContent,
      chipIsFull: document.getElementById('approval-mode-chip')?.classList.contains('is-full'),
      fullBorderColor: fullCard ? getComputedStyle(fullCard).borderColor : '',
      reliabilityValue: reliability?.value,
      reliabilityValues: Array.from(reliability?.options || []).map((option) => option.value),
      reliabilityLabel: reliability?.selectedOptions?.[0]?.textContent
    };
  })()`);
  const approvalScreenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  });
  fs.writeFileSync(
    path.join(process.cwd(), 'browsme-approval-settings.png'),
    Buffer.from(approvalScreenshot.data, 'base64')
  );
  await evaluate(client, `(() => {
    const original = Array.from(document.querySelectorAll('input[name="approval-mode"]'))
      .find((input) => input.value === ${JSON.stringify(originalApprovalMode)});
    original.click();
    const reliability = document.getElementById('agent-reliability');
    reliability.value = ${JSON.stringify(originalReliability)};
    reliability.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('save-settings').click();
    return true;
  })()`);
  await wait(650);
  const restoredSettings = await evaluate(
    client,
    `window.browsme.getInitialState().then((value) => ({
      approvalMode: value.settings.approvalMode,
      agentReliability: value.settings.agentReliability
    }))`
  );

  const finalState = await evaluate(client, `({
    bridge: typeof window.browsme === 'object',
    tabs: document.querySelectorAll('.tab').length,
    overlays: Array.from(document.querySelectorAll('.modal-overlay,.popover')).filter((el) => !el.hidden).length,
    viewport: (() => {
      const r = document.getElementById('page-viewport').getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    })()
  })`);
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  });
  fs.writeFileSync(
    path.join(process.cwd(), 'browsme-shell-ready.png'),
    Buffer.from(screenshot.data, 'base64')
  );
  client.close();

  const result = {
    initialCount,
    afterOpenCount,
    afterCloseCount,
    closed,
    reopened,
    savedThroughUi,
    approvalUi,
    restoredSettings,
    finalState,
    passed:
      initialCount >= 1 &&
      afterOpenCount === initialCount + 1 &&
      afterCloseCount === initialCount &&
      closed &&
      reopened &&
      savedThroughUi &&
      approvalUi.count === 3 &&
      approvalUi.values.join(',') === 'ask,auto-safe,full' &&
      approvalUi.fullChecked &&
      approvalUi.chipText === 'Full access' &&
      approvalUi.chipIsFull &&
      approvalUi.reliabilityValue === 'maximum' &&
      approvalUi.reliabilityValues.join(',') === 'fast,reliable,maximum' &&
      approvalUi.reliabilityLabel === 'Maximum accuracy' &&
      restoredSettings.approvalMode === originalApprovalMode &&
      restoredSettings.agentReliability === originalReliability &&
      finalState.bridge &&
      finalState.tabs === initialCount &&
      finalState.overlays === 0 &&
      finalState.viewport.width > 500 &&
      finalState.viewport.height > 400
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
