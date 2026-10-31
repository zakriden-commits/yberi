import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

function box(scene, parent, name, x, y, z, w, h, d, mat, rot) { const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); m.parent = parent; m.material = mat; if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return m; }
function cyl(scene, parent, name, x, y, z, h, d, mat, rot, tess = 16) { const m = MeshBuilder.CreateCylinder(name, { height: h, diameter: d, tessellation: tess }, scene); m.position.set(x, y, z); m.parent = parent; m.material = mat; if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return m; }
function torus(scene, parent, name, x, y, z, d, t, mat, rot) { const m = MeshBuilder.CreateTorus(name, { diameter: d, thickness: t, tessellation: 20 }, scene); m.position.set(x, y, z); m.parent = parent; m.material = mat; if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return m; }

export function createWeapon(scene, type, M) {
  const root = new TransformNode('weapon_' + type, scene);
  if (type === 'pistol') {
    box(scene, root, 'slide', 0, .09, .12, .07, .09, .34, M.gunmetal);
    box(scene, root, 'frame', 0, .02, .08, .065, .06, .26, M.polymer);
    box(scene, root, 'grip', 0, -.09, -.02, .06, .18, .09, M.polymer, [-.22, 0, 0]);
    cyl(scene, root, 'barrel', 0, .085, .31, .06, .035, M.gunmetal, [Math.PI / 2, 0, 0]);
    box(scene, root, 'frontsight', 0, .145, .27, .015, .025, .02, M.metal);
    box(scene, root, 'rearsight', 0, .145, -.02, .05, .022, .02, M.metal);
    torus(scene, root, 'triggerguard', 0, -.03, .08, .09, .012, M.polymer, [Math.PI / 2, 0, 0]);
    box(scene, root, 'trigger', 0, -.02, .08, .012, .05, .015, M.metal);
    box(scene, root, 'mag', 0, -.17, -.02, .045, .05, .07, M.gunmetal);
  } else if (type === 'smg') {
    box(scene, root, 'receiver', 0, .08, .1, .08, .12, .42, M.gunmetal);
    box(scene, root, 'handguard', 0, .06, .36, .07, .09, .22, M.polymer);
    cyl(scene, root, 'barrel', 0, .08, .55, .22, .035, M.gunmetal, [Math.PI / 2, 0, 0]);
    cyl(scene, root, 'muzzle', 0, .08, .67, .06, .05, M.metal, [Math.PI / 2, 0, 0]);
    box(scene, root, 'grip', 0, -.08, -.02, .06, .18, .09, M.polymer, [-.2, 0, 0]);
    box(scene, root, 'mag', 0, -.14, .14, .05, .24, .08, M.gunmetal, [.08, 0, 0]);
    box(scene, root, 'stock', 0, .07, -.24, .05, .08, .26, M.polymer);
    box(scene, root, 'buttpad', 0, .06, -.38, .07, .14, .04, M.rubber);
    box(scene, root, 'rail', 0, .155, .08, .05, .02, .34, M.metal);
    box(scene, root, 'sight', 0, .19, .02, .05, .05, .08, M.gunmetal);
    torus(scene, root, 'triggerguard', 0, -.03, .06, .1, .012, M.polymer, [Math.PI / 2, 0, 0]);
  } else if (type === 'rifle') {
    box(scene, root, 'receiver', 0, .08, .05, .08, .12, .46, M.gunmetal);
    box(scene, root, 'handguard', 0, .07, .42, .075, .09, .36, M.woodDark);
    cyl(scene, root, 'barrel', 0, .08, .78, .42, .032, M.gunmetal, [Math.PI / 2, 0, 0]);
    cyl(scene, root, 'muzzle', 0, .08, 1.0, .07, .045, M.metal, [Math.PI / 2, 0, 0]);
    box(scene, root, 'stock', 0, .04, -.34, .07, .13, .36, M.woodDark, [-.06, 0, 0]);
    box(scene, root, 'buttpad', 0, .02, -.53, .08, .17, .04, M.rubber);
    box(scene, root, 'grip', 0, -.08, -.06, .06, .17, .09, M.woodDark, [-.25, 0, 0]);
    box(scene, root, 'mag', 0, -.13, .14, .05, .2, .1, M.gunmetal, [.18, 0, 0]);
    cyl(scene, root, 'scope', 0, .2, .05, .3, .06, M.gunmetal, [Math.PI / 2, 0, 0]);
    box(scene, root, 'scopemount', 0, .15, .05, .04, .06, .2, M.metal);
    box(scene, root, 'frontsight', 0, .15, .72, .02, .08, .02, M.metal);
    torus(scene, root, 'triggerguard', 0, -.03, .02, .1, .012, M.gunmetal, [Math.PI / 2, 0, 0]);
  }
  root.metadata = { muzzle: type === 'pistol' ? new Vector3(0, .085, .34) : type === 'smg' ? new Vector3(0, .08, .7) : new Vector3(0, .08, 1.04) };
  return root;
}
export function createBag(scene, M) {
  const root = new TransformNode('bag', scene);
  const body = cyl(scene, root, 'body', 0, 0, 0, .62, .32, M.leather, [0, 0, Math.PI / 2], 20); body.scaling.z = .75;
  box(scene, root, 'base', 0, -.12, 0, .6, .08, .24, M.leather);
  torus(scene, root, 'handle1', -.14, .18, 0, .22, .025, M.leather, [0, 0, 0]);
  torus(scene, root, 'handle2', .14, .18, 0, .22, .025, M.leather, [0, 0, 0]);
  box(scene, root, 'zip', 0, .16, 0, .56, .015, .02, M.brass);
  box(scene, root, 'tag', .22, .02, .13, .1, .07, .01, M.gold);
  return root;
}
export function createCash(scene, M, stacks = 3) {
  const root = new TransformNode('cash', scene);
  for (let i = 0; i < stacks; i++) { box(scene, root, 'stack', (i - (stacks - 1) / 2) * .16, .03, 0, .15, .06, .09, M.cash); box(scene, root, 'band', (i - (stacks - 1) / 2) * .16, .032, 0, .05, .065, .092, M.white); }
  return root;
}
export function createCrate(scene, M) {
  const root = new TransformNode('crate', scene);
  box(scene, root, 'body', 0, .25, 0, .7, .5, .7, M.wood);
  for (const x of [-.32, .32]) box(scene, root, 'slat', x, .25, .36, .08, .5, .03, M.woodDark);
  for (const y of [.06, .44]) box(scene, root, 'rail', 0, y, .36, .7, .07, .03, M.woodDark);
  box(scene, root, 'label', 0, .28, .365, .22, .14, .01, M.white);
  return root;
}
export function createAmmoBox(scene, M) {
  const root = new TransformNode('ammo', scene);
  box(scene, root, 'box', 0, .09, 0, .3, .18, .2, M.green);
  box(scene, root, 'lid', 0, .19, 0, .32, .03, .22, M.metal);
  box(scene, root, 'label', 0, .1, .105, .2, .08, .01, M.white);
  return root;
}
export function createTruck(scene, M) {
  const root = new TransformNode('truck', scene);
  box(scene, root, 'cargo', -1, 1.55, 0, 4.4, 2.6, 2.4, M.white);
  box(scene, root, 'cab', 2.1, 1.15, 0, 1.8, 1.9, 2.3, M.blue);
  box(scene, root, 'windshield', 2.75, 1.5, 0, .5, .7, 2.0, M.glass);
  box(scene, root, 'bumper', 3.05, .5, 0, .2, .3, 2.4, M.metal);
  box(scene, root, 'cargoDoor', -3.21, 1.5, 0, .05, 2.3, 2.2, M.concreteDark);
  for (const x of [-2.2, -.2, 2.1]) for (const z of [-1.15, 1.15]) { cyl(scene, root, 'wheel', x, .45, z, .3, .9, M.rubber, [Math.PI / 2, 0, 0], 20); cyl(scene, root, 'hub', x, .45, z + (z > 0 ? .16 : -.16), .05, .4, M.metal, [Math.PI / 2, 0, 0], 12); }
  box(scene, root, 'headlight', 3.06, .9, .8, .05, .18, .3, M.lamp); box(scene, root, 'headlight', 3.06, .9, -.8, .05, .18, .3, M.lamp);
  return root;
}
export function createCar(scene, M, color) {
  const root = new TransformNode('car', scene); const paint = color || M.blue;
  box(scene, root, 'body', 0, .55, 0, 4.2, .7, 1.9, paint);
  box(scene, root, 'cabin', -.2, 1.1, 0, 2.2, .65, 1.7, paint);
  box(scene, root, 'windows', -.2, 1.12, 0, 2.0, .45, 1.72, M.glass);
  box(scene, root, 'roof', -.2, 1.45, 0, 2.1, .08, 1.7, paint);
  for (const x of [-1.35, 1.35]) for (const z of [-.95, .95]) { cyl(scene, root, 'wheel', x, .35, z, .25, .7, M.rubber, [Math.PI / 2, 0, 0], 18); cyl(scene, root, 'hub', x, .35, z + (z > 0 ? .13 : -.13), .04, .32, M.metal, [Math.PI / 2, 0, 0], 12); }
  box(scene, root, 'headlight', 2.11, .6, .6, .04, .16, .3, M.lamp); box(scene, root, 'headlight', 2.11, .6, -.6, .04, .16, .3, M.lamp);
  box(scene, root, 'taillight', -2.11, .6, .6, .04, .16, .3, M.red); box(scene, root, 'taillight', -2.11, .6, -.6, .04, .16, .3, M.red);
  return root;
}
export function createBed(scene, M, color) {
  const root = new TransformNode('bed', scene);
  box(scene, root, 'frame', 0, .25, 0, 1.5, .3, 2.4, M.woodDark);
  box(scene, root, 'mattress', 0, .48, 0, 1.4, .22, 2.3, M.white);
  box(scene, root, 'blanket', 0, .6, .35, 1.42, .1, 1.5, color || M.fabric);
  box(scene, root, 'pillow', 0, .64, -.85, 1.0, .16, .45, M.white);
  box(scene, root, 'headboard', 0, .8, -1.2, 1.5, 1.0, .1, M.woodDark);
  for (const x of [-.7, .7]) for (const z of [-1.1, 1.1]) box(scene, root, 'leg', x, .1, z, .1, .2, .1, M.woodDark);
  return root;
}
export function createWardrobe(scene, M) {
  const root = new TransformNode('wardrobe', scene);
  box(scene, root, 'body', 0, 1.1, 0, 1.7, 2.2, .7, M.woodDark);
  for (const x of [-.42, .42]) { box(scene, root, 'door', x, 1.1, .36, .8, 2.05, .05, M.wood); box(scene, root, 'panel', x, 1.2, .39, .6, 1.5, .02, M.woodDark); cyl(scene, root, 'handle', x + (x < 0 ? .3 : -.3), 1.1, .42, .18, .03, M.brass, [0, 0, 0], 10); }
  box(scene, root, 'top', 0, 2.25, 0, 1.8, .1, .8, M.woodDark);
  return root;
}
export function createStreetLight(scene, M) {
  const root = new TransformNode('streetlight', scene);
  cyl(scene, root, 'pole', 0, 2.6, 0, 5.2, .14, M.metal, null, 10);
  cyl(scene, root, 'base', 0, .15, 0, .3, .3, M.concreteDark, null, 12);
  box(scene, root, 'arm', .55, 5.1, 0, 1.2, .1, .1, M.metal);
  box(scene, root, 'head', 1.1, 5.0, 0, .6, .15, .3, M.metal);
  box(scene, root, 'bulb', 1.1, 4.91, 0, .5, .04, .24, M.lamp);
  return root;
}
export function createBench(scene, M) {
  const root = new TransformNode('bench', scene);
  for (const x of [-.7, .7]) box(scene, root, 'leg', x, .25, 0, .08, .5, .5, M.metal);
  for (let i = 0; i < 4; i++) box(scene, root, 'slat', 0, .5, -.18 + i * .12, 1.8, .05, .1, M.wood);
  for (let i = 0; i < 3; i++) box(scene, root, 'back', 0, .75 + i * .14, -.24, 1.8, .1, .05, M.wood);
  return root;
}
export function createATM(scene, M) {
  const root = new TransformNode('atm', scene);
  box(scene, root, 'body', 0, .8, 0, .8, 1.6, .5, M.concreteDark);
  box(scene, root, 'screen', 0, 1.15, .26, .5, .35, .02, M.screen);
  box(scene, root, 'keypad', 0, .85, .27, .35, .2, .03, M.metal);
  box(scene, root, 'slot', 0, .65, .27, .4, .04, .03, M.black);
  box(scene, root, 'sign', 0, 1.7, .1, .8, .2, .3, M.blue);
  return root;
}
export function createVaultDoor(scene, M) {
  const root = new TransformNode('vault', scene);
  cyl(scene, root, 'frame', 0, 1.5, 0, .3, 3.2, M.metal, [Math.PI / 2, 0, 0], 32);
  cyl(scene, root, 'door', 0, 1.5, .16, .2, 2.8, M.gunmetal, [Math.PI / 2, 0, 0], 32);
  torus(scene, root, 'ring', 0, 1.5, .3, 1.6, .08, M.brass, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(scene, root, 'spoke', Math.cos(a) * .5, 1.5 + Math.sin(a) * .5, .32, .9, .08, .06, M.brass, [0, 0, a]); }
  cyl(scene, root, 'hub', 0, 1.5, .36, .15, .4, M.brass, [Math.PI / 2, 0, 0], 20);
  return root;
}
export function createCounter(scene, M, width = 3) {
  const root = new TransformNode('counter', scene);
  box(scene, root, 'base', 0, .5, 0, width, 1, .8, M.woodDark);
  box(scene, root, 'top', 0, 1.02, 0, width + .1, .08, .9, M.marble);
  box(scene, root, 'glass', 0, 1.45, -.1, width - .2, .8, .03, M.glass);
  for (const x of [-width / 2 + .1, width / 2 - .1]) box(scene, root, 'post', x, 1.45, -.1, .05, .8, .05, M.brass);
  return root;
}
export function createDisplayRack(scene, M) {
  const root = new TransformNode('rack', scene);
  box(scene, root, 'board', 0, 1.5, 0, 2.6, 2.2, .08, M.woodDark);
  for (let i = 0; i < 3; i++) { const w = createWeapon(scene, ['pistol', 'smg', 'rifle'][i], M); w.parent = root; w.position.set(-.8 + i * .8, 1.5, .12); w.rotation.set(0, Math.PI / 2, Math.PI / 2); w.scaling.setAll(.9); }
  box(scene, root, 'shelf', 0, .5, .2, 2.6, .06, .4, M.wood);
  return root;
}
export function createPoliceLights(scene, M) {
  const root = new TransformNode('policeLights', scene);
  box(scene, root, 'bar', 0, 0, 0, 1.2, .12, .35, M.black);
  const r = box(scene, root, 'red', -.35, .1, 0, .45, .14, .3, M.red); const b = box(scene, root, 'blue', .35, .1, 0, .45, .14, .3, M.blue);
  root.metadata = { red: r, blue: b }; return root;
}
