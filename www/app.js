/* =====================================================================
   TurnikMan — физика турника, 4 карты, скины.
   three.js для сцены · physics.js для симуляции · content.js для контента
   ===================================================================== */

import * as THREE from './vendor/three.module.js';
import { Sim, PHYS, trickScore, coinsFor } from './physics.js';
import {
  SKINS, MAPS, skinById, mapById,
  loadGame, saveGame, buySkin, selectSkin, selectMap, addCoins, recordRun,
} from './content.js';

/* ------------------------------------------------------------------ save */
let save = loadGame(localStorage);
const persist = () => saveGame(save, localStorage);

/* ------------------------------------------------------------------ ui */
const $ = (id) => document.getElementById(id);
const ui = {
  lobby: $('lobby'), hud: $('hud'), controls: $('controls'), result: $('result'),
  coins: $('coinsValue'), best: $('bestValue'), skinsCoins: $('skinsCoins'),
  score: $('scoreValue'), trick: $('trickPopup'), hint: $('hint'),
  mapsSheet: $('mapsSheet'), skinsSheet: $('skinsSheet'), settingsSheet: $('settingsSheet'),
  mapsList: $('mapsList'), skinsList: $('skinsList'), toasts: $('toasts'),
  actionLabel: $('actionLabel'),
  resultTitle: $('resultTitle'), resultScore: $('resultScore'), resultCoins: $('resultCoins'),
  musicRange: $('musicRange'), sfxRange: $('sfxRange'), musicVal: $('musicVal'), sfxVal: $('sfxVal'),
};

/* ------------------------------------------------------------------ audio */
const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null, timer: null, started: false, nextTime: 0, chord: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.applyVolume();
    } catch (err) { this.ctx = null; }
  },
  applyVolume() {
    if (!this.ctx) return;
    const m = save.settings.muted ? 0 : save.settings.music;
    const s = save.settings.muted ? 0 : save.settings.sfx;
    this.musicGain.gain.value = m * 0.32;
    this.sfxGain.gain.value = s * 0.9;
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  tone({ freq = 440, to = null, dur = 0.15, type = 'sine', vol = 0.3, delay = 0 }) {
    if (!this.ctx || save.settings.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.03);
  },

  noise(dur = 0.2, vol = 0.2, freq = 900, q = 1) {
    if (!this.ctx || save.settings.muted) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(this.sfxGain);
    src.start();
  },

  whoosh() { this.noise(0.35, 0.18, 700, 0.8); this.tone({ freq: 220, to: 120, dur: 0.3, type: 'sine', vol: 0.1 }); },
  grab() { this.noise(0.12, 0.22, 380, 1.4); this.tone({ freq: 160, to: 90, dur: 0.12, type: 'square', vol: 0.13 }); },
  land() { this.noise(0.25, 0.26, 260, 1.1); this.tone({ freq: 90, to: 55, dur: 0.22, type: 'sine', vol: 0.2 }); },
  coin() { this.tone({ freq: 880, dur: 0.09, type: 'triangle', vol: 0.16 }); this.tone({ freq: 1320, dur: 0.14, type: 'sine', vol: 0.12, delay: 0.05 }); },
  trick(n) { [523, 659, 784].slice(0, Math.min(3, n)).forEach((f, i) => this.tone({ freq: f * (1 + i * 0.02), dur: 0.16, type: 'triangle', vol: 0.15, delay: i * 0.06 })); },
  click() { this.tone({ freq: 420, to: 560, dur: 0.06, type: 'triangle', vol: 0.14 }); },
  fail() { this.tone({ freq: 200, to: 110, dur: 0.28, type: 'sawtooth', vol: 0.14 }); },

  startMusic() {
    this.init();
    if (!this.ctx || this.started) return;
    this.started = true;
    const chords = [[196.0, 246.9, 293.7], [174.6, 220.0, 261.6], [164.8, 207.7, 246.9], [146.8, 185.0, 220.0]];
    this.nextTime = this.ctx.currentTime + 0.3;
    const schedule = () => {
      if (!this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 5) {
        const ch = chords[this.chord++ % chords.length];
        ch.forEach((f, i) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = i === 0 ? 'sine' : 'triangle';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, this.nextTime);
          g.gain.linearRampToValueAtTime(0.05, this.nextTime + 1.2);
          g.gain.linearRampToValueAtTime(0.0001, this.nextTime + 4.4);
          osc.connect(g).connect(this.musicGain);
          osc.start(this.nextTime); osc.stop(this.nextTime + 4.5);
        });
        this.nextTime += 4.6;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 1500);
  },
};

/* ------------------------------------------------------------------ three */
const stage = $('stage');
let renderer, scene, camera, clock;
let worldGroup = null;
let character = null;
let charParts = null;
let currentMap = null;
const camTarget = new THREE.Vector3(0, 2.6, 0);

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  resizeCamera();

  clock = new THREE.Clock();
  buildCharacter();
}

function resizeCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // хотим видеть примерно 7.6 метра по высоте
  const visibleHeight = 7.6;
  const dist = visibleHeight / (2 * Math.tan((40 * Math.PI / 180) / 2));
  camera.position.set(camTarget.x + 0.6, camTarget.y + 0.7, dist);
  camera.lookAt(camTarget);
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ материалы */
const MAT = {
  metal: () => new THREE.MeshStandardMaterial({ color: 0xb9c6d1, roughness: 0.32, metalness: 0.85 }),
  darkMetal: () => new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.45, metalness: 0.7 }),
  mat: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
};

function roundedBox(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/* ------------------------------------------------------------------ сцена карты */
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function skyTexture(top, mid, bottom) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clearScene() {
  if (worldGroup) { scene.remove(worldGroup); disposeGroup(worldGroup); worldGroup = null; }
  scene.background = null;
  scene.fog = null;
}

function buildMap(mapDef) {
  clearScene();
  currentMap = mapDef;
  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const tone = {
    yard: { top: '#7ea7bd', mid: '#a8c4d2', bottom: '#cdd8dc' },
    beach: { top: '#5fb6d6', mid: '#9fdcea', bottom: '#ffe3b8' },
    gym: { top: '#1e2733', mid: '#2b3644', bottom: '#39444f' },
    park: { top: '#7fc39a', mid: '#a9d9b9', bottom: '#d6ecdc' },
  }[mapDef.id] || { top: '#8fb6c9', mid: '#a9c3d1', bottom: '#cdd8dc' };

  scene.background = skyTexture(tone.top, tone.mid, tone.bottom);
  scene.fog = new THREE.Fog(new THREE.Color(mapDef.fog).getHex(), 28, 90);

  const hemi = new THREE.HemisphereLight(
    mapDef.id === 'gym' ? 0xcfd8e3 : 0xdff2ff,
    mapDef.id === 'gym' ? 0x30363d : 0xd8c9a8,
    mapDef.id === 'gym' ? 0.85 : 1.15
  );
  worldGroup.add(hemi);

  const sun = new THREE.DirectionalLight(mapDef.id === 'gym' ? 0xffffff : 0xfff2d8, mapDef.id === 'gym' ? 1.4 : 2.1);
  sun.position.set(6, 12, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0012;
  worldGroup.add(sun);
  worldGroup.add(sun.target);

  if (mapDef.id === 'yard') buildYard(mapDef);
  else if (mapDef.id === 'beach') buildBeach(mapDef);
  else if (mapDef.id === 'gym') buildGym(mapDef);
  else buildPark(mapDef);
}

/* ---------- Двор ---------- */
function buildYard(map) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), MAT.mat(0x9a9a94));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // стена сзади
  const wall = roundedBox(40, 9, 0.6, MAT.mat(0x8b6a55));
  wall.position.set(2, 4.5, -6);
  wall.receiveShadow = true;
  wall.castShadow = true;
  worldGroup.add(wall);

  // "кирпичи" полосами
  for (let i = 0; i < 14; i++) {
    const line = roundedBox(40, 0.06, 0.05, MAT.mat(0x7a5c49));
    line.position.set(2, 0.6 + i * 0.62, -5.65);
    worldGroup.add(line);
  }

  // бордюр
  const curb = roundedBox(40, 0.25, 0.8, MAT.mat(0xb0aca4));
  curb.position.set(2, 0.12, -5.2);
  curb.receiveShadow = true;
  worldGroup.add(curb);

  // бочки и ящик
  [[-3.6, 0.5, -3.2], [5.4, 0.5, -3.6]].forEach(([x, y, z], i) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 14), MAT.mat(i ? 0x4f6f8a : 0x8a4f3f));
    barrel.position.set(x, y, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    worldGroup.add(barrel);
  });
  const crate = roundedBox(1.1, 1.1, 1.1, MAT.mat(0x9c7a4d));
  crate.position.set(7.4, 0.55, -2.6);
  crate.castShadow = true;
  worldGroup.add(crate);

  // лавка
  const bench = roundedBox(2.4, 0.14, 0.5, MAT.mat(0x8a6b3f));
  bench.position.set(-5.6, 0.55, -1.4);
  bench.castShadow = true;
  worldGroup.add(bench);
  [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]].forEach(([dx, dz]) => {
    const leg = roundedBox(0.12, 0.55, 0.12, MAT.darkMetal());
    leg.position.set(-5.6 + dx * 0.95, 0.27, -1.4 + dz);
    worldGroup.add(leg);
  });

  map.bars.forEach((b) => worldGroup.add(makeBarOnPosts(b.x, b.y, 0x6f7d88)));
}

/* ---------- Пляж ---------- */
function buildBeach(map) {
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 44), MAT.mat(0xf0d29b));
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  worldGroup.add(sand);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 40, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1c93a8, roughness: 0.25, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.05, -22);
  worldGroup.add(sea);

  const foam = new THREE.Mesh(new THREE.PlaneGeometry(120, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.02, -11.8);
  worldGroup.add(foam);

  // зонт
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), MAT.mat(0xf4f0e6));
  pole.position.set(-4.6, 1.5, -2.4);
  worldGroup.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2, 0.8, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6b57, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.set(-4.6, 3.1, -2.4);
  canopy.castShadow = true;
  worldGroup.add(canopy);

  // пальмы
  [[6.2, -4.2], [8.6, -6.4], [-7.6, -5]].forEach(([x, z], i) => worldGroup.add(makePalm(x, z, 0.9 + i * 0.08)));

  // полотенца
  [[-2.2, -1.2], [3.4, -2.2]].forEach(([x, z], i) => {
    const towel = roundedBox(1.6, 0.04, 0.8, MAT.mat(i ? 0x35d0c0 : 0xffc94a));
    towel.position.set(x, 0.03, z);
    worldGroup.add(towel);
  });

  map.bars.forEach((b) => worldGroup.add(makeBarOnPosts(b.x, b.y, 0xa8b4bd)));
}

/* ---------- Зал ---------- */
function buildGym(map) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), MAT.mat(0x3b4450));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  worldGroup.add(floor);

  // стены
  const back = roundedBox(34, 10, 0.5, MAT.mat(0x2b3644));
  back.position.set(0, 5, -6);
  back.receiveShadow = true;
  worldGroup.add(back);

  // панели на стене
  for (let i = 0; i < 8; i++) {
    const panel = roundedBox(3.4, 1.6, 0.12, MAT.mat(i % 2 ? 0x33404f : 0x2f3b49));
    panel.position.set(-12 + i * 3.9, 6.4, -5.65);
    worldGroup.add(panel);
  }

  // маты
  const matFloor = roundedBox(9, 0.12, 5, MAT.mat(0x1f7a6b));
  matFloor.position.set(0, 0.06, -1.2);
  matFloor.receiveShadow = true;
  worldGroup.add(matFloor);

  // стойка с блинами
  const rackMat = MAT.darkMetal();
  [-6.2, -5.0].forEach((x) => {
    const post = roundedBox(0.16, 2.2, 0.16, rackMat);
    post.position.set(x, 1.1, -4.2);
    post.castShadow = true;
    worldGroup.add(post);
  });
  const railL = roundedBox(1.5, 0.12, 0.12, rackMat);
  railL.position.set(-5.6, 0.5, -4.2);
  worldGroup.add(railL);

  [[-5.9, 0.55, 0.45], [-5.4, 0.5, 0.38], [-5.4, 0.62, 0.3]].forEach(([x, y, r], i) => {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 16), MAT.mat(i % 2 ? 0x232a33 : 0x2f3944));
    plate.rotation.x = Math.PI / 2;
    plate.position.set(x, 0.6, -4.2 + i * 0.16);
    plate.castShadow = true;
    worldGroup.add(plate);
  });

  // стойка для гантелей
  const bench = roundedBox(2.2, 0.2, 0.6, MAT.mat(0x232a33));
  bench.position.set(5.6, 0.5, -3.4);
  bench.castShadow = true;
  worldGroup.add(bench);
  [-0.8, 0.8].forEach((dx) => {
    const leg = roundedBox(0.14, 0.5, 0.5, MAT.darkMetal());
    leg.position.set(5.6 + dx, 0.25, -3.4);
    worldGroup.add(leg);
  });

  // лампы
  [[-4, 8.4], [4, 8.4]].forEach(([x, y]) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 1.4 }));
    lamp.position.set(x, y, -3.4);
    worldGroup.add(lamp);
  });

  map.bars.forEach((b) => worldGroup.add(makeWallBar(b.x, b.y)));
}

/* ---------- Парк ---------- */
function buildPark(map) {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 44), MAT.mat(0x7fae6b));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  worldGroup.add(grass);

  // дорожка
  const path = new THREE.Mesh(new THREE.PlaneGeometry(60, 2.4), MAT.mat(0xb9b3a2));
  path.rotation.x = -Math.PI / 2;
  path.position.set(2, 0.01, -1.2);
  worldGroup.add(path);

  // деревья
  [[-6.4, -5.6], [7.2, -5.2], [-2.2, -7], [10.4, -6.4]].forEach(([x, z], i) => worldGroup.add(makeTree(x, z, 1 + i * 0.07)));

  // кусты
  [[-4.4, -3.6], [5.2, -3.4], [1.2, -4.2]].forEach(([x, z], i) => {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.75 + i * 0.1, 10, 8), MAT.mat(0x4f8f52));
    bush.position.set(x, 0.55, z);
    bush.scale.y = 0.75;
    bush.castShadow = true;
    worldGroup.add(bush);
  });

  // фонарь
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4, 8), MAT.darkMetal());
  pole.position.set(-7.6, 2, -2.6);
  worldGroup.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 1.6 }));
  head.position.set(-7.6, 4.05, -2.6);
  worldGroup.add(head);

  map.bars.forEach((b) => worldGroup.add(makeBarOnPosts(b.x, b.y, 0x8a9aa6)));
}

/* ---------- снаряды ---------- */
function makeBar(bar, y, radius, z, matColor) {
  const group = new THREE.Group();
  const barMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 2.6, 14),
    new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.28, metalness: 0.9 })
  );
  barMesh.rotation.x = Math.PI / 2;         // ось вдоль Z — перекладина "смотрит" в камеру
  barMesh.position.set(bar, y, z);
  barMesh.castShadow = true;
  group.add(barMesh);
  return group;
}

function makeBarOnPosts(x, y, color) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.85 });
  [-1.15, 1.15].forEach((dz) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, y, 10), metal);
    post.position.set(x, y / 2, dz);
    post.castShadow = true;
    g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 12), metal);
    foot.position.set(x, 0.05, dz);
    g.add(foot);
  });
  g.add(makeBar(x, y, 0.055, 0, color));
  return g;
}

function makeWallBar(x, y) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc2ccd6, roughness: 0.3, metalness: 0.9 });
  [-1.15, 1.15].forEach((dz) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.9), metal);
    arm.position.set(x, y, dz - 0.35);
    g.add(arm);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), metal);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(x, y, -5.6);
    g.add(plate);
  });
  g.add(makeBar(x, y, 0.055, 0, 0xc2ccd6));
  return g;
}

/* ---------- растительность ---------- */
function makePalm(x, z, scale) {
  const g = new THREE.Group();
  const trunkMat = MAT.mat(0x9a6b3f);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e52, roughness: 0.85, side: THREE.DoubleSide });
  const h = 5 * scale;
  for (let i = 1; i <= 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - i * 0.014, 0.18 - i * 0.014, h / 5 + 0.08, 7), trunkMat);
    seg.position.set(Math.pow(i / 5, 2) * 0.7 * scale, (i - 0.5) * (h / 5), 0);
    seg.rotation.z = -0.09 * (i / 5);
    seg.castShadow = true;
    g.add(seg);
  }
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), leafMat);
    leaf.scale.set(1.4 * scale, 0.1 * scale, 0.45 * scale);
    leaf.position.set(0.7 * scale + Math.cos(i * 0.9) * 1.1 * scale, h, Math.sin(i * 0.9) * 0.85 * scale);
    leaf.rotation.y = i * 0.9;
    leaf.rotation.z = -0.4 + (i % 2) * 0.2;
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

function makeTree(x, z, scale) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, 3.2 * scale, 8), MAT.mat(0x7c5a3a));
  trunk.position.y = 1.6 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const crownMat = MAT.mat(0x4c9455);
  [[0, 3.5, 0, 1.5], [-0.9, 3.0, 0.2, 1.1], [0.9, 3.1, -0.2, 1.15], [0.1, 4.2, 0.1, 1.05]].forEach(([dx, dy, dz, r]) => {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 10, 8), crownMat);
    blob.position.set(dx * scale, dy * scale, dz * scale);
    blob.castShadow = true;
    g.add(blob);
  });
  g.position.set(x, 0, z);
  return g;
}

/* ------------------------------------------------------------------ персонаж */
const POSES = {
  idle: { spine: 0, armL: -0.15, armR: 0.15, elbowL: -0.1, elbowR: 0.1, hipL: 0.05, hipR: -0.05, kneeL: -0.1, kneeR: 0.1, head: 0 },
  hang: { spine: 0, armL: -2.86, armR: 2.86, elbowL: -0.06, elbowR: 0.06, hipL: 0.12, hipR: -0.12, kneeL: -0.3, kneeR: 0.3, head: 0.05 },
  air: { spine: 0, armL: -1.65, armR: 1.65, elbowL: -0.5, elbowR: 0.5, hipL: 0.3, hipR: -0.3, kneeL: -0.25, kneeR: 0.25, head: 0 },
  tuck: { spine: 0.25, armL: -1.05, armR: 1.05, elbowL: -1.5, elbowR: 1.5, hipL: 2.0, hipR: 1.9, kneeL: -2.2, kneeR: -2.1, head: 0.3 },
  arch: { spine: -0.25, armL: -2.5, armR: 2.5, elbowL: -0.2, elbowR: 0.2, hipL: -0.35, hipR: 0.35, kneeL: -0.1, kneeR: 0.1, head: -0.2 },
  land: { spine: 0.35, armL: -1.1, armR: 1.1, elbowL: -0.7, elbowR: 0.7, hipL: 0.9, hipR: 0.85, kneeL: -1.5, kneeR: -1.45, head: 0.2 },
};

function buildCharacter() {
  if (character) { scene.remove(character); disposeGroup(character); }

  const skin = skinById(save.skin);
  const c = skin.colors;
  const bulk = skin.bulk || 1;

  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.skin), roughness: 0.82 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.shorts), roughness: 0.9 });
  const shirtMat = c.shirt ? new THREE.MeshStandardMaterial({ color: new THREE.Color(c.shirt), roughness: 0.88 }) : skinMat;
  const capMat = c.cap ? new THREE.MeshStandardMaterial({ color: new THREE.Color(c.cap), roughness: 0.85 }) : null;
  const shoeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.shoe || '#ffffff'), roughness: 0.8 });

  if (skin.glow) {
    skinMat.emissive = new THREE.Color(c.skin);
    skinMat.emissiveIntensity = 0.25;
    shortsMat.emissive = new THREE.Color(c.shorts);
    shortsMat.emissiveIntensity = 0.3;
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // торс: центр масс примерно здесь
  const torsoW = 0.46 * bulk;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * bulk, 0.42, 4, 10), shirtMat);
  torso.position.y = 0.12;
  torso.scale.set(torsoW / 0.4, 1, 0.75);
  torso.castShadow = true;
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24 * bulk, 12, 10), shirtMat);
  chest.position.set(0, 0.34, 0);
  chest.scale.set(1.05, 0.7, 0.7);
  chest.castShadow = true;
  body.add(chest);

  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.18 * bulk, 0.14, 4, 10), shortsMat);
  pelvis.position.y = -0.18;
  pelvis.scale.set(torsoW / 0.36, 1, 0.8);
  pelvis.castShadow = true;
  body.add(pelvis);

  // голова
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
  neck.position.y = 0.52;
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), skinMat);
  head.position.y = 0.66;
  head.castShadow = true;
  body.add(head);

  if (capMat) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.7;
    body.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.14), capMat);
    visor.position.set(0, 0.71, 0.13);
    body.add(visor);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.148, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), MAT.mat(0x2a1c14));
    hair.position.y = 0.68;
    body.add(hair);
  }

  const parts = { root, body, arms: [], legs: [], head };
  const limb = (r, len, mat, shoe) => {
    const g = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
    seg.position.y = -len / 2 - r * 0.4;
    seg.castShadow = true;
    g.add(seg);
    if (shoe) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, 0.09, r * 3.2), shoe);
      foot.position.set(0, -len - r * 0.5, r * 0.6);
      foot.castShadow = true;
      g.add(foot);
    }
    return g;
  };

  // руки (плечи)
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (0.2 * bulk + 0.04), 0.34, 0);
    const upper = limb(0.055 * bulk, 0.26, skinMat, null);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    const fore = limb(0.05 * bulk, 0.24, skinMat, null);
    elbow.add(fore);
    shoulder.add(elbow);
    body.add(shoulder);
    parts.arms.push({ side, shoulder, elbow });
  });

  // ноги (бёдра)
  [-1, 1].forEach((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11 * bulk, -0.26, 0);
    const thigh = limb(0.075 * bulk, 0.36, shortsMat, null);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    const shin = limb(0.06 * bulk, 0.34, skinMat, shoeMat);
    knee.add(shin);
    hip.add(knee);
    body.add(hip);
    parts.legs.push({ side, hip, knee });
  });

  root.userData.parts = parts;
  root.userData.pose = Object.assign({}, POSES.idle);
  character = root;
  charParts = parts;
  scene.add(root);
}

function applyPose(dt, mode) {
  if (!charParts) return;
  const target = POSES[mode] || POSES.idle;
  const cur = character.userData.pose;
  const k = Math.min(1, dt * 11);

  const lerpTo = (key, value) => { cur[key] += (value - cur[key]) * k; };

  lerpTo('spine', target.spine);
  lerpTo('head', target.head);
  lerpTo('armL', target.armL); lerpTo('armR', target.armR);
  lerpTo('elbowL', target.elbowL); lerpTo('elbowR', target.elbowR);
  lerpTo('hipL', target.hipL); lerpTo('hipR', target.hipR);
  lerpTo('kneeL', target.kneeL); lerpTo('kneeR', target.kneeR);

  charParts.body.rotation.z = cur.spine;
  charParts.head.rotation.z = cur.head;

  const [armL, armR] = charParts.arms;
  armL.shoulder.rotation.z = cur.armL;
  armR.shoulder.rotation.z = cur.armR;
  armL.elbow.rotation.z = cur.elbowL;
  armR.elbow.rotation.z = cur.elbowR;

  const [legL, legR] = charParts.legs;
  legL.hip.rotation.z = cur.hipL;
  legR.hip.rotation.z = cur.hipR;
  legL.knee.rotation.z = cur.kneeL;
  legR.knee.rotation.z = cur.kneeR;
}

/* ------------------------------------------------------------------ игра */
let sim = null;
let score = 0;
let combo = 0;
let sessionCoins = 0;
let running = false;
let resultTimer = 0;
let hintTimer = 0;
const input = { pump: false, tuck: false, arch: false, grab: false, release: false };
let lastPhase = 'hang';

function startRun() {
  Sound.resume();
  Sound.startMusic();
  const map = mapById(save.map);
  sim = new Sim({ bars: map.bars.map((b) => ({ x: b.x, y: b.y })) });
  score = 0;
  combo = 0;
  sessionCoins = 0;
  ui.score.textContent = '0';
  ui.lobby.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.controls.classList.remove('hidden');
  ui.result.classList.add('hidden');
  ui.hint.classList.remove('fade');
  hintTimer = 0;
  running = true;
  resultTimer = 0;
  camTarget.set(sim.x, 3.0, 0);
}

function endRun(clean, flips) {
  running = false;
  const delta = trickScore({ flips, clean }).score + score * 0;
  score += delta;
  const coins = coinsFor(delta + Math.round(score * 0.05));
  sessionCoins += coins;
  addCoins(save, coins);
  const isRecord = recordRun(save, score, flips);
  persist();

  ui.resultTitle.textContent = clean ? 'ЧИСТОЕ ПРИЗЕМЛЕНИЕ' : 'ПРИЗЕМЛЕНИЕ';
  ui.resultScore.textContent = score;
  ui.resultCoins.textContent = sessionCoins;
  ui.result.classList.remove('hidden');
  if (isRecord) toast('Новый рекорд: ' + score, '');
  refreshLobby();
  if (clean) Sound.trick(3); else Sound.fail();
}

function respawn() {
  ui.result.classList.add('hidden');
  const map = mapById(save.map);
  sim = new Sim({ bars: map.bars.map((b) => ({ x: b.x, y: b.y })) });
  score = 0;
  sessionCoins = 0;
  ui.score.textContent = '0';
  running = true;
}

function onEvent(ev) {
  if (ev.type === 'release') {
    combo = 0;
    Sound.whoosh();
    apiPulse(ui.controls.querySelector('.action'), 'pressed');
  } else if (ev.type === 'flip') {
    Sound.tone({ freq: 400 + ev.flips * 90, dur: 0.09, type: 'triangle', vol: 0.1 });
  } else if (ev.type === 'grab') {
    const t = trickScore({ flips: ev.flips, regrab: true });
    score += t.score;
    const coins = coinsFor(t.score);
    sessionCoins += coins;
    addCoins(save, coins);
    ui.score.textContent = score;
    showTrick(t.name + ' +' + t.score);
    Sound.grab(); Sound.trick(2);
  } else if (ev.type === 'land') {
    Sound.land();
    endRun(ev.clean, ev.flips);
  } else if (ev.type === 'sun') {
    score += 60;
    ui.score.textContent = score;
    showTrick('СОЛНЦЕ +60');
    Sound.trick(1);
  }
}

function apiPulse(el, cls) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 120);
}

let trickTimeout = null;
function showTrick(text) {
  ui.trick.textContent = text;
  ui.trick.classList.add('show');
  clearTimeout(trickTimeout);
  trickTimeout = setTimeout(() => ui.trick.classList.remove('show'), 1100);
}

/* ------------------------------------------------------------------ цикл */
let lastCamX = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  if (sim) {
    if (running) {
      // физика фиксированным шагом
      const steps = Math.max(1, Math.round(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        sim.step(h, input);
        sim.events().forEach(onEvent);
      }
      input.release = false;

      if (hintTimer < 6) {
        hintTimer += dt;
        if (hintTimer >= 6) ui.hint.classList.add('fade');
      }
    } else {
      resultTimer += dt;
    }

    // персонаж
    if (character) {
      character.position.set(sim.x, sim.y, 0);
      character.rotation.z = -sim.angle;

      let mode = 'air';
      if (sim.phase === 'hang') mode = (input.tuck ? 'tuck' : input.arch ? 'arch' : 'hang');
      else if (sim.phase === 'landed') mode = 'land';
      else mode = input.tuck ? 'tuck' : input.arch ? 'arch' : 'air';
      applyPose(dt, mode);
    }

    // метка действия
    const wantGrab = sim.phase === 'air';
    ui.actionLabel.textContent = wantGrab ? 'ХВАТ' : 'ОТПУСТИТЬ';

    // камера
    const map = mapById(save.map);
    const tx = clamp(sim.x, map.bounds.min, map.bounds.max);
    lastCamX += (tx - lastCamX) * Math.min(1, dt * 4);
    camTarget.x += (lastCamX - camTarget.x) * Math.min(1, dt * 4);
    camTarget.y += ((sim.y * 0.35 + 2.2) - camTarget.y) * Math.min(1, dt * 2.2);
    const dist = 7.6 / (2 * Math.tan((40 * Math.PI / 180) / 2));
    camera.position.set(camTarget.x + 0.5, camTarget.y + 0.55, dist);
    camera.lookAt(camTarget);
  }

  renderer.render(scene, camera);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ лобби и магазины */
function toast(text, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  ui.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function refreshLobby() {
  ui.coins.textContent = save.coins;
  ui.best.textContent = save.best;
  ui.skinsCoins.textContent = save.coins;
}

function renderMaps() {
  ui.mapsList.innerHTML = '';
  MAPS.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'map-card' + (save.map === m.id ? ' active' : '');
    card.innerHTML = `
      <div class="map-swatch" style="background:linear-gradient(160deg, ${m.sky}, ${m.ground})"></div>
      <div class="map-info">
        <div class="map-name">${m.name}</div>
        <div class="map-desc">${m.desc}</div>
      </div>
      <div class="map-tag">${save.map === m.id ? 'выбрана' : m.tag}</div>`;
    card.addEventListener('click', () => {
      selectMap(save, m.id);
      persist();
      buildMap(mapById(save.map));
      resetCharacterToBar();
      renderMaps();
      Sound.click();
    });
    ui.mapsList.appendChild(card);
  });
}

function renderSkins() {
  ui.skinsList.innerHTML = '';
  SKINS.forEach((s) => {
    const owned = save.owned.includes(s.id);
    const active = save.skin === s.id;
    const card = document.createElement('div');
    card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');
    const bg = `linear-gradient(140deg, ${s.colors.shorts}, ${s.colors.skin})`;
    card.innerHTML = `
      <div class="skin-avatar" style="background:${bg}">${s.bulk > 1.2 ? '💪' : '🧍'}</div>
      <div class="skin-info">
        <div class="skin-name">${s.name}</div>
        <div class="skin-desc">${s.desc}</div>
        <div class="skin-price">${owned ? 'куплен' : s.price + ' 🪙'}</div>
      </div>
      <button class="buy-btn${active ? ' equipped' : ''}">${active ? 'надет' : owned ? 'надеть' : 'купить'}</button>`;
    const btn = card.querySelector('button');
    if (active) btn.disabled = true;
    else {
      btn.addEventListener('click', () => {
        if (!owned) {
          const res = buySkin(save, s.id);
          if (!res.ok) {
            Sound.fail();
            toast('Не хватает ' + res.need + ' 🪙', 'bad');
            return;
          }
          Sound.coin();
        } else Sound.click();
        selectSkin(save, s.id);
        persist();
        buildCharacter();
        resetCharacterToBar();
        renderSkins();
        refreshLobby();
      });
    }
    ui.skinsList.appendChild(card);
  });
}

function resetCharacterToBar() {
  const map = mapById(save.map);
  sim = new Sim({ bars: map.bars.map((b) => ({ x: b.x, y: b.y })) });
  lastCamX = clamp(sim.x, map.bounds.min, map.bounds.max);
  camTarget.set(lastCamX, 3.0, 0);
  if (character) {
    character.position.set(sim.x, sim.y, 0);
    character.rotation.z = -sim.angle;
  }
}

/* ------------------------------------------------------------------ ввод */
function bindControls() {
  const pump = $('pumpBtn');
  const tuck = $('tuckBtn');
  const action = $('actionBtn');

  const hold = (el, key) => {
    const on = (e) => { e.preventDefault(); input[key] = true; el.classList.add('pressed'); };
    const off = (e) => { e.preventDefault(); input[key] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  hold(pump, 'pump');
  hold(tuck, 'tuck');

  const act = (e) => {
    e.preventDefault();
    if (!running || !sim) return;
    if (sim.phase === 'hang') input.release = true;
    else input.grab = true;
    apiPulse(action, 'pressed');
  };
  action.addEventListener('pointerdown', act);

  // клавиатура для теста на компьютере
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { input.pump = true; pump.classList.add('pressed'); }
    if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'ShiftLeft') { input.tuck = true; tuck.classList.add('pressed'); }
    if (e.code === 'Space') {
      e.preventDefault();
      if (running && sim) { if (sim.phase === 'hang') input.release = true; else input.grab = true; }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { input.pump = false; pump.classList.remove('pressed'); }
    if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'ShiftLeft') { input.tuck = false; tuck.classList.remove('pressed'); }
  });
}

function bindUi() {
  $('playBtn').addEventListener('click', () => { Sound.click(); startRun(); });
  $('againBtn').addEventListener('click', () => { Sound.click(); respawn(); });
  $('pauseBtn').addEventListener('click', () => {
    Sound.click();
    running = false;
    ui.resultTitle.textContent = 'ПАУЗА';
    ui.resultScore.textContent = score;
    ui.resultCoins.textContent = sessionCoins;
    ui.result.classList.remove('hidden');
  });

  const openSheet = (el, render) => {
    if (render) render();
    el.classList.remove('hidden');
    Sound.click();
  };
  $('mapsBtn').addEventListener('click', () => openSheet(ui.mapsSheet, renderMaps));
  $('skinsBtn').addEventListener('click', () => openSheet(ui.skinsSheet, renderSkins));
  $('settingsBtn').addEventListener('click', () => openSheet(ui.settingsSheet));

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = $(btn.getAttribute('data-close'));
      if (el) el.classList.add('hidden');
      Sound.click();
    });
  });
  [ui.mapsSheet, ui.skinsSheet, ui.settingsSheet].forEach((sheet) => {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.add('hidden'); });
  });

  ui.musicRange.addEventListener('input', () => {
    save.settings.music = Number(ui.musicRange.value) / 100;
    ui.musicVal.textContent = ui.musicRange.value;
    Sound.applyVolume(); persist();
  });
  ui.sfxRange.addEventListener('input', () => {
    save.settings.sfx = Number(ui.sfxRange.value) / 100;
    ui.sfxVal.textContent = ui.sfxRange.value;
    Sound.applyVolume(); persist();
  });
  ui.sfxRange.addEventListener('change', () => Sound.coin());

  $('muteBtn').addEventListener('click', () => {
    save.settings.muted = !save.settings.muted;
    $('muteBtn').textContent = save.settings.muted ? 'Включить звук' : 'Выключить звук';
    Sound.applyVolume(); persist();
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Сбросить весь прогресс?')) return;
    localStorage.removeItem('turnikman.save.v1');
    location.reload();
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeCamera();
  });
}

/* ------------------------------------------------------------------ старт */
function boot() {
  initThree();
  buildMap(mapById(save.map));
  resetCharacterToBar();
  bindControls();
  bindUi();

  ui.musicRange.value = Math.round(save.settings.music * 100);
  ui.sfxRange.value = Math.round(save.settings.sfx * 100);
  ui.musicVal.textContent = ui.musicRange.value;
  ui.sfxVal.textContent = ui.sfxRange.value;
  $('muteBtn').textContent = save.settings.muted ? 'Включить звук' : 'Выключить звук';
  refreshLobby();

  tick();
}

try {
  boot();
} catch (err) {
  console.error(err);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font:600 14px system-ui;color:#fff;background:#0d1117;z-index:99';
  el.textContent = 'Не удалось запустить 3D: ' + (err && err.message ? err.message : err);
  document.body.appendChild(el);
}

/* отладочный доступ для тестов */
window.__turnikman = {
  get save() { return save; },
  get sim() { return sim; },
  get score() { return score; },
  startRun, respawn, resetCharacterToBar, buildMap, buildCharacter,
  PHYS, SKINS, MAPS,
};
