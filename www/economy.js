/* STRONG TYCOON — economy model.
   Pure ES module: no DOM, no three.js. Testable in Node. */

export const SAVE_KEY = 'strongTycoon.save.v2';

/* Сколько реальных секунд длится одна «минута» абонемента.
   Абонемент на 5 минут = 30 секунд на снаряде. */
export const SECONDS_PER_MINUTE = 6;

/* ---------------- каталог абонементов ---------------- */
export const TIERS = [
  {
    id: 'trial', name: 'Пробный', minutes: 1, price: 50, unlockCost: 0,
    tag: 'Старт', desc: 'Зашёл, подтянулся, ушёл. Дёшево и быстро — но и касса тонкая.',
  },
  {
    id: 'standard', name: 'Стандарт', minutes: 3, price: 150, unlockCost: 320,
    tag: 'Хит', desc: 'Три минуты на снаряде. Клиент задерживается — касса довольна.',
  },
  {
    id: 'pro', name: 'Про', minutes: 5, price: 320, unlockCost: 900,
    tag: 'Максимум', desc: 'Пять минут — предел по правилам зала. Самый дорогой абонемент.',
  },
];

/* ---------------- улучшения ---------------- */
export const UPGRADES = {
  marketing: {
    id: 'marketing', name: 'Реклама', icon: '📣', max: 10,
    baseCost: 120, growth: 1.7,
    desc: '+22% к потоку клиентов',
    perLevel: (lvl) => 'Поток: ' + Math.round((1 + 0.22 * lvl) * 100) + '%',
  },
  capacity: {
    id: 'capacity', name: 'Снаряды', icon: '🏋️', max: 3,
    baseCost: 400, growth: 2.05,
    desc: '+1 место для клиента',
    perLevel: (lvl) => 'Мест: ' + (2 + lvl),
  },
  equipment: {
    id: 'equipment', name: 'Оборудование', icon: '⚙️', max: 10,
    baseCost: 200, growth: 1.75,
    desc: '+30% к чеку с клиента',
    perLevel: (lvl) => 'Чек: ×' + (1 + 0.3 * lvl).toFixed(2),
  },
  trainer: {
    id: 'trainer', name: 'Тренер', icon: '💪', max: 6,
    baseCost: 550, growth: 1.9,
    desc: '+18% к чеку и +8% скорости тренировки',
    perLevel: (lvl) => 'Тренер: ур. ' + lvl,
  },
  speed: {
    id: 'speed', name: 'Темп', icon: '⏩', max: 6,
    baseCost: 350, growth: 1.8,
    desc: 'Ускоряет время в зале на 12%',
    perLevel: (lvl) => 'Время: ×' + (1 + 0.12 * lvl).toFixed(2),
  },
};

export const UPGRADE_ORDER = ['marketing', 'capacity', 'equipment', 'trainer', 'speed'];

/* ---------------- состояние ---------------- */
export function createState() {
  return {
    version: 2,
    money: 200,
    totalEarned: 0,
    totalClients: 0,
    tierIndex: 0,
    tierUnlocked: [true, false, false],
    upgrades: { marketing: 0, capacity: 0, equipment: 0, trainer: 0, speed: 0 },
    settings: { music: 0.45, sfx: 0.7, muted: false },
    startedAt: Date.now(),
  };
}

export function sanitize(raw) {
  const fresh = createState();
  if (!raw || typeof raw !== 'object') return fresh;
  const defaults = createState();
  const s = Object.assign({}, defaults, raw);
  s.money = Number.isFinite(Number(s.money)) ? Math.max(0, Number(s.money)) : defaults.money;
  s.totalEarned = Number.isFinite(Number(s.totalEarned)) ? Math.max(0, Number(s.totalEarned)) : 0;
  s.totalClients = Number.isFinite(Number(s.totalClients)) ? Math.max(0, Number(s.totalClients)) : 0;
  s.tierIndex = Math.min(TIERS.length - 1, Math.max(0, s.tierIndex | 0));
  s.tierUnlocked = TIERS.map((_, i) => Boolean(s.tierUnlocked && s.tierUnlocked[i]) || i === 0);
  if (s.tierUnlocked[s.tierIndex] === false) s.tierIndex = 0;
  s.upgrades = Object.assign({}, defaults.upgrades, s.upgrades || {});
  for (const id of UPGRADE_ORDER) {
    s.upgrades[id] = Math.min(UPGRADES[id].max, Math.max(0, s.upgrades[id] | 0));
  }
  s.settings = Object.assign({}, defaults.settings, s.settings || {});
  s.settings.music = clamp01(s.settings.music);
  s.settings.sfx = clamp01(s.settings.sfx);
  return s;
}

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/* ---------------- производные величины ---------------- */
export function incomeMultiplier(state) {
  return (1 + 0.3 * state.upgrades.equipment) * (1 + 0.18 * state.upgrades.trainer);
}

export function trainSpeedMultiplier(state) {
  return (1 + 0.08 * state.upgrades.trainer);
}

export function timeMultiplier(state) {
  return 1 + 0.12 * state.upgrades.speed;
}

export function stationCount(state) {
  return 2 + state.upgrades.capacity;
}

export function spawnInterval(state) {
  const rate = 1 + 0.22 * state.upgrades.marketing;
  return Math.max(1.1, 4.8 / rate);
}

export function activeTier(state) {
  return TIERS[state.tierIndex] || TIERS[0];
}

export function clientPayout(state, tierIndex) {
  const tier = TIERS[tierIndex === undefined ? state.tierIndex : tierIndex];
  return Math.round(tier.price * incomeMultiplier(state));
}

/* сколько секунд клиент занимает снаряд */
export function clientDuration(state, tierIndex) {
  const tier = TIERS[tierIndex === undefined ? state.tierIndex : tierIndex];
  return (tier.minutes * SECONDS_PER_MINUTE) / trainSpeedMultiplier(state);
}

/* ---------------- покупки ---------------- */
export function upgradeCost(state, id) {
  const def = UPGRADES[id];
  const lvl = state.upgrades[id];
  if (!def || lvl >= def.max) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.growth, lvl));
}

export function buyUpgrade(state, id) {
  const def = UPGRADES[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const cost = upgradeCost(state, id);
  if (!Number.isFinite(cost)) return { ok: false, reason: 'max' };
  if (state.money < cost) return { ok: false, reason: 'money' };
  state.money -= cost;
  state.upgrades[id] += 1;
  return { ok: true, cost, level: state.upgrades[id] };
}

export function buyTier(state, index) {
  const tier = TIERS[index];
  if (!tier) return { ok: false, reason: 'unknown' };
  if (state.tierUnlocked[index]) {
    state.tierIndex = index;
    return { ok: true, activated: true, cost: 0 };
  }
  if (state.money < tier.unlockCost) return { ok: false, reason: 'money' };
  state.money -= tier.unlockCost;
  state.tierUnlocked[index] = true;
  state.tierIndex = index;
  return { ok: true, activated: true, cost: tier.unlockCost };
}

/* ---------------- ранги ---------------- */
export const RANKS = [
  { at: 0, name: 'Пляжный сарай' },
  { at: 1500, name: 'Уголок качка' },
  { at: 6000, name: 'Пляжный зал' },
  { at: 18000, name: 'Фитнес-база' },
  { at: 45000, name: 'Атлетик-центр' },
  { at: 100000, name: 'Империя турников' },
];

export function rankFor(totalEarned) {
  let rank = RANKS[0];
  for (const r of RANKS) if (totalEarned >= r.at) rank = r;
  return rank;
}

export function nextRank(totalEarned) {
  for (const r of RANKS) if (totalEarned < r.at) return r;
  return null;
}

/* ---------------- сохранение ---------------- */
export function saveState(state, storage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return createState();
    return sanitize(JSON.parse(raw));
  } catch (err) {
    return createState();
  }
}

/* форматирование денег */
export function formatMoney(v) {
  const n = Math.max(0, Math.round(v));
  const dec = (v) => v.toFixed(1).replace('.', ',').replace(',0', '');
  if (n >= 1e9) return dec(n / 1e9) + ' млрд';
  if (n >= 1e6) return dec(n / 1e6) + ' млн';
  return n.toLocaleString('ru-RU');
}
