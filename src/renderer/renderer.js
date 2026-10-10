'use strict';

const ui = {
  app: document.getElementById('app'),
  workspace: document.getElementById('workspace'),
  tabs: document.getElementById('tabs'),
  newTab: document.getElementById('new-tab'),
  back: document.getElementById('back'),
  forward: document.getElementById('forward'),
  reload: document.getElementById('reload'),
  home: document.getElementById('home'),
  omnibox: document.getElementById('omnibox'),
  address: document.getElementById('address'),
  security: document.getElementById('security-indicator'),
  bookmark: document.getElementById('bookmark'),
  loadProgress: document.getElementById('load-progress'),
  pageViewport: document.getElementById('page-viewport'),
  splitter: document.getElementById('panel-splitter'),
  aiPanel: document.getElementById('ai-panel'),
  aiToggle: document.getElementById('ai-toggle'),
  toolbarStopAgent: document.getElementById('toolbar-stop-agent'),
  collapseAi: document.getElementById('collapse-ai'),
  terminalLog: document.getElementById('terminal-log'),
  controlBanner: document.getElementById('control-banner'),
  controlBannerLabel: document.getElementById('control-banner-label'),
  stopAgentTop: document.getElementById('stop-agent-top'),
  agentInput: document.getElementById('agent-input'),
  agentScope: document.getElementById('agent-scope'),
  sendAgent: document.getElementById('send-agent'),
  agentStateLabel: document.getElementById('agent-state-label'),
  aiStatusDot: document.getElementById('ai-status-dot'),
  connectionLabel: document.getElementById('connection-label'),
  modelLabel: document.getElementById('model-label'),
  approvalModeChip: document.getElementById('approval-mode-chip'),
  clearAgent: document.getElementById('clear-agent'),
  suggestions: document.getElementById('suggestions'),
  downloadsButton: document.getElementById('downloads-button'),
  downloadBadge: document.getElementById('download-badge'),
  downloadsPopover: document.getElementById('downloads-popover'),
  downloadsList: document.getElementById('downloads-list'),
  settingsButton: document.getElementById('settings-button'),
  settingsOverlay: document.getElementById('settings-overlay'),
  closeSettings: document.getElementById('close-settings'),
  cancelSettings: document.getElementById('cancel-settings'),
  saveSettings: document.getElementById('save-settings'),
  apiKey: document.getElementById('api-key'),
  toggleKey: document.getElementById('toggle-key'),
  clearKey: document.getElementById('clear-key'),
  rememberKey: document.getElementById('remember-key'),
  apiKeyStatus: document.getElementById('api-key-status'),
  modelInput: document.getElementById('model-input'),
  baseUrlInput: document.getElementById('base-url-input'),
  agentReliability: document.getElementById('agent-reliability'),
  approvalModeInputs: Array.from(document.querySelectorAll('input[name="approval-mode"]')),
  settingsError: document.getElementById('settings-error'),
  decisionOverlay: document.getElementById('decision-overlay'),
  decisionEyebrow: document.getElementById('decision-eyebrow'),
  decisionTitle: document.getElementById('decision-title'),
  decisionDescription: document.getElementById('decision-description'),
  decisionOrigin: document.getElementById('decision-origin'),
  denyDecision: document.getElementById('deny-decision'),
  allowDecision: document.getElementById('allow-decision'),
  toastRegion: document.getElementById('toast-region'),
  maximizeButton: document.getElementById('maximize-button'),
  zoomReset: document.getElementById('zoom-reset'),
  findBar: document.getElementById('find-bar'),
  findInput: document.getElementById('find-input'),
  findCount: document.getElementById('find-count'),
  findPrev: document.getElementById('find-prev'),
  findNext: document.getElementById('find-next'),
  findClose: document.getElementById('find-close'),
  themeToggle: document.getElementById('theme-toggle'),
  menuButton: document.getElementById('menu-button'),
  bookmarksBar: document.getElementById('bookmarks-bar'),
  readingPopover: document.getElementById('reading-popover'),
  readingList: document.getElementById('reading-list'),
  readingAdd: document.getElementById('reading-add'),
  historyOverlay: document.getElementById('history-overlay'),
  closeHistory: document.getElementById('close-history'),
  historySearch: document.getElementById('history-search'),
  historyClear: document.getElementById('history-clear'),
  historyListEl: document.getElementById('history-list'),
  themeInput: document.getElementById('theme-input'),
  searchEngineInput: document.getElementById('search-engine-input'),
  startupInput: document.getElementById('startup-input'),
  clearData: document.getElementById('clear-data')
};

const state = {
  browser: {
    tabs: [],
    activeTabId: null
  },
  settings: {
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com',
    aiPanelWidth: 390,
    aiPanelOpen: true,
    approvalMode: 'ask',
    agentReliability: 'reliable',
    theme: 'system',
    searchEngine: 'google',
    startupMode: 'restore',
    bookmarksBarOpen: false,
    bookmarks: [],
    readingList: []
  },
  memory: null,
  downloads: [],
  agentRunning: false,
  agentPhase: 'idle',
  currentRunId: null,
  currentReliability: null,
  clearKeyRequested: false,
  panelDragging: false,
  promptedDownloads: new Set(),
  findOpen: false
};

const FIND_BAR_HEIGHT = 44;
let findDebounce = null;
let openContextMenu = null;

const toolCards = new Map();
const retiredRunIds = new Set();
const decisionQueue = [];
let currentDecision = null;
let thinkingRow = null;
let resizeFrame = null;
let focusBeforeOverlay = null;
let currentPlanCard = null;
let currentPlanRunId = null;

const APPROVAL_MODE_PRESENTATION = Object.freeze({
  ask: {
    label: 'Ask',
    title: 'Approval mode: Ask for approval'
  },
  'auto-safe': {
    label: 'Approve for me',
    title: 'Approval mode: Approve routine actions for me'
  },
  full: {
    label: 'Full access',
    title: 'Approval mode: Full access for BrowsMe web actions'
  }
});

function normalizeApprovalMode(value) {
  return Object.hasOwn(APPROVAL_MODE_PRESENTATION, value) ? value : 'ask';
}

const ICONS = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg>',
  tool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-7.8 7.8a2.1 2.1 0 0 0 3 3l7.8-7.8a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2Z"></path></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"></path><path d="M14 2v5h5M9 13h6M9 17h6"></path></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="m16 9 5 6M21 9l-5 6"></path></svg>'
};

function activeTab() {
  return state.browser.tabs.find((tab) => tab.id === state.browser.activeTabId) || null;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getHostname(url) {
  try {
    return new URL(url).hostname || 'New tab';
  } catch {
    return 'Unknown site';
  }
}

function safeFavicon(url) {
  return typeof url === 'string' && (/^https:\/\//i.test(url) || /^data:image\//i.test(url));
}

function reportViewport() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const rect = ui.pageViewport.getBoundingClientRect();
    const obscured = !ui.settingsOverlay.hidden || !ui.decisionOverlay.hidden ||
      !ui.downloadsPopover.hidden || !ui.historyOverlay.hidden || !ui.readingPopover.hidden;
    const findInset = state.findOpen ? FIND_BAR_HEIGHT : 0;
    window.browsme.setViewportBounds(obscured
      ? {
          x: Math.max(0, Math.round(rect.right - 1)),
          y: Math.max(0, Math.round(rect.bottom - 1)),
          width: 1,
          height: 1
        }
      : {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height - findInset))
        });
  });
}

function applyPanelState(save = false) {
  const isOpen = state.settings.aiPanelOpen !== false;
  ui.workspace.classList.toggle('ai-closed', !isOpen);
  ui.aiToggle.classList.toggle('is-active', isOpen);
  ui.aiToggle.setAttribute('aria-pressed', String(isOpen));
  ui.aiPanel.style.width = `${Math.max(300, Math.min(620, state.settings.aiPanelWidth || 390))}px`;
  reportViewport();
  if (save) {
    window.browsme.saveSettings({
      aiPanelOpen: isOpen,
      aiPanelWidth: state.settings.aiPanelWidth
    }).catch((error) => showToast(error.message, 'danger'));
  }
}

function setAiPanelOpen(open, save = true) {
  state.settings.aiPanelOpen = Boolean(open);
  applyPanelState(save);
  if (open) {
    setTimeout(() => ui.agentInput.focus(), 190);
  }
}

function renderTabs() {
  ui.tabs.replaceChildren();
  for (const tab of state.browser.tabs) {
    const element = document.createElement('div');
    element.className = 'tab';
    element.classList.toggle('is-active', tab.id === state.browser.activeTabId);
    element.classList.toggle('is-loading', Boolean(tab.loading));
    element.setAttribute('role', 'tab');
    element.setAttribute('aria-selected', String(tab.id === state.browser.activeTabId));
    element.setAttribute('aria-label', tab.title || 'Untitled tab');
    element.tabIndex = tab.id === state.browser.activeTabId ? 0 : -1;
    element.dataset.tabId = tab.id;

    const favicon = document.createElement('span');
    favicon.className = 'tab-favicon';
    const initial = (getHostname(tab.url)[0] || 'B').toUpperCase();
    favicon.textContent = initial;
    if (safeFavicon(tab.favicon) && !tab.loading) {
      const image = document.createElement('img');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.src = tab.favicon;
      image.addEventListener('error', () => {
        image.remove();
        favicon.textContent = initial;
      });
      favicon.replaceChildren(image);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.crashed ? 'Tab crashed' : (tab.title || 'Untitled');

    let mute = null;
    if (tab.muted) {
      mute = document.createElement('span');
      mute.className = 'tab-mute';
      mute.title = 'Tab muted';
      mute.innerHTML = ICONS.muted;
    }

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    close.innerHTML = ICONS.close;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      window.browsme.closeTab(tab.id).catch((error) => showToast(error.message, 'danger'));
    });

    element.append(favicon, title, ...(mute ? [mute] : []), close);
    element.addEventListener('click', () => {
      window.browsme.activateTab(tab.id).catch((error) => showToast(error.message, 'danger'));
    });
    element.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        window.browsme.closeTab(tab.id).catch((error) => showToast(error.message, 'danger'));
      }
    });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showTabContextMenu(event.clientX, event.clientY, tab);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        window.browsme.activateTab(tab.id).catch((error) => showToast(error.message, 'danger'));
      }
    });
    ui.tabs.append(element);
  }
}

function renderNavigation() {
  const tab = activeTab();
  if (!tab) {
    return;
  }

  if (document.activeElement !== ui.address) {
    ui.address.value = tab.displayUrl || '';
  }
  ui.back.disabled = !tab.canGoBack;
  ui.forward.disabled = !tab.canGoForward;
  ui.reload.classList.toggle('is-loading', Boolean(tab.loading));
  ui.reload.setAttribute('aria-label', tab.loading ? 'Stop loading' : 'Reload');
  ui.loadProgress.classList.toggle('is-loading', Boolean(tab.loading));

  ui.omnibox.classList.toggle('is-search', Boolean(tab.internal));
  ui.omnibox.classList.toggle('is-insecure', !tab.internal && !tab.secure);
  ui.security.setAttribute(
    'aria-label',
    tab.internal ? 'New tab search' : (tab.secure ? 'Secure connection' : 'Connection is not secure')
  );

  const bookmarked = (state.settings.bookmarks || []).some((entry) => entry.url === tab.url);
  ui.bookmark.classList.toggle('is-bookmarked', bookmarked);
  ui.bookmark.setAttribute('aria-label', bookmarked ? 'Remove bookmark' : 'Bookmark this tab');

  const zoom = Number(tab.zoom) || 100;
  ui.zoomReset.hidden = zoom === 100;
  ui.zoomReset.textContent = `${zoom}%`;
  ui.zoomReset.setAttribute('aria-label', `Zoom ${zoom}% — reset to 100%`);
}

function renderSettingsSummary() {
  const configured = Boolean(state.settings.apiKeyConfigured);
  const approvalMode = normalizeApprovalMode(state.settings.approvalMode);
  const approvalPresentation = APPROVAL_MODE_PRESENTATION[approvalMode];
  ui.modelLabel.textContent = state.settings.model || 'DeepSeek';
  ui.approvalModeChip.textContent = approvalPresentation.label;
  ui.approvalModeChip.title = approvalPresentation.title;
  ui.approvalModeChip.classList.toggle('is-auto-safe', approvalMode === 'auto-safe');
  ui.approvalModeChip.classList.toggle('is-full', approvalMode === 'full');
  ui.aiStatusDot.classList.toggle('is-offline', !configured);
  if (!state.agentRunning) {
    ui.connectionLabel.textContent = configured ? 'Ready' : 'Needs API key';
  }
  ui.apiKeyStatus.textContent = configured
    ? `Configured ${state.settings.apiKeyHint || ''}`
    : 'No key configured';
  ui.clearKey.hidden = !configured;
  if (ui.settingsOverlay.hidden) {
    ui.rememberKey.checked = state.settings.rememberApiKey !== false;
    ui.modelInput.value = state.settings.model || 'deepseek-v4-flash';
    ui.baseUrlInput.value = state.settings.baseUrl || 'https://api.deepseek.com';
    ui.agentReliability.value = ['fast', 'reliable', 'maximum']
      .includes(state.settings.agentReliability)
        ? state.settings.agentReliability
        : 'reliable';
    for (const input of ui.approvalModeInputs) {
      input.checked = input.value === approvalMode;
    }
    ui.themeInput.value = ['system', 'light', 'dark'].includes(state.settings.theme)
      ? state.settings.theme
      : 'system';
    ui.searchEngineInput.value = ['google', 'bing', 'duckduckgo', 'brave']
      .includes(state.settings.searchEngine)
        ? state.settings.searchEngine
        : 'google';
    ui.startupInput.value = ['restore', 'newtab'].includes(state.settings.startupMode)
      ? state.settings.startupMode
      : 'restore';
  }
  ui.app.dataset.theme = state.settings.theme || 'system';
  ui.app.classList.toggle('theme-is-dark', effectiveThemeIsDark());
  renderBookmarksBar();
}

function effectiveThemeIsDark() {
  const theme = state.settings.theme || 'system';
  if (theme === 'dark') {
    return true;
  }
  if (theme === 'light') {
    return false;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function renderBookmarksBar() {
  const open = state.settings.bookmarksBarOpen === true;
  ui.app.classList.toggle('bookmarks-open', open);
  if (!open) {
    return;
  }
  const bookmarks = state.settings.bookmarks || [];
  ui.bookmarksBar.replaceChildren();
  if (!bookmarks.length) {
    const empty = document.createElement('span');
    empty.className = 'bookmarks-empty';
    empty.textContent = 'No bookmarks yet — click the star in the address bar to add one.';
    ui.bookmarksBar.append(empty);
    return;
  }
  for (const bookmark of bookmarks) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bookmark-chip';
    chip.title = `${bookmark.title || bookmark.url}\n${bookmark.url}`;
    chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill="currentColor" stroke="none"></path></svg>';
    const label = document.createElement('span');
    label.textContent = bookmark.title || getHostname(bookmark.url);
    chip.append(label);
    chip.addEventListener('click', () => {
      window.browsme.navigate({ tabId: state.browser.activeTabId, url: bookmark.url })
        .catch((error) => showToast(error.message, 'danger'));
    });
    chip.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showSimpleMenu(event.clientX, event.clientY, [
        { label: 'Open in new tab', action: () => window.browsme.newTab({ url: bookmark.url }) },
        {
          label: 'Remove bookmark',
          action: async () => {
            state.settings = {
              ...state.settings,
              ...(await window.browsme.toggleBookmarkUrl({ url: bookmark.url, title: bookmark.title }))
            };
            renderBookmarksBar();
            renderNavigation();
          }
        }
      ]);
    });
    ui.bookmarksBar.append(chip);
  }
}

function renderBrowser(nextState) {
  if (nextState.browser) {
    state.browser = nextState.browser;
  } else {
    state.browser = {
      tabs: nextState.tabs || [],
      activeTabId: nextState.activeTabId || null
    };
  }
  if (nextState.settings) {
    state.settings = { ...state.settings, ...nextState.settings };
  }
  if (nextState.memory) {
    state.memory = nextState.memory;
  }

  renderTabs();
  renderNavigation();
  renderSettingsSummary();
  applyPanelState(false);

  const maximizeSvg = nextState.windowMaximized
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="6" width="10" height="10" rx="1"></rect><path d="M6 9H5v10h10v-1"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1"></rect></svg>';
  ui.maximizeButton.innerHTML = maximizeSvg;
}

function appendMessage(role, content) {
  const row = document.createElement('article');
  row.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'ai' ? 'AI' : 'YOU';

  const body = document.createElement('div');
  body.className = 'message-body';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const author = document.createElement('span');
  author.textContent = role === 'ai' ? 'BrowsMe' : 'You';
  const time = document.createElement('span');
  time.textContent = formatTime();
  meta.append(author, time);

  const message = document.createElement('div');
  message.className = 'message-content';
  message.textContent = String(content || '');
  body.append(meta, message);
  row.append(avatar, body);
  ui.terminalLog.append(row);
  scrollTerminal();
  return row;
}

function appendSystemNote(content) {
  const row = document.createElement('div');
  row.className = 'thinking-row';
  row.textContent = content;
  ui.terminalLog.append(row);
  scrollTerminal();
}

function showThinking(step) {
  removeThinking();
  thinkingRow = document.createElement('div');
  thinkingRow.className = 'thinking-row';
  const dots = document.createElement('span');
  dots.className = 'thinking-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  const label = document.createElement('span');
  label.textContent = `BrowsMe is planning · step ${step}`;
  thinkingRow.append(dots, label);
  ui.terminalLog.append(thinkingRow);
  scrollTerminal();
}

function removeThinking() {
  thinkingRow?.remove();
  thinkingRow = null;
}

function friendlyToolName(name) {
  return String(name || '')
    .replace(/^browser_/, 'browser · ')
    .replace(/^page_/, 'page · ')
    .replace(/^memory_/, 'memory · ')
    .replaceAll('_', ' ');
}

function toolCardKey(runId, toolCallId) {
  return `${String(runId || '')}:${String(toolCallId || '')}`;
}

function retireRun(runId) {
  if (!runId) return;
  retiredRunIds.add(runId);
  while (retiredRunIds.size > 30) {
    retiredRunIds.delete(retiredRunIds.values().next().value);
  }
}

function appendToolCard(event) {
  removeThinking();
  const card = document.createElement('section');
  card.className = 'tool-card is-running';

  const header = document.createElement('div');
  header.className = 'tool-card-header';
  const icon = document.createElement('span');
  icon.className = 'tool-icon';
  icon.innerHTML = ICONS.tool;
  const title = document.createElement('span');
  title.className = 'tool-title';
  title.textContent = friendlyToolName(event.tool);
  const toolState = document.createElement('span');
  toolState.className = 'tool-state';
  toolState.textContent = 'Running';
  header.append(icon, title, toolState);

  const summary = document.createElement('p');
  summary.className = 'tool-summary';
  const args = event.args || {};
  if (args.url) {
    summary.textContent = String(args.url);
  } else if (args.ref) {
    summary.textContent = `Target ${args.ref}`;
  } else {
    summary.textContent = 'Using the browser control broker';
  }
  card.append(header, summary);
  ui.terminalLog.append(card);
  toolCards.set(toolCardKey(event.runId, event.toolCallId), {
    runId: event.runId,
    card,
    toolState,
    summary
  });
  scrollTerminal();
}

function updateToolCard(event) {
  const stored = toolCards.get(toolCardKey(event.runId, event.toolCallId));
  if (!stored) {
    return;
  }
  const hasSideEffectWarning =
    Array.isArray(event.sideEffectWarnings) &&
    event.sideEffectWarnings.length > 0;
  stored.card.classList.remove('is-running');
  stored.card.classList.toggle('has-side-effect-warning', hasSideEffectWarning);
  stored.card.classList.toggle('is-failed', !event.ok);
  stored.card.classList.remove('is-verified');
  stored.card.classList.toggle(
    'is-unverified',
    event.ok && (
      event.executed === true ||
      event.verified === false ||
      hasSideEffectWarning
    )
  );
  stored.toolState.textContent = !event.ok
    ? 'Failed'
    : hasSideEffectWarning
      ? 'Executed · side effect unresolved'
    : event.observed === true
      ? 'Observed'
      : event.stateMatched === true
      ? 'State already matched'
      : event.executed === true
        ? event.effectObserved === true
          ? 'Effect observed'
          : 'Executed'
        : 'Done';
  const warningText = hasSideEffectWarning
    ? ` Side effect warning: ${event.sideEffectWarnings
      .map((code) => String(code).replaceAll('_', ' ').toLowerCase())
      .join(', ')}.`
    : '';
  stored.summary.textContent =
    (event.summary || (event.ok ? 'Action completed.' : 'Action failed.')) +
    warningText;
  scrollTerminal();
}

function reconcileActionVerification(event) {
  const stored = toolCards.get(toolCardKey(event.runId, event.toolCallId));
  if (!stored) {
    return;
  }
  if (event.reobserved) {
    stored.card.classList.remove('is-unverified');
    stored.card.classList.add('is-reobserved');
    stored.toolState.textContent = 'Re-observed';
    stored.summary.textContent += ` Fresh state observed with ${friendlyToolName(event.observationTool)}.`;
  } else {
    stored.toolState.textContent = `${event.remainingChecks} check${event.remainingChecks === 1 ? '' : 's'} left`;
  }
}

function finalizeActionCards(runId, succeeded) {
  for (const stored of toolCards.values()) {
    if (
      stored.runId !== runId ||
      !stored.card.classList.contains('is-reobserved') ||
      stored.card.classList.contains('has-side-effect-warning')
    ) {
      continue;
    }
    if (succeeded) {
      stored.card.classList.remove('is-reobserved', 'is-unverified');
      stored.card.classList.add('is-verified');
      stored.toolState.textContent = 'Verified';
    }
  }
}

function renderAgentPlan(event) {
  const plan = event.plan || {};
  if (!currentPlanCard || currentPlanRunId !== event.runId) {
    currentPlanCard = document.createElement('section');
    currentPlanCard.className = 'agent-plan-card';
    currentPlanCard.setAttribute('aria-label', 'BrowsMe task plan');
    ui.terminalLog.append(currentPlanCard);
    currentPlanRunId = event.runId;
  }

  const heading = document.createElement('h3');
  heading.textContent = plan.goal || 'Task plan';
  const list = document.createElement('ol');
  const statusLabels = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Ready for final validation',
    blocked: 'Blocked'
  };
  for (const step of plan.steps || []) {
    const item = document.createElement('li');
    item.className = `is-${String(step.status || 'pending').replace('_', '-')}`;
    const status = statusLabels[step.status] || 'Pending';
    item.textContent = step.note
      ? `${status}: ${step.description} — ${step.note}`
      : `${status}: ${step.description}`;
    list.append(item);
  }
  currentPlanCard.replaceChildren(heading, list);
  scrollTerminal();
}

function appendReceipt(event) {
  const receipt = event.receipt || {};
  const card = document.createElement('section');
  card.className = `agent-receipt-card is-${receipt.status || 'blocked'}`;
  card.setAttribute('aria-label', 'BrowsMe task receipt');
  const heading = document.createElement('strong');
  heading.textContent = receipt.status === 'succeeded'
    ? 'Completion receipt validated'
    : receipt.status === 'partial'
      ? 'Partial completion recorded'
      : 'Task blocker recorded';
  const details = document.createElement('p');
  const parts = [];
  if (receipt.remaining) {
    parts.push(`Remaining: ${receipt.remaining}`);
  }
  if (receipt.blockerCode) {
    parts.push(`Blocker: ${String(receipt.blockerCode).replaceAll('_', ' ')}`);
  }
  if (receipt.unverifiedActions > 0) {
    parts.push(`${receipt.unverifiedActions} action check${receipt.unverifiedActions === 1 ? '' : 's'} unresolved`);
  }
  if (receipt.unresolvedSideEffects > 0) {
    parts.push(`${receipt.unresolvedSideEffects} browser side effect${receipt.unresolvedSideEffects === 1 ? '' : 's'} unresolved`);
  }
  details.textContent = parts.join(' · ') || 'The broker accepted the structured result.';
  card.append(heading, details);
  ui.terminalLog.append(card);
  finalizeActionCards(event.runId, receipt.status === 'succeeded');
  scrollTerminal();
}

function scrollTerminal() {
  requestAnimationFrame(() => {
    ui.terminalLog.scrollTop = ui.terminalLog.scrollHeight;
  });
}

function setAgentRunning(running, label) {
  state.agentRunning = Boolean(running);
  ui.terminalLog.dataset.busy = String(state.agentRunning);
  ui.sendAgent.classList.toggle('is-running', state.agentRunning);
  ui.sendAgent.setAttribute('aria-label', state.agentRunning ? 'Stop command' : 'Run command');
  ui.controlBanner.hidden = !state.agentRunning;
  ui.toolbarStopAgent.hidden = !state.agentRunning;
  ui.agentInput.disabled = state.agentRunning;
  ui.agentScope.disabled = state.agentRunning;
  ui.suggestions.hidden = state.agentRunning;
  ui.agentStateLabel.textContent = label || (state.agentRunning ? 'Working' : 'Ready');
}

function focusAgentComposer() {
  if (
    ui.settingsOverlay.hidden &&
    ui.decisionOverlay.hidden &&
    state.settings.aiPanelOpen !== false
  ) {
    setTimeout(() => ui.agentInput.focus(), 0);
  }
}

function setAgentPhase(phase, label) {
  state.agentPhase = phase;
  const names = {
    idle: state.settings.apiKeyConfigured ? 'Ready' : 'Needs API key',
    understanding: 'Understanding',
    acting: 'Acting',
    approval: 'Awaiting approval',
    verifying: 'Verifying result',
    retrying: 'Retrying connection',
    recovering: 'Refreshing page state',
    stopping: 'Stopping',
    complete: 'Ready',
    stopped: 'Stopped',
    failed: 'Failed'
  };
  const text = label || names[phase] || 'Ready';
  ui.connectionLabel.textContent = text;
  ui.agentStateLabel.textContent = text;
  const paused = phase === 'approval';
  ui.controlBanner.classList.toggle('is-paused', paused);
  ui.controlBannerLabel.textContent = paused
    ? 'AI paused for your approval'
    : phase === 'stopping'
      ? 'Stopping AI control'
      : 'AI controlling this browser';
}

async function requestAgentStop() {
  try {
    await window.browsme.stopAgent();
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

async function runAgentPrompt(rawPrompt) {
  let prompt = String(rawPrompt || '').trim();
  if (!prompt) {
    return;
  }

  if (prompt === '/clear') {
    await clearTerminal();
    return;
  }
  if (prompt === '/stop') {
    await window.browsme.stopAgent();
    return;
  }
  if (prompt === '/tabs') {
    prompt = 'List all open tabs and briefly describe each one.';
  } else if (prompt === '/inspect') {
    prompt = 'Inspect the current page and describe its main sections and interactive controls.';
  } else if (prompt === '/summarize') {
    prompt = 'Summarize the current page in concise bullets.';
  } else if (prompt === '/whoami') {
    prompt = 'Use browsme_self_state, then introduce yourself, your creator, your current operational state, and your limitations.';
  }

  if (!state.settings.apiKeyConfigured) {
    showToast('Add your DeepSeek API key first.', 'warning');
    openSettings();
    return;
  }

  appendMessage('user', prompt);
  ui.agentInput.value = '';
  resizeComposer();
  setAgentRunning(true, 'Starting');
  setAgentPhase('understanding');

  try {
    await window.browsme.runAgent({
      prompt,
      scope: ui.agentScope.value
    });
  } catch (error) {
    if (state.agentRunning) {
      removeThinking();
      appendMessage('ai', error.message || 'The command failed.');
      setAgentRunning(false, 'Failed');
    }
  }
}

async function clearTerminal() {
  if (state.agentRunning) {
    showToast('Stop the current command before clearing the terminal.', 'warning');
    return;
  }
  const confirmed = window.confirm(
    'Delete the saved BrowsMe conversation history? Explicitly remembered facts will be kept.'
  );
  if (!confirmed) {
    return;
  }
  try {
    await window.browsme.clearAgent();
  } catch (error) {
    showToast(error.message || 'Conversation history could not be deleted.', 'danger');
    return;
  }
  for (const child of Array.from(ui.terminalLog.children)) {
    if (!child.classList.contains('welcome-card')) {
      child.remove();
    }
  }
  toolCards.clear();
  currentPlanCard = null;
  currentPlanRunId = null;
  showToast('Conversation history deleted. Explicitly remembered facts were kept.');
}

function onAgentEvent(event) {
  if (event.type === 'started' && retiredRunIds.has(event.runId)) {
    return;
  }
  if (event.type === 'started' && state.currentRunId && event.runId !== state.currentRunId) {
    return;
  }
  if (
    event.type !== 'started' &&
    event.type !== 'cleared' &&
    event.runId &&
    event.runId !== state.currentRunId
  ) {
    return;
  }

  switch (event.type) {
    case 'started':
      state.currentRunId = event.runId;
      state.currentReliability = event.reliability || 'reliable';
      currentPlanCard = null;
      currentPlanRunId = null;
      setAgentRunning(true, 'Understanding');
      setAgentPhase('understanding');
      appendSystemNote(
        `Task started · ${state.currentReliability === 'maximum' ? 'Maximum accuracy' : state.currentReliability === 'fast' ? 'Fast' : 'Reliable'}`
      );
      break;
    case 'thinking':
      showThinking(event.step);
      setAgentPhase('understanding', `Planning · ${event.step}`);
      break;
    case 'tool-start':
      appendToolCard(event);
      setAgentPhase('acting', friendlyToolName(event.tool));
      break;
    case 'tool-result':
      updateToolCard(event);
      break;
    case 'action-verification':
      reconcileActionVerification(event);
      break;
    case 'plan':
      renderAgentPlan(event);
      break;
    case 'verification':
      removeThinking();
      appendSystemNote('More verification is required before BrowsMe can report completion.');
      setAgentPhase('verifying');
      break;
    case 'retry':
      removeThinking();
      appendSystemNote(`Connection retry ${event.attempt} · ${event.message || 'Trying again safely.'}`);
      setAgentPhase('retrying');
      break;
    case 'recovery':
      appendSystemNote(`Page state refreshed after ${event.code || 'a changed target'}. No action was replayed.`);
      setAgentPhase('recovering');
      break;
    case 'receipt':
      appendReceipt(event);
      setAgentPhase(
        'verifying',
        event.receipt?.status === 'succeeded'
          ? 'Completion validated'
          : event.receipt?.status === 'partial'
            ? 'Partial result recorded'
            : 'Blocker recorded'
      );
      break;
    case 'complete':
      removeThinking();
      appendMessage('ai', event.content);
      appendSystemNote(
        `${event.status === 'succeeded' ? 'Verified complete' : event.status === 'partial' ? 'Partially complete' : 'Blocked'} · ${event.actions || 0} browser action${event.actions === 1 ? '' : 's'} · ${event.retries || 0} connection retr${event.retries === 1 ? 'y' : 'ies'}`
      );
      setAgentRunning(false, event.status === 'succeeded' ? 'Verified' : 'Finished');
      setAgentPhase('complete');
      retireRun(state.currentRunId);
      state.currentRunId = null;
      state.currentReliability = null;
      focusAgentComposer();
      break;
    case 'stopping':
      removeThinking();
      setAgentRunning(true, 'Stopping');
      setAgentPhase('stopping');
      break;
    case 'cancelled':
      removeThinking();
      appendSystemNote(
        `Command stopped by you · ${event.actions || 0} browser action${event.actions === 1 ? '' : 's'} executed; completed effects were not reversed.`
      );
      setAgentRunning(false, 'Stopped');
      setAgentPhase('stopped');
      retireRun(state.currentRunId);
      state.currentRunId = null;
      state.currentReliability = null;
      focusAgentComposer();
      break;
    case 'error':
      removeThinking();
      appendMessage('ai', event.message || 'BrowsMe could not complete the command.');
      appendSystemNote(
        `Failed receipt · ${event.actions || 0} browser action${event.actions === 1 ? '' : 's'} · ${event.retries || 0} connection retr${event.retries === 1 ? 'y' : 'ies'}`
      );
      setAgentRunning(false, 'Failed');
      setAgentPhase('failed');
      retireRun(state.currentRunId);
      state.currentRunId = null;
      state.currentReliability = null;
      focusAgentComposer();
      break;
    case 'cleared':
      break;
    default:
      break;
  }
}

function showToast(message, tone = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast is-${tone}`;
  toast.textContent = String(message || '');
  ui.toastRegion.append(toast);
  setTimeout(() => toast.remove(), 4200);
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function renderDownloads() {
  ui.downloadsList.replaceChildren();
  const activeCount = state.downloads.filter((item) => ['awaiting', 'progressing', 'paused'].includes(item.state)).length;
  ui.downloadBadge.hidden = activeCount === 0;
  ui.downloadBadge.textContent = activeCount > 9 ? '9+' : String(activeCount);

  if (!state.downloads.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No downloads yet.';
    ui.downloadsList.append(empty);
    return;
  }

  for (const download of state.downloads) {
    const row = document.createElement('article');
    row.className = 'download-item';
    const icon = document.createElement('div');
    icon.className = 'download-file-icon';
    icon.innerHTML = ICONS.file;
    const info = document.createElement('div');
    info.className = 'download-info';
    const name = document.createElement('div');
    name.className = 'download-name';
    name.textContent = download.filename;
    const status = document.createElement('div');
    status.className = 'download-status';
    const received = formatBytes(download.receivedBytes);
    const total = download.totalBytes > 0 ? ` of ${formatBytes(download.totalBytes)}` : '';
    status.textContent = download.state === 'completed'
      ? `${formatBytes(download.totalBytes || download.receivedBytes)} · Complete`
      : download.state === 'awaiting'
        ? `Waiting for approval · ${getHostname(download.sourceUrl)}`
        : `${received}${total} · ${download.state}`;
    info.append(name, status);

    if (download.totalBytes > 0 && ['progressing', 'paused'].includes(download.state)) {
      const progress = document.createElement('div');
      progress.className = 'download-progress';
      const bar = document.createElement('span');
      bar.style.width = `${Math.min(100, (download.receivedBytes / download.totalBytes) * 100)}%`;
      progress.append(bar);
      info.append(progress);
    }

    const actions = document.createElement('div');
    actions.className = 'download-actions';
    if (download.state === 'awaiting') {
      const deny = document.createElement('button');
      deny.type = 'button';
      deny.textContent = 'Deny';
      deny.addEventListener('click', () => decideDownload(download.id, false));
      const allow = document.createElement('button');
      allow.type = 'button';
      allow.className = 'primary-mini';
      allow.textContent = 'Save';
      allow.addEventListener('click', () => decideDownload(download.id, true));
      actions.append(deny, allow);
    } else if (download.state === 'completed') {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.textContent = 'Show';
      reveal.addEventListener('click', () => {
        window.browsme.revealDownload(download.id).catch((error) => showToast(error.message, 'danger'));
      });
      actions.append(reveal);
    }

    row.append(icon, info, actions);
    ui.downloadsList.append(row);
  }
}

function onDownloadsState(downloads) {
  state.downloads = Array.isArray(downloads) ? downloads : [];
  renderDownloads();
  for (const download of state.downloads) {
    if (download.state === 'awaiting' && !state.promptedDownloads.has(download.id)) {
      state.promptedDownloads.add(download.id);
      enqueueDecision({
        type: 'download',
        payload: {
          id: download.id,
          title: 'Save this download?',
          description: `A page requested “${download.filename}”. Downloads never open automatically.`,
          origin: download.sourceUrl,
          confirmLabel: 'Save file'
        }
      });
    }
  }
}

async function decideDownload(id, allow) {
  try {
    state.downloads = await window.browsme.decideDownload({ downloadId: id, allow });
    renderDownloads();
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function toggleDownloads(force) {
  const show = typeof force === 'boolean' ? force : ui.downloadsPopover.hidden;
  ui.downloadsPopover.hidden = !show;
  reportViewport();
  if (show) {
    renderDownloads();
  }
}

function openSettings() {
  focusBeforeOverlay = document.activeElement;
  state.clearKeyRequested = false;
  ui.settingsError.textContent = '';
  ui.apiKey.value = '';
  ui.apiKey.type = 'password';
  ui.toggleKey.textContent = 'Show';
  renderSettingsSummary();
  ui.settingsOverlay.hidden = false;
  document.querySelector('.browser-header').inert = true;
  ui.workspace.inert = true;
  reportViewport();
  setTimeout(() => (state.settings.apiKeyConfigured ? ui.modelInput : ui.apiKey).focus(), 30);
}

function closeSettings() {
  ui.settingsOverlay.hidden = true;
  ui.settingsError.textContent = '';
  if (ui.decisionOverlay.hidden) {
    document.querySelector('.browser-header').inert = false;
    ui.workspace.inert = false;
  }
  reportViewport();
  focusBeforeOverlay?.focus?.();
  focusBeforeOverlay = null;
}

async function saveSettings() {
  ui.settingsError.textContent = '';
  ui.saveSettings.disabled = true;
  try {
    const previousApprovalMode = normalizeApprovalMode(state.settings.approvalMode);
    const selectedApprovalMode = ui.approvalModeInputs
      .find((input) => input.checked)?.value || 'ask';
    const input = {
      model: ui.modelInput.value,
      baseUrl: ui.baseUrlInput.value,
      rememberApiKey: ui.rememberKey.checked,
      approvalMode: selectedApprovalMode,
      agentReliability: ui.agentReliability.value,
      theme: ui.themeInput.value,
      searchEngine: ui.searchEngineInput.value,
      startupMode: ui.startupInput.value,
      clearApiKey: state.clearKeyRequested
    };
    if (ui.apiKey.value.trim()) {
      input.apiKey = ui.apiKey.value.trim();
      input.clearApiKey = false;
    }
    state.settings = {
      ...state.settings,
      ...(await window.browsme.saveSettings(input))
    };
    renderSettingsSummary();
    closeSettings();
    const nextApprovalMode = normalizeApprovalMode(state.settings.approvalMode);
    if (nextApprovalMode !== previousApprovalMode && nextApprovalMode === 'full') {
      showToast(
        'Full access enabled for BrowsMe web actions. Protected boundaries still ask.',
        'warning'
      );
    } else if (nextApprovalMode !== previousApprovalMode) {
      showToast(`${APPROVAL_MODE_PRESENTATION[nextApprovalMode].label} approval mode enabled.`);
    } else {
      showToast('BrowsMe settings saved.');
    }
  } catch (error) {
    ui.settingsError.textContent = error.message || 'Could not save settings.';
  } finally {
    ui.saveSettings.disabled = false;
  }
}

function enqueueDecision(decision) {
  decisionQueue.push(decision);
  showNextDecision();
}

function showNextDecision() {
  if (currentDecision || decisionQueue.length === 0) {
    return;
  }
  currentDecision = decisionQueue.shift();
  const { type, payload } = currentDecision;
  const baseEyebrow = type === 'permission'
    ? 'SITE PERMISSION'
    : type === 'download'
      ? 'DOWNLOAD REQUEST'
      : 'AI APPROVAL REQUIRED';
  ui.decisionEyebrow.textContent = decisionQueue.length
    ? `${baseEyebrow} · ${decisionQueue.length + 1} PENDING`
    : baseEyebrow;
  ui.decisionTitle.textContent = payload.title || 'Allow this browser action?';
  ui.decisionDescription.textContent = payload.description ||
    (type === 'permission'
      ? `${payload.origin} wants permission to use ${payload.permission}.`
      : 'This action needs your approval.');
  ui.decisionOrigin.textContent = payload.origin || 'Current browser tab';
  ui.allowDecision.textContent = payload.confirmLabel ||
    (type === 'permission' ? 'Allow once' : type === 'download' ? 'Save file' : 'Allow once');
  focusBeforeOverlay = document.activeElement;
  document.querySelector('.browser-header').inert = true;
  ui.workspace.inert = true;
  ui.denyDecision.disabled = false;
  ui.allowDecision.disabled = false;
  ui.decisionOverlay.hidden = false;
  reportViewport();
  setTimeout(() => ui.denyDecision.focus(), 20);
}

async function resolveDecision(allow) {
  if (!currentDecision) {
    return;
  }
  const decision = currentDecision;
  ui.denyDecision.disabled = true;
  ui.allowDecision.disabled = true;
  try {
    if (decision.type === 'approval') {
      await window.browsme.resolveApproval({ id: decision.payload.id, allow });
    } else if (decision.type === 'permission') {
      await window.browsme.resolvePermission({ id: decision.payload.id, allow });
    } else if (decision.type === 'download') {
      await decideDownload(decision.payload.id, allow);
    }
    currentDecision = null;
    ui.decisionOverlay.hidden = true;
    if (ui.settingsOverlay.hidden) {
      document.querySelector('.browser-header').inert = false;
      ui.workspace.inert = false;
    }
    focusBeforeOverlay?.focus?.();
    focusBeforeOverlay = null;
    if (decision.type === 'approval' && state.agentRunning) {
      setAgentPhase('acting');
    }
  } catch (error) {
    showToast(error.message, 'danger');
    ui.denyDecision.disabled = false;
    ui.allowDecision.disabled = false;
    return;
  }
  reportViewport();
  showNextDecision();
}

function resizeComposer() {
  ui.agentInput.style.height = 'auto';
  ui.agentInput.style.height = `${Math.min(110, Math.max(35, ui.agentInput.scrollHeight))}px`;
}

function updateFindCount(result) {
  const matches = Number(result?.matches) || 0;
  const active = Number(result?.activeMatch) || 0;
  const query = ui.findInput.value.trim();
  ui.findCount.textContent = query ? `${active}/${matches}` : '';
  ui.findCount.classList.toggle('is-empty', Boolean(query) && matches === 0);
  ui.findPrev.disabled = matches === 0;
  ui.findNext.disabled = matches === 0;
}

function runFind(findNext, forward = true) {
  const text = ui.findInput.value;
  if (!text.trim()) {
    ui.findCount.textContent = '';
    ui.findCount.classList.remove('is-empty');
    ui.findPrev.disabled = true;
    ui.findNext.disabled = true;
    window.browsme.stopFind({ keepSelection: false }).catch(() => {});
    return;
  }
  window.browsme.findInPage({ text, forward, findNext })
    .catch((error) => showToast(error.message, 'danger'));
}

function openFind() {
  const wasOpen = state.findOpen;
  state.findOpen = true;
  ui.findBar.hidden = false;
  reportViewport();
  ui.findInput.focus();
  ui.findInput.select();
  if (ui.findInput.value.trim() && !wasOpen) {
    runFind(false, true);
  }
}

function closeFind() {
  if (!state.findOpen) {
    return;
  }
  state.findOpen = false;
  ui.findBar.hidden = true;
  window.browsme.stopFind({ keepSelection: false }).catch(() => {});
  reportViewport();
}

function closeContextMenu() {
  openContextMenu?.remove();
  openContextMenu = null;
}

function showTabContextMenu(x, y, tab) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  const addItem = (label, shortcut, handler, disabled = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.disabled = disabled;
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    if (shortcut) {
      const hint = document.createElement('span');
      hint.className = 'menu-shortcut';
      hint.textContent = shortcut;
      button.append(hint);
    }
    button.addEventListener('click', () => {
      closeContextMenu();
      Promise.resolve(handler()).catch((error) => showToast(error.message, 'danger'));
    });
    menu.append(button);
  };
  const addSeparator = () => {
    const sep = document.createElement('div');
    sep.className = 'menu-sep';
    menu.append(sep);
  };

  const onlyTab = state.browser.tabs.length <= 1;
  addItem('Reload', '', () => window.browsme.navigationAction({ tabId: tab.id, action: 'reload' }));
  addItem('Duplicate', '', () => window.browsme.duplicateTab(tab.id));
  addItem(tab.muted ? 'Unmute tab' : 'Mute tab', '', () => window.browsme.muteTab(tab.id));
  addSeparator();
  addItem('Close tab', 'Ctrl+W', () => window.browsme.closeTab(tab.id));
  addItem('Close other tabs', '', () => window.browsme.closeOtherTabs(tab.id), onlyTab);
  addItem('Reopen closed tab', 'Ctrl+Shift+T', () => window.browsme.reopenTab());

  menu.style.visibility = 'hidden';
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.visibility = 'visible';
  openContextMenu = menu;
}

function showSimpleMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.append(sep);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.disabled = item.disabled === true;
    const text = document.createElement('span');
    text.textContent = item.label;
    button.append(text);
    if (item.shortcut) {
      const hint = document.createElement('span');
      hint.className = 'menu-shortcut';
      hint.textContent = item.shortcut;
      button.append(hint);
    }
    button.addEventListener('click', () => {
      closeContextMenu();
      Promise.resolve(item.action()).catch((error) => showToast(error.message, 'danger'));
    });
    menu.append(button);
  }
  menu.style.visibility = 'hidden';
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  menu.style.visibility = 'visible';
  openContextMenu = menu;
}

async function toggleTheme() {
  const next = effectiveThemeIsDark() ? 'light' : 'dark';
  state.settings.theme = next;
  ui.app.dataset.theme = next;
  ui.app.classList.toggle('theme-is-dark', next === 'dark');
  try {
    state.settings = { ...state.settings, ...(await window.browsme.saveSettings({ theme: next })) };
    renderSettingsSummary();
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function showBrowserMenu() {
  const rect = ui.menuButton.getBoundingClientRect();
  showSimpleMenu(rect.right, rect.bottom + 4, [
    { label: 'History', shortcut: 'Ctrl+H', action: openHistory },
    { label: 'Reading list', action: () => toggleReadingPopover(true) },
    {
      label: state.settings.bookmarksBarOpen ? 'Hide bookmarks bar' : 'Show bookmarks bar',
      shortcut: 'Ctrl+Shift+B',
      action: toggleBookmarksBar
    },
    { separator: true },
    { label: 'Clear browsing data', action: () => { openSettings(); } }
  ]);
}

async function bookmarkActive() {
  try {
    state.settings = { ...state.settings, ...(await window.browsme.toggleBookmark()) };
    renderNavigation();
    renderBookmarksBar();
    showToast(ui.bookmark.classList.contains('is-bookmarked') ? 'Bookmark saved.' : 'Bookmark removed.');
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

async function toggleBookmarksBar() {
  const open = !(state.settings.bookmarksBarOpen === true);
  state.settings.bookmarksBarOpen = open;
  renderBookmarksBar();
  reportViewport();
  try {
    await window.browsme.saveSettings({ bookmarksBarOpen: open });
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function formatHistoryTime(at) {
  const date = new Date(Number(at) || Date.now());
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderHistoryList(entries) {
  ui.historyListEl.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = ui.historySearch.value.trim()
      ? 'No history matches your search.'
      : 'No browsing history yet.';
    ui.historyListEl.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'history-item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-open';
    open.title = entry.url;
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = entry.title || entry.url;
    const url = document.createElement('span');
    url.className = 'history-url';
    url.textContent = entry.url;
    open.append(title, url);
    open.addEventListener('click', () => {
      window.browsme.navigate({ tabId: state.browser.activeTabId, url: entry.url })
        .catch((error) => showToast(error.message, 'danger'));
      closeHistory();
    });
    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = formatHistoryTime(entry.at);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-remove';
    remove.setAttribute('aria-label', 'Remove from history');
    remove.innerHTML = ICONS.close;
    remove.addEventListener('click', async () => {
      await window.browsme.historyRemove(entry.url).catch(() => {});
      row.remove();
    });
    row.append(open, time, remove);
    ui.historyListEl.append(row);
  }
}

async function loadHistory() {
  try {
    const entries = await window.browsme.historyList({ query: ui.historySearch.value, limit: 500 });
    renderHistoryList(Array.isArray(entries) ? entries : []);
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function openHistory() {
  closeContextMenu();
  focusBeforeOverlay = document.activeElement;
  ui.historySearch.value = '';
  ui.historyOverlay.hidden = false;
  document.querySelector('.browser-header').inert = true;
  ui.workspace.inert = true;
  reportViewport();
  void loadHistory();
  setTimeout(() => ui.historySearch.focus(), 30);
}

function closeHistory() {
  ui.historyOverlay.hidden = true;
  if (ui.settingsOverlay.hidden && ui.decisionOverlay.hidden) {
    document.querySelector('.browser-header').inert = false;
    ui.workspace.inert = false;
  }
  reportViewport();
  focusBeforeOverlay?.focus?.();
  focusBeforeOverlay = null;
}

function renderReadingList() {
  const items = state.settings.readingList || [];
  ui.readingList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Your reading list is empty.';
    ui.readingList.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'download-item';
    const info = document.createElement('div');
    info.className = 'download-info';
    const name = document.createElement('div');
    name.className = 'download-name';
    name.textContent = item.title || item.url;
    const status = document.createElement('div');
    status.className = 'download-status';
    status.textContent = getHostname(item.url);
    info.append(name, status);
    info.style.cursor = 'pointer';
    info.addEventListener('click', () => {
      window.browsme.navigate({ tabId: state.browser.activeTabId, url: item.url })
        .catch((error) => showToast(error.message, 'danger'));
      toggleReadingPopover(false);
    });
    const actions = document.createElement('div');
    actions.className = 'download-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      state.settings = { ...state.settings, ...(await window.browsme.toggleReadingItemUrl({ url: item.url, title: item.title })) };
      renderReadingList();
    });
    actions.append(remove);
    row.append(info, actions);
    ui.readingList.append(row);
  }
}

function toggleReadingPopover(force) {
  const show = typeof force === 'boolean' ? force : ui.readingPopover.hidden;
  ui.readingPopover.hidden = !show;
  reportViewport();
  if (show) {
    renderReadingList();
  }
}

async function clearBrowsingDataAction() {
  const confirmed = window.confirm(
    'Clear cookies, cached files, site storage, and your BrowsMe history? Signed-in sites will be logged out.'
  );
  if (!confirmed) {
    return;
  }
  try {
    await window.browsme.clearBrowsingData({ cookies: true, cache: true, history: true });
    showToast('Browsing data cleared.');
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function bindEvents() {
  ui.newTab.addEventListener('click', () => {
    window.browsme.newTab({}).catch((error) => showToast(error.message, 'danger'));
  });
  ui.home.addEventListener('click', () => {
    window.browsme.navigate({ tabId: state.browser.activeTabId, url: 'browsme://newtab/index.html' })
      .catch((error) => showToast(error.message, 'danger'));
  });
  ui.back.addEventListener('click', () => {
    window.browsme.navigationAction({ tabId: state.browser.activeTabId, action: 'back' })
      .catch((error) => showToast(error.message, 'danger'));
  });
  ui.forward.addEventListener('click', () => {
    window.browsme.navigationAction({ tabId: state.browser.activeTabId, action: 'forward' })
      .catch((error) => showToast(error.message, 'danger'));
  });
  ui.reload.addEventListener('click', () => {
    const tab = activeTab();
    window.browsme.navigationAction({
      tabId: state.browser.activeTabId,
      action: tab?.loading ? 'stop' : 'reload'
    }).catch((error) => showToast(error.message, 'danger'));
  });
  ui.address.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.browsme.navigate({
        tabId: state.browser.activeTabId,
        url: ui.address.value
      }).catch((error) => showToast(error.message, 'danger'));
      ui.address.blur();
    } else if (event.key === 'Escape') {
      renderNavigation();
      ui.address.blur();
    }
  });
  ui.address.addEventListener('focus', () => ui.address.select());
  ui.security.addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || tab.internal) {
      showToast('This is a protected BrowsMe page.');
    } else if (tab.secure) {
      showToast(`Secure HTTPS connection to ${getHostname(tab.url)}.`);
    } else {
      showToast(`Connection to ${getHostname(tab.url)} is not secure.`, 'warning');
    }
  });
  ui.bookmark.addEventListener('click', async () => {
    try {
      state.settings = { ...state.settings, ...(await window.browsme.toggleBookmark()) };
      renderNavigation();
      showToast(ui.bookmark.classList.contains('is-bookmarked') ? 'Bookmark saved.' : 'Bookmark removed.');
    } catch (error) {
      showToast(error.message, 'danger');
    }
  });

  ui.zoomReset.addEventListener('click', () => {
    window.browsme.zoomPage('reset').catch((error) => showToast(error.message, 'danger'));
  });

  ui.findInput.addEventListener('input', () => {
    clearTimeout(findDebounce);
    findDebounce = setTimeout(() => runFind(false, true), 120);
  });
  ui.findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runFind(true, !event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });
  ui.findPrev.addEventListener('click', () => {
    runFind(true, false);
    ui.findInput.focus();
  });
  ui.findNext.addEventListener('click', () => {
    runFind(true, true);
    ui.findInput.focus();
  });
  ui.findClose.addEventListener('click', closeFind);

  ui.themeToggle.addEventListener('click', () => void toggleTheme());
  ui.menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openContextMenu) {
      closeContextMenu();
    } else {
      showBrowserMenu();
    }
  });
  ui.closeHistory.addEventListener('click', closeHistory);
  ui.historyClear.addEventListener('click', async () => {
    if (!window.confirm('Delete all BrowsMe browsing history?')) {
      return;
    }
    await window.browsme.historyClear().catch((error) => showToast(error.message, 'danger'));
    void loadHistory();
  });
  ui.historySearch.addEventListener('input', () => {
    clearTimeout(findDebounce);
    findDebounce = setTimeout(() => void loadHistory(), 140);
  });
  ui.readingAdd.addEventListener('click', async () => {
    try {
      state.settings = { ...state.settings, ...(await window.browsme.toggleReadingItem()) };
      renderReadingList();
      showToast('Reading list updated.');
    } catch (error) {
      showToast(error.message, 'danger');
    }
  });
  ui.readingPopover.querySelector('[data-close-popover]')
    .addEventListener('click', () => toggleReadingPopover(false));
  ui.clearData.addEventListener('click', () => void clearBrowsingDataAction());

  ui.aiToggle.addEventListener('click', () => setAiPanelOpen(!state.settings.aiPanelOpen));
  ui.collapseAi.addEventListener('click', () => setAiPanelOpen(false));
  ui.sendAgent.addEventListener('click', () => {
    if (state.agentRunning) {
      void requestAgentStop();
    } else {
      void runAgentPrompt(ui.agentInput.value);
    }
  });
  ui.stopAgentTop.addEventListener('click', () => {
    void requestAgentStop();
  });
  ui.toolbarStopAgent.addEventListener('click', () => void requestAgentStop());
  ui.agentInput.addEventListener('input', resizeComposer);
  ui.agentInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void runAgentPrompt(ui.agentInput.value);
    }
  });
  ui.suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-prompt]');
    if (!button) return;
    ui.agentInput.value = button.dataset.prompt;
    resizeComposer();
    ui.agentInput.focus();
  });
  ui.clearAgent.addEventListener('click', () => {
    void clearTerminal();
  });

  ui.downloadsButton.addEventListener('click', () => toggleDownloads());
  ui.downloadsPopover.querySelector('[data-close-popover]').addEventListener('click', () => toggleDownloads(false));
  ui.settingsButton.addEventListener('click', openSettings);
  ui.closeSettings.addEventListener('click', closeSettings);
  ui.cancelSettings.addEventListener('click', closeSettings);
  ui.saveSettings.addEventListener('click', () => void saveSettings());
  ui.toggleKey.addEventListener('click', () => {
    const show = ui.apiKey.type === 'password';
    ui.apiKey.type = show ? 'text' : 'password';
    ui.toggleKey.textContent = show ? 'Hide' : 'Show';
  });
  ui.clearKey.addEventListener('click', () => {
    state.clearKeyRequested = true;
    ui.apiKey.value = '';
    ui.apiKeyStatus.textContent = 'Key will be removed when you save';
  });
  ui.denyDecision.addEventListener('click', () => void resolveDecision(false));
  ui.allowDecision.addEventListener('click', () => void resolveDecision(true));

  for (const button of document.querySelectorAll('[data-window-action]')) {
    button.addEventListener('click', () => {
      window.browsme.windowAction(button.dataset.windowAction).catch((error) => showToast(error.message, 'danger'));
    });
  }

  ui.splitter.addEventListener('pointerdown', (event) => {
    if (state.settings.aiPanelOpen === false) return;
    state.panelDragging = true;
    ui.splitter.classList.add('is-dragging');
    ui.splitter.setPointerCapture(event.pointerId);
  });
  ui.splitter.addEventListener('pointermove', (event) => {
    if (!state.panelDragging) return;
    state.settings.aiPanelWidth = Math.max(300, Math.min(620, window.innerWidth - event.clientX));
    ui.aiPanel.style.width = `${state.settings.aiPanelWidth}px`;
    reportViewport();
  });
  ui.splitter.addEventListener('pointerup', (event) => {
    if (!state.panelDragging) return;
    state.panelDragging = false;
    ui.splitter.classList.remove('is-dragging');
    ui.splitter.releasePointerCapture(event.pointerId);
    window.browsme.saveSettings({ aiPanelWidth: state.settings.aiPanelWidth })
      .catch((error) => showToast(error.message, 'danger'));
  });
  ui.splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 20 : -20;
    state.settings.aiPanelWidth = Math.max(300, Math.min(620, state.settings.aiPanelWidth + delta));
    applyPanelState(true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (openContextMenu) {
        closeContextMenu();
      } else if (!ui.decisionOverlay.hidden && currentDecision) {
        event.preventDefault();
        void resolveDecision(false);
      } else if (!ui.historyOverlay.hidden) {
        closeHistory();
      } else if (!ui.settingsOverlay.hidden) {
        closeSettings();
      } else if (!ui.downloadsPopover.hidden) {
        toggleDownloads(false);
      } else if (!ui.readingPopover.hidden) {
        toggleReadingPopover(false);
      } else if (state.findOpen) {
        closeFind();
      }
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (openContextMenu && !openContextMenu.contains(event.target)) {
      closeContextMenu();
    }
  });
  window.addEventListener('blur', closeContextMenu);

  new ResizeObserver(reportViewport).observe(ui.pageViewport);
  window.addEventListener('resize', reportViewport);
}

async function initialize() {
  bindEvents();
  window.browsme.onBrowserState(renderBrowser);
  window.browsme.onAgentEvent(onAgentEvent);
  window.browsme.onApprovalRequest((payload) => {
    setAgentPhase('approval');
    enqueueDecision({ type: 'approval', payload });
  });
  window.browsme.onPermissionRequest((payload) => {
    enqueueDecision({
      type: 'permission',
      payload: {
        ...payload,
        title: `Allow ${payload.permission}?`,
        description: `${payload.origin} wants permission to use ${payload.permission}.`,
        confirmLabel: 'Allow once'
      }
    });
  });
  window.browsme.onDownloadsState(onDownloadsState);
  window.browsme.onFindResult(updateFindCount);
  window.browsme.onToast((payload) => showToast(payload.message, payload.tone));
  window.browsme.onCommand((payload) => {
    const { command } = payload || {};
    if (command === 'focus-address') {
      ui.address.focus();
      ui.address.select();
    } else if (command === 'toggle-ai') {
      setAiPanelOpen(!state.settings.aiPanelOpen);
    } else if (command === 'show-downloads') {
      toggleDownloads(true);
    } else if (command === 'open-find') {
      openFind();
    } else if (command === 'open-history') {
      openHistory();
    } else if (command === 'bookmark-active') {
      void bookmarkActive();
    } else if (command === 'toggle-bookmarks-bar') {
      void toggleBookmarksBar();
    } else if (command === 'cancel-agent-decisions') {
      decisionQueue.splice(0, decisionQueue.length, ...decisionQueue.filter((item) => item.type !== 'approval'));
      if (currentDecision?.type === 'approval') {
        currentDecision = null;
        ui.decisionOverlay.hidden = true;
        if (ui.settingsOverlay.hidden) {
          document.querySelector('.browser-header').inert = false;
          ui.workspace.inert = false;
        }
        focusBeforeOverlay?.focus?.();
        focusBeforeOverlay = null;
        reportViewport();
        showNextDecision();
      }
    } else if (command === 'cancel-decision') {
      const id = String(payload?.id || '');
      const remaining = decisionQueue.filter((item) => String(item.payload?.id || '') !== id);
      decisionQueue.splice(0, decisionQueue.length, ...remaining);
      if (String(currentDecision?.payload?.id || '') === id) {
        currentDecision = null;
        ui.decisionOverlay.hidden = true;
        if (ui.settingsOverlay.hidden) {
          document.querySelector('.browser-header').inert = false;
          ui.workspace.inert = false;
        }
        focusBeforeOverlay?.focus?.();
        focusBeforeOverlay = null;
        reportViewport();
        showNextDecision();
      }
    }
  });

  try {
    const initial = await window.browsme.getInitialState();
    state.downloads = initial.downloads || [];
    state.memory = initial.memory || null;
    renderBrowser(initial);
    renderDownloads();
    if (state.memory && (state.memory.conversationMessages > 0 || state.memory.rememberedFacts > 0)) {
      appendSystemNote(
        `Persistent memory loaded · ${state.memory.conversationMessages} conversation messages · ${state.memory.rememberedFacts} remembered facts`
      );
    }
    reportViewport();
  } catch (error) {
    showToast(`BrowsMe could not initialize: ${error.message}`, 'danger');
  }
}

void initialize();
