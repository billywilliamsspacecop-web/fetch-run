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

// Self-lit material so pickups stay bright in dim themes (forest, night skies).
// Kept moderate on purpose: cranked high it flattens the item's own shading
// and you can't tell an acorn from a sock. The glow that makes pickups POP
// lives OUTSIDE the silhouette instead (see wrapPickup).
const glowMat = (color, emissive = color) =>
  new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.32, flatShading: true });

// Self-lit material for props that are meant to be a light source in the
// scene (flames, lava, halos, glowing brew). Unlike glowMat this is tuned for
// obstacles, so it runs hot enough to read across a dark stage.
export const litMat = (color, emissive = color, intensity = 0.9) =>
  new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true });

// ---------------------------------------------------------------------------
// OUTLINES. Classic inverted-hull: clone each mesh, render BACK faces only in
// a flat dark colour, and push the clone a few centimetres proud of the
// original. The front-facing original then covers the clone's middle and only
// a dark rim survives around the silhouette.
//
// This exists for the pale stages — heaven especially, where ivory marble on a
// near-white floor had no edge at all and the props genuinely could not be
// seen. Retinting the props instead would have cost the stage its whole look;
// an outline keeps white things white and still gives them a boundary.
//
// Marked `isOutline` so the two systems that walk prop geometry skip it:
// hitbox measurement (themes.js) and shadow casting (obstacles.js, world.js).
// Neither should see a shell that isn't really there.
const _outlineMats = new Map();
const outlineMat = (color) => {
  if (!_outlineMats.has(color)) {
    _outlineMats.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  }
  return _outlineMats.get(color);
};

export function addOutline(group, { thickness = 0.05, color = 0x21203a } = {}) {
  const mat = outlineMat(color);
  const targets = [];
  group.traverse((o) => {
    // Transparent parts (spray, glow, gauze) have no silhouette worth tracing,
    // and a solid shell behind them would show straight through.
    if (o.isMesh && !o.userData.isOutline && !(o.material && o.material.transparent)) {
      targets.push(o);
    }
  });
  for (const m of targets) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    // Scale is relative, but a constant WORLD thickness is what reads evenly —
    // so the factor is derived per mesh from its own radius. Small parts get a
    // proportionally bigger push, which is exactly what keeps a thin harp
    // string outlined as boldly as a fat pillar.
    const r = Math.max(0.05, m.geometry.boundingSphere.radius);
    const shell = new THREE.Mesh(m.geometry, mat);
    shell.position.copy(m.position);
    shell.quaternion.copy(m.quaternion);
    shell.scale.copy(m.scale).multiplyScalar(1 + thickness / r);
    shell.userData.isOutline = true;
    m.parent.add(shell);
  }
  return group;
}

const haloMat = (color, opacity) =>
  new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });

// Wraps any pickup mesh with the shared glow language.
// kind: 'ball' (collectible) or 'power' (powerup — bigger, adds a spin ring)
//
// The glow is deliberately kept OUTSIDE the item's silhouette. An additive
// halo drawn over the object brightens every pixel of it, which is what made
// pickups turn into featureless blobs — you could see something was grabbable
// but not what it was. Instead:
//   * backlight sphere renders BackSide only, so it sits BEHIND the item and
//     rims it rather than covering its face
//   * a flat glow disc on the ground marks the spot from a distance
//   * the item's own material keeps normal shading so its shape reads
function wrapPickup(inner, { color, kind, y = 0.5, haloRadius = 0.33 }) {
  const g = new THREE.Group();
  const float = new THREE.Group(); // animated: bob / spin / pulse
  float.add(inner);
  float.position.y = y;

  // A RING around the item, not a sphere over it. Any additive sphere —
  // even back-faces-only — still covers the item's full screen area and
  // washes it out, which is what made pickups unidentifiable. A torus sits
  // entirely outside the silhouette, so the item's own shading reads clean.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(haloRadius * 1.5, 0.045, 8, 28),
    haloMat(color, 0.55)
  );
  halo.rotation.x = Math.PI / 2.6; // tilted so it reads as a ring, not a line
  float.add(halo);

  // Ground marker — visible well before the item itself resolves
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(haloRadius * 1.5, 24),
    haloMat(color, 0.3)
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  g.add(pad);
  g.userData.pad = pad;

  if (kind === 'power') {
    // Powerups get an orbiting ring so they read as "special" at a glance,
    // and so they're distinguishable from collectibles by motion alone.
    // Sits outside the item, so it never obscures it.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(haloRadius * 1.7, 0.035, 8, 30),
      haloMat(color, 0.9)
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

// The themed three. Each one borrows the visual language of the rare stage it
// belongs to, so a player who's been to hell recognises Scorch on sight.

export function powerRocket() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 6, 12), glowMat(0xe8eaf0));
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.18, 12), glowMat(0xd23c3c));
  nose.position.y = 0.26;
  g.add(nose);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 6, 16), glowMat(0xd23c3c));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.02;
  g.add(band);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.12), glowMat(0xd23c3c));
    fin.position.set(Math.cos(a) * 0.11, -0.17, Math.sin(a) * 0.11);
    fin.rotation.y = -a;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), glowMat(0xffc030, 0xff8a00));
  flame.position.y = -0.31;
  flame.rotation.x = Math.PI;
  g.add(flame);
  g.rotation.z = 0.3;
  return makePowerup(g, 0x9be8ff);
}

export function powerHourglass() {
  const g = new THREE.Group();
  const glass = glowMat(0xbfe6f2);
  for (const sy of [-1, 1]) {
    const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 14), glass);
    bulb.position.y = sy * 0.1;
    bulb.rotation.x = sy > 0 ? Math.PI : 0;
    g.add(bulb);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 14), glowMat(0xf0c64a));
    cap.position.y = sy * 0.21;
    g.add(cap);
  }
  const sand = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.11, 10), glowMat(0xffe9a0));
  sand.position.y = -0.05;
  sand.rotation.x = Math.PI;
  g.add(sand);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6), glowMat(0xf0c64a));
    post.position.set(sx * 0.15, 0, 0);
    g.add(post);
  }
  return makePowerup(g, 0xdff2ff);
}

export function powerFlame() {
  const g = new THREE.Group();
  // Stacked cones, hot core to cool tip — the same read as obFireGeyser
  for (const [y, r, h, c, e] of [
    [-0.06, 0.17, 0.3, 0xff5a1a, 0xff3a00],
    [0.1, 0.13, 0.26, 0xff8a2a, 0xff6a00],
    [0.24, 0.09, 0.2, 0xffc94a, 0xffa000],
  ]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), glowMat(c, e));
    cone.position.y = y;
    g.add(cone);
  }
  for (const sx of [-1, 1]) {
    const lick = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), glowMat(0xff8a2a, 0xff6a00));
    lick.position.set(sx * 0.16, 0.02, 0);
    lick.rotation.z = sx * -0.4;
    g.add(lick);
  }
  return makePowerup(g, 0xff7a2a);
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
  // Four wheels, all of them ROLLING ALONG THE TRACK. A torus is born in the
  // XY plane with its axle down Z, i.e. rolling sideways — so every wheel here
  // was turned across the direction of travel, and the rear one was a lone
  // third wheel on the centreline. Rotating by 90 degrees about Y swings the
  // axle to X, which is the only orientation a pram is ever pushed in.
  for (const [x, z, r] of [
    [-0.22, 0.26, 0.14], [0.22, 0.26, 0.14],
    [-0.2, -0.24, 0.11], [0.2, -0.24, 0.11],
  ]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 14), lambert(0x2f2a26));
    wheel.position.set(x, r, z);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
    // Axle stub, so the pairs read as joined rather than four loose hoops
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), lambert(0xb0b6be));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x * 0.82, r, z);
    g.add(hub);
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

// Taller than it was by half. At 0.66 total height the net sat below the
// runner's shoulder and read as a speed bump you might hop — the one obstacle
// in the game whose real-world job is "you do not get past this".
export function obTennisNet() {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.62, 0.05),
    new THREE.MeshLambertMaterial({ color: 0x2f3438, transparent: true, opacity: 0.85, flatShading: true })
  );
  mesh.position.y = 0.4;
  g.add(mesh);
  // Cords across the face, so it reads as netting rather than a dark slab
  const cord = lambert(0x5a636a);
  for (let i = 0; i < 4; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.02, 0.07), cord);
    row.position.set(0, 0.17 + i * 0.15, 0);
    g.add(row);
  }
  for (let i = 0; i < 5; i++) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.07), cord);
    col.position.set(-0.4 + i * 0.2, 0.4, 0);
    g.add(col);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.12, 0.09), lambert(0xf5f5f0));
  tape.position.y = 0.75;
  g.add(tape);
  // Centre strap, the detail that names the object at a glance
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.08), lambert(0xf5f5f0));
  strap.position.y = 0.32;
  g.add(strap);
  for (const x of [-0.52, 0.52]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.94, 10), lambert(0x4a5054));
    post.position.set(x, 0.47, 0);
    g.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lambert(0x6b757c));
    cap.position.set(x, 0.94, 0);
    g.add(cap);
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

// The court's side barrier: dark-green windscreen on chain-link, the thing
// that actually tells you you're inside a tennis court and not on a lawn.
//
// It replaces a fence that was built LONG IN X and THIN IN Z — a barrier lying
// ACROSS the track, scattered thirty times at random down both sides. From the
// runner's seat those read as a field of little nets standing sideways. Same
// mistake, and same fix, as the hallway walls in scHouseWall: run the length
// along Z and place the segments evenly so they butt into one continuous wall.
export const COURT_WALL_LEN = 2.6;

export function scCourtWall() {
  const g = new THREE.Group();
  const L = COURT_WALL_LEN;
  // Windscreen fabric. Opaque, unlike the old see-through panel: you should
  // not be able to see the next stage's scenery through the side of a court.
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, L), lambert(0x1f5c3f));
  screen.position.y = 0.78;
  g.add(screen);
  // Lighter band along the bottom + the sponsor stripe up top, so a long run
  // of wall has horizontal detail instead of being one flat green ribbon
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, L), lambert(0x164a32));
  skirt.position.y = 0.11;
  g.add(skirt);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, L), lambert(0xe8f0e4));
  stripe.position.y = 1.42;
  g.add(stripe);
  // Chain-link showing above the screen, and the top rail it hangs from
  const link = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.5, L),
    new THREE.MeshLambertMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.35, flatShading: true })
  );
  link.position.y = 1.78;
  g.add(link);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, L, 8), lambert(0x7d8790));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 2.03;
  g.add(rail);
  // Posts at both ends, so joined segments show a regular rhythm of uprights
  for (const z of [-L / 2 + 0.06, L / 2 - 0.06]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.06, 8), lambert(0x6b757c));
    post.position.set(0, 1.03, z);
    g.add(post);
  }
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

// A run of hallway wall. Critically it is LONG ALONG Z (the direction of
// travel) and THIN IN X (lateral) — the previous version had those swapped,
// so each "wall" was really a barrier lying across the track, seen edge-on
// from the side. That read as open field with the odd panel floating in it.
// Length matches the even spacing in world.js so segments join into a
// continuous corridor with no gaps.
export const HOUSE_WALL_LEN = 2.6;

export function scHouseWall() {
  const g = new THREE.Group();
  const L = HOUSE_WALL_LEN;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, L), lambert(0xe8dcc8));
  wall.position.y = 1.05;
  g.add(wall);
  // Chair rail + baseboard run the length of the hall
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, L), lambert(0xf5efe4));
  rail.position.y = 0.82;
  g.add(rail);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, L), lambert(0xf5efe4));
  base.position.y = 0.12;
  g.add(base);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, L), lambert(0xf5efe4));
  crown.position.y = 2.02;
  g.add(crown);
  // Framed pictures on BOTH faces — the same wall model is used on the left
  // and right of the track, so it has to look right viewed from either side.
  for (const face of [-1, 1]) {
    for (const [z, c] of [[-0.62, 0x7a9ac0], [0.62, 0xc08a6a]]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.56), lambert(0x8a6a45));
      frame.position.set(face * 0.1, 1.4, z);
      g.add(frame);
      const art = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.44), lambert(c));
      art.position.set(face * 0.13, 1.4, z);
      g.add(art);
    }
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

// ===================== RARE STAGE: HEAVEN =====================

// Heaven's ground is near-white, so every prop here is deliberately tinted
// AWAY from white — cool blue-grey shadows and warm gold accents. Pure white
// props were the reason nothing in this stage read as anything: they were
// white silhouettes on a white floor under a white sky.
const HEAVEN_STONE = 0xd8d2c2;  // warm ivory, clearly darker than the ground
const HEAVEN_SHADE = 0xc2c8dc;  // cool blue-grey for undersides
const HEAVEN_GOLD = 0xf0c64a;

export function obCloudBank() {
  const g = new THREE.Group();
  // Two tones: shaded blue-grey body with a gold-lit crown, so the bank has
  // a top and a bottom instead of reading as a flat white smear.
  const shade = lambert(HEAVEN_SHADE);
  const lit = lambert(0xfaf3e2);
  for (const [x, y, z, r] of [[0, 0.26, 0, 0.42], [0.34, 0.2, 0.05, 0.3], [-0.32, 0.22, -0.04, 0.32]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), shade);
    puff.position.set(x, y, z);
    puff.scale.y = 0.72;
    g.add(puff);
  }
  for (const [x, y, z, r] of [[-0.08, 0.5, 0, 0.3], [0.24, 0.44, 0.02, 0.22]]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), lit);
    cap.position.set(x, y, z);
    cap.scale.y = 0.7;
    g.add(cap);
  }
  // Gold lining along the front edge — the giveaway that this is a cloud
  const lining = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 20, Math.PI), litMat(HEAVEN_GOLD, 0xf0b020, 0.7));
  lining.rotation.set(Math.PI / 2, 0, Math.PI);
  lining.position.set(0, 0.24, 0.06);
  g.add(lining);
  return addOutline(g);
}

export function obAngelStatue() {
  // Big splayed wings + a halo: the most unmistakable silhouette in the set.
  const g = new THREE.Group();
  const stone = lambert(HEAVEN_STONE);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.22, 12), lambert(HEAVEN_SHADE));
  plinth.position.y = 0.11;
  g.add(plinth);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 0.78, 12), stone);
  robe.position.y = 0.61;
  g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 9), stone);
  head.position.y = 1.1;
  g.add(head);
  // Arms clasped in front, angled down — reads as praying from any distance
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.44, 8), stone);
    arm.position.set(side * 0.14, 0.78, 0.1);
    arm.rotation.set(0.5, 0, side * 0.34);
    g.add(arm);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const feather = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.56 - i * 0.11, 0.14),
        lambert(i === 0 ? 0xfaf6ec : HEAVEN_STONE)
      );
      feather.position.set(side * (0.17 + i * 0.12), 1.0 - i * 0.13, -0.04);
      feather.rotation.z = side * (0.26 + i * 0.2);
      g.add(feather);
    }
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 8, 18), litMat(HEAVEN_GOLD, 0xffd97a, 1));
  halo.rotation.x = Math.PI / 2 - 0.25;
  halo.position.y = 1.34;
  g.add(halo);
  return addOutline(g);
}

export function obGoldenBell() {
  // A church bell hung in a timber yoke. The A-frame is what sells it —
  // a bell shape alone just reads as a lampshade.
  const g = new THREE.Group();
  const wood = lambert(0x9a7b52);
  const gold = lambert(HEAVEN_GOLD);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.06, 0.1), wood);
    leg.position.set(side * 0.32, 0.53, 0);
    leg.rotation.z = side * 0.18;
    g.add(leg);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.07), wood);
    brace.position.set(side * 0.2, 0.42, 0);
    brace.rotation.z = side * -0.5;
    g.add(brace);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.11, 0.13), wood);
  beam.position.y = 1.02;
  g.add(beam);
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.09), lambert(0x7a5f3e));
  yoke.position.y = 0.92;
  g.add(yoke);
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.33, 0.5, 16, 1, true),
    lambert(HEAVEN_GOLD, { side: THREE.DoubleSide })
  );
  bell.position.y = 0.63;
  g.add(bell);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  shoulder.position.y = 0.87;
  g.add(shoulder);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 20), gold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.39;
  g.add(lip);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lambert(0x8a6a2a));
  clapper.position.y = 0.4;
  g.add(clapper);
  return addOutline(g);
}

export function obAngelGnome() {
  // The backyard gnome, gone good — the mirror of hell's obDemonGnome.
  // Same proportions on purpose, so meeting both across a run lands as a joke.
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.55, 14), lambert(0xf2eee2));
  body.position.y = 0.32;
  g.add(body);
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.1, 14), lambert(HEAVEN_GOLD));
  sash.position.y = 0.34;
  g.add(sash);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 11), lambert(COLORS.gnomeSkin));
  head.position.y = 0.72;
  g.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 9), lambert(0xf7f4ec));
  beard.scale.set(1, 1.05, 0.7);
  beard.position.set(0, 0.56, 0.1);
  g.add(beard);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), lambert(0x3f5a8a));
    eye.position.set(side * 0.08, 0.78, 0.18);
    g.add(eye);
    // Stubby wings poking out of the robe
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.13), lambert(0xfaf7ef));
    wing.position.set(side * 0.3, 0.5, -0.1);
    wing.rotation.z = side * 0.42;
    g.add(wing);
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.5, 14), lambert(0xdce6f7));
  hat.position.y = 1.12;
  g.add(hat);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), litMat(HEAVEN_GOLD, 0xffd97a, 1));
  halo.rotation.x = Math.PI / 2 - 0.2;
  halo.position.y = 1.45;
  g.add(halo);
  return addOutline(g);
}

export function obHarp() {
  const g = new THREE.Group();
  const gold = lambert(0xf0d47a);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 8, 18, Math.PI * 1.2), gold);
  frame.position.y = 0.45;
  frame.rotation.z = -0.4;
  g.add(frame);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 8), gold);
  post.position.set(-0.2, 0.35, 0);
  g.add(post);
  for (let i = 0; i < 5; i++) {
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42 - i * 0.06, 5), lambert(0xfff8e0));
    str.position.set(-0.12 + i * 0.09, 0.36 + i * 0.02, 0);
    g.add(str);
  }
  return addOutline(g);
}

export function obPillar() {
  const g = new THREE.Group();
  const stone = lambert(HEAVEN_STONE);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), lambert(HEAVEN_SHADE));
  base.position.y = 0.06;
  g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.0, 14), stone);
  shaft.position.y = 0.62;
  g.add(shaft);
  for (let i = 0; i < 6; i++) {
    const flute = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.95, 0.03), lambert(HEAVEN_SHADE));
    const a = (i / 6) * Math.PI * 2;
    flute.position.set(Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17);
    g.add(flute);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 16), lambert(HEAVEN_GOLD));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.1;
  g.add(collar);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), lambert(HEAVEN_SHADE));
  cap.position.y = 1.19;
  g.add(cap);
  return addOutline(g);
}

export function obGate() {
  const g = new THREE.Group();
  const gold = lambert(0xf5d98a);
  for (const x of [-0.42, 0.42]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 10), gold);
    post.position.set(x, 0.65, 0);
    g.add(post);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lambert(0xfff0b8));
    finial.position.set(x, 1.36, 0);
    g.add(finial);
  }
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), gold);
    bar.position.set(-0.32 + i * 0.16, 0.5, 0);
    g.add(bar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 16, Math.PI), gold);
  arch.position.y = 1.1;
  g.add(arch);
  return addOutline(g);
}

export function scHeavenCloud() {
  const g = new THREE.Group();
  const m = lambert(0xfdfbff);
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 12, 9), m);
    puff.position.set((Math.random() - 0.5) * 1.6, Math.random() * 0.4, (Math.random() - 0.5) * 1.2);
    puff.scale.y = 0.6;
    g.add(puff);
  }
  return g;
}

export function scHalo() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.05, 10, 22),
    new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffd97a, emissiveIntensity: 0.9, flatShading: true })
  );
  ring.rotation.x = Math.PI / 2 - 0.3;
  ring.position.y = 1.4;
  g.add(ring);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), lambert(0xf0ecd8));
  post.position.y = 0.7;
  g.add(post);
  return g;
}

// ===================== RARE STAGE: SPACE =====================
// In space both runners ride little ships, so the obstacles are hazards
// you fly past rather than things sitting on the ground.

export function obAsteroid() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), lambert(0xa89b90));
  rock.position.y = 0.6;
  rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  g.add(rock);
  for (let i = 0; i < 3; i++) {
    const crater = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0x736961));
    const a = Math.random() * Math.PI * 2;
    crater.position.set(Math.cos(a) * 0.3, 0.6 + (Math.random() - 0.5) * 0.4, Math.sin(a) * 0.3);
    g.add(crater);
  }
  g.userData.tumble = rock;
  return g;
}

export function obSatellite() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.5), lambert(0xc8ccd4));
  body.position.y = 0.7;
  g.add(body);
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.34), lambert(0x2f4f9a));
    panel.position.set(sx * 0.44, 0.7, 0);
    g.add(panel);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), lambert(0x9aa0a8));
    arm.rotation.z = Math.PI / 2;
    arm.position.set(sx * 0.25, 0.7, 0);
    g.add(arm);
  }
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(0xe8eaee)
  );
  dish.rotation.x = -0.7;
  dish.position.set(0, 0.95, -0.1);
  g.add(dish);
  g.userData.tumble = g;
  return g;
}

export function obSpaceRock() {
  const g = new THREE.Group();
  for (const [x, y, s] of [[0, 0.55, 1], [0.3, 0.75, 0.6], [-0.26, 0.4, 0.5]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * s + 0.1, 0), lambert(0x9c8e86));
    r.position.set(x, y, 0);
    r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    g.add(r);
  }
  return g;
}

export function obUFO() {
  const g = new THREE.Group();
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.12, 16), lambert(0x9aa4b0));
  saucer.position.y = 0.7;
  g.add(saucer);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x8fe8d8, emissive: 0x4fd8c0, emissiveIntensity: 0.5, flatShading: true })
  );
  dome.position.y = 0.76;
  g.add(dome);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffc030, emissiveIntensity: 0.9, flatShading: true })
    );
    light.position.set(Math.cos(a) * 0.32, 0.64, Math.sin(a) * 0.32);
    g.add(light);
  }
  g.userData.spin = saucer;
  return g;
}

export function scStar() {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
  );
  return s;
}

export function scSpacePlanet() {
  const g = new THREE.Group();
  const colors = [0xd07a4f, 0x4f7ad0, 0xb04fd0, 0x50c08a];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.6, 14, 11), lambert(c));
  p.position.y = 1.4;
  g.add(p);
  if (Math.random() < 0.5) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 26), lambert(0xe8d8a0));
    ring.rotation.x = Math.PI / 2 - 0.4;
    ring.position.y = 1.4;
    g.add(ring);
  }
  return g;
}

// ===================== RARE STAGE: HELL =====================

export function obLavaRock() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), lambert(0x3a2420));
  rock.position.y = 0.34;
  rock.scale.y = 0.85;
  g.add(rock);
  // Glowing cracks
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.04, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xff8a2a, emissive: 0xff6a00, emissiveIntensity: 1, flatShading: true })
    );
    crack.position.set(Math.cos(a) * 0.24, 0.34 + (Math.random() - 0.5) * 0.3, Math.sin(a) * 0.24);
    crack.rotation.y = a;
    g.add(crack);
  }
  return g;
}

export function obPitchfork() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), lambert(0x4a2a20));
  handle.position.y = 0.5;
  g.add(handle);
  const steel = lambert(0x8a2f2f);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), steel);
  cross.position.y = 0.98;
  g.add(cross);
  for (const x of [-0.18, 0, 0.18]) {
    const tine = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 6), steel);
    tine.position.set(x, 1.15, 0);
    g.add(tine);
  }
  return g;
}

export function obFireGeyser() {
  const g = new THREE.Group();
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 12), lambert(0x2f1e1a));
  vent.position.y = 0.1;
  g.add(vent);
  const flames = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16 - i * 0.02, 0.34, 8),
      new THREE.MeshLambertMaterial({
        color: i < 2 ? 0xff5a1a : 0xffb02a,
        emissive: i < 2 ? 0xff3a00 : 0xff8a00,
        emissiveIntensity: 0.9, flatShading: true,
        transparent: true, opacity: 0.9,
      })
    );
    flame.position.y = 0.3 + i * 0.22;
    flames.add(flame);
  }
  g.add(flames);
  g.userData.flicker = flames;
  return g;
}

export function obDemonGnome() {
  // The backyard gnome's evil twin — a nice callback
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.55, 14), lambert(0x6a2020));
  body.position.y = 0.32;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 11), lambert(0xc4604a));
  head.position.y = 0.72;
  g.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 9), lambert(0x2f2320));
  beard.scale.set(1, 1.05, 0.7);
  beard.position.set(0, 0.56, 0.1);
  g.add(beard);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 7), lambert(0x2f1e1a));
    horn.position.set(side * 0.13, 0.94, 0);
    horn.rotation.z = side * 0.4;
    g.add(horn);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xffd02a, emissive: 0xffa000, emissiveIntensity: 1, flatShading: true })
    );
    eye.position.set(side * 0.08, 0.78, 0.18);
    g.add(eye);
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.5, 14), lambert(0x8a1f1f));
  hat.position.y = 1.12;
  g.add(hat);
  return g;
}

export function obCauldron() {
  // Three legs, an iron pot and a lid of glowing brew. The legs matter —
  // a bare pot on the ground read as a boulder.
  const g = new THREE.Group();
  const iron = lambert(0x241d1b);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.3, 6), iron);
    leg.position.set(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    g.add(leg);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.42, 14), iron);
  pot.position.y = 0.5;
  g.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), lambert(0x3a2f2a));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.7;
  g.add(rim);
  const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 14), litMat(0x8cf25a, 0x4ad02a, 1));
  brew.position.y = 0.69;
  g.add(brew);
  for (const [x, z, r] of [[0.1, 0.05, 0.08], [-0.12, -0.06, 0.06], [0.02, -0.13, 0.05]]) {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), litMat(0xb6f78a, 0x6ae03a, 1));
    bubble.position.set(x, 0.72 + r * 0.5, z);
    g.add(bubble);
  }
  // Handle hoop, so the silhouette has something above the rim
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 6, 16, Math.PI), iron);
  handle.position.y = 0.7;
  g.add(handle);
  return g;
}

export function obSkullPile() {
  const g = new THREE.Group();
  const bone = lambert(0xe2d8bd);
  const socket = lambert(0x1a1210);
  const makeSkull = (s) => {
    const sk = new THREE.Group();
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), bone);
    cranium.scale.set(1, 0.95, 1.05);
    sk.add(cranium);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.16), bone);
    jaw.position.set(0, -0.15, 0.04);
    sk.add(jaw);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), socket);
      eye.position.set(side * 0.07, 0.02, 0.14);
      sk.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), socket);
    nose.position.set(0, -0.06, 0.16);
    nose.rotation.x = Math.PI;
    sk.add(nose);
    sk.scale.setScalar(s);
    return sk;
  };
  for (const [x, y, z, s] of [[0, 0.19, 0, 1], [0.27, 0.17, 0.07, 0.85], [-0.25, 0.17, -0.05, 0.85], [0.03, 0.48, 0.03, 0.9]]) {
    const sk = makeSkull(s);
    sk.position.set(x, y, z);
    sk.rotation.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.5);
    g.add(sk);
  }
  // Loose bones spilling out of the bottom of the heap
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), bone);
    b.position.set(Math.cos(a) * 0.32, 0.04, Math.sin(a) * 0.28);
    b.rotation.set(Math.PI / 2, 0, a);
    g.add(b);
  }
  return g;
}

export function obDemonDoghouse() {
  // A doghouse from the bad place — horns on the ridge, fangs in the doorway.
  // The one obstacle in hell that's about being a dog.
  const g = new THREE.Group();
  const plank = lambert(0x4d251c);
  const shingle = lambert(0x2b1512);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.6, 0.72), plank);
  body.position.y = 0.3;
  g.add(body);
  for (const side of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.8), shingle);
    roof.position.set(side * 0.22, 0.78, 0);
    roof.rotation.z = side * -0.72;
    g.add(roof);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 7), lambert(0x1d100e));
    horn.position.set(side * 0.16, 1.06, 0);
    horn.rotation.z = side * 0.5;
    g.add(horn);
  }
  // The doorway: a dark mouth with hellfire behind it
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.06), lambert(0x140b0a));
  mouth.position.set(0, 0.26, 0.37);
  g.add(mouth);
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.4), litMat(0xff7a2a, 0xff4400, 1));
  fire.position.set(0, 0.26, 0.4);
  g.add(fire);
  for (let i = 0; i < 4; i++) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 5), lambert(0xe2d8bd));
    fang.position.set(-0.14 + i * 0.095, 0.42, 0.41);
    fang.rotation.x = Math.PI;
    g.add(fang);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), litMat(0xffd02a, 0xffa000, 1));
    eye.position.set(side * 0.2, 0.5, 0.37);
    g.add(eye);
  }
  // Nameplate — blank, because you do not want to read it
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.03), lambert(0x8a6a2a));
  plate.position.set(0, 0.58, 0.38);
  g.add(plate);
  return g;
}

export function scStalagmite() {
  const h = 1.2 + Math.random() * 1.4;
  const s = new THREE.Mesh(new THREE.ConeGeometry(0.3 + Math.random() * 0.2, h, 7), lambert(0x35211d));
  s.position.y = h / 2;
  return s;
}

export function scLavaPool() {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6 + Math.random() * 0.4, 0.55, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff5500, emissiveIntensity: 0.85, flatShading: true })
  );
  pool.position.y = 0.05;
  g.add(pool);
  return g;
}

export function scTorch() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8), lambert(0x2f1e1a));
  post.position.y = 0.75;
  g.add(post);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.18, 10), lambert(0x4a2f22));
  bowl.position.y = 1.55;
  g.add(bowl);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xffa62a, emissive: 0xff7000, emissiveIntensity: 1, flatShading: true })
  );
  flame.position.y = 1.82;
  g.add(flame);
  return g;
}

// ===================== RARE STAGE: UNDERWATER =====================
// Seabed floor, so everything is either anchored to it or tethered above it.
// Translucent parts (jellyfish bell, bubbles) are deliberately non-solid:
// measureHalfExtents skips transparent meshes, so they don't grow a hitbox
// around the part you can visibly see straight through.

const WATER_SHELL = 0xf2e6d2;

export function collectPearl() {
  const g = new THREE.Group();
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glowMat(0xfdf6ff, 0xd8c8f0));
  g.add(pearl);
  // Half-shell cradle so it reads as treasure, not just a white ball
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    glowMat(0xf7b8c8)
  );
  shell.position.y = -0.08;
  shell.scale.y = 0.6;
  g.add(shell);
  return makeCollectible(g, 0xffe0f0);
}

export function obCoral() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), lambert(0xd85f7a));
  base.scale.set(1.1, 0.6, 1.1);
  base.position.y = 0.12;
  g.add(base);
  // Branching arms — the fork is what makes it coral rather than a cactus
  for (const [x, z, lean, h, c] of [
    [0, 0, 0, 0.62, 0xe8718c], [0.2, 0.06, 0.42, 0.46, 0xf08aa0],
    [-0.19, -0.05, -0.4, 0.5, 0xd85f7a], [0.06, -0.2, 0.2, 0.38, 0xf5a0b4],
  ]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, h, 8), lambert(c));
    arm.position.set(x, 0.15 + h / 2, z);
    arm.rotation.z = lean;
    g.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), lambert(c));
    tip.position.set(x + Math.sin(lean) * -h * 0.5, 0.15 + h, z);
    g.add(tip);
  }
  return g;
}

export function obTreasureChest() {
  const g = new THREE.Group();
  const wood = lambert(0x7a4f2a);
  const gold = lambert(0xf0c64a);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.46), wood);
  box.position.y = 0.18;
  g.add(box);
  // Lid propped open, gold spilling out — reads instantly as treasure
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.66, 12, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.set(0, 0.4, 0.06);
  lid.rotation.x = -0.5;
  g.add(lid);
  for (const y of [0.12, 0.28]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), gold);
    band.position.y = y;
    g.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), gold);
  lock.position.set(0, 0.26, -0.25);
  g.add(lock);
  for (const [x, z] of [[-0.14, -0.06], [0.1, 0.04], [0.02, -0.14]]) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), glowMat(0xffd54f, 0xc09020));
    coin.position.set(x, 0.38, z);
    coin.rotation.x = Math.random() * 0.5;
    g.add(coin);
  }
  return g;
}

export function obGiantClam() {
  const g = new THREE.Group();
  const shellMat = lambert(WATER_SHELL);
  const lipMat = lambert(0xc98fb0);
  for (const [sy, tilt] of [[1, -0.45], [-1, 0.1]]) {
    const half = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      shellMat
    );
    half.scale.set(1, 0.5, 1);
    half.position.y = 0.24 + sy * 0.1;
    half.rotation.z = tilt;
    if (sy < 0) half.rotation.x = Math.PI;
    g.add(half);
    // Ribs, so the shells don't read as two plain domes
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.34), lipMat);
      rib.position.set(Math.sin(a) * 0.22, 0.26 + sy * 0.12, Math.cos(a) * 0.1);
      rib.rotation.y = a;
      rib.rotation.z = tilt;
      g.add(rib);
    }
  }
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 9), glowMat(0xfdf6ff, 0xd8c8f0));
  pearl.position.y = 0.26;
  g.add(pearl);
  return g;
}

export function obAnchor() {
  const g = new THREE.Group();
  const iron = lambert(0x6f7a82);
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 8), iron);
  shank.position.y = 0.55;
  g.add(shank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), iron);
  ring.position.y = 1.12;
  g.add(ring);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.06), iron);
  stock.position.y = 0.92;
  g.add(stock);
  // Curved arms at the base — the shape everyone recognises
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 8, 18, Math.PI), iron);
  arms.position.y = 0.18;
  arms.rotation.x = Math.PI / 2;
  arms.rotation.z = Math.PI;
  g.add(arms);
  for (const sx of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 6), iron);
    fluke.position.set(sx * 0.3, 0.3, 0);
    fluke.rotation.z = sx * -0.5;
    g.add(fluke);
  }
  return g;
}

export function obSeaUrchin() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 11), lambert(0x3a2550));
  body.position.y = 0.26;
  g.add(body);
  const spineMat = lambert(0x5e3f7a);
  for (let i = 0; i < 22; i++) {
    // Even-ish spread using the golden angle, so no bald patches
    const y = 1 - (i / 21) * 1.7;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.26, 5), spineMat);
    spine.position.set(dir.x * 0.3, 0.26 + dir.y * 0.3, dir.z * 0.3);
    spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(spine);
  }
  return g;
}

export function obJellyfish() {
  const g = new THREE.Group();
  // The bell is transparent, so it carries NO hitbox — the solid core and
  // the tentacle stalks are what the collision box gets measured from.
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({
      color: 0xc89ff0, emissive: 0x7a4fd0, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.55, flatShading: true,
    })
  );
  bell.position.y = 0.86;
  bell.scale.y = 0.82;
  g.add(bell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), litMat(0xe8d0ff, 0x9a6ae0, 0.8));
  core.position.y = 0.82;
  g.add(core);
  const frill = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 20), litMat(0xd8b8ff, 0x8a5ad0, 0.7));
  frill.rotation.x = Math.PI / 2;
  frill.position.y = 0.84;
  g.add(frill);
  const tentacles = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.01, 0.62, 6), litMat(0xd8b8ff, 0x8a5ad0, 0.6));
    t.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2);
    tentacles.add(t);
  }
  g.add(tentacles);
  g.userData.sway = tentacles;
  return g;
}

export function scKelp() {
  const g = new THREE.Group();
  const h = 2.4 + Math.random() * 2.2;
  const seg = 5;
  const mat = lambert(Math.random() < 0.5 ? 0x2f7a4a : 0x3f8f52);
  for (let i = 0; i < seg; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, h / seg, 0.06), mat);
    // Each segment leans a little further, giving the frond a lazy curve
    blade.position.set(Math.sin(i * 0.8) * 0.18, (i + 0.5) * (h / seg), 0);
    blade.rotation.z = Math.sin(i * 0.8) * 0.22;
    g.add(blade);
  }
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

export function scSeaFan() {
  const g = new THREE.Group();
  const c = [0xe0705a, 0xd8557a, 0xe89a4a][Math.floor(Math.random() * 3)];
  const mat = lambert(c);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 7), mat);
  stem.position.y = 0.2;
  g.add(stem);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.3;
    const h = 0.9 - Math.abs(a) * 0.45;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 6), mat);
    rib.position.set(Math.sin(a) * 0.34, 0.4 + h / 2, 0);
    rib.rotation.z = a;
    g.add(rib);
  }
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

export function scSeaRock() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.45, 0), lambert(0x5a6470));
  rock.position.y = 0.3;
  rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  g.add(rock);
  // Barnacles and a little algae so it isn't a bare grey lump
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 6), lambert(0x8e9aa4));
    b.position.set(Math.cos(a) * 0.4, 0.5 + Math.random() * 0.2, Math.sin(a) * 0.4);
    g.add(b);
  }
  const algae = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lambert(0x3f8f52));
  algae.scale.set(1.2, 0.4, 1.1);
  algae.position.y = 0.62;
  g.add(algae);
  return g;
}

export function scBubbleColumn() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: 0xdff6ff, transparent: true, opacity: 0.4, flatShading: true,
  });
  for (let i = 0; i < 7; i++) {
    const r = 0.05 + Math.random() * 0.09;
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    b.position.set((Math.random() - 0.5) * 0.4, 0.3 + i * 0.42, (Math.random() - 0.5) * 0.3);
    g.add(b);
  }
  return g;
}

// ===================== SPACESHIPS (space stage) =====================
// Both the runner and the quarry get a little ship so the chase continues
// in orbit. The character sits in the cockpit rather than being replaced.

export function makeShip(tint = 0xd8dde6, accent = 0xe8622e) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), lambert(tint));
  hull.rotation.x = Math.PI / 2;
  hull.position.y = 0.42;
  hull.scale.set(1, 1, 0.72);
  g.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 14), lambert(accent));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.42, -0.72);
  g.add(nose);
  // Glass canopy the character shows through
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.42, flatShading: true,
    })
  );
  canopy.position.y = 0.72;
  g.add(canopy);
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), lambert(accent));
    fin.position.set(sx * 0.5, 0.34, 0.28);
    fin.rotation.z = sx * 0.35;
    g.add(fin);
  }
  // Thruster glow at the back
  const thruster = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.5, 10),
    new THREE.MeshLambertMaterial({
      color: 0x8fd8ff, emissive: 0x4fb8ff, emissiveIntensity: 1,
      flatShading: true, transparent: true, opacity: 0.85,
    })
  );
  thruster.rotation.x = Math.PI / 2;
  thruster.position.set(0, 0.42, 0.75);
  g.add(thruster);
  g.userData.thruster = thruster;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ===================== GATES (entering / leaving the house) =====================
// A wall spanning the track with one or two lanes left as doors. Hitting a
// panel is a wipeout; picking a door bursts you through into the house.
//
// Every piece is built to the live lane width and carries an optional WING:
// a run of facade extending from the outermost lane out to the scenery walls.
// Without it the gate was five free-standing slabs with daylight either side
// of them, which never read as the front of a building you were entering.

export const GATE_H = 2.05;

// Extends `g` sideways from the edge of a `width`-wide piece out to the walls.
// side: -1 or +1 in the piece's local X (see spawnDoorGate for which is which).
function gateWing(g, width, side, len, faceMat, trimMat) {
  if (!side || !(len > 0)) return;
  const x = side * (width / 2 + len / 2);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, GATE_H, 0.16), faceMat);
  wall.position.set(x, GATE_H / 2, 0);
  g.add(wall);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.3), trimMat);
  eave.position.set(x, GATE_H + 0.05, 0);
  g.add(eave);
}

// Runs the full width of every piece, so the tops line up into one roofline
// across the whole gate instead of five separate silhouettes.
function gateEave(g, width, mat) {
  const eave = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.15, 0.3), mat);
  eave.position.y = GATE_H + 0.05;
  g.add(eave);
}

export function obDoorPanel(width = 1.0, wingSide = 0, wingLen = 0) {
  const g = new THREE.Group();
  const face = lambert(0xe0d2bb);
  const trim = lambert(0xb9a68c);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, GATE_H, 0.16), face);
  panel.position.y = GATE_H / 2;
  g.add(panel);
  // Siding lines so it reads as an exterior wall, not a blank slab
  for (const y of [0.4, 0.9, 1.4, 1.9]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width * 1.01, 0.05, 0.19), lambert(0xcbbba2));
    line.position.y = y;
    g.add(line);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.18, 0.22), trim);
  base.position.y = 0.09;
  g.add(base);
  gateEave(g, width, trim);
  gateWing(g, width, wingSide, wingLen, face, trim);
  return g;
}

export function makeDoorway(width = 1.0, wingSide = 0, wingLen = 0) {
  const g = new THREE.Group();
  const face = lambert(0xe0d2bb);
  const trim = lambert(0xb9a68c);
  const frameMat = lambert(0x8a5f3a);
  // The opening is inset inside the lane, and the leftover width either side
  // is filled with the same siding as the panels — that's what makes the
  // facade continuous across a doorway lane.
  const open = Math.min(0.94, width * 0.78);
  const shoulder = (width - open) / 2;
  for (const sx of [-1, 1]) {
    if (shoulder > 0.02) {
      const infill = new THREE.Mesh(new THREE.BoxGeometry(shoulder, GATE_H, 0.16), face);
      infill.position.set(sx * (width - shoulder) / 2, GATE_H / 2, 0);
      g.add(infill);
    }
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.13, GATE_H, 0.22), frameMat);
    jamb.position.set(sx * (open / 2 + 0.05), GATE_H / 2, 0);
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(open + 0.26, 0.16, 0.22), frameMat);
  lintel.position.y = GATE_H - 0.08;
  g.add(lintel);
  // The door itself — hinged, swung ajar and glowing invitingly
  const door = new THREE.Mesh(new THREE.BoxGeometry(open * 0.94, GATE_H - 0.25, 0.09), lambert(0xa8623c));
  door.position.set(-open * 0.35, (GATE_H - 0.25) / 2, 0.22);
  door.rotation.y = 0.75;
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lambert(0xf0d47a));
  knob.position.set(0.02, 0.92, 0.42);
  g.add(knob);
  // Warm light spilling out of the opening — reads instantly as "go here"
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(open, GATE_H - 0.2),
    new THREE.MeshBasicMaterial({
      color: 0xffdf9a, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    })
  );
  glow.position.y = (GATE_H - 0.2) / 2;
  g.add(glow);
  g.userData.glow = glow;
  gateEave(g, width, trim);
  gateWing(g, width, wingSide, wingLen, face, trim);
  return g;
}

// The way OUT of the house: a patio slider you smash straight through, so
// leaving is as physical as arriving was. Every lane is breakable — this is
// the payoff for surviving the house, not another thing to dodge.
export function makeGlassPane(width = 1.0, wingSide = 0, wingLen = 0) {
  const g = new THREE.Group();
  // Wings keep the interior wall treatment: the hallway you've been running
  // down carries right up to the glass.
  const wallFace = lambert(0xe8dcc8);
  const wallTrim = lambert(0xf5efe4);
  const frameMat = lambert(0xd2d7dc);
  const gw = width * 0.96;
  const gh = GATE_H - 0.2;

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(gw, gh, 0.05),
    new THREE.MeshLambertMaterial({
      color: 0xbfe6f2, transparent: true, opacity: 0.3, flatShading: true,
    })
  );
  glass.position.y = gh / 2 + 0.1;
  g.add(glass);
  // Daylight on the far side — the tell that outside is through there
  const beyond = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gh),
    new THREE.MeshBasicMaterial({
      color: 0xdaf2ff, transparent: true, opacity: 0.33,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    })
  );
  beyond.position.set(0, gh / 2 + 0.1, -0.04);
  g.add(beyond);
  // Diagonal highlight — without a specular streak, transparent glass just
  // looks like a hole and players ran at it expecting nothing to happen.
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(gw * 0.22, gh * 1.3),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    })
  );
  streak.position.set(-gw * 0.16, gh / 2 + 0.1, 0.05);
  streak.rotation.z = 0.42;
  g.add(streak);

  // Frame: sill, head and mullions
  const sill = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.24), frameMat);
  sill.position.y = 0.07;
  g.add(sill);
  const head = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.24), frameMat);
  head.position.y = GATE_H - 0.07;
  g.add(head);
  for (const sx of [-1, 1]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.09, GATE_H, 0.2), frameMat);
    mullion.position.set(sx * (width / 2 - 0.045), GATE_H / 2, 0);
    g.add(mullion);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.08, 0.14), frameMat);
  rail.position.y = 1.05;
  g.add(rail);

  gateEave(g, width, wallTrim);
  gateWing(g, width, wingSide, wingLen, wallFace, wallTrim);
  return g;
}
