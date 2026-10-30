/* ФЛИП — one-thumb gravity-flip runner.
   Vanilla canvas, no dependencies. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), score: $('score'), best: $('best'),
    menu: $('menu'), over: $('over'),
    playBtn: $('playBtn'), againBtn: $('againBtn'), menuBtn: $('menuBtn'), soundBtn: $('soundBtn'),
    finalScore: $('finalScore'), recordLine: $('recordLine'),
    statDist: $('statDist'), statOrbs: $('statOrbs'), statBest: $('statBest'),
    soundIcon: $('soundIcon'),
  };

  const STORE = { best: 'flip.best.v1', mute: 'flip.mute.v1' };
  const readNum = (k, d) => {
    const v = parseInt(localStorage.getItem(k) || '', 10);
    return Number.isFinite(v) ? v : d;
  };

  // ---------------------------------------------------------------- Audio
  const Sound = {
    ac: null,
    muted: localStorage.getItem(STORE.mute) === '1',
    init() {
      if (this.ac) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ac = new AC(); } catch (e) { this.ac = null; }
    },
    resume() {
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    },
    tone(from, to, dur, type, vol) {
      if (this.muted) return;
      this.init(); this.resume();
      if (!this.ac) return;
      const t = this.ac.currentTime;
      const osc = this.ac.createOscillator();
      const g = this.ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.09, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.ac.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    },
    flip(up) { this.tone(up ? 330 : 470, up ? 560 : 290, 0.11, 'triangle', 0.07); },
    orb(n) {
      const base = 660 * Math.pow(1.0595, Math.min(n, 10));
      this.tone(base, base * 1.5, 0.09, 'sine', 0.08);
    },
    die() {
      this.tone(300, 48, 0.6, 'sawtooth', 0.11);
      this.tone(120, 40, 0.45, 'square', 0.05);
    },
    land() { this.tone(160, 110, 0.05, 'square', 0.028); },
  };

  // ---------------------------------------------------------------- Geometry
  let W = 0, H = 0, dpr = 1;
  const geo = { top: 0, bottom: 0, cx: 0, r: 0, ch: 0 };

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    geo.top = H * 0.13;
    geo.bottom = H * 0.13 + H * 0.74;
    geo.ch = geo.bottom - geo.top;
    geo.cx = W * 0.30;
    geo.r = Math.max(11, Math.min(H * 0.023, W * 0.05));

    buildStatic();
    if (mode === 'play' || mode === 'dead') clampPlayerToCorridor();
  }

  // ---------------------------------------------------------------- State
  let mode = 'menu';                     // menu | play | dead

  const G = () => H * 18;                  // gravity px/s^2
  const MAXVY = () => H * 1.9;

  const player = { y: 0, vy: 0, dir: 1, flash: 0, squash: 0, rot: 0 };

  let obstacles = [], orbs = [], parts = [], trail = [];
  let travelled = 0, orbCount = 0, combo = 0, comboBest = 0, score = 0;
  let speed = 0, spawnGap = 0, sinceOrb = 0, shake = 0, slowmo = 1;
  let best = readNum(STORE.best, 0);
  let flashFx = 0, tSec = 0, deathT = 0;

  el.best.textContent = best;

  // ---------------------------------------------------------------- Static layers
  let bgGrad = null, vignette = null, stars = [], nebula = [];

  function buildStatic() {
    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#080b1a');
    bgGrad.addColorStop(0.45, '#0a1026');
    bgGrad.addColorStop(1, '#05070f');

    vignette = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');

    stars = [];
    const count = Math.round((W * H) / 5200);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: geo.top + Math.random() * geo.ch,
        z: Math.random() * 0.85 + 0.15,
        s: Math.random() * 1.7 + 0.5,
      });
    }

    nebula = [
      { x: W * 0.75, y: H * 0.22, r: Math.min(W, H) * 0.55, c: 'rgba(120,70,255,0.16)' },
      { x: W * 0.15, y: H * 0.78, r: Math.min(W, H) * 0.6, c: 'rgba(56,247,224,0.10)' },
      { x: W * 0.5, y: H * 0.5, r: Math.min(W, H) * 0.7, c: 'rgba(255,61,139,0.06)' },
    ];
  }

  // ---------------------------------------------------------------- Game control
  function reset() {
    obstacles = []; orbs = []; parts = []; trail = [];
    travelled = 0; orbCount = 0; combo = 0; comboBest = 0; score = 0;
    speed = H * 0.58; spawnGap = H * 0.42; sinceOrb = H * 0.5;
    lastObstacleSide = -1;
    shake = 0; slowmo = 1; flashFx = 0; deathT = 0;
    player.y = geo.bottom - geo.r - 2;
    player.vy = 0; player.dir = 1; player.flash = 0; player.squash = 0; player.rot = 0;
    el.score.textContent = '0';
    for (let i = 0; i < 4; i++) trail.push({ x: geo.cx, y: player.y });
  }

  function startGame() {
    Sound.init(); Sound.resume();
    reset();
    mode = 'play';
    el.menu.classList.add('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.add('show');
    // nice entry burst
    for (let i = 0; i < 22; i++) spawnParticle(geo.cx, player.y, '#38f7e0', 1.2);
  }

  function toMenu() {
    mode = 'menu';
    el.menu.classList.remove('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.remove('show');
  }

  function die() {
    if (mode !== 'play') return;
    mode = 'dead';
    deathT = 0;
    shake = Math.min(H * 0.045, 34);
    slowmo = 0.18;
    Sound.die();
    vibrate(70);
    for (let i = 0; i < 46; i++) spawnParticle(geo.cx, player.y, i % 3 ? '#38f7e0' : '#ff3d8b', 1.7);
    const meters = Math.floor(travelled / (H * 0.08));
    score = meters + orbCount * 5;
    const isRecord = score > best;
    if (isRecord) { best = score; localStorage.setItem(STORE.best, String(best)); el.best.textContent = best; }
    setTimeout(() => showOver(meters, isRecord), 620);
  }

  function showOver(meters, isRecord) {
    if (mode !== 'dead') return;
    el.finalScore.textContent = score;
    el.statDist.textContent = meters;
    el.statOrbs.textContent = orbCount;
    el.statBest.textContent = best;
    el.recordLine.classList.toggle('hidden', !isRecord);
    el.over.classList.remove('hidden');
    el.hud.classList.remove('show');
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  function flip() {
    if (mode !== 'play') return;
    player.dir *= -1;
    player.vy = player.dir * H * 0.62;
    player.flash = 1;
    player.squash = 1;
    flashFx = 1;
    Sound.flip(player.dir < 0);
    vibrate(12);
    for (let i = 0; i < 9; i++) {
      spawnParticle(geo.cx, player.y, player.dir < 0 ? '#8b5cff' : '#38f7e0', 0.7, player.dir * -0.25);
    }
  }

  // ---------------------------------------------------------------- Entities
  function spawnObstacle() {
    const ch = geo.ch;
    const h = ch * (0.26 + Math.random() * 0.24);
    const w = geo.r * (1.9 + Math.random() * 0.5);
    // the very first obstacle always hangs from the ceiling: the player starts on the
    // floor, so the opening seconds are a free lesson instead of an instant death
    let side;
    if (obstacles.length === 0) side = -1;
    else side = Math.random() < 0.45 ? lastSide() : (lastSide() === 1 ? -1 : 1);
    obstacles.push({
      x: W + w,
      w,
      h,
      side,                                   // 1 = on the floor, -1 = on the ceiling
      y: side === 1 ? geo.bottom - h : geo.top,
      seed: Math.random() * 100,
      past: false,
    });
    lastObstacleSide = side;
  }
  let lastObstacleSide = 1;
  function lastSide() { return obstacles.length ? obstacles[obstacles.length - 1].side : lastObstacleSide; }

  function spawnOrbCluster() {
    const n = 2 + (Math.random() < 0.55 ? 1 : 2);
    const startY = geo.top + geo.ch * (0.22 + Math.random() * 0.56);
    const dirY = Math.random() < 0.5 ? -1 : 1;
    const gapX = geo.r * 3.1;
    const gapY = geo.ch * 0.035 * dirY;
    for (let i = 0; i < n; i++) {
      orbs.push({
        x: W + geo.r * 3 + i * gapX,
        y: Math.max(geo.top + geo.r * 2.4, Math.min(geo.bottom - geo.r * 2.4, startY + i * gapY)),
        r: geo.r * 0.62,
        phase: Math.random() * 6.28,
        taken: false,
      });
    }
  }

  function spawnParticle(x, y, color, scale, bias) {
    const a = Math.random() * Math.PI * 2;
    const sp = H * (0.12 + Math.random() * 0.42) * (scale || 1);
    parts.push({
      x, y,
      vx: Math.cos(a) * sp - speed * 0.12,
      vy: Math.sin(a) * sp + (bias || 0) * H * 0.4,
      life: 0.45 + Math.random() * 0.55,
      max: 1,
      color,
      size: geo.r * (0.16 + Math.random() * 0.3) * (scale || 1),
    });
  }

  function clampPlayerToCorridor() {
    player.y = Math.max(geo.top + geo.r, Math.min(geo.bottom - geo.r, player.y));
  }

  // ---------------------------------------------------------------- Update
  function update(dt) {
    tSec += dt;
    shake *= Math.pow(0.0025, dt);
    if (flashFx > 0) flashFx = Math.max(0, flashFx - dt * 3.4);
    if (player.flash > 0) player.flash = Math.max(0, player.flash - dt * 3.2);
    if (player.squash > 0) player.squash = Math.max(0, player.squash - dt * 3.6);

    // stars drift even on menu
    const drift = mode === 'play' ? speed : H * 0.10;
    for (const s of stars) {
      s.x -= drift * s.z * dt;
      if (s.x < -4) { s.x = W + 4; s.y = geo.top + Math.random() * geo.ch; }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += G() * 0.18 * dt;
      p.vx *= Math.pow(0.2, dt);
    }

    if (mode === 'menu') {
      // idle bobbing blob on the menu
      player.y = geo.top + geo.ch * (0.5 + Math.sin(tSec * 1.6) * 0.16);
      trail.push({ x: geo.cx, y: player.y });
      if (trail.length > 18) trail.shift();
      return;
    }

    if (mode === 'dead') {
      deathT += dt;
      slowmo += (1 - slowmo) * Math.min(1, dt * 1.6);
      if (deathT < 0.7) {
        for (const p of parts) p.x -= speed * dt * 0.35;
      }
      return;
    }

    // ---- playing
    speed = Math.min(H * 1.12, H * 0.58 + travelled * 0.00085);
    const px = speed * dt;
    travelled += px;

    // physics
    player.vy += G() * player.dir * dt;
    player.vy = Math.max(-MAXVY(), Math.min(MAXVY(), player.vy));
    player.y += player.vy * dt;

    const floorY = geo.bottom - geo.r;
    const ceilY = geo.top + geo.r;
    let groundHit = 0;
    if (player.y >= floorY) { player.y = floorY; if (player.vy > H * 0.5) groundHit = 1; player.vy = 0; }
    if (player.y <= ceilY) { player.y = ceilY; if (player.vy < -H * 0.5) groundHit = 1; player.vy = 0; }
    if (groundHit) {
      Sound.land();
      player.squash = Math.min(1, player.squash + 0.75);
      for (let i = 0; i < 5; i++) spawnParticle(geo.cx - geo.r * 0.4, player.y + player.dir * geo.r, '#6f7ba8', 0.45);
    }

    player.rot += (Math.max(-1, Math.min(1, player.vy / (H * 0.9))) * 0.5 - player.rot) * Math.min(1, dt * 12);

    trail.push({ x: geo.cx, y: player.y });
    if (trail.length > 20) trail.shift();

    // ---- obstacles
    spawnGap -= px;
    if (spawnGap <= 0) {
      spawnObstacle();
      const gapTime = 0.66 - Math.min(0.16, travelled / (H * 240));
      spawnGap = Math.max(speed * gapTime, geo.r * 7.5);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= px;
      if (o.x + o.w < -20) { obstacles.splice(i, 1); continue; }

      const nx = Math.max(o.x, Math.min(geo.cx, o.x + o.w));
      const ny = Math.max(o.y, Math.min(player.y, o.y + o.h));
      const dx = geo.cx - nx, dy = player.y - ny;
      if (dx * dx + dy * dy < (geo.r * 0.9) * (geo.r * 0.9)) { die(); return; }

      if (!o.past && o.x + o.w < geo.cx - geo.r) {
        o.past = true;
        // near-miss sparkle for close calls
        const dist = Math.min(Math.abs(player.y - o.y), Math.abs(player.y - (o.y + o.h)));
        if (dist < geo.r * 2.6) for (let k = 0; k < 4; k++) spawnParticle(geo.cx, player.y, '#ffffff', 0.35);
      }
    }

    // ---- orbs
    sinceOrb -= px;
    if (sinceOrb <= 0) {
      spawnOrbCluster();
      sinceOrb = speed * (1.15 + Math.random() * 0.85);
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.x -= px;
      o.phase += dt * 4;
      if (o.x < -30) { orbs.splice(i, 1); continue; }
      const dx = o.x - geo.cx, dy = o.y - player.y;
      const rr = o.r + geo.r * 1.05;
      if (dx * dx + dy * dy < rr * rr) {
        orbs.splice(i, 1);
        orbCount++;
        combo++;
        comboBest = Math.max(comboBest, combo);
        Sound.orb(combo);
        vibrate(8);
        for (let k = 0; k < 14; k++) spawnParticle(o.x, o.y, k % 2 ? '#ff3d8b' : '#ffd6f0', 0.8);
        shake = Math.max(shake, H * 0.006);
      }
    }

    score = Math.floor(travelled / (H * 0.08)) + orbCount * 5;
    el.score.textContent = score;
  }

  // ---------------------------------------------------------------- Render
  function rr(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawBackground() {
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    for (const n of nebula) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, n.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawStars() {
    for (const s of stars) {
      const a = 0.25 + s.z * 0.6;
      ctx.fillStyle = 'rgba(190,215,255,' + a.toFixed(3) + ')';
      ctx.fillRect(s.x, s.y, s.s * (0.6 + s.z), s.s * (0.6 + s.z));
      if (s.z > 0.7) {
        ctx.fillStyle = 'rgba(120,220,255,0.10)';
        ctx.fillRect(s.x - s.z * 26, s.y + s.s * 0.3, s.z * 26, 1);
      }
    }
  }

  function drawWalls() {
    // bands
    const gTop = ctx.createLinearGradient(0, 0, 0, geo.top);
    gTop.addColorStop(0, '#0b1026');
    gTop.addColorStop(1, '#151c3d');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, 0, W, geo.top);

    const gBot = ctx.createLinearGradient(0, geo.bottom, 0, H);
    gBot.addColorStop(0, '#151c3d');
    gBot.addColorStop(1, '#0b1026');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, geo.bottom, W, H - geo.bottom);

    // neon edges
    ctx.save();
    ctx.shadowColor = 'rgba(56,247,224,0.85)';
    ctx.shadowBlur = Math.min(28, H * 0.03);
    ctx.strokeStyle = 'rgba(56,247,224,0.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, geo.top); ctx.lineTo(W, geo.top); ctx.stroke();
    ctx.strokeStyle = 'rgba(139,92,255,0.9)';
    ctx.shadowColor = 'rgba(139,92,255,0.85)';
    ctx.beginPath(); ctx.moveTo(0, geo.bottom); ctx.lineTo(W, geo.bottom); ctx.stroke();
    ctx.restore();

    // speed stripes on walls
    const step = H * 0.09;
    const off = (travelled * 0.85) % step;
    ctx.strokeStyle = 'rgba(140,170,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -off; x < W + step; x += step) {
      ctx.moveTo(x, geo.top - H * 0.045);
      ctx.lineTo(x + step * 0.4, geo.top - 2);
      ctx.moveTo(x, geo.bottom + H * 0.045);
      ctx.lineTo(x + step * 0.4, geo.bottom + 2);
    }
    ctx.stroke();
  }

  function drawObstacle(o) {
    const spike = Math.min(o.w * 0.5, geo.r * 0.9);
    ctx.save();
    ctx.shadowColor = 'rgba(255,90,60,0.75)';
    ctx.shadowBlur = Math.min(22, H * 0.026);

    const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    grad.addColorStop(0, '#ff7a45');
    grad.addColorStop(0.6, '#ff3d5a');
    grad.addColorStop(1, '#b3123f');
    ctx.fillStyle = grad;

    // body with a jagged facing edge
    ctx.beginPath();
    if (o.side === 1) {
      ctx.moveTo(o.x, o.y + o.h);
      ctx.lineTo(o.x, o.y + spike);
      ctx.lineTo(o.x + o.w * 0.5, o.y + Math.sin(o.seed + tSec) * 2);
      ctx.lineTo(o.x + o.w, o.y + spike);
      ctx.lineTo(o.x + o.w, o.y + o.h);
    } else {
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x, o.y + o.h - spike);
      ctx.lineTo(o.x + o.w * 0.5, o.y + o.h - Math.sin(o.seed + tSec) * 2);
      ctx.lineTo(o.x + o.w, o.y + o.h - spike);
      ctx.lineTo(o.x + o.w, o.y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(o.x + o.w * 0.42, o.side === 1 ? o.y + spike : o.y + o.h * 0.12, o.w * 0.16, o.h * 0.5);
    ctx.restore();
  }

  function drawOrb(o) {
    const pulse = 1 + Math.sin(o.phase) * 0.12;
    const r = o.r * pulse;
    ctx.save();
    ctx.shadowColor = 'rgba(255,61,139,0.9)';
    ctx.shadowBlur = Math.min(26, H * 0.03);
    const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, r * 0.15, o.x, o.y, r);
    g.addColorStop(0, '#fff0f7');
    g.addColorStop(0.45, '#ff6aa8');
    g.addColorStop(1, '#ff2f86');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 6.2832); ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.5, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (mode === 'dead' && deathT > 0.05) return;

    // trail
    ctx.save();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const k = i / trail.length;
      ctx.globalAlpha = k * 0.30;
      ctx.fillStyle = player.dir < 0 ? '#8b5cff' : '#38f7e0';
      const rr2 = geo.r * (0.35 + k * 0.5);
      ctx.beginPath(); ctx.arc(p.x - (1 - k) * geo.r * 1.6, p.y, rr2, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    const squash = 1 + player.squash * 0.28;
    const stretch = 1 - player.squash * 0.22;
    const r = geo.r;

    ctx.save();
    ctx.translate(geo.cx, player.y);
    ctx.rotate(player.rot * 0.27);
    ctx.scale(stretch, squash);

    ctx.shadowColor = player.dir < 0 ? 'rgba(139,92,255,0.95)' : 'rgba(56,247,224,0.95)';
    ctx.shadowBlur = Math.min(34, H * 0.04) + player.flash * 18;

    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
    if (player.dir < 0) {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#c9b4ff');
      g.addColorStop(1, '#7a4bff');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#b6fff4');
      g.addColorStop(1, '#22d9c4');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();

    // inner nucleus
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.26, r * 0.3, 0, 6.2832); ctx.fill();
    ctx.restore();

    // gravity arrow hint
    ctx.save();
    ctx.globalAlpha = 0.35 + player.flash * 0.4;
    ctx.strokeStyle = player.dir < 0 ? '#a88bff' : '#5ffbe8';
    ctx.lineWidth = 2;
    const ay = player.y + player.dir * (r + 10);
    ctx.beginPath();
    ctx.moveTo(geo.cx, ay);
    ctx.lineTo(geo.cx, ay + player.dir * 9);
    ctx.moveTo(geo.cx - 4.5, ay + player.dir * 4.5);
    ctx.lineTo(geo.cx, ay + player.dir * 9);
    ctx.lineTo(geo.cx + 4.5, ay + player.dir * 4.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of parts) {
      const a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    drawBackground();
    drawStars();
    drawWalls();

    for (const o of obstacles) drawObstacle(o);
    for (const o of orbs) drawOrb(o);

    drawPlayer();
    drawParticles();

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    if (flashFx > 0.01) {
      ctx.fillStyle = 'rgba(160,255,245,' + (flashFx * 0.07).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- Loop
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;          // clamp big frame gaps
    const sdt = dt * (mode === 'dead' ? slowmo : 1);
    update(sdt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- Input
  function onTap(e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    if (mode === 'play') flip();
    else if (mode === 'dead') { /* wait for overlay */ }
  }
  window.addEventListener('pointerdown', onTap, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (mode === 'play') flip();
      else if (mode === 'menu') startGame();
      else if (mode === 'dead' && deathT > 0.8) startGame();
    }
  });

  el.playBtn.addEventListener('click', startGame);
  el.againBtn.addEventListener('click', startGame);
  el.menuBtn.addEventListener('click', toMenu);

  const ICON_ON = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z';
  const ICON_OFF = 'M3 9v6h4l5 5V4L7 9H3zm18.4 8.5-1.4 1.4-3.9-3.9-3.9 3.9-1.4-1.4 3.9-3.9-3.9-3.9 1.4-1.4 3.9 3.9 3.9-3.9 1.4 1.4-3.9 3.9 3.9 3.9z';
  function paintSound() { el.soundIcon.setAttribute('d', Sound.muted ? ICON_OFF : ICON_ON); }
  paintSound();
  el.soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Sound.muted = !Sound.muted;
    localStorage.setItem(STORE.mute, Sound.muted ? '1' : '0');
    paintSound();
    if (!Sound.muted) Sound.tone(520, 760, 0.09, 'sine', 0.07);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'play') { /* simple soft pause */ last = performance.now(); }
  });

  // ---------------------------------------------------------------- Debug hook
  // Read-only snapshot used by the headless tests (harmless in production).
  window.__flipDebug = () => ({
    mode,
    playerY: player.y,
    vy: player.vy,
    dir: player.dir,
    top: geo.top,
    bottom: geo.bottom,
    cx: geo.cx,
    r: geo.r,
    speed,
    score,
    orbs: orbs.length,
    obstacles: obstacles.map((o) => ({ x: o.x, w: o.w, y: o.y, h: o.h, side: o.side })),
  });

  // ---------------------------------------------------------------- Boot
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  reset();
  mode = 'menu';
  requestAnimationFrame(frame);
})();
