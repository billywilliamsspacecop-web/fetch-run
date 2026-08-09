import { Vector3 } from 'three';
import { CONFIG } from './config.js';
import { laneAlpha, surfacePivot } from './world.js';
import { Spawner } from './obstacles.js';
import { THEMES, RARE_THEMES, RARITY, pickNextTheme, resetThemeHistory } from './themes.js';
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

// The quarry aims to be lined up on its doorway this far into the wall's
// approach — 0.45 means "be standing in the gap by the time the wall is 45% of
// the way here", leaving better than half the run-up as margin. Everything
// after that is the deadline tightening (see _updateSquirrel).
const SQ_GATE_CLOSE = 0.45;

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

  // How many stages a world holds for. The world-length slider sets the
  // ceiling for a COMMON world; rarer tiers scale it down (see RARITY), and
  // rare/epic collapse to a single stage so they stay an event.
  _rollThemeStages(theme = this.theme) {
    if (this.rareTest) return 1;
    const scale = RARITY[theme?.rarity]?.stageScale ?? 1;
    if (scale === 0) return 1;
    const b = Math.max(1, Math.round(CONFIG.themeStagesMax * scale));
    const a = Math.min(CONFIG.themeStagesMin, b);
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
    // Per-run telemetry, harvested by UI.recordRun into the lifetime stats
    this.topSpeed = 0;      // rad/s, converted to mph for display
    this.themesSeen = [];   // every world this run passed through, in order
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
    this.powersLost = null;  // what the last hit knocked off, for the FX
    this.rocketTimer = 0;    // Blast Off's clock (stacking model only)
    this.staggerTimer = 0;   // post-strip speed dip
    this.extraLives = 0;    // steaks bank up, also stackable
    this.invulnTimer = 0;   // grace after a steak save
    // Themed levels: start in the first theme, move on after 2-4 stages
    this.themeIndex = 0;
    this.rareIndex = 0;
    resetThemeHistory(); // every run gets the full spread of worlds again
    this.theme = this.rareTest ? RARE_THEMES[0] : THEMES[0];
    // The starting world never goes through _enterTheme, so log it here or
    // the backyard would be the one world the stats never saw.
    this.themesSeen = [this.theme.id];
    this.pendingTheme = null; // world waiting behind a door gate
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
    // together is 4x, which is the payoff for a lucky double pickup. Under
    // stacking, extra copies of Golden Bone keep adding — with falloff, and
    // under a hard ceiling, or a lucky run stops being a score and becomes a
    // lottery ticket.
    this.mult = 1;
    if (this.has('zoomies')) this.mult *= 2;
    if (this.has('goldbone')) this.mult *= 1 + this.stackValue('goldbone');
    this.mult = Math.min(this.mult, CONFIG.powerups.maxMult);

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
        } else {
          // Weighted by rarity tier — see pickNextTheme in themes.js.
          next = pickNextTheme(this.theme);
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
    // something you feel rather than just a number in the corner. Capped:
    // powers persist under stacking, so without a ceiling a long clean run
    // compounds this into a speed no one can read a row at.
    if (this.has('goldbone')) {
      // Compounding per stack, so a second bone is a second helping of speed
      // rather than a rounding error. The cap is what holds it in.
      const boost = Math.pow(CONFIG.powerups.goldboneSpeedBump, 1 + this.stackValue('goldbone'));
      this.speed *= Math.min(CONFIG.powerups.maxSpeedMult, boost);
    }
    // The stagger from losing a stack: a hard dip that winds back up. Applied
    // last so it drags whatever the powers just did to your speed, and so a
    // fast run gets a proportionally bigger jolt out of it.
    if (this.staggerTimer > 0) {
      const back = 1 - this.staggerTimer / CONFIG.powerups.stripRecover;
      this.speed *= CONFIG.powerups.stripSlow + (1 - CONFIG.powerups.stripSlow) * back;
    }
    // Recorded after the powerup modifiers, so a Golden Bone sprint counts
    // toward your fastest-ever — it's speed you actually travelled at.
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    // Powerup timers. Under STACKING almost nothing has a clock: a power is a
    // count of stacks and it lasts until an obstacle takes it off you. The
    // exception is Blast Off — see rocketSecondsPerStack. Classic mode counts
    // every power down independently.
    if (this.stacking) {
      if (this.powers.rocket) {
        this.rocketTimer -= dt;
        if (this.rocketTimer <= 0) {
          // One stack burns out; if more are banked, the next one lights.
          this.powers.rocket -= 1;
          if (this.powers.rocket <= 0) delete this.powers.rocket;
          else this.rocketTimer = CONFIG.powerups.rocketSecondsPerStack;
          this.ui.updateHUD(this);
        }
      }
    } else {
      for (const type of Object.keys(this.powers)) {
        this.powers[type] -= dt;
        if (this.powers[type] <= 0) delete this.powers[type];
      }
    }
    if (this.staggerTimer > 0) this.staggerTimer -= dt;
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
        // Each shape costs a stack of Frenzy. It is the one power that stops
        // obstacles spawning entirely, so nothing else can ever end it — left
        // uncharged under stacking the run would simply never be losable.
        const span = this.spawner.spawnBallRow(this.spin);
        this._spendCharge('yarn');
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
          (magnet ? laneDist < CONFIG.powerups.magnetLaneDist * this.stackValue('magnet') : true)) {
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
          if (this.stacking) {
            // THE LIFE CYCLE, exactly: 0 powers held -> a hit kills; 1+ powers
            // held -> a hit strips the lot and you keep running. Steak used to
            // skip this pool entirely and bank a separate extraLives counter,
            // which meant a run holding only banked steaks and zero powers
            // still survived a hit — a silent third state that broke the rule.
            // Steak is just another stack now, and it was always "an extra
            // life" in spirit, so folding it into the pool that IS your extra
            // life costs it nothing.
            const held = this.powers[e.ptype] ?? 0;
            if (held >= CONFIG.powerups.maxStacks) {
              // At the cap the pickup pays out score instead of being
              // swallowed — grabbing something and getting visibly nothing
              // reads as a bug, not as a ceiling.
              this.score += CONFIG.powerups.cappedPickupBonus * this.mult;
              this.sfx?.collect(3);
            } else {
              this.powers[e.ptype] = held + 1;
              // First rocket lights the clock; later ones just bank another
              // burn, so three of them is three flights, not one long one.
              if (e.ptype === 'rocket' && held === 0) {
                this.rocketTimer = CONFIG.powerups.rocketSecondsPerStack;
              }
              this.sfx?.[e.ptype === 'steak' ? 'extraLife' : 'powerup']();
            }
          } else if (e.ptype === 'steak') {
            // Classic mode: steak keeps its original standalone-life behavior.
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
            cur < 0 && cur > -CONFIG.powerups.scorchWindow * this.stackValue('scorch') &&
            laneDist < CONFIG.powerups.scorchLaneDist) {
          e.collected = true;
          e.group.getWorldPosition(_v);
          this.fx?.scorch(_v);
          this.spawner.remove(e);
          continue;
        }
        // this.dogHitbox, not CONFIG.dogHitbox — Shrink makes the runner's
        // own half of the test smaller. The obstacle's measured box is
        // untouched; only the half the player controls moves.
        const box = this.dogHitbox;
        const hitLat = e.hitbox.lat + box.lat;
        const hitAng = e.hitbox.ang + box.ang;
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

  // Is a power currently active? True in either model — under stacking the
  // stored number is a stack count, under classic it's seconds remaining.
  has(type) {
    return (this.powers[type] ?? 0) > 0;
  }

  // The rings model, read live so the settings toggle takes effect mid-run.
  get stacking() {
    return CONFIG.powerups.mode === 'stack';
  }

  // How many copies of a power are held. Classic mode has no such notion —
  // one timer is one power — so it always answers 1 while the power runs.
  stacks(type) {
    if (!this.powers[type]) return 0;
    return this.stacking ? this.powers[type] : 1;
  }

  // What those stacks are WORTH, as a multiple of a single stack. Extra copies
  // pay less than the first (stackFalloff) so three of something is a clearly
  // better version of it rather than three times the thing.
  stackValue(type) {
    const n = this.stacks(type);
    if (n <= 0) return 0;
    return 1 + (n - 1) * CONFIG.powerups.stackFalloff;
  }

  // Total powers held — the "how many lives is this worth" number, and what
  // the aura rings and the HUD both read.
  get powerCount() {
    return Object.values(this.powers).reduce((a, n) => a + (n > 0 ? 1 : 0), 0);
  }

  // Spend one stack of a CHARGE power (Zoomies, Blast Off, Ball Frenzy). These
  // three can never be ended by a hit — they exist to stop hits happening — so
  // the obstacle they carry you past is what uses them up instead.
  _spendCharge(type) {
    if (!this.stacking || !this.powers[type]) return;
    this.powers[type] -= 1;
    if (this.powers[type] <= 0) delete this.powers[type];
    this.ui.updateHUD(this);
  }

  // The runner's hitbox after Shrink. Measured props aren't touched — only the
  // dog gets smaller, which is the half of the collision the player controls.
  get dogHitbox() {
    const n = this.stacks('shrink');
    if (n <= 0) return CONFIG.dogHitbox;
    const k = Math.max(
      CONFIG.powerups.shrinkFloor, 1 - n * CONFIG.powerups.shrinkPerStack
    );
    return { lat: CONFIG.dogHitbox.lat * k, ang: CONFIG.dogHitbox.ang * k };
  }

  // Commit to a world: swap props, colors and scenery, and announce it.
  _enterTheme(theme) {
    this.theme = theme;
    this.themesSeen?.push(theme.id);
    this.stagesLeftInTheme = this._rollThemeStages(theme);
    this.spawner.setTheme(theme);
    this.onThemeChange?.(theme);
    this.ui.showStageBanner(this.stage, theme.label, theme.rarity);
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

  // The order here IS the design. Powers that stop the collision happening
  // get to act first and spend themselves doing it; only once none of those
  // are left does the stack itself get cashed in as a life.
  _survivesHit(e) {
    if (CONFIG.invincible) return true;   // dev toggle
    if (this.invulnTimer > 0) return true;
    // Blast Off: you're airborne, so the obstacle simply isn't in your way.
    // No crash FX and the prop is left standing — you fly over it.
    // Blast Off doesn't spend a charge — it runs on a clock (see the timer in
    // _updateRun). Flying is total safety with nothing to spend it against, so
    // charging it by obstacles avoided just meant a sparse stretch of track
    // bought you most of a world in the air.
    if (this.has('rocket')) return true;
    if (this.has('zoomies')) {
      // Invincible: plow straight through
      e.group.getWorldPosition(_v);
      this.fx?.crash(_v);
      this.spawner.remove(e);
      this._spendCharge('zoomies');
      return true;
    }
    // THE RINGS RULE. Holding anything at all is a life: the hit lands, every
    // power you were carrying comes off at once, and you keep running. Get hit
    // again before you've picked anything back up and that one is fatal.
    //
    // Deliberately ahead of the banked steak lives: powers are the thing you
    // can see orbiting you and the thing you just spent the last ten seconds
    // collecting, so they're what a player expects to lose first. A steak is a
    // deeper reserve, and it should outlast the frenzy rather than be quietly
    // eaten before it.
    if (this.stacking && this.powerCount > 0) {
      this.powersLost = { ...this.powers };  // read by the FX + HUD flash
      this.powers = {};
      this.rocketTimer = 0;
      this.invulnTimer = CONFIG.powerups.stripInvuln;
      this.staggerTimer = CONFIG.powerups.stripRecover;
      this.sfx?.save();
      this.dogPivot.children[0]?.getWorldPosition(_v);
      this.fx?.crash(_v);
      this.fx?.powerBurst?.(_v, this.powersLost);
      this.spawner.remove(e);
      this.ui.updateHUD(this);
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

    // DOOR GATES ARE NOT AN OBSTACLE FIELD. A wall across the track with one
    // gap in it has exactly one right answer, and the generic threat scan
    // below could not find it for two reasons: it counted the doorway itself
    // as a threat (a doorway is an entity like any other, it just carries no
    // hitbox), and even discounting that, every lane scored danger, so the
    // "pick the safest" tie-break resolved to a coin flip among five panels.
    // The quarry ran into the front of the house about four times in five.
    //
    // So gates get their own pass, ahead of everything else: the doorway is
    // sought from the moment the wall exists, and once chosen the lane is HELD
    // until the wall is behind it. No dodging, no idle wander; the only thing
    // that matters between here and the threshold is being lined up on the gap.
    let door = null, doorCur = 0;
    for (const e of this.spawner.entities) {
      if (!e.isDoor) continue;
      const cur = this.spin + e.theta0 - sqT;
      if (cur > 0.02) continue; // already through it
      // Nearest gap wins, so it doesn't cut across the whole track for a
      // doorway no better than the one beside it.
      if (door === null || Math.abs(e.lane - this.sqLane) < Math.abs(door - this.sqLane)) {
        door = e.lane;
        doorCur = cur;
      }
    }
    if (door !== null) {
      this.sqTargetLane = door;
      // Crossing to the doorway runs on a DEADLINE, not the fixed lane-change
      // rate the ordinary dodge uses. A fixed rate takes about the same 0.45s
      // to cross the track however fast the world is moving, so past roughly
      // 700mph the wall arrived while the quarry was still over a solid panel
      // — it clipped straight through the front of the house, and anyone
      // following it as a tell ran into the panel and died. That is what was
      // still broken after the last fix: the lane CHOICE was right all along,
      // it just wasn't reached in time.
      //
      // Closing a fraction of the remaining gap per frame, where the fraction
      // is set by how long is actually left, makes the crossing take a fixed
      // share of the approach at any speed: a slow glide when the wall is far
      // off, and as urgent as it needs to be when it isn't.
      const timeLeft = -doorCur / Math.max(0.05, this.speed);
      const closeBy = timeLeft * SQ_GATE_CLOSE;
      this.sqLane += (door - this.sqLane) * (closeBy <= dt ? 1 : Math.min(1, dt / closeBy));
      this.squirrelPivot.rotation.x = sqT;
      this.squirrelPivot.rotation.z = laneAlpha(this.sqLane);
      return;
    }

    // Threat scan: anything about to cross the squirrel's line
    const danger = new Array(CONFIG.lanes).fill(0);
    for (const e of this.spawner.entities) {
      const cur = this.spin + e.theta0 - sqT;
      if (cur < -0.35 || cur > 0.04) continue;
      // Doors are gaps, not props — counting one as a threat is what used to
      // push the quarry OUT of the only lane it could survive.
      if (!e.isBall && !e.isPower && !e.isDoor) danger[e.lane] += cur > -0.12 ? 10 : 3;
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
    this._tweenSquirrel(dt);
  }

  _tweenSquirrel(dt) {
    const diff = this.sqTargetLane - this.sqLane;
    const k = 1 - Math.exp(-dt / (CONFIG.laneChangeTime * 0.7));
    this.sqLane += Math.abs(diff) < 0.001 ? diff : diff * k;
    this.squirrelPivot.rotation.x = CONFIG.squirrelTheta;
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
    // Beach / street / farm / snow / graveyard / candy. Same rule as above:
    // soft and springy bounces you, low and rigid trips you, tall and solid
    // flattens you, anything you'd get caught IN tangles you.
    obSandcastle: 'bounce', obCooler: 'trip', obDeckChair: 'tangle',
    obBeachUmbrella: 'spinout', obLifeguardStand: 'flatten',
    obFireHydrant: 'flatten', obMailbox: 'flatten', obNewsBox: 'trip',
    obRoadBarrier: 'tangle',
    obHayBale: 'bounce', obTrough: 'trip', obScarecrow: 'tangle',
    obMilkChurn: 'spinout', obWheelbarrow: 'spinout',
    obSnowman: 'bounce', obSnowdrift: 'bounce', obSled: 'trip',
    obLogPile: 'trip', obIceBlock: 'flatten',
    obTombstone: 'flatten', obCoffin: 'trip', obPumpkin: 'bounce',
    obGumdrop: 'bounce', obCupcake: 'bounce', obLollipop: 'spinout',
    obCandyCane: 'tangle', obChocFountain: 'flatten',
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
