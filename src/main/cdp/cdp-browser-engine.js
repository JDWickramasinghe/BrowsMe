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
  constructor({ userDataDir, preferredBrowser, headless = false, extraFlags = [] } = {}) {
    super();
    this.userDataDir = userDataDir;
    this.preferredBrowser = preferredBrowser;
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

    const chosen = findBestBrowser(this.preferredBrowser);
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
