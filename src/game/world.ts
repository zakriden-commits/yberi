import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import { Scene as SceneConstants } from '@babylonjs/core/scene';
import { boxCollider, Random } from './physics';
import type { Bounds, Collider } from './physics';
import { createMaterials } from './materials';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Particles/particleSystemComponent';

export interface World {
  colliders: Collider[];
  bounds: Bounds;
  spawn: Vector3;
  update: (time: number) => void;
  landingDust: (x: number, z: number) => void;
}
interface Hole { a: number; b: number; bottom: number; top: number }
interface BoxOptions { rotation?: Vector3; solid?: boolean; shadow?: boolean; parent?: TransformNode; dynamic?: boolean }

export function createWorld(scene: Scene, touch: boolean): World {
  const random = new Random(48151);
  const materials = createMaterials(scene);
  const colliders: Collider[] = [];
  const groups = new Map<StandardMaterial, Mesh[]>();
  const shadowGroups = new Set<StandardMaterial>();
  scene.clearColor = new Color4(.43, .48, .44, 1);
  scene.fogMode = SceneConstants.FOGMODE_EXP2;
  scene.fogDensity = .024;
  scene.fogColor = new Color3(.43, .48, .44);
  scene.ambientColor = new Color3(.12, .14, .11);
  scene.imageProcessingConfiguration.contrast = 1.13;
  scene.imageProcessingConfiguration.exposure = 1.05;

  function register(mesh: Mesh, material: StandardMaterial, options: BoxOptions = {}): Mesh {
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (options.parent) mesh.parent = options.parent;
    if (options.dynamic) {
      if (options.shadow) shadow?.addShadowCaster(mesh);
    } else {
      const group = groups.get(material) ?? [];
      group.push(mesh); groups.set(material, group);
      if (options.shadow) shadowGroups.add(material);
    }
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, material: StandardMaterial, options: BoxOptions = {}): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    if (options.rotation) mesh.rotation.copyFrom(options.rotation);
    if (options.solid) colliders.push(boxCollider(x, z, width, depth));
    return register(mesh, material, options);
  }
  function cylinder(name: string, position: Vector3, height: number, diameterTop: number, diameterBottom: number, material: StandardMaterial, options: BoxOptions = {}): Mesh {
    const mesh = MeshBuilder.CreateCylinder(name, { height, diameterTop, diameterBottom, tessellation: 7 }, scene);
    mesh.position.copyFrom(position);
    return register(mesh, material, options);
  }
  function tube(name: string, path: Vector3[], radius: number, material: StandardMaterial, options: BoxOptions = {}): Mesh {
    return register(MeshBuilder.CreateTube(name, { path, radius, tessellation: 5, cap: Mesh.CAP_ALL }, scene), material, options);
  }

  const ambient = new HemisphericLight('overcast-sky', new Vector3(.2, 1, .1), scene);
  ambient.intensity = .72;
  ambient.diffuse = new Color3(.78, .84, .78);
  ambient.groundColor = new Color3(.24, .25, .19);
  const sun = new DirectionalLight('late-afternoon', new Vector3(-.55, -1, -.4), scene);
  sun.position = new Vector3(15, 22, 12);
  sun.intensity = 1.15;
  sun.diffuse = new Color3(1, .91, .72);
  sun.orthoLeft = -17; sun.orthoRight = 17; sun.orthoTop = 17; sun.orthoBottom = -17;
  sun.shadowMinZ = 1; sun.shadowMaxZ = 65;
  const shadow = new ShadowGenerator(touch ? 512 : 1024, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadow.bias = .0006; shadow.normalBias = .025;
  shadow.setDarkness(.28);
  const holeLight = new SpotLight('light-through-the-ceiling', new Vector3(.6, 6.8, -1), new Vector3(-.08, -1, .05), 1.05, 2, scene);
  holeLight.intensity = 2.5; holeLight.diffuse = new Color3(.86, .9, .79); holeLight.range = 13;

  // The only building on an otherwise empty street.
  box('earth', 0, -.16, 0, 120, .16, 120, materials.dirt);
  box('asphalt', 0, -.055, 14, 100, .12, 7.6, materials.asphalt);
  box('near-pavement', 0, -.015, 9.45, 100, .15, 1.5, materials.concrete);
  box('far-pavement', 0, -.015, 18.55, 100, .15, 1.5, materials.concrete);
  for (let x = -46; x < 48; x += 6) box('faded-lane-mark', x, .011, 14, 2.6, .008, .1, materials.marking);
  box('garden-path', 0, -.045, 8.5, 2.1, .08, 2.4, materials.dirt);
  for (let x = -49; x < 50; x += 2.5) {
    box('pavement-seam', x, .064, 9.45, .018, .004, 1.48, materials.beam);
    box('pavement-seam', x, .064, 18.55, .018, .004, 1.48, materials.beam);
  }

  // Individual floorboards: low-resolution grain, uneven ends, narrow gaps.
  for (let x = -4.8; x < 5; x += .4) {
    let z = -6;
    while (z < 5.99) {
      const length = Math.min(random.range(2.1, 4.1), 6 - z);
      box('floorboard', x, -.065 + random.range(-.006, .006), z + length / 2, .382, .13, length - .022, random.pick(materials.wood));
      z += length;
    }
  }
  box('foundation-front', 0, -.25, 6, 10.3, .45, .28, materials.concrete);
  box('foundation-back', 0, -.25, -6, 10.3, .45, .28, materials.concrete);

  function wall(axis: 'x' | 'z', fixed: number, min: number, max: number, holes: Hole[], height = 4.05): void {
    for (let row = 0; row < Math.floor(height / .28); row++) {
      const y = .14 + row * .28;
      let intervals: [number, number][] = [[min, max]];
      for (const hole of holes) {
        if (y + .13 < hole.bottom || y - .13 > hole.top) continue;
        intervals = intervals.flatMap(([a, b]): [number, number][] => {
          if (hole.b <= a || hole.a >= b) return [[a, b]];
          const parts: [number, number][] = [];
          if (hole.a > a) parts.push([a, hole.a]);
          if (hole.b < b) parts.push([hole.b, b]);
          return parts;
        });
      }
      for (const [a, b] of intervals) {
        if (b - a < .06) continue;
        const center = (a + b) / 2;
        const options = { shadow: true };
        if (axis === 'x') box('weatherboard', center, y, fixed, b - a - .012, .257, .17, random.pick(materials.wall), options);
        else box('weatherboard', fixed, y, center, .17, .257, b - a - .012, random.pick(materials.wall), options);
      }
    }
  }
  const frontWindows: Hole[] = [
    { a: -.88, b: .88, bottom: 0, top: 2.8 },
    { a: -3.75, b: -2.05, bottom: 1.4, top: 2.75 },
    { a: 2.0, b: 3.65, bottom: 1.5, top: 2.8 },
    { a: 4.25, b: 5.1, bottom: 3.35, top: 4.2 },
  ];
  wall('x', 6, -5, 5, frontWindows);
  wall('x', -6, -5, 5, [{ a: -2.2, b: 1.7, bottom: 1.5, top: 2.8 }, { a: -5.1, b: -3.6, bottom: 3.1, top: 4.2 }]);
  wall('z', -5, -6, 6, [{ a: -2.5, b: -.3, bottom: 1.4, top: 2.75 }, { a: -5.9, b: -4.5, bottom: 2.8, top: 4.2 }]);
  wall('z', 5, -6, 6, [{ a: -3.8, b: -1.6, bottom: 1.45, top: 2.8 }, { a: 1.2, b: 4.3, bottom: 1.05, top: 3.65 }, { a: 4.7, b: 6.1, bottom: 2.9, top: 4.2 }]);
  // Collision follows the closed wall sections; the front door is the usable exit.
  colliders.push(boxCollider(-2.94, 6, 4.12, .24), boxCollider(2.94, 6, 4.12, .24));
  colliders.push(boxCollider(0, -6, 10.2, .24), boxCollider(-5, 0, .24, 12.2), boxCollider(5, 0, .24, 12.2));
  wall('z', -1.8, -5.9, -2.15, [{ a: -5.5, b: -4.1, bottom: 2.45, top: 3.7 }], 3.35);
  colliders.push(boxCollider(-1.8, -4.025, .2, 3.75));

  for (const x of [-5, 5]) for (const z of [-6, 6]) box('corner-post', x, 2.05, z, .27, 4.25, .27, materials.beam, { shadow: true });
  for (const z of [-6, 6]) box('top-plate', 0, 4.05, z, 10.4, .25, .25, materials.beam, { shadow: true });
  for (const x of [-5, 5]) box('top-plate', x, 4.05, 0, .25, .25, 12.3, materials.beam, { shadow: true });

  function windowFrame(axis: 'x' | 'z', fixed: number, a: number, b: number, bottom: number, top: number): void {
    const center = (a + b) / 2, width = b - a, height = top - bottom;
    if (axis === 'x') {
      for (const x of [a, b]) box('window-jamb', x, bottom + height / 2, fixed, .1, height + .16, .24, materials.beam, { shadow: true });
      for (const y of [bottom, top]) box('window-lintel', center, y, fixed, width + .18, .11, .26, materials.beam, { shadow: true });
      box('window-mullion', center + .12, bottom + height / 2, fixed, .055, height, .12, materials.beam, { shadow: true });
      box('window-sill', center, bottom - .06, fixed + .06, width + .3, .09, .4, random.pick(materials.wood), { shadow: true });
    } else {
      for (const z of [a, b]) box('window-jamb', fixed, bottom + height / 2, z, .24, height + .16, .1, materials.beam, { shadow: true });
      for (const y of [bottom, top]) box('window-lintel', fixed, y, center, .26, .11, width + .18, materials.beam, { shadow: true });
      box('window-mullion', fixed, bottom + height / 2, center - .16, .12, height, .055, materials.beam, { shadow: true });
      box('window-sill', fixed + .06, bottom - .06, center, .4, .09, width + .3, random.pick(materials.wood), { shadow: true });
    }
  }
  windowFrame('x', 6, -3.75, -2.05, 1.4, 2.75);
  windowFrame('x', 6, 2, 3.65, 1.5, 2.8);
  windowFrame('x', -6, -2.2, 1.7, 1.5, 2.8);
  windowFrame('z', -5, -2.5, -.3, 1.4, 2.75);
  windowFrame('z', 5, -3.8, -1.6, 1.45, 2.8);
  // Jagged boards nailed across the larger breach, not an invisible doorway.
  box('broken-wall-board', 5.02, 1.45, 2.7, .14, .19, 3.35, materials.wall[1], { rotation: new Vector3(.24, 0, 0), shadow: true });
  box('broken-wall-board', 5.04, 2.05, 2.5, .14, .2, 2.9, materials.wall[2], { rotation: new Vector3(-.3, 0, 0), shadow: true });
  box('broken-wall-hanging', 4.98, 2.95, 3.9, .14, 1.5, .23, materials.wall[0], { rotation: new Vector3(.22, 0, .12), shadow: true });

  // A door already ajar. The centre of the doorway remains walkable.
  for (const x of [-.94, .94]) box('door-jamb', x, 1.42, 6.04, .15, 2.84, .3, materials.beam, { shadow: true });
  box('door-lintel', 0, 2.87, 6.04, 2.05, .18, .31, materials.beam, { shadow: true });
  const doorPivot = new TransformNode('open-door-hinge', scene);
  doorPivot.position.set(-.87, 0, 6.12); doorPivot.rotation.y = -1.22;
  for (let i = 0; i < 4; i++) box('door-plank', .11 + i * .215, 1.35, 0, .204, 2.67, .1, materials.wall[i], { parent: doorPivot, shadow: true });
  for (const y of [.45, 2.2]) box('door-brace', .43, y, -.075, .84, .13, .07, materials.beam, { parent: doorPivot, shadow: true });
  box('door-brace', .43, 1.33, -.08, .12, 1.95, .065, materials.beam, { parent: doorPivot, rotation: new Vector3(0, 0, -.4), shadow: true });
  const handle = MeshBuilder.CreateSphere('door-handle', { diameter: .085, segments: 6 }, scene);
  handle.position.set(.72, 1.15, -.1); register(handle, materials.metal, { parent: doorPivot });

  // The ceiling has a real opening, aligned with the cinematic spawn.
  for (let x = -4.8; x < 5; x += .4) {
    const distance = Math.abs(x - .6);
    if (distance < 1.6) {
      const halfGap = Math.sqrt(1.6 ** 2 - distance ** 2) + random.range(.02, .25);
      const backEnd = -1 - halfGap, frontStart = -1 + halfGap;
      box('broken-ceiling', x, 4.12, (-6 + backEnd) / 2, .38, .12, backEnd + 6, random.pick(materials.wall), { shadow: true });
      box('broken-ceiling', x, 4.12, (6 + frontStart) / 2, .38, .12, 6 - frontStart, random.pick(materials.wall), { shadow: true });
    } else if (random.next() > .07) box('ceiling-board', x, 4.12, 0, .38, .12, 11.95, random.pick(materials.wall), { shadow: true });
  }
  for (const z of [-5, -3.1, 1.15, 3.4, 5.5]) box('ceiling-joist', 0, 3.96, z, 10.2, .25, .2, materials.beam, { shadow: true });
  for (const x of [-2.4, 2.8]) box('attic-tie', x, 5.15, -1, .17, .18, 12.2, materials.beam, { shadow: true });
  box('hanging-splinter', -0.72, 3.87, -.2, .19, .12, 1.12, materials.wall[1], { rotation: new Vector3(.48, .12, 0), shadow: true });
  box('hanging-splinter', 1.92, 3.93, -1.6, .22, .11, .95, materials.wall[2], { rotation: new Vector3(-.35, -.1, 0), shadow: true });

  const roofAngle = Math.atan2(2.35, 5.55), roofLength = Math.hypot(5.55, 2.35);
  for (const side of [-1, 1]) for (let z = -6.6; z < 6.6; z += 1.2) {
    if (z > -2 && z < .5) continue; // A missing roof panel lets the overcast sky in.
    if (side === -1 && z > 3.5 && z < 5) continue;
    box('roof-panel', side * 2.775, 5.325, z + .59, roofLength + .12, .075, 1.17, materials.roof, { rotation: new Vector3(0, 0, -side * roofAngle), shadow: true });
  }
  for (const z of [-6.2, -3.2, .7, 3.5, 6.2]) for (const side of [-1, 1]) box('roof-rafter', side * 2.72, 5.23, z, roofLength, .17, .15, materials.beam, { rotation: new Vector3(0, 0, -side * roofAngle), shadow: true });
  box('ridge-beam', 0, 6.47, 0, .2, .22, 13.4, materials.beam, { shadow: true });
  for (const z of [-6.05, 6.05]) for (let y = 4.35; y < 6.3; y += .28) {
    const width = (6.5 - y) / 2.35 * 10.8;
    if (random.next() > .15) box('gable-board', random.range(-.08, .08), y, z, width, .23, .12, random.pick(materials.wall), { shadow: true });
  }

  // Small porch, collapsed roof sections and a single step down to the path.
  for (let x = -2.2; x <= 2.2; x += .37) box('porch-board', x, -.005, 7.05, .35, .12, 2.05, random.pick(materials.wood));
  box('porch-step', 0, -.035, 8.2, 2.4, .1, .42, materials.wood[1]);
  for (const x of [-2.25, 2.25]) {
    box('porch-post', x, 1.55, 7.95, .17, 3.15, .17, materials.beam, { solid: true, shadow: true });
    box('porch-brace', x * .88, 2.83, 7.95, .12, .75, .12, materials.beam, { rotation: new Vector3(0, 0, x > 0 ? -.65 : .65), shadow: true });
  }
  box('porch-header', 0, 3.12, 7.97, 4.8, .2, .2, materials.beam, { shadow: true });
  for (let x = -2.4; x < 2.5; x += .6) if (x < -.8 || x > 1.4) box('porch-roof', x, 3.28, 7.1, .58, .06, 2.55, materials.roof, { rotation: new Vector3(-.13, 0, 0), shadow: true });

  // Sparse, abandoned furniture. Nothing interactive is promised in this test.
  box('table-top', -3.15, .87, 2.25, 1.7, .1, .95, materials.wood[1], { solid: true, shadow: true });
  for (const x of [-3.85, -2.45]) for (const z of [1.9, 2.6]) box('table-leg', x, .42, z, .1, .84, .1, materials.beam, { shadow: true });
  box('table-scrap', -3.3, .94, 2.25, .5, .025, .3, materials.cloth, { rotation: new Vector3(0, .2, 0) });
  const chair = new TransformNode('fallen-chair', scene); chair.position.set(3.25, .43, 1.25); chair.rotation.set(.15, -.55, 1.18);
  box('chair-seat', 0, .45, 0, .58, .08, .57, materials.wood[2], { parent: chair, shadow: true });
  for (const x of [-.23, .23]) for (const z of [-.22, .22]) box('chair-leg', x, .22, z, .065, .45, .065, materials.beam, { parent: chair, shadow: true });
  for (const x of [-.23, .23]) box('chair-back-post', x, .82, -.24, .065, .75, .065, materials.beam, { parent: chair, shadow: true });
  for (const y of [.85, 1.12]) box('chair-back-slat', 0, y, -.24, .52, .12, .055, materials.wood[0], { parent: chair, shadow: true });
  colliders.push(boxCollider(3.25, 1.25, 1.05, .85));
  box('old-crate', -3.7, .43, -4.65, .95, .86, .9, materials.wood[2], { solid: true, shadow: true });
  for (const x of [-4.1, -3.3]) box('crate-batten', x, .43, -4.17, .1, .88, .06, materials.beam, { shadow: true });
  box('fallen-beam', 3.65, .17, -3.85, .23, .25, 3.3, materials.beam, { rotation: new Vector3(0, .62, .04), shadow: true });
  colliders.push(boxCollider(3.65, -3.85, 1.6, 2.7));
  box('threadbare-rug', -.1, .008, 2.4, 2.15, .012, 2.9, materials.cloth, { rotation: new Vector3(0, -.07, 0) });
  for (let i = 0; i < 34; i++) {
    const side = random.next() > .5 ? 1 : -1;
    const x = side * random.range(3.8, 4.75), z = random.range(-5.5, 5.5);
    box('wood-debris', x, .045, z, random.range(.08, .2), .055, random.range(.3, 1.1), random.pick(materials.wood), { rotation: new Vector3(0, random.range(-1.5, 1.5), 0) });
  }
  for (let i = 0; i < 12; i++) box('outside-debris', random.range(-6.5, 6.5), .03, random.range(6.5, 8.7), .14, .06, random.range(.35, 1.2), random.pick(materials.wall), { rotation: new Vector3(0, random.range(-2, 2), 0) });

  // A gently moving lamp, with a slow, non-strobing uneven filament.
  const lampPivot = new TransformNode('swaying-lamp', scene); lampPivot.position.set(-2.4, 4.05, .2);
  cylinder('lamp-cable', new Vector3(0, -.4, 0), .8, .018, .018, materials.metal, { parent: lampPivot, dynamic: true });
  cylinder('lamp-shade', new Vector3(0, -.85, 0), .22, .12, .55, materials.metal, { parent: lampPivot, dynamic: true, shadow: true });
  const bulb = MeshBuilder.CreateSphere('bulb', { diameter: .12, segments: 6 }, scene); bulb.position.set(0, -.97, 0); register(bulb, materials.bulb, { parent: lampPivot, dynamic: true });
  const lampLight = new PointLight('warm-lamp', new Vector3(0, -1.04, 0), scene); lampLight.parent = lampPivot;
  lampLight.diffuse = new Color3(1, .72, .39); lampLight.intensity = .85; lampLight.range = 7;

  // Empty roadside: utility poles, a broken fence, dead trees and weeds.
  for (const x of [-20, 0, 20]) {
    cylinder('utility-pole', new Vector3(x, 3.6, 19.8), 7.2, .14, .24, materials.bark, { shadow: true });
    box('pole-crossarm', x, 6.7, 19.8, 1.8, .12, .13, materials.beam, { shadow: true });
    for (const offset of [-.7, .7]) cylinder('insulator', new Vector3(x + offset, 6.85, 19.8), .2, .09, .11, materials.concrete);
  }
  for (const offset of [-.7, .7]) for (const start of [-20, 0]) {
    const path: Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; path.push(new Vector3(start + t * 20 + offset, 6.94 - Math.sin(t * Math.PI) * .8, 19.8)); }
    tube('sagging-wire', path, .014, materials.metal);
  }
  for (const side of [-1, 1]) {
    for (let z = -10; z <= 7; z += 2) box('fence-post', side * 8.2, .65, z, .13, 1.3, .13, materials.beam, { rotation: new Vector3(0, 0, random.range(-.09, .09)), shadow: true });
    for (const y of [.45, .95]) for (let z = -9; z < 7; z += 2) if (random.next() > .22) box('fence-rail', side * 8.2, y, z, .08, .13, 1.95, random.pick(materials.wall), { rotation: new Vector3(random.range(-.06, .06), 0, 0), shadow: true });
  }
  function deadTree(x: number, z: number, height: number): void {
    cylinder('dead-tree', new Vector3(x, height / 2, z), height, .07, .28, materials.bark, { shadow: true });
    for (let i = 0; i < 4; i++) {
      const angle = random.range(0, Math.PI * 2), y = height * random.range(.4, .82), length = random.range(.8, 1.8);
      const start = new Vector3(x, y, z), end = new Vector3(x + Math.cos(angle) * length, y + random.range(.5, 1.3), z + Math.sin(angle) * length);
      tube('bare-branch', [start, Vector3.Lerp(start, end, .55).add(new Vector3(0, -.12, 0)), end], .045, materials.bark, { shadow: true });
    }
  }
  for (const [x, z, h] of [[-12, -5, 6], [12, -8, 7], [-16, 5, 5.5], [17, 4, 6.5], [-9, -17, 7], [7, -19, 8], [24, -12, 6], [-25, -9, 7]]) deadTree(x, z, h);
  for (let i = 0; i < 150; i++) {
    const x = random.range(-30, 30), z = random.range(-24, 25);
    if ((Math.abs(x) < 6 && z > -7 && z < 9) || (z > 8.5 && z < 19.5)) continue;
    const height = random.range(.12, .42);
    const tuft = MeshBuilder.CreateCylinder('dry-weed', { height, diameterTop: 0, diameterBottom: random.range(.1, .28), tessellation: 3 }, scene);
    tuft.position.set(x, height / 2 - .06, z); tuft.rotation.set(random.range(-.2, .2), random.range(0, 6), random.range(-.2, .2));
    register(tuft, materials.foliage);
  }
  // Distant silhouettes are trees only: no traffic, people, or pretend buildings.
  for (let i = 0; i < 36; i++) {
    const angle = i / 36 * Math.PI * 2, distance = random.range(37, 48), height = random.range(5, 10);
    const silhouette = MeshBuilder.CreateCylinder('distant-trees', { height, diameterTop: 0, diameterBottom: random.range(3, 6), tessellation: 5 }, scene);
    silhouette.position.set(Math.cos(angle) * distance, height / 2 - .1, Math.sin(angle) * distance);
    register(silhouette, materials.foliage);
  }

  // Merge static geometry by material to keep phone draw-call counts low.
  for (const [material, meshes] of groups) {
    const merged = meshes.length > 1 ? Mesh.MergeMeshes(meshes, true, true, undefined, false, false) : meshes[0];
    if (!merged) continue;
    merged.name = `static-${material.name}`;
    merged.material = material; merged.receiveShadows = true; merged.isPickable = false;
    merged.freezeWorldMatrix();
    if (shadowGroups.has(material)) shadow.addShadowCaster(merged);
  }

  const dustTexture = new DynamicTexture('soft-dust', { width: 32, height: 32 }, scene, false);
  const dustContext = dustTexture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = dustContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,.8)'); gradient.addColorStop(.35, 'rgba(255,255,255,.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  dustContext.fillStyle = gradient; dustContext.fillRect(0, 0, 32, 32); dustTexture.hasAlpha = true; dustTexture.update();
  const dust = new ParticleSystem('floating-dust', 220, scene);
  dust.particleTexture = dustTexture; dust.emitter = new Vector3(0, 2, 0);
  dust.minEmitBox = new Vector3(-4, -1.7, -5); dust.maxEmitBox = new Vector3(4, 1.7, 5);
  dust.color1 = new Color4(.8, .78, .61, .23); dust.color2 = new Color4(.65, .7, .57, .12); dust.colorDead = new Color4(.6, .65, .5, 0);
  dust.minSize = .013; dust.maxSize = .037; dust.minLifeTime = 7; dust.maxLifeTime = 13;
  dust.emitRate = touch ? 12 : 20; dust.direction1 = new Vector3(-.04, .01, -.02); dust.direction2 = new Vector3(.03, .045, .02);
  dust.minEmitPower = .1; dust.maxEmitPower = .3; dust.updateSpeed = .012; dust.blendMode = ParticleSystem.BLENDMODE_STANDARD; dust.start();
  const burst = new ParticleSystem('landing-dust', 100, scene);
  burst.particleTexture = dustTexture; burst.emitter = new Vector3(.6, .08, -1);
  burst.minEmitBox = new Vector3(-.45, 0, -.45); burst.maxEmitBox = new Vector3(.45, .08, .45);
  burst.color1 = new Color4(.64, .59, .43, .3); burst.color2 = new Color4(.52, .49, .37, .2); burst.colorDead = new Color4(.5, .5, .4, 0);
  burst.minSize = .09; burst.maxSize = .3; burst.minLifeTime = .6; burst.maxLifeTime = 2.2;
  burst.emitRate = 0; burst.direction1 = new Vector3(-1, .25, -1); burst.direction2 = new Vector3(1, .8, 1);
  burst.minEmitPower = .4; burst.maxEmitPower = 1.5; burst.gravity = new Vector3(0, -.12, 0);
  burst.updateSpeed = .014; burst.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  return {
    colliders,
    bounds: { minX: -42, maxX: 42, minZ: -30, maxZ: 34 },
    spawn: new Vector3(.6, 6.15, -1),
    update(time: number) {
      lampPivot.rotation.z = Math.sin(time * .83) * .035 + Math.sin(time * 1.7) * .012;
      lampLight.intensity = .83 + Math.sin(time * 2.3) * .055 + Math.sin(time * 7.1) * .025;
    },
    landingDust(x: number, z: number) {
      burst.stop(); burst.reset(); (burst.emitter as Vector3).set(x, .08, z); burst.manualEmitCount = touch ? 45 : 85; burst.start();
    },
  };
}
