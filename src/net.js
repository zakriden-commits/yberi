export function connect(token, serverUrl) {
  let base = serverUrl || localStorage.getItem('di_server') || '';
  if (!base) base = location.origin;
  base = base.replace(/\/$/, '').replace(/^http/, 'ws');
  const ws = new WebSocket(`${base}/game`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token }));
  return ws;
}
export function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
