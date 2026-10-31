import { clamp } from './physics';

interface ControlCallbacks {
  onPause: () => void;
  onRestart: () => void;
  onMute: () => void;
  onSkip: () => void;
  onLockLost: () => void;
  onBlur: () => void;
}

export class Controls {
  readonly keys = new Set<string>();
  readonly joystick = { x: 0, y: 0 };
  private lookX = 0;
  private lookY = 0;
  private active = false;
  private hadLock = false;
  private dragging = false;
  private lookPointer: number | null = null;
  private movePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private centerX = 0;
  private centerY = 0;
  private readonly moveZone = document.getElementById('move-zone')!;
  private readonly joystickElement = document.getElementById('joystick')!;
  private readonly knob = document.getElementById('joystick-knob')!;
  private readonly abort = new AbortController();

  constructor(private canvas: HTMLCanvasElement, readonly touch: boolean, private callbacks: ControlCallbacks) {
    const signal = this.abort.signal;
    document.addEventListener('keydown', this.onKeyDown, { signal });
    document.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal });
    document.addEventListener('mousemove', this.onMouseMove, { signal });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) { this.hadLock = true; document.body.classList.remove('drag-look'); }
      else {
        const wasLocked = this.hadLock; this.hadLock = false;
        if (wasLocked && this.active) this.callbacks.onLockLost();
      }
    }, { signal });
    document.addEventListener('pointerlockerror', () => this.enableDragLook(), { signal });
    canvas.addEventListener('pointerdown', this.onCanvasDown, { signal });
    canvas.addEventListener('pointermove', this.onCanvasMove, { signal });
    canvas.addEventListener('pointerup', this.onCanvasUp, { signal });
    canvas.addEventListener('pointercancel', this.onCanvasUp, { signal });
    canvas.addEventListener('lostpointercapture', () => { this.lookPointer = null; this.dragging = false; }, { signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    this.moveZone.addEventListener('pointerdown', this.onJoystickDown, { signal });
    this.moveZone.addEventListener('pointermove', this.onJoystickMove, { signal });
    this.moveZone.addEventListener('pointerup', this.onJoystickUp, { signal });
    this.moveZone.addEventListener('pointercancel', this.onJoystickUp, { signal });
    this.moveZone.addEventListener('lostpointercapture', () => this.resetJoystick(), { signal });
    window.addEventListener('blur', () => { this.reset(); this.callbacks.onBlur(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.reset(); this.callbacks.onBlur(); } }, { signal });
  }
  get pointerLocked(): boolean { return document.pointerLockElement === this.canvas; }
  setActive(active: boolean): void { this.active = active; if (!active) this.reset(); }
  consumeLook(): { x: number; y: number } { const look = { x: this.lookX, y: this.lookY }; this.lookX = 0; this.lookY = 0; return look; }
  requestPointerLock(): void {
    if (this.touch || this.pointerLocked) return;
    if (!this.canvas.requestPointerLock) { this.enableDragLook(); return; }
    try {
      const result = this.canvas.requestPointerLock() as Promise<void> | undefined;
      result?.catch(() => this.enableDragLook());
    } catch { this.enableDragLook(); }
  }
  releasePointerLock(): void { if (this.pointerLocked) document.exitPointerLock(); }
  private enableDragLook(): void { document.body.classList.add('drag-look'); }
  private reset(): void {
    this.keys.clear(); this.lookX = 0; this.lookY = 0; this.dragging = false; this.lookPointer = null; this.resetJoystick();
  }
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && this.active) event.preventDefault();
    if (event.repeat) { if (this.active) this.keys.add(event.code); return; }
    if (event.code === 'Escape' || event.code === 'KeyP') { this.callbacks.onPause(); return; }
    if (event.code === 'KeyM') { this.callbacks.onMute(); return; }
    if (event.code === 'KeyR' && this.active) { this.callbacks.onRestart(); return; }
    if (event.code === 'Space' && this.active) this.callbacks.onSkip();
    if (this.active) this.keys.add(event.code);
  };
  private onMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.touch || (!this.pointerLocked && !this.dragging)) return;
    this.lookX += event.movementX; this.lookY += event.movementY;
  };
  private onCanvasDown = (event: PointerEvent): void => {
    if (!this.active) return;
    if (event.pointerType === 'touch') {
      if (this.lookPointer !== null || event.clientX < window.innerWidth * .4) return;
      this.lookPointer = event.pointerId; this.lastX = event.clientX; this.lastY = event.clientY;
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic events may not own a pointer. */ }
    } else if (!this.pointerLocked) {
      this.dragging = true; this.requestPointerLock();
    }
  };
  private onCanvasMove = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.lookPointer) return;
    this.lookX += (event.clientX - this.lastX) * 1.65; this.lookY += (event.clientY - this.lastY) * 1.65;
    this.lastX = event.clientX; this.lastY = event.clientY;
  };
  private onCanvasUp = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointer) this.lookPointer = null;
    if (event.pointerType !== 'touch') this.dragging = false;
  };
  private onJoystickDown = (event: PointerEvent): void => {
    if (!this.active || !this.touch || this.movePointer !== null) return;
    event.preventDefault(); this.movePointer = event.pointerId;
    this.centerX = event.clientX; this.centerY = event.clientY;
    const size = this.joystickElement.offsetWidth;
    this.joystickElement.style.left = `${this.centerX - size / 2}px`;
    this.joystickElement.style.top = `${this.centerY - size / 2}px`;
    this.joystickElement.style.bottom = 'auto';
    this.joystickElement.classList.add('active'); this.moveZone.classList.add('active');
    try { this.moveZone.setPointerCapture(event.pointerId); } catch { /* Keep controls usable without capture. */ }
    this.updateJoystick(event.clientX, event.clientY);
  };
  private onJoystickMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault(); this.updateJoystick(event.clientX, event.clientY);
  };
  private updateJoystick(x: number, y: number): void {
    const radius = this.joystickElement.offsetWidth * .39;
    let dx = x - this.centerX, dy = y - this.centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) { dx *= radius / distance; dy *= radius / distance; }
    this.joystick.x = clamp(dx / radius, -1, 1); this.joystick.y = clamp(dy / radius, -1, 1);
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  private onJoystickUp = (event: PointerEvent): void => { if (event.pointerId === this.movePointer) this.resetJoystick(); };
  private resetJoystick(): void {
    this.movePointer = null; this.joystick.x = 0; this.joystick.y = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.joystickElement.style.left = ''; this.joystickElement.style.top = ''; this.joystickElement.style.bottom = '';
    this.joystickElement.classList.remove('active'); this.moveZone.classList.remove('active');
  }
  dispose(): void { this.abort.abort(); this.releasePointerLock(); }
}
