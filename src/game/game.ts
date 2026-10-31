import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createWorld } from './world';
import type { World } from './world';
import { AtmosphereAudio } from './audio';
import { Controls } from './controls';
import { clamp, damp, isInsideHouse, moveWithCollisions } from './physics';

export type GameState = 'loading' | 'menu' | 'falling' | 'landing' | 'playing' | 'paused';
export interface GameSnapshot {
  state: GameState;
  ready: boolean;
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  inside: boolean;
  colliders: number;
  meshes: number;
  fps: number;
  audio: string;
  touch: boolean;
}
interface Settings { sound: boolean; shake: boolean; volume: number }
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = .27;
const STORAGE_KEY = 'yberi-threshold-settings-v1';

function loadSettings(): Settings {
  const defaults = { sound: true, shake: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, volume: .65 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return { sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound, shake: typeof saved.shake === 'boolean' ? saved.shake : defaults.shake, volume: typeof saved.volume === 'number' ? clamp(saved.volume, 0, 1) : defaults.volume };
  } catch { return defaults; }
}

export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly touch = window.matchMedia('(pointer: coarse)').matches;
  readonly audio = new AtmosphereAudio();
  readonly controls: Controls;
  private world: World;
  private settings = loadSettings();
  private state: GameState = 'loading';
  private pausedFrom: GameState = 'playing';
  private ready = false;
  private time = 0;
  private player = { x: .6, z: -1 };
  private cameraY = EYE_HEIGHT;
  private yaw = -.06;
  private pitch = .1;
  private velocityX = 0;
  private velocityZ = 0;
  private verticalVelocity = 0;
  private fallTime = 0;
  private landingTime = 0;
  private crouch = 0;
  private crouchVelocity = 0;
  private ceilingCracked = false;
  private stepDistance = 0;
  private stepAlternate = false;
  private bobPhase = 0;
  private bobAmount = 0;
  private hintTime = 0;
  private inside = true;
  private lastPause = 0;
  private lowPower = false;
  private slowFramesTime = 0;
  private realTime = 0;
  private readonly menuPosition = new Vector3(3.55, 1.9, 4.65);
  private menuYaw = 0;
  private menuPitch = 0;

  constructor(private canvas: HTMLCanvasElement) {
    document.body.classList.toggle('is-touch', this.touch);
    this.engine = new Engine(canvas, false, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', adaptToDeviceRatio: false });
    this.engine.setHardwareScalingLevel(this.touch ? 1.2 : 1.08);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.skipPointerDownPicking = true;
    this.scene.skipPointerUpPicking = true;
    this.camera = new UniversalCamera('first-person', this.menuPosition.clone(), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = .055; this.camera.maxZ = 115; this.camera.fov = this.touch ? 1.2 : 1.1;
    this.camera.setTarget(new Vector3(-.8, 1.95, -2.4));
    this.menuYaw = this.camera.rotation.y; this.menuPitch = this.camera.rotation.x;
    this.world = createWorld(this.scene, this.touch);
    if (/swiftshader|llvmpipe|software/i.test(this.engine.getGlInfo().renderer)) this.enableLowPower();
    this.controls = new Controls(canvas, this.touch, {
      onPause: () => this.togglePause(),
      onRestart: () => { if (this.state !== 'menu' && this.state !== 'loading') this.start(); },
      onMute: () => this.toggleSound(),
      onSkip: () => this.skipIntro(),
      onLockLost: () => this.pause(),
      onBlur: () => this.pause(),
    });
    this.audio.setMuted(!this.settings.sound); this.audio.setVolume(this.settings.volume);
    this.syncSettings();
    this.bindUI();
    this.engine.onContextLostObservable.add(() => { this.pause(); this.announce('Графический контекст потерян. Если изображение не вернётся, обнови страницу.'); });
    this.scene.executeWhenReady(() => {
      this.ready = true;
      const button = document.getElementById('start-button') as HTMLButtonElement;
      button.disabled = false; document.getElementById('start-label')!.textContent = 'ВОЙТИ В ДОМ';
      this.setState('menu');
    });
    this.engine.runRenderLoop(() => this.tick());
    window.addEventListener('resize', () => this.engine.resize());
  }
  private bindUI(): void {
    document.getElementById('start-button')!.addEventListener('click', () => this.start());
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        switch (button.dataset.action) {
          case 'sound': this.toggleSound(); break;
          case 'shake': this.settings.shake = !this.settings.shake; this.syncSettings(); break;
          case 'pause': this.pause(); break;
          case 'resume': this.resume(); break;
          case 'restart': this.start(); break;
        }
      });
    });
    document.getElementById('skip-button')!.addEventListener('click', () => this.skipIntro());
    const volume = document.getElementById('volume') as HTMLInputElement;
    volume.value = String(Math.round(this.settings.volume * 100));
    volume.addEventListener('input', () => { this.settings.volume = Number(volume.value) / 100; this.audio.setVolume(this.settings.volume); this.saveSettings(); });
    const fullscreen = document.getElementById('fullscreen-button')!;
    if (!document.documentElement.requestFullscreen) fullscreen.hidden = true;
    fullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen().catch(() => this.announce('Полноэкранный режим недоступен в этом браузере.'));
    });
  }
  private setState(state: GameState): void { this.state = state; document.body.dataset.state = state; }
  private announce(message: string): void { document.getElementById('announcer')!.textContent = message; }
  private saveSettings(): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Private browsing may disable storage. */ } }
  private syncSettings(): void {
    document.body.classList.toggle('sound-muted', !this.settings.sound);
    document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(this.settings.sound));
      button.setAttribute('aria-label', this.settings.sound ? 'Выключить звук' : 'Включить звук');
      button.title = this.settings.sound ? 'Выключить звук (M)' : 'Включить звук (M)';
    });
    document.querySelectorAll('[data-sound-label]').forEach((label) => { label.textContent = label.classList.contains('toggle-button') ? (this.settings.sound ? 'Вкл.' : 'Выкл.') : (this.settings.sound ? 'Звук включён' : 'Звук выключен'); });
    document.querySelectorAll<HTMLButtonElement>('[data-action="shake"]').forEach((button) => button.setAttribute('aria-pressed', String(this.settings.shake)));
    document.querySelectorAll('[data-shake-label]').forEach((label) => { label.textContent = label.classList.contains('toggle-button') ? (this.settings.shake ? 'Вкл.' : 'Выкл.') : (this.settings.shake ? 'Тряска включена' : 'Тряска выключена'); });
    this.saveSettings();
  }
  private toggleSound(): void { this.settings.sound = !this.settings.sound; this.audio.setMuted(!this.settings.sound); if (this.settings.sound) void this.audio.resume(); this.syncSettings(); }

  start(): void {
    if (!this.ready) return;
    void this.audio.init().catch(() => this.announce('Звук недоступен в этом браузере. Игра продолжится без звука.')); this.audio.setPaused(false);
    this.player = { x: this.world.spawn.x, z: this.world.spawn.z };
    this.cameraY = this.world.spawn.y; this.verticalVelocity = 0; this.fallTime = 0; this.landingTime = 0;
    this.yaw = -.06; this.pitch = .48; this.crouch = 0; this.crouchVelocity = 0;
    this.velocityX = 0; this.velocityZ = 0; this.ceilingCracked = false; this.stepDistance = 0; this.bobPhase = 0; this.bobAmount = 0; this.hintTime = 0;
    this.inside = true;
    document.getElementById('location-name')!.textContent = 'СТАРЫЙ ДОМ';
    document.querySelector('.location-index')!.textContent = '01';
    this.controls.setActive(true); this.controls.consumeLook();
    this.setState('falling'); this.audio.fall();
    document.getElementById('impact')!.classList.remove('hit');
    document.getElementById('control-hint')!.classList.remove('faded');
    (document.activeElement as HTMLElement | null)?.blur();
    this.canvas.focus({ preventScroll: true }); this.controls.requestPointerLock();
    this.announce('Ты падаешь с потолка. После приземления можно ходить.');
  }
  private land(): void {
    this.cameraY = EYE_HEIGHT; this.pitch = .1; this.landingTime = 0;
    this.crouch = 0; this.crouchVelocity = this.settings.shake ? -4.4 : -.9;
    this.setState('landing'); this.audio.landing(); this.world.landingDust(this.player.x, this.player.z);
    const impact = document.getElementById('impact')!;
    impact.classList.remove('hit'); void impact.offsetWidth; impact.classList.add('hit');
    if (this.touch && this.settings.shake && 'vibrate' in navigator) navigator.vibrate?.([55, 25, 30]);
  }
  skipIntro(): void {
    if (this.state !== 'falling' && this.state !== 'landing') return;
    this.cameraY = EYE_HEIGHT; this.crouch = 0; this.pitch = .08; this.hintTime = 0;
    this.setState('playing'); this.controls.setActive(true); this.controls.consumeLook();
    this.announce('Ты в старом доме. Дверь на улицу впереди.');
  }
  pause(): void {
    if (this.state === 'paused' || this.state === 'menu' || this.state === 'loading') return;
    this.pausedFrom = this.state; this.lastPause = performance.now();
    this.setState('paused'); this.controls.setActive(false); this.controls.releasePointerLock(); this.audio.setPaused(true);
    document.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus({ preventScroll: true });
  }
  private resume(): void {
    if (this.state !== 'paused') return;
    this.setState(this.pausedFrom); this.controls.setActive(true); this.controls.consumeLook(); this.audio.setPaused(false); void this.audio.resume();
    this.canvas.focus({ preventScroll: true }); this.controls.requestPointerLock();
  }
  private togglePause(): void {
    if (this.state === 'paused') { if (performance.now() - this.lastPause > 250) this.resume(); }
    else this.pause();
  }
  private enableLowPower(): void {
    if (this.lowPower) return;
    this.lowPower = true;
    this.engine.setHardwareScalingLevel(this.touch ? 1.65 : 1.5);
    this.scene.shadowsEnabled = false;
  }
  private tick(): void {
    const rawDt = this.engine.getDeltaTime() / 1000;
    const dt = Math.min(rawDt, .25);
    this.time += dt; this.realTime += rawDt;
    if (!this.lowPower && this.realTime > 4 && this.engine.getFps() < 24) {
      this.slowFramesTime += rawDt;
      if (this.slowFramesTime > 2.5) this.enableLowPower();
    }
    this.world.update(this.time);
    let roll = 0;
    const motion = this.settings.shake ? 1 : 0;
    if (this.state === 'menu' || this.state === 'loading') {
      this.camera.position.copyFrom(this.menuPosition);
      this.camera.position.y += Math.sin(this.time * .4) * .018;
      this.camera.rotation.set(this.menuPitch + Math.sin(this.time * .23) * .008, this.menuYaw + Math.sin(this.time * .15) * .028, 0);
    } else if (this.state === 'falling') {
      this.fallTime += dt;
      if (this.fallTime > .2) { this.verticalVelocity += 8.8 * dt; this.cameraY -= this.verticalVelocity * dt; }
      this.pitch = .48 - Math.min(this.fallTime * .17, .2);
      roll = (Math.sin(this.fallTime * 8) * .026 + this.fallTime * .035) * motion;
      this.camera.position.set(this.player.x + Math.sin(this.fallTime * 19) * .009 * motion, this.cameraY, this.player.z);
      this.camera.rotation.set(this.pitch, this.yaw + Math.sin(this.fallTime * 5) * .025 * motion, roll);
      if (this.cameraY < 4.25 && !this.ceilingCracked) { this.ceilingCracked = true; this.audio.ceilingCrack(); }
      if (this.cameraY <= EYE_HEIGHT) this.land();
    } else if (this.state === 'landing') {
      this.landingTime += dt;
      let springTime = dt;
      while (springTime > 0) {
        const step = Math.min(springTime, 1 / 60);
        this.crouchVelocity += (-95 * this.crouch - 13 * this.crouchVelocity) * step;
        this.crouch = clamp(this.crouch + this.crouchVelocity * step, -.62, .16);
        springTime -= step;
      }
      const shake = Math.exp(-this.landingTime * 3.4) * motion;
      this.cameraY = EYE_HEIGHT + this.crouch;
      this.camera.position.set(this.player.x + Math.sin(this.landingTime * 43) * .035 * shake, this.cameraY, this.player.z + Math.cos(this.landingTime * 37) * .025 * shake);
      this.camera.rotation.set(this.pitch + .1 * shake + Math.sin(this.landingTime * 31) * .03 * shake, this.yaw + Math.sin(this.landingTime * 22) * .014 * shake, Math.sin(this.landingTime * 27) * .075 * shake);
      if (this.landingTime > 1.45) {
        this.setState('playing'); this.hintTime = 0; this.controls.consumeLook(); this.controls.setActive(true);
        this.announce('Управление включено. Выйди через открытую дверь на пустую улицу.');
      }
    } else if (this.state === 'playing') {
      const look = this.controls.consumeLook();
      this.yaw += look.x * .0022; this.pitch = clamp(this.pitch + look.y * .0022, -1.35, 1.35);
      let forward = Number(this.controls.keys.has('KeyW') || this.controls.keys.has('ArrowUp')) - Number(this.controls.keys.has('KeyS') || this.controls.keys.has('ArrowDown')) - this.controls.joystick.y;
      let right = Number(this.controls.keys.has('KeyD') || this.controls.keys.has('ArrowRight')) - Number(this.controls.keys.has('KeyA') || this.controls.keys.has('ArrowLeft')) + this.controls.joystick.x;
      const magnitude = Math.hypot(forward, right);
      if (magnitude > 1) { forward /= magnitude; right /= magnitude; }
      if (magnitude < .1) { forward = 0; right = 0; }
      const speed = this.controls.keys.has('ShiftLeft') || this.controls.keys.has('ShiftRight') ? 4.1 : 2.65;
      this.velocityX = damp(this.velocityX, right * speed, 13, dt);
      this.velocityZ = damp(this.velocityZ, forward * speed, 13, dt);
      const deltaX = (Math.sin(this.yaw) * this.velocityZ + Math.cos(this.yaw) * this.velocityX) * dt;
      const deltaZ = (Math.cos(this.yaw) * this.velocityZ - Math.sin(this.yaw) * this.velocityX) * dt;
      const next = moveWithCollisions(this.player, { x: deltaX, z: deltaZ }, PLAYER_RADIUS, this.world.colliders, this.world.bounds);
      const travelled = Math.hypot(next.x - this.player.x, next.z - this.player.z);
      this.player = next;
      this.stepDistance += travelled; this.bobPhase += travelled * 8.5;
      this.bobAmount = damp(this.bobAmount, travelled > .001 ? 1 : 0, 9, dt);
      if (this.stepDistance > .78) { this.stepDistance %= .78; this.stepAlternate = !this.stepAlternate; this.audio.footstep(this.inside, this.stepAlternate); }
      this.cameraY = damp(this.cameraY, EYE_HEIGHT, 14, dt);
      this.camera.position.set(this.player.x, this.cameraY + Math.sin(this.bobPhase) * .027 * this.bobAmount * motion, this.player.z);
      roll = Math.sin(this.bobPhase * .5) * .006 * this.bobAmount * motion;
      this.camera.rotation.set(this.pitch, this.yaw, roll);
      this.hintTime += dt;
      if (this.hintTime > 10) document.getElementById('control-hint')!.classList.add('faded');
      const inside = isInsideHouse(this.player);
      if (inside !== this.inside) {
        this.inside = inside;
        document.getElementById('location-name')!.textContent = inside ? 'СТАРЫЙ ДОМ' : 'ПУСТАЯ УЛИЦА';
        document.querySelector('.location-index')!.textContent = inside ? '01' : '02';
      }
    }
    if (this.state !== 'paused') this.audio.update(this.time, this.inside);
    this.scene.render();
  }
  snapshot(): GameSnapshot {
    return { state: this.state, ready: this.ready, position: { x: this.player.x, y: this.cameraY, z: this.player.z }, yaw: this.yaw, pitch: this.pitch, inside: this.inside, colliders: this.world.colliders.length, meshes: this.scene.meshes.length, fps: Math.round(this.engine.getFps()), audio: this.audio.state, touch: this.touch };
  }
  dispose(): void { this.engine.stopRenderLoop(); this.controls.dispose(); this.scene.dispose(); this.engine.dispose(); }
}
