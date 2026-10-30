import {
  SKINS, MAPS, MODES, createSave, sanitize, buySkin, selectSkin, selectMap, selectMode, addCoins,
  recordRun, saveGame, loadGame, skinById, mapById, modeById, SAVE_KEY,
} from '../www/content.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ': ' + a + ' != ' + b); };
const ok = (c, m) => { if (!c) throw new Error(m || 'условие не выполнено'); };

console.log('\nконтент:');
test('четыре карты', () => eq(MAPS.length, 4));
test('у каждой карты есть турник и границы', () => {
  MAPS.forEach((m) => {
    ok(m.bars.length >= 1, m.id + ': нет турника');
    ok(m.bounds.min < m.bounds.max, m.id + ': плохие границы');
  });
});
test('в парке два турника', () => eq(mapById('park').bars.length, 2));
test('восемь скинов и первый бесплатный', () => {
  eq(SKINS.length, 8);
  eq(SKINS[0].price, 0);
  ok(SKINS.every((s) => s.colors && typeof s.bulk === 'number'), 'у скина нет цветов');
});
test('цены скинов растут', () => {
  const prices = SKINS.map((s) => s.price);
  for (let i = 1; i < prices.length; i++) ok(prices[i] > prices[i - 1], 'цена не растёт на ' + SKINS[i].id);
});

console.log('\нсохранение:'.replace('\н', '\n'));
test('новая игра: нули и классик', () => {
  const s = createSave();
  eq(s.coins, 0); eq(s.skin, 'classic'); eq(s.map, 'yard');
  ok(s.owned.includes('classic'));
});
test('битые данные чинятся', () => {
  const s = sanitize({ coins: 'много', skin: 'нет-такого', map: 'xxx', owned: ['beach', 'фейк'], settings: { music: 9 } });
  eq(s.coins, 0);
  eq(s.skin, 'classic');
  eq(s.map, 'yard');
  eq(s.owned.length, 2);            // beach + классик добавился
  eq(s.settings.music, 1);
});
test('сохранение и загрузка', () => {
  const store = new Map();
  const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = createSave();
  s.coins = 777; s.best = 1500; s.skin = 'classic';
  saveGame(s, fake);
  ok(store.has(SAVE_KEY));
  const l = loadGame(fake);
  eq(l.coins, 777); eq(l.best, 1500);
});

console.log('\nмагазин скинов:');
test('покупка списывает монеты и выдаёт скин', () => {
  const s = createSave(); s.coins = 1000;
  const r = buySkin(s, 'ninja');
  ok(r.ok);
  eq(s.coins, 1000 - 700);
  ok(s.owned.includes('ninja'));
});
test('нельзя купить без денег', () => {
  const s = createSave(); s.coins = 100;
  const r = buySkin(s, 'legend');
  eq(r.ok, false); eq(r.reason, 'coins');
  eq(s.owned.includes('legend'), false);
});
test('нельзя купить дважды', () => {
  const s = createSave(); s.coins = 1000;
  buySkin(s, 'beach');
  const r = buySkin(s, 'beach');
  eq(r.ok, false); eq(r.reason, 'owned');
});
test('надеть можно только купленный', () => {
  const s = createSave();
  eq(selectSkin(s, 'gold').ok, false);
  s.coins = 2000; buySkin(s, 'gold');
  eq(selectSkin(s, 'gold').ok, true);
  eq(s.skin, 'gold');
});
test('монеты капают и не уходят в минус', () => {
  const s = createSave();
  addCoins(s, 120); eq(s.coins, 120);
  addCoins(s, -50);  eq(s.coins, 120);
});

console.log('\nкарты и рекорды:');
test('выбор карты', () => {
  const s = createSave();
  eq(selectMap(s, 'beach').ok, true); eq(s.map, 'beach');
  eq(selectMap(s, 'луна').ok, false);
});
test('рекорд обновляется', () => {
  const s = createSave();
  eq(recordRun(s, 500, 2), true);
  eq(s.best, 500);
  eq(recordRun(s, 300, 1), false);
  eq(s.best, 500);
  eq(s.totalFlips, 3);
  eq(s.runs, 2);
});
test('скин по id находится, неизвестный заменяется классикой', () => {
  eq(skinById('neon').name, 'Неон');
  eq(skinById('nope').id, 'classic');
});

test('режимы: выбор и защита от мусора', () => {
  const s = createSave();
  eq(s.mode, 'free');
  eq(selectMode(s, 'timed').ok, true);
  eq(s.mode, 'timed');
  eq(selectMode(s, 'ультрахард').ok, false);
  eq(s.mode, 'timed');
});
test('длительность режимов', () => {
  eq(modeById('free').time, 0);
  eq(modeById('timed').time, 60);
  eq(modeById('nope').id, 'free');
});
test('обучение по умолчанию не пройдено и чинится из мусора', () => {
  eq(createSave().settings.tutorial, false);
  eq(sanitize({ settings: { tutorial: 'да' } }).settings.tutorial, false);
  eq(sanitize({ settings: { tutorial: true } }).settings.tutorial, true);
});
test('sanitize чинит неизвестный режим', () => {
  eq(sanitize({ mode: 'лол' }).mode, 'free');
  eq(sanitize({ mode: 'timed' }).mode, 'timed');
});

console.log('\n' + (fail ? '✗ провалено: ' + fail : '✓ контент в порядке') + ' (успешно: ' + pass + ')');
process.exit(fail ? 1 : 0);
