export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.drone = null;
    this.lfo = null;
  }

  init() {
    if (this.ctx) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.drone = this.ctx.createOscillator();
    this.drone.type = 'sawtooth';
    this.drone.frequency.value = 42;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.35;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 320;

    this.drone.connect(this.filter);
    this.filter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    this.drone.start();

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5.2;

    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 7;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.drone.frequency);
    this.lfo.start();

    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** tension: 0 (far) → 1 (on top of you) */
  setTension(t) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.05 + t * 0.24, now, 0.25);
    this.drone.frequency.setTargetAtTime(38 + t * 110, now, 0.35);
    this.filter.frequency.setTargetAtTime(280 + t * 1500, now, 0.35);
  }

  silence() {
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  scare() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;

    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.75);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 1.0);

    // noise burst
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.35;
    src.connect(ng).connect(this.ctx.destination);
    src.start(t);
  }
}
