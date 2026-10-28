export function isServed() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

export function normalizeServer(input) {
  let s = String(input || '').trim();
  if (!s) return isServed() ? location.origin : '';
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?/.test(s) ? 'http://' : 'https://') + s;
  return s.replace(/\/+$/, '');
}

export async function api(base, path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(base + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Server nicht erreichbar.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Fehler ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export class NetClient {
  constructor(base) {
    this.base = base;
    this.handlers = new Map();
    this.ws = null;
    this.rtt = 0;
    this.closedByUser = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, msg) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) fn(msg);
  }

  connect(hello) {
    return new Promise((resolve, reject) => {
      const url = this.base.replace(/^http/, 'ws') + '/ws';
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(new Error('Verbindung fehlgeschlagen.'));
        return;
      }
      this.ws = ws;
      let welcomed = false;
      const timeout = setTimeout(() => {
        if (!welcomed) {
          ws.close();
          reject(new Error('Server antwortet nicht.'));
        }
      }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...hello }));
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.t === 'welcome' && !welcomed) {
          welcomed = true;
          clearTimeout(timeout);
          this.id = m.id;
          this.startPing();
          resolve(m);
        }
        if (m.t === 'error' && !welcomed) {
          clearTimeout(timeout);
          reject(new Error(m.text));
          return;
        }
        if (m.t === 'pong') {
          this.rtt = performance.now() - m.t0;
          return;
        }
        this.emit(m.t, m);
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        clearInterval(this.pingTimer);
        if (!welcomed) reject(new Error('Verbindung fehlgeschlagen.'));
        else if (!this.closedByUser) this.emit('disconnect', {});
      };
      ws.onerror = () => {};
    });
  }

  startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: 'ping', t0: performance.now(), rtt: this.rtt }), 2000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closedByUser = true;
    clearInterval(this.pingTimer);
    if (this.ws) this.ws.close();
  }
}
