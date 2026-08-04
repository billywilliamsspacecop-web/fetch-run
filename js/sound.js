// Lighthearted SFX, synthesized with Web Audio — no asset files to load or
// host, nothing to keep in sync, and every sound is a few lines you can tune
// by ear. If you'd rather drop in recorded samples later, swap the bodies of
// these methods for buffer playback; the call sites won't change.
//
// iOS requires audio to start from a user gesture, so the context stays
// suspended until the first tap (see unlock()).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Sound {
  constructor() {
    this.enabled = localStorage.getItem('fetchrun.muted') !== '1';
    this.ctx = null;
    this.master = null;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }

  // Call from a real user gesture (first tap) — iOS won't play otherwise
  unlock() {
    this._ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('fetchrun.muted', on ? '0' : '1');
  }

  toggle() {
    this.setEnabled(!this.enabled);
    if (this.enabled) this.blip(660, 0.08, 'triangle', 0.5);
    return this.enabled;
  }

  get _t() {
    return this.ctx.currentTime;
  }

  // One shaped tone. Everything else is built from this.
  tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.5, delay = 0, attack = 0.008 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t0 = this._t + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 1), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Filtered noise burst — thuds, crashes, dust
  noise({ dur = 0.2, gain = 0.4, type = 'lowpass', freq = 900, delay = 0 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t0 = this._t + delay;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames); // decaying
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  blip(freq, dur, type, gain) {
    this.tone({ freq, dur, type, gain });
  }

  // --- game events -------------------------------------------------------

  // Collectible: bright rising pip. Pitch climbs with a collect streak so
  // grabbing a line of them plays an ascending run.
  collect(streak = 0) {
    const step = Math.min(streak, 7);
    const base = 620 * Math.pow(1.06, step);
    this.tone({ freq: base, to: base * 1.5, dur: 0.11, type: 'triangle', gain: 0.42 });
  }

  // Powerup: chunky two-note fanfare
  powerup() {
    this.tone({ freq: 420, to: 640, dur: 0.13, type: 'square', gain: 0.3 });
    this.tone({ freq: 640, to: 960, dur: 0.18, type: 'square', gain: 0.26, delay: 0.1 });
    this.tone({ freq: 1280, dur: 0.16, type: 'triangle', gain: 0.18, delay: 0.18 });
  }

  // Extra life (steak) — warmer, more triumphant
  extraLife() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.3, delay: i * 0.075 })
    );
  }

  // Wipeout: comedic descending honk + thud
  wipeout() {
    this.tone({ freq: 380, to: 90, dur: 0.42, type: 'sawtooth', gain: 0.32 });
    this.noise({ dur: 0.34, gain: 0.5, freq: 520 });
  }

  // Saved by the steak — a "phew" bounce rather than a crash
  save() {
    this.tone({ freq: 300, to: 720, dur: 0.22, type: 'triangle', gain: 0.34 });
  }

  // Smashing out through the patio glass — a bright crack, then tinkling
  // shards raining down after it.
  glassSmash() {
    this.noise({ dur: 0.5, gain: 0.45, type: 'highpass', freq: 2400 });
    [2200, 3000, 1750, 2600, 3400].forEach((f, i) =>
      this.tone({ freq: f, to: f * 0.55, dur: 0.16, type: 'triangle', gain: 0.14, delay: 0.03 + i * 0.055 })
    );
  }

  // Checkpoint / new stage
  checkpoint() {
    [660, 880].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.28, delay: i * 0.09 })
    );
  }

  // Entering a brand-new themed world — bigger than a plain checkpoint
  newTheme() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.26, delay: i * 0.08 })
    );
  }

  // Rare stage sting — otherworldly
  rareStage() {
    [392, 587, 784, 1175].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.6, type: 'sine', gain: 0.3, delay: i * 0.12 })
    );
    this.tone({ freq: 1568, dur: 0.9, type: 'sine', gain: 0.14, delay: 0.5 });
  }

  // Soft paw thump, pitch-varied so a run doesn't sound like a metronome
  step() {
    this.noise({ dur: 0.06, gain: 0.1, freq: 260 + Math.random() * 120 });
  }

  lane() {
    this.tone({ freq: 300 + Math.random() * 60, to: 460, dur: 0.06, type: 'sine', gain: 0.12 });
  }

  uiTap() {
    this.tone({ freq: 520, to: 700, dur: 0.07, type: 'triangle', gain: 0.2 });
  }
}
