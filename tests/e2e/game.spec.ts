import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { GameSnapshot } from '../../src/game/game';

declare global { interface Window { __YBERI__?: { snapshot: () => GameSnapshot } } }
const snapshot = (page: Page) => page.evaluate(() => window.__YBERI__!.snapshot());
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 60_000 });
  await page.waitForFunction(() => window.__YBERI__?.snapshot().ready);
}
async function waitPlaying(page: Page) {
  await page.waitForFunction(() => window.__YBERI__?.snapshot().state === 'playing', undefined, { timeout: 60_000 });
}

test('desktop: cinematic landing, walking through the door, pause, sound and replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__YBERI__?.snapshot().state === 'falling');
  const falling = await snapshot(page);
  expect(falling.position.y).toBeGreaterThan(4);
  await waitPlaying(page);
  const landed = await snapshot(page);
  expect(landed.position.y).toBeCloseTo(1.68, 1);
  expect(landed.audio).toBe('running');

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => !window.__YBERI__!.snapshot().inside, undefined, { timeout: 45_000 });
  await page.keyboard.up('KeyW');
  await expect(page.locator('#location-name')).toHaveText('ПУСТАЯ УЛИЦА');

  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('KeyM');
  await expect(page.locator('body')).toHaveClass(/sound-muted/);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__YBERI__?.snapshot().state === 'falling');
  await waitPlaying(page);
  expect((await snapshot(page)).inside).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile: floating joystick moves and right-side drag looks around', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('body')).toHaveClass(/is-touch/);
  await page.locator('#start-button').tap();
  await waitPlaying(page);
  const before = await snapshot(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 85, y: 700, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 85, y: 650, id: 1 }] });
  await page.waitForTimeout(2200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  const moved = await snapshot(page);
  expect(moved.position.z).toBeGreaterThan(before.position.z + .3);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 355, y: 420, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  const looked = await snapshot(page);
  expect(Math.abs(looked.yaw - moved.yaw)).toBeGreaterThan(.05);
  await page.locator('[data-action="pause"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');
  expect(errors).toEqual([]);
  await context.close();
});
