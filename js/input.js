import { CONFIG } from './config.js';

// Swipe-only: one lane per swipe. Tap-to-lane was removed deliberately —
// it let you teleport across the board instantly, which played like a cheat
// code and trivialised dodging. Swiping keeps movement deliberate.
export class Input {
  constructor() {
    this.onLaneShift = null; // (-1 | +1) => void
    this.onAction = null;    // keyboard start/restart

    this._touchStart = null;

    window.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('keydown', (e) => this._key(e));
  }

  _down(e) {
    this._touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  _up(e) {
    if (!this._touchStart) return;
    const dx = e.clientX - this._touchStart.x;
    const dt = performance.now() - this._touchStart.t;
    this._touchStart = null;

    if (Math.abs(dx) >= CONFIG.swipeMinDistance && dt <= CONFIG.swipeMaxTime) {
      this.onLaneShift?.(dx > 0 ? 1 : -1);
    }
  }

  _key(e) {
    if (e.key === 'ArrowLeft') this.onLaneShift?.(-1);
    else if (e.key === 'ArrowRight') this.onLaneShift?.(1);
    else if (e.key === ' ' || e.key === 'Enter') this.onAction?.();
  }
}
