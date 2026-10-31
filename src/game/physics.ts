export interface Point2 { x: number; z: number }
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const damp = (current: number, target: number, speed: number, dt: number): number => target + (current - target) * Math.exp(-speed * dt);

export function boxCollider(x: number, z: number, width: number, depth: number): Collider {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

export function intersectsCircle(position: Point2, radius: number, box: Collider): boolean {
  const nearestX = clamp(position.x, box.minX, box.maxX);
  const nearestZ = clamp(position.z, box.minZ, box.maxZ);
  return (position.x - nearestX) ** 2 + (position.z - nearestZ) ** 2 < radius ** 2;
}

/** Axis-separated circle/AABB movement, substepped to prevent tunnelling. */
export function moveWithCollisions(position: Point2, delta: Point2, radius: number, colliders: readonly Collider[], bounds: Bounds): Point2 {
  const result = { ...position };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (radius * 0.45)));
  const stepX = delta.x / steps;
  const stepZ = delta.z / steps;
  for (let step = 0; step < steps; step++) {
    const nextX = clamp(result.x + stepX, bounds.minX + radius, bounds.maxX - radius);
    if (!colliders.some((box) => intersectsCircle({ x: nextX, z: result.z }, radius, box))) result.x = nextX;
    const nextZ = clamp(result.z + stepZ, bounds.minZ + radius, bounds.maxZ - radius);
    if (!colliders.some((box) => intersectsCircle({ x: result.x, z: nextZ }, radius, box))) result.z = nextZ;
  }
  return result;
}

export function isInsideHouse(position: Point2): boolean {
  return Math.abs(position.x) < 5.05 && position.z > -6.05 && position.z < 6.1;
}

export class Random {
  constructor(private seed = 7319) {}
  next(): number {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
}
