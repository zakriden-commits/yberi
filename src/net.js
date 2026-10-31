import { Capacitor } from '@capacitor/core';

export function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
const trim = s => String(s || '').replace(/\/$/, '');
function httpBase(url) {
  const u = new URL(url);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) throw new Error('Неверный адрес игрового сервера');
  u.protocol = ['ws:', 'wss:'].includes(u.protocol) ? (u.protocol === 'ws:' ? 'http:' : 'https:') : u.protocol;
  u.pathname = u.pathname.replace(/\/$/, ''); u.search = ''; u.hash = '';
  return trim(u.toString());
}
const wsBase = http => http.replace(/^http/, 'ws');
export function isNative() { return Capacitor.isNativePlatform() || !!window.Capacitor?.isNativePlatform?.() || location.protocol === 'capacitor:'; }

export async function getServerEndpoints() {
  let http = location.origin;
  if (isNative()) {
    const res = await fetchJson('/server-config.json', 5000);
    if (!res.serverUrl) throw new Error('В APK не задан адрес игрового сервера');
    http = httpBase(res.serverUrl);
  }
  http = httpBase(http);
  return { http, ws: wsBase(http) };
}
export async function getServerBase() { return (await getServerEndpoints()).ws; }

async function fetchJson(url, timeout = 7000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Обёртка нужна, чтобы не потерять welcome/события между открытием сокета и подключением обработчиков UI.
class SocketFacade {
  constructor(transport) { this.transport = transport; this.onmessage = null; this.onclose = null; this.onerror = null; this._buffer = []; this._ready = false; }
  get readyState() { return this.socket?.readyState ?? 0; }
  _deliver(ev) { if (this._ready && this.onmessage) this.onmessage(ev); else this._buffer.push(ev); }
  _handoff() { this._ready = true; const items = this._buffer.splice(0); queueMicrotask(() => { for (const ev of items) this.onmessage?.(ev); }); }
  send(raw) { this.socket.send(raw); }
  close() { this.socket.close(); }
}

class HttpGameSocket {
  constructor(http, session) {
    this.http = http; this.session = session; this.readyState = 1; this.transport = 'http';
    this.onmessage = null; this.onclose = null; this.onerror = null;
    this._buffer = []; this._ready = false; this._closed = false; this._pollAbort = null; this._input = null; this._inputTimer = null; this._pollErrors = 0;
    this._poll();
  }
  _deliver(msg) { const ev = { data: JSON.stringify(msg) }; if (this.onmessage) this.onmessage(ev); else this._buffer.push(ev); }
  _handoff() { this._ready = true; const items = this._buffer.splice(0); queueMicrotask(() => { for (const ev of items) this.onmessage?.(ev); }); }
  async _post(message) {
    if (this._closed) return;
    try { await fetchJson(`${this.http}/game/send`, 8000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: this.session, message }) }); }
    catch (e) { if (!this._closed) this.close(1006); }
  }
  send(raw) {
    if (this._closed) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'input') { this._input = msg; if (!this._inputTimer) this._inputTimer = setTimeout(() => { this._inputTimer = null; const m = this._input; this._input = null; if (m) this._post(m); }, 50); return; }
    if (this._input) { const m = this._input; this._input = null; this._post(m); }
    this._post(msg);
  }
  async _poll() {
    while (!this._closed) {
      this._pollAbort = new AbortController();
      const timer = setTimeout(() => this._pollAbort?.abort(), 25000);
      try {
        const res = await fetch(`${this.http}/game/poll?session=${encodeURIComponent(this.session)}`, { cache: 'no-store', signal: this._pollAbort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); this._pollErrors = 0;
        for (const msg of data.messages || []) this._deliver(msg);
      } catch {
        if (this._closed) break;
        if (++this._pollErrors >= 3) { this.close(1006); break; }
        await new Promise(r => setTimeout(r, 600));
      } finally { clearTimeout(timer); }
    }
  }
  close(code = 1000) {
    if (this._closed) return;
    this._closed = true; this.readyState = 3; this._pollAbort?.abort(); clearTimeout(this._inputTimer);
    fetch(`${this.http}/game/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: this.session }), keepalive: true }).catch(() => {});
    this.onclose?.({ code });
  }
}

function tryWebSocket(endpoints, token, onStatus) {
  return new Promise((resolve, reject) => {
    onStatus('Подключение к игровому серверу…');
    let raw; try { raw = new WebSocket(`${endpoints.ws}/game`); } catch (e) { reject(e); return; }
    const facade = new SocketFacade('ws'); facade.socket = raw;
    let settled = false;
    const finish = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); if (err) { try { raw.close(); } catch {} reject(err); } else resolve(value); };
    const timer = setTimeout(() => finish(new Error('WebSocket не ответил')), 4500);
    raw.onopen = () => raw.send(JSON.stringify({ type: 'join', token, protocol: 2 }));
    raw.onerror = () => { if (!settled) finish(new Error('WebSocket недоступен')); };
    raw.onclose = e => { if (!settled) finish(new Error(`WebSocket закрыт (${e.code})`)); else facade.onclose?.(e); };
    raw.onmessage = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (!settled && msg.type === 'full') { const e = new Error('Сервер заполнен'); e.code = 'FULL'; finish(e); return; }
      if (!settled && msg.type === 'welcome') { finish(null, { socket: facade, welcome: msg }); return; }
      facade._deliver(ev);
    };
  });
}

async function tryHttp(endpoints, token, onStatus) {
  onStatus('Проверка обычного HTTPS-соединения…');
  const { session } = await fetchJson(`${endpoints.http}/game/session`, 7000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const socket = new HttpGameSocket(endpoints.http, session);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; socket.close(); reject(new Error('HTTPS-сервер не ответил на вход')); } }, 9000);
    socket.onmessage = ev => {
      if (settled) return;
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'welcome' || msg.type === 'full') {
        settled = true; clearTimeout(timer); socket.onmessage = null;
        if (msg.type === 'full') { socket.close(); const e = new Error('Сервер заполнен'); e.code = 'FULL'; reject(e); }
        else resolve({ socket, welcome: msg });
      }
    };
    socket.onclose = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('HTTPS-соединение закрыто')); } };
    socket.send(JSON.stringify({ type: 'join', token, protocol: 2 }));
  });
}

let preferred = 'ws';
export async function openGame(token, onStatus = () => {}) {
  const endpoints = await getServerEndpoints();
  let wsError;
  const order = preferred === 'http' ? ['http', 'ws'] : ['ws', 'http'];
  for (const kind of order) {
    try {
      const result = kind === 'ws' ? await tryWebSocket(endpoints, token, onStatus) : await tryHttp(endpoints, token, onStatus);
      preferred = kind; return result;
    } catch (e) {
      if (e.code === 'FULL') throw e;
      if (kind === 'ws') wsError = e;
      else { const err = new Error(`Игровой сервер недоступен: ${e.message}. Wi‑Fi подключён, но сервер не ответил.`); err.cause = wsError || e; throw err; }
    }
  }
  throw wsError || new Error('Нет соединения');
}

// Совместимость со старыми тестами.
export function connect(token, base) { const ws = new WebSocket(`${trim(base)}/game`); ws.addEventListener('open', () => send(ws, { type: 'join', token })); return ws; }
