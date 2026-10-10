'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const {
  atomicWriteFileSync,
  getBackupPath,
  readRecoverableFileSync
} = require('./atomic-store');

const EMPTY_MEMORY = Object.freeze({
  version: 1,
  conversation: [],
  facts: []
});

function normalizeMemory(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI memory data must be an object.');
  }
  return {
    version: 1,
    conversation: Array.isArray(parsed.conversation) ? parsed.conversation.slice(-120) : [],
    facts: Array.isArray(parsed.facts) ? parsed.facts.slice(-100) : []
  };
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
    // Missing, corrupt, or temporarily inaccessible backups stay untouched.
  }
}

class MemoryStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'ai-memory.dat');
    this.loadedPlaintext = false;
    this.data = this.read();
    if (this.loadedPlaintext && safeStorage.isEncryptionAvailable()) {
      try {
        this.persist();
      } catch {
        // A later successful write can complete the migration.
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
          // Encrypted backups can safely repair the primary immediately.
          // Legacy plaintext is migrated by persist() after the read succeeds.
          repairPrimary: (raw) => raw.subarray(0, 4).toString('utf8') === 'BME1'
        }
      );
    } catch {
      return { ...EMPTY_MEMORY, conversation: [], facts: [] };
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

  getConversation(limit = 20) {
    return this.data.conversation.slice(-Math.max(1, Math.min(60, limit))).map((entry) => ({
      role: entry.role,
      content: entry.content
    }));
  }

  appendConversation(userContent, assistantContent) {
    const timestamp = new Date().toISOString();
    this.data.conversation.push(
      {
        role: 'user',
        content: String(userContent || '').slice(0, 12000),
        timestamp
      },
      {
        role: 'assistant',
        content: String(assistantContent || '').slice(0, 12000),
        timestamp
      }
    );
    this.data.conversation = this.data.conversation.slice(-120);
    this.persist();
  }

  clearConversation() {
    this.data.conversation = [];
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
    this.data.facts = this.data.facts.slice(-100);
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
    return {
      conversationMessages: this.data.conversation.length,
      rememberedFacts: this.data.facts.length,
      encrypted: safeStorage.isEncryptionAvailable(),
      persistent: safeStorage.isEncryptionAvailable()
    };
  }
}

module.exports = { EMPTY_MEMORY, MemoryStore };
