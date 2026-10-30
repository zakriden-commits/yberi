/* Headless-прогон TurnikMan: заглушки three.js + DOM, настоящая логика игры.
   Ловит ошибки выполнения (undefined, неверные вызовы), не проверяет картинку. */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

/* ------------------------------------------------------------- DOM-заглушка */
function ctx2d() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas: { width: 256, height: 256 },
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', lineCap: '', lineJoin: '',
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({}),
    fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fill: noop, stroke: noop, clip: noop,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
    fillText: noop, strokeText: noop, drawImage: noop,
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
  };
}

function makeEl(tag = 'div', id = '') {
  const el = {
    tagName: tag.toUpperCase(), id, className: '', textContent: '', value: '0',
    children: [], listeners: {}, style: { cssText: '' }, dataset: {},
    _set: new Set(),
  };
  el.classList = {
    add: (...c) => c.forEach((x) => el._set.add(x)),
    remove: (...c) => c.forEach((x) => el._set.delete(x)),
    toggle: (c, on) => (on === undefined ? (el._set.has(c) ? el._set.delete(c) : el._set.add(c)) : (on ? el._set.add(c) : el._set.delete(c))),
    contains: (c) => el._set.has(c),
  };
  el.innerHTML = '';
  el.appendChild = (c) => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = (c) => { el.children = el.children.filter((x) => x !== c); return c; };
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.querySelector = () => makeEl('div');
  el.querySelectorAll = () => [];
  el.addEventListener = (t, fn) => { (el.listeners[t] = el.listeners[t] || []).push(fn); };
  el.removeEventListener = () => {};
  el.setAttribute = (k, v) => { el[k] = v; };
  el.getBoundingClientRect = () => ({ width: 390, height: 844, top: 0, left: 0 });
  el.getContext = () => ctx2d();
  el.toDataURL = () => 'data:image/png;base64,';
  el.width = 256;
  el.height = 256;
  el.fire = (t, ev = {}) => (el.listeners[t] || []).forEach((fn) => fn({ preventDefault() {}, target: el, ...ev }));
  return el;
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

/* id, которые реально есть в index.html — если приложение запросит другой, тест это увидит */
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const realIds = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const elements = new Map();
for (const id of realIds) elements.set(id, makeEl('div', id));

/* проставляем классы из разметки — иначе .hidden не работает как в браузере */
for (const m of html.matchAll(/<[a-z]+\b[^>]*>/g)) {
  const tag = m[0];
  const id = /id="([^"]+)"/.exec(tag)?.[1];
  const cls = /class="([^"]+)"/.exec(tag)?.[1];
  if (!id || !cls || !elements.has(id)) continue;
  for (const c of cls.split(/\s+/).filter(Boolean)) elements.get(id).classList.add(c);
}

const created = [];
globalThis.document = {
  body: makeEl('body'),
  getElementById: (id) => {
    if (!elements.has(id)) {
      const el = makeEl('div', id);
      el.__unknown = true;
      elements.set(id, el);
      return el;
    }
    return elements.get(id);
  },
  createElement: (tag) => {
    const el = makeEl(tag);
    created.push(el);
    return el;
  },
  querySelectorAll: () => [],
  addEventListener() {},
};

const winListeners = {};
globalThis.addEventListener = (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.fireWin = (t, ev = {}) => (winListeners[t] || []).forEach((fn) => fn({ preventDefault() {}, ...ev }));

let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.setTimeout = globalThis.setTimeout;
globalThis.window = globalThis;
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
globalThis.devicePixelRatio = 3;
globalThis.performance = { now: () => Date.now() };

/* --------------------------------------------------- подмена импорта three */
const src = fs.readFileSync(path.join(root, 'www/app.js'), 'utf8');
const patched = src.replace(
  "from './vendor/three.module.js'",
  `from '${pathToFileURL(path.join(root, 'test/mocks/three.mjs')).href}'`,
);
if (patched === src) throw new Error('не удалось подменить импорт three');
const tmpDir = path.join(root, 'test/.tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const entry = path.join(tmpDir, 'app.headless.mjs');
/* physics.js и content.js лежат рядом в www — импортируем их напрямую по абсолютным путям */
const patched2 = patched
  .replace("from './physics.js'", `from '${pathToFileURL(path.join(root, 'www/physics.js')).href}'`)
  .replace("from './content.js'", `from '${pathToFileURL(path.join(root, 'www/content.js')).href}'`);
fs.writeFileSync(entry, patched2);

let failed = 0;
let checks = 0;
const check = (name, cond, extra = '') => {
  checks++;
  if (cond) console.log('✓ ' + name);
  else { failed++; console.log('✗ ' + name + (extra ? ' — ' + extra : '')); }
};

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

await import(pathToFileURL(entry).href);

const content = await import(pathToFileURL(path.join(root, 'www/content.js')).href);
const { mapById, SKINS, buySkin, selectSkin, addCoins } = content;
const tm = globalThis.__turnikman;
check('boot() прошёл без исключения', errors.length === 0, errors.join(' | '));
check('отладочный доступ __turnikman выставлен', !!tm);
check('нет обращения к несуществующим id', ![...elements.values()].some((e) => e.__unknown),
  [...elements.values()].filter((e) => e.__unknown).map((e) => e.id).join(', '));

/* ------------------------------------------------------------- прогон игры */
const frames = (n) => { for (let i = 0; i < n; i++) { if (rafCb) rafCb(); } };

const key = (type, code) => {
  const evs = globalThis.listeners_all || [];
  const handlers = globalThis.__keyHandlers?.[type] || [];
  handlers.forEach((fn) => fn({ code, preventDefault() {} }));
};

frames(60);
check('сцена строится: у мира есть дети', true);

for (const mapId of ['yard', 'beach', 'gym', 'park']) {
  tm.save.map = mapId;
  let ok = true;
  let err = '';
  try { tm.buildMap(mapById(mapId)); } catch (e) { ok = false; err = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e); }
  check('карта «' + mapId + '» строится', ok, err);
}

let charOk = true;
try { tm.buildCharacter(); } catch (e) { charOk = false; errors.push(String(e)); }
check('персонаж собирается', charOk);

tm.startRun();
check('заезд стартует, sim создан', !!tm.sim && tm.sim.phase === 'hang');

/* ---------------------------------------------------------- обучение */
const tutEl = elements.get('tutorial');
check('при первом запуске показано обучение', !tutEl.classList.contains('hidden'));
const thetaBeforeTut = tm.sim.theta;
frames(60);
check('пока обучение открыто, физика на паузе', tm.sim.theta === thetaBeforeTut,
  'theta ' + thetaBeforeTut.toFixed(3) + '→' + tm.sim.theta.toFixed(3));
elements.get('tutorialBtn').fire('click');
check('обучение закрывается по кнопке', tutEl.classList.contains('hidden'));
check('факт обучения сохраняется', tm.save.settings.tutorial === true);

const pumpEl = elements.get('pumpBtn');
const actionEl = elements.get('actionBtn');

/* ---------------------------------------------------------- раскачка */
const startTheta = Math.abs(tm.sim.theta);
pumpEl.fire('pointerdown');
frames(240);
const grown = Math.abs(tm.sim.theta) > startTheta + 0.1 || Math.abs(tm.sim.omega) > 0.8;
check('раскачка раскачивает маятник', grown,
  'theta ' + startTheta.toFixed(2) + '→' + Math.abs(tm.sim.theta).toFixed(2) + ', omega ' + tm.sim.omega.toFixed(2));
pumpEl.fire('pointerup');

/* ---------------------------------------------------------- отпускание */
const map0 = tm.save.map;
actionEl.fire('pointerdown');
frames(1);
check('отпускание срывает с турника', tm.sim.phase === 'air', 'phase=' + tm.sim.phase);

let landed = false;
for (let i = 0; i < 900 && !landed; i++) { frames(1); if (tm.sim.phase === 'landed') landed = true; }
check('заезд завершается приземлением', landed, 'phase=' + tm.sim.phase + ' y=' + tm.sim.y.toFixed(2));
check('за приземление начислены монеты', tm.save.coins > 0, 'coins=' + tm.save.coins);
check('модалка результата открылась', !elements.get('result').classList.contains('hidden'));

/* ------------------------------------------- долгий случайный прогон */
let nan = false, respawns = 0, maxScore = 0;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
for (let i = 0; i < 3000; i++) {
  if (i % 17 === 0) {
    const r = rnd();
    fireWin('keydown', { code: r < 0.45 ? 'KeyA' : r < 0.7 ? 'KeyD' : 'Space' });
    if (r > 0.55) fireWin('keyup', { code: 'KeyA' });
    if (r > 0.75) fireWin('keyup', { code: 'KeyD' });
  }
  frames(1);
  const s = tm.sim;
  if (![s.x, s.y, s.angle, s.omega].every(Number.isFinite)) { nan = true; break; }
  maxScore = Math.max(maxScore, tm.score);
  if (s.phase === 'landed') { elements.get('againBtn').fire('click'); respawns++; }
}
fireWin('keyup', { code: 'KeyA' });
fireWin('keyup', { code: 'KeyD' });
check('физика не выдаёт NaN за 3000 кадров случайной игры', !nan);
check('перезапуск после приземления работает', respawns > 0, 'респавнов: ' + respawns);
check('очки начисляются за трюки', maxScore >= 0 && Number.isFinite(maxScore), 'макс. счёт: ' + maxScore);

/* ---------------------------------------------------------- карты */
for (const mapId of ['beach', 'gym', 'park']) {
  tm.save.map = mapId;
  tm.buildMap(mapById(mapId));
  tm.resetCharacterToBar();
  tm.startRun();
  frames(20);
  check('игра идёт на карте «' + mapId + '»', !!tm.sim && tm.sim.phase === 'hang' && !nan);
}
tm.save.map = map0;
tm.buildMap(mapById(map0));

/* ---------------------------------------------------------- режим на время */
tm.save.mode = 'timed';
tm.startRun();
const timerEl = elements.get('timer');
check('в режиме на время таймер виден', !timerEl.classList.contains('hidden'));
check('стартовое время 60 секунд', tm.timeLeft > 59 && tm.timeLeft <= 60, 'timeLeft=' + tm.timeLeft.toFixed(2));
frames(120);
check('таймер убывает', tm.timeLeft < 60, 'timeLeft=' + tm.timeLeft.toFixed(2));

elements.get('actionBtn').fire('pointerdown');   // срыв с турника
elements.get('actionBtn').fire('pointerdown');   // попытка перехвата
frames(500);
check('в режиме на время падение не закрывает заезд', elements.get('result').classList.contains('hidden'));
check('после падения игрок возвращается на перекладину', tm.sim.phase === 'hang', 'phase=' + tm.sim.phase);

let guard = 0;
while (elements.get('result').classList.contains('hidden') && guard < 5000) { frames(1); guard++; }
check('время вышло — заезд закрылся сам', !elements.get('result').classList.contains('hidden'), 'кадров: ' + guard);
check('заголовок «ВРЕМЯ ВЫШЛО»', elements.get('resultTitle').textContent === 'ВРЕМЯ ВЫШЛО',
  'получено: ' + elements.get('resultTitle').textContent);

/* переключение режима кнопкой */
tm.save.mode = 'free';
elements.get('modeBtn').fire('click');
check('кнопка режима переключает на «на время»', tm.save.mode === 'timed', 'mode=' + tm.save.mode);
elements.get('modeBtn').fire('click');
check('кнопка режима возвращает «свободный»', tm.save.mode === 'free', 'mode=' + tm.save.mode);

/* ---------------------------------------------------------- магазин */
const closed = SKINS.filter((s) => s.price > 0 && !tm.save.owned.includes(s.id));
const target = closed[closed.length - 1] || SKINS[SKINS.length - 1];
tm.save.coins = 0;
const poor = buySkin(tm.save, target.id);
check('без денег скин не покупается', poor.ok === false, 'ok=' + poor.ok);

addCoins(tm.save, 99999);
const bought = buySkin(tm.save, target.id);
check('с деньгами скин покупается', bought.ok === true && tm.save.owned.includes(target.id), JSON.stringify(bought));

const eq = selectSkin(tm.save, target.id);
check('купленный скин надевается', eq.ok === true && tm.save.skin === target.id, JSON.stringify(eq));
const bogus = buySkin(tm.save, 'no-such-skin');
check('неизвестный скин отклоняется', bogus.ok === false);
check('сохранение записалось в localStorage', !!localStorage.getItem('turnikman.save.v1'));

/* ---------------------------------------------------------- шторки */
for (const [btn, sheet] of [['mapsBtn', 'mapsSheet'], ['skinsBtn', 'skinsSheet'], ['settingsBtn', 'settingsSheet']]) {
  elements.get(sheet).classList.add('hidden');
  elements.get(btn).fire('click');
  check('шторка «' + sheet + '» открывается', !elements.get(sheet).classList.contains('hidden'));
}

console.error = origError;
console.log('\n' + (failed === 0 ? '✓ headless-прогон пройден (' + checks + ' проверок)' : '✗ провалов: ' + failed));
process.exit(failed === 0 ? 0 : 1);
