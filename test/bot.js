/* Solvability check: a simple "reasonable player" bot plays the game.
   If a competent bot cannot survive, the level generator is unfair. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runSession(seed) {
  const W = 390, H = 844;
  const elements = {};
  function makeEl(id) {
    const classes = new Set(id === 'over' ? ['hidden'] : []);
    const listeners = {};
    const el = {
      id, textContent: '', style: {}, attrs: {},
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c),
        toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
        contains: (c) => classes.has(c),
      },
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
      setAttribute: () => {}, closest: () => null,
      click: () => (listeners.click || []).forEach((fn) => fn({ target: el, stopPropagation() {} })),
    };
    return el;
  }
  const getEl = (id) => (elements[id] = elements[id] || makeEl(id));
  const ctxStub = new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'roundRect') return undefined;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  getEl('game').getContext = () => ctxStub;

  const winListeners = {};
  let rafCb = null, nowMs = 0;
  const timers = [];
  const sandbox = {
    console, Math, Date, JSON, parseInt, parseFloat, isFinite, Number, String, Object, Array, Error, Set, Map,
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    setTimeout: (fn, ms) => { timers.push({ fn, at: nowMs + ms }); return timers.length; },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: {},
    document: { hidden: false, getElementById: getEl, addEventListener: () => {} },
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = W;
  sandbox.window.innerHeight = H;
  sandbox.window.devicePixelRatio = 2;
  sandbox.window.addEventListener = (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });

  const frame = (ms) => {
    nowMs += ms;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= nowMs) timers.splice(i, 1)[0].fn();
    const cb = rafCb; rafCb = null; cb(nowMs);
  };
  const tap = () => (winListeners.pointerdown || []).forEach((fn) => fn({ target: { closest: () => null } }));

  frame(16);
  getEl('playBtn').click();

  let frames = 0;
  const MAX = 60 * 90;                       // 90 seconds of gameplay
  while (frames < MAX) {
    const d = sandbox.window.__flipDebug();
    if (d.mode !== 'play') break;

    // Bot: look at the closest obstacle ahead and pick the free side.
    const ahead = d.obstacles
      .filter((o) => o.x + o.w > d.cx - d.r && o.x < d.cx + d.r * 14)
      .sort((a, b) => a.x - b.x);
    if (ahead.length) {
      const o = ahead[0];
      const wantSide = -o.side;                      // -1 = hug the ceiling, 1 = hug the floor
      const onWrongSide = wantSide === 1 ? d.playerY < d.top + d.r * 2.2 : d.playerY > d.bottom - d.r * 2.2;
      const movingThere = wantSide === 1 ? d.vy > 0 : d.vy < 0;
      const distToImpact = (o.x - (d.cx + d.r)) / Math.max(1, d.speed);
      if (onWrongSide && !movingThere && distToImpact < 0.42 && distToImpact > -0.05) tap();
    }
    frame(16);
    frames++;
  }

  const d = sandbox.window.__flipDebug();
  return { mode: d.mode, score: d.score, seconds: +(frames / 60).toFixed(1) };
}

console.log('bot sessions (target: a competent bot survives well past 20 s):');
let total = 0, deaths = 0, worst = Infinity;
for (let i = 0; i < 8; i++) {
  const r = runSession(i);
  total += r.seconds;
  worst = Math.min(worst, r.seconds);
  if (r.mode !== 'play') deaths++;
  console.log(`  run ${i + 1}: ${r.seconds}s, score ${r.score}${r.mode === 'play' ? ' (survived the cap)' : ''}`);
}
const avg = (total / 8).toFixed(1);
console.log(`\naverage ${avg}s, worst ${worst}s, ${deaths}/8 ended by death`);
const ok = Number(avg) > 20;
console.log(ok ? '✓ the bot survives — generator is fair' : '✗ too punishing: bot dies early');
process.exit(ok ? 0 : 1);
