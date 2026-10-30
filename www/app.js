/* =====================================================================
   STRONG TYCOON — пляжный зал · 3D-тайкун
   Один файл со всей игрой: сцена, персонажи, экономика, звук, интерфейс.
   ===================================================================== */

import * as THREE from './vendor/three.module.js';
import {
  loadState, saveState,
  TIERS, UPGRADES, UPGRADE_ORDER, buyUpgrade, upgradeCost,
  buyTier, activeTier, clientPayout, clientDuration,
  stationCount, spawnInterval, timeMultiplier,
  rankFor, formatMoney,
} from './economy.js';

/* ------------------------------------------------------------------ config */
const CONFIG = {
  viewWidth: 12.2,          // сколько мира видно по ширине
  tilt: 21 * Math.PI / 180, // наклон камеры вниз (объём)
  walkSpeed: 2.6,
  exitDistance: 11,
  crowdBonusStep: 0.08,
  crowdBonusMax: 0.6,
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ------------------------------------------------------------------ state */
let state = loadState(localStorage);

const ui = {
  money: document.getElementById('moneyValue'),
  rank: document.getElementById('rankName'),
  clientsNow: document.getElementById('clientsNow'),
  stationsMax: document.getElementById('stationsMax'),
  tierName: document.getElementById('tierName'),
  timeScale: document.getElementById('timeScale'),
  hud: document.getElementById('hud'),
  bottomBar: document.getElementById('bottomBar'),
  splash: document.getElementById('splash'),
  splashStatus: document.getElementById('splashStatus'),
  playBtn: document.getElementById('playBtn'),
  resetGameBtn: document.getElementById('resetGameBtn'),
  settingsSheet: document.getElementById('settingsSheet'),
  upgradesSheet: document.getElementById('upgradesSheet'),
  catalogSheet: document.getElementById('catalogSheet'),
  upgradeList: document.getElementById('upgradeList'),
  catalogList: document.getElementById('catalogList'),
  sheetMoney: document.getElementById('sheetMoney'),
  catalogMoney: document.getElementById('catalogMoney'),
  toasts: document.getElementById('toasts'),
  floaters: document.getElementById('floaters'),
  musicRange: document.getElementById('musicRange'),
  sfxRange: document.getElementById('sfxRange'),
  musicVal: document.getElementById('musicVal'),
  sfxVal: document.getElementById('sfxVal'),
  muteBtn: document.getElementById('muteBtn'),
};

/* ------------------------------------------------------------------ audio */
const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  musicTimer: null, started: false, nextChordTime: 0, chordIndex: 0,

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
      this.applyVolumes();
    } catch (err) { this.ctx = null; }
  },

  applyVolumes() {
    if (!this.ctx) return;
    const m = state.settings.muted ? 0 : state.settings.music;
    const s = state.settings.muted ? 0 : state.settings.sfx;
    this.musicGain.gain.value = m * 0.5;
    this.sfxGain.gain.value = s * 0.9;
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  /* --- короткий тон --- */
  tone({ freq = 440, to = null, dur = 0.15, type = 'sine', vol = 0.3, delay = 0, attack = 0.005 }) {
    if (!this.ctx || state.settings.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  click() { this.tone({ freq: 520, to: 700, dur: 0.07, type: 'triangle', vol: 0.18 }); },
  coin(n) {
    const base = 780 + Math.min(n || 0, 10) * 40;
    this.tone({ freq: base, dur: 0.09, type: 'triangle', vol: 0.22 });
    this.tone({ freq: base * 1.5, dur: 0.13, type: 'sine', vol: 0.18, delay: 0.06 });
  },
  purchase() {
    this.tone({ freq: 660, dur: 0.08, type: 'triangle', vol: 0.26 });
    this.tone({ freq: 990, dur: 0.12, type: 'triangle', vol: 0.22, delay: 0.07 });
    this.tone({ freq: 1320, dur: 0.22, type: 'sine', vol: 0.18, delay: 0.14 });
  },
  error() { this.tone({ freq: 200, to: 120, dur: 0.18, type: 'sawtooth', vol: 0.16 }); },
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.2, delay: i * 0.09 }));
  },

  /* --- фоновая музыка: медленные аккорды + шум прибоя --- */
  startMusic() {
    this.init();
    if (!this.ctx || this.started) return;
    this.started = true;
    this.startSurf();

    const chords = [
      [220.0, 277.2, 329.6],   // A
      [174.6, 220.0, 261.6],   // F
      [196.0, 246.9, 293.7],   // G
      [164.8, 207.7, 246.9],   // E
    ];
    const barSeconds = 4.4;
    this.nextChordTime = this.ctx.currentTime + 0.4;

    const schedule = () => {
      if (!this.ctx) return;
      while (this.nextChordTime < this.ctx.currentTime + 6) {
        const chord = chords[this.chordIndex % chords.length];
        const t0 = this.nextChordTime;
        // пэд
        chord.forEach((f, i) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = i === 0 ? 'sine' : 'triangle';
          osc.frequency.value = f * (i === 2 ? 2 : 1);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.055, t0 + 1.1);
          g.gain.linearRampToValueAtTime(0.0001, t0 + barSeconds * 0.98);
          osc.connect(g).connect(this.musicGain);
          osc.start(t0);
          osc.stop(t0 + barSeconds);
        });
        // редкая мелодическая нота
        if (Math.random() < 0.75) {
          const note = chord[(Math.random() * chord.length) | 0] * 4;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = note;
          const at = t0 + rand(0.4, 2.6);
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(0.035, at + 0.12);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
          osc.connect(g).connect(this.musicGain);
          osc.start(at);
          osc.stop(at + 1.6);
        }
        this.chordIndex++;
        this.nextChordTime += barSeconds;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 1500);
  },

  startSurf() {
    if (!this.ctx) return;
    const len = 4;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 2.4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    const g = this.ctx.createGain();
    g.gain.value = 0.15;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(this.musicGain);
    src.start();
  },
};

/* ------------------------------------------------------------------ three */
const stage = document.getElementById('stage');
let renderer, scene, camera, clock;
let seaMesh, sunGroup, clouds = [];
const world = { stations: [], unlocked: 0 };

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xc4e8f0, 96, 190);

  camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 220);
  camera.position.set(0, 6, 40);
  camera.lookAt(0, 2.4, 0);
  fitCamera();

  /* --- свет --- */
  const hemi = new THREE.HemisphereLight(0xd9f4ff, 0xe8c793, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0cf, 2.1);
  sun.position.set(9, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x9fd8ff, 0.5);
  fill.position.set(-10, 8, 6);
  scene.add(fill);

  buildBeach();
  buildGym();
  buildProps();
  clock = new THREE.Clock();
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2e7fb8');
  grad.addColorStop(0.35, '#6cc0dd');
  grad.addColorStop(0.62, '#b6e6f0');
  grad.addColorStop(0.78, '#ffe6c0');
  grad.addColorStop(1.0, '#ffd39a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CAM_TARGET = new THREE.Vector3(0, 2.7, 0);

function fitCamera() {
  if (!camera) return;
  const aspect = window.innerWidth / window.innerHeight;
  const halfW = CONFIG.viewWidth / 2;
  const halfH = halfW / aspect;

  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;

  // камера смотрит на зал сверху-сбоку: так видно и снаряды, и песок с морем
  const dir = new THREE.Vector3(0.06, -Math.sin(CONFIG.tilt), -Math.cos(CONFIG.tilt)).normalize();
  camera.position.copy(CAM_TARGET).addScaledVector(dir, -70);
  camera.lookAt(CAM_TARGET);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- beach */
function buildBeach() {
  // песок
  const sandGeo = new THREE.PlaneGeometry(190, 54, 1, 1);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: 0xf0d29b, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  // мокрый песок у кромки
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(190, 6), new THREE.MeshStandardMaterial({ color: 0xd8b688, roughness: 0.85 }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(0, 0.008, -25.2);
  scene.add(wet);

  // море
  const seaGeo = new THREE.PlaneGeometry(220, 70, 40, 14);
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x1c93a8, roughness: 0.28, metalness: 0.15,
    transparent: true, opacity: 0.97, flatShading: true,
  });
  seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set(0, -0.06, -60);
  seaMesh.receiveShadow = false;
  scene.add(seaMesh);
  seaMesh.userData.base = seaGeo.attributes.position.array.slice();

  // пена у берега
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.03, -26.2);
  scene.add(foam);

  // солнце
  sunGroup = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.7, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
  );
  sunGroup.add(disc);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22 })
  );
  sunGroup.add(halo);
  sunGroup.position.set(-6.5, 13.5, -12);
  scene.add(sunGroup);

  // облака
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const puffs = 3 + ((Math.random() * 3) | 0);
    for (let p = 0; p < puffs; p++) {
      const r = rand(0.8, 1.7);
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
      s.position.set(p * rand(1.1, 1.7) - 1.5, rand(-0.3, 0.4), rand(-0.4, 0.4));
      s.scale.y = 0.62;
      g.add(s);
    }
    g.position.set(rand(-26, 26), rand(15, 22), rand(-46, -26));
    g.userData.speed = rand(0.12, 0.4);
    scene.add(g);
    clouds.push(g);
  }

  // пальмы
  [-9.6, 9.3, -13.5, 12.6].forEach((x, i) => {
    const palm = makePalm(rand(0.85, 1.15));
    palm.position.set(x, 0, -6 - i * 2.2);
    scene.add(palm);
  });
}

function makePalm(scale) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e52, roughness: 0.85, side: THREE.DoubleSide });

  const h = 5.4 * scale;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= 5; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16 - i * 0.015, 0.19 - i * 0.015, h / 5 + 0.1, 7),
      trunkMat
    );
    const bend = Math.pow(i / 5, 2) * 0.9 * scale;
    seg.position.set(bend, (i - 0.5) * (h / 5), 0);
    seg.rotation.z = -0.1 * (i / 5);
    seg.castShadow = true;
    g.add(seg);
    prev = seg.position;
  }

  const crown = new THREE.Group();
  crown.position.copy(prev).add(new THREE.Vector3(0.12, h / 10, 0));
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), leafMat);
    leaf.scale.set(1.5 * scale, 0.12 * scale, 0.5 * scale);
    leaf.position.set(Math.cos(i * 0.9) * 1.15 * scale, -0.25 * scale, Math.sin(i * 0.9) * 0.9 * scale);
    leaf.rotation.y = i * 0.9;
    leaf.rotation.z = -0.45 + (i % 2) * 0.2;
    leaf.castShadow = true;
    crown.add(leaf);
  }
  g.add(crown);
  return g;
}

function buildProps() {
  // зонт
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xff6b57, roughness: 0.8, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.7 });
  const um = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), poleMat);
  pole.position.y = 1.6;
  pole.castShadow = true;
  um.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 12, 1, true), umbrellaMat);
  canopy.position.y = 3.2;
  canopy.castShadow = true;
  um.add(canopy);
  um.position.set(-6.2, 0, 5.4);
  scene.add(um);

  // лежаки
  const towelMat = new THREE.MeshStandardMaterial({ color: 0x35d0c0, roughness: 0.9 });
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  [-4.6, -3.0].forEach((x, i) => {
    const bed = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.95), bedMat);
    frame.position.y = 0.42;
    frame.castShadow = true;
    bed.add(frame);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), towelMat.clone());
    towel.material.color.setHex(i ? 0xffc94a : 0x35d0c0);
    towel.position.set(0.15, 0.51, 0);
    bed.add(towel);
    [-0.85, 0.85].forEach((dx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), poleMat);
      leg.position.set(dx, 0.21, 0.3);
      bed.add(leg);
      const leg2 = leg.clone();
      leg2.position.z = -0.3;
      bed.add(leg2);
    });
    bed.position.set(x, 0, 4.4);
    bed.rotation.y = i ? 0.18 : -0.1;
    scene.add(bed);
  });

  // мяч
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.7 })
  );
  ball.position.set(1.6, 0.3, 4.8);
  ball.castShadow = true;
  scene.add(ball);
  ball.userData.bounce = true;
  scene.userData.ball = ball;
}

/* ---------------------------------------------------------------- gym */
/* Снаряды стоят в два ряда по глубине: на телефоне так всё влезает по ширине,
   а наклон камеры разводит ряды по высоте экрана. */
const STATION_DEFS = [
  { id: 'pullup', kind: 'pullup', x: -3.9, z: -3.1, name: 'Турник', build: buildPullup,
    stand: { x: -3.9, z: -2.55, y: 0 } },
  { id: 'kettlebell', kind: 'kettlebell', x: -3.9, z: 1.7, name: 'Гири', build: buildKettlebells,
    stand: { x: -3.9, z: 0.9, y: 0 } },
  { id: 'ring', kind: 'boxing', x: 2.1, z: -3.4, name: 'Ринг', build: buildRing,
    stand: { x: 2.1, z: -2.9, y: 0.55 } },
  { id: 'barbell', kind: 'barbell', x: 0.1, z: 2.0, name: 'Штанга', build: buildBarbell,
    stand: { x: 0.1, z: 1.05, y: 0 } },
  { id: 'bag', kind: 'boxing', x: 4.9, z: 1.9, name: 'Мешок', build: buildPunchBag,
    stand: { x: 3.8, z: 1.6, y: 0 } },
];

function buildGym() {
  // деревянный настил под снарядами
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xc79a63, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.18, 9.4), deckMat);
  deck.position.set(0.4, 0.09, -0.6);
  deck.receiveShadow = true;
  deck.castShadow = true;
  scene.add(deck);

  STATION_DEFS.forEach((def, i) => {
    const group = new THREE.Group();
    group.position.set(def.x, 0, def.z);
    def.build(group);
    group.visible = i < 2;
    scene.add(group);
    world.stations.push({ def, group, occupant: null, index: i });
  });
  world.unlocked = 2;
}

function buildPullup(g) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.35, metalness: 0.75 });
  [-1.15, 1.15].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.5, 10), metal);
    post.position.set(x, 1.75, 0);
    post.castShadow = true;
    g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.12, 12), metal);
    foot.position.set(x, 0.06, 0);
    g.add(foot);
  });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.55, 10), metal);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 3.45, 0);
  bar.castShadow = true;
  g.add(bar);
  // маты под турником
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.08, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2f6f7a, roughness: 1 })
  );
  mat.position.set(0, 0.04, 0.2);
  mat.receiveShadow = true;
  g.add(mat);
}

function buildKettlebells(g) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.45, metalness: 0.6 });
  const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9 }));
  rack.position.y = 0.09;
  rack.receiveShadow = true;
  rack.castShadow = true;
  g.add(rack);

  [[-0.75, 0.34], [0, 0.42], [0.75, 0.34]].forEach(([x, r], i) => {
    const bell = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), metal);
    body.scale.y = 0.92;
    body.position.y = r;
    body.castShadow = true;
    bell.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, r * 0.14, 8, 14, Math.PI), metal);
    handle.position.y = r * 1.85;
    handle.rotation.z = 0;
    bell.add(handle);
    bell.position.set(x, 0.18, 0);
    bell.rotation.y = i * 0.4;
    g.add(bell);
  });
}

function buildRing(g) {
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x2b6f8c, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4e3c3, roughness: 0.8 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.6 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.75 });

  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.55, 4.2), platformMat);
  platform.position.y = 0.275;
  platform.castShadow = true;
  platform.receiveShadow = true;
  g.add(platform);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.18, 4.3), trimMat);
  skirt.position.y = 0.5;
  g.add(skirt);

  const corners = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
  corners.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.1, 8), postMat);
    post.position.set(x, 1.4, z);
    post.castShadow = true;
    g.add(post);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), trimMat);
    pad.position.set(x, 2.45, z);
    g.add(pad);
  });

  [0.95, 1.45, 1.95].forEach((y) => {
    [[0, -2], [0, 2]].forEach(([x, z]) => {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4, 6), ropeMat);
      rope.rotation.z = Math.PI / 2;
      rope.position.set(x, y, z);
      g.add(rope);
    });
    [[-2, 0], [2, 0]].forEach(([x, z]) => {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4, 6), ropeMat);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(x, y, z);
      g.add(rope);
    });
  });
}

function buildBarbell(g) {
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9d2d8, roughness: 0.3, metalness: 0.8 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.3 });

  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 0.95), benchMat);
  bench.position.y = 0.62;
  bench.castShadow = true;
  g.add(bench);
  [-0.9, 0.9].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.8), metal);
    leg.position.set(x, 0.3, 0);
    g.add(leg);
  });

  [-1.05, 1.05].forEach((x) => {
    const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), metal);
    rack.position.set(x, 0.75, 0);
    g.add(rack);
  });

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), metal);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.45, 0);
  bar.castShadow = true;
  g.add(bar);

  [-1.0, 1.0].forEach((x) => {
    [0.18, 0.26].forEach((r) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 14), plateMat);
      plate.rotation.z = Math.PI / 2;
      plate.position.set(x + (r > 0.2 ? 0.12 : 0), 1.45, 0);
      plate.castShadow = true;
      g.add(plate);
    });
  });
}

function buildPunchBag(g) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.4, metalness: 0.7 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x8c2f39, roughness: 0.8 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.16, 14), metal);
  base.position.y = 0.08;
  base.castShadow = true;
  g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), metal);
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-0.55, 3.15, 0);
  g.add(arm);

  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.5, 14), bagMat);
  bag.position.set(-1.1, 2.2, 0);
  bag.castShadow = true;
  g.add(bag);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 14), metal);
  cap.position.set(-1.1, 2.98, 0);
  g.add(cap);
  const bagGroup = new THREE.Group();
  g.add(bagGroup);
  g.userData.swing = bag;
}

/* ---------------------------------------------------------------- humans */
const SKIN_TONES = [0xe8b48f, 0xd79b72, 0xb87a4e, 0x8d5524, 0xf1c9a5];
const SHORTS = [0x2b6f8c, 0xd94b4b, 0x2f4858, 0xc1553f, 0x3f9e52, 0x6a4c93, 0x1f2a36];
const CAPS = [0xffc94a, 0x35d0c0, 0xff6b57, 0xffffff, 0x2b2f36, 0x8c2f39];

function buildHuman(opts) {
  const o = opts || {};
  const gain = o.gain || rand(0.85, 1.35);
  const skin = new THREE.MeshStandardMaterial({ color: o.skin || pick(SKIN_TONES), roughness: 0.85 });
  const shortsColor = o.shorts || pick(SHORTS);
  const shorts = new THREE.MeshStandardMaterial({ color: shortsColor, roughness: 0.9 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.8 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torsoW = 0.5 + 0.28 * gain;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, 0.72, 0.34), skin);
  torso.position.y = 1.5;
  torso.castShadow = true;
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(torsoW * 1.08, 0.34, 0.38), skin);
  chest.position.y = 1.78;
  chest.castShadow = true;
  body.add(chest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 8), skin);
  neck.position.y = 1.97;
  body.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin);
  head.position.y = 2.16;
  head.castShadow = true;
  body.add(head);

  // кепка/волосы
  const capColor = o.cap === null ? null : (o.cap || pick(CAPS));
  if (capColor) {
    const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.8 });
    const brim = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    brim.position.y = 2.22;
    body.add(brim);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.18), capMat);
    visor.position.set(0, 2.23, 0.19);
    body.add(visor);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 }));
    hair.position.y = 2.18;
    body.add(hair);
  }

  // руки
  const armRadius = 0.075 + 0.05 * gain;
  const arms = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW * 0.5 + 0.045), 1.86, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(armRadius, 0.34, 4, 8), skin);
    upper.position.y = -0.25;
    upper.castShadow = true;
    pivot.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.48;
    const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(armRadius * 0.82, 0.3, 4, 8), skin);
    foreMesh.position.y = -0.19;
    foreMesh.castShadow = true;
    fore.add(foreMesh);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(armRadius * 1.05, 8, 6), skin);
    fist.position.y = -0.4;
    fore.add(fist);
    pivot.add(fore);
    body.add(pivot);
    arms.push({ pivot, fore, side });
  });

  // ноги
  const legs = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16 * (0.9 + gain * 0.2), 0.95, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105 + 0.02 * gain, 0.36, 4, 8), shorts);
    thigh.position.y = -0.26;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Group();
    shin.position.y = -0.5;
    const shinMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.34, 4, 8), skin);
    shinMesh.position.y = -0.22;
    shinMesh.castShadow = true;
    shin.add(shinMesh);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.28), shoes);
    shoe.position.set(0, -0.44, 0.06);
    shoe.castShadow = true;
    shin.add(shoe);
    pivot.add(shin);
    body.add(pivot);
    legs.push({ pivot, shin, side });
  });

  root.userData = { arms, legs, body, head, gain, phase: rand(0, 6.28) };
  return root;
}

function animateHuman(person, mode, t, dt) {
  const u = person.userData;
  const { arms, legs, body } = u;
  const phase = u.phase + t;

  arms.forEach((a) => { a.pivot.rotation.set(0, 0, 0); a.fore.rotation.set(0, 0, 0); });
  legs.forEach((l) => { l.pivot.rotation.set(0, 0, 0); l.shin.rotation.set(0, 0, 0); });
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);

  if (mode === 'walk') {
    const s = Math.sin(phase * 7);
    legs[0].pivot.rotation.x = s * 0.6;
    legs[1].pivot.rotation.x = -s * 0.6;
    legs[0].shin.rotation.x = Math.max(0, -s) * 0.5;
    legs[1].shin.rotation.x = Math.max(0, s) * 0.5;
    arms[0].pivot.rotation.x = -s * 0.5;
    arms[1].pivot.rotation.x = s * 0.5;
    body.position.y = Math.abs(Math.sin(phase * 7)) * 0.05;
  } else if (mode === 'pullup') {
    // висит на перекладине и подтягивается
    const up = (Math.sin(phase * 2.6) + 1) / 2;
    body.position.y = 1.22 - up * 0.4;
    arms.forEach((a) => {
      a.pivot.rotation.z = a.side * (2.55 - up * 0.35);
      a.pivot.rotation.x = 0.1;
      a.fore.rotation.z = a.side * (0.5 + up * 0.9);
    });
    legs[0].pivot.rotation.x = 0.12 + Math.sin(phase * 1.4) * 0.06;
    legs[1].pivot.rotation.x = -0.05;
    legs[0].shin.rotation.x = 0.3;
    legs[1].shin.rotation.x = 0.16;
  } else if (mode === 'kettlebell') {
    // махи гирей / приседания
    const s = Math.sin(phase * 3.2);
    body.position.y = -0.18 + s * 0.16;
    legs.forEach((l) => { l.pivot.rotation.x = 0.28 - s * 0.2; l.shin.rotation.x = 0.5 + s * 0.25; });
    arms.forEach((a) => {
      a.pivot.rotation.x = -2.1 - s * 0.9;
      a.pivot.rotation.z = a.side * 0.16;
      a.fore.rotation.x = 0.5;
    });
  } else if (mode === 'boxing') {
    const s = Math.sin(phase * 5.5);
    const s2 = Math.sin(phase * 5.5 + Math.PI);
    arms.forEach((a, i) => {
      const punch = i === 0 ? Math.max(0, s) : Math.max(0, s2);
      a.pivot.rotation.x = -1.25 - punch * 0.9;
      a.pivot.rotation.z = a.side * 0.25;
      a.fore.rotation.x = 0.9 - punch * 0.8;
    });
    body.rotation.y = Math.sin(phase * 5.5) * 0.16;
    legs[0].pivot.rotation.x = 0.2;
    legs[1].pivot.rotation.x = -0.2;
    legs[1].shin.rotation.x = 0.2;
  } else if (mode === 'barbell') {
    const s = (Math.sin(phase * 2.2) + 1) / 2;
    body.position.y = -0.25 + s * 0.5;
    arms.forEach((a) => {
      a.pivot.rotation.z = a.side * 2.2;
      a.pivot.rotation.x = -0.2;
      a.fore.rotation.z = a.side * 1.1;
    });
    legs.forEach((l) => { l.pivot.rotation.x = 0.12 - s * 0.1; l.shin.rotation.x = 0.22; });
  } else if (mode === 'leave' || mode === 'cheer') {
    const s = Math.sin(phase * 8);
    arms[0].pivot.rotation.z = 2.6 + s * 0.2;
    arms[1].pivot.rotation.z = -2.6 - s * 0.2;
    body.position.y = Math.abs(s) * 0.06;
  } else {
    body.position.y = Math.sin(phase * 1.6) * 0.012;
  }
}

/* ---------------------------------------------------------------- clients */
const clients = [];
let spawnTimer = 2.2;

function freeStation() {
  for (const s of world.stations) {
    if (s.index < world.unlocked && !s.occupant) return s;
  }
  return null;
}

function spawnClient() {
  const station = freeStation();
  if (!station) return false;

  const person = buildHuman({});
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -CONFIG.exitDistance : CONFIG.exitDistance;
  person.position.set(startX, 0, 1.6 + rand(-0.3, 0.5));
  person.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
  scene.add(person);

  const tierIndex = state.tierIndex;
  const client = {
    person, station, state: 'walkIn',
    t: 0, tierIndex,
    duration: clientDuration(state, tierIndex),
    fromLeft,
    stationX: (station.def.stand ? station.def.stand.x : station.def.x) + rand(-0.12, 0.12),
    stationZ: (station.def.stand ? station.def.stand.z : station.def.z + 1.1) + rand(-0.1, 0.1),
    stationY: station.def.stand ? station.def.stand.y : 0,
    cheer: 0,
  };
  station.occupant = client;
  clients.push(client);
  return true;
}

function payClient(client) {
  const other = clients.filter((c) => c !== client && c.state === 'train').length;
  const crowd = 1 + Math.min(CONFIG.crowdBonusMax, other * CONFIG.crowdBonusStep);
  const amount = Math.round(clientPayout(state, client.tierIndex) * crowd);
  state.money += amount;
  state.totalEarned += amount;
  state.totalClients += 1;
  Sound.coin(state.totalClients);
  floatAt(client.person.position, '+' + formatMoney(amount) + ' ₽', false);
  refreshHud();
  return amount;
}

function updateClients(dt, t) {
  for (let i = clients.length - 1; i >= 0; i--) {
    const c = clients[i];
    const p = c.person;
    c.t += dt;

    if (c.state === 'walkIn') {
      const dx = c.stationX - p.position.x;
      const dz = c.stationZ - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        c.state = 'train';
        c.t = 0;
        p.position.set(c.stationX, c.stationY, c.stationZ);
        p.rotation.y = 0;
        payClient(c);
      } else {
        const step = Math.min(dist, CONFIG.walkSpeed * dt);
        p.position.x += (dx / dist) * step;
        p.position.z += (dz / dist) * step;
        p.rotation.y = Math.atan2(dx, dz);
      }
      animateHuman(p, 'walk', t * 1.1, dt);
    } else if (c.state === 'train') {
      if (c.t >= c.duration) {
        c.state = 'walkOut';
        p.position.y = 0;
        if (c.station.occupant === c) c.station.occupant = null;
        c.cheer = 0.9;
        Sound.tone({ freq: 440, to: 620, dur: 0.16, type: 'triangle', vol: 0.12 });
      } else {
        const kind = c.station.def.kind;
        animateHuman(p, kind === 'boxing' ? 'boxing' : kind, t, dt);
      }
    } else if (c.state === 'walkOut') {
      const targetX = c.fromLeft ? -CONFIG.exitDistance - 2 : CONFIG.exitDistance + 2;
      const dx = targetX - p.position.x;
      const step = CONFIG.walkSpeed * 1.25 * dt;
      p.position.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
      p.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
      animateHuman(p, c.cheer > 0 ? 'cheer' : 'walk', t * 1.2, dt);
      c.cheer = Math.max(0, c.cheer - dt);
      if (Math.abs(dx) < 0.4) {
        scene.remove(p);
        disposeGroup(p);
        clients.splice(i, 1);
      }
    }
  }
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

/* ---------------------------------------------------------------- ui */
let lastMoneyShown = -1;

function formatAll() {
  ui.money.textContent = formatMoney(state.money);
  ui.sheetMoney.textContent = formatMoney(state.money);
  ui.catalogMoney.textContent = formatMoney(state.money);
}

function refreshHud() {
  if (state.money !== lastMoneyShown) {
    formatAll();
    lastMoneyShown = state.money;
  }
  const rank = rankFor(state.totalEarned);
  ui.rank.textContent = rank.name;
  ui.clientsNow.textContent = clients.filter((c) => c.state === 'train').length;
  ui.stationsMax.textContent = stationCount(state);
  ui.tierName.textContent = activeTier(state).name;
  ui.timeScale.textContent = '×' + timeMultiplier(state).toFixed(2);
}

function toast(text, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  ui.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

const _v = new THREE.Vector3();
function projectToScreen(pos) {
  _v.copy(pos);
  _v.y += 2.4;
  _v.project(camera);
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function floatAt(pos, text, minus) {
  const p = projectToScreen(pos);
  const el = document.createElement('div');
  el.className = 'floater' + (minus ? ' minus' : '');
  el.textContent = text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  ui.floaters.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

/* --- окна --- */
function openSheet(el) {
  Sound.click();
  el.classList.remove('hidden');
  if (el === ui.upgradesSheet) renderUpgrades();
  if (el === ui.catalogSheet) renderCatalog();
  formatAll();
}
function closeSheet(el) { el.classList.add('hidden'); }

function renderUpgrades() {
  ui.upgradeList.innerHTML = '';
  formatAll();

  UPGRADE_ORDER.forEach((id) => {
    const def = UPGRADES[id];
    const lvl = state.upgrades[id];
    const maxed = lvl >= def.max;
    const cost = upgradeCost(state, id);
    const affordable = !maxed && state.money >= cost;

    const card = document.createElement('div');
    card.className = 'up-card' + (maxed ? ' maxed' : '');
    card.innerHTML = `
      <div class="up-icon">${def.icon}</div>
      <div class="up-main">
        <div class="up-name">${def.name} <span style="color:#9fb4bd;font-weight:700">ур. ${lvl}</span></div>
        <div class="up-desc">${def.desc}</div>
        <div class="up-meta">${maxed ? 'Максимум' : def.perLevel(lvl + 1)}</div>
        <div class="up-dots">${Array.from({ length: def.max }, (_, i) => `<i class="up-dot${i < lvl ? ' on' : ''}"></i>`).join('')}</div>
      </div>
      <button class="buy-btn${maxed ? ' done' : ''}" ${maxed || !affordable ? 'disabled' : ''}>
        ${maxed ? 'MAX' : formatMoney(cost) + ' ₽'}
      </button>`;

    const btn = card.querySelector('button');
    if (!maxed) {
      btn.addEventListener('click', () => {
        const res = buyUpgrade(state, id);
        if (!res.ok) {
          Sound.error();
          toast(res.reason === 'money' ? 'Не хватает денег' : 'Недоступно', 'bad');
          return;
        }
        Sound.purchase();
        if (id === 'capacity') unlockStation();
        toast(def.name + ' → ур. ' + res.level, 'good');
        renderUpgrades();
        refreshHud();
        save();
      });
    }
    ui.upgradeList.appendChild(card);
  });
}

function unlockStation() {
  const target = Math.min(stationCount(state), world.stations.length);
  if (target > world.unlocked) {
    const st = world.stations[world.unlocked];
    st.group.visible = true;
    st.group.scale.set(0.01, 0.01, 0.01);
    world.unlocked = target;
    // анимация появления
    animateScaleIn(st.group);
    toast('Новое место: ' + st.def.name, 'good');
  }
  world.unlocked = Math.max(world.unlocked, Math.min(stationCount(state), world.stations.length));
}

const scaleUps = [];
function animateScaleIn(obj) { scaleUps.push({ obj, t: 0 }); }

function renderCatalog() {
  ui.catalogList.innerHTML = '';
  formatAll();

  TIERS.forEach((tier, i) => {
    const unlocked = state.tierUnlocked[i];
    const active = state.tierIndex === i && unlocked;
    const card = document.createElement('div');
    card.className = 'tier-card' + (active ? ' active' : '') + (unlocked ? '' : ' locked');

    const price = clientPayout(state, i);
    const perSec = (price / clientDuration(state, i)).toFixed(1);
    card.innerHTML = `
      <div class="tier-top">
        <div class="tier-name">${tier.name}</div>
        <div class="tier-tag">${tier.tag}</div>
        <div class="tier-minutes">${tier.minutes}<span>мин</span></div>
      </div>
      <div class="tier-desc">${tier.desc}</div>
      <div class="tier-bottom">
        <div class="tier-price">${formatMoney(price)} ₽ <span>за клиента · ${perSec} ₽/сек</span></div>
        <button class="buy-btn${active ? ' done' : ''}">
          ${active ? 'Активен' : unlocked ? 'Выбрать' : 'Открыть · ' + formatMoney(tier.unlockCost) + ' ₽'}
        </button>
      </div>`;

    const btn = card.querySelector('button');
    if (!active) {
      btn.addEventListener('click', () => {
        const res = buyTier(state, i);
        if (!res.ok) {
          Sound.error();
          toast('Не хватает денег на открытие', 'bad');
          return;
        }
        if (res.cost > 0) {
          Sound.purchase();
          toast('Абонемент «' + tier.name + '» открыт', 'good');
        } else {
          Sound.click();
          toast('Абонемент «' + tier.name + '» активен', 'good');
        }
        renderCatalog();
        refreshHud();
        save();
      });
    }
    ui.catalogList.appendChild(card);
  });
}

/* ---------------------------------------------------------------- save */
let saveTimer = 0;
function save() {
  saveState(state, localStorage);
  saveTimer = 0;
}

function applyOfflineEarnings() {
  const lastSeen = Number(localStorage.getItem('strongTycoon.lastSeen') || 0);
  const ts = Date.now();
  localStorage.setItem('strongTycoon.lastSeen', String(ts));
  if (!lastSeen || !state.totalClients) return;
  const away = Math.min((ts - lastSeen) / 1000, 7200);
  if (away < 60) return;

  const stations = Math.min(stationCount(state), world.stations.length);
  const perClient = clientPayout(state);
  const cycle = clientDuration(state) + 2.2 / (1 + 0.22 * state.upgrades.marketing);
  const income = Math.round((stations * (away / cycle) * perClient) * 0.35);
  if (income <= 0) return;
  state.money += income;
  state.totalEarned += income;
  setTimeout(() => toast('Пока вас не было: +' + formatMoney(income) + ' ₽', 'good'), 900);
}

/* ---------------------------------------------------------------- loop */
let running = false;
let simTime = 0;

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * timeMultiplier(state);
  simTime += dt;

  // облака и море
  clouds.forEach((c) => {
    c.position.x += c.userData.speed * rawDt;
    if (c.position.x > 30) c.position.x = -30;
  });
  animateSea(simTime);

  // появление клиентов
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const ok = spawnClient();
    const base = spawnInterval(state);
    spawnTimer = ok ? base * rand(0.8, 1.25) : Math.max(0.6, base * 0.5);
  }

  updateClients(dt, simTime);
  animateProps(rawDt);
  animateScaleInStep(rawDt);

  refreshHud();
  saveTimer += rawDt;
  if (saveTimer > 5) save();

  renderer.render(scene, camera);
}

let seaFrame = 0;
function animateSea(t) {
  if (!seaMesh) return;
  const pos = seaMesh.geometry.attributes.position;
  const base = seaMesh.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const wave =
      Math.sin(x * 0.12 + t * 0.9) * 0.32 +
      Math.sin(y * 0.22 - t * 0.7) * 0.26 +
      Math.sin((x + y) * 0.08 + t * 1.4) * 0.14;
    pos.setZ(i, wave);
  }
  pos.needsUpdate = true;
  if ((seaFrame++ & 1) === 0) seaMesh.geometry.computeVertexNormals();
}

function animateProps(dt) {
  const ball = scene.userData.ball;
  if (ball) {
    const t = performance.now() / 1000;
    ball.position.y = 0.3 + Math.abs(Math.sin(t * 2.2)) * 0.5;
    ball.rotation.x += dt * 2;
  }
}

function animateScaleInStep(dt) {
  for (let i = scaleUps.length - 1; i >= 0; i--) {
    const s = scaleUps[i];
    s.t += dt * 2.6;
    const k = Math.min(1, s.t);
    const eased = 1 - Math.pow(1 - k, 3);
    s.obj.scale.setScalar(0.2 + eased * 0.8 + Math.sin(k * Math.PI) * 0.08);
    if (k >= 1) {
      s.obj.scale.setScalar(1);
      scaleUps.splice(i, 1);
    }
  }
}

/* ---------------------------------------------------------------- wiring */
function bindUi() {
  document.getElementById('settingsBtn').addEventListener('click', () => openSheet(ui.settingsSheet));
  document.getElementById('upgradesBtn').addEventListener('click', () => openSheet(ui.upgradesSheet));
  document.getElementById('catalogBtn').addEventListener('click', () => openSheet(ui.catalogSheet));

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.getAttribute('data-close'));
      if (el) closeSheet(el);
    });
  });

  [ui.settingsSheet, ui.upgradesSheet, ui.catalogSheet].forEach((sheet) => {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(sheet); });
  });

  ui.musicRange.addEventListener('input', () => {
    state.settings.music = Number(ui.musicRange.value) / 100;
    ui.musicVal.textContent = ui.musicRange.value;
    Sound.applyVolumes();
    save();
  });
  ui.sfxRange.addEventListener('input', () => {
    state.settings.sfx = Number(ui.sfxRange.value) / 100;
    ui.sfxVal.textContent = ui.sfxRange.value;
    Sound.applyVolumes();
    save();
  });
  ui.sfxRange.addEventListener('change', () => Sound.purchase());
  ui.musicRange.addEventListener('change', () => Sound.click());

  ui.muteBtn.addEventListener('click', () => {
    state.settings.muted = !state.settings.muted;
    Sound.applyVolumes();
    ui.muteBtn.textContent = state.settings.muted ? 'Включить звук' : 'Выключить звук целиком';
    save();
  });

  document.getElementById('resetProgress').addEventListener('click', () => {
    if (!confirm('Сбросить весь прогресс? Это нельзя отменить.')) return;
    localStorage.removeItem('strongTycoon.save.v2');
    location.reload();
  });

  document.getElementById('resetGameBtn').addEventListener('click', () => {
    if (!confirm('Начать игру заново? Текущий прогресс пропадёт.')) return;
    localStorage.removeItem('strongTycoon.save.v2');
    location.reload();
  });
}

/* ---------------------------------------------------------------- boot */
function boot() {
  initThree();

  // стартовые значения из сохранения
  world.unlocked = Math.min(stationCount(state), world.stations.length);
  world.stations.forEach((s, i) => { s.group.visible = i < world.unlocked; });

  ui.musicRange.value = Math.round(state.settings.music * 100);
  ui.sfxRange.value = Math.round(state.settings.sfx * 100);
  ui.musicVal.textContent = ui.musicRange.value;
  ui.sfxVal.textContent = ui.sfxRange.value;
  ui.muteBtn.textContent = state.settings.muted ? 'Включить звук' : 'Выключить звук целиком';

  bindUi();
  formatAll();
  refreshHud();

  // первый рендер за сплэшем
  renderer.render(scene, camera);

  ui.splashStatus.textContent = 'Пляж готов';
  ui.playBtn.classList.remove('hidden');
  ui.resetGameBtn.classList.remove('hidden');

  ui.playBtn.addEventListener('click', () => {
    Sound.resume();
    Sound.startMusic();
    Sound.purchase();
    ui.splash.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.bottomBar.classList.remove('hidden');
    running = true;
    applyOfflineEarnings();
    clock.getDelta();
    tick();
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitCamera();
  });

  // подстраховка от WebGL-контекста на слабых устройствах
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { clock.getDelta(); localStorage.setItem('strongTycoon.lastSeen', String(Date.now())); }
  });
}

try {
  boot();
} catch (err) {
  console.error(err);
  ui.splashStatus.textContent = 'Ошибка 3D: ' + (err && err.message ? err.message : err);
}

/* отладочный доступ (используется тестами) */
window.__strongTycoon = {
  get state() { return state; },
  get clients() { return clients; },
  get stations() { return world.stations; },
  get unlocked() { return world.unlocked; },
  spawnClient, payClient, unlockStation, refreshHud, buyUpgrade, buyTier,
  CONFIG, formatMoney,
};
