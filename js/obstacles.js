import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { surfacePivot, laneAlpha } from './world.js';

const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// --- one builder per obstacle type (all ~1 unit tall, sit on the surface) ---
// The camera looks from +Z, so faces/details point +Z.

function makeGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.55, 14), lambert(COLORS.gnomeBody));
  body.position.y = 0.28;
  g.add(body);

  // Arms hugging the belly
  const armGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 10);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, lambert(COLORS.gnomeArms));
    arm.position.set(side * 0.28, 0.38, 0.08);
    arm.rotation.z = side * 0.9;
    arm.rotation.x = -0.4;
    g.add(arm);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 11), lambert(COLORS.gnomeSkin));
  head.position.y = 0.68;
  g.add(head);

  // Face toward the camera: beard, nose, eyes
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), lambert(COLORS.gnomeBeard));
  beard.scale.set(1, 0.85, 0.7);
  beard.position.set(0, 0.56, 0.12);
  g.add(beard);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lambert(0xe0a37c));
  nose.position.set(0, 0.68, 0.2);
  g.add(nose);
  const eyeGeo = new THREE.SphereGeometry(0.028, 9, 7);
  const eyeMat = lambert(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.075, 0.74, 0.18);
    g.add(eye);
  }

  // Pointy hat with a brim
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 14), lambert(COLORS.gnomeHat));
  brim.position.y = 0.8;
  g.add(brim);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.55, 14), lambert(COLORS.gnomeHat));
  hat.position.y = 1.06;
  hat.rotation.y = 0.3;
  g.add(hat);
  return g;
}

function makeBasket() {
  const g = new THREE.Group();
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), lambert(COLORS.blanket));
  blanket.position.y = 0.03;
  blanket.rotation.y = 0.4;
  g.add(blanket);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), lambert(COLORS.basket));
  box.position.y = 0.3;
  g.add(box);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 18, Math.PI), lambert(COLORS.basket));
  handle.position.y = 0.52;
  g.add(handle);
  return g;
}

function makeSprinkler() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.18, 13), lambert(COLORS.sprinkler));
  base.position.y = 0.09;
  g.add(base);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10), lambert(COLORS.sprinkler));
  pipe.position.y = 0.4;
  g.add(pipe);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.08, 10), lambert(COLORS.sprinkler));
  nozzle.position.y = 0.68;
  g.add(nozzle);

  // Water: three rotating arcs of droplets tracing a spray parabola
  const spray = new THREE.Group();
  const waterMat = new THREE.MeshLambertMaterial({
    color: COLORS.water, transparent: true, opacity: 0.75, flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    for (let d = 0; d < 5; d++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.045 + d * 0.008, 8, 6), waterMat);
      const dist = 0.12 + d * 0.14;
      drop.position.set(dist, 0.7 + 0.22 * d - 0.055 * d * d, 0);
      arm.add(drop);
    }
    spray.add(arm);
  }
  g.add(spray);
  g.userData.spray = spray; // animated
  return g;
}

function makeBench() {
  const g = new THREE.Group();
  const wood = lambert(COLORS.bench);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.4), wood);
  seat.position.y = 0.42;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.35, 0.07), wood);
  back.position.set(0, 0.68, 0.18);
  back.rotation.x = -0.15;
  g.add(back);
  for (const x of [-0.42, 0.42]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.34), wood);
    leg.position.set(x, 0.21, 0);
    g.add(leg);
  }
  return g;
}

function makeBall() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), lambert(COLORS.ball));
  // Crossed seam rings — reads as a tennis ball at low poly
  const seamGeo = new THREE.TorusGeometry(0.27, 0.02, 6, 28);
  const seamMat = lambert(COLORS.ballSeam);
  const seam1 = new THREE.Mesh(seamGeo, seamMat);
  seam1.rotation.x = 1.05;
  seam1.rotation.y = 0.5;
  const seam2 = new THREE.Mesh(seamGeo, seamMat);
  seam2.rotation.x = -1.05;
  seam2.rotation.y = -0.5;
  ball.add(seam1, seam2);
  ball.position.y = 0.45;
  g.add(ball);
  g.userData.ball = ball; // animated bob/spin
  return g;
}

// --- powerup pickups: float higher and spin so they read as special ---

function makeFrisbee() {
  // Zoomies: orange disc like Kona's real frisbee
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.07, 20), lambert(0xe8622e));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 24), lambert(0xd14f20));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.02;
  disc.add(rim);
  disc.position.y = 0.6;
  disc.rotation.z = 0.35;
  g.add(disc);
  g.userData.ball = disc;
  return g;
}

function makeBone() {
  // Golden Bone: 2x score
  const g = new THREE.Group();
  const boneMat = lambert(0xf5c842);
  const bone = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), boneMat);
  shaft.rotation.z = Math.PI / 2;
  bone.add(shaft);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), boneMat);
      knob.position.set(sx * 0.2, sy * 0.055, 0);
      bone.add(knob);
    }
  }
  bone.position.y = 0.6;
  bone.rotation.z = 0.3;
  g.add(bone);
  g.userData.ball = bone;
  return g;
}

function makeMagnet() {
  // Ball Magnet: red horseshoe, silver tips
  const g = new THREE.Group();
  const magnet = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 10, 20, Math.PI), lambert(0xd23c3c));
  magnet.add(arc);
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), lambert(0xd8dde2));
    tip.position.set(sx * 0.2, -0.09, 0);
    magnet.add(tip);
  }
  magnet.position.y = 0.62;
  g.add(magnet);
  g.userData.ball = magnet;
  return g;
}

function makeYarn() {
  // Yarn Ball (cat toy): ball frenzy
  const g = new THREE.Group();
  const yarn = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 13), lambert(0xd06bc2));
  const strandGeo = new THREE.TorusGeometry(0.26, 0.022, 6, 24);
  const strandMat = lambert(0xb84fa8);
  for (const [rx, ry] of [[0.6, 0.3], [1.4, 1.1], [2.2, 0.2]]) {
    const s = new THREE.Mesh(strandGeo, strandMat);
    s.rotation.set(rx, ry, 0);
    yarn.add(s);
  }
  // Loose strand trailing off
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), strandMat);
  tail.position.set(0.2, -0.18, 0);
  tail.rotation.z = 0.8;
  yarn.add(tail);
  yarn.position.y = 0.6;
  g.add(yarn);
  g.userData.ball = yarn;
  return g;
}

function makeSteak() {
  // Steak: extra life (very rare)
  const g = new THREE.Group();
  const steak = new THREE.Group();
  const meat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 11), lambert(0xb04438));
  meat.scale.set(1.15, 0.35, 0.85);
  steak.add(meat);
  const fat = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 22), lambert(0xf0e0cc));
  fat.rotation.x = Math.PI / 2;
  fat.scale.set(1.12, 0.85, 1);
  steak.add(fat);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), lambert(0xf3eee2));
  bone.position.set(0.26, 0, 0.05);
  steak.add(bone);
  steak.position.y = 0.62;
  steak.rotation.z = 0.25;
  g.add(steak);
  g.userData.ball = steak;
  return g;
}

// Weighted roster — steak is the jackpot
const POWERUPS = [
  { type: 'zoomies', make: makeFrisbee, weight: 27 },
  { type: 'magnet', make: makeMagnet, weight: 27 },
  { type: 'goldbone', make: makeBone, weight: 20 },
  { type: 'yarn', make: makeYarn, weight: 20 },
  { type: 'steak', make: makeSteak, weight: 6 },
];
const POWERUP_TOTAL_WEIGHT = POWERUPS.reduce((a, p) => a + p.weight, 0);

function pickPowerup() {
  let roll = Math.random() * POWERUP_TOTAL_WEIGHT;
  for (const p of POWERUPS) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return POWERUPS[0];
}

// --- river event: water across every lane, safe bridge on one ---

const RIVER_HALF = 0.2; // lateral half-width in radians (covers all lanes + margin)

export function makeRiver(bridgeLane) {
  const R = CONFIG.planetRadius;
  const g = new THREE.Group();
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x4fa8d8, flatShading: true, transparent: true, opacity: 0.9,
  });
  // Tiles hug the sphere laterally: each is rotated down the curve
  const step = 0.03;
  for (let a = -RIVER_HALF; a <= RIVER_HALF + 0.001; a += step) {
    const laneAlphaAtTile = a;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(R * step + 0.06, 0.1, 0.85), waterMat);
    tile.position.set(Math.sin(a) * R, Math.cos(a) * R - R + 0.05, 0);
    tile.rotation.z = -a;
    g.add(tile);
  }
  // Bridge planks + rails on the safe lane
  const bridgeAlpha = laneAlpha(bridgeLane);
  const wood = lambert(COLORS.bench);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.09, 1.0), wood);
  deck.position.set(Math.sin(bridgeAlpha) * R, Math.cos(bridgeAlpha) * R - R + 0.16, 0);
  deck.rotation.z = -bridgeAlpha;
  g.add(deck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 1.0), wood);
    rail.position.set(
      Math.sin(bridgeAlpha) * R + side * 0.45,
      Math.cos(bridgeAlpha) * R - R + 0.28,
      0
    );
    rail.rotation.z = -bridgeAlpha;
    g.add(rail);
  }
  return g;
}

// --- intro fence: spans the lanes, smashed through at the end of the short ---

export function makeFence() {
  const R = CONFIG.planetRadius;
  const g = new THREE.Group();
  const wood = lambert(0xb08a5a);
  const step = 0.028;
  for (let a = -RIVER_HALF; a <= RIVER_HALF + 0.001; a += step) {
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.06), wood);
    picket.position.set(Math.sin(a) * R, Math.cos(a) * R - R + 0.42, 0);
    picket.rotation.z = -a;
    g.add(picket);
  }
  for (const railY of [0.28, 0.62]) {
    for (let a = -RIVER_HALF; a <= RIVER_HALF - 0.05 + 0.001; a += 0.05) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05 + 0.05, 0.09, 0.05), wood);
      const mid = a + 0.025;
      rail.position.set(Math.sin(mid) * R, Math.cos(mid) * R - R + railY, 0.05);
      rail.rotation.z = -mid;
      g.add(rail);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Per-type hitboxes: lat in lane units, ang in radians along travel direction.
// The dog's own hitbox (CONFIG.dogHitbox) is added on top at collision time.
const OBSTACLE_TYPES = [
  { make: makeGnome, hitbox: { lat: 0.3, ang: 0.018 } },
  { make: makeBasket, hitbox: { lat: 0.38, ang: 0.028 } },
  { make: makeSprinkler, hitbox: { lat: 0.28, ang: 0.018 } },
  { make: makeBench, hitbox: { lat: 0.48, ang: 0.014 } },
];

// Manages spawned entities on the globe. Each entry:
// { pivot, group, lane, theta0, isBall, collected, hitbox }
export class Spawner {
  constructor(planetGroup) {
    this.planetGroup = planetGroup;
    this.entities = [];
  }

  // Spawn a row ahead of the horizon. `spin` is current planet rotation.
  spawnRow(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const lanes = [...Array(CONFIG.lanes).keys()];
    const shuffled = lanes.sort(() => Math.random() - 0.5);

    const obstacleLanes = [shuffled[0]];
    if (Math.random() < CONFIG.doubleSpawnChance) obstacleLanes.push(shuffled[1]);

    const usedLanes = [...obstacleLanes];
    for (const lane of obstacleLanes) {
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this._add(type.make(), lane, theta0, { hitbox: type.hitbox });
    }
    if (Math.random() < CONFIG.ballChance) {
      const freeLane = shuffled.find((l) => !usedLanes.includes(l));
      if (freeLane !== undefined) {
        usedLanes.push(freeLane);
        this._add(makeBall(), freeLane, theta0, { isBall: true });
      }
    }
    // Rare powerup in a still-free lane
    if (Math.random() < CONFIG.powerups.chance) {
      const freeLane = shuffled.find((l) => !usedLanes.includes(l));
      if (freeLane !== undefined) {
        const p = pickPowerup();
        this._add(p.make(), freeLane, theta0, { isPower: true, ptype: p.type });
      }
    }
  }

  // During Yarn Ball frenzy: rows are all tennis balls, no obstacles
  spawnBallRow(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const lanes = [...Array(CONFIG.lanes).keys()].sort(() => Math.random() - 0.5);
    for (const lane of lanes.slice(0, 3)) {
      this._add(makeBall(), lane, theta0, { isBall: true });
    }
  }

  spawnRiver(spin) {
    const theta0 = -CONFIG.spawnAheadAngle - spin;
    const bridgeLane = Math.floor(Math.random() * CONFIG.lanes);
    const group = makeRiver(bridgeLane);
    const pivot = surfacePivot(theta0, 0, group);
    this.planetGroup.add(pivot);
    this.entities.push({
      pivot, group, lane: bridgeLane, theta0,
      isBall: false, isPower: false, isRiver: true, bridgeLane,
      ptype: null, hitbox: null, collected: false,
    });
  }

  _add(group, lane, theta0, extra = {}) {
    group.traverse((o) => {
      if (o.isMesh && !o.material.transparent) o.castShadow = true;
    });
    const pivot = surfacePivot(theta0, laneAlpha(lane), group);
    this.planetGroup.add(pivot);
    this.entities.push({
      pivot, group, lane, theta0,
      isBall: false, isPower: false, ptype: null, hitbox: null, collected: false,
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

  animate(t) {
    for (const e of this.entities) {
      const float = e.group.userData.ball;
      if ((e.isBall || e.isPower) && !e.collected && float) {
        const baseY = e.isPower ? 0.62 : 0.45;
        float.position.y = baseY + Math.sin(t * 4 + e.theta0 * 10) * 0.12;
        float.rotation.y = t * (e.isPower ? 4.5 : 3);
      }
      const spray = e.group.userData.spray;
      if (spray) spray.rotation.y = t * 2.4;
    }
  }
}
