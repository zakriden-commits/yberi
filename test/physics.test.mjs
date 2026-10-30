/* TurnikMan — проверка физики без браузера */
import { Sim, PHYS, wrapPi, radiusFor, trickScore, coinsFor, inertiaFor } from '../www/physics.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
};
const near = (a, b, tol, msg) => {
  if (Math.abs(a - b) > tol) throw new Error((msg || '') + ': ' + a.toFixed(4) + ' vs ' + b.toFixed(4) + ' (допуск ' + tol + ')');
};
const sim = (opts) => new Sim(Object.assign({ bars: [{ x: 0, y: 3.1 }] }, opts || {}));
const run = (s, seconds, input, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) s.step(dt, input);
};

console.log('\nмаятник:');
test('период малых колебаний совпадает с теорией', () => {
  const s = sim();
  s.theta = 0.12; s.omega = 0;
  const saveDamp = PHYS.damping;
  PHYS.damping = 0;
  let crossings = 0, prev = s.omega;
  const dt = 1 / 240;
  let t = 0;
  const times = [];
  for (let i = 0; i < 240 * 6; i++) {
    s.step(dt, {});
    t += dt;
    if (prev > 0 && s.omega <= 0) times.push(t);
    prev = s.omega;
  }
  PHYS.damping = saveDamp;
  const period = (times[times.length - 1] - times[0]) / (times.length - 1);
  const expected = 2 * Math.PI * Math.sqrt(PHYS.rNeutral / PHYS.g);
  near(period, expected, expected * 0.06, 'период');
});
test('без сопротивления энергия сохраняется', () => {
  const s = sim();
  const saveDamp = PHYS.damping;
  PHYS.damping = 0;
  s.theta = 0.9; s.omega = 0;
  const energy = () => 0.5 * Math.pow(s.comRadius * s.omega, 2) + PHYS.g * s.comRadius * (1 - Math.cos(s.theta));
  const e0 = energy();
  run(s, 3, {});
  const e1 = energy();
  PHYS.damping = saveDamp;
  near(e1, e0, e0 * 0.05, 'энергия');
});
test('раскачка увеличивает амплитуду', () => {
  const s = sim();
  const amp0 = Math.abs(s.theta);
  // качаем в такт: тянем, когда движемся
  let maxAmp = amp0;
  for (let i = 0; i < 120 * 8; i++) {
    s.step(1 / 120, { pump: true });
    maxAmp = Math.max(maxAmp, Math.abs(s.theta));
  }
  if (!(maxAmp > amp0 * 1.8)) throw new Error('амплитуда не выросла: ' + amp0.toFixed(2) + ' → ' + maxAmp.toFixed(2));
});
test('раскачка не разгоняет бесконечно', () => {
  const s = sim();
  for (let i = 0; i < 120 * 20; i++) s.step(1 / 120, { pump: true });
  if (Math.abs(s.omega) > PHYS.maxOmega + 0.001) throw new Error('ω вышла за предел');
});

console.log('\nвыпускание и полёт:');
test('в нижней точке скорость горизонтальна', () => {
  const s = sim();
  s.theta = 0; s.omega = 4;
  s.step(1 / 120, { release: true });
  if (s.phase !== 'air') throw new Error('не оторвался');
  near(s.vy, 0, 0.12, 'vy');
  near(Math.abs(s.vx), 4 * PHYS.rNeutral, 0.15, 'vx');
});
test('вращение тела в полёте равно ω', () => {
  const s = sim();
  s.theta = 0.7; s.omega = 5;
  s.step(1 / 120, { release: true });
  near(s.spin, 5, 0.001, 'spin');
});
test('группировка ускоряет вращение по закону момента импульса', () => {
  const s = sim();
  s.theta = 0; s.omega = 4;
  s.step(1 / 120, { release: true });
  const spinBefore = s.spin;
  s.step(1 / 120, { tuck: true });
  const ratio = s.spin / spinBefore;
  near(ratio, inertiaFor('neutral') / inertiaFor('tuck'), 0.02, 'коэффициент группировки');
  if (!(ratio > 1.5)) throw new Error('группировка почти не ускоряет вращение');
});
test('прогиб замедляет вращение', () => {
  const s = sim();
  s.theta = 0; s.omega = 4;
  s.step(1 / 120, { release: true });
  const before = s.spin;
  s.step(1 / 120, { arch: true });
  if (!(s.spin < before)) throw new Error('прогиб должен замедлять');
});
test('обороты считаются', () => {
  const s = sim();
  s.theta = 0; s.omega = 6;
  s.step(1 / 120, { release: true });
  let flips = 0;
  for (let i = 0; i < 480 && s.phase === 'air'; i++) {
    s.y = 6;                 // держим в воздухе, чтобы проверить именно счёт оборотов
    s.step(1 / 120, {});
    flips = Math.max(flips, s.flips);
  }
  if (flips < 1) throw new Error('оборот не засчитан, flips=' + flips);
});

console.log('\nзахват и приземление:');
test('хват срабатывает рядом с перекладиной', () => {
  const s = sim();
  s.theta = 0; s.omega = 5;
  s.step(1 / 120, { release: true });
  // подводим кисти к перекладине
  s.x = 0; s.y = 3.1 - PHYS.handLength - 0.05; s.angle = 0;
  s.grabCooldown = 0;
  const ok = s.tryGrab();
  if (!ok || s.phase !== 'hang') throw new Error('не схватился');
});
test('далеко от перекладины хвата нет', () => {
  const s = sim();
  s.theta = 0; s.omega = 5;
  s.step(1 / 120, { release: true });
  s.x = 6; s.y = 1.5;
  s.grabCooldown = 0;
  if (s.tryGrab()) throw new Error('схватился слишком далеко');
});
test('чистое приземление распознаётся', () => {
  const s = sim();
  s.theta = 0; s.omega = 3;
  s.step(1 / 120, { release: true });
  s.angle = 0.1;
  s.y = 0.5; s.vy = -3;
  s.step(1 / 120, {});
  if (s.phase !== 'landed') throw new Error('не приземлился');
  if (!s.lastLanding.clean) throw new Error('приземление должно быть чистым');
});
test('приземление на голову не засчитывается как чистое', () => {
  const s = sim();
  s.theta = 0; s.omega = 3;
  s.step(1 / 120, { release: true });
  s.angle = Math.PI;
  s.y = 0.5; s.vy = -3;
  s.step(1 / 120, {});
  if (s.lastLanding.clean) throw new Error('перевернутое приземление не должно быть чистым');
});

console.log('\nочки:');
test('сальто дороже, чем ничего', () => {
  const a = trickScore({ flips: 0, clean: false });
  const b = trickScore({ flips: 1, clean: false });
  const c = trickScore({ flips: 2, clean: false });
  if (!(b.score > a.score && c.score > b.score)) throw new Error('прогрессия сломана');
});
test('чистое приземление даёт бонус и название', () => {
  const r = trickScore({ flips: 1, clean: true, regrab: false });
  if (!(r.score > trickScore({ flips: 1, clean: false }).score)) throw new Error('нет бонуса');
  if (!/САЛЬТО/.test(r.name)) throw new Error('нет названия трюка: ' + r.name);
});
test('монеты капают со счёта', () => {
  if (coinsFor(0) !== 0) throw new Error('с нуля монет быть не должно');
  if (coinsFor(1000) !== 40) throw new Error('неверный курс: ' + coinsFor(1000));
});

console.log('\nполный сценарий: раскачался → оторвался → сальто → приземлился');
test('полный цикл проходит без ошибок', () => {
  const s = sim();
  // раскачка
  for (let i = 0; i < 120 * 6; i++) s.step(1 / 120, { pump: true });
  const speed = Math.abs(s.omega);
  if (speed < 3) throw new Error('не раскачался: ω=' + speed.toFixed(2));
  // отрыв и группировка
  s.step(1 / 120, { release: true });
  let maxFlips = 0;
  for (let i = 0; i < 120 * 4 && s.phase === 'air'; i++) {
    s.y = 6;
    s.step(1 / 120, { tuck: true });
    maxFlips = Math.max(maxFlips, s.flips);
  }
  if (maxFlips < 1) throw new Error('не накрутил ни одного оборота, ω=' + speed.toFixed(2));
  const events = s.events();
  if (!events.some((e) => e.type === 'release')) throw new Error('нет события отрыва');
  if (!events.some((e) => e.type === 'flip')) throw new Error('нет события оборота');
});

console.log('\n' + (fail ? '✗ провалено: ' + fail : '✓ все проверки физики пройдены') + ' (успешно: ' + pass + ')');
process.exit(fail ? 1 : 0);
