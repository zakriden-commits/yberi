import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { Random } from './physics';

export interface Materials {
  wood: StandardMaterial[];
  wall: StandardMaterial[];
  beam: StandardMaterial;
  roof: StandardMaterial;
  dirt: StandardMaterial;
  asphalt: StandardMaterial;
  concrete: StandardMaterial;
  metal: StandardMaterial;
  bark: StandardMaterial;
  foliage: StandardMaterial;
  cloth: StandardMaterial;
  marking: StandardMaterial;
  bulb: StandardMaterial;
}

function canvasMaterial(scene: Scene, name: string, paint: (ctx: CanvasRenderingContext2D, random: Random) => void, seed: number): StandardMaterial {
  const texture = new DynamicTexture(`${name}-texture`, { width: 256, height: 256 }, scene, false, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  paint(ctx, new Random(seed));
  texture.update(false);
  texture.anisotropicFilteringLevel = 2;
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.specularColor = new Color3(0.025, 0.027, 0.02);
  material.specularPower = 8;
  material.maxSimultaneousLights = 5;
  return material;
}

function woodPaint(base: [number, number, number], horizontal: boolean, seed: number) {
  return (ctx: CanvasRenderingContext2D, random: Random) => {
    ctx.fillStyle = `rgb(${base.join(',')})`;
    ctx.fillRect(0, 0, 256, 256);
    ctx.save();
    if (horizontal) { ctx.translate(256, 0); ctx.rotate(Math.PI / 2); }
    for (let i = 0; i < 420; i++) {
      const x = random.range(0, 256);
      const y = random.range(-80, 256);
      const light = random.next() > 0.48;
      ctx.strokeStyle = light ? `rgba(205,190,148,${random.range(.025, .16)})` : `rgba(17,23,15,${random.range(.06, .32)})`;
      ctx.lineWidth = random.range(.4, 2.2);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + random.range(-5, 5), y + 55, x + random.range(-4, 4), y + 110, x + random.range(-2, 2), y + random.range(130, 310));
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const x = random.range(20, 236), y = random.range(20, 236);
      for (let ring = 5; ring > 0; ring--) {
        ctx.strokeStyle = `rgba(24,29,18,${.1 + (5 - ring) * .035})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, ring * 1.6, ring * 4.3, .08, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const x of [13, 242]) for (const y of [18, 237]) {
      ctx.fillStyle = '#24291f'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b8870'; ctx.fillRect(x - 1, y - 1, 1, 1);
    }
    ctx.restore();
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(15,24,15,${random.range(.02, .12)})`;
      ctx.fillRect(random.range(0, 256), random.range(0, 256), random.range(2, 30), random.range(1, 9));
    }
    void seed;
  };
}

function noisePaint(base: [number, number, number], amount: number, seed: number) {
  return (ctx: CanvasRenderingContext2D, random: Random) => {
    const image = ctx.createImageData(256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = random.range(-amount, amount);
      image.data[i] = base[0] + noise;
      image.data[i + 1] = base[1] + noise;
      image.data[i + 2] = base[2] + noise;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    for (let i = 0; i < 200; i++) {
      const shade = random.next() > .5 ? 155 : 15;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},.13)`;
      ctx.beginPath(); ctx.ellipse(random.range(0, 256), random.range(0, 256), random.range(.5, 3), random.range(.5, 2), random.range(0, 3), 0, Math.PI * 2); ctx.fill();
    }
    void seed;
  };
}

export function createMaterials(scene: Scene): Materials {
  const woodBases: [number, number, number][] = [[105, 94, 69], [119, 106, 78], [91, 85, 65], [128, 116, 86], [100, 98, 76]];
  const wood = woodBases.map((base, i) => canvasMaterial(scene, `floor-wood-${i}`, woodPaint(base, false, i + 11), i));
  const wall = woodBases.map((base, i) => canvasMaterial(scene, `wall-wood-${i}`, woodPaint(base.map((v) => v * .87) as [number, number, number], true, i + 31), i));
  const beam = canvasMaterial(scene, 'old-beams', woodPaint([65, 61, 45], false, 71), 71);
  const roof = canvasMaterial(scene, 'rusted-roof', (ctx, random) => {
    noisePaint([65, 69, 61], 13, 8)(ctx, random);
    for (let x = 0; x < 256; x += 16) {
      const gradient = ctx.createLinearGradient(x, 0, x + 16, 0);
      gradient.addColorStop(0, '#171e1855'); gradient.addColorStop(.35, '#b5b3a329'); gradient.addColorStop(.6, '#171e1800'); gradient.addColorStop(1, '#171e1866');
      ctx.fillStyle = gradient; ctx.fillRect(x, 0, 16, 256);
    }
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(105,65,37,${random.range(.08, .35)})`;
      ctx.fillRect(random.range(0, 256), random.range(0, 256), random.range(2, 13), random.range(5, 80));
    }
  }, 9);
  roof.backFaceCulling = false;
  const dirt = canvasMaterial(scene, 'wet-earth', noisePaint([77, 79, 61], 20, 12), 12);
  const dirtTexture = dirt.diffuseTexture as Texture;
  dirtTexture.uScale = 32; dirtTexture.vScale = 32;
  const asphalt = canvasMaterial(scene, 'empty-road', noisePaint([62, 67, 62], 15, 13), 13);
  const asphaltTexture = asphalt.diffuseTexture as Texture;
  asphaltTexture.uScale = 20; asphaltTexture.vScale = 2;
  const concrete = canvasMaterial(scene, 'curb-concrete', noisePaint([112, 115, 99], 18, 14), 14);
  (concrete.diffuseTexture as Texture).uScale = 12;
  const metal = canvasMaterial(scene, 'oxidised-metal', noisePaint([64, 65, 53], 22, 15), 15);
  const bark = canvasMaterial(scene, 'dead-bark', woodPaint([61, 65, 52], false, 16), 16);
  const foliage = new StandardMaterial('dry-grass', scene);
  foliage.diffuseColor = new Color3(.25, .29, .19); foliage.specularColor = Color3.Black(); foliage.backFaceCulling = false;
  const cloth = canvasMaterial(scene, 'worn-rug', (ctx, random) => {
    noisePaint([83, 73, 54], 12, 17)(ctx, random);
    ctx.strokeStyle = '#a2936b55'; ctx.lineWidth = 5; ctx.strokeRect(14, 14, 228, 228); ctx.lineWidth = 2; ctx.strokeRect(24, 24, 208, 208);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = '#343d2b33'; ctx.fillRect(random.range(0, 256), random.range(0, 256), random.range(4, 40), random.range(3, 30)); }
  }, 17);
  const marking = new StandardMaterial('faded-road-paint', scene);
  marking.diffuseColor = new Color3(.53, .54, .43); marking.alpha = .38; marking.specularColor = Color3.Black();
  const bulb = new StandardMaterial('dim-bulb', scene);
  bulb.diffuseColor = new Color3(.8, .65, .35); bulb.emissiveColor = new Color3(.95, .69, .32); bulb.specularColor = Color3.Black();
  return { wood, wall, beam, roof, dirt, asphalt, concrete, metal, bark, foliage, cloth, marking, bulb };
}
