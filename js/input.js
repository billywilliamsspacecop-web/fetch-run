import { CONFIG } from './config.js';

// Gameplay gestures only — menu/death screens are DOM overlays with their own handlers.
// Two schemes, A/B testable from the start screen:
//   'tap'   — screen is 5 invisible columns; tap a column, dog goes to that lane
//   'swipe' — swipe left/right moves the dog exactly one lane
export class Input {
  constructor() {
    this.scheme = localStorage.getItem('fetchrun.scheme') || 'tap';
    this.onLaneRequest = null; // (targetLane) => void
    this.onLaneShift = null;   // (-1 | +1) => void
    this.onAction = null;      // keyboard start/restart

    this._touchStart = null;

    window.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('keydown', (e) => this._key(e));
  }

  setScheme(scheme) {
    this.scheme = scheme;
    localStorage.setItem('fetchrun.scheme', scheme);
  }

  _down(e) {
    this._touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  // Outer zones are widest: thumb taps near the screen edge register with the
  // touch centroid pulled inward, so uniform fifths made lanes 0/4 hard to hit.
  static ZONE_WIDTHS = [0.23, 0.185, 0.17, 0.185, 0.23];

  _laneFromX(x) {
    const f = x / window.innerWidth;
    let acc = 0;
    for (let i = 0; i < CONFIG.lanes; i++) {
      acc += Input.ZONE_WIDTHS[i];
      if (f < acc) return i;
    }
    return CONFIG.lanes - 1;
  }

  _up(e) {
    if (!this._touchStart) return;
    const dx = e.clientX - this._touchStart.x;
    const dt = performance.now() - this._touchStart.t;
    const start = this._touchStart;
    this._touchStart = null;

    if (this.scheme === 'swipe') {
      if (Math.abs(dx) >= CONFIG.swipeMinDistance && dt <= CONFIG.swipeMaxTime) {
        this.onLaneShift?.(dx > 0 ? 1 : -1);
      }
      return;
    }

    // Tap mode: any release that didn't travel far is a tap — a smudged tap
    // with a bit of drift used to be classified as a swipe and dropped.
    if (Math.abs(dx) < 40) {
      this.onLaneRequest?.(this._laneFromX(start.x));
    }
  }

  _key(e) {
    if (e.key === 'ArrowLeft') this.onLaneShift?.(-1);
    else if (e.key === 'ArrowRight') this.onLaneShift?.(1);
    else if (e.key >= '1' && e.key <= String(CONFIG.lanes)) {
      this.onLaneRequest?.(Number(e.key) - 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      this.onAction?.();
    }
  }
}
