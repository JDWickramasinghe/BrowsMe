'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const {
  atomicWriteFileSync,
  getBackupPath,
  readRecoverableFileSync
} = require('./atomic-store');

const MAX_MESSAGES_PER_SESSION = 120;
const MAX_SESSIONS = 200;
const MAX_FACTS = 100;

const EMPTY_MEMORY = Object.freeze({
  version: 2,
  activeSessionId: '',
  sessions: [],
  facts: []
});

function deriveTitle(conversation) {
  const firstUser = (conversation || []).find((entry) => entry && entry.role === 'user');
  const text = String(firstUser?.content || '').trim().replace(/\s+/g, ' ');
  return (text ? text.slice(0, 60) : 'New chat') || 'New chat';
}

function normalizeSession(session) {
  const conversation = Array.isArray(session?.conversation)
    ? session.conversation
      .filter((e) => e && (e.role === 'user' || e.role === 'assistant') && typeof e.content === 'string')
      .slice(-MAX_MESSAGES_PER_SESSION)
    : [];
  const createdAt = session?.createdAt || new Date().toISOString();
  return {
    id: typeof session?.id === 'string' && session.id ? session.id : crypto.randomUUID(),
    title: String(session?.title || deriveTitle(conversation)).slice(0, 120) || 'New chat',
    createdAt,
    updatedAt: session?.updatedAt || createdAt,
    conversation
  };
}

function normalizeMemory(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI memory data must be an object.');
  }
  const facts = Array.isArray(parsed.facts) ? parsed.facts.slice(-MAX_FACTS) : [];
  let sessions;
  if (Array.isArray(parsed.sessions)) {
    sessions = parsed.sessions.slice(-MAX_SESSIONS).map(normalizeSession);
  } else if (Array.isArray(parsed.conversation) && parsed.conversation.length) {

    sessions = [normalizeSession({
      title: deriveTitle(parsed.conversation),
      conversation: parsed.conversation,
      createdAt: parsed.conversation[0]?.timestamp
    })];
  } else {
    sessions = [];
  }
  let activeSessionId = typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : '';
  if (!sessions.some((s) => s.id === activeSessionId)) {
    activeSessionId = sessions[0]?.id || '';
  }
  return { version: 2, activeSessionId, sessions, facts };
}

function decodeMemory(raw) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure AI memory storage is unavailable.');
  }

  const encrypted = raw.subarray(0, 4).toString('utf8') === 'BME1';
  const json = encrypted
    ? safeStorage.decryptString(raw.subarray(4))
    : raw.toString('utf8');
  return {
    data: normalizeMemory(JSON.parse(json)),
    encrypted
  };
}

function encodeMemory(data) {
  return Buffer.concat([
    Buffer.from('BME1'),
    safeStorage.encryptString(JSON.stringify(data))
  ]);
}

function migrateLegacyBackup(filePath) {
  try {
    const backupPath = getBackupPath(filePath);
    const raw = fs.readFileSync(backupPath);
    const decoded = decodeMemory(raw);
    if (!decoded.encrypted) {
      atomicWriteFileSync(backupPath, encodeMemory(decoded.data), {
        mode: 0o600,
        backup: false
      });
    }
  } catch {

  }
}

class MemoryStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'ai-memory.dat');
    this.loadedPlaintext = false;
    this.data = this.read();
    this.ensureActiveSession();
    if (this.loadedPlaintext && safeStorage.isEncryptionAvailable()) {
      try {
        this.persist();
      } catch {

      }
    } else if (safeStorage.isEncryptionAvailable()) {
      migrateLegacyBackup(this.filePath);
    }
  }

  read() {
    try {
      return readRecoverableFileSync(
        this.filePath,
        (raw) => {
          const decoded = decodeMemory(raw);
          this.loadedPlaintext = !decoded.encrypted;
          return decoded.data;
        },
        {
          repairPrimary: (raw) => raw.subarray(0, 4).toString('utf8') === 'BME1'
        }
      );
    } catch {
      return { version: 2, activeSessionId: '', sessions: [], facts: [] };
    }
  }

  persist() {
    if (!safeStorage.isEncryptionAvailable()) {
      return false;
    }
    atomicWriteFileSync(this.filePath, encodeMemory(this.data), {
      mode: 0o600,
      validateExisting: (raw) => decodeMemory(raw),
      transformBackup: (raw) => encodeMemory(decodeMemory(raw).data)
    });
    this.loadedPlaintext = false;
    return true;
  }

  ensureActiveSession() {
    if (!this.data.sessions.length) {
      const session = normalizeSession({ title: 'New chat' });
      this.data.sessions.push(session);
      this.data.activeSessionId = session.id;
      return session;
    }
    if (!this.data.sessions.some((s) => s.id === this.data.activeSessionId)) {
      this.data.activeSessionId = this.data.sessions[0].id;
    }
    return this.data.sessions.find((s) => s.id === this.data.activeSessionId);
  }

  activeSession() {
    return this.ensureActiveSession();
  }

  getActiveSessionId() {
    return this.ensureActiveSession().id;
  }

  listSessions() {
    return this.data.sessions
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.conversation.length,
        active: s.id === this.data.activeSessionId
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  createSession(title) {
    const session = normalizeSession({ title: title || 'New chat' });
    this.data.sessions.push(session);
    this.data.sessions = this.data.sessions.slice(-MAX_SESSIONS);
    this.data.activeSessionId = session.id;
    this.persist();
    return { id: session.id, title: session.title };
  }

  switchSession(id) {
    if (this.data.sessions.some((s) => s.id === id)) {
      this.data.activeSessionId = id;
      this.persist();
    }
    return this.getActiveSessionId();
  }

  renameSession(id, title) {
    const session = this.data.sessions.find((s) => s.id === id);
    if (!session) {
      return false;
    }
    session.title = String(title || '').trim().slice(0, 120) || session.title;
    session.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  deleteSession(id) {
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    if (this.data.sessions.length === before) {
      return false;
    }
    if (this.data.activeSessionId === id) {
      this.data.activeSessionId = this.data.sessions[0]?.id || '';
    }
    this.ensureActiveSession();
    this.persist();
    return true;
  }

  getSessionMessages(id) {
    const session = id
      ? this.data.sessions.find((s) => s.id === id)
      : this.activeSession();
    if (!session) {
      return [];
    }
    return session.conversation.map((entry) => ({
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp || session.updatedAt
    }));
  }

  exportSession(id) {
    const session = id
      ? this.data.sessions.find((s) => s.id === id)
      : this.activeSession();
    if (!session) {
      return '';
    }
    const lines = [`# ${session.title}`, '', `_Exported ${new Date().toISOString()}_`, ''];
    for (const entry of session.conversation) {
      lines.push(entry.role === 'user' ? '**You**' : '**BrowsMe**', '', entry.content, '');
    }
    return lines.join('\n');
  }

  getConversation(limit = 20) {
    const session = this.activeSession();
    return session.conversation
      .slice(-Math.max(1, Math.min(60, limit)))
      .map((entry) => ({ role: entry.role, content: entry.content }));
  }

  appendConversation(userContent, assistantContent) {
    const session = this.ensureActiveSession();
    const timestamp = new Date().toISOString();
    const user = String(userContent || '').slice(0, 12000);
    session.conversation.push(
      { role: 'user', content: user, timestamp },
      { role: 'assistant', content: String(assistantContent || '').slice(0, 12000), timestamp }
    );
    session.conversation = session.conversation.slice(-MAX_MESSAGES_PER_SESSION);
    session.updatedAt = timestamp;

    if ((!session.title || session.title === 'New chat') && user.trim()) {
      session.title = user.trim().replace(/\s+/g, ' ').slice(0, 60);
    }
    this.persist();
  }

  clearConversation() {
    const session = this.activeSession();
    session.conversation = [];
    session.updatedAt = new Date().toISOString();
    this.persist();
  }

  listFacts() {
    return this.data.facts.map((fact) => ({ ...fact }));
  }

  remember(key, value) {
    const normalizedKey = String(key || '').trim().slice(0, 100);
    const normalizedValue = String(value || '').trim().slice(0, 2000);
    if (!normalizedKey || !normalizedValue) {
      throw new Error('A memory needs both a key and a value.');
    }

    const existing = this.data.facts.find((fact) => fact.key.toLowerCase() === normalizedKey.toLowerCase());
    if (existing) {
      existing.key = normalizedKey;
      existing.value = normalizedValue;
      existing.updatedAt = new Date().toISOString();
    } else {
      this.data.facts.push({
        key: normalizedKey,
        value: normalizedValue,
        updatedAt: new Date().toISOString()
      });
    }
    this.data.facts = this.data.facts.slice(-MAX_FACTS);
    this.persist();
    return { key: normalizedKey, value: normalizedValue };
  }

  forget(key) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const previousLength = this.data.facts.length;
    this.data.facts = this.data.facts.filter((fact) => fact.key.toLowerCase() !== normalizedKey);
    const removed = this.data.facts.length !== previousLength;
    if (removed) {
      this.persist();
    }
    return removed;
  }

  getStatus() {
    const session = this.activeSession();
    return {
      conversationMessages: session.conversation.length,
      rememberedFacts: this.data.facts.length,
      sessionCount: this.data.sessions.length,
      activeSessionId: this.data.activeSessionId,
      encrypted: safeStorage.isEncryptionAvailable(),
      persistent: safeStorage.isEncryptionAvailable()
    };
  }
}

module.exports = { EMPTY_MEMORY, MemoryStore };
