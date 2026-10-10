'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  session
} = require('electron');
const { BrowserController } = require('../src/main/browser-controller');

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch(
  'host-resolver-rules',
  'MAP browsme-dns-private.test 127.0.0.1, MAP browsme-dns-page.test 127.0.0.1, MAP browsme-rebind.test 127.0.0.1, MAP browsme-public-redirect.test 127.0.0.1, MAP browsme-approved.test 127.0.0.1, MAP browsme-overlap.test 127.0.0.1'
);
app.setPath('userData', path.join(process.cwd(), '.qa-controller-profile'));
app.enableSandbox();
const reportPath = path.join(process.cwd(), 'browser-controller-live-smoke.json');
function writeStage(stage) {
  fs.writeFileSync(reportPath, `${JSON.stringify({
    passed: false,
    running: true,
    stage
  }, null, 2)}\n`, 'utf8');
}
writeStage('boot');

const fixture = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>BrowsMe control fixture</title></head>
  <body>
    <label>Plain input <input id="plain"></label>
    <label>Focus mutation field <input id="focus-mutation" onfocus="this.value='changed-before-dispatch';this.remove()"></label>
    <label>Text check trap <input id="text-trap"></label>
    <label>Remember choice <input id="check" type="checkbox"></label>
    <label>Reverting choice <input id="reverting-check" type="checkbox" onchange="setTimeout(() => { this.checked = false; }, 50)"></label>
    <span style="position:relative;display:inline-block">
      <label>Covered choice <input id="covered-check" type="checkbox"></label>
      <span style="position:absolute;inset:0;background:white;z-index:2"></span>
    </span>
    <span style="position:relative;display:inline-block;width:150px;height:40px">
      <iframe id="covered-frame" title="Covered frame" srcdoc="<button id='framed-button'>Framed action</button>" style="width:150px;height:40px;border:0"></iframe>
      <span style="position:absolute;inset:0;background:white;z-index:3"></span>
    </span>
    <iframe id="boundary-frame" title="View framed details" tabindex="0" srcdoc="<button type='submit' style='width:100%;height:100%' onclick=&quot;parent.document.getElementById('result').textContent='framed-delete'&quot;>Delete framed account</button>" style="width:170px;height:45px;border:0"></iframe>
    <div id="boundary-object-wrapper" role="button" aria-label="View object details" style="display:inline-block;width:170px;height:45px"><object id="boundary-object" type="text/html" data="/object-inner" tabindex="0" aria-label="Embedded account controls" style="width:100%;height:100%"></object></div>
    <label>Radio choice <input id="radio" type="radio" name="choice"></label>
    <label>Plan
      <select id="plan" aria-label="Plan">
        <option>Basic</option>
        <option>Pro</option>
        <option>Enterprise</option>
      </select>
    </label>
    <label>Changing plan
      <select id="changing-plan" aria-label="Changing plan" onchange="setTimeout(() => { this.options[this.selectedIndex].textContent = 'Enterprise'; }, 50)">
        <option>Starter</option>
        <option>Team</option>
      </select>
    </label>
    <button id="rename">Open report</button>
    <button id="danger" name="action">Delete account</button>
    <div id="nested-wrapper" role="button" aria-label="View details" style="display:inline-block"><button type="submit" aria-label="Delete nested account" onclick="document.getElementById('result').textContent='nested-delete'">Delete nested account</button></div>
    <form method="post" action="/label-delete">
      <label id="forward-label" for="forward-delete" role="button" aria-label="View label details">View label details</label>
      <button id="forward-delete" type="submit">Delete label account</button>
    </form>
    <form method="post" action="/image-delete">
      <input type="image" alt="View image details" width="80" height="32" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='32'%3E%3Crect width='80' height='32' fill='gray'/%3E%3C/svg%3E">
    </form>
    <form id="formdata-observer" method="post" action="/formdata-observer">
      <input type="hidden" name="message" value="safe">
      <button type="submit">Inspect-safe form</button>
    </form>
    <button id="continue" onclick="document.getElementById('result').textContent='continued'">Continue</button>
    <form method="post" action="/post-popup" target="_blank">
      <input type="hidden" name="message" value="kept">
      <button type="submit">Open POST popup</button>
    </form>
    <form method="post" action="/empty-post-popup" target="_blank">
      <button type="submit">Open empty POST popup</button>
    </form>
    <form method="post" action="/popup-race" target="_blank">
      <input type="hidden" name="message" value="real-post">
      <button type="submit" onmousedown="window.__racePopupRequests()">Open guarded POST popup</button>
    </form>
    <form method="post" action="/body-bound-final">
      <input type="hidden" name="amount" value="10">
      <button type="submit" onclick="window.__raceMainFrameRequest(event)">Submit approved amount</button>
    </form>
    <form method="post" action="/advertised-safe">
      <button type="submit" onclick="event.preventDefault();location.href='/substituted-a'">Submit substituted destination</button>
    </form>
    <form method="post" action="/partial-dispatch-safe">
      <button type="submit" onmousedown="setTimeout(() => { location.href='/partial-dispatch-substituted'; }, 2100)">Partial dispatch substitution</button>
    </form>
    <form method="post" action="/query-bound-final?account=A">
      <input type="hidden" name="amount" value="10">
      <button type="submit" onclick="window.__raceMainFrameQuery(event)">Submit approved account</button>
    </form>
    <form method="post" action="/content-type-final">
      <button type="submit" onmousedown="this.setAttribute('formenctype','text/plain')">Submit changed encoding</button>
    </form>
    <form method="post" action="/content-type-popup" target="_blank" enctype="text/plain">
      <button type="submit">Open unsupported encoding popup</button>
    </form>
    <a href="/named-popup" target="report-window">Open named popup</a>
    <form method="post" action="/named-post-popup" target="named-post-window">
      <input type="hidden" name="message" value="named-kept">
      <button type="submit">Open named POST popup</button>
    </form>
    <a href="/base-popup">Open base popup</a>
    <form method="post" action="/post-redirect-start">
      <input type="hidden" name="message" value="redirect-kept">
      <button type="submit">Submit redirecting POST</button>
    </form>
    <form method="post" action="/typed-redirect-start">
      <label>Typed redirect field <input name="message"></label>
      <button type="submit">Send typed redirect</button>
    </form>
    <form method="post" action="/key-redirect-start">
      <label>Key redirect field <input name="message" value="key-kept"></label>
      <button type="submit">Send key redirect</button>
    </form>
    <form id="mutable-submit-form" method="post" action="/mutable-submit">
      <label>Mutable submit field <input name="query"></label>
      <button type="submit" name="intent" value="search">Search</button>
    </form>
    <label>Script redirect field <input id="script-redirect-field" onkeydown="if (event.key === 'Enter') { event.preventDefault(); location.href='/script-chain-start'; }"></label>
    <a id="overlap-grant">Consumed grant overlap</a>
    <a id="consumed-popup-reuse" target="reuse-target" onclick="setTimeout(() => window.open(this.href, '_blank'), 0)">Consumed popup reuse</a>
    <button id="input-window-navigation" onmousedown="setTimeout(() => { location.href='/input-window-start'; }, 0)">Input-window timer navigation</button>
    <button id="input-window-popup" onmousedown="setTimeout(() => window.open('/input-window-popup'), 0)">Input-window timer popup</button>
    <button id="zero-navigation" onclick="setTimeout(() => { location.href='/zero-location-start'; }, 0)">Zero-delay navigation</button>
    <button id="zero-popup" onclick="setTimeout(() => window.open('/zero-popup'), 0)">Zero-delay popup</button>
    <button id="delayed-popup" onclick="setTimeout(() => window.open('/delayed-popup'), 10)">Delayed popup</button>
    <a id="dns-private-link">Open DNS-private destination</a>
    <a id="dns-private-blank" target="_blank">Open DNS-private destination in a new tab</a>
    <a id="dns-rebind-link">Open rebinding destination</a>
    <div id="shadow-host"></div>
    <div id="boundary-shadow" role="button" aria-label="View shadow details" style="display:inline-block;width:170px;height:45px"></div>
    <output id="result"></output>
    <script>
      window.__controlEvents = [];
      window.__planChanges = [];
      window.__formDataEvents = 0;
      document.getElementById('formdata-observer').addEventListener(
        'formdata',
        () => {
          window.__formDataEvents += 1;
        }
      );
      window.__racePopupRequests = () => {
        window.open('/popup-race');
        const form = document.createElement('form');
        form.method = 'post';
        form.action = '/popup-race';
        form.target = '_blank';
        form.innerHTML = '<input name="message" value="attacker-post">';
        document.body.append(form);
        form.submit();
      };
      window.__raceMainFrameRequest = (event) => {
        const form = document.createElement('form');
        form.method = 'post';
        form.action = '/body-bound-final';
        form.innerHTML = '<input name="amount" value="999">';
        document.body.append(form);
        form.submit();
        event.preventDefault();
      };
      window.__raceMainFrameQuery = (event) => {
        const form = document.createElement('form');
        form.method = 'post';
        form.action = '/query-bound-final?account=B';
        form.innerHTML = '<input name="amount" value="10">';
        document.body.append(form);
        form.submit();
        event.preventDefault();
      };
      document.getElementById('plan').addEventListener('change', (event) => {
        window.__planChanges.push({
          value: event.currentTarget.value,
          trusted: event.isTrusted
        });
      });
      document.getElementById('dns-private-link').href =
        'http://browsme-dns-private.test:' + location.port + '/dns-private-final';
      document.getElementById('dns-private-blank').href =
        'http://browsme-dns-private.test:' + location.port + '/dns-private-popup';
      document.getElementById('dns-rebind-link').href =
        'http://browsme-rebind.test:' + location.port + '/rebind-final';
      document.getElementById('overlap-grant').href =
        'http://browsme-approved.test:' + location.port + '/slow-approved';
      document.getElementById('overlap-grant').addEventListener('click', () => {
        setTimeout(() => {
          location.href =
            'http://browsme-overlap.test:' + location.port + '/overlap-final';
        }, 0);
      });
      document.getElementById('consumed-popup-reuse').href =
        'http://browsme-approved.test:' + location.port + '/slow-popup-reuse';
      for (const type of ['mousedown', 'mouseup', 'click', 'input', 'change']) {
        document.getElementById('check').addEventListener(type, (event) => {
          window.__controlEvents.push({
            type,
            trusted: event.isTrusted,
            checked: event.currentTarget.checked
          });
        });
      }
      const root = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
      root.innerHTML = '<label>Shadow field <input id="shadow-input"></label>';
      const boundaryRoot = document.getElementById('boundary-shadow')
        .attachShadow({ mode: 'open' });
      boundaryRoot.innerHTML =
        '<button type="submit" style="width:100%;height:100%" onclick="document.getElementById(\\'result\\').textContent=\\'shadow-delete\\'">Delete shadow account</button>';
    </script>
  </body>
</html>`;

function findRef(snapshot, name) {
  const element = snapshot.elements.find((candidate) => candidate.name === name);
  if (!element) {
    throw new Error(`Fixture control not found: ${name}`);
  }
  return element.ref;
}

async function snapshotWithTimeout(controller, tabId, timeoutMs = 1200) {
  let timeout;
  try {
    return await Promise.race([
      controller.snapshot(tabId),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Fixture snapshot timed out.')),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForFixture(controller, tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const snapshot = await snapshotWithTimeout(controller, tabId);
      if (snapshot.title === 'BrowsMe control fixture' && snapshot.elements.length >= 14) {
        return snapshot;
      }
    } catch {
      // The initial execution context may not exist yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('Fixture page did not become ready.');
}

async function main() {
  await app.whenReady();
  writeStage('starting fixture server');
  const serverRequests = [];
  const postPopupRequests = [];
  const emptyPostPopupRequests = [];
  const namedPostPopupRequests = [];
  const popupRaceRequests = [];
  const bodyBoundRequests = [];
  const queryBoundRequests = [];
  const contentTypeRequests = [];
  const postRedirectRequests = [];
  const server = http.createServer((request, response) => {
    serverRequests.push({
      host: request.headers.host,
      url: request.url
    });
    if (request.url === '/redirect-start') {
      response.writeHead(302, { location: '/redirect-final' });
      response.end();
      return;
    }
    if (request.url === '/redirect-other-local') {
      response.writeHead(302, {
        location: `http://localhost:${server.address().port}/redirect-final`
      });
      response.end();
      return;
    }
    if (request.url === '/redirect-denied') {
      response.writeHead(302, {
        location: `http://localhost:${server.address().port}/denied-final`
      });
      response.end();
      return;
    }
    if (request.url === '/script-chain-start') {
      response.writeHead(302, {
        location: `http://browsme-public-redirect.test:${server.address().port}/script-chain-final`
      });
      response.end();
      return;
    }
    if (request.url === '/input-window-start') {
      response.writeHead(302, {
        location: `http://browsme-public-redirect.test:${server.address().port}/input-window-final`
      });
      response.end();
      return;
    }
    if (request.url === '/zero-location-start') {
      response.writeHead(302, {
        location: `http://browsme-public-redirect.test:${server.address().port}/zero-location-final`
      });
      response.end();
      return;
    }
    if (
      request.url === '/slow-approved' ||
      request.url === '/slow-popup-reuse'
    ) {
      setTimeout(() => {
        if (!response.destroyed && !response.writableEnded) {
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
          });
          response.end('<!doctype html><title>Slow approved destination</title>');
        }
      }, 1200);
      return;
    }
    if (request.url === '/slow-a') {
      setTimeout(() => {
        if (!response.destroyed && !response.writableEnded) {
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
          });
          response.end('<!doctype html><title>Slow A</title><p>slow A</p>');
        }
      }, 1200);
      return;
    }
    if (request.url === '/object-inner') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(
        "<!doctype html><button type='submit' style='width:100%;height:100%' onclick=\"parent.document.getElementById('result').textContent='object-delete'\">Delete embedded account</button>"
      );
      return;
    }
    if (request.url === '/post-popup') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        postPopupRequests.push({
          method: request.method,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>POST popup</title><p>received</p>');
      });
      return;
    }
    if (request.url === '/popup-race') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        popupRaceRequests.push({
          method: request.method,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Popup race</title><p>received</p>');
      });
      return;
    }
    if (request.url === '/empty-post-popup') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        emptyPostPopupRequests.push({
          method: request.method,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Empty POST popup</title>');
      });
      return;
    }
    if (request.url === '/body-bound-final') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        bodyBoundRequests.push({
          method: request.method,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Body-bound request</title>');
      });
      return;
    }
    if (request.url.startsWith('/query-bound-final?')) {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        queryBoundRequests.push({
          method: request.method,
          url: request.url,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Query-bound request</title>');
      });
      return;
    }
    if (
      request.url === '/content-type-final' ||
      request.url === '/content-type-popup'
    ) {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        contentTypeRequests.push({
          method: request.method,
          url: request.url,
          contentType: request.headers['content-type'] || '',
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Changed content type</title>');
      });
      return;
    }
    if (request.url === '/named-post-popup') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        namedPostPopupRequests.push({
          method: request.method,
          body
        });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Named POST popup</title>');
      });
      return;
    }
    const redirectTargets = {
      '/post-redirect-start': '/post-redirect-final',
      '/typed-redirect-start': '/typed-redirect-final',
      '/key-redirect-start': '/key-redirect-final'
    };
    if (
      redirectTargets[request.url] ||
      Object.values(redirectTargets).includes(request.url)
    ) {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        postRedirectRequests.push({
          url: request.url,
          host: request.headers.host,
          method: request.method,
          body
        });
        if (redirectTargets[request.url]) {
          response.writeHead(307, {
            location: `http://localhost:${server.address().port}${redirectTargets[request.url]}`
          });
          response.end();
          return;
        }
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Redirected POST</title><p>received</p>');
      });
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(fixture);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const window = new BrowserWindow({
    show: true,
    x: -10000,
    y: -10000,
    skipTaskbar: true,
    width: 1100,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  const approvalRequests = [];
  let denyNextLocalhostApproval = false;
  let approvalOverride = null;
  const controller = new BrowserController({
    window,
    profileSession: session.fromPartition(`browsme-smoke-${Date.now()}`),
    emitState: () => {},
    emitToast: () => {},
    requestApproval: async (request) => {
      approvalRequests.push(request);
      if (approvalOverride) {
        const override = approvalOverride;
        approvalOverride = null;
        return override(request);
      }
      if (
        denyNextLocalhostApproval &&
        request.kind === 'local-network' &&
        String(request.toOrigin || '').startsWith('http://localhost:')
      ) {
        denyNextLocalhostApproval = false;
        return false;
      }
      return true;
    },
    requestPermission: async () => false,
    emitDownloads: () => {}
  });
  const resolvePrivateDestination =
    controller.isPrivateNetworkDestination.bind(controller);
  let rebindResolutionChecks = 0;
  controller.isPrivateNetworkDestination = async (rawUrl, failClosed) => {
    let hostname = '';
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      // Delegate malformed URLs to the production implementation.
    }
    if (hostname === 'browsme-rebind.test') {
      rebindResolutionChecks += 1;
      return rebindResolutionChecks > 1;
    }
    if (
      hostname === 'browsme-public-redirect.test' ||
      hostname === 'browsme-approved.test' ||
      hostname === 'browsme-overlap.test'
    ) {
      return false;
    }
    return resolvePrivateDestination(rawUrl, failClosed);
  };

  try {
    writeStage('opening fixture');
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/`;
    const firstTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.beginAgentApprovalRun('live-smoke', [firstTabId]);
    let firstSnapshot = await waitForFixture(controller, firstTabId);

    writeStage('checking overlapping snapshot ordering');
    const olderSnapshotPromise = controller.snapshot(firstTabId);
    const newerSnapshotPromise = controller.snapshot(firstTabId);
    const [olderSnapshot, newerSnapshot] = await Promise.allSettled([
      olderSnapshotPromise,
      newerSnapshotPromise
    ]);
    if (
      olderSnapshot.status !== 'rejected' ||
      !/SNAPSHOT_SUPERSEDED/.test(olderSnapshot.reason?.message || '') ||
      newerSnapshot.status !== 'fulfilled'
    ) {
      throw new Error('An older overlapping snapshot was allowed to replace newer refs.');
    }
    firstSnapshot = newerSnapshot.value;
    controller.resolveRef(
      controller.getTab(firstTabId),
      findRef(firstSnapshot, 'Continue')
    );

    writeStage('checking side-effect-free form inspection');
    const formDataEventsBefore = await controller.getTab(firstTabId).view
      .webContents.executeJavaScript('window.__formDataEvents');
    if (formDataEventsBefore !== 0) {
      throw new Error('A snapshot dispatched the page formdata event.');
    }
    const inspectSafeFormRef = findRef(firstSnapshot, 'Inspect-safe form');
    let inspectSafeFormApprovalSeen = false;
    approvalOverride = async () => {
      inspectSafeFormApprovalSeen = true;
      return false;
    };
    let inspectSafeFormDenied = false;
    try {
      await controller.click(firstTabId, inspectSafeFormRef);
    } catch (error) {
      inspectSafeFormDenied = /denied/i.test(error.message);
    } finally {
      approvalOverride = null;
    }
    firstSnapshot = await controller.snapshot(firstTabId);
    const formDataEventsAfter = await controller.getTab(firstTabId).view
      .webContents.executeJavaScript('window.__formDataEvents');
    if (
      !inspectSafeFormApprovalSeen ||
      !inspectSafeFormDenied ||
      formDataEventsAfter !== 0
    ) {
      throw new Error(
        `Snapshot or preflight form inspection failed: ${JSON.stringify({
          inspectSafeFormApprovalSeen,
          inspectSafeFormDenied,
          formDataEventsAfter
        })}`
      );
    }

    writeStage('typing ordinary input');
    const plainRef = findRef(firstSnapshot, 'Plain input');
    const typed = await controller.typeText(firstTabId, plainRef, 'hello', {
      clear: true,
      submit: false
    });
    if (typed.fieldEvidence.expectedLengthMatched !== true) {
      throw new Error('Ordinary text input was not verified after typing.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('typing shadow input');
    const shadowRef = findRef(firstSnapshot, 'Shadow field');
    const shadowTyped = await controller.typeText(firstTabId, shadowRef, 'inside shadow', {
      clear: true,
      submit: false
    });
    if (shadowTyped.fieldEvidence.expectedLengthMatched !== true) {
      throw new Error('Shadow DOM input focus or typing verification failed.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('checking checkbox');
    const checkRef = findRef(firstSnapshot, 'Remember choice');
    const checked = await controller.setChecked(firstTabId, checkRef, true);
    if (checked.stateMatched !== true) {
      const controlEvents = await controller.getTab(firstTabId).view.webContents
        .executeJavaScript('window.__controlEvents');
      const controlGeometry = await controller.getTab(firstTabId).view.webContents
        .executeJavaScript(`(() => {
          const element = document.getElementById('check');
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            hit: hit?.id || hit?.tagName || '',
            focused: document.hasFocus(),
            visibility: document.visibilityState
          };
        })()`);
      throw new Error(`Checkbox final state did not match: ${JSON.stringify({
        checked,
        controlEvents,
        controlGeometry,
        snapshotBounds: firstSnapshot.elements.find((element) => element.ref === checkRef)?.bounds,
        viewBounds: controller.getTab(firstTabId).view.getBounds()
      })}`);
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    const emptyPostPopupRef = findRef(firstSnapshot, 'Open empty POST popup');
    const tabsBeforeEmptyPostPopup = new Set(controller.tabs.keys());
    const emptyPostPopupResult = await controller.click(
      firstTabId,
      emptyPostPopupRef
    );
    const emptyPostPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeEmptyPostPopup.has(id));
    if (
      !emptyPostPopupTabId ||
      !emptyPostPopupResult.newTabIds.includes(emptyPostPopupTabId) ||
      emptyPostPopupRequests.length !== 1 ||
      emptyPostPopupRequests[0].method !== 'POST' ||
      emptyPostPopupRequests[0].body !== '' ||
      emptyPostPopupResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor !== 'agent' ||
          !outcome.value.runId
        )
      ))
    ) {
      throw new Error('An empty-body POST popup was downgraded to GET.');
    }
    controller.closeTab(emptyPostPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    const popupRaceRef = findRef(firstSnapshot, 'Open guarded POST popup');
    const tabsBeforePopupRace = new Set(controller.tabs.keys());
    const popupRaceResult = await controller.click(firstTabId, popupRaceRef);
    const popupRaceStartedAt = Date.now();
    while (
      (
        !popupRaceRequests.some((request) => request.method === 'POST') ||
        Array.from(controller.tabs.keys())
          .filter((id) => !tabsBeforePopupRace.has(id)).length < 1
      ) &&
      Date.now() - popupRaceStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const popupRaceTabIds = Array.from(controller.tabs.keys())
      .filter((id) => !tabsBeforePopupRace.has(id));
    const popupRaceAgentTabs = popupRaceTabIds.filter(
      (id) => controller.isAgentApprovalTab(id)
    );
    const popupRacePageTabs = popupRaceTabIds.filter(
      (id) => !controller.isAgentApprovalTab(id)
    );
    if (
      popupRaceRequests.some((request) => request.method === 'GET') ||
      !popupRaceRequests.some((request) => (
        request.method === 'POST' &&
        request.body === 'message=real-post'
      )) ||
      popupRaceRequests.some((request) => (
        request.body === 'message=attacker-post'
      )) ||
      popupRaceAgentTabs.length !== 1 ||
      popupRacePageTabs.length !== 0 ||
      !popupRaceResult.newTabIds.includes(popupRaceAgentTabs[0]) ||
      popupRaceResult.newTabIds.some((id) => popupRacePageTabs.includes(id)) ||
      !popupRaceResult.sideEffects.some((outcome) => (
        outcome?.ok === false &&
        outcome.code === 'POPUP_POST_BODY_MISSING'
      )) ||
      !popupRaceResult.sideEffects.some((outcome) => (
        outcome?.ok === false &&
        outcome.code === 'POPUP_REQUEST_MISMATCH'
      ))
    ) {
      throw new Error('A same-URL GET popup stole the approved POST popup grant.');
    }
    for (const popupRaceTabId of popupRaceTabIds) {
      controller.closeTab(popupRaceTabId);
    }

    const bodyBoundTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(bodyBoundTabId);
    const bodyBoundSnapshot = await waitForFixture(
      controller,
      bodyBoundTabId
    );
    const bodyBoundRef = findRef(
      bodyBoundSnapshot,
      'Submit approved amount'
    );
    const bodyBoundLive = await controller.inspectLiveRef(
      controller.getTab(bodyBoundTabId),
      controller.resolveRef(controller.getTab(bodyBoundTabId), bodyBoundRef)
    );
    if (
      bodyBoundLive.formRequestShape?.supported !== true ||
      bodyBoundLive.formRequestShape?.method !== 'POST' ||
      bodyBoundLive.formRequestShape?.encoding !== 'urlencoded' ||
      bodyBoundLive.formRequestShape?.payload !== 'amount=10'
    ) {
      throw new Error(
        `Manual form serialization did not pin the expected payload: ${JSON.stringify(
          bodyBoundLive.formRequestShape
        )}`
      );
    }
    const bodyBoundApprovalsBefore = approvalRequests.length;
    const bodyBoundResult = await controller.click(
      bodyBoundTabId,
      bodyBoundRef
    );
    const bodyBoundStartedAt = Date.now();
    while (
      bodyBoundRequests.length < 1 &&
      Date.now() - bodyBoundStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const bodyBoundApprovals = approvalRequests.slice(
      bodyBoundApprovalsBefore
    );
    if (
      bodyBoundRequests.length !== 1 ||
      bodyBoundRequests[0].method !== 'POST' ||
      bodyBoundRequests[0].body !== 'amount=999' ||
      !bodyBoundApprovals.some((request) => (
        ['sensitive-navigation', 'local-network'].includes(request.kind) &&
        request.actor === 'page'
      )) ||
      bodyBoundResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error(`A same-URL request with different form data stole the grant: ${JSON.stringify({
        bodyBoundRequests,
        bodyBoundApprovals,
        sideEffects: bodyBoundResult.sideEffects
      })}`);
    }
    controller.closeTab(bodyBoundTabId);

    const substitutedDestinationTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(substitutedDestinationTabId);
    const substitutedDestinationSnapshot = await waitForFixture(
      controller,
      substitutedDestinationTabId
    );
    const substitutedDestinationRef = findRef(
      substitutedDestinationSnapshot,
      'Submit substituted destination'
    );
    const substitutedApprovalsBefore = approvalRequests.length;
    approvalOverride = async (request) => {
      if (request.actor !== 'agent') {
        throw new Error('The substituted-destination test intercepted the wrong approval.');
      }
      approvalOverride = async (pageRequest) => {
        if (pageRequest.actor !== 'page') {
          throw new Error('The competing-navigation test expected a page approval.');
        }
        await controller.getTab(substitutedDestinationTabId).view.webContents
          .executeJavaScript("location.href='/substituted-b'");
        await new Promise((resolve) => setTimeout(resolve, 250));
        return true;
      };
      return true;
    };
    const substitutedDestinationResult = await controller.click(
      substitutedDestinationTabId,
      substitutedDestinationRef
    );
    const substitutedStartedAt = Date.now();
    while (
      !serverRequests.some(
        (request) => request.url === '/substituted-b'
      ) &&
      Date.now() - substitutedStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const substitutedApprovals = approvalRequests.slice(
      substitutedApprovalsBefore
    );
    if (
      !serverRequests.some(
        (request) => request.url === '/substituted-b'
      ) ||
      substitutedApprovals.filter((request) => (
        ['sensitive-navigation', 'local-network'].includes(request.kind) &&
        request.actor === 'page'
      )).length < 2 ||
      substitutedDestinationResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error(
        `A substituted same-origin destination inherited the action grant: ${JSON.stringify({
          substitutedApprovals,
          sideEffects: substitutedDestinationResult.sideEffects
        })}`
      );
    }
    controller.closeTab(substitutedDestinationTabId);

    const queryBoundTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(queryBoundTabId);
    const queryBoundSnapshot = await waitForFixture(
      controller,
      queryBoundTabId
    );
    const queryBoundRef = findRef(
      queryBoundSnapshot,
      'Submit approved account'
    );
    const queryBoundApprovalsBefore = approvalRequests.length;
    const queryBoundResult = await controller.click(
      queryBoundTabId,
      queryBoundRef
    );
    const queryBoundStartedAt = Date.now();
    while (
      queryBoundRequests.length < 1 &&
      Date.now() - queryBoundStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const queryBoundApprovals = approvalRequests.slice(
      queryBoundApprovalsBefore
    );
    if (
      queryBoundRequests.length !== 1 ||
      queryBoundRequests[0].method !== 'POST' ||
      queryBoundRequests[0].url !== '/query-bound-final?account=B' ||
      queryBoundRequests[0].body !== 'amount=10' ||
      !queryBoundApprovals.some((request) => (
        ['sensitive-navigation', 'local-network'].includes(request.kind) &&
        request.actor === 'page'
      )) ||
      queryBoundResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error(`A POST request with a changed action query stole the grant: ${JSON.stringify({
        queryBoundRequests,
        queryBoundApprovals,
        sideEffects: queryBoundResult.sideEffects
      })}`);
    }
    controller.closeTab(queryBoundTabId);

    const contentTypeTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(contentTypeTabId);
    let contentTypeSnapshot = await waitForFixture(
      controller,
      contentTypeTabId
    );
    const changedEncodingResult = await controller.click(
      contentTypeTabId,
      findRef(contentTypeSnapshot, 'Submit changed encoding')
    );
    if (
      contentTypeRequests.length !== 0 ||
      !changedEncodingResult.sideEffects.some((outcome) => (
        outcome?.ok === false &&
        outcome.code === 'REQUEST_CONTENT_TYPE_MISMATCH'
      ))
    ) {
      throw new Error(`A changed main-frame form encoding inherited approval: ${JSON.stringify({
        contentTypeRequests,
        sideEffects: changedEncodingResult.sideEffects
      })}`);
    }
    controller.closeTab(contentTypeTabId);
    const contentTypePopupTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(contentTypePopupTabId);
    contentTypeSnapshot = await waitForFixture(
      controller,
      contentTypePopupTabId
    );
    const tabsBeforeChangedEncodingPopup = new Set(controller.tabs.keys());
    const changedEncodingPopupResult = await controller.click(
      contentTypePopupTabId,
      findRef(contentTypeSnapshot, 'Open unsupported encoding popup')
    );
    const changedEncodingPopupTabs = Array.from(controller.tabs.keys())
      .filter((id) => !tabsBeforeChangedEncodingPopup.has(id));
    if (
      changedEncodingPopupTabs.length !== 0 ||
      contentTypeRequests.length !== 0 ||
      !changedEncodingPopupResult.sideEffects.some((outcome) => (
        outcome?.ok === false &&
        outcome.code === 'POPUP_REQUEST_MISMATCH'
      ))
    ) {
      throw new Error(`A changed popup form encoding inherited approval: ${JSON.stringify({
        changedEncodingPopupTabs,
        contentTypeRequests,
        sideEffects: changedEncodingPopupResult.sideEffects
      })}`);
    }
    controller.closeTab(contentTypePopupTabId);

    const focusMutationTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(focusMutationTabId);
    const focusMutationSnapshot = await waitForFixture(
      controller,
      focusMutationTabId
    );
    let focusMutationFailure = null;
    try {
      await controller.typeText(
        focusMutationTabId,
        findRef(focusMutationSnapshot, 'Focus mutation field'),
        'should not continue',
        { clear: true, submit: false }
      );
    } catch (error) {
      focusMutationFailure = error;
    }
    const focusMutationRemoved = await controller
      .getTab(focusMutationTabId)
      .view.webContents.executeJavaScript(
        "!document.getElementById('focus-mutation')"
      );
    if (
      !focusMutationFailure ||
      focusMutationFailure.mutationMayHaveOccurred !== true ||
      focusMutationFailure.tabId !== focusMutationTabId ||
      !focusMutationRemoved ||
      controller.getTab(focusMutationTabId).preapprovedNavigationGrant
    ) {
      throw new Error('A post-approval focus mutation was returned as an ordinary failure.');
    }
    controller.closeTab(focusMutationTabId);

    const failedDispatchTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(failedDispatchTabId);
    await waitForFixture(controller, failedDispatchTabId);
    const normalDispatchAgentInput = controller.dispatchAgentInput;
    const expectFailedDispatchToRevokeGrant = async (
      label,
      throwOnCall,
      action
    ) => {
      let dispatchCalls = 0;
      let failure = null;
      controller.dispatchAgentInput = async (tab, callback) => {
        dispatchCalls += 1;
        if (dispatchCalls === throwOnCall) {
          throw new Error('INJECTED_INPUT_FAILURE');
        }
        return normalDispatchAgentInput.call(controller, tab, callback);
      };
      try {
        await action();
      } catch (error) {
        if (/INJECTED_INPUT_FAILURE/.test(error.message)) {
          failure = error;
        }
      } finally {
        controller.dispatchAgentInput = normalDispatchAgentInput;
      }
      if (
        !failure ||
        failure.mutationMayHaveOccurred !== true ||
        failure.tabId !== failedDispatchTabId ||
        controller.getTab(failedDispatchTabId).preapprovedNavigationGrant ||
        !controller.getTab(failedDispatchTabId).navigationConflictSentinel
      ) {
        throw new Error(`${label} retained authority after input dispatch failed.`);
      }
      return failure;
    };
    await expectFailedDispatchToRevokeGrant(
      'Click',
      1,
      async () => {
        const snapshot = await controller.snapshot(failedDispatchTabId);
        await controller.click(
          failedDispatchTabId,
          findRef(snapshot, 'Submit approved amount')
        );
      }
    );
    await expectFailedDispatchToRevokeGrant(
      'Type and submit',
      2,
      async () => {
        const snapshot = await controller.snapshot(failedDispatchTabId);
        await controller.typeText(
          failedDispatchTabId,
          findRef(snapshot, 'Typed redirect field'),
          'grant cleanup',
          { clear: true, submit: true }
        );
      }
    );
    const partiallyTypedValue = await controller
      .getTab(failedDispatchTabId)
      .view.webContents.executeJavaScript(
        "document.querySelector('form[action=\"/typed-redirect-start\"] input[name=\"message\"]')?.value"
      );
    if (partiallyTypedValue !== 'grant cleanup') {
      throw new Error('The partial-mutation regression did not preserve its typed first phase.');
    }
    await expectFailedDispatchToRevokeGrant(
      'Explicit form submission',
      1,
      async () => {
        const snapshot = await controller.snapshot(failedDispatchTabId);
        await controller.submitForm(
          failedDispatchTabId,
          findRef(snapshot, 'Submit approved amount')
        );
      }
    );
    await expectFailedDispatchToRevokeGrant(
      'Activation key',
      1,
      async () => {
        const snapshot = await controller.snapshot(failedDispatchTabId);
        await controller.pressKey(
          failedDispatchTabId,
          'ENTER',
          findRef(snapshot, 'Submit approved amount')
        );
      }
    );
    controller.closeTab(failedDispatchTabId);

    const partialDispatchTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(partialDispatchTabId);
    const partialDispatchSnapshot = await waitForFixture(
      controller,
      partialDispatchTabId
    );
    const partialDispatchApprovalsBefore = approvalRequests.length;
    const normalDispatchTrustedPointer = controller.dispatchTrustedPointer;
    let partialDispatchFailure = null;
    controller.dispatchTrustedPointer = async (tab, location, click) => {
      if (tab.id !== partialDispatchTabId || !click) {
        return normalDispatchTrustedPointer.call(
          controller,
          tab,
          location,
          click
        );
      }
      const x = Math.round(Number(location?.x) || 0);
      const y = Math.round(Number(location?.y) || 0);
      tab.view.webContents.sendInputEvent({
        type: 'mouseMove',
        x,
        y,
        movementX: 0,
        movementY: 0
      });
      tab.view.webContents.sendInputEvent({
        type: 'mouseDown',
        x,
        y,
        button: 'left',
        clickCount: 1
      });
      await new Promise((resolve) => setImmediate(resolve));
      throw new Error('INJECTED_MOUSE_RELEASE_FAILURE');
    };
    try {
      await controller.click(
        partialDispatchTabId,
        findRef(partialDispatchSnapshot, 'Partial dispatch substitution')
      );
    } catch (error) {
      if (/INJECTED_MOUSE_RELEASE_FAILURE/.test(error.message)) {
        partialDispatchFailure = error;
      }
    } finally {
      controller.dispatchTrustedPointer = normalDispatchTrustedPointer;
    }
    const partialDispatchStartedAt = Date.now();
    while (
      !serverRequests.some(
        (request) => request.url === '/partial-dispatch-substituted'
      ) &&
      Date.now() - partialDispatchStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const partialDispatchApprovals = approvalRequests.slice(
      partialDispatchApprovalsBefore
    );
    const partialDispatchSideEffects =
      await controller.settleAgentSideEffects();
    if (
      !partialDispatchFailure ||
      partialDispatchFailure.mutationMayHaveOccurred !== true ||
      controller.getTab(partialDispatchTabId).preapprovedNavigationGrant ||
      !partialDispatchApprovals.some((request) => (
        ['sensitive-navigation', 'local-network'].includes(request.kind) &&
        request.actor === 'page'
      )) ||
      !serverRequests.some(
        (request) => request.url === '/partial-dispatch-substituted'
      ) ||
      partialDispatchSideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error(
        `A partial trusted-input failure lost its conflict boundary: ${JSON.stringify({
          partialDispatchApprovals,
          partialDispatchSideEffects
        })}`
      );
    }
    controller.closeTab(partialDispatchTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting covered checkbox');
    const coveredRef = findRef(firstSnapshot, 'Covered choice');
    let coveredRejected = false;
    try {
      await controller.setChecked(firstTabId, coveredRef, true);
    } catch (error) {
      coveredRejected = /ELEMENT_OCCLUDED/.test(error.message);
    }
    if (!coveredRejected) {
      throw new Error('A covered checkbox was not rejected.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting framed control covered by parent');
    const framedRef = findRef(firstSnapshot, 'Framed action');
    let framedOverlayRejected = false;
    try {
      await controller.click(firstTabId, framedRef);
    } catch (error) {
      framedOverlayRejected = /ELEMENT_OCCLUDED/.test(error.message);
    }
    if (!framedOverlayRejected) {
      throw new Error('A parent overlay did not block the framed control.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('detecting asynchronous checkbox reversion');
    const revertingRef = findRef(firstSnapshot, 'Reverting choice');
    const reverted = await controller.setChecked(firstTabId, revertingRef, true);
    if (reverted.stateMatched !== false || reverted.checked !== false) {
      throw new Error('An asynchronously reverted checkbox was reported as matched.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting invalid check targets');
    const textTrapRef = findRef(firstSnapshot, 'Text check trap');
    let textTrapRejected = false;
    try {
      await controller.setChecked(firstTabId, textTrapRef, true);
    } catch (error) {
      textTrapRejected = /ELEMENT_NOT_CHECKABLE/.test(error.message);
    }
    if (!textTrapRejected) {
      throw new Error('A text input was incorrectly treated as checkable.');
    }

    const radioRef = findRef(firstSnapshot, 'Radio choice');
    let radioUncheckRejected = false;
    try {
      await controller.setChecked(firstTabId, radioRef, false);
    } catch (error) {
      radioUncheckRejected = /RADIO_CANNOT_BE_UNCHECKED/.test(error.message);
    }
    if (!radioUncheckRejected) {
      throw new Error('Radio uncheck was not rejected.');
    }

    const selectRef = findRef(firstSnapshot, 'Plan');
    writeStage('verifying selection');
    const selected = await controller.selectOption(firstTabId, selectRef, 'Enterprise');
    const planChanges = await controller.getTab(firstTabId).view.webContents
      .executeJavaScript('window.__planChanges');
    if (
      selected.stateMatched !== true ||
      selected.selected !== 'Enterprise' ||
      planChanges.length !== 1 ||
      planChanges[0].value !== 'Enterprise'
    ) {
      throw new Error('Select option final state was not verified.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('detecting changed select option');
    const changingSelectRef = findRef(firstSnapshot, 'Changing plan');
    const changedSelection = await controller.selectOption(
      firstTabId,
      changingSelectRef,
      'Team'
    );
    if (
      changedSelection.stateMatched !== false ||
      changedSelection.selected !== 'Enterprise'
    ) {
      throw new Error('A changed same-index option was reported as verified.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    if (!firstSnapshot.elements.some((element) => (
      element.name === 'Delete account' &&
      element.tag === 'button'
    ))) {
      throw new Error('Visible destructive button text was masked by its DOM name.');
    }

    writeStage('rejecting nested interactive target substitution');
    const nestedWrapperRef = findRef(firstSnapshot, 'View details');
    const nestedApprovalsBefore = approvalRequests.length;
    let nestedInteractiveRejected = false;
    try {
      await controller.click(firstTabId, nestedWrapperRef);
    } catch (error) {
      nestedInteractiveRejected = /ELEMENT_OCCLUDED/.test(error.message);
    }
    const nestedResult = await controller.getTab(firstTabId).view.webContents
      .executeJavaScript("document.getElementById('result').textContent");
    if (
      !nestedInteractiveRejected ||
      nestedResult === 'nested-delete' ||
      approvalRequests.length !== nestedApprovalsBefore
    ) {
      throw new Error('A nested high-impact control substituted for its approved parent.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting frame and shadow boundary target substitution');
    for (const [name, forbiddenResult] of [
      ['View framed details', 'framed-delete'],
      ['View shadow details', 'shadow-delete'],
      ['View object details', 'object-delete'],
      ['Embedded account controls', 'object-delete']
    ]) {
      const boundaryRef = findRef(firstSnapshot, name);
      const boundaryApprovalsBefore = approvalRequests.length;
      let boundaryRejected = false;
      try {
        await controller.click(firstTabId, boundaryRef);
      } catch (error) {
        boundaryRejected = /ELEMENT_(?:OCCLUDED|NOT_INTERACTIVE)/.test(error.message);
      }
      const boundaryResult = await controller.getTab(firstTabId).view.webContents
        .executeJavaScript("document.getElementById('result').textContent");
      if (
        !boundaryRejected ||
        boundaryResult === forbiddenResult ||
        approvalRequests.length !== boundaryApprovalsBefore
      ) {
        throw new Error(`A ${name} boundary substituted a nested high-impact control.`);
      }
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting associated-label target forwarding');
    const forwardingLabelRef = findRef(firstSnapshot, 'View label details');
    const forwardingApprovalsBefore = approvalRequests.length;
    const forwardingRequestsBefore = serverRequests.filter(
      (request) => request.url === '/label-delete'
    ).length;
    let forwardingLabelRejected = false;
    try {
      await controller.click(firstTabId, forwardingLabelRef);
    } catch (error) {
      forwardingLabelRejected = /ELEMENT_NOT_INTERACTIVE/.test(error.message);
    }
    if (
      !forwardingLabelRejected ||
      approvalRequests.length !== forwardingApprovalsBefore ||
      serverRequests.filter(
        (request) => request.url === '/label-delete'
      ).length !== forwardingRequestsBefore
    ) {
      throw new Error('An associated label forwarded a routine-approved click.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('classifying image submitters as form actions');
    const imageSubmitRef = findRef(firstSnapshot, 'View image details');
    const imageApprovalsBefore = approvalRequests.length;
    const imageRequestsBefore = serverRequests.filter(
      (request) => request.url === '/image-delete'
    ).length;
    approvalOverride = async () => false;
    let imageSubmitDenied = false;
    try {
      await controller.click(firstTabId, imageSubmitRef);
    } catch (error) {
      imageSubmitDenied = /click was denied/i.test(error.message);
    }
    const imageApproval = approvalRequests[imageApprovalsBefore];
    if (
      !imageSubmitDenied ||
      approvalRequests.length !== imageApprovalsBefore + 1 ||
      imageApproval?.kind !== 'high-impact-click' ||
      imageApproval?.submits !== true ||
      serverRequests.filter(
        (request) => request.url === '/image-delete'
      ).length !== imageRequestsBefore
    ) {
      throw new Error('An image submitter bypassed form-action approval.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    const continueRef = findRef(firstSnapshot, 'Continue');
    writeStage('clicking visible button');
    await controller.click(firstTabId, continueRef);
    const clickResult = await controller.getTab(firstTabId).view.webContents.executeJavaScript(
      "document.getElementById('result').textContent"
    );
    if (clickResult !== 'continued') {
      throw new Error('A visible button did not receive the trusted pointer click.');
    }

    firstSnapshot = await controller.snapshot(firstTabId);
    const postPopupRef = findRef(firstSnapshot, 'Open POST popup');
    const postPopupElement = firstSnapshot.elements.find(
      (element) => element.ref === postPopupRef
    );
    const tabsBeforePostPopup = new Set(controller.tabs.keys());
    const postPopupResult = await controller.click(firstTabId, postPopupRef);
    const postPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforePostPopup.has(id));
    if (
      !postPopupTabId ||
      !postPopupResult.newTabIds.includes(postPopupTabId) ||
      postPopupRequests.length !== 1 ||
      postPopupRequests[0].method !== 'POST' ||
      postPopupRequests[0].body !== 'message=kept' ||
      postPopupResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor !== 'agent' ||
          !outcome.value.runId
        )
      ))
    ) {
      throw new Error(`A target-blank POST popup did not preserve its method and body: ${JSON.stringify({
        postPopupTabId,
        newTabIds: postPopupResult.newTabIds,
        postPopupRequests,
        navigationTarget: postPopupElement?.navigationTarget
      })}`);
    }
    controller.closeTab(postPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    const namedPopupRef = findRef(firstSnapshot, 'Open named popup');
    const tabsBeforeNamedPopup = new Set(controller.tabs.keys());
    const namedPopupResult = await controller.click(firstTabId, namedPopupRef);
    const namedPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeNamedPopup.has(id));
    if (
      !namedPopupTabId ||
      !namedPopupResult.newTabIds.includes(namedPopupTabId) ||
      !controller.isAgentApprovalTab(namedPopupTabId)
    ) {
      throw new Error('A named-target popup lost its exact agent grant.');
    }
    controller.closeTab(namedPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    const namedPostPopupRef = findRef(
      firstSnapshot,
      'Open named POST popup'
    );
    const tabsBeforeNamedPostPopup = new Set(controller.tabs.keys());
    const namedPostPopupResult = await controller.click(
      firstTabId,
      namedPostPopupRef
    );
    const namedPostPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeNamedPostPopup.has(id));
    if (
      !namedPostPopupTabId ||
      !namedPostPopupResult.newTabIds.includes(namedPostPopupTabId) ||
      !controller.isAgentApprovalTab(namedPostPopupTabId) ||
      namedPostPopupRequests.length !== 1 ||
      namedPostPopupRequests[0].method !== 'POST' ||
      namedPostPopupRequests[0].body !== 'message=named-kept'
    ) {
      throw new Error('A named-target POST popup lost its method or exact grant.');
    }
    controller.closeTab(namedPostPopupTabId);

    await controller.getTab(firstTabId).view.webContents.executeJavaScript(
      "document.head.append(Object.assign(document.createElement('base'), { target: '_blank' }))"
    );
    firstSnapshot = await controller.snapshot(firstTabId);
    const basePopupRef = findRef(firstSnapshot, 'Open base popup');
    const tabsBeforeBasePopup = new Set(controller.tabs.keys());
    let basePopupResult;
    try {
      basePopupResult = await controller.click(firstTabId, basePopupRef);
    } finally {
      await controller.getTab(firstTabId).view.webContents.executeJavaScript(
        "document.querySelector('base[target]')?.remove()"
      );
    }
    const basePopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeBasePopup.has(id));
    if (
      !basePopupTabId ||
      !basePopupResult.newTabIds.includes(basePopupTabId) ||
      !controller.isAgentApprovalTab(basePopupTabId)
    ) {
      throw new Error('A base-target popup lost its exact agent grant.');
    }
    controller.closeTab(basePopupTabId);

    writeStage('preserving cross-origin 307 POST');
    const redirectPostTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(redirectPostTabId);
    const redirectPostSnapshot = await waitForFixture(
      controller,
      redirectPostTabId
    );
    const redirectPostRef = findRef(
      redirectPostSnapshot,
      'Submit redirecting POST'
    );
    const redirectPostApprovalsBefore = approvalRequests.length;
    await controller.click(redirectPostTabId, redirectPostRef);
    const redirectPostStartedAt = Date.now();
    while (
      postRedirectRequests.length < 2 &&
      Date.now() - redirectPostStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const redirectedPost = postRedirectRequests.find(
      (request) => request.url === '/post-redirect-final'
    );
    const redirectPostApprovals = approvalRequests.slice(
      redirectPostApprovalsBefore
    );
    if (
      redirectedPost?.method !== 'POST' ||
      redirectedPost?.body !== 'message=redirect-kept' ||
      !String(redirectedPost?.host || '').startsWith('localhost:') ||
      redirectPostApprovals.filter(
        (request) => request.kind === 'local-network'
      ).length !== 1
    ) {
      throw new Error('A protected cross-origin 307 redirect did not preserve its POST request.');
    }

    writeStage('preserving typed and activation-key POST redirects');
    const exerciseActivationRedirect = async ({
      fieldName,
      finalPath,
      expectedBody,
      action
    }) => {
      const activationTabId = await controller.createTab(url, {
        activate: true,
        source: 'user'
      });
      controller.includeAgentApprovalTab(activationTabId);
      const activationSnapshot = await waitForFixture(
        controller,
        activationTabId
      );
      const fieldRef = findRef(activationSnapshot, fieldName);
      const approvalsBefore = approvalRequests.length;
      if (action === 'type') {
        await controller.typeText(
          activationTabId,
          fieldRef,
          'typed-kept',
          { clear: true, submit: true }
        );
      } else {
        await controller.pressKey(activationTabId, 'ENTER', fieldRef);
      }
      const startedAt = Date.now();
      while (
        !postRedirectRequests.some((request) => request.url === finalPath) &&
        Date.now() - startedAt < 5000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const finalRequest = postRedirectRequests.find(
        (request) => request.url === finalPath
      );
      const approvals = approvalRequests.slice(approvalsBefore);
      if (
        finalRequest?.method !== 'POST' ||
        finalRequest?.body !== expectedBody ||
        approvals.filter(
          (request) => request.kind === 'local-network'
        ).length !== 1
      ) {
        throw new Error(`${fieldName} lost POST attribution across its protected redirect: ${JSON.stringify({
          finalRequest,
          approvals: approvals.map((request) => ({
            kind: request.kind,
            actor: request.actor,
            toOrigin: request.toOrigin
          })),
          matchingRequests: postRedirectRequests.filter((request) => (
            request.url === finalPath ||
            request.url === finalPath.replace('-final', '-start')
          ))
        })}`);
      }
    };
    await exerciseActivationRedirect({
      fieldName: 'Typed redirect field',
      finalPath: '/typed-redirect-final',
      expectedBody: 'message=typed-kept',
      action: 'type'
    });
    await exerciseActivationRedirect({
      fieldName: 'Key redirect field',
      finalPath: '/key-redirect-final',
      expectedBody: 'message=key-kept',
      action: 'key'
    });

    writeStage('rejecting changed effective submitter');
    const mutableSubmitTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(mutableSubmitTabId);
    const mutableSubmitSnapshot = await waitForFixture(
      controller,
      mutableSubmitTabId
    );
    const mutableSubmitRef = findRef(
      mutableSubmitSnapshot,
      'Mutable submit field'
    );
    let releaseMutableApproval;
    let enterMutableApproval;
    const mutableApprovalEntered = new Promise((resolve) => {
      enterMutableApproval = resolve;
    });
    approvalOverride = (request) => {
      enterMutableApproval(request);
      return new Promise((resolve) => {
        releaseMutableApproval = resolve;
      });
    };
    const mutableRequestsBefore = serverRequests.filter(
      (request) => request.url === '/mutable-submit'
    ).length;
    const mutableSubmitPromise = controller.typeText(
      mutableSubmitTabId,
      mutableSubmitRef,
      'security review',
      { clear: true, submit: true }
    );
    const mutableApproval = await mutableApprovalEntered;
    if (mutableApproval.kind !== 'agent-type-submit') {
      throw new Error('The submitter-change test intercepted the wrong approval.');
    }
    await controller.getTab(mutableSubmitTabId).view.webContents
      .executeJavaScript(`(() => {
        const oldButton = document.querySelector('#mutable-submit-form button');
        const replacement = document.createElement('button');
        replacement.type = 'submit';
        replacement.name = 'intent';
        replacement.value = 'delete';
        replacement.textContent = 'Delete account';
        oldButton.replaceWith(replacement);
      })()`);
    releaseMutableApproval(true);
    let mutableSubmitRejected = false;
    try {
      await mutableSubmitPromise;
    } catch (error) {
      mutableSubmitRejected = /TARGET_CHANGED_(?:BEFORE|DURING)_APPROVAL/.test(
        error.message
      );
    }
    if (
      !mutableSubmitRejected ||
      serverRequests.filter(
        (request) => request.url === '/mutable-submit'
      ).length !== mutableRequestsBefore
    ) {
      throw new Error('A changed effective submitter survived action revalidation.');
    }

    writeStage('binding a consumed grant to its original request chain');
    const overlapTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(overlapTabId);
    const overlapSnapshot = await waitForFixture(
      controller,
      overlapTabId
    );
    const overlapRef = findRef(
      overlapSnapshot,
      'Consumed grant overlap'
    );
    const overlapApprovalsBefore = approvalRequests.length;
    await controller.click(overlapTabId, overlapRef);
    const overlapStartedAt = Date.now();
    while (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-overlap.test:') &&
        request.url === '/overlap-final'
      )) &&
      Date.now() - overlapStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const overlapOrigin =
      `http://browsme-overlap.test:${server.address().port}`;
    const overlapApprovals = approvalRequests.slice(overlapApprovalsBefore);
    if (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-approved.test:') &&
        request.url === '/slow-approved'
      )) ||
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-overlap.test:') &&
        request.url === '/overlap-final'
      )) ||
      !overlapApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'page' &&
        request.toOrigin === overlapOrigin
      )) ||
      overlapApprovals.some((request) => (
        request.actor === 'agent' &&
        request.toOrigin === overlapOrigin
      ))
    ) {
      throw new Error(`A replacement request inherited a consumed navigation grant: ${JSON.stringify({
        approvedRequestSeen: serverRequests.some((request) => (
          String(request.host || '').startsWith('browsme-approved.test:') &&
          request.url === '/slow-approved'
        )),
        overlapRequestSeen: serverRequests.some((request) => (
          String(request.host || '').startsWith('browsme-overlap.test:') &&
          request.url === '/overlap-final'
        )),
        overlapApprovals
      })}`);
    }

    writeStage('preventing consumed popup grant reuse');
    const popupReuseTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(popupReuseTabId);
    await waitForFixture(controller, popupReuseTabId);
    await controller.getTab(popupReuseTabId).view.webContents.executeJavaScript(
      "window.name = 'reuse-target'"
    );
    const popupReuseSnapshot = await controller.snapshot(popupReuseTabId);
    const popupReuseRef = findRef(
      popupReuseSnapshot,
      'Consumed popup reuse'
    );
    const popupReuseRequestsBefore = serverRequests.filter(
      (request) => request.url === '/slow-popup-reuse'
    ).length;
    const tabsBeforePopupReuse = new Set(controller.tabs.keys());
    const popupReuseResult = await controller.click(
      popupReuseTabId,
      popupReuseRef
    );
    const popupReuseStartedAt = Date.now();
    while (
      (
        serverRequests.filter(
          (request) => request.url === '/slow-popup-reuse'
        ).length < popupReuseRequestsBefore + 2 ||
        !Array.from(controller.tabs.keys())
          .some((id) => !tabsBeforePopupReuse.has(id))
      ) &&
      Date.now() - popupReuseStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const popupReuseNewTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforePopupReuse.has(id));
    if (
      !popupReuseNewTabId ||
      controller.isAgentApprovalTab(popupReuseNewTabId) ||
      popupReuseResult.newTabIds.includes(popupReuseNewTabId) ||
      serverRequests.filter(
        (request) => request.url === '/slow-popup-reuse'
      ).length < popupReuseRequestsBefore + 2
    ) {
      throw new Error('A consumed navigation grant authorized an extra popup.');
    }
    controller.closeTab(popupReuseNewTabId);

    writeStage('keeping script-driven activation redirect page scoped');
    const scriptRedirectTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(scriptRedirectTabId);
    const scriptRedirectSnapshot = await waitForFixture(
      controller,
      scriptRedirectTabId
    );
    const scriptRedirectRef = findRef(
      scriptRedirectSnapshot,
      'Script redirect field'
    );
    const scriptRedirectApprovalsBefore = approvalRequests.length;
    const scriptRedirectResult = await controller.pressKey(
      scriptRedirectTabId,
      'ENTER',
      scriptRedirectRef
    );
    const scriptRedirectStartedAt = Date.now();
    while (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/script-chain-final'
      )) &&
      Date.now() - scriptRedirectStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const scriptRedirectApprovals = approvalRequests.slice(
      scriptRedirectApprovalsBefore
    );
    if (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/script-chain-final'
      )) ||
      !scriptRedirectApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'page'
      )) ||
      scriptRedirectApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'agent'
      )) ||
      scriptRedirectResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error('A script-driven activation redirect inherited agent authority.');
    }

    writeStage('isolating a mousedown timer during trusted input');
    const inputWindowTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(inputWindowTabId);
    const inputWindowSnapshot = await waitForFixture(
      controller,
      inputWindowTabId
    );
    const inputWindowRef = findRef(
      inputWindowSnapshot,
      'Input-window timer navigation'
    );
    const inputWindowApprovalsBefore = approvalRequests.length;
    const inputWindowResult = await controller.click(
      inputWindowTabId,
      inputWindowRef
    );
    const inputWindowStartedAt = Date.now();
    while (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/input-window-final'
      )) &&
      Date.now() - inputWindowStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const inputWindowApprovals = approvalRequests.slice(
      inputWindowApprovalsBefore
    );
    if (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/input-window-final'
      )) ||
      !inputWindowApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'page'
      )) ||
      inputWindowApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'agent'
      )) ||
      inputWindowResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error('A timer racing trusted input inherited agent authority.');
    }

    writeStage('keeping zero-delay page navigation unscoped');
    const zeroNavigationTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(zeroNavigationTabId);
    const zeroNavigationSnapshot = await waitForFixture(
      controller,
      zeroNavigationTabId
    );
    const zeroNavigationRef = findRef(
      zeroNavigationSnapshot,
      'Zero-delay navigation'
    );
    const zeroNavigationApprovalsBefore = approvalRequests.length;
    const zeroNavigationResult = await controller.click(
      zeroNavigationTabId,
      zeroNavigationRef
    );
    const zeroNavigationStartedAt = Date.now();
    while (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/zero-location-final'
      )) &&
      Date.now() - zeroNavigationStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const zeroNavigationApprovals = approvalRequests.slice(
      zeroNavigationApprovalsBefore
    );
    if (
      !serverRequests.some((request) => (
        String(request.host || '').startsWith('browsme-public-redirect.test:') &&
        request.url === '/zero-location-final'
      )) ||
      !zeroNavigationApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'page'
      )) ||
      zeroNavigationApprovals.some((request) => (
        request.kind === 'sensitive-navigation' &&
        request.actor === 'agent'
      )) ||
      zeroNavigationResult.sideEffects.some((outcome) => (
        outcome?.ok &&
        outcome.value?.kind === 'network-authorization' &&
        (
          outcome.value.actor === 'agent' ||
          Boolean(outcome.value.runId)
        )
      ))
    ) {
      throw new Error('A zero-delay page navigation inherited agent authority.');
    }

    controller.activateTab(firstTabId);
    firstSnapshot = await controller.snapshot(firstTabId);
    const inputWindowPopupRef = findRef(
      firstSnapshot,
      'Input-window timer popup'
    );
    const tabsBeforeInputWindowPopup = new Set(controller.tabs.keys());
    const inputWindowPopupResult = await controller.click(
      firstTabId,
      inputWindowPopupRef
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const inputWindowPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeInputWindowPopup.has(id));
    if (
      !inputWindowPopupTabId ||
      inputWindowPopupResult.newTabIds.includes(inputWindowPopupTabId) ||
      controller.isAgentApprovalTab(inputWindowPopupTabId)
    ) {
      throw new Error('A popup racing trusted input inherited agent authority.');
    }
    controller.closeTab(inputWindowPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    const delayedPopupRef = findRef(firstSnapshot, 'Delayed popup');
    const tabsBeforeDelayedPopup = new Set(controller.tabs.keys());
    const delayedPopupResult = await controller.click(firstTabId, delayedPopupRef);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const delayedPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeDelayedPopup.has(id));
    if (!delayedPopupTabId) {
      throw new Error('The delayed page popup did not open for provenance testing.');
    }
    if (
      delayedPopupResult.newTabIds.includes(delayedPopupTabId) ||
      controller.isAgentApprovalTab(delayedPopupTabId)
    ) {
      throw new Error('A delayed page popup incorrectly inherited agent authority.');
    }
    controller.closeTab(delayedPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    const zeroPopupRef = findRef(firstSnapshot, 'Zero-delay popup');
    const tabsBeforeZeroPopup = new Set(controller.tabs.keys());
    const zeroPopupResult = await controller.click(firstTabId, zeroPopupRef);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const zeroPopupTabId = Array.from(controller.tabs.keys())
      .find((id) => !tabsBeforeZeroPopup.has(id));
    if (
      !zeroPopupTabId ||
      zeroPopupResult.newTabIds.includes(zeroPopupTabId) ||
      controller.isAgentApprovalTab(zeroPopupTabId)
    ) {
      throw new Error('A zero-delay page popup incorrectly inherited agent authority.');
    }
    controller.closeTab(zeroPopupTabId);

    firstSnapshot = await controller.snapshot(firstTabId);
    writeStage('rejecting changed target');
    const renameRef = findRef(firstSnapshot, 'Open report');
    await controller.getTab(firstTabId).view.webContents.executeJavaScript(
      "document.getElementById('rename').textContent = 'Delete account'"
    );
    let renamedTargetRejected = false;
    try {
      await controller.click(firstTabId, renameRef);
    } catch (error) {
      renamedTargetRejected = /TARGET_CHANGED_BEFORE_APPROVAL/.test(error.message);
    }
    if (!renamedTargetRejected) {
      throw new Error('A changed accessible name did not invalidate its old ref.');
    }

    let untargetedEnterRejected = false;
    writeStage('rejecting untargeted key');
    try {
      await controller.pressKey(firstTabId, 'ENTER');
    } catch (error) {
      untargetedEnterRejected = /TARGET_REF_REQUIRED_FOR_KEY/.test(error.message);
    }
    if (!untargetedEnterRejected) {
      throw new Error('Untargeted ENTER was not rejected.');
    }

    const secondTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    const secondSnapshot = await waitForFixture(controller, secondTabId);
    writeStage('checking cross-tab refs');
    const firstRefs = new Set(firstSnapshot.elements.map((element) => element.ref));
    if (secondSnapshot.elements.some((element) => firstRefs.has(element.ref))) {
      throw new Error('Snapshot refs collided across tabs.');
    }

    writeStage('checking local redirect approval chain');
    const redirectApprovalsBefore = approvalRequests.length;
    await controller.navigate(
      secondTabId,
      `${url}redirect-start`,
      'agent'
    );
    if (approvalRequests.length - redirectApprovalsBefore !== 1) {
      throw new Error('A same-origin local redirect requested duplicate approval.');
    }
    if (!controller.getTab(secondTabId).url.endsWith('/redirect-final')) {
      throw new Error('The approved local redirect did not reach its final page.');
    }

    writeStage('checking different local origin redirect approval');
    const otherLocalApprovalsBefore = approvalRequests.length;
    const redirectEvents = [];
    const redirectContents = controller.getTab(secondTabId).view.webContents;
    redirectContents.on('will-navigate', (event, legacyUrl) => {
      redirectEvents.push({
        type: 'will-navigate',
        url: event?.url || legacyUrl,
        current: redirectContents.getURL()
      });
    });
    redirectContents.on('will-redirect', (event, legacyUrl) => {
      redirectEvents.push({
        type: 'will-redirect',
        url: event?.url || legacyUrl,
        current: redirectContents.getURL()
      });
    });
    redirectContents.on('did-start-navigation', (_event, eventUrl, _inPlace, isMainFrame) => {
      if (isMainFrame) {
        redirectEvents.push({ type: 'did-start-navigation', url: eventUrl, current: redirectContents.getURL() });
      }
    });
    redirectContents.on('did-redirect-navigation', (_event, eventUrl, _inPlace, isMainFrame) => {
      if (isMainFrame) {
        redirectEvents.push({ type: 'did-redirect-navigation', url: eventUrl, current: redirectContents.getURL() });
      }
    });
    redirectContents.on('did-navigate', (_event, eventUrl) => {
      redirectEvents.push({ type: 'did-navigate', url: eventUrl, current: redirectContents.getURL() });
    });
    redirectContents.on('did-fail-load', (_event, code, description, eventUrl, isMainFrame) => {
      if (isMainFrame) {
        redirectEvents.push({
          type: 'did-fail-load',
          code,
          description,
          url: eventUrl,
          current: redirectContents.getURL()
        });
      }
    });
    await controller.navigate(
      secondTabId,
      `${url}redirect-other-local`,
      'agent'
    );
    if (approvalRequests.length - otherLocalApprovalsBefore !== 2) {
      throw new Error(
        `A redirect to a different local origin did not request a new approval: ${JSON.stringify(
          approvalRequests.slice(otherLocalApprovalsBefore).map((request) => ({
            kind: request.kind,
            actor: request.actor,
            fromOrigin: request.fromOrigin,
            toOrigin: request.toOrigin
          }))
        )}; events=${JSON.stringify(redirectEvents)}; requests=${JSON.stringify(
          serverRequests.slice(-8)
        )}; current=${controller.getTab(secondTabId).view.webContents.getURL()}`
      );
    }
    if (!controller.getTab(secondTabId).url.startsWith('http://localhost:')) {
      throw new Error('The separately approved local-origin redirect did not complete.');
    }

    writeStage('checking agent local tab approval');
    const tabApprovalsBefore = approvalRequests.length;
    await controller.createTab(url, {
      activate: false,
      source: 'agent',
      initiatorTabId: secondTabId,
      runId: 'live-smoke'
    });
    if (approvalRequests.length - tabApprovalsBefore !== 1) {
      throw new Error('An approved local agent tab requested duplicate approval.');
    }

    writeStage('checking DNS-private link approval');
    const dnsTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(dnsTabId);
    let dnsSnapshot = await waitForFixture(controller, dnsTabId);
    const dnsBlankRef = findRef(
      dnsSnapshot,
      'Open DNS-private destination in a new tab'
    );
    const dnsBlankTabsBefore = new Set(controller.tabs.keys());
    const dnsBlankApprovalsBefore = approvalRequests.length;
    const dnsBlankResult = await controller.click(dnsTabId, dnsBlankRef);
    const dnsBlankApprovals = approvalRequests.slice(dnsBlankApprovalsBefore);
    const dnsBlankTabId = Array.from(controller.tabs.keys())
      .find((id) => !dnsBlankTabsBefore.has(id));
    const dnsBlankSourceGrant =
      controller.getTab(dnsTabId).preapprovedNavigationGrant;
    const dnsBlankSourceSentinel =
      controller.getTab(dnsTabId).navigationConflictSentinel;
    if (
      dnsBlankApprovals.length !== 1 ||
      dnsBlankApprovals[0].kind !== 'local-network' ||
      !dnsBlankTabId ||
      !dnsBlankResult.newTabIds.includes(dnsBlankTabId) ||
      dnsBlankSourceGrant ||
      !dnsBlankSourceSentinel
    ) {
      throw new Error('A DNS-private new-tab link did not consume exactly one approval.');
    }

    dnsSnapshot = await waitForFixture(controller, dnsTabId);
    const dnsPrivateRef = findRef(dnsSnapshot, 'Open DNS-private destination');
    const dnsApprovalsBefore = approvalRequests.length;
    const dnsContents = controller.getTab(dnsTabId).view.webContents;
    dnsContents.on('will-navigate', (event, legacyUrl) => {
      writeStage(`DNS link will navigate: ${event?.url || legacyUrl || 'unknown'}`);
    });
    dnsContents.on('did-start-navigation', (event, legacyUrl) => {
      if (event?.isMainFrame !== false) {
        writeStage(`DNS link started: ${event?.url || legacyUrl || 'unknown'}`);
      }
    });
    dnsContents.on('did-navigate', (_event, eventUrl) => {
      writeStage(`DNS link committed: ${eventUrl || 'unknown'}`);
    });
    dnsContents.on('dom-ready', () => {
      writeStage(`DNS link DOM ready: ${dnsContents.getURL() || 'unknown'}`);
    });
    await controller.click(dnsTabId, dnsPrivateRef);
    writeStage('DNS-private click returned');
    const dnsApprovals = approvalRequests.slice(dnsApprovalsBefore);
    writeStage(`DNS-private approvals: ${JSON.stringify(
      dnsApprovals.map((request) => request.kind)
    )}; url=${controller.getTab(dnsTabId).url}`);
    if (
      dnsApprovals.length !== 1 ||
      dnsApprovals[0].kind !== 'local-network'
    ) {
      throw new Error('A DNS-resolved private link did not request exactly one local-network approval.');
    }
    if (
      !controller.getTab(dnsTabId).url.startsWith(
        `http://browsme-dns-private.test:${address.port}/`
      )
    ) {
      throw new Error('The approved DNS-private link did not complete.');
    }

    writeStage('checking restored DNS-private tab approval');
    const restoredDnsApprovalsBefore = approvalRequests.length;
    const restoredDnsTabId = await controller.createTab(
      `http://browsme-dns-private.test:${address.port}/restored-private`,
      {
        activate: true,
        source: 'restore'
      }
    );
    const restoredDnsStartedAt = Date.now();
    while (
      !controller.getTab(restoredDnsTabId).url.startsWith(
        `http://browsme-dns-private.test:${address.port}/`
      ) &&
      Date.now() - restoredDnsStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const restoredDnsApprovals = approvalRequests.slice(
      restoredDnsApprovalsBefore
    );
    if (
      restoredDnsApprovals.length !== 1 ||
      restoredDnsApprovals[0].kind !== 'local-network' ||
      restoredDnsApprovals[0].actor !== 'page'
    ) {
      throw new Error('A restored DNS-private tab bypassed fresh local-network approval.');
    }

    writeStage('checking unscoped DNS-private page navigation');
    const pageDnsTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    await waitForFixture(controller, pageDnsTabId);
    const pageDnsApprovalsBefore = approvalRequests.length;
    await controller.getTab(pageDnsTabId).view.webContents.executeJavaScript(
      `location.href = ${JSON.stringify(
        `http://browsme-dns-page.test:${address.port}/page-navigation`
      )}`
    );
    const pageDnsStartedAt = Date.now();
    while (
      !controller.getTab(pageDnsTabId).url.startsWith(
        `http://browsme-dns-page.test:${address.port}/`
      ) &&
      Date.now() - pageDnsStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const pageDnsApprovals = approvalRequests.slice(pageDnsApprovalsBefore);
    if (
      pageDnsApprovals.length !== 1 ||
      pageDnsApprovals[0].kind !== 'local-network' ||
      pageDnsApprovals[0].actor !== 'page' ||
      !controller.getTab(pageDnsTabId).url.startsWith(
        `http://browsme-dns-page.test:${address.port}/`
      )
    ) {
      throw new Error('An unscoped DNS-private page navigation bypassed the local-network boundary.');
    }

    writeStage('checking DNS rebinding revalidation');
    const rebindTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(rebindTabId);
    const rebindSnapshot = await waitForFixture(controller, rebindTabId);
    const rebindRef = findRef(rebindSnapshot, 'Open rebinding destination');
    const rebindApprovalsBefore = approvalRequests.length;
    await controller.click(rebindTabId, rebindRef);
    const rebindApprovals = approvalRequests.slice(rebindApprovalsBefore);
    if (
      rebindResolutionChecks < 2 ||
      rebindApprovals.length !== 2 ||
      rebindApprovals[0].kind !== 'cross-origin-click' ||
      rebindApprovals[1].kind !== 'local-network' ||
      !controller.getTab(rebindTabId).url.startsWith(
        `http://browsme-rebind.test:${address.port}/`
      )
    ) {
      throw new Error('A destination that rebound to a private address bypassed revalidation.');
    }

    writeStage('checking agent history local-network approval');
    const historyTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    await waitForFixture(controller, historyTabId);
    await controller.navigate(
      historyTabId,
      `http://browsme-dns-page.test:${address.port}/history-public`,
      'user'
    );
    await waitForFixture(controller, historyTabId);
    controller.includeAgentApprovalTab(historyTabId);
    const historyApprovalsBefore = approvalRequests.length;
    await controller.navigationActionForAgent(historyTabId, 'back');
    const historyStartedAt = Date.now();
    while (
      !controller.getTab(historyTabId).url.startsWith(url) &&
      Date.now() - historyStartedAt < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const historyApprovals = approvalRequests.slice(historyApprovalsBefore);
    if (
      historyApprovals.length !== 1 ||
      historyApprovals[0].kind !== 'local-network' ||
      !controller.getTab(historyTabId).url.startsWith(url)
    ) {
      throw new Error('Agent history navigation bypassed or duplicated local-network approval.');
    }

    writeStage('checking denied redirect completion');
    const deniedTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(deniedTabId);
    await waitForFixture(controller, deniedTabId);
    denyNextLocalhostApproval = true;
    const deniedStartedAt = Date.now();
    let deniedPromptRejected = false;
    try {
      await Promise.race([
        controller.navigate(
          deniedTabId,
          `${url}redirect-denied`,
          'agent'
        ),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('DENIED_REDIRECT_HUNG')),
            3500
          );
        })
      ]);
    } catch (error) {
      deniedPromptRejected =
        /APPROVAL_DENIED/.test(error.message) &&
        !/DENIED_REDIRECT_HUNG/.test(error.message);
    }
    if (
      !deniedPromptRejected ||
      Date.now() - deniedStartedAt >= 3500
    ) {
      throw new Error('A denied redirect did not reject its navigation promptly.');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (serverRequests.some((request) => (
      String(request.host || '').startsWith('localhost:') &&
      request.url === '/denied-final'
    ))) {
      throw new Error('A denied redirect reached the protected destination server.');
    }

    writeStage('checking superseded navigation rejection');
    const supersedeTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(supersedeTabId);
    await waitForFixture(controller, supersedeTabId);
    const supersedeApprovalsBefore = approvalRequests.length;
    await controller.getTab(supersedeTabId).view.webContents.executeJavaScript(
      `setTimeout(() => { location.href = ${JSON.stringify(
        `${url}superseding-b`
      )}; }, 100)`
    );
    let supersededRejected = false;
    try {
      await Promise.race([
        controller.navigate(
          supersedeTabId,
          `${url}slow-a`,
          'agent'
        ),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('SUPERSEDED_NAVIGATION_HUNG')),
            4000
          );
        })
      ]);
    } catch (error) {
      supersededRejected =
        /NAVIGATION_SUPERSEDED/.test(error.message) &&
        !/SUPERSEDED_NAVIGATION_HUNG/.test(error.message);
    }
    const supersedeStartedAt = Date.now();
    while (
      !controller.getTab(supersedeTabId).url.endsWith('/superseding-b') &&
      Date.now() - supersedeStartedAt < 3000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const supersedeApprovals = approvalRequests.slice(
      supersedeApprovalsBefore
    );
    if (
      !supersededRejected ||
      !controller.getTab(supersedeTabId).url.endsWith('/superseding-b') ||
      !supersedeApprovals.some((request) => (
        ['sensitive-navigation', 'local-network'].includes(request.kind) &&
        request.actor === 'page'
      ))
    ) {
      throw new Error('An unrelated page incorrectly satisfied an earlier navigation.');
    }

    writeStage('checking stale close approval');
    const staleCloseTabId = await controller.createTab(url, {
      activate: true,
      source: 'user'
    });
    controller.includeAgentApprovalTab(staleCloseTabId);
    await waitForFixture(controller, staleCloseTabId);
    let releaseCloseApproval;
    let closeApprovalSeen;
    const closeApprovalEntered = new Promise((resolve) => {
      closeApprovalSeen = resolve;
    });
    approvalOverride = async (request) => {
      closeApprovalSeen(request);
      return new Promise((resolve) => {
        releaseCloseApproval = resolve;
      });
    };
    const staleClosePromise =
      controller.closeTabForAgent(staleCloseTabId);
    const staleCloseApproval = await closeApprovalEntered;
    if (staleCloseApproval.kind !== 'agent-tab-close') {
      throw new Error('The stale close test intercepted the wrong approval.');
    }
    await controller.navigate(
      staleCloseTabId,
      `${url}changed-before-close`,
      'user'
    );
    await waitForFixture(controller, staleCloseTabId);
    releaseCloseApproval(true);
    let staleCloseRejected = false;
    try {
      await staleClosePromise;
    } catch (error) {
      staleCloseRejected = /TAB_CHANGED_DURING_APPROVAL/.test(error.message);
    }
    if (!staleCloseRejected || !controller.tabs.has(staleCloseTabId)) {
      throw new Error('A stale approval closed a materially changed tab.');
    }

    const report = {
      passed: true,
      controlsObserved: firstSnapshot.elements.length,
      overlappingSnapshotRejected: true,
      formInspectionSideEffectFree: true,
      ordinaryInputVerified: true,
      shadowInputVerified: true,
      checkboxVerified: true,
      coveredCheckboxRejected: true,
      framedOverlayRejected: true,
      asyncCheckboxReversionDetected: true,
      nonCheckboxRejected: true,
      radioUncheckRejected: true,
      selectVerified: true,
      changedSelectDetected: true,
      destructiveNameObserved: true,
      nestedInteractiveDescendantRejected: true,
      associatedLabelForwardingRejected: true,
      imageSubmitterRequiresFormApproval: true,
      frameAndShadowBoundaryTargetsRejected: true,
      opaqueObjectBoundaryTargetsRejected: true,
      trustedClickVerified: true,
      postPopupPreserved: true,
      emptyPostPopupPreserved: true,
      popupMethodGrantBound: true,
      requestPayloadGrantBound: true,
      substitutedDestinationReapproved: true,
      postActionQueryGrantBound: true,
      postContentTypeGrantBound: true,
      postApprovalPreparationTracked: true,
      failedDispatchGrantRevoked: true,
      partialDispatchSubstitutionReapproved: true,
      namedTargetPopupScoped: true,
      namedTargetPostPopupPreserved: true,
      baseTargetPopupScoped: true,
      crossOrigin307PostPreserved: true,
      typedAndKeyPostRedirectsPreserved: true,
      changedEffectiveSubmitterRejected: true,
      consumedGrantBoundToRequestChain: true,
      consumedPopupGrantNotReusable: true,
      scriptActivationRedirectStayedPageScoped: true,
      inputWindowTimerStayedPageScoped: true,
      inputWindowPopupStayedPageScoped: true,
      zeroDelayNavigationStayedPageScoped: true,
      zeroDelayPopupStayedPageScoped: true,
      delayedPopupStayedPageScoped: true,
      changedTargetRejected: true,
      untargetedEnterRejected: true,
      crossTabRefsUnique: true,
      localRedirectSingleApproval: true,
      differentLocalOriginReapproved: true,
      localAgentTabSingleApproval: true,
      dnsPrivateLinkSingleApproval: true,
      dnsPrivatePopupSingleApproval: true,
      restoredDnsPrivateTabProtected: true,
      unscopedDnsPrivateNavigationProtected: true,
      dnsRebindingRevalidated: true,
      agentHistoryLocalNetworkProtected: true,
      deniedRedirectRejectedPromptly: true,
      supersededNavigationRejected: true,
      staleCloseApprovalRejected: true
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    controller.endAgentApprovalRun('live-smoke');
    await controller.destroy();
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .then(() => app.quit())
  .catch((error) => {
    fs.writeFileSync(reportPath, `${JSON.stringify({
      passed: false,
      error: error.stack || error.message
    }, null, 2)}\n`, 'utf8');
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });
