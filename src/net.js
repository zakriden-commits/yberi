import { Capacitor } from '@capacitor/core';

export function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function normalize(url) {
  const u = new URL(url);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) throw new Error('Неверный адрес сервера');
  u.protocol = u.protocol === 'http:' ? 'ws:' : u.protocol === 'https:' ? 'wss:' : u.protocol;
  u.pathname = u.pathname.replace(/\/$/, '');
  u.search = ''; u.hash = '';
  return u.toString().replace(/\/$/, '');
}

// Один общий сервер. В браузере это тот же хост, откуда открыта игра.
// В APK адрес берётся из server-config.json, который задаётся при сборке.
export async function getServerBase() {
  if (!Capacitor.isNativePlatform()) return normalize(location.origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('/server-config.json', { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error('config');
    const cfg = await res.json();
    if (!cfg.serverUrl) throw new Error('empty');
    return normalize(cfg.serverUrl);
  } catch {
    throw new Error('В сборке APK не задан игровой сервер. Нужна новая сборка с адресом сервера.');
  } finally { clearTimeout(timer); }
}

export function connect(token, base) {
  const ws = new WebSocket(`${base}/game`);
  ws.addEventListener('open', () => send(ws, { type: 'join', token }));
  return ws;
}
