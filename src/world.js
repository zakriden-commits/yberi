import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HOUSE, BANK, SHOP, TRUCK, CASH_POINTS, WARDROBES, BEDS } from './shared/constants.js';

export function buildWorld(scene) {
  const colliders = [];
  const mat = (name, r, g, b) => { const m = new StandardMaterial(name, scene); m.diffuseColor = new Color3(r, g, b); m.specularColor = new Color3(.05, .05, .05); return m; };
  const wood = mat('wood', .42, .33, .24), woodDark = mat('woodDark', .28, .22, .17), wall = mat('wall', .55, .55, .5), concrete = mat('concrete', .45, .46, .44), road = mat('road', .22, .23, .24), gold = mat('gold', .83, .69, .22), green = mat('green', .2, .5, .3), blue = mat('blue', .2, .35, .6), red = mat('red', .6, .2, .2), black = mat('black', .1, .1, .1), white = mat('white', .85, .85, .8);
  function box(name, x, y, z, w, h, d, material, solid = false) { const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); m.material = material; if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); return m; }
  scene.clearColor = new Color3(.55, .62, .68);
  scene.fogMode = 2; scene.fogDensity = .008; scene.fogColor = new Color3(.55, .62, .68);
  new HemisphericLight('hemi', new Vector3(0, 1, 0), scene).intensity = .85;
  const sun = new DirectionalLight('sun', new Vector3(-.4, -1, .3), scene); sun.intensity = .9;
  box('ground', 0, -.1, 10, 160, .2, 140, mat('grass', .3, .42, .28));
  box('road', 0, .01, 14, 140, .05, 8, road);
  box('sidewalk1', 0, .06, 9, 140, .12, 2, concrete);
  box('sidewalk2', 0, .06, 19, 140, .12, 2, concrete);
  // House
  box('houseFloor', 0, .02, 0, 12, .1, 10, wood);
  box('hWallBack', 0, 1.5, -5, 12, 3, .3, woodDark, true);
  box('hWallLeft', -6, 1.5, 0, .3, 3, 10, woodDark, true);
  box('hWallRight', 6, 1.5, 0, .3, 3, 10, woodDark, true);
  box('hWallFrontL', -3.5, 1.5, 5, 5, 3, .3, woodDark, true);
  box('hWallFrontR', 3.5, 1.5, 5, 5, 3, .3, woodDark, true);
  box('hWallFrontTop', 0, 2.7, 5, 2, .6, .3, woodDark);
  box('roof', 0, 3.2, 0, 12.6, .3, 10.6, woodDark);
  const houseDoor = box('houseDoor', 0, 1.2, 5, 1.8, 2.4, .12, wood);
  houseDoor.setPivotPoint(new Vector3(-.9, 0, 0));
  BEDS.forEach((b, i) => { box('bed' + i, b.x, .35, b.z, 1.4, .5, 2.4, mat('bed', .5, .3, .3)); box('pillow' + i, b.x, .65, b.z - .8, 1.1, .18, .5, white); });
  WARDROBES.forEach((w, i) => box('wardrobe' + i, w.x, 1.1, w.z, 1.6, 2.2, .8, wood, true));
  box('table', 0, .75, -2, 2, .1, 1, wood); box('lamp', 0, 2.6, 0, .3, .3, .3, gold);
  // Bank
  box('bankFloor', 24, .03, 28, 20, .1, 16, concrete);
  box('bankBack', 24, 2.5, 36, 20, 5, .4, wall, true);
  box('bankLeft', 14, 2.5, 28, .4, 5, 16, wall, true);
  box('bankRight', 34, 2.5, 28, .4, 5, 16, wall, true);
  box('bankFrontL', 18, 2.5, 20, 8, 5, .4, wall, true);
  box('bankFrontR', 30, 2.5, 20, 8, 5, .4, wall, true);
  box('bankFrontTop', 24, 4.3, 20, 4, 1.4, .4, wall);
  box('bankRoof', 24, 5.1, 28, 20.5, .3, 16.5, concrete);
  box('bankSign', 24, 5.6, 20, 8, 1, .3, gold);
  CASH_POINTS.forEach((c, i) => { box('counter' + i, c.x, .9, c.z, 3, 1.8, 1, wood); for (let k = 0; k < 5; k++) box('cash' + i + k, c.x - .8 + k * .4, 1.9, c.z, .3, .15, .5, green); });
  box('cashierDesk', 24, 1, 33, 6, 2, 1, wood);
  // Shop
  box('shopFloor', -19, .03, 26, 14, .1, 12, concrete);
  box('shopBack', -19, 2, 32, 14, 4, .4, wall, true);
  box('shopLeft', -26, 2, 26, .4, 4, 12, wall, true);
  box('shopRight', -12, 2, 26, .4, 4, 12, wall, true);
  box('shopFrontL', -23, 2, 20, 6, 4, .4, wall, true);
  box('shopFrontR', -15, 2, 20, 6, 4, .4, wall, true);
  box('shopRoof', -19, 4.1, 26, 14.5, .3, 12.5, red);
  box('shopSign', -19, 4.6, 20, 7, .9, .3, black);
  box('shopCounter', -19, 1, 29, 5, 2, 1, wood);
  for (let i = 0; i < 3; i++) box('shelf' + i, -24 + i * 5, 1.5, 31, 3, 3, .5, woodDark);
  // Truck
  box('truckBody', TRUCK.x, 1.2, TRUCK.z, 4, 2.4, 2.4, blue); box('truckCab', TRUCK.x + 2.6, 1, TRUCK.z, 1.6, 2, 2.2, blue); box('truckWheel1', TRUCK.x - 1.2, .4, TRUCK.z + 1.3, .8, .8, .3, black); box('truckWheel2', TRUCK.x + 1.2, .4, TRUCK.z + 1.3, .8, .8, .3, black);
  // street props
  for (let i = -3; i <= 3; i++) { box('pole' + i, i * 15, 2.5, 19.5, .2, 5, .2, black); box('light' + i, i * 15, 5, 19.5, .6, .2, .6, gold); }
  function setHouseDoor(open) { houseDoor.rotation.y = open ? -Math.PI / 2 : 0; houseDoor.position.x = open ? -0.9 : 0; }
  setHouseDoor(true);
  return { colliders, setHouseDoor, materials: { wood, woodDark, wall, concrete, road, gold, green, blue, red, black, white } };
}
