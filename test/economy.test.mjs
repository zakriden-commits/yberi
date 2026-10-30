/* Экономика STRONG TYCOON — проверка без браузера */
import assert from 'node:assert';
import {
  createState, sanitize, TIERS, UPGRADES,
  upgradeCost, buyUpgrade, buyTier, activeTier,
  clientPayout, clientDuration, stationCount, spawnInterval,
  incomeMultiplier, timeMultiplier, rankFor, nextRank,
  saveState, loadState, formatMoney, SAVE_KEY, SECONDS_PER_MINUTE,
} from '../www/economy.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
};

console.log('\nновая игра:');
test('стартовый капитал и ранг', () => {
  const s = createState();
  assert.equal(s.money, 200);
  assert.equal(rankFor(s.totalEarned).name, 'Пляжный сарай');
  assert.equal(stationCount(s), 2);
  assert.equal(s.tierIndex, 0);
});
test('стартовый абонемент — «Пробный»', () => {
  assert.equal(activeTier(createState()).name, 'Пробный');
  assert.equal(activeTier(createState()).minutes, 1);
});
test('максимальный абонемент — 5 минут', () => {
  const maxMinutes = Math.max(...TIERS.map((t) => t.minutes));
  assert.equal(maxMinutes, 5);
});
test('длительность на снаряде: 5 минут = 30 секунд игры', () => {
  const s = createState();
  assert.equal(clientDuration(s, 2), 5 * SECONDS_PER_MINUTE);
});

console.log('\nулучшения:');
test('цена растёт с уровнем', () => {
  const s = createState();
  const c0 = upgradeCost(s, 'marketing');
  s.upgrades.marketing = 1;
  const c1 = upgradeCost(s, 'marketing');
  assert.ok(c1 > c0, c1 + ' должен быть больше ' + c0);
});
test('покупка списывает деньги и повышает уровень', () => {
  const s = createState();
  s.money = 10000;
  const before = s.money;
  const res = buyUpgrade(s, 'equipment');
  assert.ok(res.ok);
  assert.equal(s.upgrades.equipment, 1);
  assert.equal(s.money, before - res.cost);
});
test('нельзя купить без денег', () => {
  const s = createState();
  s.money = 1;
  const res = buyUpgrade(s, 'marketing');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'money');
});
test('уровень не превышает максимум', () => {
  const s = createState();
  s.money = 1e9;
  for (let i = 0; i < 40; i++) buyUpgrade(s, 'capacity');
  assert.equal(s.upgrades.capacity, UPGRADES.capacity.max);
  assert.equal(stationCount(s), 2 + UPGRADES.capacity.max);
  assert.equal(upgradeCost(s, 'capacity'), Infinity);
});
test('улучшения повышают чек и темп', () => {
  const s = createState();
  const base = clientPayout(s);
  s.money = 1e6;
  buyUpgrade(s, 'equipment');
  buyUpgrade(s, 'equipment');
  buyUpgrade(s, 'trainer');
  assert.ok(clientPayout(s) > base * 1.5, 'чек должен заметно вырасти');
  assert.ok(timeMultiplier(s) === 1);
  buyUpgrade(s, 'speed');
  assert.ok(timeMultiplier(s) > 1);
  assert.ok(incomeMultiplier(s) > 1);
});
test('реклама ускоряет поток клиентов', () => {
  const s = createState();
  const before = spawnInterval(s);
  s.money = 1e6;
  for (let i = 0; i < 5; i++) buyUpgrade(s, 'marketing');
  assert.ok(spawnInterval(s) < before);
  assert.ok(spawnInterval(s) >= 1.1, 'интервал не может быть меньше 1.1 с');
});

console.log('\nкаталог абонементов:');
test('дорогой абонемент платит больше', () => {
  const s = createState();
  assert.ok(clientPayout(s, 2) > clientPayout(s, 1));
  assert.ok(clientPayout(s, 1) > clientPayout(s, 0));
});
test('открытие абонемента списывает цену и активирует его', () => {
  const s = createState();
  s.money = 5000;
  const res = buyTier(s, 1);
  assert.ok(res.ok);
  assert.equal(res.cost, TIERS[1].unlockCost);
  assert.equal(s.tierIndex, 1);
  assert.equal(activeTier(s).name, TIERS[1].name);
});
test('нельзя открыть без денег', () => {
  const s = createState();
  s.money = 10;
  const res = buyTier(s, 2);
  assert.equal(res.ok, false);
  assert.equal(s.tierUnlocked[2], false);
});
test('переключение на уже открытый — бесплатно', () => {
  const s = createState();
  s.money = 5000;
  buyTier(s, 1);
  const res = buyTier(s, 0);
  assert.equal(res.cost, 0);
  assert.equal(s.tierIndex, 0);
});

console.log('\nсохранения:');
test('сохранение и загрузка не теряют прогресс', () => {
  const store = new Map();
  const fakeStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const s = createState();
  s.money = 4321;
  s.upgrades.capacity = 2;
  s.tierUnlocked[1] = true;
  s.tierIndex = 1;
  saveState(s, fakeStorage);
  assert.ok(store.has(SAVE_KEY));
  const loaded = loadState(fakeStorage);
  assert.equal(loaded.money, 4321);
  assert.equal(loaded.upgrades.capacity, 2);
  assert.equal(loaded.tierIndex, 1);
});
test('битое сохранение не ломает игру', () => {
  const fakeStorage = { getItem: () => '{"money": "ой", "upgrades": null}', setItem: () => {} };
  const s = loadState(fakeStorage);
  assert.equal(typeof s.money, 'number');
  assert.ok(s.money >= 0);
  assert.equal(s.tierIndex, 0);
});
test('sanitize чинит невозможные значения', () => {
  const s = sanitize({ money: -50, tierIndex: 99, upgrades: { marketing: 999 }, settings: { music: 5 } });
  assert.equal(s.money, 0);
  assert.ok(s.tierIndex < TIERS.length);
  assert.equal(s.upgrades.marketing, UPGRADES.marketing.max);
  assert.equal(s.settings.music, 1);
});

console.log('\nформат:');
test('деньги форматируются по-человечески', () => {
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(1500), '1 500');
  assert.equal(formatMoney(2500000), '2,5 млн');
  assert.equal(formatMoney(3000000000), '3 млрд');
});
test('ранги растут вместе с доходом', () => {
  assert.equal(rankFor(0).name, 'Пляжный сарай');
  assert.equal(rankFor(1e6).name, 'Империя турников');
  assert.equal(nextRank(0).name, 'Уголок качка');
});

console.log('\nсимуляция 20 минут игры (бот играет разумно):');
test('игрок может развиться с 200 ₽ до миллионов', () => {
  const s = createState();
  let t = 0;
  let clientTimer = 2;
  const step = 0.1;

  const bestBuy = () => {
    // бот докупает самое дешёвое доступное улучшение, приоритет — снаряды и реклама
    const order = ['capacity', 'marketing', 'equipment', 'trainer', 'speed'];
    for (const id of order) {
      const cost = upgradeCost(s, id);
      if (Number.isFinite(cost) && s.money >= cost) return id;
    }
    return null;
  };

  while (t < 20 * 60) {
    t += step;
    const stations = stationCount(s);
    const cycle = clientDuration(s) + spawnInterval(s);
    // поток клиентов ограничен и станциями, и рекламой
    clientTimer -= step;
    if (clientTimer <= 0) {
      const pay = clientPayout(s);
      s.money += pay;
      s.totalEarned += pay;
      s.totalClients += 1;
      clientTimer = Math.max(spawnInterval(s), clientDuration(s) / Math.max(1, stations)) * 1.0;
    }
    // бот тратит деньги
    if (Math.random() < 0.08) {
      const id = bestBuy();
      if (id) buyUpgrade(s, id);
      if (s.money > 1200 && !s.tierUnlocked[1]) buyTier(s, 1);
      if (s.money > 4000 && !s.tierUnlocked[2]) buyTier(s, 2);
    }
  }

  console.log('      итог: ' + formatMoney(s.money) + ' ₽, клиентов ' + s.totalClients +
              ', станций ' + stationCount(s) + ', ранг «' + rankFor(s.totalEarned).name + '»');
  assert.ok(s.totalEarned > 20000, 'за 20 минут доход должен быть существенным: ' + s.totalEarned);
  assert.ok(s.upgrades.capacity >= 1, 'бот должен был расширить зал');
});

console.log('\n' + (fail ? '✗ провалено: ' + fail : '✓ все проверки пройдены') + ' (успешно: ' + pass + ')');
process.exit(fail ? 1 : 0);
