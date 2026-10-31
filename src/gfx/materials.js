import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';

const SIZE = 512;
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296); }
function canvas() { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; }
function tex(scene, name, c, srgb = true) {
  const t = new DynamicTexture(name, c, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.gammaSpace = srgb; t.anisotropicFilteringLevel = 8; t.update(); return t;
}
function normalFromHeight(scene, name, h) {
  const src = h.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const out = canvas(); const ctx = out.getContext('2d'); const img = ctx.createImageData(SIZE, SIZE);
  const at = (x, y) => src[(((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)) * 4] / 255;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (at(x - 1, y) - at(x + 1, y)) * 2.2, dy = (at(x, y - 1) - at(x, y + 1)) * 2.2;
    const len = Math.hypot(dx, dy, 1); const i = (y * SIZE + x) * 4;
    img.data[i] = (dx / len * .5 + .5) * 255; img.data[i + 1] = (dy / len * .5 + .5) * 255; img.data[i + 2] = (1 / len * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return tex(scene, name, out, false);
}
function noise(ctx, r, amount, alpha = .08) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - .5) * amount; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0); void alpha;
}
function wood(scene, seed, base, plank = 64) {
  const r = rng(seed), a = canvas(), h = canvas(), ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = base; ac.fillRect(0, 0, SIZE, SIZE); hc.fillStyle = '#808080'; hc.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += plank) {
    const shade = (r() - .5) * 26; ac.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 235 : 0},${shade > 0 ? 200 : 0},${Math.abs(shade) / 255})`; ac.fillRect(0, y, SIZE, plank);
    ac.fillStyle = 'rgba(0,0,0,.45)'; ac.fillRect(0, y, SIZE, 3); hc.fillStyle = '#303030'; hc.fillRect(0, y, SIZE, 3);
    for (let i = 0; i < 38; i++) {
      const gy = y + r() * plank; ac.strokeStyle = `rgba(30,18,8,${.05 + r() * .12})`; ac.lineWidth = .5 + r() * 1.5; ac.beginPath(); ac.moveTo(0, gy);
      for (let x = 0; x <= SIZE; x += 32) ac.lineTo(x, gy + Math.sin(x * .02 + r() * 6) * 3); ac.stroke();
    }
    if (r() > .55) { const kx = r() * SIZE, ky = y + plank * .5; for (let k = 0; k < 5; k++) { ac.strokeStyle = `rgba(25,14,6,${.25 - k * .04})`; ac.beginPath(); ac.ellipse(kx, ky, 4 + k * 3, 2 + k * 1.6, 0, 0, 7); ac.stroke(); } }
    ac.fillStyle = 'rgba(0,0,0,.5)'; ac.fillRect(12, y + 10, 3, 3); ac.fillRect(SIZE - 15, y + 10, 3, 3);
  }
  noise(ac, r, 18); return { albedo: tex(scene, 'wood', a), normal: normalFromHeight(scene, 'woodN', h) };
}
function brick(scene, seed, base, mortar) {
  const r = rng(seed), a = canvas(), h = canvas(), ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = mortar; ac.fillRect(0, 0, SIZE, SIZE); hc.fillStyle = '#404040'; hc.fillRect(0, 0, SIZE, SIZE);
  const bw = 96, bh = 42;
  for (let row = 0; row < SIZE / bh + 1; row++) for (let col = -1; col < SIZE / bw + 1; col++) {
    const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh; const v = (r() - .5) * 34;
    ac.fillStyle = base; ac.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    ac.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 220 : 0},${v > 0 ? 190 : 0},${Math.abs(v) / 200})`; ac.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    hc.fillStyle = `rgb(${150 + v},${150 + v},${150 + v})`; hc.fillRect(x + 3, y + 3, bw - 6, bh - 6);
  }
  noise(ac, r, 22); return { albedo: tex(scene, 'brick', a), normal: normalFromHeight(scene, 'brickN', h) };
}
function asphalt(scene, seed) {
  const r = rng(seed), a = canvas(), h = canvas(), ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#33373b'; ac.fillRect(0, 0, SIZE, SIZE); hc.fillStyle = '#808080'; hc.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 16000; i++) { const x = r() * SIZE, y = r() * SIZE, s = .5 + r() * 2, v = 40 + r() * 70; ac.fillStyle = `rgba(${v},${v},${v + 4},.5)`; ac.fillRect(x, y, s, s); hc.fillStyle = `rgb(${100 + r() * 80},${100 + r() * 80},${100 + r() * 80})`; hc.fillRect(x, y, s, s); }
  for (let i = 0; i < 8; i++) { ac.strokeStyle = 'rgba(10,10,12,.55)'; ac.lineWidth = 1 + r(); ac.beginPath(); let x = r() * SIZE, y = r() * SIZE; ac.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - .5) * 80; y += r() * 60; ac.lineTo(x, y); } ac.stroke(); }
  return { albedo: tex(scene, 'asphalt', a), normal: normalFromHeight(scene, 'asphaltN', h) };
}
function concrete(scene, seed, base = '#8d8d86') {
  const r = rng(seed), a = canvas(), h = canvas(), ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = base; ac.fillRect(0, 0, SIZE, SIZE); hc.fillStyle = '#808080'; hc.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 60; i++) { const x = r() * SIZE, y = r() * SIZE, rad = 20 + r() * 90; const g = ac.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(0,0,0,${.03 + r() * .07})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ac.fillStyle = g; ac.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  ac.strokeStyle = 'rgba(0,0,0,.25)'; ac.lineWidth = 2; ac.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  noise(ac, r, 16); noise(hc, r, 20); return { albedo: tex(scene, 'concrete', a), normal: normalFromHeight(scene, 'concreteN', h) };
}
function marble(scene, seed) {
  const r = rng(seed), a = canvas(), ac = a.getContext('2d'); ac.fillStyle = '#d8d5cc'; ac.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 26; i++) { ac.strokeStyle = `rgba(90,92,96,${.08 + r() * .18})`; ac.lineWidth = .5 + r() * 2; ac.beginPath(); let x = r() * SIZE, y = 0; ac.moveTo(x, y); while (y < SIZE) { x += (r() - .5) * 70; y += 20 + r() * 40; ac.lineTo(x, y); } ac.stroke(); }
  noise(ac, r, 8); const h = canvas(); h.getContext('2d').fillStyle = '#808080'; h.getContext('2d').fillRect(0, 0, SIZE, SIZE);
  return { albedo: tex(scene, 'marble', a), normal: normalFromHeight(scene, 'marbleN', h) };
}
function roof(scene, seed) {
  const r = rng(seed), a = canvas(), h = canvas(), ac = a.getContext('2d'), hc = h.getContext('2d'); ac.fillStyle = '#3d4148'; ac.fillRect(0, 0, SIZE, SIZE); hc.fillStyle = '#707070'; hc.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 48) for (let x = -64; x < SIZE; x += 64) { const ox = (y / 48) % 2 ? 32 : 0; const v = (r() - .5) * 20; ac.fillStyle = `rgb(${60 + v},${64 + v},${72 + v})`; ac.fillRect(x + ox + 2, y + 2, 60, 44); hc.fillStyle = `rgb(${140 + v},${140 + v},${140 + v})`; hc.fillRect(x + ox + 2, y + 2, 60, 44); ac.fillStyle = 'rgba(0,0,0,.4)'; ac.fillRect(x + ox + 2, y + 42, 60, 4); }
  noise(ac, r, 12); return { albedo: tex(scene, 'roof', a), normal: normalFromHeight(scene, 'roofN', h) };
}
function fabric(scene, seed, base) {
  const r = rng(seed), a = canvas(), ac = a.getContext('2d'); ac.fillStyle = base; ac.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 3) { ac.fillStyle = `rgba(255,255,255,${.02 + r() * .03})`; ac.fillRect(0, y, SIZE, 1); }
  for (let x = 0; x < SIZE; x += 3) { ac.fillStyle = `rgba(0,0,0,${.02 + r() * .03})`; ac.fillRect(x, 0, 1, SIZE); }
  noise(ac, r, 10); const h = canvas(); h.getContext('2d').fillStyle = '#808080'; h.getContext('2d').fillRect(0, 0, SIZE, SIZE);
  return { albedo: tex(scene, 'fabric', a), normal: normalFromHeight(scene, 'fabricN', h) };
}

export function createMaterials(scene) {
  const sets = {
    wood: wood(scene, 11, '#6d4f34'), woodDark: wood(scene, 12, '#4a3524', 48), floor: wood(scene, 13, '#7a5b3c', 72),
    brick: brick(scene, 21, '#7d4a3a', '#b8ada0'), brickDark: brick(scene, 22, '#4f3a35', '#8a8078'),
    asphalt: asphalt(scene, 31), concrete: concrete(scene, 41), concreteDark: concrete(scene, 42, '#5d6064'),
    marble: marble(scene, 51), roof: roof(scene, 61), fabric: fabric(scene, 71, '#5a3030'), leather: fabric(scene, 72, '#24262a'),
  };
  const cache = new Map();
  function pbr(name, set, opts = {}) {
    const key = name; if (cache.has(key)) return cache.get(key);
    const m = new PBRMaterial(name, scene);
    if (set) { m.albedoTexture = sets[set].albedo; m.bumpTexture = sets[set].normal; m.bumpTexture.level = opts.bump ?? .6; }
    m.albedoColor = opts.color ? Color3.FromHexString(opts.color) : Color3.White();
    m.metallic = opts.metallic ?? 0; m.roughness = opts.roughness ?? .82;
    if (opts.scale) { m.albedoTexture.uScale = m.albedoTexture.vScale = opts.scale; m.bumpTexture.uScale = m.bumpTexture.vScale = opts.scale; }
    if (opts.emissive) { m.emissiveColor = Color3.FromHexString(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    m.environmentIntensity = .7; cache.set(key, m); return m;
  }
  function flat(name, hex, opts = {}) {
    const key = 'flat_' + name; if (cache.has(key)) return cache.get(key);
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(hex); m.metallic = opts.metallic ?? 0; m.roughness = opts.roughness ?? .6;
    if (opts.emissive) { m.emissiveColor = Color3.FromHexString(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    if (opts.alpha !== undefined) { m.alpha = opts.alpha; m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND; }
    m.environmentIntensity = .8; cache.set(key, m); return m;
  }
  function sign(name, text, opts = {}) {
    const c = document.createElement('canvas'); c.width = opts.w || 1024; c.height = opts.h || 256; const ctx = c.getContext('2d');
    ctx.fillStyle = opts.bg || '#101418'; ctx.fillRect(0, 0, c.width, c.height);
    if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 10; ctx.strokeRect(8, 8, c.width - 16, c.height - 16); }
    ctx.fillStyle = opts.fg || '#e8d9a8'; ctx.font = `900 ${opts.size || 110}px ${opts.font || 'Arial, sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = opts.glow || 'transparent'; ctx.shadowBlur = opts.glow ? 24 : 0; ctx.fillText(text, c.width / 2, c.height / 2 + 4);
    const t = tex(scene, name, c); const m = new StandardMaterial(name, scene); m.diffuseTexture = t; m.emissiveTexture = t; m.opacityTexture = opts.transparent ? t : null; m.disableLighting = true; m.backFaceCulling = false; cache.set('sign_' + name, m); return m;
  }
  return {
    sets, pbr, flat, sign,
    wood: pbr('wood', 'wood', { scale: 2 }), woodDark: pbr('woodDark', 'woodDark', { scale: 2 }), floor: pbr('floor', 'floor', { scale: 3 }),
    brick: pbr('brick', 'brick', { scale: 2 }), brickDark: pbr('brickDark', 'brickDark', { scale: 2 }),
    asphalt: pbr('asphalt', 'asphalt', { scale: 8, roughness: .95 }), concrete: pbr('concrete', 'concrete', { scale: 3 }), concreteDark: pbr('concreteDark', 'concreteDark', { scale: 3 }),
    marble: pbr('marble', 'marble', { scale: 4, roughness: .25 }), roof: pbr('roof', 'roof', { scale: 3 }), fabric: pbr('fabric', 'fabric', { scale: 2 }), leather: pbr('leather', 'leather', { scale: 2, roughness: .5 }),
    metal: flat('metal', '#6f767e', { metallic: .9, roughness: .35 }), gunmetal: flat('gunmetal', '#23262b', { metallic: .85, roughness: .3 }), polymer: flat('polymer', '#15171a', { roughness: .7 }),
    brass: flat('brass', '#b8912f', { metallic: .95, roughness: .25 }), gold: flat('gold', '#d4af37', { metallic: .9, roughness: .25 }),
    glass: flat('glass', '#9fc4d8', { metallic: .1, roughness: .05, alpha: .28 }), rubber: flat('rubber', '#101114', { roughness: .95 }),
    grass: flat('grass', '#4d6b3a', { roughness: 1 }), white: flat('white', '#e8e6df', { roughness: .5 }), black: flat('black', '#0c0e10', { roughness: .8 }),
    red: flat('red', '#a33327', { roughness: .6 }), blue: flat('blue', '#2c4f7c', { roughness: .6 }), green: flat('green', '#3f7a4a', { roughness: .7 }),
    cash: flat('cash', '#4d8f5a', { roughness: .85 }), skin: flat('skin', '#c99b76', { roughness: .7 }),
    lamp: flat('lamp', '#fff2c4', { emissive: '#ffdf91', emissiveIntensity: 2 }), neon: flat('neon', '#ff5533', { emissive: '#ff3b1f', emissiveIntensity: 2.5 }),
    screen: flat('screen', '#7fd7ff', { emissive: '#3aa7e8', emissiveIntensity: 1.2 }),
  };
}
