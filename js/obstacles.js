import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { surfacePivot, laneAlpha } from './world.js';

const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// --- one builder per obstacle type (all ~1 unit tall, sit on the surface) ---

function makeGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.55, 9), lambert(COLORS.gnomeBody));
  body.position.y = 0.28;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7), lambert(COLORS.gnomeSkin));
  head.position.y = 0.68;
  g.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), lambert(COLORS.gnomeBeard));
  beard.scale.set(1, 0.8, 0.7);
  beard.position.set(0, 0.58, 0.12);
  g.add(beard);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 9), lambert(COLORS.gnomeHat));
  hat.position.y = 1.0;
  g.add(hat);
  g.rotation.y = Math.PI; // face the incoming dog
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
  const spray = new THREE.Group();
  const water = lambert(COLORS.water, { transparent: true, opacity: 0.65 });
  for (let i = 0; i < 3; i++) {
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.85, 6), water);
    jet.position.y = 0.62;
    jet.rotation.z = 0.9;
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    arm.add(jet);
    spray.add(arm);
  }
  spray.position.y = 0.05;
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
  ball.position.y = 0.45;
  g.add(ball);
  g.userData.ball = ball; // animated bob/spin
  return g;
}

const OBSTACLE_BUILDERS = [makeGnome, makeBasket, makeSprinkler, makeBench];

// Manages spawned entities on the globe. Each entry:
// { pivot, group, lane, theta0, isBall, collected }
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
      const make = OBSTACLE_BUILDERS[Math.floor(Math.random() * OBSTACLE_BUILDERS.length)];
      this._add(make(), lane, theta0, false);
    }
    if (Math.random() < CONFIG.ballChance) {
      const freeLane = shuffled.find((l) => !obstacleLanes.includes(l));
      if (freeLane !== undefined) this._add(makeBall(), freeLane, theta0, true);
    }
  }

  _add(group, lane, theta0, isBall) {
    const pivot = surfacePivot(theta0, laneAlpha(lane), group);
    this.planetGroup.add(pivot);
    this.entities.push({ pivot, group, lane, theta0, isBall, collected: false });
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
      if (spray) spray.rotation.y = t * 2.2;
    }
  }
}
