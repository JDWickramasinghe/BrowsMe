'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');
const { BrowserController } = require('../src/main/browser-controller');

app.setPath('userData', path.join(process.cwd(), '.qa-authentication-profile'));
app.disableHardwareAcceleration();
app.enableSandbox();

async function until(predicate, label) {
  console.log(`Checking ${label}`);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${label}`);
}

async function main() {
  const watchdog = setTimeout(() => { console.error('Authentication fixture timed out.'); app.exit(1); }, 45000);
  watchdog.unref();
  await app.whenReady();
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, body, cookie: req.headers.cookie, referrer: req.headers.referer });
      res.setHeader('Content-Type', 'text/html');
      if (req.url === '/') {
        res.setHeader('Set-Cookie', 'auth_fixture=shared; SameSite=Lax');
        res.end(`<!doctype html><title>Sign-in fixture</title>
          <button id="open" onclick="window.popup=window.open('/popup','auth-window')">Sign in</button>
          <button id="blank" onclick="window.blank=window.open('about:blank','blank-auth');blank.location='/popup'">Blank sign in</button>
          <form action="/post" method="post" target="post-auth"><input name="state" value="fixture-state"><button id="post">Sign in via POST</button></form>
          <form action="/post" method="post" target="empty-auth"><button id="empty">Empty POST sign in</button></form>
          <script>window.messages=[];addEventListener('message',e=>{if(e.origin===location.origin)messages.push(e.data)})</script>`);
      } else if (req.url === '/blocked') {
        res.end('<!doctype html><title>Sign-in blocked</title><h1>Sign in</h1><p>This browser or app may not be secure.</p>');
      } else if (req.url === '/post' || req.url === '/popup') {
        res.end(`<!doctype html><title>Auth popup</title><button id="close" onclick="window.close()">Close</button>
          <script>window.hasOpener=!!window.opener;window.opener?.postMessage('popup-ready',location.origin)</script>`);
      } else {
        res.end('<!doctype html><title>Ordinary page</title><p>Ready.</p>');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const window = new BrowserWindow({ show: true, x: -10000, y: -10000, skipTaskbar: true, width: 1100, height: 800 });
  const toasts = [];
  const approvals = [];
  const controller = new BrowserController({
    window, profileSession: session.fromPartition('persist:authentication-fixture'),
    emitState() {}, emitToast: (value) => toasts.push(value), emitDownloads() {},
    requestApproval: async (value) => { approvals.push(value); return true; },
    requestPermission: async () => false
  });
  try {
    const openerId = await controller.createTab(origin);
    const opener = controller.getTab(openerId).view.webContents;
    await until(() => opener.executeJavaScript('!!document.querySelector("#open")'), 'opener loaded');
    await opener.executeJavaScript('document.querySelector("#open").click()', true);
    const popup = await until(() => [...controller.tabs.values()].find((tab) => tab.url === `${origin}/popup`), 'native popup');
    assert.equal(await popup.view.webContents.executeJavaScript('window.hasOpener'), true);
    await until(() => opener.executeJavaScript('messages.length === 1'), 'postMessage to opener');
    assert.equal(await opener.executeJavaScript('!!popup && !popup.closed'), true);
    assert.equal(requests.find((r) => r.url === '/popup').cookie, 'auth_fixture=shared');
    assert.equal(requests.find((r) => r.url === '/popup').referrer, `${origin}/`);
    const popupCount = controller.tabs.size;
    await opener.executeJavaScript("void (window.popup=window.open('/popup','auth-window'))", true);
    await until(() => opener.executeJavaScript('messages.length === 2'), 'named popup reuse');
    assert.equal(controller.tabs.size, popupCount);
    void opener.executeJavaScript('window.popup.close()', true).catch((error) => console.log('Close:', error.message));
    await until(() => !controller.tabs.has(popup.id), 'popup close removes tab');
    assert.equal(await opener.executeJavaScript('popup.closed'), true);

    await opener.executeJavaScript('document.querySelector("#blank").click()', true);
    const blank = await until(() => [...controller.tabs.values()].find((tab) => tab.id !== openerId && tab.url === `${origin}/popup`), 'blank popup navigated');
    assert.equal(await blank.view.webContents.executeJavaScript('window.hasOpener'), true);

    await opener.executeJavaScript('document.querySelector("#post").click()', true);
    const post = await until(() => [...controller.tabs.values()].find((tab) => tab.url === `${origin}/post`), 'POST popup');
    assert.equal(await post.view.webContents.executeJavaScript('window.hasOpener'), true);
    const posted = requests.find((r) => r.url === '/post');
    assert.equal(posted.method, 'POST');
    assert.equal(posted.body, 'state=fixture-state');
    assert.equal(posted.cookie, 'auth_fixture=shared');
    assert.equal(posted.referrer, `${origin}/`);
    assert.equal(post.view.webContents.session, opener.session);

    controller.beginAgentApprovalRun('auth-fixture', [openerId]);
    controller.activateTab(openerId);
    window.focus();
    opener.focus();
    await until(() => opener.executeJavaScript('document.hasFocus()'), 'trusted input focus');
    await new Promise((resolve) => setTimeout(resolve, 150));
    let snapshot = await controller.snapshot(openerId);
    const postRef = snapshot.elements.find((element) => element.name === 'Empty POST sign in')?.ref;
    assert.ok(postRef, 'agent can locate POST sign-in control');
    const result = await controller.click(openerId, postRef);
    assert.equal(result.newTabIds.length, 1, JSON.stringify(result));
    const agentPopup = controller.getTab(result.newTabIds[0]);
    assert.equal(await agentPopup.view.webContents.executeJavaScript('window.hasOpener'), true);
    assert.equal(controller.isAgentApprovalTab(agentPopup.id), true);
    assert.ok(result.sideEffects.every((outcome) => outcome.ok), JSON.stringify(result.sideEffects));
    assert.equal(requests.filter((r) => r.url === '/post').at(-1).body, '');
    assert.equal(requests.filter((r) => r.url === '/post').at(-1).method, 'POST');
    controller.endAgentApprovalRun('auth-fixture');

    await controller.navigate(openerId, `${origin}/blocked`);
    await until(() => controller.getTab(openerId).authenticationBlocked, 'provider-independent rejection');
    await controller.navigate(openerId, `${origin}/ordinary`);
    await until(() => opener.getURL().endsWith('/ordinary'), 'ordinary page');
    assert.equal(controller.getTab(openerId).authenticationBlocked, false);
    assert.equal(toasts.length, 0, JSON.stringify(toasts));
    assert.ok(approvals.some((a) => a.kind === 'local-network'));
    console.log('PASS: opener, WindowProxy, postMessage, named reuse, close, blank popup, POST, cookies, referrer, restriction detection and reset.');
  } finally {
    await controller.destroy();
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
