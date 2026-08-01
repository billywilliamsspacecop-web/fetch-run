import { Vector3 } from 'three';
import { CONFIG, PALETTES } from './config.js';
import { laneAlpha } from './world.js';
import { Spawner, makeFence } from './obstacles.js';
import { surfacePivot } from './world.js';

const _v = new Vector3();

// Game states: 'menu' -> 'intro' -> 'running' -> 'dead' -> ...
// The intro is the chase short: squirrel bolts, runner follows, fence smashes.
export class Game {
  constructor({ planetGroup, dogPivot, squirrelPivot, fx }, input, ui) {
    this.planetGroup = planetGroup;
    this.dogPivot = dogPivot;
    this.squirrelPivot = squirrelPivot;
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
    this.bonus = 0; // extra meters from score multipliers
    this.speed = CONFIG.baseSpeed;
    this.stage = 1;
    this.lane = 2;
    this.targetLane = 2;
    this.spawnTimer = 1.2; // grace period once the run proper starts
    this.balls = 0;
    this.nearMisses = 0;
    this.deathTimer = 0;
    this.deathCause = 'wipeout';
    this.power = null;      // { type, timeLeft }
    this.extraLife = false; // steak held (non-stacking)
    this.invulnTimer = 0;   // grace after a steak save
    this.nextWaterAt = Infinity; // spin value that triggers the next river
    // Squirrel chase state
    this.sqLane = 2;
    this.sqTargetLane = 2;
    this.introT = 0;
    this._clearFence();
    this.spawner.clear();
  }

  _clearFence() {
    if (this.fencePivot) {
      this.planetGroup.remove(this.fencePivot);
      this.fencePivot = null;
    }
  }

  // ---- input ----------------------------------------------------------

  _moveTo(lane) {
    if (this.state !== 'running') return;
    this.targetLane = Math.max(0, Math.min(CONFIG.lanes - 1, lane));
  }

  // Called by menu overlay taps, death buttons, and Space/Enter.
  handleScreenTap() {
    if (this.state === 'menu') this._start();
    else if (this.state === 'intro') this._finishIntro();
    else if (this.state === 'dead' && this.deathTimer >= CONFIG.deathPauseBeforeInput) {
      this._start();
    }
  }

  _start() {
    this._reset();
    this.state = 'intro';
    this.ui.showIntro();
    // Fence ahead of the runner; the ramping spin carries it into the smash
    this.fencePivot = surfacePivot(CONFIG.dogTheta - CONFIG.intro.fenceAhead, 0, makeFence());
    this.planetGroup.add(this.fencePivot);
  }

  _finishIntro() {
    if (this.fencePivot) {
      this.fencePivot.children[0]?.getWorldPosition(_v);
      this.fx?.plankBurst(_v);
      this._clearFence();
    }
    this.state = 'running';
    this.time = 0;
    this.spawnTimer = 1.2;
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
      this.spin += 0.045 * dt;
      this.planetGroup.rotation.x = this.spin;
      return;
    }
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer >= CONFIG.deathPauseBeforeInput) this.ui.showRestartPrompt();
      return;
    }
    if (this.state === 'intro') {
      this._updateIntro(dt);
      return;
    }
    this._updateRun(dt);
  }

  _updateIntro(dt) {
    const { duration } = CONFIG.intro;
    this.introT += dt;
    const p = Math.min(1, this.introT / duration);

    // Spin ramps up from a standstill — the world starts rolling
    this.speed = CONFIG.baseSpeed * p;
    this.spin += this.speed * dt;
    this.planetGroup.rotation.x = this.spin;

    // Squirrel sprints from just behind the runner up to its chase spot
    const ease = 1 - Math.pow(1 - p, 2.2);
    const sqTheta =
      (CONFIG.dogTheta + 0.22) * (1 - ease) + CONFIG.squirrelTheta * ease;
    this.squirrelPivot.rotation.x = sqTheta;
    this.squirrelPivot.rotation.z = laneAlpha(2);

    // Runner smashes through when the fence reaches it
    const fenceEff = this.spin + (CONFIG.dogTheta - CONFIG.intro.fenceAhead);
    if (fenceEff >= CONFIG.dogTheta - 0.045 || p >= 1) this._finishIntro();
  }

  _updateRun(dt) {
    this.time += dt;

    const spinBefore = this.spin;
    this.spin += this.speed * dt;
    this.planetGroup.rotation.x = this.spin;

    // Score: distance plus multiplier bonus (Zoomies / Golden Bone = 2x)
    const mult = this.power?.type === 'zoomies' || this.power?.type === 'goldbone' ? 2 : 1;
    this.bonus += (mult - 1) * this.speed * CONFIG.metersPerRadian * dt;
    this.distance = this.spin * CONFIG.metersPerRadian + this.bonus;

    // Stage checkpoints
    const stageNow = 1 + Math.floor(this.distance / CONFIG.stageLength);
    if (stageNow > this.stage) {
      this.stage = stageNow;
      const water = this.isWaterStage;
      this.ui.showStageBanner(this.stage, water);
      // Water stages alternate land chunks with long rivers
      this.nextWaterAt = water ? this.spin + 0.4 : Infinity;
    }
    this.speed = Math.min(
      CONFIG.maxSpeed,
      CONFIG.baseSpeed + (this.stage - 1) * CONFIG.stageSpeedBump
    );

    // Powerup timers
    if (this.power) {
      this.power.timeLeft -= dt;
      if (this.power.timeLeft <= 0) this.power = null;
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    // Runner lane tween
    const diff = this.targetLane - this.lane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.45));
    this.lane += Math.abs(diff) < 0.001 ? diff : diff * k;
    this.dogPivot.rotation.z = laneAlpha(this.lane);

    // Squirrel dodges on its own up at the crest
    this._updateSquirrel(dt);

    // Spawning: on water stages, long rivers on a fixed cadence with normal
    // rows on the land chunks between them; otherwise normal/yarn rows.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const rowTheta0 = -CONFIG.spawnAheadAngle - this.spin;
      if (this.isWaterStage && this.spin >= this.nextWaterAt) {
        this.spawner.spawnRiver(this.spin, CONFIG.water.riverDepth);
        this.nextWaterAt = this.spin + CONFIG.water.spacing;
      } else if (!this._rowLandsInWater(rowTheta0)) {
        if (this.power?.type === 'yarn') this.spawner.spawnBallRow(this.spin);
        else this.spawner.spawnRow(this.spin);
      }
      const t = (this.speed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed);
      this.spawnTimer =
        CONFIG.spawnBaseInterval - t * (CONFIG.spawnBaseInterval - CONFIG.spawnMinInterval);
    }

    // Collisions / collection — the runner's line is at theta = dogTheta
    const dogT = CONFIG.dogTheta;
    const magnet = this.power?.type === 'magnet';
    for (const e of [...this.spawner.entities]) {
      const prev = spinBefore + e.theta0 - dogT;
      let cur = this.spin + e.theta0 - dogT;
      let laneDist = Math.abs(e.lane - this.lane);

      if (e.isBall) {
        // Ball Magnet: physically warp balls toward the runner
        if (magnet && !e.collected && Math.abs(cur) < CONFIG.powerups.magnetWindow &&
            laneDist < CONFIG.powerups.magnetLaneDist) {
          const pull = Math.min(1, CONFIG.powerups.magnetPull * dt);
          e.theta0 += (dogT - this.spin - e.theta0) * pull;
          e.lane += (this.lane - e.lane) * pull;
          e.pivot.rotation.x = e.theta0;
          e.pivot.rotation.z = laneAlpha(e.lane);
          cur = this.spin + e.theta0 - dogT;
          laneDist = Math.abs(e.lane - this.lane);
          if (Math.random() < dt * 30) {
            e.group.getWorldPosition(_v);
            this.fx?.sparkle(_v);
          }
        }
        if (!e.collected && Math.abs(cur) < CONFIG.collectWindowAngle && laneDist < 0.65) {
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
          if (e.ptype === 'steak') this.extraLife = true; // non-stacking
          else this.power = { type: e.ptype, timeLeft: CONFIG.powerups.duration };
          e.group.getWorldPosition(_v);
          this.fx?.collect(_v);
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else if (e.isRiver) {
        // The river occupies [0, depth] behind its leading edge.
        // Safety uses BOTH the smoothed position and the committed target
        // lane — if the player already tapped the bridge lane, the eased
        // tween catching up a few frames late must never be fatal.
        const overWater = cur > -0.015 && cur < e.depth + 0.015;
        const laneSafe = Math.abs(this.lane - e.bridgeLane) <= 0.6;
        const committedSafe = this.targetLane === e.bridgeLane;
        const offBridge = !laneSafe && !committedSafe;
        if (overWater && offBridge && !this._survivesHit(e, 'splash')) return;
        if (cur > e.depth + CONFIG.despawnBehindAngle) this.spawner.remove(e);
        continue;
      } else {
        const hitLat = e.hitbox.lat + CONFIG.dogHitbox.lat;
        const hitAng = e.hitbox.ang + CONFIG.dogHitbox.ang;
        if (Math.abs(cur) < hitAng && laneDist < hitLat) {
          if (!this._survivesHit(e, 'wipeout')) return;
          continue;
        }
        if (prev < 0 && cur >= 0 && laneDist < CONFIG.nearMissLaneDist) {
          this.nearMisses++;
          this.ui.updateHUD(this);
        }
      }

      if (cur > CONFIG.despawnBehindAngle) this.spawner.remove(e);
    }

    this.ui.updateHUD(this);
  }

  get isWaterStage() {
    const { firstAt, every } = CONFIG.water;
    return this.stage >= firstAt && (this.stage - firstAt) % every === 0;
  }

  // Would a row spawned at this theta0 land inside an active river span?
  _rowLandsInWater(rowTheta0) {
    return this.spawner.entities.some(
      (e) => e.isRiver &&
        rowTheta0 > e.theta0 - e.depth - 0.14 &&
        rowTheta0 < e.theta0 + 0.14
    );
  }

  // Returns true if the runner survives contact (zoomies / steak / grace).
  // On true death, calls _die and returns false.
  _survivesHit(e, cause) {
    if (this.invulnTimer > 0) return true;
    if (this.power?.type === 'zoomies') {
      if (!e.isRiver) {
        e.group.getWorldPosition(_v);
        this.fx?.crash(_v);
        this.spawner.remove(e);
      }
      return true;
    }
    if (this.extraLife) {
      this.extraLife = false;
      this.invulnTimer = 1.5;
      this.dogPivot.children[0]?.getWorldPosition(_v);
      this.fx?.crash(_v);
      if (!e.isRiver) this.spawner.remove(e);
      this.ui.updateHUD(this);
      return true;
    }
    this._die(cause);
    return false;
  }

  _updateSquirrel(dt) {
    const sqT = CONFIG.squirrelTheta;
    // Threat scan: anything about to cross the squirrel's line
    const danger = new Array(CONFIG.lanes).fill(0);
    let bridgeLane = null;
    let bridgeDist = Infinity;
    for (const e of this.spawner.entities) {
      const cur = this.spin + e.theta0 - sqT;
      if (e.isRiver) {
        // Long water: get on the bridge before the front, stay on until past.
        // If two rivers' windows ever overlap, track the nearer one instead
        // of whichever happened to come last in the entity list.
        if (cur > -0.35 && cur < e.depth + 0.05 && Math.abs(cur) < bridgeDist) {
          bridgeLane = e.bridgeLane;
          bridgeDist = Math.abs(cur);
        }
        continue;
      }
      if (cur < -0.35 || cur > 0.04) continue;
      if (!e.isBall && !e.isPower) danger[e.lane] += cur > -0.12 ? 10 : 3;
    }
    if (bridgeLane !== null) {
      this.sqTargetLane = bridgeLane;
    } else if (danger[this.sqTargetLane] > 0) {
      const lanes = [...Array(CONFIG.lanes).keys()].sort(
        (a, b) =>
          danger[a] - danger[b] ||
          Math.abs(a - this.sqTargetLane) - Math.abs(b - this.sqTargetLane)
      );
      this.sqTargetLane = lanes[0];
    }
    const diff = this.sqTargetLane - this.sqLane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.7));
    this.sqLane += Math.abs(diff) < 0.001 ? diff : diff * k;
    this.squirrelPivot.rotation.x = sqT;
    this.squirrelPivot.rotation.z = laneAlpha(this.sqLane);
  }

  // Current palette index for the sky mood (main lerps toward it each frame)
  get paletteIndex() {
    return (this.stage - 1) % PALETTES.length;
  }

  _die(cause = 'wipeout') {
    this.state = 'dead';
    this.deathCause = cause;
    this.deathTimer = 0;
    this.dogPivot.children[0]?.getWorldPosition(_v);
    if (cause === 'splash') this.fx?.splash(_v);
    else this.fx?.crash(_v);
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
