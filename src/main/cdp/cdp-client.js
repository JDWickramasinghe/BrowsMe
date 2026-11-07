'use strict';

// Minimal Chrome DevTools Protocol client over a WebSocket, using Node's global
// WebSocket (Node >= 22). No third-party dependency. Supports both top-level calls
// and flattened per-target sessions (pass a sessionId).

const { EventEmitter } = require('node:events');

class CdpClient extends EventEmitter {
  constructor(webSocketDebuggerUrl) {
    super();
    this.url = webSocketDebuggerUrl;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let socket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        reject(error);
        return;
      }
      this.socket = socket;

      const onOpen = () => {
        socket.removeEventListener('error', onError);
        resolve(this);
      };
      const onError = () => {
        socket.removeEventListener('open', onOpen);
        reject(new Error('CDP_CONNECT_FAILED'));
      };

      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onError, { once: true });
      socket.addEventListener('message', (event) => this._onMessage(event));
      socket.addEventListener('close', () => {
        this.closed = true;
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(new Error('CDP_CLOSED'));
        }
        this.pending.clear();
        this.emit('disconnected');
      });
    });
  }

  _onMessage(event) {
    let message;
    try {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString();
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message || 'CDP_ERROR'} (${message.error.code ?? '?'})`));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (message.method) {
      // Emit by method name, e.g. client.on('Page.screencastFrame', (params, sessionId) => ...)
      this.emit(message.method, message.params || {}, message.sessionId);
      this.emit('event', message);
    }
  }

  send(method, params = {}, sessionId) {
    if (this.closed || !this.socket) {
      return Promise.reject(new Error('CDP_CLOSED'));
    }
    const id = ++this.nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    this.closed = true;
    try {
      if (this.socket) this.socket.close();
    } catch {
      // already closing
    }
  }
}

module.exports = { CdpClient };
