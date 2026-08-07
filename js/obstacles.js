import { CONFIG } from './config.js';
import { surfacePivot, laneAlpha } from './world.js';
import { THEMES, playableEdgeAlpha, HOUSE_WALL_NEAR } from './themes.js';
import * as P from './props.js';

// Powerups are shared across every theme (deliberately — they're the game's
// vocabulary, not set dressing). Steak is the rare jackpot.
const POWERUPS = [
  { type: 'zoomies', make: P.powerFrisbee, weight: 19 },
  { type: 'magnet', make: P.powerMagnet, weight: 19 },
  { type: 'goldbone', make: P.powerBone, weight: 15 },
  { type: 'yarn', make: P.powerYarn, weight: 14 },
  // The themed three sit a notch below the staples: they're stronger, and
  // they should still feel like a find when one turns up.
  { type: 'rocket', make: P.powerRocket, weight: 10 },
  { type: 'scorch', make: P.powerFlame, weight: 10 },
  { type: 'steak', make: P.powerSteak, weight: 5 },
  // Slo-Mo and Shrink share a slot — they do the same job (survive a row you
  // can't dodge) and only one of them makes sense per model. Slo-Mo has no
  // expiry to save it under stacking, so half speed would be permanent and
  // would cancel the speed curve outright; Shrink shrinks you instead.
  { type: 'shrink', make: P.powerShrink, weight: 10, modes: ['stack'] },
  { type: 'slowmo', make: P.powerHourglass, weight: 10, modes: ['classic'] },
];

function pickPowerup() {
  const mode = CONFIG.powerups.mode;
  const pool = POWERUPS.filter((p) => !p.modes || p.modes.includes(mode));
  const total = pool.reduce((a, p) => a + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of pool) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return pool[0];
}

// Manages spawned entities on the globe. Each entry:
// { pivot, group, lane, theta0, isBall, isPower, ptype, hitbox, collected }
export class Spawner {
  constructor(planetGroup) {
    this.planetGroup = planetGroup;
    this.entities = [];
    this.theme = THEMES[0];
  }

  setTheme(theme) {
    this.theme = theme;
  }

  // 0 at base speed, 1 at spawnRampSpeed and beyond. Several spawn rates ride
  // this so they can scale with how fast the world is actually moving.
  _speedRamp(speed) {
    return Math.min(1, Math.max(0,
      (speed - CONFIG.baseSpeed) / (CONFIG.spawnRampSpeed - CONFIG.baseSpeed)));
  }

  // Spawn a row ahead of the horizon. `spin` is current planet rotation.
  // `speed` scales the tennis-ball rate (see CONFIG.ballChanceMax).
  spawnRow(spin, speed = CONFIG.baseSpeed) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const lanes = [...Array(CONFIG.lanes).keys()];
    const shuffled = lanes.sort(() => Math.random() - 0.5);

    // Dev toggle: nothing but powerups, one per row, so they can be tested
    // without dodging anything to reach them.
    if (CONFIG.powerupsOnly) {
      const p = pickPowerup();
      this._add(p.make(), shuffled[0], theta0, { isPower: true, ptype: p.type });
      return;
    }

    const obstacleLanes = [shuffled[0]];
    if (Math.random() < CONFIG.doubleSpawnChance) obstacleLanes.push(shuffled[1]);

    const used = [...obstacleLanes];
    for (const lane of obstacleLanes) {
      const set = this.theme.obstacles;
      const type = set[Math.floor(Math.random() * set.length)];
      const mesh = type.make();
      // fitScale keeps props from spilling outside their lane (see themes.js)
      if (type.fitScale && type.fitScale !== 1) mesh.scale.setScalar(type.fitScale);
      this._add(mesh, lane, theta0, { hitbox: type.hitbox, kind: type.make.name });
    }
    // Ball rate climbs with speed — see CONFIG.ballChanceMax
    const ballChance = CONFIG.ballChance +
      this._speedRamp(speed) * (CONFIG.ballChanceMax - CONFIG.ballChance);
    if (Math.random() < ballChance) {
      const free = shuffled.find((l) => !used.includes(l));
      if (free !== undefined) {
        used.push(free);
        this._add(this.theme.collectible(), free, theta0, { isBall: true });
      }
      // At speed, drop a second one in another free lane — one ball per row
      // is almost nothing when rows are flying past.
      if (Math.random() < this._speedRamp(speed) * 0.7) {
        const free2 = shuffled.find((l) => !used.includes(l));
        if (free2 !== undefined) {
          used.push(free2);
          this._add(this.theme.collectible(), free2, theta0, { isBall: true });
        }
      }
    }
    if (Math.random() < CONFIG.powerups.chance) {
      const free = shuffled.find((l) => !used.includes(l));
      if (free !== undefined) {
        const p = pickPowerup();
        this._add(p.make(), free, theta0, { isPower: true, ptype: p.type });
      }
    }
  }

  // Geometry shared by both gates (house entrance, house exit). Pieces are
  // sized to the ACTUAL lane width — a hardcoded 1.0 left daylight between
  // panels on wide screens — and the outermost pieces grow a wing that runs
  // out to the hallway walls so the row reads as one solid frontage.
  //
  // surfacePivot rotates by +alpha about Z, which maps the surface point to
  // NEGATIVE x. Lane 0 has the largest positive alpha, so it's the -x end of
  // the track and its wing extends further into -x.
  _gateMetrics() {
    const R = CONFIG.planetRadius;
    // Each piece is a flat slab tangent to the globe, so neighbours fan apart
    // as they rise: at the eave they're (R + GATE_H)/R further apart than at
    // the floor. Sizing to the lane width at ground level left daylight
    // showing through the roofline. Size to the TOP and the whole run closes.
    const width = CONFIG.laneAngle * (R + P.GATE_H) * 1.04;
    const wallReach = (playableEdgeAlpha() + HOUSE_WALL_NEAR - 2 * CONFIG.laneAngle) * R;
    const wingLen = Math.max(0, wallReach + 0.25 - width / 2); // overshoot into the wall
    const outer = CONFIG.lanes - 1;
    const sideFor = (lane) => (lane === 0 ? -1 : lane === outer ? 1 : 0);
    return { width, wingLen, sideFor };
  }

  // Collision is one lane wide, NOT the visual width: the overlap above and
  // the wing outboard both exist to close gaps, and folding either into the
  // hitbox would eat into the doorway the player is aiming for.
  _gateHitbox() {
    return { lat: 0.5 * 0.84, ang: (0.11 / CONFIG.planetRadius) * 0.84 };
  }

  // Sweep obstacles out of the way of a gate. A gate is spawned by the stage
  // clock, not the spawn clock, so it can land microseconds behind an ordinary
  // row — and at speed "microseconds behind" is the same place. That put a
  // gnome standing in the one doorway, which is an unavoidable death: the
  // panels either side are solid and the door is the only way through.
  //
  // Pickups are left alone. A ball sitting in the doorway is a bonus, not a
  // wall, and yanking it away would look like a bug of its own.
  // The window is wide enough to be a run-up, not just an anti-overlap guard:
  // meeting a gnome a tenth of a second before a wall you have to read and
  // pick a door in is the same unfair moment, just less obviously a bug.
  _clearForGate(theta0, window = 0.45) {
    for (const e of [...this.entities]) {
      if (e.isBall || e.isPower || e.isDoor) continue;
      if (Math.abs(e.theta0 - theta0) < window) this.remove(e);
    }
  }

  // A wall across every lane except one or two doorways. Used as the
  // threshold into the house stage: pick a door and burst through, hit a
  // panel and it's a wipeout. Doors carry no hitbox — they're the gap.
  spawnDoorGate(spin, doorLanes) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    this._clearForGate(theta0);
    const { width, wingLen, sideFor } = this._gateMetrics();
    for (let lane = 0; lane < CONFIG.lanes; lane++) {
      const side = sideFor(lane);
      if (doorLanes.includes(lane)) {
        this._add(P.makeDoorway(width, side, wingLen), lane, theta0, { isDoor: true });
      } else {
        this._add(P.obDoorPanel(width, side, wingLen), lane, theta0, {
          hitbox: this._gateHitbox(),
          kind: 'obDoorPanel',
        });
      }
    }
  }

  // Leaving the house: a glass wall across EVERY lane. There's no wrong lane
  // here — whichever pane you pick, you go through it — so it plays as a
  // payoff rather than one more gate to read at speed.
  spawnGlassWall(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    this._clearForGate(theta0);
    const { width, wingLen, sideFor } = this._gateMetrics();
    for (let lane = 0; lane < CONFIG.lanes; lane++) {
      this._add(P.makeGlassPane(width, sideFor(lane), wingLen), lane, theta0, {
        isDoor: true, isGlass: true,
      });
    }
  }

  // Ball Frenzy patterns. Five columns wide (one per lane), read top row
  // first — which is the row you meet FIRST, so the face arrives nose-last.
  // Nothing can hurt you during a frenzy, so the whole track is free canvas.
  static BALL_SHAPES = {
    dog: [
      [1, 0, 0, 0, 1],   // ear tips
      [1, 1, 0, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],   // eyes (gaps)
      [1, 1, 1, 1, 1],
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],   // muzzle
      [0, 0, 1, 0, 0],   // nose
    ],
    cat: [
      [1, 0, 0, 0, 1],
      [1, 1, 0, 1, 1],   // pointed ears
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],   // eyes
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],   // whisker gaps
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ],
    bone: [
      [1, 1, 0, 1, 1],
      [1, 1, 0, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 1, 0, 1, 1],
      [1, 1, 0, 1, 1],
    ],
  };

  // During Ball Frenzy: no obstacles at all, just a wall of collectibles laid
  // out as a shape. Spacing is tight enough that the figure reads as one
  // object rushing at you rather than a scatter of loose rows.
  spawnBallRow(spin) {
    const shapes = Object.keys(Spawner.BALL_SHAPES);
    const grid = Spawner.BALL_SHAPES[shapes[Math.floor(Math.random() * shapes.length)]];
    const rowGap = 0.055;
    const base = -CONFIG.spawnAheadAngle - spin;
    grid.forEach((row, r) => {
      row.forEach((on, lane) => {
        if (!on) return;
        this._add(this.theme.collectible(), lane, base - r * rowGap, { isBall: true });
      });
    });
    // How long the whole figure takes to pass, so the caller can wait it out
    return grid.length * rowGap;
  }

  _add(group, lane, theta0, extra = {}) {
    // Outline everything that spawns, from one place. Obstacles carry the
    // heaviest line because they're what you must read at speed; pickups get
    // a light one so it rims them without fighting their glow. Props that
    // outline themselves (heaven) are skipped by addOutline's own guard.
    const isPickup = extra.isBall || extra.isPower;
    P.addOutline(group, { thickness: isPickup ? 0.018 : 0.04 });
    group.traverse((o) => {
      // Outline shells are a back-face trick sitting proud of the real mesh —
      // casting from them just fattens every shadow in the stage.
      if (o.isMesh && !o.userData.isOutline && !o.material.transparent) o.castShadow = true;
    });
    const pivot = surfacePivot(theta0, laneAlpha(lane), group);
    this.planetGroup.add(pivot);
    this.entities.push({
      pivot, group, lane, theta0,
      isBall: false, isPower: false, isDoor: false, isGlass: false,
      ptype: null, hitbox: null, collected: false,
      kind: null, // obstacle builder name — picks the wipeout animation
      ...extra,
    });
  }

  remove(e) {
    this.planetGroup.remove(e.pivot);
    this.entities = this.entities.filter((x) => x !== e);
  }

  clear() {
    for (const e of [...this.entities]) this.remove(e);
  }

  // The motion half of the readability rule: pickups bob, spin and pulse;
  // obstacles sit dead still (only their own working parts move). Powerups
  // move faster and carry an orbiting ring so they read distinctly from
  // ordinary collectibles even at a glance.
  animate(t) {
    for (const e of this.entities) {
      const ud = e.group.userData;
      if (ud.pickupKind && !e.collected) {
        const isPower = ud.pickupKind === 'power';
        const phase = t * (isPower ? 3.4 : 2.6) + e.theta0 * 9;
        ud.float.position.y = (isPower ? 0.66 : 0.5) + Math.sin(phase) * (isPower ? 0.15 : 0.11);
        ud.float.rotation.y = t * (isPower ? 2.4 : 1.5);
        const pulse = 1 + Math.sin(phase * 1.6) * (isPower ? 0.09 : 0.05);
        ud.float.scale.setScalar(pulse);
        if (ud.halo) {
          // Ring counter-rotates against the item's spin so both read clearly
          ud.halo.rotation.z = -t * 1.1;
          ud.halo.scale.setScalar(1 + Math.sin(phase * 1.3) * 0.09);
          ud.halo.material.opacity = (isPower ? 0.7 : 0.5) + Math.sin(phase * 1.3) * 0.12;
        }
        if (ud.pad) {
          // Ground marker pulses opposite the item's bob, so the spot stays
          // readable even when the pickup is at the top of its float
          ud.pad.scale.setScalar(1 + Math.sin(phase + Math.PI) * 0.14);
          ud.pad.material.opacity = (isPower ? 0.4 : 0.28) + Math.sin(phase) * 0.08;
        }
        if (ud.ring) {
          ud.ring.rotation.z = t * 1.9;
          ud.ring.rotation.y = Math.sin(t * 1.1) * 0.5;
        }
      }
      // Obstacle working parts (sprinkler spray, fountain jets). The props
      // set these markers; several were never actually driven — asteroids
      // and satellites hung dead still in space, and the fire geyser's
      // flames didn't flicker.
      //
      // Phase is offset by theta0 so a row of identical props doesn't move in
      // lockstep. Bodies stay put: only the working part moves, or they start
      // reading as collectibles (see the readability rule above).
      if (ud.spin) ud.spin.rotation.y = t * 2.4;
      if (ud.tumble) {
        ud.tumble.rotation.x = t * 0.45 + e.theta0 * 3;
        ud.tumble.rotation.z = t * 0.3;
      }
      if (ud.flicker) {
        const f = 1 + Math.sin(t * 13 + e.theta0 * 21) * 0.13;
        ud.flicker.scale.set(f, 1 + Math.sin(t * 10 + e.theta0 * 17) * 0.17, f);
      }
      if (ud.sway) ud.sway.rotation.z = Math.sin(t * 1.7 + e.theta0 * 6) * 0.15;
    }
  }
}
