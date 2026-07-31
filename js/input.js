import { CONFIG } from './config.js';

// Two control schemes, A/B testable from the start screen:
//   'tap'   — screen is 5 invisible columns; tap a column, dog goes to that lane
//   'swipe' — swipe left/right moves the dog exactly one lane
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.scheme = localStorage.getItem('fetchrun.scheme') || 'tap';
    this.onLaneRequest = null; // (targetLane) => void, absolute lane index
    this.onLaneShift = null;   // (-1 | +1) => void, relative move
    this.onTap = null;         // generic tap (menus, restart)

    this._touchStart = null;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));

    // Keyboard fallback for desktop testing
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

    if (this.scheme === 'swipe' && isSwipe) {
      this.onLaneShift?.(dx > 0 ? 1 : -1);
      return;
    }

    if (!isSwipe) {
      // A tap. In tap-zone mode it targets a lane; it also drives menus.
      this.onTap?.(start.x, start.y);
      if (this.scheme === 'tap') {
        const lane = Math.floor((start.x / this.canvas.clientWidth) * CONFIG.lanes);
        this.onLaneRequest?.(Math.max(0, Math.min(CONFIG.lanes - 1, lane)));
      }
    }
  }

  _key(e) {
    if (e.key === 'ArrowLeft') this.onLaneShift?.(-1);
    else if (e.key === 'ArrowRight') this.onLaneShift?.(1);
    else if (e.key >= '1' && e.key <= String(CONFIG.lanes)) {
      this.onLaneRequest?.(Number(e.key) - 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      this.onTap?.(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    }
  }
}
