import './style.css';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { buildWorld } from './world.js';
import { createHumanoid, animateHumanoid, createViewmodel } from './entities.js';
import { Controls } from './controls.js';
import { UI } from './ui.js';
import { connect, send } from './net.js';
import { startVoice } from './voice.js';
import { PLAYER_SPEED, SPRINT_MULT, EYE, HOUSE, BANK, SHOP, TRUCK, CASH_POINTS, WARDROBES, BEDS, WEAPONS, dist2, inZone } from './shared/constants.js';

const canvas = document.getElementById('game');
const engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: false });
engine.setHardwareScalingLevel(matchMedia('(pointer:coarse)').matches ? 1.4 : 1.1);
const scene = new Scene(engine);
const camera = new UniversalCamera('cam', new Vector3(0, EYE, 0), scene); camera.minZ = .05; camera.fov = 1.1;
const world = buildWorld(scene);
const controls = new Controls(canvas);
const ui = new UI();
const meshes = new Map();
let ws = null, voice = null, selfId = null, slot = 0;
let pos = { x: 0, z: 0 }, yaw = 0, pitch = 0, spawnUntil = 0;
let inventory = [{ type: 'fists' }], selected = 0, balance = 0, storage = [];
let selfState = { health: 100, stamina: 100, wanted: 0, steal: 0, carrying: null };
let lastInput = 0, lastShot = 0, stealing = false, viewmodel = null, prevPlayers = 0, houseDoorOpen = true;
let token = localStorage.getItem('di_token'); if (!token) { token = Math.random().toString(36).slice(2); localStorage.setItem('di_token', token); }
document.getElementById('serverUrl').value = localStorage.getItem('di_server') || '';

function setViewmodel() { if (viewmodel) viewmodel.dispose(); const it = inventory[selected]; viewmodel = createViewmodel(scene, camera, selfState.carrying ? 'crate' : it?.type || 'fists'); }
function collide(nx, nz) {
  const r = .35; const cols = [...world.colliders];
  if (!houseDoorOpen) cols.push({ minX: -1, maxX: 1, minZ: 4.8, maxZ: 5.2 });
  for (const c of cols) { if (nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) return true; }
  return false;
}
function nearest() {
  if (dist2(pos, HOUSE.door) < 2.5) return { type: 'houseDoor', text: 'E — дверь' };
  for (const w of WARDROBES) if (dist2(pos, w) < 2) return { type: 'wardrobe', text: 'E — шкаф' };
  if (dist2(pos, SHOP.seller) < 3) return { type: 'seller', text: 'E — магазин' };
  for (const c of CASH_POINTS) if (dist2(pos, c) < 2.2) return { type: 'cash', text: 'Удерживай E — взять деньги' };
  if (dist2(pos, TRUCK) < TRUCK.radius && selfState.carrying) return { type: 'truck', text: 'E — сдать ящик' };
  return null;
}
function getMesh(id, kind) { let m = meshes.get(id); if (!m) { m = createHumanoid(scene, kind); meshes.set(id, m); } return m; }
function syncSnapshot(s) {
  const seen = new Set();
  for (const p of s.players) {
    if (p.id === selfId) { selfState = p; balance = p.balance; spawnUntil = p.spawnUntil; continue; }
    seen.add(p.id); const m = getMesh(p.id, p.char); m.position.set(p.x, 0, p.z); m.rotation.y = p.yaw; animateHumanoid(m, 2, performance.now() / 1000);
  }
  for (const n of s.npcs) { seen.add(n.id); const m = getMesh(n.id, n.kind); m.position.set(n.x, 0, n.z); m.rotation.y = n.yaw; animateHumanoid(m, n.state === 'walk' || n.state === 'flee' ? 1.5 : 0, performance.now() / 1000); }
  for (const g of s.guards) { seen.add(g.id); const m = getMesh(g.id, 'guard'); m.position.set(g.x, 0, g.z); m.rotation.y = g.yaw; animateHumanoid(m, 1, performance.now() / 1000); }
  for (const q of s.police) { seen.add(q.id); const m = getMesh(q.id, 'police'); m.position.set(q.x, 0, q.z); m.rotation.y = q.yaw; animateHumanoid(m, 2.4, performance.now() / 1000); }
  seen.add('foreman'); const f = getMesh('foreman', 'foreman'); f.position.set(s.foreman.x, 0, s.foreman.z); f.rotation.y = s.foreman.yaw;
  seen.add('cashier'); const c = getMesh('cashier', 'cashier'); c.position.set(s.cashier.x, 0, s.cashier.z); c.rotation.y = Math.PI;
  for (const [id, m] of meshes) if (!seen.has(id)) { m.dispose(); meshes.delete(id); }
  houseDoorOpen = s.doors.house; world.setHouseDoor(houseDoorOpen);
  if (s.players.length === 2 && prevPlayers < 2 && voice?.offer) voice.offer();
  prevPlayers = s.players.length;
  ui.hud(selfState); ui.progress(selfState.steal, selfState.steal ? 'Берём деньги…' : '');
}
function onMessage(msg) {
  if (msg.type === 'welcome') { selfId = msg.id; slot = msg.slot; inventory = msg.inventory; storage = msg.storage; balance = msg.balance; selected = 0; pos = { x: msg.player.x, z: msg.player.z }; spawnUntil = msg.player.spawnUntil; ui.hotbar(inventory, selected, selectSlot); setViewmodel(); startVoice(ws, slot, s => { document.getElementById('voice').className = 'voice ' + (s === 'on' ? 'on' : ''); }).then(v => { voice = v; }); return; }
  if (msg.type === 'full') { document.getElementById('fatalText').textContent = 'Сервер заполнен: 2 игрока.'; document.getElementById('fatal').hidden = false; return; }
  if (msg.type === 'snapshot') { syncSnapshot(msg); return; }
  if (msg.type === 'signal') { voice?.handle(msg.data); return; }
  if (msg.type === 'event') {
    if (msg.kind === 'toast') ui.toast(msg.text);
    if (msg.kind === 'inventory') { inventory = msg.inventory; balance = msg.balance; ui.hotbar(inventory, selected, selectSlot); setViewmodel(); }
    if (msg.kind === 'shop') ui.shop(msg.balance, item => send(ws, { type: 'buy', item }));
    if (msg.kind === 'storage') { storage = msg.storage; ui.storage(storage, inventory, i => send(ws, { type: 'storagePut', index: i }), i => send(ws, { type: 'storageTake', index: i })); }
    if (msg.kind === 'jobOffer') ui.jobOffer(() => send(ws, { type: 'jobAccept' }));
    if (msg.kind === 'death') { ui.toast('Ты выбыл. Инвентарь потерян.'); spawnUntil = Date.now() + 2500; }
    if (msg.kind === 'alarm') ui.toast('ТРЕВОГА! ' + (msg.reason || ''));
    if (msg.kind === 'door') { houseDoorOpen = msg.open; world.setHouseDoor(msg.open); }
  }
}
function selectSlot(i) { if (i === selected && inventory[i] && ['cash', 'bag'].includes(inventory[i].type)) ui.itemDialog(inventory[i], i, (idx, amt) => { send(ws, { type: 'deposit', index: idx, amount: amt }); ui.close(); }); selected = i; send(ws, { type: 'select', index: i }); ui.hotbar(inventory, selected, selectSlot); setViewmodel(); }
addEventListener('keydown', e => { if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < 6) selectSlot(i); } });

document.getElementById('play').onclick = async () => {
  const serverUrl = document.getElementById('serverUrl').value.trim(); localStorage.setItem('di_server', serverUrl);
  document.getElementById('menu').style.display = 'none'; document.getElementById('hud').hidden = false;
  ws = connect(token, serverUrl); ws.onmessage = e => onMessage(JSON.parse(e.data)); ws.onerror = () => ui.toast('Ошибка соединения'); ws.onclose = () => ui.toast('Соединение закрыто');
};
document.getElementById('about').onclick = () => ui.about();
document.getElementById('controlsBtn').onclick = () => ui.controls();

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, .1); const now = Date.now();
  if (ws && ws.readyState === 1 && selfId) {
    yaw = controls.yaw; pitch = controls.pitch;
    const mv = controls.move(); const moving = Math.hypot(mv.x, mv.z) > .1;
    const sprint = controls.sprint && selfState.stamina > 0 && moving;
    const speed = PLAYER_SPEED * (sprint ? SPRINT_MULT : 1) * (selfState.carrying ? .6 : 1);
    if (now > spawnUntil && moving) {
      const dx = (Math.sin(yaw) * mv.z + Math.cos(yaw) * mv.x) * speed * dt;
      const dz = (Math.cos(yaw) * mv.z - Math.sin(yaw) * mv.x) * speed * dt;
      if (!collide(pos.x + dx, pos.z)) pos.x += dx; if (!collide(pos.x, pos.z + dz)) pos.z += dz;
      pos.x = Math.max(-60, Math.min(60, pos.x)); pos.z = Math.max(-40, Math.min(60, pos.z));
    }
    const spawnT = Math.max(0, Math.min(1, (spawnUntil - now) / 2500));
    const bed = BEDS[slot];
    if (spawnT > 0) { camera.position.set(bed.x, .8 + (EYE - .8) * (1 - spawnT), bed.z); camera.rotation.set(-1.2 * spawnT, yaw, 0); }
    else { camera.position.set(pos.x, EYE, pos.z); camera.rotation.set(pitch, yaw, 0); }
    if (now - lastInput > 66) { lastInput = now; send(ws, { type: 'input', x: pos.x, z: pos.z, yaw, pitch, sprint, moving }); }
    const n = nearest(); ui.prompt(n?.text || '');
    if (n?.type === 'cash' && controls.useHeld) { if (!stealing) { stealing = true; send(ws, { type: 'stealStart' }); } }
    else if (stealing) { stealing = false; send(ws, { type: 'stealStop' }); }
    if (controls.consumeUse() && n?.type !== 'cash') send(ws, { type: 'interact' });
    if (controls.consumeReload()) send(ws, { type: 'reload' });
    const item = inventory[selected];
    if (controls.fire && item && WEAPONS[item.type] && now - lastShot > WEAPONS[item.type].rate) { lastShot = now; send(ws, { type: 'shoot' }); if (viewmodel) viewmodel.position.z = .05; }
    if (viewmodel) viewmodel.position.z *= .8;
  }
  scene.render();
});
addEventListener('resize', () => engine.resize());
