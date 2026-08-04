import { Vector3 } from 'three';
import { CONFIG } from './config.js';
import { laneAlpha, surfacePivot } from './world.js';
import { Spawner } from './obstacles.js';
import { THEMES, RARE_THEMES, pickRareTheme } from './themes.js';
import { makeFence } from './fence.js';

const _v = new Vector3();

// Contact test for one frame. `prev`/`cur` are an entity's angular offset from
// the runner at the START and END of the frame, and offsets only ever
// increase, so the entity SWEEPS the interval [prev, cur].
//
// This has to be an interval overlap, not a point test on `cur`. A point test
// only fires if a frame happens to land inside the window, and the window is
// tiny (~0.03rad for a hitbox, 0.09 for a pickup). At the raised top speed an
// entity covers ~0.2rad per frame, so it would step clean over the window and
// obstacles would pass straight THROUGH the runner without registering.
const swept = (prev, cur, halfWidth) => prev <= halfWidth && cur >= -halfWidth;

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

    // ?stages=rare — a dedicated test run through the special worlds only, in
    // RARE_THEMES order, on a short stage so you reach all of them in a couple
    // of minutes instead of waiting on a roll per theme block. The URL flag
    // only ever turns it ON; the settings panel owns it from there.
    if (new URLSearchParams(location.search).get('stages') === 'rare') CONFIG.rareOnly = true;

    this.state = 'menu';
    this._reset();

    input.onLaneShift = (dir) => this._moveTo(this.targetLane + dir);
    input.onAction = () => this.handleScreenTap();
  }

  // Read fresh every frame rather than cached at construction, so dragging a
  // slider mid-run takes effect immediately.
  get rareTest() {
    return CONFIG.rareOnly;
  }

  get stageLength() {
    return CONFIG.rareOnly ? CONFIG.rareTestStageLength : CONFIG.stageLength;
  }

  _rollThemeStages() {
    const { themeStagesMin: a, themeStagesMax: b } = CONFIG;
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  _reset() {
    this.paused = false;
    this.countdown = 0;
    this.ui.hideCountdown();
    this.time = 0;
    this.spin = 0;
    this.planetGroup.rotation.x = 0;
    this.distance = 0;
    this.score = 0;
    this.mult = 1;
    this.speed = CONFIG.baseSpeed;
    this.stage = 1;
    this.lane = 2;
    this.targetLane = 2;
    // Put the runner back in the CENTRE VISUALLY too. Only _updateRun writes
    // dogPivot.rotation.z, so after dying out in lane 0 the model stayed
    // parked there through the whole intro and then snapped to the middle the
    // instant the run began — which is the jitter at the start of a restart.
    this.dogPivot.rotation.z = laneAlpha(2);
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
    this.rareIndex = 0;
    this.theme = this.rareTest ? RARE_THEMES[0] : THEMES[0];
    this.pendingTheme = null; // world waiting behind a door gate
    this.onThemeChange?.(this.theme);
    this.stagesLeftInTheme = this.rareTest ? 1 : this._rollThemeStages();
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
    // Nothing moves during the post-pause countdown — including the runner.
    // Accepting the swipe but not animating it reads as a dropped input.
    if (this.state !== 'running' || this.paused || this.countdown > 0) return;
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
    this.countdown = 0; // a pause during a countdown restarts it on resume
    this.ui.hideCountdown();
    this.ui.showPaused();
  }

  resume() {
    this.paused = false;
    this.ui.hidePaused();
    // Hand the run back with the world held still for a beat. Without it you
    // un-pause into whatever row was already on top of you, which is a death
    // you had no say in. Past maxScore it's skipped: by then pausing is a
    // breather you take repeatedly and the wait becomes the annoyance.
    if (this.state === 'running' && this.score < CONFIG.pauseCountdown.maxScore) {
      this.countdown = CONFIG.pauseCountdown.seconds;
      this.ui.showCountdown(Math.ceil(this.countdown));
    }
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  // ---- update ---------------------------------------------------------

  update(dt) {
    if (this.paused) return;
    // Post-pause 3..2..1. The world is frozen — nothing spins, spawns or
    // collides — but frames keep rendering, so you get to actually LOOK at the
    // row you're about to run into before it starts moving again.
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.ui.hideCountdown();
        this.sfx?.uiTap();
      } else if (after !== before) {
        this.ui.showCountdown(after);
        this.sfx?.uiTap();
      }
      return;
    }
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

    // Spin ramps up from a standstill — the world starts rolling. Eased
    // rather than linear so it creeps off the line and then winds up, instead
    // of being at half speed a third of a second in.
    this.speed = CONFIG.baseSpeed * Math.pow(p, CONFIG.intro.rampPower);
    this.spin += this.speed * dt;
    this.planetGroup.rotation.x = this.spin;
    // Hold the runner centred for the whole cutscene
    this.dogPivot.rotation.z = laneAlpha(this.lane);

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
    this.mult = 1;
    if (this.has('zoomies')) this.mult *= 2;
    if (this.has('goldbone')) this.mult *= 2;

    // Distance is raw metres travelled — never multiplied, so the stage
    // pacing and the "how far did I get" stat stay honest.
    this.distance = this.spin * CONFIG.metersPerRadian;
    // SCORE is the number the player actually chases, and it's driven by the
    // same rotation, so speeding up scores faster by construction. Multipliers
    // apply here (and to ball pickups) rather than to distance.
    this.score += this.speed * CONFIG.metersPerRadian * this.mult * dt;

    // Stage checkpoints — and every 2-4 stages, a whole new themed world
    const stageNow = 1 + Math.floor(this.distance / this.stageLength);
    if (stageNow > this.stage) {
      this.stage = stageNow;
      this.stagesLeftInTheme -= 1;
      let announced = false;
      if (this.stagesLeftInTheme <= 0 && !this.pendingTheme) {
        // Small chance of dropping into an ultra-rare world instead of the
        // next normal one. Rare stages last exactly one stage, and never
        // chain back-to-back, so they stay a surprise.
        let next;
        if (this.rareTest) {
          // Test run: straight through the specials on a loop, no gates.
          this.rareIndex = (this.rareIndex + 1) % RARE_THEMES.length;
          next = RARE_THEMES[this.rareIndex];
        } else if (!this.theme.rare && Math.random() < CONFIG.rareChance) {
          next = pickRareTheme();
        } else {
          this.themeIndex = (this.themeIndex + 1) % THEMES.length;
          next = THEMES[this.themeIndex];
        }
        if (next.gate) {
          // A gated world is entered by breaking INTO it, so the door has to
          // come first: hold the old world's look and props until the player
          // actually bursts through, otherwise you're already standing inside
          // the house when its front door finally arrives.
          this.pendingTheme = next;
          const lanes = [...Array(CONFIG.lanes).keys()].sort(() => Math.random() - 0.5);
          const doorCount = Math.random() < 0.45 ? 2 : 1;
          this.spawner.spawnDoorGate(this.spin, lanes.slice(0, doorCount));
          this.spawnTimer = Math.max(this.spawnTimer, 1.3); // keep the gate clear
        } else if (this.theme.exitGate === 'glass') {
          // Symmetry with the door gate: you came INTO this world through a
          // wall, so you leave through one too. Same hold-the-old-look trick
          // — the house has to still be around you when the glass arrives.
          this.pendingTheme = next;
          this.spawner.spawnGlassWall(this.spin);
          this.spawnTimer = Math.max(this.spawnTimer, 1.3);
        } else {
          this._enterTheme(next);
          announced = true;
        }
      }
      if (!announced) {
        this.ui.showStageBanner(this.stage);
        this.sfx?.checkpoint();
      }
    }
    this.speed = Math.min(
      CONFIG.maxSpeed,
      CONFIG.baseSpeed + (this.stage - 1) * CONFIG.stageSpeedBump
    );
    // Slo-Mo drags the whole world down. Applied AFTER the stage curve so it
    // scales with however fast you were going, and it costs distance for as
    // long as it runs (score is derived from rotation) — that's the price.
    if (this.has('slowmo')) this.speed *= CONFIG.powerups.slowmoFactor;
    // Golden Bone's 2x comes with a nudge of real speed, so the multiplier is
    // something you feel rather than just a number in the corner.
    if (this.has('goldbone')) this.speed *= CONFIG.powerups.goldboneSpeedBump;

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
      if (this.has('yarn')) {
        // Wait out the whole figure before laying down the next one, or the
        // shapes overlap into an unreadable soup of balls.
        const span = this.spawner.spawnBallRow(this.spin);
        this.spawnTimer = span / Math.max(0.2, this.speed) + 0.25;
      } else {
        this.spawner.spawnRow(this.spin, this.speed);
        const t = Math.min(1, Math.max(0,
          (this.speed - CONFIG.baseSpeed) / (CONFIG.spawnRampSpeed - CONFIG.baseSpeed)));
        this.spawnTimer =
          CONFIG.spawnBaseInterval - t * (CONFIG.spawnBaseInterval - CONFIG.spawnMinInterval);
      }
    }

    // Collisions / collection — the runner's line is at theta = dogTheta
    const dogT = CONFIG.dogTheta;
    const magnet = this.has('magnet');
    const frenzy = this.has('yarn');
    for (const e of [...this.spawner.entities]) {
      const prev = spinBefore + e.theta0 - dogT;
      let cur = this.spin + e.theta0 - dogT;
      let laneDist = Math.abs(e.lane - this.lane);

      // Ball Magnet warps ANY pickup toward the runner — collectibles and
      // powerups alike. Pulling a steak or a frisbee to you is the best part
      // of having it, and "magnet only works on tennis balls" read as a bug.
      // Ball Frenzy adds a gentle drift of its own — much weaker than the real
      // magnet, just enough that a wall of balls collapses toward you instead
      // of streaming past either side.
      const frenzyPull = frenzy && e.isBall &&
        laneDist < CONFIG.powerups.yarnMagnetLaneDist;
      if ((e.isBall || e.isPower) && (magnet || frenzyPull) && !e.collected &&
          Math.abs(cur) < CONFIG.powerups.magnetWindow &&
          (magnet ? laneDist < CONFIG.powerups.magnetLaneDist : true)) {
        const rate = magnet ? CONFIG.powerups.magnetPull : CONFIG.powerups.yarnMagnetPull;
        const pull = Math.min(1, rate * dt);
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
        // Bursting through the doorway — the reward for picking right, and
        // the moment the new world actually begins.
        if (!e.collected && swept(prev, cur, 0.03) && laneDist < 0.7) {
          e.collected = true;
          e.group.getWorldPosition(_v);
          if (e.isGlass) {
            this.fx?.glassBurst(_v);
            this.sfx?.glassSmash();
            this.spawner.remove(e);
            this._shatterGlass(); // the whole wall goes, not just your pane
          } else {
            this.fx?.plankBurst(_v);
            this.spawner.remove(e);
          }
          this._commitPendingTheme();
          continue;
        }
        // Safety net: if the gate somehow slips past (plowed through on
        // Zoomies, say), still commit rather than stranding the old world.
        if (cur > CONFIG.despawnBehindAngle) {
          this.spawner.remove(e);
          this._commitPendingTheme();
        }
        continue;
      }

      if (e.isBall) {
        if (!e.collected && swept(prev, cur, CONFIG.collectWindowAngle) && laneDist < 0.65) {
          e.collected = true;
          this.balls++;
          this.score += CONFIG.pointsPerBall * this.mult;
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
        if (!e.collected && swept(prev, cur, CONFIG.collectWindowAngle) && laneDist < 0.6) {
          e.collected = true;
          if (e.ptype === 'steak') {
            this.extraLives = Math.min(
              CONFIG.powerups.maxExtraLives, this.extraLives + 1
            );
            this.sfx?.extraLife();
          } else {
            // Stacks: adds to whatever is already running, up to a ceiling
            // Ball Frenzy runs longer than the rest — it's a breather, and a
            // short one barely fits a single shape on screen.
            const dur = e.ptype === 'yarn'
              ? CONFIG.powerups.yarnDuration : CONFIG.powerups.duration;
            this.powers[e.ptype] = Math.min(
              CONFIG.powerups.maxDuration + (e.ptype === 'yarn' ? dur : 0),
              (this.powers[e.ptype] ?? 0) + dur
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
        // Scorch burns down whatever wanders into your lane before it gets
        // here. Checked ahead of the collision test so a hit can never land
        // on something that should already be ash.
        if (this.has('scorch') && !e.collected &&
            cur < 0 && cur > -CONFIG.powerups.scorchWindow &&
            laneDist < CONFIG.powerups.scorchLaneDist) {
          e.collected = true;
          e.group.getWorldPosition(_v);
          this.fx?.scorch(_v);
          this.spawner.remove(e);
          continue;
        }
        const hitLat = e.hitbox.lat + CONFIG.dogHitbox.lat;
        const hitAng = e.hitbox.ang + CONFIG.dogHitbox.ang;
        if (swept(prev, cur, hitAng) && laneDist < hitLat) {
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

  // Commit to a world: swap props, colors and scenery, and announce it.
  _enterTheme(theme) {
    this.theme = theme;
    this.stagesLeftInTheme = theme.rare || this.rareTest ? 1 : this._rollThemeStages();
    this.spawner.setTheme(theme);
    this.onThemeChange?.(theme);
    this.ui.showStageBanner(this.stage, theme.label, theme.rare);
    if (theme.rare) this.sfx?.rareStage(); else this.sfx?.newTheme();
  }

  // Hitting one pane takes the whole wall out. Leaving the other panes
  // standing looked like you'd found the one weak spot, when the point is
  // that the runner is going too fast for a patio door to matter.
  _shatterGlass() {
    for (const g of [...this.spawner.entities]) {
      if (!g.isGlass) continue;
      g.group.getWorldPosition(_v);
      this.fx?.glassBurst(_v);
      this.spawner.remove(g);
    }
  }

  // Called the moment the player clears a door gate (or it passes them by).
  _commitPendingTheme() {
    if (!this.pendingTheme) return;
    const t = this.pendingTheme;
    this.pendingTheme = null;
    this._enterTheme(t);
  }

  _survivesHit(e) {
    if (CONFIG.invincible) return true;   // dev toggle
    if (this.invulnTimer > 0) return true;
    // Blast Off: you're airborne, so the obstacle simply isn't in your way.
    // No crash FX and the prop is left standing — you fly over it.
    if (this.has('rocket')) return true;
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
    // Rare stages. These all fell through to 'spinout' before, which made
    // three whole worlds crash the same way.
    obCloudBank: 'bounce', obGoldenBell: 'bounce',
    obPillar: 'flatten', obAngelStatue: 'flatten',
    obHarp: 'tangle', obGate: 'tangle',
    obAngelGnome: 'spinout',
    obLavaRock: 'flatten', obCauldron: 'flatten', obDemonDoghouse: 'flatten',
    obSkullPile: 'trip', obPitchfork: 'tangle', obFireGeyser: 'bounce',
    obDemonGnome: 'spinout',
    obAsteroid: 'flatten', obSatellite: 'tangle', obSpaceRock: 'trip',
    obUFO: 'spinout',
    obAnchor: 'flatten', obTreasureChest: 'trip', obSeaUrchin: 'bounce',
    obGiantClam: 'bounce', obCoral: 'spinout', obJellyfish: 'tangle',
    obDoorPanel: 'flatten',
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
    // Best is now SCORE, not raw distance — score is what the run is judged
    // on, and it already includes the speed you were carrying plus pickups.
    const s = Math.floor(this.score);
    this.isNewBest = s > this.best && s > 0;
    if (this.isNewBest) {
      this.best = s;
      localStorage.setItem('fetchrun.best', String(s));
    }
    this.ui.recordRun(this);
    this.ui.showDeath(this);
  }
}
