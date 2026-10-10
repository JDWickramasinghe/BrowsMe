'use strict';

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
    if (!request) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
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

function safeTargetUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

async function inspect(target) {
  const client = await connect(target);
  await client.send('Runtime.enable');
  const evaluation = await client.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      readyState: document.readyState,
      userAgent: navigator.userAgent,
      brands: navigator.userAgentData?.brands || [],
      mobile: navigator.userAgentData?.mobile,
      webdriver: navigator.webdriver,
      shellTabCount: document.querySelectorAll?.('.tab')?.length || 0,
      loadingTabCount: document.querySelectorAll?.('.tab.is-loading')?.length || 0,
      appIdentity: document.querySelector?.('.ai-heading h1')?.textContent || '',
      creatorVisible: document.body?.innerText?.includes('created by J.D. Wickramasinghe') || false,
      navigation: (() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? {
          domInteractive: Math.round(entry.domInteractive),
          domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
          loadEvent: Math.round(entry.loadEventEnd)
        } : null;
      })()
    })`,
    returnByValue: true
  });
  client.close();
  return {
    url: safeTargetUrl(target.url),
    ...JSON.parse(evaluation.result.value)
  };
}

async function main() {
  const targets = await fetch('http://127.0.0.1:9222/json')
    .then((response) => response.json());
  const shellOnly = process.argv.includes('--shell-only');
  const pages = targets.filter((target) => (
    target.type === 'page' &&
    (!shellOnly || target.url === 'browsme://app/index.html')
  ));
  const results = [];
  for (const page of pages) {
    results.push(await inspect(page));
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
