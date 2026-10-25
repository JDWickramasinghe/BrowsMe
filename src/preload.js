'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('browsme', Object.freeze({
  getInitialState: () => ipcRenderer.invoke('browser:get-initial-state'),
  setViewportBounds: (bounds) => ipcRenderer.send('browser:set-viewport-bounds', bounds),
  navigate: (input) => ipcRenderer.invoke('browser:navigate', input),
  navigationAction: (input) => ipcRenderer.invoke('browser:navigation-action', input),
  newTab: (input) => ipcRenderer.invoke('tabs:new', input),
  activateTab: (tabId) => ipcRenderer.invoke('tabs:activate', { tabId }),
  closeTab: (tabId) => ipcRenderer.invoke('tabs:close', { tabId }),
  reopenTab: () => ipcRenderer.invoke('tabs:reopen'),
  duplicateTab: (tabId) => ipcRenderer.invoke('tabs:duplicate', { tabId }),
  muteTab: (tabId) => ipcRenderer.invoke('tabs:mute', { tabId }),
  closeOtherTabs: (tabId) => ipcRenderer.invoke('tabs:close-others', { tabId }),
  findInPage: (input) => ipcRenderer.invoke('page:find', input),
  stopFind: (input) => ipcRenderer.invoke('page:find-stop', input || {}),
  zoomPage: (mode) => ipcRenderer.invoke('page:zoom', { mode }),
  printPage: () => ipcRenderer.invoke('page:print'),
  toggleBookmark: () => ipcRenderer.invoke('bookmarks:toggle-active'),
  toggleBookmarkUrl: (input) => ipcRenderer.invoke('bookmarks:toggle', input),
  toggleReadingItem: () => ipcRenderer.invoke('readinglist:toggle-active'),
  toggleReadingItemUrl: (input) => ipcRenderer.invoke('readinglist:toggle', input),
  historyList: (input) => ipcRenderer.invoke('history:list', input || {}),
  historyRemove: (url) => ipcRenderer.invoke('history:remove', { url }),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  clearBrowsingData: (input) => ipcRenderer.invoke('data:clear', input || {}),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  runAgent: (input) => ipcRenderer.invoke('agent:run', input),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  clearAgent: () => ipcRenderer.invoke('agent:clear'),
  chatList: () => ipcRenderer.invoke('chat:list'),
  chatMessages: (id) => ipcRenderer.invoke('chat:messages', { id }),
  chatNew: () => ipcRenderer.invoke('chat:new'),
  chatSwitch: (id) => ipcRenderer.invoke('chat:switch', { id }),
  chatRename: (id, title) => ipcRenderer.invoke('chat:rename', { id, title }),
  chatDelete: (id) => ipcRenderer.invoke('chat:delete', { id }),
  chatExport: (id) => ipcRenderer.invoke('chat:export', { id }),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', { text }),
  resolveApproval: (input) => ipcRenderer.invoke('approval:resolve', input),
  resolvePermission: (input) => ipcRenderer.invoke('permission:resolve', input),
  resolveAuthentication: (input) => ipcRenderer.invoke('authentication:resolve', input),
  openExternal: (url) => ipcRenderer.invoke('window:open-external', { url }),
  openAuthenticationInSystemBrowser: (tabId) => ipcRenderer.invoke('window:open-external', { tabId }),
  decideDownload: (input) => ipcRenderer.invoke('download:decide', input),
  revealDownload: (downloadId) => ipcRenderer.invoke('download:reveal', { downloadId }),
  windowAction: (action) => ipcRenderer.invoke('window:action', { action }),
  showPageContextMenu: () => ipcRenderer.invoke('browser:show-page-menu'),
  onBrowserState: (callback) => on('browser:state', callback),
  onAgentEvent: (callback) => on('agent:event', callback),
  onApprovalRequest: (callback) => on('approval:request', callback),
  onPermissionRequest: (callback) => on('permission:request', callback),
  onAuthenticationRequest: (callback) => on('authentication:request', callback),
  onDownloadsState: (callback) => on('downloads:state', callback),
  onToast: (callback) => on('ui:toast', callback),
  onCommand: (callback) => on('ui:command', callback),
  onFindResult: (callback) => on('page:find-result', callback)
}));
