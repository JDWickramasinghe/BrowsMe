'use strict';

const path = require('node:path');
const { safeStorage } = require('electron');
const {
  atomicWriteFileSync,
  readRecoverableFileSync
} = require('./atomic-store');
const {
  APPROVAL_MODE_VALUES,
  APPROVAL_MODES,
  normalizeApprovalMode
} = require('./approval-policy');
const {
  RELIABILITY_MODE_VALUES,
  RELIABILITY_MODES,
  normalizeReliabilityMode
} = require('./reliability-policy');

const DEFAULTS = Object.freeze({
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com',
  rememberApiKey: true,
  aiPanelWidth: 390,
  aiPanelOpen: true,
  approvalMode: APPROVAL_MODES.ASK,
  agentReliability: RELIABILITY_MODES.RELIABLE,
  theme: 'system',
  searchEngine: 'google',
  startupMode: 'restore',
  bookmarksBarOpen: false,
  bookmarks: [],
  readingList: []
});

const SEARCH_ENGINE_VALUES = new Set(['google', 'bing', 'duckduckgo', 'brave']);
const STARTUP_MODE_VALUES = new Set(['restore', 'newtab']);

function parseSettings(bytes) {
  const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Settings data must be an object.');
  }
  return value;
}

class SettingsStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'settings.json');
    this.runtimeApiKey = '';
    this.data = this.readFromDisk();
  }

  readFromDisk() {
    try {
      const value = readRecoverableFileSync(this.filePath, parseSettings);
      return {
        ...DEFAULTS,
        ...value,
        approvalMode: normalizeApprovalMode(value.approvalMode),
        agentReliability: normalizeReliabilityMode(value.agentReliability),
        searchEngine: SEARCH_ENGINE_VALUES.has(value.searchEngine) ? value.searchEngine : 'google',
        startupMode: STARTUP_MODE_VALUES.has(value.startupMode) ? value.startupMode : 'restore',
        bookmarksBarOpen: value.bookmarksBarOpen === true,
        bookmarks: Array.isArray(value.bookmarks) ? value.bookmarks : [],
        readingList: Array.isArray(value.readingList) ? value.readingList : []
      };
    } catch {
      return { ...DEFAULTS, bookmarks: [], readingList: [] };
    }
  }

  persist() {
    atomicWriteFileSync(this.filePath, JSON.stringify(this.data, null, 2), {
      mode: 0o600,
      validateExisting: parseSettings
    });
  }

  getApiKey() {
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }

    return this.getLocalApiKey();
  }

  getLocalApiKey() {
    if (this.runtimeApiKey) {
      return this.runtimeApiKey;
    }

    if (!this.data.apiKeyEncrypted || !safeStorage.isEncryptionAvailable()) {
      return '';
    }

    try {
      return safeStorage.decryptString(Buffer.from(this.data.apiKeyEncrypted, 'base64'));
    } catch {
      return '';
    }
  }

  getPublicSettings() {
    const apiKey = this.getApiKey();
    return {
      model: process.env.DEEPSEEK_MODEL || this.data.model,
      baseUrl: process.env.DEEPSEEK_BASE_URL || this.data.baseUrl,
      rememberApiKey: Boolean(this.data.rememberApiKey),
      apiKeyConfigured: Boolean(apiKey),
      apiKeyHint: apiKey ? `••••${apiKey.slice(-4)}` : '',
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      aiPanelWidth: this.data.aiPanelWidth,
      aiPanelOpen: this.data.aiPanelOpen,
      approvalMode: normalizeApprovalMode(this.data.approvalMode),
      agentReliability: normalizeReliabilityMode(this.data.agentReliability),
      theme: this.data.theme,
      searchEngine: this.data.searchEngine || 'google',
      startupMode: this.data.startupMode || 'restore',
      bookmarksBarOpen: this.data.bookmarksBarOpen === true,
      bookmarks: this.data.bookmarks,
      readingList: this.data.readingList || []
    };
  }

  update(input) {
    if (input.agentReliability !== undefined) {
      if (!RELIABILITY_MODE_VALUES.has(input.agentReliability)) {
        throw new Error('The task reliability mode is invalid.');
      }
      this.data.agentReliability = input.agentReliability;
    }

    if (input.approvalMode !== undefined) {
      if (!APPROVAL_MODE_VALUES.has(input.approvalMode)) {
        throw new Error('The approval mode is invalid.');
      }
      this.data.approvalMode = input.approvalMode;
    }

    if (typeof input.model === 'string') {
      const model = input.model.trim();
      if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) {
        throw new Error('The model name is invalid.');
      }
      this.data.model = model;
    }

    if (typeof input.baseUrl === 'string') {
      const parsed = new URL(input.baseUrl.trim());
      const isSecure = parsed.protocol === 'https:';
      const isLocal = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      if (!isSecure && !isLocal) {
        throw new Error('The API address must use HTTPS, except for a local endpoint.');
      }
      this.data.baseUrl = parsed.href.replace(/\/+$/, '');
    }

    if (
      typeof input.rememberApiKey === 'boolean' &&
      input.rememberApiKey !== Boolean(this.data.rememberApiKey)
    ) {
      const localApiKey = this.getLocalApiKey();
      if (input.rememberApiKey && localApiKey) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('Secure key storage is not available on this computer.');
        }
        this.data.apiKeyEncrypted = safeStorage.encryptString(localApiKey).toString('base64');
        this.runtimeApiKey = '';
      } else if (!input.rememberApiKey) {
        this.runtimeApiKey = localApiKey;
        delete this.data.apiKeyEncrypted;
      }
      this.data.rememberApiKey = input.rememberApiKey;
    }

    if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      const apiKey = input.apiKey.trim();
      if (this.data.rememberApiKey) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('Secure key storage is not available on this computer.');
        }
        this.data.apiKeyEncrypted = safeStorage.encryptString(apiKey).toString('base64');
        this.runtimeApiKey = '';
      } else {
        this.runtimeApiKey = apiKey;
        delete this.data.apiKeyEncrypted;
      }
    }

    if (input.clearApiKey === true) {
      this.runtimeApiKey = '';
      delete this.data.apiKeyEncrypted;
    }

    if (typeof input.aiPanelWidth === 'number') {
      this.data.aiPanelWidth = Math.max(300, Math.min(620, Math.round(input.aiPanelWidth)));
    }

    if (typeof input.aiPanelOpen === 'boolean') {
      this.data.aiPanelOpen = input.aiPanelOpen;
    }

    if (['light', 'dark', 'system'].includes(input.theme)) {
      this.data.theme = input.theme;
    }

    if (SEARCH_ENGINE_VALUES.has(input.searchEngine)) {
      this.data.searchEngine = input.searchEngine;
    }

    if (STARTUP_MODE_VALUES.has(input.startupMode)) {
      this.data.startupMode = input.startupMode;
    }

    if (typeof input.bookmarksBarOpen === 'boolean') {
      this.data.bookmarksBarOpen = input.bookmarksBarOpen;
    }

    this.persist();
    return this.getPublicSettings();
  }

  getSearchEngine() {
    return SEARCH_ENGINE_VALUES.has(this.data.searchEngine) ? this.data.searchEngine : 'google';
  }

  getStartupMode() {
    return STARTUP_MODE_VALUES.has(this.data.startupMode) ? this.data.startupMode : 'restore';
  }

  toggleReadingItem(item) {
    const url = String(item.url || '');
    if (!url || url.startsWith('browsme:')) {
      return this.getPublicSettings();
    }
    const index = this.data.readingList.findIndex((entry) => entry.url === url);
    if (index >= 0) {
      this.data.readingList.splice(index, 1);
    } else {
      this.data.readingList.unshift({
        url,
        title: String(item.title || url).slice(0, 200),
        createdAt: new Date().toISOString()
      });
      this.data.readingList = this.data.readingList.slice(0, 200);
    }
    this.persist();
    return this.getPublicSettings();
  }

  getApprovalMode() {
    return normalizeApprovalMode(this.data.approvalMode);
  }

  getAgentReliability() {
    return normalizeReliabilityMode(this.data.agentReliability);
  }

  toggleBookmark(bookmark) {
    const url = String(bookmark.url || '');
    if (!url || url.startsWith('browsme:')) {
      return this.getPublicSettings();
    }

    const index = this.data.bookmarks.findIndex((entry) => entry.url === url);
    if (index >= 0) {
      this.data.bookmarks.splice(index, 1);
    } else {
      this.data.bookmarks.unshift({
        url,
        title: String(bookmark.title || url).slice(0, 200),
        createdAt: new Date().toISOString()
      });
      this.data.bookmarks = this.data.bookmarks.slice(0, 100);
    }

    this.persist();
    return this.getPublicSettings();
  }

  saveBrowserSession(sessionState) {
    const tabs = Array.isArray(sessionState.tabs)
      ? sessionState.tabs
        .filter((tab) => typeof tab.url === 'string' && tab.url.length <= 4000)
        .slice(0, 30)
        .map((tab) => ({ url: tab.url, title: String(tab.title || '').slice(0, 200) }))
      : [];
    this.data.browserSession = {
      tabs,
      activeTabId: String(sessionState.activeTabId || ''),
      activeIndex: Math.max(0, Math.min(tabs.length - 1, Number(sessionState.activeIndex) || 0)),
      savedAt: new Date().toISOString()
    };
    this.persist();
  }

  getBrowserSession() {
    const stored = this.data.browserSession;
    if (!stored || !Array.isArray(stored.tabs)) {
      return { tabs: [], activeIndex: 0 };
    }
    return {
      tabs: stored.tabs
        .filter((tab) => typeof tab.url === 'string' && tab.url.length <= 4000)
        .slice(0, 30),
      activeIndex: Math.max(0, Math.min(stored.tabs.length - 1, Number(stored.activeIndex) || 0))
    };
  }
}

module.exports = { DEFAULTS, SettingsStore };
