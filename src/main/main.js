'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  session
} = require('electron');
const { AgentService } = require('./agent-service');
const { getApprovalDisposition } = require('./approval-policy');
const {
  buildAcceptLanguages,
  buildCompatibleUserAgent
} = require('./browser-compat');
const { BrowserController, PROFILE_PARTITION } = require('./browser-controller');
const { MemoryStore } = require('./memory-store');
const { SettingsStore } = require('./settings-store');
const { HistoryStore } = require('./history-store');
const { searchUrlForEngine } = require('./url-utils');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'browsme',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false
    }
  }
]);

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.enableSandbox();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

let mainWindow = null;
let browser = null;
let agent = null;
let settings = null;
let memory = null;
let history = null;
let shuttingDown = false;
let restoringSession = false;
let sessionSaveTimer = null;
let ipcInstalled = false;
let globalListenersInstalled = false;
const pendingApprovals = new Map();
const pendingPermissions = new Map();
const pendingAuthentications = new Map();

function securityHeaders(hostname) {
  const appPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'none'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'"
  ].join('; ');

  const newTabPolicy = [
    "default-src 'self'",
    "script-src 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action https://www.google.com"
  ].join('; ');

  return {
    'Content-Security-Policy': hostname === 'app' ? appPolicy : newTabPolicy,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff'
  };
}

async function localProtocolHandler(request) {
  try {
    const url = new URL(request.url);
    const roots = {
      app: path.join(__dirname, '..', 'renderer'),
      newtab: path.join(__dirname, '..', 'newtab')
    };
    const root = roots[url.hostname];
    if (!root) {
      return new Response('Not found', { status: 404 });
    }

    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const absolutePath = path.resolve(root, `.${requestedPath}`);
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await fs.promises.readFile(absolutePath);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': MIME_TYPES[path.extname(absolutePath).toLowerCase()] || 'application/octet-stream',
        ...securityHeaders(url.hostname)
      }
    });
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 500;
    return new Response(status === 404 ? 'Not found' : 'Internal browser error', { status });
  }
}

async function registerLocalProtocol(targetSession) {
  if (!targetSession.protocol.isProtocolHandled('browsme')) {
    await targetSession.protocol.handle('browsme', localProtocolHandler);
  }
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function applyThemeSource(theme) {

  nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
}

function emitBrowserState(state = browser?.getState()) {
  if (!state || !settings) {
    return;
  }
  send('browser:state', {
    ...state,
    settings: settings.getPublicSettings(),
    memory: memory?.getStatus() || null,
    windowMaximized: mainWindow?.isMaximized() || false
  });
  scheduleBrowserSessionSave(state);
}

function persistBrowserSession(state = browser?.getState()) {
  if (!state || !settings || restoringSession) {
    return;
  }
  const activeIndex = Math.max(0, state.tabs.findIndex((tab) => tab.id === state.activeTabId));
  settings.saveBrowserSession({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeIndex
  });
}

function scheduleBrowserSessionSave(state) {
  if (restoringSession || shuttingDown) {
    return;
  }
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => persistBrowserSession(state), 700);
  sessionSaveTimer.unref?.();
}

function validateTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted IPC sender.');
  }
  const senderUrl = event.senderFrame?.url || '';
  if (!senderUrl.startsWith('browsme://app/')) {
    throw new Error('Untrusted IPC origin.');
  }
}

function trustedHandle(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    validateTrustedSender(event);
    return handler(payload || {}, event);
  });
}

function createDecisionRequest(map, channel, payload, timeoutMs) {
  if (map.size >= 8) {
    send('ui:toast', {
      tone: 'warning',
      message: 'Too many browser decisions are already waiting.'
    });
    return Promise.resolve(false);
  }

  const id = require('node:crypto').randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      map.delete(id);
      resolve(false);
      send('ui:command', { command: 'cancel-decision', id });
      send('ui:toast', {
        tone: 'warning',
        message: 'The browser request expired without a decision.'
      });
    }, timeoutMs);

    map.set(id, {
      resolve: (allowed) => {
        clearTimeout(timeout);
        resolve(Boolean(allowed));
      }
    });
    send(channel, { id, ...payload });
  });
}

function requestApproval(payload) {
  const disposition = getApprovalDisposition(
    settings?.getApprovalMode(),
    payload
  );
  if (disposition.action === 'allow') {
    return Promise.resolve(true);
  }
  return createDecisionRequest(pendingApprovals, 'approval:request', payload, 120000);
}

function requestPermission(payload) {
  return createDecisionRequest(pendingPermissions, 'permission:request', payload, 45000);
}

function requestAuthentication(payload) {

  return createDecisionRequest(pendingAuthentications, 'authentication:request', payload, 300000);
}

function stopAgentAndPendingActions() {
  const stopped = agent?.stop() || false;
  const hadPendingActions = pendingApprovals.size > 0 || pendingAuthentications.size > 0;
  for (const pending of pendingApprovals.values()) {
    pending.resolve(false);
  }
  pendingApprovals.clear();
  for (const pending of pendingAuthentications.values()) {
    pending.resolve(false);
  }
  pendingAuthentications.clear();
  if (stopped || hadPendingActions) {
    send('ui:command', { command: 'cancel-agent-decisions' });
  }
  return stopped || hadPendingActions;
}

function installGlobalListeners() {
  if (globalListenersInstalled) {
    return;
  }
  globalListenersInstalled = true;
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', handleShortcut);
  });
}

function installIpcHandlers() {
  trustedHandle('browser:get-initial-state', () => ({
    browser: browser.getState(),
    settings: settings.getPublicSettings(),
    downloads: browser.getDownloadsState(),
    memory: memory.getStatus(),
    chats: memory.listSessions(),
    activeChatMessages: memory.getSessionMessages(),
    platform: process.platform,
    windowMaximized: mainWindow.isMaximized()
  }));

  ipcMain.on('browser:set-viewport-bounds', (event, bounds) => {
    validateTrustedSender(event);
    if (!bounds || typeof bounds !== 'object') {
      return;
    }
    const content = mainWindow.getContentBounds();
    browser.setViewportBounds({
      x: Math.min(content.width - 1, Math.max(0, Number(bounds.x) || 0)),
      y: Math.min(content.height - 1, Math.max(0, Number(bounds.y) || 0)),
      width: Math.min(content.width, Math.max(1, Number(bounds.width) || 1)),
      height: Math.min(content.height, Math.max(1, Number(bounds.height) || 1))
    });
  });

  trustedHandle('browser:navigate', ({ tabId, url }) => {
    if (typeof url !== 'string' || url.length > 4000) {
      throw new Error('The address is invalid.');
    }
    return browser.navigate(tabId || browser.activeTabId, url, 'user');
  });

  trustedHandle('browser:navigation-action', ({ tabId, action }) => {
    browser.navigationAction(tabId || browser.activeTabId, String(action || ''));
    return true;
  });

  trustedHandle('tabs:new', ({ url, background }) => {
    return browser.createTab(typeof url === 'string' ? url : undefined, {
      activate: background !== true,
      source: 'user'
    });
  });

  trustedHandle('tabs:activate', ({ tabId }) => {
    browser.activateTab(String(tabId || ''));
    return true;
  });

  trustedHandle('tabs:close', ({ tabId }) => {
    browser.closeTab(String(tabId || ''));
    return true;
  });

  trustedHandle('tabs:reopen', () => browser.reopenTab());

  trustedHandle('tabs:duplicate', ({ tabId }) =>
    browser.duplicateTab(tabId || browser.activeTabId)
  );

  trustedHandle('tabs:mute', ({ tabId }) =>
    browser.toggleMuteTab(tabId || browser.activeTabId)
  );

  trustedHandle('tabs:close-others', ({ tabId }) => {
    browser.closeOtherTabs(tabId || browser.activeTabId);
    return true;
  });

  trustedHandle('page:find', ({ text, forward, findNext }) =>
    browser.findInPage(browser.activeTabId, text, {
      forward: forward !== false,
      findNext: findNext === true
    })
  );

  trustedHandle('page:find-stop', ({ keepSelection } = {}) =>
    browser.stopFind(browser.activeTabId, keepSelection === true)
  );

  trustedHandle('page:zoom', ({ mode }) =>
    browser.setZoom(browser.activeTabId, String(mode || 'reset'))
  );

  trustedHandle('page:print', () => browser.printTab(browser.activeTabId));

  trustedHandle('bookmarks:toggle-active', () => {
    const tab = browser.getTab();
    const result = settings.toggleBookmark({ url: tab.url, title: tab.title });
    emitBrowserState();
    return result;
  });

  trustedHandle('bookmarks:toggle', ({ url, title }) => {
    const result = settings.toggleBookmark({ url: String(url || ''), title: String(title || '') });
    emitBrowserState();
    return result;
  });

  trustedHandle('readinglist:toggle-active', () => {
    const tab = browser.getTab();
    const result = settings.toggleReadingItem({ url: tab.url, title: tab.title });
    emitBrowserState();
    return result;
  });

  trustedHandle('readinglist:toggle', ({ url, title }) => {
    const result = settings.toggleReadingItem({ url: String(url || ''), title: String(title || '') });
    emitBrowserState();
    return result;
  });

  trustedHandle('history:list', ({ query, limit } = {}) =>
    history.list({ query, limit })
  );

  trustedHandle('history:remove', ({ url }) => {
    history.remove(String(url || ''));
    return history.getStatus();
  });

  trustedHandle('history:clear', () => {
    history.clear();
    return history.getStatus();
  });

  trustedHandle('data:clear', async (input = {}) => {
    await browser.clearBrowsingData({
      cookies: input.cookies !== false,
      cache: input.cache !== false
    });
    if (input.history !== false) {
      history.clear();
    }
    emitBrowserState();
    return true;
  });

  trustedHandle('settings:save', (input) => {
    const previousApprovalMode = settings.getApprovalMode();
    const previousReliability = settings.getAgentReliability();
    const result = settings.update(input);
    if (
      result.approvalMode !== previousApprovalMode ||
      result.agentReliability !== previousReliability
    ) {
      stopAgentAndPendingActions();
    }
    applyThemeSource(result.theme);
    emitBrowserState();
    return result;
  });

  trustedHandle('agent:run', (input) => {
    return agent.run({
      prompt: input.prompt,
      scope: input.scope
    });
  });

  trustedHandle('agent:stop', () => stopAgentAndPendingActions());
  trustedHandle('agent:clear', () => {
    agent.clear();
    emitBrowserState();
    return true;
  });

  trustedHandle('chat:list', () => memory.listSessions());

  trustedHandle('chat:messages', ({ id } = {}) =>
    memory.getSessionMessages(id ? String(id) : undefined)
  );

  trustedHandle('chat:new', () => {
    stopAgentAndPendingActions();
    const session = memory.createSession();
    agent.reloadActiveSession();
    emitBrowserState();
    return { session, sessions: memory.listSessions(), messages: [] };
  });

  trustedHandle('chat:switch', ({ id }) => {
    stopAgentAndPendingActions();
    memory.switchSession(String(id || ''));
    agent.reloadActiveSession();
    emitBrowserState();
    return {
      activeId: memory.getActiveSessionId(),
      sessions: memory.listSessions(),
      messages: memory.getSessionMessages()
    };
  });

  trustedHandle('chat:rename', ({ id, title }) => {
    memory.renameSession(String(id || ''), String(title || ''));
    emitBrowserState();
    return memory.listSessions();
  });

  trustedHandle('chat:delete', ({ id }) => {
    stopAgentAndPendingActions();
    memory.deleteSession(String(id || ''));
    agent.reloadActiveSession();
    emitBrowserState();
    return {
      activeId: memory.getActiveSessionId(),
      sessions: memory.listSessions(),
      messages: memory.getSessionMessages()
    };
  });

  trustedHandle('chat:export', ({ id } = {}) =>
    memory.exportSession(id ? String(id) : undefined)
  );

  trustedHandle('approval:resolve', ({ id, allow }) => {
    const pending = pendingApprovals.get(String(id || ''));
    if (!pending) {
      return false;
    }
    pendingApprovals.delete(String(id));
    pending.resolve(Boolean(allow));
    return true;
  });

  trustedHandle('permission:resolve', ({ id, allow }) => {
    const pending = pendingPermissions.get(String(id || ''));
    if (!pending) {
      return false;
    }
    pendingPermissions.delete(String(id));
    pending.resolve(Boolean(allow));
    return true;
  });

  trustedHandle('authentication:resolve', ({ id, allow }) => {
    const pending = pendingAuthentications.get(String(id || ''));
    if (!pending) {
      return false;
    }
    pendingAuthentications.delete(String(id));
    pending.resolve(Boolean(allow));
    return true;
  });

  trustedHandle('window:open-external', async ({ url, tabId }) => {
    const target = tabId
      ? browser.getSystemBrowserAuthenticationUrl(String(tabId))
      : String(url || '');

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('That address is invalid.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('Only https addresses can be opened in your system browser.');
    }
    await require('electron').shell.openExternal(parsed.href);
    return true;
  });

  trustedHandle('clipboard:write', ({ text }) => {
    require('electron').clipboard.writeText(String(text || ''));
    return true;
  });

  trustedHandle('download:decide', ({ downloadId, allow }) => {
    return browser.decideDownload(String(downloadId || ''), Boolean(allow));
  });

  trustedHandle('download:reveal', ({ downloadId }) => {
    browser.revealDownload(String(downloadId || ''));
    return true;
  });

  trustedHandle('window:action', ({ action }) => {
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        emitBrowserState();
        break;
      case 'close':
        mainWindow.close();
        break;
      case 'fullscreen':
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        break;
      default:
        throw new Error('Unknown window action.');
    }
    return true;
  });

  trustedHandle('browser:show-page-menu', () => {
    browser.showContextMenu(browser.activeTabId, {});
    return true;
  });
}

function zoomActiveTab(mode) {
  try {
    browser.setZoom(browser.activeTabId, mode);
  } catch {

  }
}

function cycleTab(direction) {
  try {
    const state = browser.getState();
    const ids = state.tabs.map((tab) => tab.id);
    if (ids.length < 2) {
      return;
    }
    const current = Math.max(0, ids.indexOf(state.activeTabId));
    const next = (current + direction + ids.length) % ids.length;
    browser.activateTab(ids[next]);
  } catch {

  }
}

function activateTabByOrdinal(ordinal) {
  try {
    const ids = browser.getState().tabs.map((tab) => tab.id);
    if (!ids.length) {
      return;
    }
    const index = ordinal >= 9 ? ids.length - 1 : Math.min(ordinal - 1, ids.length - 1);
    browser.activateTab(ids[index]);
  } catch {

  }
}

function handleShortcut(event, input) {
  if (input.type !== 'keyDown' || !browser) {
    return;
  }

  const accelerator = input.control || input.meta;
  const key = String(input.key || '').toLowerCase();
  if (accelerator && key === 't' && !input.shift) {
    event.preventDefault();
    void browser.createTab();
  } else if (accelerator && key === 'w' && !input.shift) {
    event.preventDefault();
    browser.closeTab(browser.activeTabId);
  } else if (accelerator && key === 'l') {
    event.preventDefault();
    send('ui:command', { command: 'focus-address' });
  } else if (accelerator && input.shift && key === 't') {
    event.preventDefault();
    void browser.reopenTab();
  } else if (accelerator && key === 'r') {
    event.preventDefault();
    browser.navigationAction(browser.activeTabId, 'reload');
  } else if (accelerator && key === 'j') {
    event.preventDefault();
    send('ui:command', { command: 'show-downloads' });
  } else if (accelerator && input.shift && key === 'a') {
    event.preventDefault();
    send('ui:command', { command: 'toggle-ai' });
  } else if (accelerator && key === 'f') {
    event.preventDefault();
    send('ui:command', { command: 'open-find' });
  } else if (accelerator && key === 'p') {
    event.preventDefault();
    try {
      browser.printTab(browser.activeTabId);
    } catch {

    }
  } else if (accelerator && (key === '=' || key === '+' || key === 'add')) {
    event.preventDefault();
    zoomActiveTab('in');
  } else if (accelerator && (key === '-' || key === 'subtract')) {
    event.preventDefault();
    zoomActiveTab('out');
  } else if (accelerator && key === '0') {
    event.preventDefault();
    zoomActiveTab('reset');
  } else if (key === 'f11') {
    event.preventDefault();
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  } else if (accelerator && key === 'h' && !input.shift) {
    event.preventDefault();
    send('ui:command', { command: 'open-history' });
  } else if (accelerator && key === 'd' && !input.shift) {
    event.preventDefault();
    send('ui:command', { command: 'bookmark-active' });
  } else if (accelerator && input.shift && key === 'b') {
    event.preventDefault();
    send('ui:command', { command: 'toggle-bookmarks-bar' });
  } else if (accelerator && input.shift && key === 'o') {
    event.preventDefault();
    send('ui:command', { command: 'new-chat' });
  } else if (accelerator && key === 'tab') {
    event.preventDefault();
    cycleTab(input.shift ? -1 : 1);
  } else if (accelerator && !input.shift && /^[1-9]$/.test(key)) {
    event.preventDefault();
    activateTabByOrdinal(Number(key));
  } else if (input.alt && key === 'arrowleft') {
    event.preventDefault();
    browser.navigationAction(browser.activeTabId, 'back');
  } else if (input.alt && key === 'arrowright') {
    event.preventDefault();
    browser.navigationAction(browser.activeTabId, 'forward');
  } else if (key === 'escape' && agent?.activeRun) {
    event.preventDefault();
    stopAgentAndPendingActions();
  }
}

async function createWindow() {
  settings = new SettingsStore(app.getPath('userData'));
  memory = new MemoryStore(app.getPath('userData'));
  history = new HistoryStore(app.getPath('userData'));
  applyThemeSource(settings.getPublicSettings().theme);
  const profileSession = session.fromPartition(PROFILE_PARTITION, { cache: true });
  const compatibleUserAgent = buildCompatibleUserAgent(profileSession.getUserAgent());
  profileSession.setUserAgent(
    compatibleUserAgent,
    buildAcceptLanguages(app.getLocale())
  );
  await Promise.all([
    registerLocalProtocol(session.defaultSession),
    registerLocalProtocol(profileSession)
  ]);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#eef1f6',
    title: 'BrowsMe',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged
    }
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== 'browsme://app/index.html') {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  browser = new BrowserController({
    window: mainWindow,
    profileSession,
    emitState: emitBrowserState,
    emitToast: (payload) => send('ui:toast', payload),
    requestApproval,
    requestPermission,
    requestAuthentication,
    emitDownloads: (payload) => send('downloads:state', payload),
    emitFind: (payload) => send('page:find-result', payload),
    getSearchUrl: () => searchUrlForEngine(settings.getSearchEngine()),
    emitVisit: (visit) => {
      if (!restoringSession) {
        history.record(visit);
      }
    }
  });
  agent = new AgentService({
    browser,
    settings,
    memory,
    history,
    emit: (payload) => send('agent:event', payload)
  });

  if (!ipcInstalled) {
    installIpcHandlers();
    ipcInstalled = true;
  }

  mainWindow.on('maximize', () => emitBrowserState());
  mainWindow.on('unmaximize', () => emitBrowserState());
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
  mainWindow.on('close', () => {
    persistBrowserSession();
    stopAgentAndPendingActions();
    for (const pending of pendingPermissions.values()) {
      pending.resolve(false);
    }
    pendingPermissions.clear();
  });
  mainWindow.on('closed', () => {
    const closedBrowser = browser;
    mainWindow = null;
    browser = null;
    agent = null;
    void closedBrowser?.destroy();
  });

  await mainWindow.loadURL('browsme://app/index.html');
  restoringSession = true;
  const restored = settings.getStartupMode() === 'newtab'
    ? { tabs: [], activeIndex: 0 }
    : settings.getBrowserSession();
  const restoredIds = [];
  let restoredActiveId = null;
  for (const [index, entry] of restored.tabs.entries()) {
    try {
      const isSelected = index === restored.activeIndex;
      const id = await browser.createTab(entry.url, {
        activate: false,
        source: 'restore',
        deferLoad: !isSelected,
        title: entry.title
      });
      restoredIds.push(id);
      if (isSelected) {
        restoredActiveId = id;
      }
    } catch {

    }
  }
  if (restoredIds.length) {
    browser.activateTab(restoredActiveId || restoredIds[0]);
  } else {
    await browser.createTab();
  }
  restoringSession = false;
  persistBrowserSession();
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }
  Menu.setApplicationMenu(null);
  installGlobalListeners();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on('before-quit', async () => {
  shuttingDown = true;
  clearTimeout(sessionSaveTimer);
  persistBrowserSession();
  stopAgentAndPendingActions();
  for (const pending of pendingApprovals.values()) {
    pending.resolve(false);
  }
  for (const pending of pendingPermissions.values()) {
    pending.resolve(false);
  }
  pendingApprovals.clear();
  pendingPermissions.clear();
  await browser?.destroy();
});

app.on('window-all-closed', () => {
  if (!shuttingDown && process.platform !== 'darwin') {
    app.quit();
  }
});
