import { CONFIG } from './config.js';

// Game states: 'menu' -> 'running' -> 'dead' -> 'running' ...
export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.best = Number(localStorage.getItem('fetchrun.best') || 0);

    this.state = 'menu';
    this._resize();
    window.addEventListener('resize', () => this._resize());

    input.onLaneRequest = (lane) => this._moveTo(lane);
    input.onLaneShift = (dir) => this._moveTo(this.targetLane + dir);
    input.onTap = (x, y) => this._menuTap(x, y);

    this._reset();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.laneW = this.w / CONFIG.lanes;
  }

  _reset() {
    this.time = 0;
    this.distance = 0;
    this.speed = CONFIG.baseSpeed;
    this.lane = 2;           // current visual position (float, for tweening)
    this.targetLane = 2;
    this.obstacles = [];     // {lane, y} — y in fractions of canvas height, 0=top
    this.spawnTimer = 1.5;   // small grace period at run start
    this.nearMisses = 0;
    this.deathTimer = 0;
    this.groundOffset = 0;
  }

  // ---- input ----------------------------------------------------------

  _moveTo(lane) {
    if (this.state !== 'running') return;
    this.targetLane = Math.max(0, Math.min(CONFIG.lanes - 1, lane));
  }

  _menuTap(x, y) {
    if (this.state === 'menu') {
      // Control-scheme toggle buttons live in the lower third of the menu.
      const btn = this._menuButtons();
      if (y > btn.y && y < btn.y + btn.h) {
        this.input.setScheme(x < this.w / 2 ? 'tap' : 'swipe');
        return;
      }
      this._reset();
      this.state = 'running';
    } else if (this.state === 'dead' && this.deathTimer >= CONFIG.deathPauseBeforeInput) {
      this._reset();
      this.state = 'running';
    }
  }

  _menuButtons() {
    return { y: this.h * 0.62, h: 64 };
  }

  // ---- update ---------------------------------------------------------

  update(dt) {
    if (this.state === 'running') this._updateRun(dt);
    if (this.state === 'dead') this.deathTimer += dt;
  }

  _updateRun(dt) {
    this.time += dt;

    // Chill opening, then linear ramp.
    const ramp = Math.max(0, this.time - CONFIG.chillDuration);
    this.speed = Math.min(CONFIG.maxSpeed, CONFIG.baseSpeed + ramp * CONFIG.rampPerSecond);
    this.distance += this.speed * dt * 100; // 100 "meters" per canvas-height
    this.groundOffset = (this.groundOffset + this.speed * dt) % 0.12;

    // Tween the dog toward its target lane.
    const diff = this.targetLane - this.lane;
    const maxStep = dt / CONFIG.laneChangeTime;
    this.lane += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;

    // Spawn obstacles.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn();
      const t = (this.speed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed);
      this.spawnTimer =
        CONFIG.spawnBaseInterval - t * (CONFIG.spawnBaseInterval - CONFIG.spawnMinInterval);
    }

    // Move obstacles down; detect hits and near-misses.
    const dogY = CONFIG.dogY;
    for (const ob of this.obstacles) {
      const prevY = ob.y;
      ob.y += this.speed * dt;

      const crossedDog = prevY < dogY && ob.y >= dogY;
      if (crossedDog) {
        const laneDist = Math.abs(ob.lane - this.lane);
        if (laneDist < CONFIG.hitboxForgiveness) {
          this._die();
          return;
        }
        if (laneDist < 1 + CONFIG.nearMissWindow * CONFIG.lanes) {
          this.nearMisses++;
        }
      }
    }
    this.obstacles = this.obstacles.filter((ob) => ob.y < 1.2);
  }

  _spawn() {
    const lanes = [...Array(CONFIG.lanes).keys()];
    const first = lanes[Math.floor(Math.random() * lanes.length)];
    this.obstacles.push({ lane: first, y: -0.1 });

    if (Math.random() < CONFIG.doubleSpawnChance) {
      const rest = lanes.filter((l) => l !== first);
      const second = rest[Math.floor(Math.random() * rest.length)];
      this.obstacles.push({ lane: second, y: -0.1 });
    }
  }

  _die() {
    this.state = 'dead';
    this.deathTimer = 0;
    if (this.distance > this.best) {
      this.best = Math.floor(this.distance);
      localStorage.setItem('fetchrun.best', String(this.best));
    }
  }

  // ---- render ---------------------------------------------------------

  render() {
    const { ctx, w, h } = this;

    // Grass background, slightly darker as speed rises (zen -> intense)
    const t = (this.speed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed);
    ctx.fillStyle = `hsl(${110 - t * 25}, 45%, ${38 - t * 10}%)`;
    ctx.fillRect(0, 0, w, h);

    this._drawLanes();
    for (const ob of this.obstacles) this._drawGnome(ob);
    if (this.state !== 'menu') this._drawDog();

    if (this.state === 'menu') this._drawMenu();
    else if (this.state === 'running') this._drawHUD();
    else if (this.state === 'dead') this._drawStats();
  }

  _drawLanes() {
    const { ctx, w, h } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    for (let i = 1; i < CONFIG.lanes; i++) {
      ctx.beginPath();
      ctx.moveTo(i * this.laneW, 0);
      ctx.lineTo(i * this.laneW, h);
      ctx.stroke();
    }
    // Scrolling dashes down each lane center for a sense of speed
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < CONFIG.lanes; i++) {
      const x = (i + 0.5) * this.laneW;
      for (let y = -0.12 + this.groundOffset; y < 1; y += 0.12) {
        ctx.fillRect(x - 3, y * h, 6, h * 0.045);
      }
    }
  }

  _laneX(lane) {
    return (lane + 0.5) * this.laneW;
  }

  _drawDog() {
    const { ctx, h } = this;
    const x = this._laneX(this.lane);
    const y = CONFIG.dogY * h;
    const s = Math.min(this.laneW, h * 0.09) * 0.42; // half-size of body

    // Placeholder "The dog": brown rounded body, ears, snout. Real sprites in Week 2.
    ctx.save();
    ctx.translate(x, y);
    if (this.state === 'dead') ctx.rotate(0.5);

    ctx.fillStyle = '#6b4a2f';
    ctx.beginPath();
    ctx.roundRect(-s, -s * 1.4, s * 2, s * 2.8, s * 0.8);
    ctx.fill();

    // Ears (GSP floppy)
    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.ellipse(-s * 0.75, -s * 1.1, s * 0.38, s * 0.75, -0.35, 0, Math.PI * 2);
    ctx.ellipse(s * 0.75, -s * 1.1, s * 0.38, s * 0.75, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.arc(0, -s * 1.45, s * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Tail wag while running
    if (this.state === 'running') {
      const wag = Math.sin(this.time * 18) * s * 0.5;
      ctx.strokeStyle = '#6b4a2f';
      ctx.lineWidth = s * 0.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, s * 1.35);
      ctx.quadraticCurveTo(wag, s * 1.9, wag * 1.4, s * 2.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawGnome(ob) {
    const { ctx, h } = this;
    const x = this._laneX(ob.lane);
    const y = ob.y * h;
    const s = Math.min(this.laneW, h * 0.09) * 0.38;

    ctx.save();
    ctx.translate(x, y);
    // Body
    ctx.fillStyle = '#3b6ea5';
    ctx.beginPath();
    ctx.roundRect(-s * 0.8, -s * 0.3, s * 1.6, s * 1.5, s * 0.3);
    ctx.fill();
    // Beard
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.55, 0, Math.PI);
    ctx.fill();
    // Red pointy hat
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.5);
    ctx.lineTo(s * 0.6, -s * 0.5);
    ctx.lineTo(0, -s * 1.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- UI screens -----------------------------------------------------

  _text(str, x, y, size, color = '#fff', align = 'center', weight = 700) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  _drawMenu() {
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, h);

    this._text('FETCH RUN', w / 2, h * 0.3, Math.min(w * 0.13, 64));
    this._text('(working title)', w / 2, h * 0.34, 14, 'rgba(255,255,255,0.6)');
    if (this.best > 0) this._text(`Best: ${this.best}m`, w / 2, h * 0.42, 20, '#ffd54f');
    this._text('Tap anywhere to run', w / 2, h * 0.52, 18);

    // Control scheme toggle
    const btn = this._menuButtons();
    this._text('CONTROLS', w / 2, btn.y - 14, 13, 'rgba(255,255,255,0.6)');
    const schemes = [
      { key: 'tap', label: 'TAP ZONES', x: w * 0.25 },
      { key: 'swipe', label: 'SWIPE', x: w * 0.75 },
    ];
    for (const s of schemes) {
      const active = this.input.scheme === s.key;
      ctx.fillStyle = active ? '#ffd54f' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.roundRect(s.x - w * 0.2, btn.y, w * 0.4, btn.h, 12);
      ctx.fill();
      this._text(s.label, s.x, btn.y + btn.h / 2 + 6, 16, active ? '#1a1a1a' : '#fff');
    }
    const hint =
      this.input.scheme === 'tap'
        ? 'Tap a lane — the dog goes there'
        : 'Swipe left/right — one lane per swipe';
    this._text(hint, w / 2, btn.y + btn.h + 30, 14, 'rgba(255,255,255,0.6)');
  }

  _drawHUD() {
    const { w } = this;
    this._text(`${Math.floor(this.distance)}m`, w / 2, 44, 28);
    if (this.nearMisses > 0) {
      this._text(`close calls: ${this.nearMisses}`, w / 2, 70, 14, '#ffd54f');
    }
  }

  _drawStats() {
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);

    const d = Math.floor(this.distance);
    this._text('WIPEOUT!', w / 2, h * 0.3, 40);
    this._text(`${d}m`, w / 2, h * 0.42, 48, '#ffd54f');
    if (d >= this.best && d > 0) this._text('NEW BEST!', w / 2, h * 0.48, 18, '#ffd54f');
    else this._text(`best: ${this.best}m`, w / 2, h * 0.48, 16, 'rgba(255,255,255,0.7)');
    this._text(`time: ${this.time.toFixed(1)}s   close calls: ${this.nearMisses}`,
      w / 2, h * 0.55, 16, 'rgba(255,255,255,0.8)');

    if (this.deathTimer >= CONFIG.deathPauseBeforeInput) {
      this._text('Tap to run again', w / 2, h * 0.66, 20);
    }
  }
}
