import { CONFIG } from './config.js';
import { surfacePivot, laneAlpha } from './world.js';
import { THEMES } from './themes.js';
import * as P from './props.js';

// Powerups are shared across every theme (deliberately — they're the game's
// vocabulary, not set dressing). Steak is the rare jackpot.
const POWERUPS = [
  { type: 'zoomies', make: P.powerFrisbee, weight: 27 },
  { type: 'magnet', make: P.powerMagnet, weight: 27 },
  { type: 'goldbone', make: P.powerBone, weight: 20 },
  { type: 'yarn', make: P.powerYarn, weight: 20 },
  { type: 'steak', make: P.powerSteak, weight: 6 },
];
const TOTAL_WEIGHT = POWERUPS.reduce((a, p) => a + p.weight, 0);

function pickPowerup() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const p of POWERUPS) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return POWERUPS[0];
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

  // Spawn a row ahead of the horizon. `spin` is current planet rotation.
  spawnRow(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const lanes = [...Array(CONFIG.lanes).keys()];
    const shuffled = lanes.sort(() => Math.random() - 0.5);

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
    if (Math.random() < CONFIG.ballChance) {
      const free = shuffled.find((l) => !used.includes(l));
      if (free !== undefined) {
        used.push(free);
        this._add(this.theme.collectible(), free, theta0, { isBall: true });
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

  // A wall across every lane except one or two doorways. Used as the
  // threshold into the house stage: pick a door and burst through, hit a
  // panel and it's a wipeout. Doors carry no hitbox — they're the gap.
  spawnDoorGate(spin, doorLanes) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    for (let lane = 0; lane < CONFIG.lanes; lane++) {
      if (doorLanes.includes(lane)) {
        this._add(P.makeDoorway(), lane, theta0, { isDoor: true });
      } else {
        const panel = P.obDoorPanel();
        const { halfW, halfD } = { halfW: 0.5, halfD: 0.11 };
        const laneWidthUnits = CONFIG.laneAngle * CONFIG.planetRadius;
        this._add(panel, lane, theta0, {
          hitbox: {
            lat: (halfW / laneWidthUnits) * 0.84,
            ang: (halfD / CONFIG.planetRadius) * 0.84,
          },
          kind: 'obDoorPanel',
        });
      }
    }
  }

  // During Yarn Ball frenzy: rows are all collectibles, no obstacles
  spawnBallRow(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const lanes = [...Array(CONFIG.lanes).keys()].sort(() => Math.random() - 0.5);
    for (const lane of lanes.slice(0, 3)) {
      this._add(this.theme.collectible(), lane, theta0, { isBall: true });
    }
  }

  _add(group, lane, theta0, extra = {}) {
    group.traverse((o) => {
      if (o.isMesh && !o.material.transparent) o.castShadow = true;
    });
    const pivot = surfacePivot(theta0, laneAlpha(lane), group);
    this.planetGroup.add(pivot);
    this.entities.push({
      pivot, group, lane, theta0,
      isBall: false, isPower: false, isDoor: false,
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
      // Obstacle working parts (sprinkler spray, fountain jets)
      if (ud.spin) ud.spin.rotation.y = t * 2.4;
    }
  }
}
