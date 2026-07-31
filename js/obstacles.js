import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { surfacePivot, laneAlpha } from './world.js';

const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// --- one builder per obstacle type (all ~1 unit tall, sit on the surface) ---
// The camera looks from +Z, so faces/details point +Z.

function makeGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.55, 9), lambert(COLORS.gnomeBody));
  body.position.y = 0.28;
  g.add(body);

  // Arms hugging the belly
  const armGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, lambert(COLORS.gnomeArms));
    arm.position.set(side * 0.28, 0.38, 0.08);
    arm.rotation.z = side * 0.9;
    arm.rotation.x = -0.4;
    g.add(arm);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7), lambert(COLORS.gnomeSkin));
  head.position.y = 0.68;
  g.add(head);

  // Face toward the camera: beard, nose, eyes
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), lambert(COLORS.gnomeBeard));
  beard.scale.set(1, 0.85, 0.7);
  beard.position.set(0, 0.56, 0.12);
  g.add(beard);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), lambert(0xe0a37c));
  nose.position.set(0, 0.68, 0.2);
  g.add(nose);
  const eyeGeo = new THREE.SphereGeometry(0.028, 6, 5);
  const eyeMat = lambert(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.075, 0.74, 0.18);
    g.add(eye);
  }

  // Pointy hat with a brim
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 9), lambert(COLORS.gnomeHat));
  brim.position.y = 0.8;
  g.add(brim);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.55, 9), lambert(COLORS.gnomeHat));
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
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 12, Math.PI), lambert(COLORS.basket));
  handle.position.y = 0.52;
  g.add(handle);
  return g;
}

function makeSprinkler() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.18, 9), lambert(COLORS.sprinkler));
  base.position.y = 0.09;
  g.add(base);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 7), lambert(COLORS.sprinkler));
  pipe.position.y = 0.4;
  g.add(pipe);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.08, 7), lambert(COLORS.sprinkler));
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
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.045 + d * 0.008, 6, 5), waterMat);
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
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), lambert(COLORS.ball));
  // Crossed seam rings — reads as a tennis ball at low poly
  const seamGeo = new THREE.TorusGeometry(0.27, 0.02, 5, 22);
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

    for (const lane of obstacleLanes) {
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this._add(type.make(), lane, theta0, false, type.hitbox);
    }
    if (Math.random() < CONFIG.ballChance) {
      const freeLane = shuffled.find((l) => !obstacleLanes.includes(l));
      if (freeLane !== undefined) this._add(makeBall(), freeLane, theta0, true, null);
    }
  }

  _add(group, lane, theta0, isBall, hitbox) {
    const pivot = surfacePivot(theta0, laneAlpha(lane), group);
    this.planetGroup.add(pivot);
    this.entities.push({ pivot, group, lane, theta0, isBall, collected: false, hitbox });
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
      if (e.isBall && !e.collected) {
        e.group.userData.ball.position.y = 0.45 + Math.sin(t * 4 + e.theta0 * 10) * 0.12;
        e.group.userData.ball.rotation.y = t * 3;
      }
      const spray = e.group.userData.spray;
      if (spray) spray.rotation.y = t * 2.4;
    }
  }
}
