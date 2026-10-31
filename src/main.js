import './style.css';
import { Engine, Scene, UniversalCamera, Vector3, Color3, Color4, HemisphericLight, DirectionalLight, ShadowGenerator, DefaultRenderingPipeline, GlowLayer, CubeTexture, MeshBuilder, TransformNode } from '@babylonjs/core';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import { createMaterials } from './gfx/materials.js';
import { createActor } from './gfx/characters.js';
import { createWeapon, createBag, createCash, createCrate } from './gfx/models.js';
import { buildWorld } from './world.js';
import { Controls } from './controls.js';
import { UI } from './ui.js';
import { AudioBus } from './audio.js';
import { openGame, send } from './net.js';
import { startVoice, requestMicrophone } from './voice.js';
import { EYE, PLAYER_SPEED, SPRINT_MULT, HOUSE, BANK, SHOP, TRUCK, CASH_POINTS, WARDROBES, WEAPONS, HOTBAR_SIZE, inZone, dist2 } from './shared/constants.js';

const ui = new UI(); const audio = new AudioBus();
const settings = Object.assign({ sens: 1, vol: .6, quality: matchMedia('(pointer:coarse)').matches ? 'low' : 'high' }, JSON.parse(localStorage.getItem('di_settings') || '{}'));
const canvas = document.getElementById('game');
const engine = new Engine(canvas, true, { stencil: true, antialias: true, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(settings.quality === 'low' ? 1.6 : 1);
const scene = new Scene(engine); scene.clearColor = new Color4(.55, .68, .8, 1); scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = .004; scene.fogColor = new Color3(.62, .7, .78);
scene.environmentTexture = CubeTexture.CreateFromPrefilteredData('/assets/env/studio.env', scene); scene.environmentIntensity = .7;
const camera = new UniversalCamera('cam', new Vector3(24, 9, 6), scene); camera.minZ = .05; camera.maxZ = 300; camera.fov = 1.15; camera.inputs.clear();
const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene); hemi.intensity = .8; hemi.groundColor = new Color3(.25, .24, .22);
const sun = new DirectionalLight('sun', new Vector3(-.45, -1, .35), scene); sun.position = new Vector3(30, 50, -20); sun.intensity = 2.2; sun.diffuse = new Color3(1, .93, .82);
const shadow = new ShadowGenerator(settings.quality === 'low' ? 1024 : 2048, sun); shadow.usePercentageCloserFiltering = true; shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM; shadow.bias = .0008; shadow.darkness = .35;
const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera]); pipeline.fxaaEnabled = true; pipeline.bloomEnabled = settings.quality === 'high'; pipeline.bloomThreshold = .8; pipeline.bloomWeight = .25; pipeline.bloomKernel = 48; pipeline.imageProcessingEnabled = true; pipeline.imageProcessing.toneMappingEnabled = true; pipeline.imageProcessing.toneMappingType = 1; pipeline.imageProcessing.exposure = 1.05; pipeline.imageProcessing.contrast = 1.12; pipeline.imageProcessing.vignetteEnabled = true; pipeline.imageProcessing.vignetteWeight = 1.5;
const glow = new GlowLayer('glow', scene, { blurKernelSize: 32 }); glow.intensity = .5;
const M = createMaterials(scene);
const controls = new Controls(canvas); controls.sens = settings.sens;
let world = null, mode = 'menu', ws = null, voice = null, connecting = false, connAttempt = 0, connGeneration = 0, reconnectTimer = null, micPromise = null, myId = null, slot = 0, state = null, inventory = { items: [{ type: 'fists' }] }, balance = 0, storage = [], selected = 0, houseDoorOpen = true, dialogOpen = false, paused = false, stealing = false, lastFire = 0, lastStep = 0, lastAlarm = 0, spawnStart = 0, crateMesh = null;
const actors = new Map(); let vmRoot = null, vmType = null, muzzle = null, recoil = 0, bob = 0;
const pos = { x: -3.2, z: 0, y: EYE };

function saveSettings() { localStorage.setItem('di_settings', JSON.stringify(settings)); }
function groundHeight(x, z) { if (inZone({ x, z }, HOUSE) || inZone({ x, z }, BANK) || inZone({ x, z }, SHOP)) return .32; if ((z > 7.9 && z < 10.2) || (z > 17.8 && z < 20.2)) return .18; return .05; }
function collides(x, z) {
  const r = .35; const list = world?.colliders || [];
  for (const c of list) if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
  if (!houseDoorOpen && x + r > -1 && x - r < 1 && z + r > 4.8 && z - r < 5.2) return true;
  return false;
}
function setViewmodel(type) {
  if (vmType === type) return; vmType = type; vmRoot?.dispose(); vmRoot = new TransformNode('vm', scene); vmRoot.parent = camera;
  if (WEAPONS[type]) { const w = createWeapon(scene, type, M); w.parent = vmRoot; w.scaling.setAll(1.1); vmRoot.position.set(.28, -.26, .45); vmRoot.rotation.set(0, Math.PI, 0); muzzle = MeshBuilder.CreateSphere('flash', { diameter: .12 }, scene); muzzle.parent = w; muzzle.position.copyFrom(w.metadata.muzzle); muzzle.material = M.neon; muzzle.isVisible = false; }
  else if (type === 'bag') { const b = createBag(scene, M); b.parent = vmRoot; b.scaling.setAll(.8); vmRoot.position.set(-.32, -.35, .5); vmRoot.rotation.set(.2, .4, 0); muzzle = null; }
  else if (type === 'cash') { const c = createCash(scene, M, 3); c.parent = vmRoot; c.scaling.setAll(1.4); vmRoot.position.set(.25, -.3, .45); vmRoot.rotation.set(.3, -.3, 0); muzzle = null; }
  else { vmRoot.position.set(0, -.35, .5); muzzle = null; for (const s of [-1, 1]) { const arm = MeshBuilder.CreateBox('arm', { width: .12, height: .12, depth: .4 }, scene); arm.parent = vmRoot; arm.position.set(s * .22, 0, 0); arm.material = slot === 0 ? M.black : M.blue; const fist = MeshBuilder.CreateSphere('fist', { diameter: .14, segments: 12 }, scene); fist.parent = vmRoot; fist.position.set(s * .22, .02, .22); fist.material = M.skin; } }
  vmRoot.getChildMeshes().forEach(m => { m.renderingGroupId = 2; m.isPickable = false; });
}
async function ensureActor(id, kind) {
  if (actors.has(id)) return actors.get(id);
  const node = new TransformNode('ph_' + id, scene); const rec = { node, actor: null, kind, target: { x: 0, z: 0, yaw: 0 }, last: { x: 0, z: 0 }, speed: 0 }; actors.set(id, rec);
  createActor(scene, kind, M).then(a => { if (!actors.has(id) || actors.get(id) !== rec) { a.dispose(); return; } rec.actor = a; a.root.parent = node; a.root.getChildMeshes().forEach(m => shadow.addShadowCaster(m)); }).catch(e => console.warn('actor', e));
  return rec;
}
function syncSnapshot(s) {
  state = s; houseDoorOpen = s.doors.house; world?.setHouseDoor(houseDoorOpen); world?.setAlarm(s.alarm);
  const seen = new Set();
  const upsert = (id, kind, x, z, yaw, armed) => { seen.add(id); ensureActor(id, kind).then(rec => { rec.target = { x, z, yaw }; rec.armed = armed; }); };
  for (const p of s.players) { if (p.id === myId) continue; upsert(p.id, p.char, p.x, p.z, p.yaw, WEAPONS[p.weapon] ? p.weapon : null); }
  for (const n of s.npcs) upsert(n.id, n.kind, n.x, n.z, n.yaw, null);
  upsert('foreman', 'foreman', s.foreman.x, s.foreman.z, s.foreman.yaw, null);
  for (const g of s.guards) upsert(g.id, 'guard', g.x, g.z, g.yaw, null);
  for (const p of s.police) upsert(p.id, 'police', p.x, p.z, p.yaw, 'pistol');
  upsert('cashier', 'cashier', s.cashier.x, s.cashier.z, Math.PI, null);
  for (const [id, rec] of actors) if (!seen.has(id)) { rec.actor?.dispose(); rec.node.dispose(); actors.delete(id); }
  if (s.job.crate && !crateMesh) { crateMesh = createCrate(scene, M); crateMesh.position.set(s.job.crate.x, .1, s.job.crate.z); }
  if (!s.job.crate && crateMesh) { crateMesh.dispose(); crateMesh = null; }
  const me = s.players.find(p => p.id === myId);
  if (me) { ui.hud({ hp: me.health, stamina: me.stamina }, me.wanted, { balance }); if (me.steal > 0) ui.progress(me.steal, stealing ? (inventory.items[selected]?.type === 'bag' ? 'Складываем деньги в сумку…' : 'Берём наличные…') : 'Кража'); else ui.progress(null); }
  if (s.job.state === 'pickup' && s.job.playerId === myId) ui.objective('Забери ящик у бригадира'); else if (s.job.state === 'deliver' && s.job.playerId === myId) ui.objective('Донеси ящик до грузовика'); else ui.objective(s.alarm ? 'Тревога! Уходи из банка и скрывайся' : '');
}
function nearest() {
  if (!state) return null; const p = pos;
  if (dist2(p, HOUSE.door) < 2.5) return { type: 'houseDoor', text: houseDoorOpen ? 'Закрыть дверь' : 'Открыть дверь' };
  for (const w of WARDROBES) if (dist2(p, w) < 2) return { type: 'wardrobe', text: 'Открыть гардероб' };
  if (dist2(p, SHOP.seller) < 3) return { type: 'seller', text: 'Торговец — открыть магазин' };
  for (const c of CASH_POINTS) if (dist2(p, c) < 2.2) return { type: 'cash', text: inventory.items[selected]?.type === 'bag' ? 'Удерживай: сложить деньги в сумку (30 с)' : 'Удерживай: взять наличные (15 с)', hold: true };
  if (state.job.crate && dist2(p, state.job.crate) < 2) return { type: 'crate', text: 'Взять ящик' };
  if (dist2(p, TRUCK) < TRUCK.radius) return { type: 'truck', text: 'Погрузить ящик' };
  if (dist2(p, state.foreman) < 2.5) return { type: 'foreman', text: 'Поговорить с бригадиром' };
  return null;
}
function openDialog(fn) { dialogOpen = true; controls.fire = false; document.exitPointerLock?.(); fn(); }
function closeDialog() { dialogOpen = false; if (mode === 'game' && !controls.touch && !paused) canvas.requestPointerLock?.(); }
ui.onDialogClose = closeDialog;
function refreshHotbar() { ui.hotbar(inventory, selected, i => selectSlot(i)); }
function selectSlot(i) { selected = Math.max(0, Math.min(HOTBAR_SIZE - 1, i)); send(ws, { type: 'select', index: selected }); setViewmodel(inventory.items[selected]?.type || 'fists'); refreshHotbar(); }
function handleEvent(e) {
  if (e.kind === 'toast') ui.toast(e.text, e.text?.includes('Недостаточно') || e.text?.includes('полон') || e.text?.includes('Нет патронов') ? 'error' : '');
  if (e.kind === 'shot') { if (e.id === myId) { recoil = 1; audio.shot(inventory.items[selected]?.type); ui.fire(); if (muzzle) { muzzle.isVisible = true; setTimeout(() => muzzle && (muzzle.isVisible = false), 45); } } }
  if (e.kind === 'policeShot') audio.shot('pistol');
  if (e.kind === 'alarm') { ui.toast('ТРЕВОГА! ' + (e.reason === 'cashier' ? 'Кассир нажал кнопку' : 'Охрана подняла тревогу'), 'error'); audio.alarm(); }
  if (e.kind === 'door') { houseDoorOpen = e.open; world?.setHouseDoor(e.open); audio.door(); }
  if (e.kind === 'playerJoined') {
    ui.online?.(e.online); ui.toast(e.text, 'success', 6500); audio.pickup();
    if (e.slot !== slot) voice?.offer();
  }
  if (e.kind === 'playerLeft') { ui.online?.(e.online); ui.toast(e.text); }
  if (e.kind === 'peerJoined') voice?.offer();
  if (e.kind === 'death') { ui.damage(); audio.hit(); ui.death(true); setTimeout(() => ui.death(false), 2500); inventory = { items: [{ type: 'fists' }] }; selected = 0; setViewmodel('fists'); refreshHotbar(); }
}
function onMessage(msg) {
  if (msg.type === 'welcome') {
    myId = msg.id; slot = msg.slot; inventory = { items: msg.inventory }; balance = msg.balance; storage = msg.storage; selected = 0; pos.x = msg.player.x; pos.z = msg.player.z; spawnStart = performance.now();
    ui.setMeta(slot); ui.showGame(); refreshHotbar(); setViewmodel('fists'); mode = 'game';
    controls.yaw = 0; controls.pitch = 0; camera.rotation.set(0, 0, 0);
    if (!controls.touch) ui.toast('Кликни по экрану, чтобы захватить мышь');
    audio.init(); audio.setVolume(settings.vol);
    document.getElementById('play').disabled = false;
    startVoice(ws, slot, s => ui.voice(s === 'on'), micPromise).then(v => { voice = v; const q = pendingSignals.splice(0); for (const data of q) v.handle(data); });
    ui.online?.(msg.online || 1);
    ui.toast(msg.resume ? 'Соединение восстановлено. Ты снова в игре.' : (msg.online > 1 ? `Ты — игрок ${slot + 1}. Второй игрок уже в мире.` : `Ты — игрок ${slot + 1}. Можно играть одному; друг подключится позже.`), 'success');
  }
  if (msg.type === 'full') { ui.toast('Сервер заполнен: уже два игрока онлайн.', 'error'); }
  if (msg.type === 'snapshot') syncSnapshot(msg);
  if (msg.type === 'event') handleEvent(msg);
  if (msg.type === 'inventory') { inventory = { items: msg.inventory }; balance = msg.balance; selected = Math.min(selected, inventory.items.length - 1); setViewmodel(inventory.items[selected]?.type || 'fists'); refreshHotbar(); }
  if (msg.type === 'storage') { storage = msg.storage; if (dialogOpen) ui.storage(inventory, storage, transfer); }
  if (msg.type === 'shop') { openDialog(() => ui.shop(msg.balance, buy)); }
  if (msg.type === 'jobOffer') { openDialog(() => ui.jobOffer({ text: msg.text, reward: '60–700', total: 1 }, () => send(ws, { type: 'jobAccept' }))); }
  if (msg.type === 'signal') { if (voice) voice.handle(msg.data); else pendingSignals.push(msg.data); }
}
function buy(item) { send(ws, { type: 'buy', item }); audio.buy(); }
function transfer(from, i) { send(ws, { type: from === 'inv' ? 'storagePut' : 'storageTake', index: i }); }
function openItem() { const it = inventory.items[selected]; if (!it) return; openDialog(() => ui.itemDialog(it, () => { send(ws, { type: 'deposit', index: selected }); ui.closeDialog(); }, amount => { send(ws, { type: 'deposit', index: selected, amount }); ui.closeDialog(); })); }
function interact() {
  const t = nearest();
  if (t) { if (t.type === 'cash') return; send(ws, { type: 'interact' }); if (t.type === 'wardrobe') setTimeout(() => { if (!dialogOpen) openDialog(() => ui.storage(inventory, storage, transfer)); }, 120); return; }
  const it = inventory.items[selected]; if (it && (it.type === 'cash' || it.type === 'bag')) openItem();
}
let connTokenValue = ''; const pendingSignals = []; let lastNetInput = 0;
function connectionFailed(message) {
  connecting = false; mode = 'menu'; clearTimeout(reconnectTimer);
  document.getElementById('play').disabled = false;
  ui.showMenu(); ui.toast(message, 'error');
  const dot = document.getElementById('serverStatus'); if (dot) { dot.style.background = 'var(--red)'; dot.style.boxShadow = '0 0 10px var(--red)'; }
}
async function tryConnect() {
  const gen = ++connGeneration; clearTimeout(reconnectTimer);
  ui.loading(70, connAttempt ? 'Переподключение к серверу…' : 'Подключение к единому серверу…');
  if (connAttempt > 0) micPromise = requestMicrophone();
  try {
    const { socket, welcome } = await openGame(connTokenValue, text => { if (gen === connGeneration) ui.loading(75, text); });
    if (gen !== connGeneration) { socket.close(); return; }
    ws = socket; connecting = false; connAttempt = 0;
    socket.onmessage = ev => { if (ws !== socket) return; let msg; try { msg = JSON.parse(ev.data); } catch { return; } try { onMessage(msg); } catch (e) { console.error(e); } };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (ws !== socket || gen !== connGeneration) return;
      voice?.stop(); voice = null; pendingSignals.length = 0; ui.voice(false);
      const wasInGame = mode === 'game';
      const max = wasInGame ? 8 : 2;
      if (connAttempt < max) {
        connAttempt++; mode = 'menu'; ui.el.hud.hidden = true;
        ui.loading(65, wasInGame ? `Связь потеряна. Переподключение ${connAttempt}/${max}…` : `Повторное подключение ${connAttempt}/${max}…`);
        reconnectTimer = setTimeout(tryConnect, 1200);
      } else connectionFailed(wasInGame ? 'Соединение потеряно. Нажми «Играть онлайн», чтобы вернуться.' : 'Игровой сервер не ответил. Нажми «Играть онлайн» для повтора.');
    };
    socket._handoff?.();
    onMessage(welcome);
    const dot = document.getElementById('serverStatus'); if (dot) { dot.style.background = 'var(--green)'; dot.style.boxShadow = '0 0 10px var(--green)'; }
    ui.connection?.(socket.transport);
  } catch (e) {
    if (gen !== connGeneration) return;
    if (e.code === 'FULL') { connectionFailed('На сервере уже два игрока. Когда один выйдет, место освободится.'); return; }
    if (connAttempt < 2) { connAttempt++; reconnectTimer = setTimeout(tryConnect, 1200); }
    else connectionFailed(e.message || 'Не удалось подключиться к игровому серверу');
  }
}
async function play() {
  if (mode === 'game' || connecting) return;
  connecting = true; connAttempt = 0; document.getElementById('play').disabled = true;
  audio.init(); micPromise = requestMicrophone();
  ui.loading(55, 'Запрос микрофона и подключение…');
  connTokenValue = localStorage.getItem('di_token');
  if (!connTokenValue) { connTokenValue = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('di_token', connTokenValue); }
  tryConnect();
}
function quit() {
  connGeneration++; clearTimeout(reconnectTimer); connecting = false;
  ws?.close(); ws = null; voice?.stop(); voice = null;
  micPromise?.then(s => s?.getTracks().forEach(t => t.stop())); micPromise = null;
  mode = 'menu'; paused = false; document.getElementById('play').disabled = false;
  ui.showMenu(); document.exitPointerLock?.();
}

document.getElementById('play').onclick = play;
document.getElementById('about').onclick = () => ui.about();
document.getElementById('controlsBtn').onclick = () => ui.controls();
document.getElementById('settingsBtn').onclick = () => ui.settings(settings, s => { Object.assign(settings, s); saveSettings(); audio.setVolume(settings.vol); });
document.getElementById('pauseBtn').onclick = () => { paused = true; ui.el.pause.hidden = false; document.exitPointerLock?.(); };
document.getElementById('resumeBtn').onclick = () => { paused = false; ui.el.pause.hidden = true; if (!controls.touch) canvas.requestPointerLock?.(); };
document.getElementById('pauseSettings').onclick = () => ui.settings(settings, s => { Object.assign(settings, s); saveSettings(); audio.setVolume(settings.vol); });
document.getElementById('quitBtn').onclick = quit;
localStorage.removeItem('di_server');
addEventListener('keydown', e => {
  if (mode !== 'game') return;
  if (e.code === 'Escape') { if (dialogOpen) ui.closeDialog(); else { paused = !paused; ui.el.pause.hidden = !paused; if (paused) document.exitPointerLock?.(); else if (!controls.touch) canvas.requestPointerLock?.(); } }
  if (dialogOpen || paused) return;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < HOTBAR_SIZE) selectSlot(n); }
});
addEventListener('resize', () => engine.resize());

let last = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now(); const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  world?.update(t);
  if (mode === 'menu') { camera.position.set(24 + Math.sin(t * .07) * 7, 5.5 + Math.sin(t * .05) * .6, 3 + Math.cos(t * .07) * 2); camera.setTarget(new Vector3(24, 3, 24)); }
  else if (mode === 'game' && !paused) {
    if (!dialogOpen) {
      const mv = controls.move(); const sprint = controls.sprint && mv.z > 0 && state?.players.find(p => p.id === myId)?.stamina > 0; const speed = PLAYER_SPEED * (sprint ? SPRINT_MULT : 1);
      const fx = Math.sin(controls.yaw), fz = Math.cos(controls.yaw), rx = Math.cos(controls.yaw), rz = -Math.sin(controls.yaw);
      let dx = (fx * mv.z + rx * mv.x) * speed * dt, dz = (fz * mv.z + rz * mv.x) * speed * dt;
      if (!collides(pos.x + dx, pos.z)) pos.x += dx; if (!collides(pos.x, pos.z + dz)) pos.z += dz;
      pos.x = Math.max(-58, Math.min(58, pos.x)); pos.z = Math.max(-38, Math.min(58, pos.z));
      const moving = Math.hypot(mv.x, mv.z) > .05; bob += dt * (sprint ? 11 : 7) * (moving ? 1 : 0);
      if (moving && now - lastStep > (sprint ? 300 : 450)) { audio.footstep(); lastStep = now; }
      if (now - lastNetInput >= 50) { lastNetInput = now; send(ws, { type: 'input', x: pos.x, z: pos.z, yaw: controls.yaw, pitch: controls.pitch, sprint, moving }); }
      const spawnT = Math.min(1, (now - spawnStart) / 2200); const eye = EYE * (.55 + .45 * spawnT);
      pos.y += (groundHeight(pos.x, pos.z) + eye + (moving ? Math.sin(bob) * .035 : 0) - pos.y) * Math.min(1, dt * 12);
      camera.position.set(pos.x, pos.y, pos.z); camera.rotation.set(controls.pitch, controls.yaw, 0);
      const n = nearest(); ui.prompt(n?.text || (['cash', 'bag'].includes(inventory.items[selected]?.type) ? 'E — использовать предмет' : ''), n?.hold);
      if (n?.type === 'cash') { if (controls.useHeld && !stealing) { stealing = true; send(ws, { type: 'stealStart' }); } if (!controls.useHeld && stealing) { stealing = false; send(ws, { type: 'stealStop' }); } }
      else if (stealing) { stealing = false; send(ws, { type: 'stealStop' }); }
      if (controls.consumeUse()) interact();
      if (controls.consumeReload()) { send(ws, { type: 'reload' }); audio.reload(); }
      const it = inventory.items[selected];
      if (controls.fire && now - lastFire > (WEAPONS[it?.type]?.rate || 500)) { lastFire = now; if (WEAPONS[it?.type]) send(ws, { type: 'shoot' }); else { recoil = .6; audio.noise(.08, .12, 600); } }
    }
    recoil = Math.max(0, recoil - dt * 6);
    if (vmRoot) { const base = vmType === 'bag' ? -.35 : WEAPONS[vmType] ? -.26 : -.35; vmRoot.position.y = base + Math.sin(bob) * .012 - recoil * .03; vmRoot.rotation.x = (vmType === 'bag' ? .2 : WEAPONS[vmType] ? 0 : 0) + recoil * .12; }
    if (state?.alarm && now - lastAlarm > 1200) { audio.alarm(); lastAlarm = now; }
    if (state && now % 200 < 20) { const pts = [{ x: pos.x, z: pos.z, yaw: controls.yaw, color: '#d4af37', self: true }, ...state.players.filter(p => p.id !== myId).map(p => ({ x: p.x, z: p.z, color: '#5aa7e8' })), ...state.police.map(p => ({ x: p.x, z: p.z, color: '#e05252' })), { x: state.foreman.x, z: state.foreman.z, color: '#58c47a' }]; ui.minimap(pts); }
  }
  for (const rec of actors.values()) { const dx = rec.target.x - rec.node.position.x, dz = rec.target.z - rec.node.position.z; rec.node.position.x += dx * Math.min(1, dt * 10); rec.node.position.z += dz * Math.min(1, dt * 10); rec.node.position.y = groundHeight(rec.node.position.x, rec.node.position.z); let dy = rec.target.yaw - rec.node.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; rec.node.rotation.y += dy * Math.min(1, dt * 10); rec.speed = Math.hypot(dx, dz) / Math.max(dt, .001); rec.actor?.update(Math.min(rec.speed, 8), dt, rec.armed); }
  scene.render();
});

(async () => {
  try {
    ui.loading(15, 'Материалы и освещение…');
    world = await buildWorld(scene, M, settings.quality);
    ui.loading(65, 'Район готов…');
    world.root.getChildMeshes().forEach(m => { if (!['ground', 'road', 'dash', 'crosswalk'].includes(m.name) && m.material !== M.glass) shadow.addShadowCaster(m); });
    ui.loading(100, 'Готово'); setTimeout(() => ui.ready(), 300);
  } catch (e) { console.error(e); ui.fatal('Не удалось загрузить район: ' + e.message); }
})();
