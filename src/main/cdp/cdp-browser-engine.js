'use strict';

// CdpBrowserEngine — owns a single CDP-driven Chromium page and exposes the
// operations BrowsMe needs: launch with a persistent dedicated profile, stream the
// page as screencast frames, forward mouse/keyboard input, navigate, and tear down.
//
// It emits:
//   'ready'       ({ browser, version })  after launch + CDP attach
//   'frame'       ({ data, metadata })    a base64 JPEG screencast frame
//   'url-changed' (url)                   top-frame navigation
//   'exit'                                browser process or CDP socket gone
//   'stopped'                             after stop() completes

const { EventEmitter } = require('node:events');
const { findBestBrowser } = require('./browser-finder');
const { launchBrowser, listTargets } = require('./chrome-launcher');
const { CdpClient } = require('./cdp-client');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpBrowserEngine extends EventEmitter {
  constructor({ userDataDir, preferredBrowser, explicitBrowser, headless = false, extraFlags = [] } = {}) {
    super();
    this.userDataDir = userDataDir;
    this.preferredBrowser = preferredBrowser;
    this.explicitBrowser = explicitBrowser || null;
    this.headless = headless;
    this.extraFlags = Array.isArray(extraFlags) ? extraFlags : [];
    this.browser = null;
    this.version = null;
    this.child = null;
    this.port = 0;
    this.client = null;
    this.screencasting = false;
    this.running = false;
    this.lastUrl = '';
  }

  async start({ startUrl = 'about:blank', viewport } = {}) {
    if (this.running) return { browser: this.browser, version: this.version };

    const chosen = this.explicitBrowser || findBestBrowser(this.preferredBrowser);
    if (!chosen) throw new Error('NO_CHROMIUM_BROWSER');
    this.browser = chosen;

    const { child, port, version } = await launchBrowser({
      binary: chosen.binary,
      userDataDir: this.userDataDir,
      startUrl,
      headless: this.headless,
      windowSize: viewport ? `${Math.round(viewport.width)},${Math.round(viewport.height)}` : '1280,800',
      extraFlags: this.extraFlags
    });
    this.child = child;
    this.port = port;
    this.version = version;
    child.on('exit', () => {
      if (this.running) {
        this.running = false;
        this.emit('exit');
      }
    });

    let pageTarget;
    for (let attempt = 0; attempt < 60 && !pageTarget; attempt += 1) {
      const targets = await listTargets(port).catch(() => []);
      pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (!pageTarget) await delay(150);
    }
    if (!pageTarget) throw new Error('NO_PAGE_TARGET');
    this.lastUrl = pageTarget.url || '';

    this.client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await this.client.connect();
    this.client.on('disconnected', () => {
      if (this.running) {
        this.running = false;
        this.emit('exit');
      }
    });

    await this.client.send('Page.enable');
    await this.client.send('Runtime.enable');

    this.client.on('Page.frameNavigated', (params) => {
      if (params.frame && !params.frame.parentId) {
        this.lastUrl = params.frame.url;
        this.emit('url-changed', this.lastUrl);
      }
    });
    this.client.on('Page.screencastFrame', async (params) => {
      this.emit('frame', { data: params.data, metadata: params.metadata });
      try {
        await this.client.send('Page.screencastFrameAck', { sessionId: params.sessionId });
      } catch {
        // socket may have closed between frame and ack
      }
    });

    if (viewport) {
      await this.setViewport(viewport).catch(() => {});
    }

    this.running = true;
    this.emit('ready', { browser: chosen, version });
    return { browser: chosen, version };
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
    if (!this.client) return;
    await this.client
      .send('Emulation.setDeviceMetricsOverride', {
        width: Math.round(width),
        height: Math.round(height),
        deviceScaleFactor,
        mobile
      })
      .catch(() => {});
  }

  async startScreencast({ format = 'jpeg', quality = 60, maxWidth = 1920, maxHeight = 1080, everyNthFrame = 1 } = {}) {
    if (!this.client || this.screencasting) return;
    await this.client.send('Page.startScreencast', { format, quality, maxWidth, maxHeight, everyNthFrame });
    this.screencasting = true;
  }

  async stopScreencast() {
    if (!this.client || !this.screencasting) return;
    await this.client.send('Page.stopScreencast').catch(() => {});
    this.screencasting = false;
  }

  async navigate(url) {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    await this.client.send('Page.navigate', { url });
  }

  // event: { type, x, y, button, clickCount, deltaX, deltaY, modifiers }
  async dispatchMouse(event) {
    if (!this.client) return;
    await this.client.send('Input.dispatchMouseEvent', event).catch(() => {});
  }

  // event: { type, key, code, windowsVirtualKeyCode, text, modifiers }
  async dispatchKey(event) {
    if (!this.client) return;
    await this.client.send('Input.dispatchKeyEvent', event).catch(() => {});
  }

  async insertText(text) {
    if (!this.client) return;
    await this.client.send('Input.insertText', { text }).catch(() => {});
  }

  async evaluate(expression, returnByValue = true) {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    const result = await this.client.send('Runtime.evaluate', { expression, returnByValue, awaitPromise: true });
    if (result && result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'EVAL_FAILED');
    }
    return result && result.result ? result.result.value : undefined;
  }

  // --- Agent-facing automation over the connected page ---

  // Tags visible interactive controls with data-browsme-ref and returns them plus
  // the page's visible text. Content is untrusted data, never instructions.
  async snapshot() {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    return this.evaluate(`(() => {
      const selector = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[contenteditable="true"],[tabindex]';
      const nodes = Array.from(document.querySelectorAll(selector));
      const elements = [];
      let ref = 0;
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1 || el.offsetParent === null) continue;
        ref += 1;
        el.setAttribute('data-browsme-ref', String(ref));
        const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.innerText || '').trim() || el.value || el.name || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 140);
        elements.push({ ref: String(ref), role: el.getAttribute('role') || el.tagName.toLowerCase(), name: label, value: String(el.value || '').slice(0, 140) });
        if (ref >= 200) break;
      }
      const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 6000);
      return { url: location.href, title: document.title, elements, text };
    })()`);
  }

  async clickRef(ref) {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    const index = parseInt(ref, 10);
    if (!Number.isFinite(index)) throw new Error('INVALID_REF');
    const point = await this.evaluate(`(() => {
      const el = document.querySelector('[data-browsme-ref="${index}"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), ok: r.width > 0 && r.height > 0 };
    })()`);
    if (!point || !point.ok) throw new Error('REF_NOT_FOUND');
    await this.dispatchMouse({ type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
    await this.dispatchMouse({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await this.dispatchMouse({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    return { ok: true, x: point.x, y: point.y };
  }

  async typeRef(ref, text, { clear = true } = {}) {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    const index = parseInt(ref, 10);
    if (!Number.isFinite(index)) throw new Error('INVALID_REF');
    const focused = await this.evaluate(`(() => {
      const el = document.querySelector('[data-browsme-ref="${index}"]');
      if (!el) return false;
      el.focus();
      if (${clear ? 'true' : 'false'} && typeof el.select === 'function') el.select();
      return document.activeElement === el;
    })()`);
    if (!focused) throw new Error('REF_NOT_FOUND');
    await this.insertText(String(text));
    return { ok: true };
  }

  async pressKey(keyName) {
    if (!this.client) throw new Error('ENGINE_NOT_RUNNING');
    const named = {
      Enter: 13, Tab: 9, Backspace: 8, Delete: 46, Escape: 27,
      ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
      Home: 36, End: 35, PageUp: 33, PageDown: 34
    };
    const key = String(keyName);
    const code = named[key] || 0;
    const base = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await this.dispatchKey({ type: 'keyDown', ...base, text: key === 'Enter' ? '\r' : undefined });
    await this.dispatchKey({ type: 'keyUp', ...base });
    return { ok: true };
  }

  async stop() {
    this.running = false;
    try {
      await this.stopScreencast();
    } catch {
      // ignore
    }
    try {
      if (this.client) this.client.close();
    } catch {
      // ignore
    }
    try {
      if (this.child) this.child.kill();
    } catch {
      // ignore
    }
    this.client = null;
    this.child = null;
    this.emit('stopped');
  }
}

module.exports = { CdpBrowserEngine };
