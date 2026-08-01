import { Vector3 } from 'three';
import { CONFIG, PALETTES } from './config.js';
import { laneAlpha } from './world.js';
import { Spawner } from './obstacles.js';

const _v = new Vector3();

// Game states: 'menu' -> 'running' -> 'dead' -> 'running' ...
export class Game {
  constructor({ planetGroup, dogPivot, fx }, input, ui) {
    this.planetGroup = planetGroup;
    this.dogPivot = dogPivot;
    this.fx = fx;
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
    this.stage = 1;
    this.lane = 2;
    this.targetLane = 2;
    this.spawnTimer = 2.0; // grace period at run start
    this.balls = 0;
    this.nearMisses = 0;
    this.deathTimer = 0;
    this.power = null; // { type: 'zoomies'|'chill'|'magnet', timeLeft }
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

  goHome() {
    this._reset();
    this.state = 'menu';
    this.ui.showMenu();
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

    const spinBefore = this.spin;
    this.spin += this.speed * dt;
    this.planetGroup.rotation.x = this.spin;
    this.distance = this.spin * CONFIG.metersPerRadian;

    // Stage checkpoints: every stageLength meters the pace steps up
    const stageNow = 1 + Math.floor(this.distance / CONFIG.stageLength);
    if (stageNow > this.stage) {
      this.stage = stageNow;
      this.ui.showStageBanner(this.stage);
    }
    this.speed = Math.min(
      CONFIG.maxSpeed,
      CONFIG.baseSpeed + (this.stage - 1) * CONFIG.stageSpeedBump
    );

    // Active powerup timer + effects
    if (this.power) {
      this.power.timeLeft -= dt;
      if (this.power.timeLeft <= 0) this.power = null;
    }
    if (this.power?.type === 'chill') this.speed *= CONFIG.powerups.chillFactor;

    // Tween dog toward target lane — exponential ease (snappy start, soft
    // arrival) reads far less mechanical than the old linear slide
    const diff = this.targetLane - this.lane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.45));
    this.lane += Math.abs(diff) < 0.001 ? diff : diff * k;
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
        // Ball Magnet vacuums from farther lanes and a wider window
        const magnet = this.power?.type === 'magnet';
        const reach = magnet ? CONFIG.powerups.magnetLaneDist : 0.6;
        const window_ = magnet ? CONFIG.powerups.magnetWindow : CONFIG.collectWindowAngle;
        if (!e.collected && Math.abs(cur) < window_ && laneDist < reach) {
          e.collected = true;
          this.balls++;
          e.group.getWorldPosition(_v);
          this.fx?.collect(_v);
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else if (e.isPower) {
        if (!e.collected && Math.abs(cur) < CONFIG.collectWindowAngle && laneDist < 0.6) {
          e.collected = true;
          this.power = { type: e.ptype, timeLeft: CONFIG.powerups.duration };
          e.group.getWorldPosition(_v);
          this.fx?.collect(_v);
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else {
        // Continuous hitbox overlap (dog box + obstacle box), checked every
        // frame — no phasing through obstacles mid-lane-change.
        const hitLat = e.hitbox.lat + CONFIG.dogHitbox.lat;
        const hitAng = e.hitbox.ang + CONFIG.dogHitbox.ang;
        if (Math.abs(cur) < hitAng && laneDist < hitLat) {
          if (this.power?.type === 'zoomies') {
            // Invincible: plow straight through the obstacle
            e.group.getWorldPosition(_v);
            this.fx?.crash(_v);
            this.spawner.remove(e);
            continue;
          }
          this._die();
          return;
        }
        // Near-miss still counts at the crossing instant
        if (prev < 0 && cur >= 0 && laneDist < CONFIG.nearMissLaneDist) {
          this.nearMisses++;
          this.ui.updateHUD(this);
        }
      }

      if (cur > CONFIG.despawnBehindAngle) this.spawner.remove(e);
    }

    this.ui.updateHUD(this);
  }

  // Current palette index for the sky mood (main lerps toward it each frame)
  get paletteIndex() {
    return (this.stage - 1) % PALETTES.length;
  }

  _die() {
    this.state = 'dead';
    this.deathTimer = 0;
    this.dogPivot.children[0]?.getWorldPosition(_v);
    this.fx?.crash(_v);
    const d = Math.floor(this.distance);
    this.isNewBest = d > this.best && d > 0;
    if (this.isNewBest) {
      this.best = d;
      localStorage.setItem('fetchrun.best', String(d));
    }
    this.ui.recordRun(this);
    this.ui.showDeath(this);
  }
}
