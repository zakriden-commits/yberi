import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createWeapon } from './models.js';
import '@babylonjs/loaders/glTF';

const containers = new Map();
async function load(scene, url) {
  const key = scene.uid + url;
  if (!containers.has(key)) containers.set(key, await LoadAssetContainerAsync(url, scene));
  return containers.get(key);
}
const PALETTES = {
  gentleman: { Shirt: '#1d2430', Pants: '#171c26', Hair: '#171310', Belt: '#0c0d10' },
  gopnik: { Shirt: '#24466e', Pants: '#1d3557', Hair: '#2a2118', Belt: '#111' },
  normal: { Shirt: '#6b7f6e', Pants: '#3a3f4a', Hair: '#3a2b1e' },
  elderly: { Shirt: '#8b8d94', Pants: '#4a4d55', Hair: '#d8d8d8' },
  bad: { Shirt: '#1b1b1f', Pants: '#23252a', Hair: '#111' },
  guard: { Shirt: '#26344f', Pants: '#1b2233', Hair: '#222' },
  police: { Shirt: '#1d3a6e', Pants: '#14213d', Hair: '#111' },
  cashier: { Shirt: '#e8e6df', Pants: '#2b2f38', Hair: '#4a2f22' },
  foreman: { Shirt: '#d9822b', Pants: '#3c4148', Hair: '#2b2118' },
};
function findNode(root, name) { return root.getChildTransformNodes?.().find(n => n.name === name || n.name.endsWith('_' + name) || n.name.includes(name)); }
function attachBox(scene, parent, name, pos, size, mat, rot) { const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene); m.parent = parent; m.position.copyFromFloats(...pos); m.material = mat; if (rot) m.rotation.set(...rot); return m; }

export async function createActor(scene, kind, M) {
  const female = kind === 'cashier';
  const url = female ? '/assets/quaternius/v3/runner_Casual_Female.glb' : '/assets/quaternius/v3/runner_Casual_Male.glb';
  const container = await load(scene, url);
  const inst = container.instantiateModelsToScene(n => 'actor_' + n, false);
  const root = new TransformNode('actorRoot_' + kind, scene);
  for (const n of inst.rootNodes) n.parent = root;
  const palette = PALETTES[kind] || PALETTES.normal;
  const cloned = new Map();
  for (const mesh of root.getChildMeshes()) {
    mesh.receiveShadows = true;
    if (mesh.material) {
      let m = cloned.get(mesh.material.uniqueId);
      if (!m) { m = mesh.material.clone(mesh.material.name + '_' + kind); cloned.set(mesh.material.uniqueId, m); }
      const base = mesh.material.name.replace(/_.*/, '');
      const hex = palette[base] || palette[mesh.material.name];
      if (hex && m.albedoColor) m.albedoColor = Color3.FromHexString(hex);
      if (m.roughness !== undefined) m.roughness = .75;
      mesh.material = m;
    }
  }
  root.computeWorldMatrix(true);
  let min = Infinity, max = -Infinity;
  for (const m of root.getChildMeshes()) { const bi = m.getBoundingInfo(); if (bi) { m.computeWorldMatrix(true); min = Math.min(min, m.getBoundingInfo().boundingBox.minimumWorld.y); max = Math.max(max, m.getBoundingInfo().boundingBox.maximumWorld.y); } }
  const h = max - min || 1; const scale = 1.8 / h; root.scaling.setAll(scale);

  const head = findNode(root, 'Head') || root; const torso = findNode(root, 'Torso') || root; const hand = findNode(root, 'FistR') || root;
  if (kind === 'gentleman') {
    attachBox(scene, torso, 'tie', [0, .05, .19], [.09, .42, .02], M.red);
    attachBox(scene, torso, 'shirt', [0, .18, .185], [.22, .25, .02], M.white);
    attachBox(scene, head, 'glasses', [0, .05, .18], [.3, .06, .03], M.black);
  }
  if (kind === 'gopnik') {
    attachBox(scene, head, 'cap', [0, .18, 0], [.36, .1, .36], M.black);
    attachBox(scene, head, 'visor', [0, .14, .2], [.34, .03, .18], M.black);
    for (const side of [-1, 1]) { const arm = findNode(root, side < 0 ? 'UpperArmL' : 'UpperArmR'); if (arm) attachBox(scene, arm, 'stripe', [side * .1, 0, 0], [.02, .35, .12], M.white); const leg = findNode(root, side < 0 ? 'UpperLegL' : 'UpperLegR'); if (leg) attachBox(scene, leg, 'stripe', [side * .11, -.1, 0], [.02, .5, .13], M.white); }
  }
  if (kind === 'police' || kind === 'guard') {
    attachBox(scene, head, 'hat', [0, .18, 0], [.38, .12, .38], kind === 'police' ? M.blue : M.black);
    attachBox(scene, head, 'visor', [0, .13, .2], [.36, .03, .18], M.black);
    attachBox(scene, torso, 'badge', [.14, .15, .19], [.07, .07, .02], M.gold);
    if (kind === 'guard') { const bat = MeshBuilder.CreateCylinder('baton', { height: .6, diameter: .05 }, scene); bat.parent = hand; bat.position.set(0, -.25, .05); bat.material = M.black; }
  }
  if (kind === 'foreman') { attachBox(scene, head, 'helmet', [0, .2, 0], [.4, .14, .4], M.gold); attachBox(scene, torso, 'vest', [0, .05, .19], [.42, .45, .02], M.gold); }
  if (kind === 'elderly') { const cane = MeshBuilder.CreateCylinder('cane', { height: 1, diameter: .04 }, scene); cane.parent = hand; cane.position.set(0, -.45, .05); cane.material = M.woodDark; }

  const groups = inst.animationGroups; const byName = Object.fromEntries(groups.map(g => [g.name, g]));
  let current = null, weapon = null;
  function play(name, loop = true) { if (current === name) return; for (const g of groups) g.stop(); const g = byName[name] || byName.Idle; if (g) { g.play(loop); current = name; } }
  play('Idle');
  return {
    root,
    update(speed, dt, armed) {
      const target = speed > 4.5 ? 'Run' : speed > .2 ? 'Walk' : 'Idle'; play(target);
      const g = byName[target]; if (g) g.speedRatio = target === 'Run' ? 1.1 : target === 'Walk' ? Math.max(.7, speed / 2.5) : 1;
      const want = armed ? (armed === true ? 'pistol' : armed) : null;
      if (want && (!weapon || weapon.metadata?.type !== want)) { weapon?.dispose(); weapon = createWeapon(scene, want, M); weapon.metadata.type = want; weapon.parent = hand; weapon.position.set(0, -.05, .08); weapon.rotation.set(Math.PI / 2, 0, 0); weapon.scaling.setAll(.9); }
      if (!want && weapon) { weapon.dispose(); weapon = null; }
      void dt;
    },
    punch() { const g = byName.Punch; if (g) { g.play(false); setTimeout(() => play('Idle'), 600); } },
    dispose() { root.dispose(); weapon?.dispose(); },
  };
}
