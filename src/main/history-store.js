'use strict';

const path = require('node:path');
const {
  atomicWriteFileSync,
  readRecoverableFileSync
} = require('./atomic-store');

const MAX_ENTRIES = 5000;

function parseHistory(bytes) {
  const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!value || typeof value !== 'object' || !Array.isArray(value.entries)) {
    throw new Error('History data must be an object with an entries array.');
  }
  return value;
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const url = String(entry.url || '');
  if (!/^https?:\/\//i.test(url) || url.length > 4000) {
    return null;
  }
  return {
    url,
    title: String(entry.title || url).slice(0, 300),
    at: Number.isFinite(entry.at) ? entry.at : Date.now()
  };
}

class HistoryStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'history.json');
    this.saveTimer = null;
    try {
      const value = readRecoverableFileSync(this.filePath, parseHistory);
      this.entries = Array.isArray(value.entries)
        ? value.entries.map(sanitizeEntry).filter(Boolean).slice(0, MAX_ENTRIES)
        : [];
    } catch {
      this.entries = [];
    }
  }

  record(visit) {
    const entry = sanitizeEntry({ ...visit, at: visit && visit.at });
    if (!entry) {
      return false;
    }
    const top = this.entries[0];
    if (top && top.url === entry.url && entry.at - top.at < 60000) {
      // A reload or late title update for the same page: refresh in place.
      if (visit.title) {
        top.title = entry.title;
      }
      top.at = entry.at;
    } else {
      this.entries.unshift(entry);
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.length = MAX_ENTRIES;
      }
    }
    this.scheduleSave();
    return true;
  }

  list(options = {}) {
    const query = String(options.query || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(2000, Number(options.limit) || 300));
    const matched = query
      ? this.entries.filter(
          (entry) =>
            entry.url.toLowerCase().includes(query) ||
            entry.title.toLowerCase().includes(query)
        )
      : this.entries;
    return matched.slice(0, limit);
  }

  remove(url) {
    const target = String(url || '');
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.url !== target);
    const removed = before - this.entries.length;
    if (removed > 0) {
      this.scheduleSave();
    }
    return removed;
  }

  clear() {
    this.entries = [];
    this.scheduleSave();
  }

  getStatus() {
    return { count: this.entries.length };
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 800);
    this.saveTimer.unref?.();
  }

  persist() {
    try {
      atomicWriteFileSync(
        this.filePath,
        JSON.stringify({ entries: this.entries }),
        { mode: 0o600, validateExisting: parseHistory }
      );
    } catch {
      // Browsing history persistence is best-effort and non-fatal.
    }
  }
}

module.exports = { HistoryStore, MAX_ENTRIES };
