import { CONFIG } from './config.js';
import { laneAlpha } from './world.js';
import { Spawner } from './obstacles.js';

// Game states: 'menu' -> 'running' -> 'dead' -> 'running' ...
export class Game {
  constructor({ planetGroup, dogPivot }, input, ui) {
    this.planetGroup = planetGroup;
    this.dogPivot = dogPivot;
    this.input = input;
    this.ui = ui;
    this.spawner = new Spawner(planetGroup);
    this.best = Number(localStorage.getItem('fetchrun.best') || 0);

    this.state = 'menu';
    this._reset();

    input.onLaneRequest = (lane) => this._moveTo(lane);
    input.onLaneShift = (dir) => this._moveTo(this.targetLane + dir);
    input.onAction = () => this.handleScreenTap();
  }

  _reset() {
    this.time = 0;
    this.spin = 0;
    this.planetGroup.rotation.x = 0;
    this.distance = 0;
    this.speed = CONFIG.baseSpeed;
    this.lane = 2;
    this.targetLane = 2;
    this.spawnTimer = 2.0; // grace period at run start
    this.balls = 0;
    this.nearMisses = 0;
    this.deathTimer = 0;
    this.spawner.clear();
  }

  // ---- input ----------------------------------------------------------

  _moveTo(lane) {
    if (this.state !== 'running') return;
    this.targetLane = Math.max(0, Math.min(CONFIG.lanes - 1, lane));
  }

  // Called by menu/death overlay taps (and Space/Enter).
  handleScreenTap() {
    if (this.state === 'menu') this._start();
    else if (this.state === 'dead' && this.deathTimer >= CONFIG.deathPauseBeforeInput) {
      this._start();
    }
  }

  _start() {
    this._reset();
    this.state = 'running';
    this.ui.showRunning();
  }

  // ---- update ---------------------------------------------------------

  update(dt) {
    if (this.state === 'menu') {
      // Slow scenic spin behind the title
      this.spin += 0.045 * dt;
      this.planetGroup.rotation.x = this.spin;
      return;
    }
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer >= CONFIG.deathPauseBeforeInput) this.ui.showRestartPrompt();
      return;
    }

    this.time += dt;

    // Chill opening, then linear ramp
    const ramp = Math.max(0, this.time - CONFIG.chillDuration);
    this.speed = Math.min(CONFIG.maxSpeed, CONFIG.baseSpeed + ramp * CONFIG.rampPerSecond);

    const spinBefore = this.spin;
    this.spin += this.speed * dt;
    this.planetGroup.rotation.x = this.spin;
    this.distance = this.spin * CONFIG.metersPerRadian;

    // Tween dog toward target lane; lateral position is a rotation on the globe
    const diff = this.targetLane - this.lane;
    const maxStep = dt / CONFIG.laneChangeTime;
    this.lane += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
    this.dogPivot.rotation.z = laneAlpha(this.lane);

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawner.spawnRow(this.spin);
      const t = (this.speed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed);
      this.spawnTimer =
        CONFIG.spawnBaseInterval - t * (CONFIG.spawnBaseInterval - CONFIG.spawnMinInterval);
    }

    // Collisions / collection / cleanup — the dog's line is at theta = dogTheta
    const dogT = CONFIG.dogTheta;
    for (const e of [...this.spawner.entities]) {
      const prev = spinBefore + e.theta0 - dogT;
      const cur = this.spin + e.theta0 - dogT;
      const laneDist = Math.abs(e.lane - this.lane);

      if (e.isBall) {
        if (!e.collected && Math.abs(cur) < CONFIG.collectWindowAngle && laneDist < 0.6) {
          e.collected = true;
          this.balls++;
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else if (prev < 0 && cur >= 0) {
        // Obstacle crossing the dog's line this frame
        if (laneDist < CONFIG.hitboxForgiveness) {
          this._die();
          return;
        }
        if (laneDist < CONFIG.nearMissLaneDist) {
          this.nearMisses++;
          this.ui.updateHUD(this);
        }
      }

      if (cur > CONFIG.despawnBehindAngle) this.spawner.remove(e);
    }

    this.ui.updateHUD(this);
  }

  _die() {
    this.state = 'dead';
    this.deathTimer = 0;
    const d = Math.floor(this.distance);
    this.isNewBest = d > this.best && d > 0;
    if (this.isNewBest) {
      this.best = d;
      localStorage.setItem('fetchrun.best', String(d));
    }
    this.ui.showDeath(this);
  }
}
