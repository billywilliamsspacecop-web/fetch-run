import * as THREE from 'three';
import { COLORS } from './config.js';

// Every mesh builder in the game: obstacles, collectibles, powerups, scenery.
// Themes (themes.js) pick from these to compose each level's look.
//
// READABILITY RULE — the player learns this in one run:
//   glowing + floating + spinning  = pick it up
//   matte + grounded + still       = dodge it
// Collectibles/powerups are built through makeCollectible/makePowerup so the
// glow + halo treatment is automatic and identical everywhere.

export const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// Self-lit material so pickups stay bright in dim themes (forest, night skies)
const glowMat = (color, emissive = color) =>
  new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.75, flatShading: true });

const haloMat = (color, opacity) =>
  new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });

// Wraps any pickup mesh with the shared glow language.
// kind: 'ball' (collectible) or 'power' (powerup — bigger, adds a spin ring)
function wrapPickup(inner, { color, kind, y = 0.5, haloRadius = 0.33 }) {
  const g = new THREE.Group();
  const float = new THREE.Group(); // animated: bob / spin / pulse
  float.add(inner);
  float.position.y = y;

  // Deliberately faint: the emissive material already makes pickups pop, so
  // the halo is a rim/aura hint. Cranked any higher it turns into a bright
  // ball that swallows the shape and you can't tell what you're grabbing.
  const halo = new THREE.Mesh(new THREE.SphereGeometry(haloRadius, 14, 10), haloMat(color, 0.12));
  float.add(halo);

  if (kind === 'power') {
    // Powerups get an orbiting ring so they read as "special" at a glance,
    // and so they're distinguishable from collectibles by motion alone.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(haloRadius * 1.45, 0.035, 8, 30),
      haloMat(color, 0.85)
    );
    ring.rotation.x = Math.PI / 2;
    float.add(ring);
    g.userData.ring = ring;
  }

  g.add(float);
  g.userData.float = float;
  g.userData.halo = halo;
  g.userData.pickupKind = kind;
  return g;
}

export const makeCollectible = (inner, color, opts = {}) =>
  wrapPickup(inner, { color, kind: 'ball', y: 0.5, haloRadius: 0.33, ...opts });
export const makePowerup = (inner, color, opts = {}) =>
  wrapPickup(inner, { color, kind: 'power', y: 0.66, haloRadius: 0.42, ...opts });

// ===================== COLLECTIBLES (one per theme) =====================

export function collectTennisBall() {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), glowMat(COLORS.ball));
  const seamGeo = new THREE.TorusGeometry(0.26, 0.02, 6, 28);
  const seamMat = glowMat(COLORS.ballSeam);
  const s1 = new THREE.Mesh(seamGeo, seamMat);
  s1.rotation.set(1.05, 0.5, 0);
  const s2 = new THREE.Mesh(seamGeo, seamMat);
  s2.rotation.set(-1.05, -0.5, 0);
  ball.add(s1, s2);
  return makeCollectible(ball, 0xd7f25a);
}

export function collectIceCream() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 12), glowMat(0xd8a35a));
  cone.rotation.x = Math.PI;
  cone.position.y = -0.08;
  g.add(cone);
  for (const [i, c] of [0xf2a0c0, 0xfff0d0, 0x9be0d8].entries()) {
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.015, 12, 10), glowMat(c));
    scoop.position.y = 0.12 + i * 0.14;
    g.add(scoop);
  }
  return makeCollectible(g, 0xf2a0c0);
}

export function collectAcorn() {
  const g = new THREE.Group();
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 11), glowMat(0xd9a05a));
  nut.scale.set(1, 1.25, 1);
  g.add(nut);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    glowMat(0x8a5a33)
  );
  cap.position.y = 0.1;
  g.add(cap);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 6), glowMat(0x6b4526));
  stem.position.y = 0.22;
  g.add(stem);
  return makeCollectible(g, 0xe8b878);
}

export function collectSock() {
  const g = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.32, 12), glowMat(0xf0f0f5));
  leg.position.y = 0.05;
  g.add(leg);
  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.16, 4, 10), glowMat(0xf0f0f5));
  foot.rotation.z = Math.PI / 2;
  foot.position.set(0.11, -0.12, 0);
  g.add(foot);
  for (const [i, c] of [0xe8556d, 0x4fa8e0].entries()) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 16), glowMat(c));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.14 - i * 0.07;
    g.add(stripe);
  }
  return makeCollectible(g, 0xffffff);
}

// ===================== POWERUPS (shared across themes) =====================

export function powerFrisbee() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.07, 20), glowMat(0xe8622e));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24), glowMat(0xd14f20));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.02;
  disc.add(rim);
  disc.rotation.z = 0.35;
  g.add(disc);
  return makePowerup(g, 0xff7a3c);
}

export function powerBone() {
  const g = new THREE.Group();
  const m = glowMat(0xf5c842);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), m);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), m);
      knob.position.set(sx * 0.2, sy * 0.055, 0);
      g.add(knob);
    }
  }
  g.rotation.z = 0.3;
  return makePowerup(g, 0xffd54f);
}

export function powerMagnet() {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 10, 20, Math.PI), glowMat(0xd23c3c));
  g.add(arc);
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), glowMat(0xd8dde2));
    tip.position.set(sx * 0.2, -0.09, 0);
    g.add(tip);
  }
  return makePowerup(g, 0xff5a5a);
}

export function powerYarn() {
  const g = new THREE.Group();
  const yarn = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 13), glowMat(0xd06bc2));
  const strandGeo = new THREE.TorusGeometry(0.25, 0.022, 6, 24);
  const strandMat = glowMat(0xb84fa8);
  for (const [rx, ry] of [[0.6, 0.3], [1.4, 1.1], [2.2, 0.2]]) {
    const s = new THREE.Mesh(strandGeo, strandMat);
    s.rotation.set(rx, ry, 0);
    yarn.add(s);
  }
  g.add(yarn);
  return makePowerup(g, 0xe884d8);
}

export function powerSteak() {
  const g = new THREE.Group();
  const meat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 11), glowMat(0xd05548));
  meat.scale.set(1.15, 0.35, 0.85);
  g.add(meat);
  const fat = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 22), glowMat(0xf5ead8));
  fat.rotation.x = Math.PI / 2;
  fat.scale.set(1.12, 0.85, 1);
  g.add(fat);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), glowMat(0xf3eee2));
  bone.position.set(0.26, 0, 0.05);
  g.add(bone);
  g.rotation.z = 0.25;
  return makePowerup(g, 0xff8a7a);
}

// ===================== BACKYARD OBSTACLES =====================

export function obGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.55, 14), lambert(COLORS.gnomeBody));
  body.position.y = 0.32;
  g.add(body);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.35, 0.08, 14), lambert(0x4a3220));
  belt.position.y = 0.24;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), lambert(0xf5c842));
  buckle.position.set(0, 0.24, 0.34);
  g.add(buckle);
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.2), lambert(0x2f2a26));
    boot.position.set(side * 0.12, 0.045, 0.06);
    g.add(boot);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10), lambert(COLORS.gnomeArms));
    arm.position.set(side * 0.27, 0.42, 0.1);
    arm.rotation.set(-0.45, 0, side * 0.95);
    g.add(arm);
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.055, 9, 7), lambert(0x6a8f6a));
    mitt.position.set(side * 0.12, 0.35, 0.24);
    g.add(mitt);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 11), lambert(COLORS.gnomeSkin));
  head.position.y = 0.72;
  g.add(head);
  const beardBack = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 9), lambert(COLORS.gnomeBeard));
  beardBack.scale.set(1, 1.05, 0.7);
  beardBack.position.set(0, 0.56, 0.1);
  g.add(beardBack);
  const beardTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), lambert(COLORS.gnomeBeard));
  beardTip.rotation.x = Math.PI;
  beardTip.position.set(0, 0.4, 0.16);
  g.add(beardTip);
  for (const side of [-1, 1]) {
    const stache = new THREE.Mesh(new THREE.SphereGeometry(0.06, 9, 7), lambert(0xf5f2ea));
    stache.scale.set(1.4, 0.55, 0.6);
    stache.position.set(side * 0.07, 0.68, 0.21);
    stache.rotation.z = side * -0.35;
    g.add(stache);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lambert(0xe8a08a));
    cheek.scale.set(1, 0.7, 0.5);
    cheek.position.set(side * 0.12, 0.75, 0.18);
    g.add(cheek);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.028, 0.03), lambert(0xf5f2ea));
    brow.position.set(side * 0.075, 0.82, 0.185);
    brow.rotation.z = side * 0.25;
    g.add(brow);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 9, 7), lambert(0x2b2323));
    eye.position.set(side * 0.075, 0.78, 0.19);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lambert(0xe0876a));
  nose.position.set(0, 0.72, 0.22);
  g.add(nose);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.05, 14), lambert(COLORS.gnomeHat));
  brim.position.y = 0.85;
  g.add(brim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.07, 14), lambert(0x8a2a20));
  band.position.y = 0.9;
  g.add(band);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.5, 14), lambert(COLORS.gnomeHat));
  hat.position.y = 1.15;
  g.add(hat);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 9, 7), lambert(COLORS.gnomeHat));
  tip.position.set(0.06, 1.38, 0.02);
  g.add(tip);
  return g;
}

export function obPicnicBasket() {
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

export function obSprinkler() {
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
  const spray = new THREE.Group();
  const waterMat = new THREE.MeshLambertMaterial({
    color: COLORS.water, transparent: true, opacity: 0.75, flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    for (let d = 0; d < 5; d++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.045 + d * 0.008, 8, 6), waterMat);
      drop.position.set(0.12 + d * 0.14, 0.7 + 0.22 * d - 0.055 * d * d, 0);
      arm.add(drop);
    }
    spray.add(arm);
  }
  g.add(spray);
  g.userData.spin = spray;
  return g;
}

export function obBench(color = COLORS.bench) {
  const g = new THREE.Group();
  const wood = lambert(color);
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

// Named bench variants so wipeout-style lookup (which keys off the builder's
// function name) doesn't see an anonymous arrow and fall back to default.
export const obBenchWood = () => obBench();
export const obBenchPark = () => obBench(0x4a7a4f);

// ===================== PARK OBSTACLES =====================

export function obTrashCan() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.7, 14), lambert(0x4a7a4f));
  can.position.y = 0.35;
  g.add(can);
  for (const y of [0.25, 0.5]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 18), lambert(0x3a5f3d));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.07, 14), lambert(0x35563a));
  lid.position.y = 0.74;
  g.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0x35563a));
  knob.position.y = 0.8;
  g.add(knob);
  return g;
}

export function obHotDogCart() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), lambert(0xe8d5b0));
  body.position.y = 0.5;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.57), lambert(0xd94f4f));
  stripe.position.y = 0.42;
  g.add(stripe);
  // Striped umbrella
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), lambert(0x9a9a9a));
  pole.position.y = 1.0;
  g.add(pole);
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.26, 3),
      lambert(i % 2 === 0 ? 0xd94f4f : 0xfff2e0)
    );
    seg.position.y = 1.38;
    seg.rotation.y = (i / 8) * Math.PI * 2;
    g.add(seg);
  }
  for (const x of [-0.34, 0.34]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), lambert(0x2f2a26));
    wheel.position.set(x, 0.17, 0.3);
    g.add(wheel);
  }
  return g;
}

export function obStroller() {
  const g = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.62), lambert(0x4f7fd0));
  basket.position.y = 0.52;
  basket.rotation.x = -0.15;
  g.add(basket);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(0x35569a)
  );
  hood.position.set(0, 0.66, 0.16);
  hood.rotation.x = -0.5;
  g.add(hood);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 14, Math.PI), lambert(0xb0b6be));
  handle.position.set(0, 0.86, -0.2);
  handle.rotation.set(0.5, 0, 0);
  g.add(handle);
  for (const [x, z, r] of [[-0.22, 0.26, 0.14], [0.22, 0.26, 0.14], [0, -0.24, 0.1]]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 12), lambert(0x2f2a26));
    wheel.position.set(x, r, z);
    g.add(wheel);
  }
  return g;
}

export function obFountain() {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.26, 16), lambert(0xc8c3ba));
  basin.position.y = 0.13;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 16), lambert(0x6fc0e8));
  water.position.y = 0.25;
  g.add(water);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 12), lambert(0xc8c3ba));
  stem.position.y = 0.45;
  g.add(stem);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.1, 14), lambert(0xc8c3ba));
  top.position.y = 0.68;
  g.add(top);
  const jet = new THREE.Group();
  const dropMat = new THREE.MeshLambertMaterial({
    color: 0x8fd3f4, transparent: true, opacity: 0.8, flatShading: true,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (let d = 0; d < 4; d++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dropMat);
      const dist = 0.06 + d * 0.11;
      drop.position.set(Math.cos(a) * dist, 0.86 + 0.16 * d - 0.05 * d * d, Math.sin(a) * dist);
      jet.add(drop);
    }
  }
  g.add(jet);
  g.userData.spin = jet;
  return g;
}

// ===================== TENNIS OBSTACLES =====================

export function obTennisNet() {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.44, 0.05),
    new THREE.MeshLambertMaterial({ color: 0x2f3438, transparent: true, opacity: 0.85, flatShading: true })
  );
  mesh.position.y = 0.3;
  g.add(mesh);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 0.07), lambert(0xf5f5f0));
  tape.position.y = 0.54;
  g.add(tape);
  for (const x of [-0.52, 0.52]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.66, 10), lambert(0x4a5054));
    post.position.set(x, 0.33, 0);
    g.add(post);
  }
  return g;
}

export function obBallHopper() {
  const g = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12), lambert(0x3f4a52));
  basket.position.y = 0.42;
  g.add(basket);
  // Balls poking out the top
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lambert(COLORS.ball));
    ball.position.set(Math.cos(a) * 0.13, 0.68, Math.sin(a) * 0.13);
    g.add(ball);
  }
  for (const x of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), lambert(0x6b757c));
    leg.position.set(x, 0.18, 0);
    g.add(leg);
  }
  return g;
}

export function obBallMachine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), lambert(0x2f6f5a));
  body.position.y = 0.42;
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 14), lambert(0x1f4a3c));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.52, -0.3);
  g.add(barrel);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lambert(COLORS.ball));
  ball.position.set(0, 0.52, -0.42);
  g.add(ball);
  for (const x of [-0.2, 0.2]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 12), lambert(0x2f2a26));
    wheel.position.set(x, 0.13, 0.1);
    g.add(wheel);
  }
  return g;
}

export function obUmpireChair() {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.42), lambert(0x3f6ea8));
  seat.position.y = 0.9;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.07), lambert(0x3f6ea8));
  back.position.set(0, 1.08, 0.2);
  g.add(back);
  for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.18], [0.22, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 8), lambert(0xb0b6be));
    leg.position.set(x, 0.45, z);
    g.add(leg);
  }
  const rung = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.05), lambert(0xb0b6be));
  rung.position.set(0, 0.4, -0.16);
  g.add(rung);
  return g;
}

export function obCourtCone() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.36), lambert(0xe86a2e));
  base.position.y = 0.025;
  g.add(base);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 12), lambert(0xf07a3a));
  cone.position.y = 0.28;
  g.add(cone);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 14), lambert(0xfff2e0));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.3;
  g.add(stripe);
  return g;
}

// ===================== FOREST OBSTACLES =====================

export function obFallenLog() {
  const g = new THREE.Group();
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.15, 12), lambert(0x7a5334));
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.25;
  g.add(log);
  for (const x of [-0.575, 0.575]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12), lambert(0xc9a878));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(x, 0.25, 0);
    g.add(cap);
  }
  // Moss patches
  for (const [x, z] of [[-0.2, 0.1], [0.25, -0.08]]) {
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lambert(0x5f9440));
    moss.scale.set(1.3, 0.4, 0.9);
    moss.position.set(x, 0.44, z);
    g.add(moss);
  }
  return g;
}

export function obBoulder() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), lambert(0x8d8d92));
  rock.scale.set(1.1, 0.85, 1);
  rock.position.y = 0.34;
  rock.rotation.set(0.3, 0.6, 0.15);
  g.add(rock);
  const small = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), lambert(0x76767c));
  small.position.set(0.38, 0.14, 0.2);
  small.rotation.set(0.5, 0.2, 0.4);
  g.add(small);
  return g;
}

export function obStump() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.55, 12), lambert(0x6b4526));
  trunk.position.y = 0.28;
  g.add(trunk);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), lambert(0xc9a878));
  top.position.y = 0.56;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09 + i * 0.08, 0.012, 6, 16), lambert(0xa8845a));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.585;
    g.add(ring);
  }
  return g;
}

export function obMushrooms() {
  const g = new THREE.Group();
  for (const [x, z, s, c] of [[0, 0, 1, 0xd94f4f], [0.26, 0.14, 0.7, 0xe8734f], [-0.22, -0.1, 0.55, 0xd94f4f]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 0.36 * s, 10), lambert(0xf0e8d8));
    stem.position.set(x, 0.18 * s, z);
    g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      lambert(c)
    );
    cap.position.set(x, 0.36 * s, z);
    g.add(cap);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 6, 5), lambert(0xfff5e8));
      dot.position.set(x + Math.cos(a) * 0.12 * s, 0.42 * s, z + Math.sin(a) * 0.12 * s);
      g.add(dot);
    }
  }
  return g;
}

export function obBramble() {
  const g = new THREE.Group();
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lambert(0x3f6b32));
  bush.scale.set(1.2, 0.75, 1);
  bush.position.y = 0.3;
  g.add(bush);
  // Thorny twigs
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.4, 5), lambert(0x5a4030));
    twig.position.set(Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.25);
    twig.rotation.set(Math.random() * 0.8 - 0.4, a, Math.random() * 0.8 - 0.4);
    g.add(twig);
  }
  for (const [x, z] of [[0.2, 0.15], [-0.25, -0.1], [0.05, -0.2]]) {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), lambert(0x8a2f5a));
    berry.position.set(x, 0.52, z);
    g.add(berry);
  }
  return g;
}

// ===================== HOUSE OBSTACLES =====================

export function obCouch() {
  const g = new THREE.Group();
  const fabric = lambert(0xa85f6a);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.26, 0.55), fabric);
  seat.position.y = 0.34;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.18), fabric);
  back.position.set(0, 0.6, 0.2);
  g.add(back);
  for (const x of [-0.53, 0.53]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.55), fabric);
    arm.position.set(x, 0.5, 0);
    g.add(arm);
  }
  for (const x of [-0.28, 0.28]) {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.48), lambert(0xbc7280));
    cushion.position.set(x, 0.53, -0.02);
    g.add(cushion);
  }
  for (const [x, z] of [[-0.48, -0.22], [0.48, -0.22], [-0.48, 0.22], [0.48, 0.22]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.2, 8), lambert(0x5a3f2a));
    foot.position.set(x, 0.1, z);
    g.add(foot);
  }
  return g;
}

export function obCoffeeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.5), lambert(0x8a5f3a));
  top.position.y = 0.44;
  g.add(top);
  for (const [x, z] of [[-0.4, -0.18], [0.4, -0.18], [-0.4, 0.18], [0.4, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.44, 8), lambert(0x6b4526));
    leg.position.set(x, 0.22, z);
    g.add(leg);
  }
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.18), lambert(0x3f6ea8));
  book.position.set(0.15, 0.5, 0);
  book.rotation.y = 0.3;
  g.add(book);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), lambert(0xf0ece2));
  mug.position.set(-0.2, 0.53, 0.05);
  g.add(mug);
  return g;
}

export function obVacuum() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), lambert(0xd04f4f));
  base.position.y = 0.1;
  g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.24), lambert(0xe05a5a));
  body.position.set(0, 0.4, 0.05);
  body.rotation.x = 0.22;
  g.add(body);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9), lambert(0xf0e0d0));
  bag.scale.set(1, 1.3, 0.8);
  bag.position.set(0, 0.6, 0.14);
  g.add(bag);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 8), lambert(0x4a4a52));
  handle.position.set(0, 0.85, 0.2);
  handle.rotation.x = 0.22;
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 14, Math.PI), lambert(0x2f2a2e));
  grip.position.set(0, 1.08, 0.25);
  grip.rotation.set(0.22, 0, 0);
  g.add(grip);
  return g;
}

export function obLaundryBasket() {
  const g = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.42, 14), lambert(0x5fa8d0));
  basket.position.y = 0.22;
  g.add(basket);
  for (const y of [0.14, 0.3]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.022, 8, 18), lambert(0x4a8ab0));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  // Clothes spilling over the rim
  for (const [x, z, c] of [[0.1, 0.06, 0xf0f0f5], [-0.14, -0.08, 0xe8556d], [0.04, -0.16, 0x9be0d8]]) {
    const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lambert(c));
    cloth.scale.set(1, 0.55, 1);
    cloth.position.set(x, 0.46, z);
    g.add(cloth);
  }
  return g;
}

export function obCatTower() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), lambert(0xb0a08a));
  base.position.y = 0.05;
  g.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 12), lambert(0xd8c8a8));
  post.position.y = 0.45;
  g.add(post);
  // Sisal wrap rings
  for (let i = 0; i < 5; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.02, 6, 14), lambert(0xc0a878));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = 0.2 + i * 0.13;
    g.add(wrap);
  }
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 14), lambert(0xb0a08a));
  perch.position.y = 0.84;
  g.add(perch);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lambert(0xe8556d));
  ball.position.set(0.22, 0.72, 0);
  g.add(ball);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), lambert(0xd0c8b8));
  string.position.set(0.22, 0.8, 0);
  g.add(string);
  return g;
}

// ===================== SCENERY =====================

let canopyMats = [];
export const getCanopyMats = () => canopyMats;
export const resetCanopyMats = () => { canopyMats = []; };

function canopyLambert(color) {
  const m = lambert(color);
  canopyMats.push({ mat: m, base: new THREE.Color(color) });
  return m;
}

export function scTree() {
  const g = new THREE.Group();
  const h = 0.7 + Math.random() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, h, 11), lambert(COLORS.trunk));
  trunk.position.y = h / 2;
  g.add(trunk);
  const color = COLORS.canopy[Math.floor(Math.random() * COLORS.canopy.length)];
  if (Math.random() < 0.35) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 13), canopyLambert(color));
    cone.position.y = h + 0.7;
    g.add(cone);
  } else {
    const r1 = 0.55 + Math.random() * 0.35;
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(r1, 14, 11), canopyLambert(color));
    c1.position.y = h + r1 * 0.75;
    g.add(c1);
    if (Math.random() < 0.5) {
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.6, 12, 9), canopyLambert(color));
      c2.position.set(0.35, h + r1 * 1.15, 0.1);
      g.add(c2);
    }
    if (Math.random() < 0.45) {
      const fruitMat = lambert(Math.random() < 0.5 ? 0xd94f4f : 0xf0a030);
      for (let f = 0; f < 3; f++) {
        const a = Math.random() * Math.PI * 2;
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.07, 9, 7), fruitMat);
        fruit.position.set(
          Math.cos(a) * r1 * 0.85,
          h + r1 * 0.75 + (Math.random() - 0.3) * r1 * 0.6,
          Math.sin(a) * r1 * 0.85
        );
        g.add(fruit);
      }
    }
  }
  g.scale.setScalar(0.8 + Math.random() * 0.6);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

export function scPine() {
  const g = new THREE.Group();
  const h = 0.5 + Math.random() * 0.35;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, h, 10), lambert(0x5a3f28));
  trunk.position.y = h / 2;
  g.add(trunk);
  const shades = [0x2f5f38, 0x3a7042, 0x27503080];
  const color = shades[Math.floor(Math.random() * 2)];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.62 - i * 0.14, 0.85, 12),
      canopyLambert(color)
    );
    cone.position.y = h + 0.34 + i * 0.5;
    g.add(cone);
  }
  g.scale.setScalar(0.85 + Math.random() * 0.7);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

export function scBush() {
  const b = new THREE.Mesh(
    new THREE.SphereGeometry(0.3 + Math.random() * 0.25, 12, 9),
    lambert(COLORS.planetDark)
  );
  b.scale.y = 0.7;
  return b;
}

export function scFern() {
  const g = new THREE.Group();
  const fronds = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 5), canopyLambert(0x47843c));
    frond.position.set(Math.cos(a) * 0.13, 0.26, Math.sin(a) * 0.13);
    frond.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * -0.5);
    g.add(frond);
  }
  g.scale.setScalar(0.7 + Math.random() * 0.5);
  return g;
}

export function scFlower() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8), lambert(0x4f8f3a));
  stem.position.y = 0.12;
  g.add(stem);
  const colors = [0xffffff, 0xffd54f, 0xe57a8a, 0xb08ae5];
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    lambert(colors[Math.floor(Math.random() * colors.length)])
  );
  head.position.y = 0.28;
  g.add(head);
  return g;
}

export function scLampPost() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.7, 10), lambert(0x35393d));
  post.position.y = 0.85;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 12, Math.PI / 2), lambert(0x35393d));
  arm.position.y = 1.7;
  arm.rotation.z = -Math.PI / 2;
  g.add(arm);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 9),
    new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe8a0, emissiveIntensity: 0.9, flatShading: true })
  );
  lamp.position.set(0.18, 1.62, 0);
  g.add(lamp);
  return g;
}

export function scStatue() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lambert(0x9a9188));
  base.position.y = 0.25;
  g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 10), lambert(0xb0a89c));
  body.position.y = 0.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), lambert(0xb0a89c));
  head.position.y = 1.2;
  g.add(head);
  return g;
}

export function scBleachers() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.4), lambert(0x9aa4ac));
    row.position.set(0, 0.25 + i * 0.32, -i * 0.4);
    g.add(row);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 0.08), lambert(0x7d8790));
    riser.position.set(0, 0.1 + i * 0.32, -i * 0.4 - 0.2);
    g.add(riser);
  }
  return g;
}

export function scChainFence() {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 1.5, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x9fb0b8, transparent: true, opacity: 0.4, flatShading: true })
  );
  mesh.position.y = 0.75;
  g.add(mesh);
  for (const x of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), lambert(0x7d8790));
    post.position.set(x, 0.8, 0);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), lambert(0x7d8790));
  rail.rotation.z = Math.PI / 2;
  rail.position.y = 1.55;
  g.add(rail);
  return g;
}

export function scFloodlight() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.2, 10), lambert(0x6b757c));
  post.position.y = 1.1;
  g.add(post);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.16), lambert(0x4a5054));
  head.position.y = 2.3;
  head.rotation.x = 0.3;
  g.add(head);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.24, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xfff8e0, emissive: 0xfff0c0, emissiveIntensity: 0.9, flatShading: true })
  );
  lens.position.set(0, 2.28, -0.1);
  lens.rotation.x = 0.3;
  g.add(lens);
  return g;
}

export function scHouseWall() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.14), lambert(0xe8dcc8));
  wall.position.y = 1.3;
  g.add(wall);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.18), lambert(0xf5efe4));
  rail.position.y = 0.9;
  g.add(rail);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.2), lambert(0xf5efe4));
  base.position.y = 0.11;
  g.add(base);
  // Framed pictures
  for (const [x, c] of [[-0.6, 0x7a9ac0], [0.55, 0xc08a6a]]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), lambert(0x8a6a45));
    frame.position.set(x, 1.7, 0.09);
    g.add(frame);
    const art = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.02), lambert(c));
    art.position.set(x, 1.7, 0.12);
    g.add(art);
  }
  return g;
}

export function scBookshelf() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.3), lambert(0x7a5334));
  frame.position.y = 0.8;
  g.add(frame);
  const bookColors = [0xd04f4f, 0x3f6ea8, 0x4f9d5a, 0xe8b040, 0x9a5fb0];
  for (let shelf = 0; shelf < 3; shelf++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.32), lambert(0x8a5f3a));
    board.position.y = 0.4 + shelf * 0.5;
    g.add(board);
    for (let b = 0; b < 5; b++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.3 + Math.random() * 0.1, 0.22),
        lambert(bookColors[Math.floor(Math.random() * bookColors.length)])
      );
      book.position.set(-0.32 + b * 0.16, 0.6 + shelf * 0.5, 0.03);
      g.add(book);
    }
  }
  return g;
}

export function scFloorLamp() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 14), lambert(0x4a4a52));
  base.position.y = 0.03;
  g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), lambert(0x6b6b74));
  pole.position.y = 0.78;
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 0.42, 14, 1, true),
    new THREE.MeshLambertMaterial({
      color: 0xffeec8, emissive: 0xffe4a8, emissiveIntensity: 0.55,
      flatShading: true, side: THREE.DoubleSide,
    })
  );
  shade.position.y = 1.62;
  g.add(shade);
  return g;
}

export function scHousePlant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 12), lambert(0xc07a55));
  pot.position.y = 0.16;
  g.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 14), lambert(0xd08a65));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.31;
  g.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), canopyLambert(0x4f9d3a));
    leaf.scale.set(0.45, 1.2, 0.3);
    leaf.position.set(Math.cos(a) * 0.13, 0.6, Math.sin(a) * 0.13);
    leaf.rotation.set(Math.cos(a) * 0.4, a, Math.sin(a) * -0.4);
    g.add(leaf);
  }
  return g;
}

export function scRock() {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.16, 0), lambert(0x8d8d92));
  r.scale.set(1, 0.7, 1);
  r.rotation.set(Math.random(), Math.random(), Math.random());
  return r;
}

export function scCloud() {
  const g = new THREE.Group();
  const m = lambert(COLORS.cloud);
  const sizes = [0.9, 0.65, 0.7];
  const offs = [[0, 0, 0], [0.85, -0.1, 0.1], [-0.8, -0.15, -0.05]];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sizes[i], 12, 9), m);
    s.position.set(...offs[i]);
    s.scale.y = 0.65;
    g.add(s);
  }
  return g;
}
