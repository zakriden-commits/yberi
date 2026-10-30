/* TurnikMan — контент и сохранения.
   Чистый модуль: карты, скины, кошелёк. Тестируется в Node. */

export const SAVE_KEY = 'turnikman.save.v1';

/* ---------------- скины ---------------- */
export const SKINS = [
  { id: 'classic', name: 'Классик', price: 0, desc: 'Майка, шорты, ничего лишнего',
    colors: { skin: '#e8b48f', shirt: '#f2f2f0', shorts: '#c8443c', cap: null, shoe: '#f5f5f5' }, bulk: 1.0 },
  { id: 'beach', name: 'Пляжник', price: 150, desc: 'Загорелый, в шортах и кепке',
    colors: { skin: '#c98a5a', shirt: null, shorts: '#2b8ca8', cap: '#35d0c0', shoe: '#ffffff' }, bulk: 1.0 },
  { id: 'beef', name: 'Качок', price: 400, desc: 'Масса — это сила',
    colors: { skin: '#e0a074', shirt: null, shorts: '#2b2f36', cap: null, shoe: '#2b2f36' }, bulk: 1.35 },
  { id: 'ninja', name: 'Ниндзя', price: 700, desc: 'Тихий, как падение с турника',
    colors: { skin: '#d9a97f', shirt: '#20242c', shorts: '#20242c', cap: '#12151a', shoe: '#12151a' }, bulk: 1.05 },
  { id: 'cosmo', name: 'Космонавт', price: 1100, desc: 'Готов к невесомости',
    colors: { skin: '#e8b48f', shirt: '#eef3f8', shorts: '#dfe6ee', cap: '#cfd8e3', shoe: '#a9b6c4' }, bulk: 1.0 },
  { id: 'gold', name: 'Золотой', price: 1800, desc: 'Турник тоже должен блестеть',
    colors: { skin: '#f0c08a', shirt: '#ffcf4d', shorts: '#e0a020', cap: '#ffe08a', shoe: '#ffd35c' }, bulk: 1.15 },
  { id: 'neon', name: 'Неон', price: 2600, desc: 'Светится в темноте',
    colors: { skin: '#c8fff4', shirt: '#12263a', shorts: '#12e0c8', cap: '#ff3d8b', shoe: '#12e0c8' }, bulk: 1.05, glow: true },
  { id: 'legend', name: 'Легенда', price: 4000, desc: 'О нём снимают ролики',
    colors: { skin: '#b57a4a', shirt: null, shorts: '#111318', cap: '#ffcf4d', shoe: '#ffcf4d' }, bulk: 1.4, glow: true },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

/* ---------------- карты ---------------- */
export const MAPS = [
  {
    id: 'yard', name: 'Двор', tag: 'старт',
    desc: 'Бетон, стена и один турник. С него всё начинается.',
    sky: '#8fb6c9', fog: '#a9c3d1', ground: '#9a9a94',
    bars: [{ x: 0, y: 3.15 }],
    bounds: { min: -6, max: 12 },
  },
  {
    id: 'beach', name: 'Пляж', tag: 'море',
    desc: 'Турник у воды. Падать мягче, но и печёт сильнее.',
    sky: '#8fd7ea', fog: '#bfe6ef', ground: '#f0d29b',
    bars: [{ x: 0, y: 3.05 }],
    bounds: { min: -7, max: 13 },
  },
  {
    id: 'gym', name: 'Зал', tag: 'свет',
    desc: 'Свой угол: маты, блины и нормальный свет.',
    sky: '#2b3644', fog: '#2b3644', ground: '#5a6472',
    bars: [{ x: 0, y: 3.2 }],
    bounds: { min: -6, max: 11 },
  },
  {
    id: 'park', name: 'Парк', tag: 'два турника',
    desc: 'Два снаряда рядом: перехват с одного на другой.',
    sky: '#9fd3b4', fog: '#c3e3cf', ground: '#7fae6b',
    bars: [{ x: -2.4, y: 3.1 }, { x: 3.6, y: 3.1 }],
    bounds: { min: -8, max: 14 },
  },
];

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

/* ---------------- состояние ---------------- */
export function createSave() {
  return {
    version: 1,
    coins: 0,
    best: 0,
    totalFlips: 0,
    runs: 0,
    skin: 'classic',
    map: 'yard',
    owned: ['classic'],
    settings: { music: 0.4, sfx: 0.75, muted: false },
  };
}

export function sanitize(raw) {
  const def = createSave();
  if (!raw || typeof raw !== 'object') return def;
  const s = Object.assign({}, def, raw);

  s.coins = Number.isFinite(Number(s.coins)) ? Math.max(0, Math.floor(Number(s.coins))) : 0;
  s.best = Number.isFinite(Number(s.best)) ? Math.max(0, Math.floor(Number(s.best))) : 0;
  s.totalFlips = Number.isFinite(Number(s.totalFlips)) ? Math.max(0, Math.floor(Number(s.totalFlips))) : 0;
  s.runs = Number.isFinite(Number(s.runs)) ? Math.max(0, Math.floor(Number(s.runs))) : 0;

  const owned = Array.isArray(s.owned) ? s.owned.filter((id) => SKINS.some((k) => k.id === id)) : [];
  if (!owned.includes('classic')) owned.unshift('classic');
  s.owned = [...new Set(owned)];

  s.skin = skinById(s.skin).id;
  if (!s.owned.includes(s.skin)) s.skin = 'classic';
  s.map = mapById(s.map).id;

  s.settings = Object.assign({}, def.settings, s.settings || {});
  const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0.5);
  s.settings.music = clamp01(s.settings.music);
  s.settings.sfx = clamp01(s.settings.sfx);
  return s;
}

/* ---------------- действия ---------------- */
export function buySkin(save, id) {
  const skin = SKINS.find((k) => k.id === id);
  if (!skin) return { ok: false, reason: 'unknown' };
  if (save.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (save.coins < skin.price) return { ok: false, reason: 'coins', need: skin.price - save.coins };
  save.coins -= skin.price;
  save.owned.push(id);
  return { ok: true, spent: skin.price };
}

export function selectSkin(save, id) {
  if (!save.owned.includes(id)) return { ok: false, reason: 'locked' };
  save.skin = id;
  return { ok: true };
}

export function selectMap(save, id) {
  if (!MAPS.some((m) => m.id === id)) return { ok: false, reason: 'unknown' };
  save.map = id;
  return { ok: true };
}

export function addCoins(save, amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  save.coins += n;
  return n;
}

export function recordRun(save, score, flips) {
  save.runs += 1;
  save.totalFlips += Math.max(0, flips | 0);
  if (score > save.best) { save.best = score; return true; }
  return false;
}

export function saveGame(save, storage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; }
  catch (err) { return false; }
}

export function loadGame(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return createSave();
    return sanitize(JSON.parse(raw));
  } catch (err) {
    return createSave();
  }
}
