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

  _up(e) {
    if (!this._touchStart) return;
    const dx = e.clientX - this._touchStart.x;
    const dt = performance.now() - this._touchStart.t;
    const start = this._touchStart;
    this._touchStart = null;

    const isSwipe =
      Math.abs(dx) >= CONFIG.swipeMinDistance && dt <= CONFIG.swipeMaxTime;

    if (this.scheme === 'swipe') {
      if (isSwipe) this.onLaneShift?.(dx > 0 ? 1 : -1);
      return;
    }

    if (!isSwipe) {
      const lane = Math.floor((start.x / window.innerWidth) * CONFIG.lanes);
      this.onLaneRequest?.(Math.max(0, Math.min(CONFIG.lanes - 1, lane)));
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
