import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCollider, clamp, damp, intersectsCircle, isInsideHouse, moveWithCollisions, Random } from '../src/game/physics';

const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

test('clamp and damp stay stable', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.ok(Math.abs(damp(0, 1, 10, 1) - 1) < .001);
  assert.equal(damp(3, 3, 10, .016), 3);
});

test('circle intersects a wall only within radius', () => {
  const wall = boxCollider(0, 5, 10, .2);
  assert.ok(intersectsCircle({ x: 0, z: 4.8 }, .27, wall));
  assert.ok(!intersectsCircle({ x: 0, z: 4.5 }, .27, wall));
});

test('movement slides along a wall instead of passing through', () => {
  const wall = boxCollider(0, 5, 10, .2);
  const result = moveWithCollisions({ x: 0, z: 4 }, { x: 2, z: 2 }, .27, [wall], bounds);
  assert.ok(result.x > 1.5);
  assert.ok(result.z < 4.74);
});

test('substeps prevent tunnelling at low frame rates', () => {
  const wall = boxCollider(0, 5, 10, .2);
  const result = moveWithCollisions({ x: 0, z: 0 }, { x: 0, z: 20 }, .27, [wall], bounds);
  assert.ok(result.z < 4.74);
});

test('the open doorway is passable but the front wall is not', () => {
  const colliders = [boxCollider(-2.94, 6, 4.12, .24), boxCollider(2.94, 6, 4.12, .24)];
  const throughDoor = moveWithCollisions({ x: 0, z: 4 }, { x: 0, z: 4 }, .27, colliders, bounds);
  assert.ok(throughDoor.z > 7.9);
  const intoWall = moveWithCollisions({ x: 3, z: 4 }, { x: 0, z: 4 }, .27, colliders, bounds);
  assert.ok(intoWall.z < 5.7);
});

test('world bounds contain the player', () => {
  const result = moveWithCollisions({ x: 41.9, z: 0 }, { x: 10, z: 0 }, .27, [], bounds);
  assert.ok(result.x <= bounds.maxX - .27 + 1e-9);
});

test('location changes at the house threshold', () => {
  assert.ok(isInsideHouse({ x: 0, z: 0 }));
  assert.ok(!isInsideHouse({ x: 0, z: 8 }));
  assert.ok(!isInsideHouse({ x: 7, z: 0 }));
});

test('seeded randomness is reproducible', () => {
  const a = new Random(42), b = new Random(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});
