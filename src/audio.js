export class AudioBus {
  constructor() { this.ctx = null; this.master = null; this.volume = .6; this.ambience = null; }
  init() { if (this.ctx) return; this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); const a = new Audio('/assets/kenney/sounds/ambience.ogg'); a.loop = true; a.volume = .12 * this.volume; a.play().catch(() => {}); this.ambience = a; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; if (this.ambience) this.ambience.volume = .12 * v; }
  tone(freq, dur, type = 'sine', gain = .2, slide = 0) { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur); }
  noise(dur, gain = .2, filter = 1200) { if (!this.ctx) return; const t = this.ctx.currentTime; const n = this.ctx.sampleRate * dur; const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = this.ctx.createBufferSource(); s.buffer = buf; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; const g = this.ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(t); }
  shot(type) { this.noise(type === 'rifle' ? .18 : .12, type === 'rifle' ? .5 : .35, type === 'rifle' ? 900 : 1600); this.tone(type === 'rifle' ? 90 : 140, .12, 'sawtooth', .25, -60); }
  reload() { this.tone(300, .08, 'square', .12); setTimeout(() => this.tone(450, .08, 'square', .12), 180); setTimeout(() => this.tone(600, .06, 'square', .1), 380); }
  hit() { this.tone(120, .12, 'sawtooth', .2, -40); }
  pickup() { this.tone(600, .08, 'sine', .15); setTimeout(() => this.tone(900, .1, 'sine', .12), 70); }
  buy() { this.tone(800, .06, 'sine', .15); setTimeout(() => this.tone(1200, .1, 'sine', .12), 60); }
  alarm() { this.tone(700, .3, 'square', .12, 300); setTimeout(() => this.tone(500, .3, 'square', .12, -200), 300); }
  door() { this.noise(.15, .15, 500); }
  footstep() { this.noise(.05, .06, 400); }
}
