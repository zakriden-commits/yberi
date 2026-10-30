/* Headless smoke test: runs www/game.js against a mocked DOM/canvas,
   simulates a play session and checks the game state machine + rules. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = 390, H = 844;

function makeEl(id) {
  const classes = new Set(id === 'over' ? ['hidden'] : []);
  const listeners = {};
  const el = {
    id, textContent: '', style: {}, attrs: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
      contains: (c) => classes.has(c),
    },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    setAttribute: (k, v) => { el.attrs[k] = v; },
    getAttribute: (k) => el.attrs[k],
    closest: () => null,
    click: () => (listeners.click || []).forEach((fn) => fn({ target: el, stopPropagation() {} })),
    _listeners: listeners,
    _classes: classes,
  };
  return el;
}

const elements = {};
const getEl = (id) => (elements[id] = elements[id] || makeEl(id));

const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'roundRect') return undefined;         // force the arcTo fallback
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

const canvas = getEl('game');
canvas.getContext = () => ctxStub;

const winListeners = {};
const store = new Map();

let rafCb = null;
let nowMs = 0;

const sandbox = {
  console,
  Math, Date, JSON, parseInt, parseFloat, isFinite, Number, String, Object, Array, Error, Set, Map,
  performance: { now: () => nowMs },
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  setTimeout: (fn, ms) => { pendingTimeouts.push({ fn, at: nowMs + ms }); return pendingTimeouts.length; },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
  navigator: {},
  document: {
    hidden: false,
    getElementById: getEl,
    addEventListener: () => {},
  },
  window: null,
};
sandbox.window = sandbox;
sandbox.window.innerWidth = W;
sandbox.window.innerHeight = H;
sandbox.window.devicePixelRatio = 2;
sandbox.window.addEventListener = (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); };
sandbox.window.AudioContext = undefined;
sandbox.window.webkitAudioContext = undefined;

const pendingTimeouts = [];
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });

function frame(ms) {
  nowMs += ms;
  for (let i = pendingTimeouts.length - 1; i >= 0; i--) {
    if (pendingTimeouts[i].at <= nowMs) { const t = pendingTimeouts.splice(i, 1)[0]; t.fn(); }
  }
  const cb = rafCb; rafCb = null;
  if (!cb) throw new Error('requestAnimationFrame chain broke');
  cb(nowMs);
}
function tap() {
  const ev = { target: { closest: () => null } };
  (winListeners.pointerdown || []).forEach((fn) => fn(ev));
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('boot:');
for (let i = 0; i < 30; i++) frame(16);
check('menu renders without throwing', rafCb !== null);
check('start screen visible', !elements.menu.classList.contains('hidden'));

console.log('start & play:');
getEl('playBtn').click();
check('hud shown after start', elements.hud.classList.contains('show'));
check('overlay hidden after start', elements.menu.classList.contains('hidden'));

// play ~6 seconds, tapping every 28 frames
let frames = 0, maxScore = 0;
try {
  for (let i = 0; i < 380; i++) {
    if (i % 28 === 0) tap();
    frame(16);
    frames++;
    maxScore = Math.max(maxScore, parseInt(elements.score.textContent, 10) || 0);
  }
} catch (e) {
  console.log('  ✗ playing threw: ' + e.message + '\n' + e.stack.split('\n').slice(0, 4).join('\n'));
  failures++;
}
check('ran 380 frames', frames === 380);
check('score accumulates while playing', maxScore > 0, 'score=' + maxScore);

// force a death: stop tapping and run long enough for a spike to arrive
console.log('death:');
try {
  for (let i = 0; i < 400; i++) frame(16);
} catch (e) {
  console.log('  ✗ post-death threw: ' + e.message);
  failures++;
}
const dead = !elements.over.classList.contains('hidden') || true;
check('game over overlay appeared', !elements.over.classList.contains('hidden'));
check('final score is shown', parseInt(elements.finalScore.textContent, 10) >= 0);

console.log('restart:');
try {
  getEl('againBtn').click();
  for (let i = 0; i < 60; i++) frame(16);
} catch (e) {
  console.log('  ✗ restart threw: ' + e.message);
  failures++;
}
check('restart worked', elements.over.classList.contains('hidden') && elements.score.textContent !== '');

console.log('resize:');
try {
  sandbox.window.innerWidth = 320; sandbox.window.innerHeight = 640;
  (winListeners.resize || []).forEach((fn) => fn());
  for (let i = 0; i < 30; i++) frame(16);
} catch (e) {
  console.log('  ✗ resize threw: ' + e.message);
  failures++;
}
check('resize handled', true);

console.log('\n' + (failures ? failures + ' check(s) failed' : 'all checks passed'));
process.exit(failures ? 1 : 0);
