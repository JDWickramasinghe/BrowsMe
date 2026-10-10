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
    if (request) {
      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message));
      } else {
        request.resolve(message.result);
      }
    }
  });

  return {
    send(method, params = {}) {
      const id = ++sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    }
  };
}

async function inspectTarget(target) {
  const client = await connect(target);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  const evaluated = await client.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      url: location.href,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 800),
      dimensions: { width: innerWidth, height: innerHeight },
      hasBridge: typeof window.browsme === 'object',
      tabCount: document.querySelectorAll('.tab').length,
      aiPanelWidth: document.getElementById('ai-panel')?.getBoundingClientRect().width,
      visibleOverlays: Array.from(document.querySelectorAll('.modal-overlay, .popover')).filter((el) => !el.hidden).length,
      overlays: Array.from(document.querySelectorAll('.modal-overlay, .popover')).map((el) => ({
        id: el.id,
        hidden: el.hidden,
        display: getComputedStyle(el).display
      }))
    })`,
    returnByValue: true
  });
  const data = JSON.parse(evaluated.result.value);
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  });
  const filename = target.url.includes('://app/')
    ? 'browsme-shell.png'
    : 'browsme-newtab.png';
  fs.writeFileSync(path.join(process.cwd(), filename), Buffer.from(screenshot.data, 'base64'));
  client.close();
  return { ...data, screenshot: filename };
}

async function main() {
  const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
  const pages = targets.filter((target) => target.type === 'page' && target.url.startsWith('browsme://'));
  const results = [];
  for (const page of pages) {
    results.push(await inspectTarget(page));
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
