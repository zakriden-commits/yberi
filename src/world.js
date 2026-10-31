import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { HOUSE, BANK, SHOP, TRUCK, CASH_POINTS, WARDROBES, BEDS } from './shared/constants.js';
import { createBed, createWardrobe, createTruck, createCar, createStreetLight, createBench, createATM, createVaultDoor, createCounter, createDisplayRack, createCash, createCrate, createAmmoBox, createBag } from './gfx/models.js';
import '@babylonjs/loaders/glTF';

export async function buildWorld(scene, M, quality = 'high') {
  const colliders = []; const dynamic = []; const alarmLights = [];
  const root = new TransformNode('world', scene);
  function box(name, x, y, z, w, h, d, mat, solid = false, rot) {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); m.material = mat; m.parent = root; m.receiveShadows = true;
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }
  function cyl(name, x, y, z, h, d, mat, tess = 16, rot) { const m = MeshBuilder.CreateCylinder(name, { height: h, diameter: d, tessellation: tess }, scene); m.position.set(x, y, z); m.material = mat; m.parent = root; m.receiveShadows = true; if (rot) m.rotation.set(...rot); return m; }
  function place(node, x, y, z, ry = 0, s = 1) { node.parent = root; node.position.set(x, y, z); node.rotation.y = ry; node.scaling.setAll(s); return node; }
  function sign(name, text, x, y, z, w, h, opts = {}) { const m = box(name, x, y, z, w, h, .08, M.sign(name + 'Mat', text, opts)); return m; }
  function light(name, x, y, z, color, intensity, range) { const l = new PointLight(name, new Vector3(x, y, z), scene); l.diffuse = Color3.FromHexString(color); l.intensity = intensity; l.range = range; return l; }

  // Ground & street
  box('ground', 0, -.15, 10, 180, .3, 160, M.grass);
  box('road', 0, .02, 14, 160, .06, 8, M.asphalt);
  box('sidewalkNear', 0, .09, 9, 160, .18, 2.2, M.concrete);
  box('sidewalkFar', 0, .09, 19, 160, .18, 2.2, M.concrete);
  box('curbNear', 0, .12, 10.1, 160, .24, .2, M.concreteDark);
  box('curbFar', 0, .12, 17.9, 160, .24, .2, M.concreteDark);
  for (let x = -76; x < 80; x += 6) box('dash', x, .06, 14, 2.6, .015, .14, M.white);
  for (let i = 0; i < 8; i++) box('crosswalk', -2.4 + i * .7, .065, 14, .45, .015, 7.6, M.white);
  for (let x = -60; x <= 60; x += 15) { place(createStreetLight(scene, M), x, .18, 19.2, Math.PI); place(createStreetLight(scene, M), x + 7, .18, 8.8, 0); }
  for (const x of [-22, -6, 12, 34]) { place(createBench(scene, M), x, .18, 19.4, Math.PI); box('bin', x + 1.6, .55, 19.4, .5, .9, .5, M.concreteDark, true); }
  // Bus stop
  box('busRoof', -10, 2.6, 20.2, 4, .12, 1.6, M.metal); box('busBack', -10, 1.5, 20.9, 4, 2.2, .06, M.glass);
  for (const x of [-11.8, -8.2]) cyl('busPost', x, 1.3, 20.2, 2.6, .1, M.metal);
  sign('busSign', 'ОСТАНОВКА', -10, 2.9, 20.2, 2.4, .4, { bg: '#1d3a6e', fg: '#fff', size: 90 });
  place(createCar(scene, M, M.red), -14, .05, 11.2, 0); place(createCar(scene, M, M.white), 18, .05, 16.8, Math.PI); place(createCar(scene, M, M.blue), 40, .05, 11.2, 0);
  place(createTruck(scene, M), TRUCK.x, .05, TRUCK.z, 0);
  colliders.push({ minX: TRUCK.x - 3.4, maxX: TRUCK.x + 3.2, minZ: TRUCK.z - 1.4, maxZ: TRUCK.z + 1.4 });

  // Safehouse
  box('houseFoundation', 0, .1, 0, 12.6, .3, 10.6, M.concreteDark);
  box('houseFloor', 0, .26, 0, 12, .12, 10, M.floor);
  const wh = 3.1;
  box('hBack', 0, wh / 2 + .3, -5, 12, wh, .3, M.wood, true);
  box('hLeft', -6, wh / 2 + .3, 0, .3, wh, 10, M.wood, true);
  box('hRight', 6, wh / 2 + .3, 0, .3, wh, 10, M.wood, true);
  box('hFrontL', -3.5, wh / 2 + .3, 5, 5, wh, .3, M.wood, true);
  box('hFrontR', 3.5, wh / 2 + .3, 5, 5, wh, .3, M.wood, true);
  box('hFrontTop', 0, 2.95, 5, 2, .7, .3, M.woodDark);
  for (const x of [-3.2, 3.2]) { box('hWindowFrame', x, 1.8, 5.02, 1.6, 1.3, .1, M.wood); box('hWindowGlass', x, 1.8, 5.08, 1.4, 1.1, .03, M.glass); }
  box('roofL', -3.1, 4.2, 0, 6.8, .18, 11, M.roof, false, [0, 0, .5]);
  box('roofR', 3.1, 4.2, 0, 6.8, .18, 11, M.roof, false, [0, 0, -.5]);
  box('chimney', 3.8, 4.8, -2, .8, 1.8, .8, M.brick);
  box('porch', 0, .2, 6.2, 5, .2, 2, M.wood);
  for (const x of [-2.3, 2.3]) cyl('porchPost', x, 1.6, 6.9, 2.8, .16, M.woodDark);
  box('porchRoof', 0, 3.05, 6.4, 5.2, .15, 2.4, M.roof, false, [.12, 0, 0]);
  sign('houseSign', 'УБЕЖИЩЕ', 0, 2.65, 5.2, 2.2, .4, { bg: '#2b2118', fg: '#e8d9a8', size: 90 });
  const doorHinge = new TransformNode('doorHinge', scene); doorHinge.parent = root; doorHinge.position.set(-.9, .3, 5);
  const door = box('houseDoor', .9, 1.2, 0, 1.8, 2.4, .12, M.wood); door.parent = doorHinge;
  cyl('doorHandle', 1.55, 1.2, .1, .18, .04, M.brass, 10, [Math.PI / 2, 0, 0]).parent = doorHinge;
  BEDS.forEach((b, i) => place(createBed(scene, M, i ? M.blue : M.fabric), b.x, .32, b.z, 0));
  WARDROBES.forEach(w => { place(createWardrobe(scene, M), w.x, .32, w.z, 0); colliders.push({ minX: w.x - .9, maxX: w.x + .9, minZ: w.z - .45, maxZ: w.z + .45 }); });
  box('tableTop', 0, 1.05, -2.2, 2.2, .1, 1.1, M.wood, true); for (const x of [-.95, .95]) for (const z of [-2.65, -1.75]) box('tableLeg', x, .65, z, .1, .8, .1, M.woodDark);
  box('rug', 0, .335, 1.2, 3.4, .02, 2.4, M.fabric);
  cyl('lampPole', 0, 2.4, 0, .5, .03, M.metal); const lampShade = cyl('lampShade', 0, 2.15, 0, .25, .5, M.lamp, 20); lampShade.scaling.y = .6;
  light('houseLight', 0, 2.3, 0, '#ffd9a0', 2.6, 12); light('houseLight2', 0, 2.3, 3.5, '#ffd9a0', 1.6, 8);
  box('shelf', -5.6, 1.6, -2, .4, 2.4, 2, M.woodDark, true); place(createCrate(scene, M), -4.8, .32, 3.6, .4); place(createCrate(scene, M), 4.9, .32, -3.8, -.3);

  // Bank
  const bx = 24, bz = 28;
  box('bankBase', bx, .15, bz, 21, .3, 17, M.concreteDark);
  box('bankFloor', bx, .32, bz, 20, .12, 16, M.marble);
  box('bankBack', bx, 2.5, 36, 20, 4.6, .5, M.concrete, true);
  box('bankLeft', 14, 2.5, bz, .5, 4.6, 16, M.concrete, true);
  box('bankRight', 34, 2.5, bz, .5, 4.6, 16, M.concrete, true);
  box('bankFrontL', 17.5, 2.5, 20, 7, 4.6, .5, M.concrete, true);
  box('bankFrontR', 30.5, 2.5, 20, 7, 4.6, .5, M.concrete, true);
  box('bankFrontTop', bx, 4.2, 20, 6, 1.2, .5, M.concrete);
  box('bankRoof', bx, 4.95, bz, 21, .35, 17, M.concreteDark);
  box('bankEntablature', bx, 5.3, 20, 21.5, .6, 1.2, M.marble);
  sign('bankSign', 'СЕВЕР БАНК', bx, 5.35, 19.35, 10, .9, { bg: '#101418', fg: '#d4af37', border: '#d4af37', size: 120, glow: '#d4af37' });
  for (const x of [15.5, 19, 29, 32.5]) { cyl('bankColumn', x, 2.4, 19.6, 4.4, .7, M.marble, 20); box('columnCap', x, 4.65, 19.6, 1, .25, 1, M.marble); box('columnBase', x, .45, 19.6, 1, .3, 1, M.marble); }
  box('bankGlassL', 22.2, 1.7, 20, 1.5, 2.8, .06, M.glass); box('bankGlassR', 25.8, 1.7, 20, 1.5, 2.8, .06, M.glass);
  box('bankDoorFrame', bx, 3.15, 20, 6.2, .15, .3, M.brass);
  place(createATM(scene, M), 15.2, .3, 18.6, 0);
  CASH_POINTS.forEach(c => { place(createCounter(scene, M, 3.4), c.x, .32, c.z, 0); place(createCash(scene, M, 5), c.x, 1.42, c.z, 0); colliders.push({ minX: c.x - 1.8, maxX: c.x + 1.8, minZ: c.z - .5, maxZ: c.z + .5 }); });
  place(createCounter(scene, M, 6), 24, .32, 33, 0); colliders.push({ minX: 21, maxX: 27, minZ: 32.5, maxZ: 33.5 });
  place(createVaultDoor(scene, M), 24, .32, 35.6, 0);
  for (const x of [18, 24, 30]) { box('queuePost', x, .8, 26, .08, 1.2, .08, M.brass); cyl('queueBase', x, .35, 26, .06, .4, M.brass); }
  for (const x of [18, 30]) { const beacon = cyl('alarmBeacon', x, 4.4, 21, .25, .3, M.red, 12); alarmLights.push(beacon); }
  light('bankLight1', 20, 4.2, 28, '#fff3d6', 1.6, 12); light('bankLight2', 28, 4.2, 28, '#fff3d6', 1.6, 12);
  sign('bankHours', 'ПН–ПТ 09:00–18:00', 24, 2.2, 19.7, 2.4, .35, { bg: '#1a1d22', fg: '#cfd6dd', size: 70 });

  // Weapon shop
  const sx = -19, sz = 26;
  box('shopBase', sx, .15, sz, 14.6, .3, 12.6, M.concreteDark);
  box('shopFloor', sx, .32, sz, 14, .12, 12, M.concrete);
  box('shopBack', sx, 2, 32, 14, 3.6, .4, M.brick, true);
  box('shopLeft', -26, 2, sz, .4, 3.6, 12, M.brick, true);
  box('shopRight', -12, 2, sz, .4, 3.6, 12, M.brick, true);
  box('shopFrontL', -23.5, 2, 20, 5, 3.6, .4, M.brick, true);
  box('shopFrontR', -14.5, 2, 20, 5, 3.6, .4, M.brick, true);
  box('shopFrontTop', sx, 3.4, 20, 4, .8, .4, M.brick);
  box('shopRoof', sx, 3.95, sz, 14.8, .3, 12.8, M.concreteDark);
  sign('shopSign', 'АРСЕНАЛ', sx, 4.35, 19.7, 8, 1, { bg: '#0c0e10', fg: '#ff5533', border: '#ff5533', size: 130, glow: '#ff3b1f' });
  sign('shopSub', 'ОРУЖИЕ • ПАТРОНЫ • СНАРЯЖЕНИЕ', sx, 3.55, 19.75, 7.5, .35, { bg: '#0c0e10', fg: '#e8d9a8', size: 60 });
  box('shopWindowL', -23.5, 1.7, 19.95, 4.4, 2.2, .05, M.glass); box('shopWindowR', -14.5, 1.7, 19.95, 4.4, 2.2, .05, M.glass);
  place(createDisplayRack(scene, M), -23.5, .32, 21.2, 0, .8); place(createDisplayRack(scene, M), -14.5, .32, 21.2, 0, .8);
  place(createCounter(scene, M, 5), -19, .32, 29, 0); colliders.push({ minX: -21.6, maxX: -16.4, minZ: 28.5, maxZ: 29.5 });
  for (let i = 0; i < 3; i++) { box('shopShelf', -24 + i * 5, 1.5, 31.5, 3.4, 2.6, .5, M.woodDark, true); for (let k = 0; k < 3; k++) place(createAmmoBox(scene, M), -25 + i * 5 + k * .8, 1.3, 31.2, 0); }
  box('bagPedestal', -16, .7, 27, .8, 1.1, .8, M.concreteDark, true); place(createBag(scene, M), -16, 1.45, 27, .4, 1.2);
  light('shopLight', -19, 3.4, 26, '#ffe2b8', 1.5, 11); light('shopNeon', -19, 3.8, 19.5, '#ff5533', 1.2, 7);

  // Background neighborhood (Kenney CC0/MIT kit)
  try {
    const models = ['building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'building-garage'];
    const containers = await Promise.all(models.map(m => LoadAssetContainerAsync(`/assets/kenney/models/${m}.glb`, scene)));
    const spots = [[-44, 30, 0], [-34, 34, .3], [42, 30, -.2], [52, 34, .2], [-48, -2, Math.PI], [46, -2, Math.PI], [-30, -8, Math.PI], [32, -8, Math.PI]];
    spots.forEach((s, i) => { const inst = containers[i % containers.length].instantiateModelsToScene(n => 'bg_' + n, false); for (const n of inst.rootNodes) { n.parent = root; n.position.set(s[0], .1, s[1]); n.rotation.y = s[2]; n.scaling.setAll(2.4); } });
    const trees = await LoadAssetContainerAsync('/assets/kenney/models/grass-trees.glb', scene);
    for (const [x, z] of [[-12, 4], [12, 4], [-30, 22], [38, 22], [-8, 34], [10, 36], [-40, 12], [44, 12]]) { const inst = trees.instantiateModelsToScene(n => 'tree_' + n, false); for (const n of inst.rootNodes) { n.parent = root; n.position.set(x, .1, z); n.scaling.setAll(2); } }
  } catch (e) { console.warn('Background assets failed', e); }

  // Fences & props
  for (let x = -60; x <= 60; x += 4) { if (Math.abs(x) < 8) continue; box('fencePost', x, .7, 7.6, .12, 1.2, .12, M.woodDark); box('fenceRail', x + 2, .9, 7.6, 4, .08, .08, M.wood); box('fenceRail', x + 2, .5, 7.6, 4, .08, .08, M.wood); }
  place(createCrate(scene, M), 5.5, .1, 21.5, .2); place(createCrate(scene, M), 6.3, .1, 21.8, -.3); place(createCrate(scene, M), 5.9, .62, 21.6, .5);

  let alarm = false;
  function setHouseDoor(open) { doorHinge.rotation.y = open ? -Math.PI / 2 : 0; }
  function setAlarm(on) { alarm = on; }
  function update(t) { for (let i = 0; i < alarmLights.length; i++) { const m = alarmLights[i]; m.material = alarm && Math.sin(t * 8 + i) > 0 ? M.neon : M.red; } }
  setHouseDoor(true);
  return { colliders, setHouseDoor, setAlarm, update, root, quality };
}
