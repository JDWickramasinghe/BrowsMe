'use strict';

const path = require('node:path');
const { app } = require('electron');
const { CdpBrowserEngine } = require('./cdp-browser-engine');
const { findBrowsers, findBestBrowser } = require('./browser-finder');
const chromeForTesting = require('./chrome-for-testing');

const OFFSCREEN_FLAGS = [
  '--window-position=-32000,-32000',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion'
];

class ConnectedBrowser {
  constructor({ send }) {
    this.send = typeof send === 'function' ? send : () => {};
    this.engine = null;
  }

  isRunning() {
    return Boolean(this.engine && this.engine.running);
  }

  listBrowsers() {
    return findBrowsers().map((browser) => ({ id: browser.id, label: browser.label }));
  }

  _resolveBrowser(preferredBrowser) {
    const system = findBestBrowser(preferredBrowser);
    if (system) return system;
    const cft = chromeForTesting.installedBinary(app.getPath('userData'));
    if (cft) return { id: 'chrome-for-testing', label: 'Chrome for Testing', binary: cft };
    return null;
  }

  async ensureBrowser(onProgress = () => {}) {
    const existing = this._resolveBrowser();
    if (existing) {
      return { browser: existing.label, downloaded: false };
    }
    const { version } = await chromeForTesting.download({
      userDataDir: app.getPath('userData'),
      onProgress
    });
    return { browser: `Chrome for Testing ${version}`, downloaded: true };
  }

  async start({ viewport, startUrl = 'https://accounts.google.com', preferredBrowser } = {}) {
    if (this.engine) {
      await this.stop();
    }
    const chosen = this._resolveBrowser(preferredBrowser);
    if (!chosen) {
      return { running: false, needsBrowser: true };
    }
    const userDataDir = path.join(app.getPath('userData'), 'connected-chrome-profile');
    const engine = new CdpBrowserEngine({
      userDataDir,
      explicitBrowser: chosen,
      headless: false,
      extraFlags: OFFSCREEN_FLAGS
    });
    this.engine = engine;

    engine.on('frame', (frame) => this.send('connected:frame', frame));
    engine.on('url-changed', (url) => this.send('connected:state', { running: true, url }));
    engine.on('exit', () => {
      this.engine = null;
      this.send('connected:state', { running: false });
    });

    const scale = (viewport && viewport.deviceScaleFactor) || 1;
    const { browser, version } = await engine.start({ startUrl, viewport });
    await engine.startScreencast({
      format: 'jpeg',
      quality: 60,
      everyNthFrame: 1,
      maxWidth: viewport ? Math.round(viewport.width * scale) : 1920,
      maxHeight: viewport ? Math.round(viewport.height * scale) : 1080
    });

    this.send('connected:state', {
      running: true,
      browser: browser.label,
      version: version.Browser,
      url: engine.lastUrl
    });
    return { running: true, browser: browser.label };
  }

  async stop() {
    const engine = this.engine;
    this.engine = null;
    if (engine) {
      await engine.stop();
    }
    this.send('connected:state', { running: false });
    return { running: false };
  }

  async navigate(url) {
    if (this.engine) await this.engine.navigate(url);
  }

  _requireEngine() {
    if (!this.engine || !this.engine.running) {
      throw new Error('CONNECTED_BROWSER_NOT_RUNNING');
    }
    return this.engine;
  }

  async status() {
    return { running: this.isRunning(), url: this.engine ? this.engine.lastUrl : '' };
  }

  async snapshot() {
    return this._requireEngine().snapshot();
  }

  async clickRef(ref) {
    return this._requireEngine().clickRef(ref);
  }

  async typeRef(ref, text, options) {
    return this._requireEngine().typeRef(ref, text, options);
  }

  async pressKey(key) {
    return this._requireEngine().pressKey(key);
  }

  async input(payload = {}) {
    if (!this.engine) return;
    const { kind } = payload;
    if (kind === 'mouse') {
      await this.engine.dispatchMouse(payload.event || {});
    } else if (kind === 'key') {
      await this.engine.dispatchKey(payload.event || {});
    } else if (kind === 'text') {
      await this.engine.insertText(String(payload.text || ''));
    }
  }

  async resize({ width, height, deviceScaleFactor = 1 } = {}) {
    if (!this.engine || !width || !height) return;
    await this.engine.setViewport({ width, height, deviceScaleFactor });
  }
}

module.exports = { ConnectedBrowser };
