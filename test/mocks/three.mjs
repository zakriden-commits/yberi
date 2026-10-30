/* Заглушка three.js для headless-прогона игры.
   Не рисует, но повторяет форму API — ловит ошибки выполнения в логике приложения. */

let objectsCreated = 0;

function makeVec(x = 0, y = 0, z = 0) {
  const v = {
    x, y, z,
    set(a, b, c) { v.x = a; v.y = b; v.z = c; return v; },
    setScalar(s) { v.x = v.y = v.z = s; return v; },
    copy(o) { v.x = o.x; v.y = o.y; v.z = o.z; return v; },
    add(o) { v.x += o.x; v.y += o.y; v.z += o.z; return v; },
    addScaledVector(o, s) { v.x += o.x * s; v.y += o.y * s; v.z += o.z * s; return v; },
    normalize() { return v; },
    project() { return v; },
    clone() { return makeVec(v.x, v.y, v.z); },
    length() { return Math.hypot(v.x, v.y, v.z); },
    distanceTo(o) { return Math.hypot(v.x - o.x, v.y - o.y, v.z - o.z); },
  };
  return v;
}

function makeObj() {
  objectsCreated++;
  const target = {
    position: makeVec(), rotation: makeVec(), scale: makeVec(1, 1, 1),
    userData: {}, children: [], visible: true, castShadow: false, receiveShadow: false,
    shadow: { mapSize: { set() {} }, camera: {}, bias: 0 },
    geometry: { dispose() {}, attributes: {} },
    material: { dispose() {} },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'then' || typeof k === 'symbol') return undefined;
      const fn = function () { return makeObj(); };
      t[k] = fn;
      return fn;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeClass() {
  return class {
    constructor(...args) {
      const o = makeObj();
      o.args = args;
      return o;
    }
  };
}

export const Scene = makeClass();
export const Group = makeClass();
export const Mesh = makeClass();
export const BoxGeometry = makeClass();
export const CapsuleGeometry = makeClass();
export const CylinderGeometry = makeClass();
export const SphereGeometry = makeClass();
export const PlaneGeometry = makeClass();
export const ConeGeometry = makeClass();
export const CircleGeometry = makeClass();
export const TorusGeometry = makeClass();
export const MeshStandardMaterial = makeClass();
export const MeshBasicMaterial = makeClass();
export const MeshPhongMaterial = makeClass();
export const CanvasTexture = makeClass();
export const Fog = makeClass();
export const HemisphereLight = makeClass();
export const DirectionalLight = makeClass();
export const AmbientLight = makeClass();
export const Object3D = makeClass();
export const Sprite = makeClass();

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { return makeVec(Number(x) || 0, Number(y) || 0, Number(z) || 0); }
}
export class Color {
  constructor(c) { this.c = c; }
  getHex() { return 0xffffff; }
  setHex(h) { this.c = h; return this; }
}
export class OrthographicCamera {
  constructor() { const o = makeObj(); o.left = 0; o.right = 0; o.top = 0; o.bottom = 0; return o; }
}
export class PerspectiveCamera {
  constructor(fov, aspect) {
    const o = makeObj();
    o.fov = fov; o.aspect = aspect;
    o.updateProjectionMatrix = () => {};
    o.lookAt = () => {};
    return o;
  }
}
export class WebGLRenderer {
  constructor() {
    const o = makeObj();
    o.domElement = { style: {}, addEventListener() {}, getContext: () => null };
    o.setPixelRatio = () => {};
    o.setSize = () => {};
    o.render = () => { o.renderCalls = (o.renderCalls || 0) + 1; };
    o.shadowMap = { enabled: false, type: 0 };
    o.outputColorSpace = '';
    return o;
  }
}
export class Clock {
  constructor() { this.t = 0; }
  getDelta() { this.t += 0.016; return 0.016; }
}
export const SRGBColorSpace = 'srgb';
export const PCFSoftShadowMap = 2;
export const DoubleSide = 2;
export const FrontSide = 0;
export const MathUtils = { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) };
export function getCreatedCount() { return objectsCreated; }
