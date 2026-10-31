import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

const cache = new WeakMap();
function mats(scene) {
  if (cache.has(scene)) return cache.get(scene);
  const m = (n, r, g, b) => { const x = new StandardMaterial(n, scene); x.diffuseColor = new Color3(r, g, b); x.specularColor = new Color3(.05, .05, .05); return x; };
  const o = { skin: m('skin', .8, .65, .5), suit: m('suit', .12, .14, .18), shirt: m('shirt', .9, .9, .9), tie: m('tie', .6, .1, .1), track: m('track', .15, .3, .5), stripe: m('stripe', .9, .9, .9), cap: m('cap', .1, .1, .1), normal: m('normal', .4, .5, .4), elderly: m('elderly', .5, .5, .55), bad: m('bad', .2, .2, .2), guard: m('guard', .2, .25, .4), police: m('police', .1, .2, .5), gold: m('gold', .8, .7, .2), black: m('black', .05, .05, .05), gun: m('gun', .15, .16, .18), wood: m('wood', .4, .3, .2), green: m('green', .2, .6, .3), white: m('white', .9, .9, .9) };
  cache.set(scene, o); return o;
}
function part(scene, parent, name, x, y, z, w, h, d, material) { const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); b.position.set(x, y, z); b.parent = parent; b.material = material; return b; }
export function createHumanoid(scene, kind) {
  const M = mats(scene); const root = new TransformNode('h_' + kind, scene);
  let body = M.normal, head = M.skin, legs = M.black;
  if (kind === 'gentleman') { body = M.suit; legs = M.suit; }
  if (kind === 'gopnik') { body = M.track; legs = M.track; }
  if (kind === 'elderly') body = M.elderly;
  if (kind === 'bad') body = M.bad;
  if (kind === 'guard') body = M.guard;
  if (kind === 'police') body = M.police;
  if (kind === 'cashier') body = M.white;
  if (kind === 'foreman') body = M.gold;
  const torso = part(scene, root, 'torso', 0, 1.1, 0, .6, .8, .35, body);
  const headM = part(scene, root, 'head', 0, 1.75, 0, .35, .35, .35, head);
  const armL = part(scene, root, 'armL', -.42, 1.1, 0, .18, .7, .18, body);
  const armR = part(scene, root, 'armR', .42, 1.1, 0, .18, .7, .18, body);
  const legL = part(scene, root, 'legL', -.18, .4, 0, .2, .8, .2, legs);
  const legR = part(scene, root, 'legR', .18, .4, 0, .2, .8, .2, legs);
  if (kind === 'gentleman') { part(scene, root, 'tie', 0, 1.2, .19, .1, .4, .02, M.tie); part(scene, root, 'shirt', 0, 1.3, .18, .25, .3, .02, M.shirt); torso.scaling.x = 1.25; }
  if (kind === 'gopnik') { part(scene, root, 'cap', 0, 1.95, 0, .4, .12, .4, M.cap); part(scene, root, 'stripe', 0, 1.1, .19, .08, .7, .02, M.stripe); }
  if (kind === 'elderly') part(scene, root, 'cane', .55, .6, .1, .05, 1.2, .05, M.wood);
  if (kind === 'police' || kind === 'guard') part(scene, root, 'hat', 0, 1.95, 0, .42, .12, .42, M.black);
  if (kind === 'guard') part(scene, root, 'baton', .55, 1, .1, .06, .7, .06, M.black);
  root.metadata = { armL, armR, legL, legR, head: headM };
  return root;
}
export function animateHumanoid(root, speed, time) {
  const m = root.metadata; if (!m) return;
  const s = Math.min(1, speed / 3); const swing = Math.sin(time * 8) * .6 * s;
  m.armL.rotation.x = swing; m.armR.rotation.x = -swing; m.legL.rotation.x = -swing; m.legR.rotation.x = swing;
}
export function createViewmodel(scene, camera, type) {
  const M = mats(scene); const root = new TransformNode('view_' + type, scene); root.parent = camera;
  if (type === 'fists') { part(scene, root, 'fistL', -.25, -.25, .5, .15, .15, .2, M.skin); part(scene, root, 'fistR', .25, -.25, .5, .15, .15, .2, M.skin); }
  else if (type === 'bag') { part(scene, root, 'bag', .25, -.35, .5, .35, .3, .2, M.black); }
  else if (type === 'cash') { part(scene, root, 'cash', .25, -.3, .5, .25, .12, .15, M.green); }
  else if (type === 'crate') { part(scene, root, 'crate', 0, -.4, .6, .6, .5, .5, M.wood); }
  else { part(scene, root, 'grip', .2, -.3, .5, .08, .2, .12, M.gun); part(scene, root, 'body', .2, -.22, .6, .08, .12, .4, M.gun); if (type === 'rifle') part(scene, root, 'barrel', .2, -.22, .9, .05, .05, .5, M.gun); if (type === 'smg') part(scene, root, 'mag', .2, -.35, .6, .06, .2, .08, M.gun); part(scene, root, 'hand', .2, -.32, .5, .12, .12, .12, M.skin); }
  return root;
}
