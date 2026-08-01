import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';

const R = CONFIG.planetRadius;

const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// Place `obj` on the globe surface: theta = angle along travel direction
// (0 = top where the dog is, negative = ahead over the horizon),
// alpha = lateral angle (positive = left). Returns the pivot.
export function surfacePivot(theta, alpha, obj, radius = R) {
  const pivot = new THREE.Group();
  pivot.rotation.set(theta, 0, alpha); // order XYZ => lateral tilt, then travel
  obj.position.y = radius;
  pivot.add(obj);
  return pivot;
}

export function laneAlpha(laneFloat) {
  return (2 - laneFloat) * CONFIG.laneAngle;
}

function makeTree() {
  const g = new THREE.Group();
  const h = 0.7 + Math.random() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, h, 7), lambert(COLORS.trunk));
  trunk.position.y = h / 2;
  g.add(trunk);
  const color = COLORS.canopy[Math.floor(Math.random() * COLORS.canopy.length)];
  if (Math.random() < 0.35) {
    // Pine
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), lambert(color));
    cone.position.y = h + 0.7;
    g.add(cone);
  } else {
    // Round canopy, 1-2 blobs
    const r1 = 0.55 + Math.random() * 0.35;
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(r1, 9, 7), lambert(color));
    c1.position.y = h + r1 * 0.75;
    g.add(c1);
    if (Math.random() < 0.5) {
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.6, 8, 6), lambert(color));
      c2.position.set(0.35, h + r1 * 1.15, 0.1);
      g.add(c2);
    }
    // Some trees carry little fruit for detail
    if (Math.random() < 0.45) {
      const fruitMat = lambert(Math.random() < 0.5 ? 0xd94f4f : 0xf0a030);
      for (let f = 0; f < 3; f++) {
        const a = Math.random() * Math.PI * 2;
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), fruitMat);
        fruit.position.set(
          Math.cos(a) * r1 * 0.85,
          h + r1 * 0.75 + (Math.random() - 0.3) * r1 * 0.6,
          Math.sin(a) * r1 * 0.85
        );
        g.add(fruit);
      }
    }
  }
  const s = 0.8 + Math.random() * 0.6;
  g.scale.setScalar(s);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

function makeBush() {
  const b = new THREE.Mesh(
    new THREE.SphereGeometry(0.3 + Math.random() * 0.25, 8, 6),
    lambert(COLORS.planetDark)
  );
  b.scale.y = 0.7;
  return b;
}

function makeFlower() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 5), lambert(0x4f8f3a));
  stem.position.y = 0.12;
  g.add(stem);
  const colors = [0xffffff, 0xffd54f, 0xe57a8a, 0xb08ae5];
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 7, 5),
    lambert(colors[Math.floor(Math.random() * colors.length)])
  );
  head.position.y = 0.28;
  g.add(head);
  return g;
}

function makeCloud() {
  const g = new THREE.Group();
  const m = lambert(COLORS.cloud);
  const sizes = [0.9, 0.65, 0.7];
  const offs = [[0, 0, 0], [0.85, -0.1, 0.1], [-0.8, -0.15, -0.05]];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sizes[i], 8, 6), m);
    s.position.set(...offs[i]);
    s.scale.y = 0.65;
    g.add(s);
  }
  return g;
}

// Builds the whole static world. Returns { planetGroup, clouds, lights } —
// planetGroup.rotation.x is the spin the game advances each frame; lights are
// exposed so main can lerp them through the per-stage palettes.
export function buildWorld(scene) {
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 30, 58);

  const hemi = new THREE.HemisphereLight(0xfff2dd, 0x6a9b4a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  // High and off to the side so shadows fall across the play area
  sun.position.set(14, 38, 16);
  sun.target.position.set(0, R - 2, 5);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const cam = sun.shadow.camera;
  cam.left = -16; cam.right = 16; cam.top = 16; cam.bottom = -16;
  cam.near = 5; cam.far = 80;
  sun.shadow.bias = -0.002;
  scene.add(sun);

  const planetGroup = new THREE.Group();
  scene.add(planetGroup);

  // The globe, with gentle vertex jitter for a handmade low-poly feel.
  // Rotated so the geometry poles sit on the sides — the running path crosses
  // the equator band where the triangles are clean, not the ugly pole fans.
  const geo = new THREE.SphereGeometry(R, 52, 36);
  geo.rotateZ(Math.PI / 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // Deterministic jitter keyed on position: the sphere's seam/pole vertices
    // are duplicated, and random displacement tears cracks between them —
    // hashing the (rounded) position moves duplicates identically.
    const hx = Math.round(v.x * 1e4), hy = Math.round(v.y * 1e4), hz = Math.round(v.z * 1e4);
    const h = Math.sin(hx * 12.9898 + hy * 78.233 + hz * 37.719) * 43758.5453;
    const jitter = (h - Math.floor(h)) - 0.5;
    v.multiplyScalar(R + jitter * 0.28);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const planet = new THREE.Mesh(geo, lambert(COLORS.planet));
  planet.receiveShadow = true;
  planetGroup.add(planet);

  // Scatter scenery outside the lane band so the running path stays clear
  const laneBand = 3.2 * CONFIG.laneAngle;
  const scatter = (make, count, minAlpha, maxAlpha) => {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const side = Math.random() < 0.5 ? -1 : 1;
      const alpha = side * (minAlpha + Math.random() * (maxAlpha - minAlpha));
      const obj = make();
      obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      planetGroup.add(surfacePivot(theta, alpha, obj));
    }
  };
  // Portrait view only shows ~±0.4 rad of lateral surface, so keep scenery close
  scatter(makeTree, 70, laneBand + 0.02, 0.55);
  scatter(makeBush, 56, laneBand + 0.01, 0.6);
  scatter(makeFlower, 70, laneBand, 0.45);

  // Lane-divider dashes ring the whole globe — they scroll with the spin and
  // sell the "world rolling toward you" feel. Instanced: one draw call.
  const dashGeo = new THREE.BoxGeometry(0.05, 0.02, 0.34);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xa8dd78, transparent: true, opacity: 0.55 });
  const boundaries = [];
  for (let b = -2.5; b <= 2.5; b++) boundaries.push(b * CONFIG.laneAngle);
  const perRing = 46;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, boundaries.length * perRing);
  const m = new THREE.Matrix4();
  const mRot = new THREE.Matrix4();
  let di = 0;
  for (const alpha of boundaries) {
    for (let i = 0; i < perRing; i++) {
      const theta = (i / perRing) * Math.PI * 2;
      m.makeRotationX(theta);
      m.multiply(mRot.makeRotationZ(alpha));
      m.multiply(mRot.makeTranslation(0, R + 0.03, 0));
      dashes.setMatrixAt(di++, m);
    }
  }
  planetGroup.add(dashes);

  // Grass tufts inside the lane band — harmless ground texture underfoot
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.16, 5);
  const tuftMat = lambert(COLORS.planetDark);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 150);
  for (let i = 0; i < 150; i++) {
    const theta = Math.random() * Math.PI * 2;
    const alpha = (Math.random() - 0.5) * 2 * (laneBand + 0.05);
    m.makeRotationX(theta);
    m.multiply(mRot.makeRotationZ(alpha));
    m.multiply(mRot.makeTranslation(0, R + 0.02, 0));
    tufts.setMatrixAt(i, m);
  }
  planetGroup.add(tufts);

  // Clouds orbit slowly at lateral offsets so they never hit the camera
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = makeCloud();
    const side = i % 2 === 0 ? -1 : 1;
    const alpha = side * (0.35 + Math.random() * 0.75);
    const pivot = surfacePivot(Math.random() * Math.PI * 2, alpha, cloud, R + 6 + Math.random() * 4);
    pivot.userData.speed = 0.008 + Math.random() * 0.012;
    scene.add(pivot);
    clouds.push(pivot);
  }

  // Low warm sun in the sky (unaffected by fog)
  const sun2 = new THREE.Mesh(
    new THREE.CircleGeometry(5.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffeec4, fog: false })
  );
  sun2.position.set(-13, 34, -42);
  sun2.lookAt(0, R + 5, 8.6);
  scene.add(sun2);

  return { planetGroup, clouds, lights: { hemi, sun } };
}
