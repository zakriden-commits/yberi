/* TurnikMan — физика турника.
   Чистый модуль без DOM и three.js: считается в Node, проверяется тестами.

   Модель: человек — жёсткая "палка" с центром масс. Пока держится за перекладину,
   это физический маятник с моментом инерции, зависящим от позы (группировка/прогиб).
   В полёте — снаряд с сохранением момента импульса: сгруппировался → закрутился быстрее.
*/

export const PHYS = {
  g: 9.81,
  rNeutral: 1.0,        // перекладина → центр масс, м
  rTuck: 0.62,
  rArch: 1.14,
  inertiaNeutral: 1.0,  // момент инерции относительно ЦМ (безразмерный)
  inertiaTuck: 0.52,
  inertiaArch: 1.38,
  damping: 0.42,        // сопротивление при раскачке, 1/с
  pumpAccel: 8.4,       // разгон при "махе", рад/с²
  maxOmega: 9.5,
  grabRadius: 0.75,     // радиус захвата кистями
  handLength: 0.95,     // ЦМ → кисти
  groundY: 0,
  landHeight: 0.55,     // высота ЦМ, на которой считаем приземление
  airDrag: 0.0,
};

const TAU = Math.PI * 2;
export const wrapPi = (a) => {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
};

export function radiusFor(pose) {
  if (pose === 'tuck') return PHYS.rTuck;
  if (pose === 'arch') return PHYS.rArch;
  return PHYS.rNeutral;
}

export function inertiaFor(pose) {
  if (pose === 'tuck') return PHYS.inertiaTuck;
  if (pose === 'arch') return PHYS.inertiaArch;
  return PHYS.inertiaNeutral;
}

/* ------------------------------------------------------------------ */
export class Sim {
  constructor(opts = {}) {
    this.bars = opts.bars || [{ x: 0, y: 3.1 }];
    this.groundY = opts.groundY !== undefined ? opts.groundY : PHYS.groundY;
    this.reset(0);
  }

  reset(barIndex = 0) {
    const bar = this.bars[Math.min(barIndex, this.bars.length - 1)];
    this.bar = bar;
    this.phase = 'hang';          // hang | air | landed
    this.theta = -0.55;           // стартовый замах
    this.omega = 0;
    this.pose = 'neutral';
    this.x = bar.x + Math.sin(this.theta) * radiusFor('neutral');
    this.y = bar.y - Math.cos(this.theta) * radiusFor('neutral');
    this.vx = 0;
    this.vy = 0;
    this.angle = -this.theta;     // абсолютный поворот тела (0 = вниз головой? нет: 0 = ноги вниз)
    this.spin = 0;
    this.flips = 0;               // целые обороты в текущем полёте
    this.rotAccum = 0;            // накопленный угол в полёте
    this.airTime = 0;
    this.hangTime = 0;
    this.grabCooldown = 0;
    this._events = [];
    this.lastLanding = null;
    return this;
  }

  get comRadius() { return radiusFor(this.pose); }

  hands() {
    const a = this.angle;
    const r = PHYS.handLength;
    return { x: this.x + Math.sin(a) * r, y: this.y + Math.cos(a) * r };
  }

  events() {
    const e = this._events;
    this._events = [];
    return e;
  }

  emit(type, data) {
    this._events.push(Object.assign({ type, t: this.airTime }, data || {}));
  }

  /* ---------------------------------------------------------------- */
  step(dt, input = {}) {
    // поза
    if (input.tuck) this.pose = 'tuck';
    else if (input.arch) this.pose = 'arch';
    else this.pose = 'neutral';

    if (this.phase === 'hang') {
      // отрыв считаем по текущему состоянию, до шага маятника
      if (input.release) this.release();
      if (this.phase === 'air') { this.stepAir(dt, input); return; }
      this.stepHang(dt, input);
    } else if (this.phase === 'air') {
      this.stepAir(dt, input);
    } else {
      this.stepLanded(dt, input);
    }
  }

  stepHang(dt, input) {
    this.hangTime += dt;
    const r = this.comRadius;

    // маятник: θ'' = -(g/r)·sinθ - k·ω + качание игрока
    let acc = -(PHYS.g / r) * Math.sin(this.theta);
    acc -= PHYS.damping * this.omega;

    if (input.pump) {
      // раскачка: подталкиваем в сторону текущего движения (а из состояния покоя — вперёд)
      const dir = Math.abs(this.omega) > 0.35 ? Math.sign(this.omega) : 1;
      acc += PHYS.pumpAccel * dir;
    }

    this.omega = Math.max(-PHYS.maxOmega, Math.min(PHYS.maxOmega, this.omega + acc * dt));
    this.theta += this.omega * dt;

    // удержание в разумных пределах: полный оборот на перекладине = "солнце"
    if (Math.abs(this.theta) > Math.PI) {
      this.theta = wrapPi(this.theta);
      this.emit('sun');
    }

    this.x = this.bar.x + Math.sin(this.theta) * r;
    this.y = this.bar.y - Math.cos(this.theta) * r;
    this.angle = -this.theta;
  }

  release() {
    if (this.phase !== 'hang') return;
    const r = this.comRadius;
    // скорость ЦМ при вращении вокруг перекладины
    this.vx = r * Math.cos(this.theta) * this.omega;
    this.vy = r * Math.sin(this.theta) * this.omega;
    // вращение тела в полёте равно ω; дальше его меняет только смена позы
    this.spin = this.omega;
    this._lastPose = this.pose;
    this.phase = 'air';
    this.airTime = 0;
    this.rotAccum = 0;
    this.flips = 0;
    this.grabCooldown = 0.08;
    this.emit('release', { omega: this.omega, pose: this.pose });
  }

  stepAir(dt, input) {
    this.airTime += dt;
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);

    // сохранение момента импульса: смена позы меняет момент инерции → меняется вращение
    if (this._lastPose !== this.pose) {
      this.spin *= inertiaFor(this._lastPose) / inertiaFor(this.pose);
      this._lastPose = this.pose;
    }

    this.vy -= PHYS.g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const dAngle = this.spin * dt;
    this.angle += dAngle;
    this.rotAccum += dAngle;

    const flips = Math.floor(Math.abs(this.rotAccum) / TAU);
    if (flips > this.flips) {
      this.flips = flips;
      this.emit('flip', { flips, direction: Math.sign(this.rotAccum) });
    }
    if (Math.abs(this.rotAccum) > TAU * 8) this.rotAccum = Math.sign(this.rotAccum) * TAU * 8;

    // попытка схватиться за перекладину
    if (input.grab && this.grabCooldown <= 0) this.tryGrab();

    // приземление
    if (this.y <= this.groundY + PHYS.landHeight) {
      this.land();
    }
  }

  tryGrab() {
    const h = this.hands();
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i];
      const d = Math.hypot(h.x - bar.x, h.y - bar.y);
      if (d > PHYS.grabRadius) continue;

      // переходим обратно в режим маятника
      const dx = this.x - bar.x;
      const dy = this.y - bar.y;
      const theta = Math.atan2(dx, -dy);
      const r = Math.max(0.55, Math.hypot(dx, dy));
      const tangentX = Math.cos(theta);
      const tangentY = Math.sin(theta);
      const vTangential = this.vx * tangentX + this.vy * tangentY;

      this.bar = bar;
      this.phase = 'hang';
      this.theta = theta;
      this.omega = Math.max(-PHYS.maxOmega, Math.min(PHYS.maxOmega, vTangential / r));
      this.pose = 'neutral';
      this._lastPose = 'neutral';
      this.hangTime = 0;
      this.emit('grab', { flips: this.flips, barIndex: i });
      return true;
    }
    return false;
  }

  land() {
    const upright = Math.abs(wrapPi(this.angle)) < 0.75;
    this.phase = 'landed';
    this.y = this.groundY + PHYS.landHeight;
    this.vy = 0;
    this.vx = 0;
    this.spin = 0;
    this.landTimer = 0;
    this.lastLanding = { clean: upright, flips: this.flips };
    this.emit('land', { clean: upright, flips: this.flips, airTime: this.airTime });
  }

  stepLanded(dt) {
    this.landTimer = (this.landTimer || 0) + dt;
  }

  respawn(barIndex) {
    this.reset(barIndex === undefined ? this.bars.indexOf(this.bar) : barIndex);
    this.emit('respawn');
  }
}

/* ---------------------------------------------------------------- подсчёт очков */
export function trickScore({ flips, clean, regrab, sun }) {
  let score = 0;
  const names = [];
  if (sun) { score += 60; names.push('СОЛНЦЕ'); }
  if (flips > 0) {
    const base = flips === 1 ? 100 : flips === 2 ? 260 : flips === 3 ? 520 : 520 + (flips - 3) * 320;
    score += base;
    names.push(flips === 1 ? 'САЛЬТО' : flips === 2 ? 'ДВОЙНОЕ' : flips === 3 ? 'ТРОЙНОЕ' : 'x' + flips + ' САЛЬТО');
  }
  if (regrab) { score += 80 + flips * 40; names.push('ПЕРЕХВАТ'); }
  if (clean && flips > 0) { score += 150; names.push('ЧИСТОЕ ПРИЗЕМЛЕНИЕ'); }
  return { score, name: names.join(' + ') };
}

export const coinsFor = (score) => Math.max(0, Math.floor(score / 25));
