import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import sirv from 'sirv';
import { ROOM_SIZE, TICK_MS, SNAPSHOT_MS, HOUSE, BANK, SHOP, TRUCK, CASH_POINTS, WARDROBES, BEDS, PRICES, AMMO_PACK, WEAPONS, STORAGE_SIZE, HOTBAR_SIZE, inZone, dist2 } from './src/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVE_PATH = path.join(__dirname, 'data', 'save.json');
const PORT = Number(process.env.PORT || 3000);
const DEV = process.env.NODE_ENV !== 'production';

let save = { profiles: {}, storage: [] };
try { save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')); } catch {}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(SAVE_PATH), { recursive: true });
    fs.writeFileSync(SAVE_PATH, JSON.stringify(save));
  }, 400);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function defaultInventory() { return [{ uid: uid(), type: 'fists' }]; }
function cleanInventory(inv) {
  const out = [{ uid: uid(), type: 'fists' }];
  for (const it of (inv || []).slice(1, HOTBAR_SIZE)) if (it && it.type) out.push({ ...it, uid: it.uid || uid() });
  return out;
}

const players = new Map();
const slots = [null, null];
let houseDoorOpen = true;
let alarm = false;
let alarmUntil = 0;
let job = { state: 'idle', playerId: null, crate: null, nextOffer: Date.now() + 15000 };
const npcs = [];
const guards = [];
const police = [];
let lastSnapshot = 0;

function makeNPC(kind, x, z) {
  return { id: uid(), kind, x, z, yaw: Math.random() * 6.28, tx: x, tz: z, speed: kind === 'elderly' ? 0.8 : 1.3, state: 'walk', look: 0, health: 40 };
}
for (let i = 0; i < 12; i++) {
  const kind = ['normal', 'normal', 'elderly', 'bad'][i % 4];
  npcs.push(makeNPC(kind, -30 + i * 5, 12 + (i % 2) * 5));
}
const foreman = { id: 'foreman', kind: 'foreman', x: 0, z: 20, yaw: 0, tx: 0, tz: 20, state: 'idle' };
guards.push({ id: uid(), x: 18, z: 25, yaw: 0, tx: 18, tz: 33, health: 80, patrol: 0 });
guards.push({ id: uid(), x: 30, z: 33, yaw: 3, tx: 30, tz: 25, health: 80, patrol: 1 });
const cashier = { id: 'cashier', kind: 'cashier', x: 24, z: 33, yaw: Math.PI, panic: false };

function send(ws, msg) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(msg) { for (const p of players.values()) send(p.ws, msg); }
function event(p, kind, data = {}) { send(p.ws, { type: 'event', kind, ...data }); }
function publicPlayer(p) {
  const item = p.inventory[p.selected];
  return { id: p.id, slot: p.slot, name: p.name, char: p.char, x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, health: p.health, stamina: p.stamina, wanted: p.wanted, selected: p.selected, weapon: item?.type || 'fists', carrying: p.carrying, spawnUntil: p.spawnUntil, steal: p.steal ? p.steal.progress : 0, balance: p.balance };
}
function snapshot() {
  return { type: 'snapshot', time: Date.now(), players: [...players.values()].map(publicPlayer), npcs: npcs.map(n => ({ id: n.id, kind: n.kind, x: n.x, z: n.z, yaw: n.yaw, state: n.state })), foreman: { x: foreman.x, z: foreman.z, yaw: foreman.yaw, state: foreman.state }, guards: guards.map(g => ({ id: g.id, x: g.x, z: g.z, yaw: g.yaw, health: g.health })), police: police.map(p => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, health: p.health })), cashier: { x: cashier.x, z: cashier.z, panic: cashier.panic }, doors: { house: houseDoorOpen }, alarm, job: { state: job.state, playerId: job.playerId, crate: job.crate } };
}
function addWanted(p, n) { p.wanted = Math.min(5, p.wanted + n); p.lastCrime = Date.now(); }
function triggerAlarm(reason) {
  if (!alarm) { alarm = true; alarmUntil = Date.now() + 60000; broadcast({ type: 'event', kind: 'alarm', reason }); }
  cashier.panic = true;
}
function saveProfile(p) {
  save.profiles[p.token] = { balance: p.balance, inventory: p.inventory, name: p.name };
  save.storage = save.storage;
  persist();
}
function addItem(p, item) {
  if (p.inventory.length >= HOTBAR_SIZE) { event(p, 'toast', { text: 'Инвентарь полон' }); return false; }
  p.inventory.push({ uid: uid(), ...item }); saveProfile(p); event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); return true;
}
function damagePlayer(p, amount, source) {
  if (p.health <= 0) return;
  p.health -= amount; p.lastDamage = Date.now();
  if (p.health <= 0) {
    p.health = 0; p.inventory = defaultInventory(); p.selected = 0; p.wanted = 0; p.carrying = null; p.steal = null;
    const bed = BEDS[p.slot]; p.x = bed.x; p.z = bed.z; p.spawnUntil = Date.now() + 2500;
    event(p, 'death', { by: source }); saveProfile(p);
    broadcast({ type: 'event', kind: 'toast', text: `${p.name} выбыл и вернулся домой` });
  }
}
function rayHit(ox, oy, oz, dx, dy, dz, target, radius) {
  const tx = target.x - ox, ty = (target.y || 1) - oy, tz = target.z - oz;
  const t = tx * dx + ty * dy + tz * dz;
  if (t < 0) return null;
  const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
  const d = Math.hypot(target.x - px, (target.y || 1) - py, target.z - pz);
  return d < radius ? t : null;
}
function shoot(p) {
  const item = p.inventory[p.selected];
  if (!item || !WEAPONS[item.type]) return;
  const w = WEAPONS[item.type];
  const now = Date.now();
  if (now - (p.lastShot || 0) < w.rate) return;
  if ((item.mag || 0) <= 0) { event(p, 'toast', { text: 'Пусто. Купите патроны или перезарядитесь.' }); return; }
  p.lastShot = now; item.mag--;
  const dx = Math.sin(p.yaw) * Math.cos(p.pitch), dy = -Math.sin(p.pitch), dz = Math.cos(p.yaw) * Math.cos(p.pitch);
  let best = null, bestT = w.range;
  const targets = [...npcs.map(n => ({ ...n, ref: n, kind: 'npc' })), ...guards.map(g => ({ ...g, ref: g, kind: 'guard' })), ...police.map(q => ({ ...q, ref: q, kind: 'police' }))];
  for (const t of targets) { const hit = rayHit(p.x, 1.65, p.z, dx, dy, dz, t, 0.7); if (hit !== null && hit < bestT) { best = t; bestT = hit; } }
  broadcast({ type: 'event', kind: 'shot', id: p.id, x: p.x, z: p.z, yaw: p.yaw });
  if (best) {
    best.ref.health -= w.damage;
    if (best.kind === 'npc') { addWanted(p, 1); best.ref.state = 'flee'; }
    if (best.kind === 'guard') { addWanted(p, 1); triggerAlarm('guard'); }
    if (best.kind === 'police') addWanted(p, 1);
    if (best.ref.health <= 0) {
      addWanted(p, 2);
      if (best.kind === 'npc') npcs.splice(npcs.indexOf(best.ref), 1);
      if (best.kind === 'guard') guards.splice(guards.indexOf(best.ref), 1);
      if (best.kind === 'police') police.splice(police.indexOf(best.ref), 1);
    }
  }
  if (inZone(p, BANK)) triggerAlarm('weapon');
  saveProfile(p);
}
function reload(p) {
  const item = p.inventory[p.selected];
  if (!item || !WEAPONS[item.type]) return;
  const ammo = p.inventory.find(i => i.type === 'ammo');
  const w = WEAPONS[item.type];
  if (!ammo || ammo.count <= 0) { event(p, 'toast', { text: 'Нет патронов. Купите патроны в магазине.' }); return; }
  const need = w.mag - (item.mag || 0);
  const take = Math.min(need, ammo.count);
  if (take <= 0) return;
  item.mag = (item.mag || 0) + take; ammo.count -= take;
  if (ammo.count <= 0) p.inventory = p.inventory.filter(i => i !== ammo);
  event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); saveProfile(p);
}
function nearestInteract(p) {
  if (dist2(p, HOUSE.door) < 2.5) return { type: 'houseDoor' };
  for (let i = 0; i < WARDROBES.length; i++) if (dist2(p, WARDROBES[i]) < 2) return { type: 'wardrobe', i };
  if (dist2(p, SHOP.seller) < 3) return { type: 'seller' };
  for (const c of CASH_POINTS) if (dist2(p, c) < 2.2) return { type: 'cash', c };
  if (job.crate && dist2(p, job.crate) < 2) return { type: 'crate' };
  if (dist2(p, TRUCK) < TRUCK.radius) return { type: 'truck' };
  if (dist2(p, foreman) < 2.5) return { type: 'foreman' };
  return null;
}
function interact(p) {
  const t = nearestInteract(p);
  if (!t) return;
  if (t.type === 'houseDoor') { houseDoorOpen = !houseDoorOpen; broadcast({ type: 'event', kind: 'door', open: houseDoorOpen }); }
  if (t.type === 'wardrobe') event(p, 'storage', { storage: save.storage });
  if (t.type === 'seller') event(p, 'shop', { balance: p.balance });
  if (t.type === 'crate' && job.state === 'pickup' && job.playerId === p.id) { p.carrying = 'crate'; job.state = 'deliver'; event(p, 'toast', { text: 'Ящик взят. Неси к грузовику.' }); }
  if (t.type === 'truck' && p.carrying === 'crate' && job.playerId === p.id) {
    const reward = Math.random() < 0.15 ? 400 + Math.floor(Math.random() * 300) : 60 + Math.floor(Math.random() * 200);
    p.balance += reward; p.carrying = null; job = { state: 'idle', playerId: null, crate: null, nextOffer: Date.now() + 25000 + Math.random() * 20000 };
    event(p, 'toast', { text: `Задача выполнена: +$${reward}` }); event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); saveProfile(p);
  }
  if (t.type === 'foreman' && job.state === 'idle') offerJob(p);
}
function offerJob(p) {
  job = { state: 'offered', playerId: p.id, crate: null, nextOffer: Date.now() + 60000 };
  event(p, 'jobOffer', { text: 'Помоги перенести ящик в грузовик. Плачу нормально.' });
}
function acceptJob(p) {
  if (job.state !== 'offered' || job.playerId !== p.id) return;
  job.state = 'pickup'; job.crate = { x: foreman.x + 1.5, z: foreman.z + 1 };
  event(p, 'toast', { text: 'Забери ящик рядом со мной.' });
}
function stealStart(p) {
  if (!inZone(p, BANK)) return;
  const cash = CASH_POINTS.find(c => dist2(p, c) < 2.2);
  if (!cash) return;
  const item = p.inventory[p.selected];
  const bag = item?.type === 'bag';
  p.steal = { start: Date.now(), duration: bag ? 30000 : 15000, progress: 0, bag, cash };
}
function stealStop(p) { p.steal = null; }
function buy(p, item) {
  if (dist2(p, SHOP.seller) > 3.5) return;
  const price = PRICES[item];
  if (!price) return;
  if (p.balance < price) { event(p, 'toast', { text: 'Недостаточно денег' }); return; }
  if (item === 'ammo') { p.balance -= price; const existing = p.inventory.find(i => i.type === 'ammo'); if (existing) existing.count += AMMO_PACK; else addItem(p, { type: 'ammo', count: AMMO_PACK }); }
  else if (item === 'bag') { p.balance -= price; addItem(p, { type: 'bag', bagCash: 0 }); }
  else if (WEAPONS[item]) { p.balance -= price; addItem(p, { type: item, mag: 0 }); }
  event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); event(p, 'shop', { balance: p.balance }); saveProfile(p);
}
function deposit(p, index, amount) {
  const item = p.inventory[index];
  if (!item) return;
  if (item.type === 'cash') {
    const packs = Math.min(item.count || 1, amount || item.count || 1);
    let total = 0; for (let i = 0; i < packs; i++) total += 50 + Math.floor(Math.random() * 350);
    item.count -= packs; if (item.count <= 0) p.inventory.splice(index, 1);
    p.balance += total; event(p, 'toast', { text: `В баланс: +$${total}` });
  } else if (item.type === 'bag') {
    const take = Math.max(0, Math.min(item.bagCash || 0, Math.floor(amount) || item.bagCash || 0));
    item.bagCash -= take; p.balance += take; event(p, 'toast', { text: `Из сумки: +$${take}` });
  }
  event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); saveProfile(p);
}
function storagePut(p, index) {
  if (save.storage.length >= STORAGE_SIZE) { event(p, 'toast', { text: 'Шкаф полон' }); return; }
  const item = p.inventory[index]; if (!item || item.type === 'fists') return;
  p.inventory.splice(index, 1); save.storage.push(item);
  event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); event(p, 'storage', { storage: save.storage }); persist();
}
function storageTake(p, index) {
  const item = save.storage[index]; if (!item) return;
  if (p.inventory.length >= HOTBAR_SIZE) { event(p, 'toast', { text: 'Инвентарь полон' }); return; }
  save.storage.splice(index, 1); p.inventory.push(item);
  event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); event(p, 'storage', { storage: save.storage }); persist();
}

function tick() {
  const now = Date.now();
  const dt = TICK_MS / 1000;
  for (const p of players.values()) {
    if (p.sprinting && p.moving && p.stamina > 0) p.stamina = Math.max(0, p.stamina - 22 * dt);
    else p.stamina = Math.min(100, p.stamina + 14 * dt);
    if (now - (p.lastDamage || 0) > 10000) p.health = Math.min(100, p.health + 2 * dt);
    if (p.steal) {
      if (dist2(p, p.steal.cash) > 2.5) p.steal = null;
      else {
        p.steal.progress = Math.min(1, (now - p.steal.start) / p.steal.duration);
        if (p.steal.progress >= 1) {
          if (p.steal.bag) {
            const item = p.inventory[p.selected];
            if (item?.type === 'bag') { item.bagCash = (item.bagCash || 0) + 800 + Math.floor(Math.random() * 1700); event(p, 'toast', { text: 'Деньги в сумке' }); }
          } else {
            const cash = p.inventory.find(i => i.type === 'cash');
            if (cash) cash.count += 5; else addItem(p, { type: 'cash', count: 5 });
            event(p, 'toast', { text: '+5 пачек денег' });
          }
          addWanted(p, 1); p.steal = null; event(p, 'inventory', { inventory: p.inventory, balance: p.balance }); saveProfile(p);
        }
      }
    }
    const hidden = inZone(p, HOUSE) && !houseDoorOpen;
    if (p.wanted > 0 && hidden && now - (p.lastSeen || 0) > 6000) { p.hiddenTime = (p.hiddenTime || 0) + dt; if (p.hiddenTime > 8) { p.wanted--; p.hiddenTime = 0; } }
    else p.hiddenTime = 0;
  }
  // civilians
  for (const n of npcs) {
    const near = [...players.values()].find(p => dist2(p, n) < 6);
    if (near && n.state !== 'flee') { n.state = 'look'; n.yaw = Math.atan2(near.x - n.x, near.z - n.z); }
    else if (n.state === 'flee') { n.x += Math.sin(n.yaw) * n.speed * 2 * dt; n.z += Math.cos(n.yaw) * n.speed * 2 * dt; }
    else {
      if (dist2(n, { x: n.tx, z: n.tz }) < 0.5) { n.tx = -35 + Math.random() * 70; n.tz = 10 + Math.random() * 8; n.state = 'walk'; }
      const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz) || 1;
      n.x += dx / d * n.speed * dt; n.z += dz / d * n.speed * dt; n.yaw = Math.atan2(dx, dz);
    }
  }
  // foreman approaches players occasionally
  if (job.state === 'idle' && now > job.nextOffer && players.size) {
    const arr = [...players.values()]; const p = arr[Math.floor(Math.random() * arr.length)];
    foreman.tx = p.x + 1.5; foreman.tz = p.z + 1.5; foreman.state = 'approach';
    if (dist2(foreman, p) < 3) { offerJob(p); foreman.state = 'idle'; }
  }
  if (foreman.state === 'approach') {
    const dx = foreman.tx - foreman.x, dz = foreman.tz - foreman.z, d = Math.hypot(dx, dz) || 1;
    foreman.x += dx / d * 1.4 * dt; foreman.z += dz / d * 1.4 * dt; foreman.yaw = Math.atan2(dx, dz);
    const p = players.get(job.playerId) || [...players.values()].find(q => dist2(q, foreman) < 3);
    if (p && dist2(p, foreman) < 3 && job.state === 'idle') { offerJob(p); foreman.state = 'idle'; }
  }
  // cashier panics if a weapon is visibly drawn inside the bank
  for (const p of players.values()) {
    const it = p.inventory[p.selected];
    if (inZone(p, BANK) && it && WEAPONS[it.type] && dist2(p, cashier) < 14) triggerAlarm('cashier');
  }
  if (job.state === 'offered' && now > job.nextOffer) job = { state: 'idle', playerId: null, crate: null, nextOffer: now + 15000 };
  // guards
  for (const g of guards) {
    const dx = g.tx - g.x, dz = g.tz - g.z, d = Math.hypot(dx, dz) || 1;
    if (d < 0.5) { const t = g.tz; g.tz = g.tx === 18 ? (t === 33 ? 25 : 33) : (t === 25 ? 33 : 25); }
    g.x += dx / d * 1.1 * dt; g.z += dz / d * 1.1 * dt; g.yaw = Math.atan2(dx, dz);
    for (const p of players.values()) {
      if (!inZone(p, BANK)) continue;
      const item = p.inventory[p.selected]; const armed = item && WEAPONS[item.type];
      if (!armed && !p.steal) continue;
      const angle = Math.atan2(p.x - g.x, p.z - g.z); let diff = Math.abs(angle - g.yaw); if (diff > Math.PI) diff = 6.283 - diff;
      if (dist2(p, g) < 9 && diff < 0.9) { triggerAlarm('guard'); p.lastSeen = now; }
      if (alarm && dist2(p, g) < 1.6) damagePlayer(p, 12 * dt, 'guard');
    }
  }
  if (alarm && now > alarmUntil && ![...players.values()].some(p => p.wanted > 0)) { alarm = false; cashier.panic = false; }
  // police
  const wantedPlayers = [...players.values()].filter(p => p.wanted > 0);
  if (wantedPlayers.length && police.length < Math.min(6, wantedPlayers.reduce((a, p) => a + p.wanted, 0))) {
    if (Math.random() < 0.02) police.push({ id: uid(), x: -40 + Math.random() * 80, z: 45, yaw: Math.PI, health: 60, lastAttack: 0 });
  }
  for (const q of police) {
    const target = wantedPlayers.sort((a, b) => b.wanted - a.wanted)[0];
    if (!target) continue;
    const dx = target.x - q.x, dz = target.z - q.z, d = Math.hypot(dx, dz) || 1;
    q.yaw = Math.atan2(dx, dz);
    const blocked = inZone(target, HOUSE) && !houseDoorOpen;
    if (!blocked && d > 2) { q.x += dx / d * 2.4 * dt; q.z += dz / d * 2.4 * dt; }
    if (!blocked && d < 12) { target.lastSeen = now; if (now - q.lastAttack > 900) { q.lastAttack = now; damagePlayer(target, 8 + target.wanted * 2, 'police'); broadcast({ type: 'event', kind: 'policeShot', x: q.x, z: q.z }); } }
  }
  if (!wantedPlayers.length && police.length) police.length = 0;
  if (now - lastSnapshot > SNAPSHOT_MS) { lastSnapshot = now; broadcast(snapshot()); }
}
setInterval(tick, TICK_MS);
setInterval(() => { for (const p of players.values()) saveProfile(p); }, 15000);

const handler = DEV ? null : sirv(path.join(__dirname, 'dist'), { single: true });
let vite;
const server = http.createServer((req, res) => { if (vite) vite.middlewares(req, res); else if (handler) handler(req, res); else { res.writeHead(404); res.end(); } });
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
}
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/game')) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  let player = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'join') {
      const token = String(msg.token || uid()).slice(0, 64);
      const existing = [...players.values()].find(p => p.token === token);
      if (existing) { existing.ws.close(); players.delete(existing.ws); slots[existing.slot] = null; }
      const slot = slots[0] === null ? 0 : slots[1] === null ? 1 : -1;
      if (slot < 0) { send(ws, { type: 'full' }); ws.close(); return; }
      const profile = save.profiles[token] || { balance: 0, inventory: defaultInventory(), name: slot === 0 ? 'Deni' : 'Islam' };
      const bed = BEDS[slot];
      player = { id: uid(), token, slot, name: profile.name || (slot === 0 ? 'Deni' : 'Islam'), char: slot === 0 ? 'gentleman' : 'gopnik', ws, x: bed.x, z: bed.z, yaw: 0, pitch: 0, health: 100, stamina: 100, wanted: 0, balance: profile.balance || 0, inventory: cleanInventory(profile.inventory), selected: 0, spawnUntil: Date.now() + 2500, lastDamage: 0, lastCrime: 0, hiddenTime: 0, carrying: null, steal: null, sprinting: false, moving: false };
      players.set(ws, player); slots[slot] = player.id;
      send(ws, { type: 'welcome', id: player.id, slot, player: publicPlayer(player), inventory: player.inventory, storage: save.storage, balance: player.balance });
      broadcast({ type: 'event', kind: 'toast', text: `${player.name} в сети` });
      return;
    }
    if (!player) return;
    switch (msg.type) {
      case 'input': {
        player.x = Math.max(-60, Math.min(60, Number(msg.x) || 0)); player.z = Math.max(-40, Math.min(60, Number(msg.z) || 0));
        player.yaw = Number(msg.yaw) || 0; player.pitch = Number(msg.pitch) || 0; player.sprinting = !!msg.sprint; player.moving = !!msg.moving; break;
      }
      case 'select': player.selected = Math.max(0, Math.min(HOTBAR_SIZE - 1, Number(msg.index) || 0)); break;
      case 'interact': interact(player); break;
      case 'stealStart': stealStart(player); break;
      case 'stealStop': stealStop(player); break;
      case 'shoot': shoot(player); break;
      case 'reload': reload(player); break;
      case 'buy': buy(player, msg.item); break;
      case 'deposit': deposit(player, Number(msg.index), Number(msg.amount)); break;
      case 'storagePut': storagePut(player, Number(msg.index)); break;
      case 'storageTake': storageTake(player, Number(msg.index)); break;
      case 'jobAccept': acceptJob(player); break;
      case 'signal': { const other = [...players.values()].find(p => p !== player); if (other) send(other.ws, { type: 'signal', data: msg.data }); break; }
    }
  });
  ws.on('close', () => { if (player) { saveProfile(player); players.delete(ws); slots[player.slot] = null; broadcast({ type: 'event', kind: 'toast', text: `${player.name} вышел` }); } });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Deni Islam server on http://0.0.0.0:${PORT} (${DEV ? 'dev' : 'prod'})`));
