/** All sound is synthesised locally. No downloads, autoplay, or copyrighted samples. */
export class AtmosphereAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private volume = .65;
  private paused = false;
  private nextCreak = 8;

  get state(): string { return this.context?.state ?? 'not-started'; }

  async init(): Promise<void> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * .7;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 4;
      this.master.connect(compressor); compressor.connect(context.destination);
      this.noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .035) / 1.018; samples[i] = brown * 3.2; }
      const wind = context.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
      this.windFilter = context.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 420;
      this.windGain = context.createGain(); this.windGain.gain.value = .06;
      wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); wind.start();
      this.nextCreak = context.currentTime + 9;
    }
    await this.resume();
  }
  async resume(): Promise<void> { if (this.context?.state === 'suspended') await this.context.resume().catch(() => undefined); }
  setMuted(muted: boolean): void { this.muted = muted; this.applyVolume(); }
  setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); this.applyVolume(); }
  setPaused(paused: boolean): void { this.paused = paused; this.applyVolume(); }
  private applyVolume(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * (this.paused ? .16 : .7), this.context.currentTime, .08);
  }
  private envelope(source: AudioScheduledSourceNode, start: number, duration: number, peak: number, attack = .008): GainNode {
    const context = this.context!;
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(gain); gain.connect(this.master!);
    source.start(start); source.stop(start + duration + .03);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return gain;
  }
  private noiseBurst(start: number, duration: number, peak: number, frequency: number, type: BiquadFilterType = 'lowpass'): void {
    if (!this.context || !this.noise) return;
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    const filter = this.context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .7;
    const gain = this.envelope(source, start, duration, peak);
    source.disconnect(); source.connect(filter); filter.connect(gain);
    source.addEventListener('ended', () => filter.disconnect());
  }
  private tone(start: number, duration: number, from: number, to: number, peak: number, type: OscillatorType = 'sine'): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator(); oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start); oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    this.envelope(oscillator, start, duration, peak);
  }
  fall(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = .5;
    filter.frequency.setValueAtTime(280, now); filter.frequency.exponentialRampToValueAtTime(1600, now + .95); filter.frequency.exponentialRampToValueAtTime(220, now + 1.5);
    const gain = this.context.createGain(); gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(.3, now + .9); gain.gain.exponentialRampToValueAtTime(.001, now + 1.5);
    source.connect(filter); filter.connect(gain); gain.connect(this.master!); source.start(now); source.stop(now + 1.55);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    this.creak(.7);
  }
  ceilingCrack(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.noiseBurst(now, .17, .5, 1300, 'highpass');
    this.tone(now, .22, 190, 58, .16, 'triangle');
    this.noiseBurst(now + .08, .12, .25, 800, 'bandpass');
  }
  landing(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.tone(now, .7, 76, 28, .65);
    this.tone(now + .015, .32, 135, 48, .17, 'triangle');
    this.noiseBurst(now, .42, .8, 330);
    this.noiseBurst(now + .015, .13, .45, 1800, 'highpass');
    for (const [delay, pitch] of [[.07, 210], [.15, 160], [.27, 260], [.41, 120]]) {
      this.noiseBurst(now + delay, .08, .16, 1100, 'bandpass');
      this.tone(now + delay, .12, pitch, pitch * .45, .07, 'triangle');
    }
    this.nextCreak = now + 8;
  }
  footstep(inside: boolean, alternate: boolean): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (inside) {
      this.noiseBurst(now, .12, .23, alternate ? 630 : 780);
      this.tone(now, .1, alternate ? 92 : 80, 42, .12);
      if (alternate) this.tone(now + .035, .16, 175, 125, .018, 'triangle');
    } else {
      this.noiseBurst(now, .16, .24, 1450, 'highpass');
      this.tone(now, .075, 105, 50, .07);
    }
  }
  creak(strength = 1): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator(); oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(95, now); oscillator.frequency.linearRampToValueAtTime(132, now + .3); oscillator.frequency.exponentialRampToValueAtTime(62, now + 1.15);
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = 5;
    const gain = this.envelope(oscillator, now, 1.25, .055 * strength, .15);
    oscillator.disconnect(); oscillator.connect(filter); filter.connect(gain);
    oscillator.addEventListener('ended', () => filter.disconnect());
  }
  update(time: number, inside: boolean): void {
    if (!this.context || !this.windGain || !this.windFilter) return;
    const now = this.context.currentTime;
    this.windGain.gain.setTargetAtTime((inside ? .055 : .15) + Math.sin(time * .37) * .014, now, .8);
    this.windFilter.frequency.setTargetAtTime(inside ? 360 : 850, now, .8);
    if (now > this.nextCreak && !this.paused) { this.creak(.6); this.nextCreak = now + 10 + Math.random() * 8; }
  }
}
