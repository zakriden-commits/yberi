export class Controls {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.yaw = 0; this.pitch = 0; this.moveX = 0; this.moveZ = 0; this.sprint = false; this.fire = false; this.useHeld = false; this.usePressed = false; this.reloadPressed = false; this.touch = matchMedia('(pointer:coarse)').matches;
    document.body.classList.toggle('is-touch', this.touch);
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'KeyE') { this.useHeld = true; this.usePressed = true; } if (e.code === 'KeyR') this.reloadPressed = true; if (e.code === 'ShiftLeft') this.sprint = true; });
    addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'KeyE') this.useHeld = false; if (e.code === 'ShiftLeft') this.sprint = false; });
    canvas.addEventListener('click', () => { if (!this.touch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
    addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { this.yaw += e.movementX * .0022; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + e.movementY * .0022)); } });
    addEventListener('mousedown', e => { if (document.pointerLockElement === canvas && e.button === 0) this.fire = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; });
    const stick = document.getElementById('stick'), knob = stick.querySelector('i'); let sid = null, sx = 0, sy = 0;
    stick.addEventListener('pointerdown', e => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; stick.setPointerCapture(sid); });
    stick.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy), max = 45; if (d > max) { dx *= max / d; dy *= max / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; this.moveX = dx / max; this.moveZ = -dy / max; });
    const end = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; this.moveX = 0; this.moveZ = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    let lid = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', e => { if (!this.touch || e.clientX < innerWidth * .45) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(lid); });
    canvas.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; this.yaw += (e.clientX - lx) * .004; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - ly) * .004)); lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('pointerup', e => { if (e.pointerId === lid) lid = null; });
    const bind = (id, down, up) => { const el = document.getElementById(id); el.addEventListener('pointerdown', e => { e.preventDefault(); down(); }); el.addEventListener('pointerup', e => { e.preventDefault(); up?.(); }); el.addEventListener('pointercancel', () => up?.()); };
    bind('btnFire', () => this.fire = true, () => this.fire = false);
    bind('btnUse', () => { this.useHeld = true; this.usePressed = true; }, () => this.useHeld = false);
    bind('btnReload', () => this.reloadPressed = true);
    bind('btnSprint', () => this.sprint = !this.sprint);
  }
  move() {
    let x = this.moveX, z = this.moveZ;
    if (this.keys.has('KeyW')) z += 1; if (this.keys.has('KeyS')) z -= 1;
    if (this.keys.has('KeyA')) x -= 1; if (this.keys.has('KeyD')) x += 1;
    const d = Math.hypot(x, z); if (d > 1) { x /= d; z /= d; }
    return { x, z };
  }
  consumeUse() { const v = this.usePressed; this.usePressed = false; return v; }
  consumeReload() { const v = this.reloadPressed; this.reloadPressed = false; return v; }
}
