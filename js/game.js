import { Vector3 } from 'three';
import { CONFIG } from './config.js';
import { laneAlpha, surfacePivot } from './world.js';
import { Spawner } from './obstacles.js';
import { THEMES, pickRareTheme } from './themes.js';
import { makeFence } from './fence.js';

const _v = new Vector3();

// Game states: 'menu' -> 'intro' -> 'running' -> 'dead' -> ...
// The intro is the chase short: squirrel bolts, runner follows, fence smashes.
export class Game {
  constructor({ planetGroup, dogPivot, squirrelPivot, fx, sfx }, input, ui) {
    this.planetGroup = planetGroup;
    this.dogPivot = dogPivot;
    this.squirrelPivot = squirrelPivot;
    this.fx = fx;
    this.sfx = sfx;
    this.input = input;
    this.ui = ui;
    this.spawner = new Spawner(planetGroup);
    this.best = Number(localStorage.getItem('fetchrun.best') || 0);

    this.state = 'menu';
    this._reset();

    input.onLaneShift = (dir) => this._moveTo(this.targetLane + dir);
    input.onAction = () => this.handleScreenTap();
  }

  _rollThemeStages() {
    const { themeStagesMin: a, themeStagesMax: b } = CONFIG;
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  _reset() {
    this.paused = false;
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
    this.collectStreak = 0;
    this._lastCollectAt = -9;
    this.nearMisses = 0;
    this.deathTimer = 0;
    this.deathCause = 'wipeout';
    // Powers STACK: a map of type -> seconds remaining, so several run at
    // once and re-grabbing one extends it (capped at maxDuration).
    this.powers = {};
    this.extraLives = 0;    // steaks bank up, also stackable
    this.invulnTimer = 0;   // grace after a steak save
    // Themed levels: start in the first theme, move on after 2-4 stages
    this.themeIndex = 0;
    this.theme = THEMES[0];
    this.onThemeChange?.(this.theme);
    this.stagesLeftInTheme = this._rollThemeStages();
    this.spawner.setTheme(this.theme);
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
    if (this.state !== 'running' || this.paused) return;
    const next = Math.max(0, Math.min(CONFIG.lanes - 1, lane));
    if (next !== this.targetLane) this.sfx?.lane();
    this.targetLane = next;
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

  // ---- pause ------------------------------------------------------------

  pause() {
    if (this.state !== 'running' && this.state !== 'intro') return;
    this.paused = true;
    this.ui.showPaused();
  }

  resume() {
    this.paused = false;
    this.ui.hidePaused();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  // ---- update ---------------------------------------------------------

  update(dt) {
    if (this.paused) return;
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
    const sqTheta = (CONFIG.dogTheta + 0.22) * (1 - ease) + CONFIG.squirrelTheta * ease;
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

    // Score multipliers stack multiplicatively: Zoomies AND Golden Bone
    // together is 4x, which is the payoff for a lucky double pickup.
    let mult = 1;
    if (this.has('zoomies')) mult *= 2;
    if (this.has('goldbone')) mult *= 2;
    this.bonus += (mult - 1) * this.speed * CONFIG.metersPerRadian * dt;
    this.distance = this.spin * CONFIG.metersPerRadian + this.bonus;

    // Stage checkpoints — and every 2-4 stages, a whole new themed world
    const stageNow = 1 + Math.floor(this.distance / CONFIG.stageLength);
    if (stageNow > this.stage) {
      this.stage = stageNow;
      this.stagesLeftInTheme -= 1;
      let newTheme = null;
      if (this.stagesLeftInTheme <= 0) {
        // Small chance of dropping into an ultra-rare world instead of the
        // next normal one. Rare stages last exactly one stage, and never
        // chain back-to-back, so they stay a surprise.
        if (!this.theme.rare && Math.random() < CONFIG.rareChance) {
          this.theme = pickRareTheme();
          this.stagesLeftInTheme = 1;
        } else {
          this.themeIndex = (this.themeIndex + 1) % THEMES.length;
          this.theme = THEMES[this.themeIndex];
          this.stagesLeftInTheme = this._rollThemeStages();
        }
        this.spawner.setTheme(this.theme);
        newTheme = this.theme.label;
        this.onThemeChange?.(this.theme);
        // Entering the house means going THROUGH the front of it: a wall
        // across the track with one or two doors. Queued so it arrives just
        // after the banner, as the threshold into the new world.
        if (this.theme.gate) {
          const lanes = [...Array(CONFIG.lanes).keys()].sort(() => Math.random() - 0.5);
          const doorCount = Math.random() < 0.45 ? 2 : 1;
          this.spawner.spawnDoorGate(this.spin, lanes.slice(0, doorCount));
          this.spawnTimer = Math.max(this.spawnTimer, 1.1); // keep the gate clear
        }
      }
      this.ui.showStageBanner(this.stage, newTheme, this.theme.rare);
      if (newTheme) {
        if (this.theme.rare) this.sfx?.rareStage(); else this.sfx?.newTheme();
      } else this.sfx?.checkpoint();
    }
    this.speed = Math.min(
      CONFIG.maxSpeed,
      CONFIG.baseSpeed + (this.stage - 1) * CONFIG.stageSpeedBump
    );

    // Powerup timers — each stacked power counts down independently
    for (const type of Object.keys(this.powers)) {
      this.powers[type] -= dt;
      if (this.powers[type] <= 0) delete this.powers[type];
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    // Runner lane tween
    const diff = this.targetLane - this.lane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.45));
    this.lane += Math.abs(diff) < 0.001 ? diff : diff * k;
    this.dogPivot.rotation.z = laneAlpha(this.lane);

    // Squirrel dodges on its own up at the crest
    this._updateSquirrel(dt);

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.has('yarn')) this.spawner.spawnBallRow(this.spin);
      else this.spawner.spawnRow(this.spin);
      const t = (this.speed - CONFIG.baseSpeed) / (CONFIG.maxSpeed - CONFIG.baseSpeed);
      this.spawnTimer =
        CONFIG.spawnBaseInterval - t * (CONFIG.spawnBaseInterval - CONFIG.spawnMinInterval);
    }

    // Collisions / collection — the runner's line is at theta = dogTheta
    const dogT = CONFIG.dogTheta;
    const magnet = this.has('magnet');
    for (const e of [...this.spawner.entities]) {
      const prev = spinBefore + e.theta0 - dogT;
      let cur = this.spin + e.theta0 - dogT;
      let laneDist = Math.abs(e.lane - this.lane);

      // Ball Magnet warps ANY pickup toward the runner — collectibles and
      // powerups alike. Pulling a steak or a frisbee to you is the best part
      // of having it, and "magnet only works on tennis balls" read as a bug.
      if ((e.isBall || e.isPower) && magnet && !e.collected &&
          Math.abs(cur) < CONFIG.powerups.magnetWindow &&
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

      if (e.isDoor) {
        // Bursting through the doorway — the reward for picking right
        if (!e.collected && Math.abs(cur) < 0.03 && laneDist < 0.7) {
          e.collected = true;
          e.group.getWorldPosition(_v);
          this.fx?.plankBurst(_v);
          this.sfx?.checkpoint();
          this.spawner.remove(e);
          continue;
        }
        if (cur > CONFIG.despawnBehindAngle) this.spawner.remove(e);
        continue;
      }

      if (e.isBall) {
        if (!e.collected && Math.abs(cur) < CONFIG.collectWindowAngle && laneDist < 0.65) {
          e.collected = true;
          this.balls++;
          // Streak makes consecutive pickups play an ascending run
          this.collectStreak = this.time - (this._lastCollectAt ?? -9) < 1.1
            ? (this.collectStreak ?? 0) + 1 : 0;
          this._lastCollectAt = this.time;
          this.sfx?.collect(this.collectStreak);
          e.group.getWorldPosition(_v);
          this.fx?.collect(_v);
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else if (e.isPower) {
        if (!e.collected && Math.abs(cur) < CONFIG.collectWindowAngle && laneDist < 0.6) {
          e.collected = true;
          if (e.ptype === 'steak') {
            this.extraLives = Math.min(
              CONFIG.powerups.maxExtraLives, this.extraLives + 1
            );
            this.sfx?.extraLife();
          } else {
            // Stacks: adds to whatever is already running, up to a ceiling
            this.powers[e.ptype] = Math.min(
              CONFIG.powerups.maxDuration,
              (this.powers[e.ptype] ?? 0) + CONFIG.powerups.duration
            );
            this.sfx?.powerup();
          }
          e.group.getWorldPosition(_v);
          this.fx?.collect(_v);
          this.spawner.remove(e);
          this.ui.updateHUD(this);
          continue;
        }
      } else {
        const hitLat = e.hitbox.lat + CONFIG.dogHitbox.lat;
        const hitAng = e.hitbox.ang + CONFIG.dogHitbox.ang;
        if (Math.abs(cur) < hitAng && laneDist < hitLat) {
          this.lastHitKind = e.kind; // picks the wipeout animation
          if (!this._survivesHit(e)) return;
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

  // Returns true if the runner survives contact (zoomies / steak / grace).
  // On true death, calls _die and returns false.
  // Is a stacking power currently active?
  has(type) {
    return (this.powers[type] ?? 0) > 0;
  }

  _survivesHit(e) {
    if (this.invulnTimer > 0) return true;
    if (this.has('zoomies')) {
      // Invincible: plow straight through
      e.group.getWorldPosition(_v);
      this.fx?.crash(_v);
      this.spawner.remove(e);
      return true;
    }
    if (this.extraLives > 0) {
      this.extraLives -= 1;
      this.invulnTimer = 1.5;
      this.sfx?.save();
      this.dogPivot.children[0]?.getWorldPosition(_v);
      this.fx?.crash(_v);
      this.spawner.remove(e);
      this.ui.updateHUD(this);
      return true;
    }
    this._die();
    return false;
  }

  _updateSquirrel(dt) {
    const sqT = CONFIG.squirrelTheta;
    // Threat scan: anything about to cross the squirrel's line
    const danger = new Array(CONFIG.lanes).fill(0);
    for (const e of this.spawner.entities) {
      const cur = this.spin + e.theta0 - sqT;
      if (cur < -0.35 || cur > 0.04) continue;
      if (!e.isBall && !e.isPower) danger[e.lane] += cur > -0.12 ? 10 : 3;
    }
    if (danger[this.sqTargetLane] > 0) {
      // Pick among the SAFEST lanes, preferring the nearest, breaking any
      // remaining tie at random. Sorting purely by (danger, distance) is a
      // stable sort, so equal candidates always resolved to the lowest index
      // — which is why the squirrel kept migrating to the far left and
      // parking there.
      const best = [...Array(CONFIG.lanes).keys()]
        .map((l) => ({ l, d: danger[l], dist: Math.abs(l - this.sqTargetLane) }))
        .sort((a, b) => a.d - b.d || a.dist - b.dist);
      const top = best.filter((c) => c.d === best[0].d && c.dist === best[0].dist);
      this.sqTargetLane = top[Math.floor(Math.random() * top.length)].l;
    } else if (Math.random() < dt * 0.35) {
      // Idle wander: with no threat, occasionally drift a lane so the chase
      // stays lively instead of the quarry running a perfectly straight line.
      // REFLECT at the edges rather than clamping — clamping makes lane 0 and
      // lane 4 absorbing states, so the squirrel drifts outward and parks
      // against a wall, which is what made it hug one side.
      let dir = Math.random() < 0.5 ? -1 : 1;
      if (this.sqTargetLane <= 0) dir = 1;
      else if (this.sqTargetLane >= CONFIG.lanes - 1) dir = -1;
      this.sqTargetLane += dir;
    }
    const diff = this.sqTargetLane - this.sqLane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.7));
    this.sqLane += Math.abs(diff) < 0.001 ? diff : diff * k;
    this.squirrelPivot.rotation.x = sqT;
    this.squirrelPivot.rotation.z = laneAlpha(this.sqLane);
  }

  // Which wipeout animation plays, based on what you ran into. Soft/springy
  // things bounce you, low things trip you, tall solid things flatten you.
  static WIPEOUT_BY_KIND = {
    obCouch: 'bounce', obLaundryBasket: 'bounce', obBramble: 'bounce',
    obPicnicBasket: 'bounce', obMushrooms: 'bounce',
    obFallenLog: 'trip', obCoffeeTable: 'trip', obBench: 'trip',
    obCourtCone: 'trip', obStump: 'trip',
    obBenchWood: 'trip', obBenchPark: 'trip',
    obBoulder: 'flatten', obTrashCan: 'flatten', obFountain: 'flatten',
    obBallMachine: 'flatten', obVacuum: 'flatten',
    obGnome: 'spinout', obSprinkler: 'spinout', obStroller: 'spinout',
    obHotDogCart: 'spinout', obCatTower: 'spinout',
    obTennisNet: 'tangle', obBallHopper: 'tangle', obUmpireChair: 'tangle',
  };

  _die() {
    this.state = 'dead';
    this.deathCause = 'wipeout';
    this.deathTimer = 0;
    this.wipeoutStyle =
      Game.WIPEOUT_BY_KIND[this.lastHitKind] ?? 'spinout';
    this.sfx?.wipeout();
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
