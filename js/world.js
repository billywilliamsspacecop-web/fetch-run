import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { THEMES, playableEdgeAlpha, measureHalfExtents } from './themes.js';
import * as P from './props.js';

const R = CONFIG.planetRadius;

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

// Builds the whole world. Every theme's scenery is built once into its own
// group; only the active theme's group is visible, so switching levels is a
// visibility toggle rather than a rebuild (all primitives, cheap to hold).
export function buildWorld(scene) {
  P.resetCanopyMats();

  const first = THEMES[0];
  scene.background = new THREE.Color(first.sky);
  // Fog starts well past the play area — near enough to soften the horizon,
  // far enough that obstacles and ground keep their color where it matters.
  scene.fog = new THREE.Fog(first.fog, 36, 72);

  const hemi = new THREE.HemisphereLight(0xfff2dd, 0x6a9b4a, first.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, first.sun);
  // High and off to the side so shadows fall across the play area
  sun.position.set(14, 38, 16);
  sun.target.position.set(0, R - 2, 5);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  const geo = new THREE.SphereGeometry(R, 72, 48);
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
  const planet = new THREE.Mesh(geo, P.lambert(first.planet));
  planet.receiveShadow = true;
  planetGroup.add(planet);

  // Per-theme scenery, kept strictly OUTSIDE the playable lanes.
  // Each type is offset by its own measured half-width, because a wide prop
  // (house wall, big tree) centred just past the lanes still reaches into
  // them — which looked like an obstacle you could inexplicably run through,
  // and made theme changes pop in a "wall" of unavoidable-looking clutter.
  // The old fixed 3.2*laneAngle band only worked on wide screens: laneAngle
  // shrinks with screen width, so phones lost the margin entirely.
  const edge = playableEdgeAlpha();
  const sceneryGroups = {};
  for (const theme of THEMES) {
    const group = new THREE.Group();
    group.visible = theme.id === first.id;
    for (const spec of theme.scenery) {
      const { halfW } = measureHalfExtents(spec.make, 5);
      const clearance = edge + halfW / R;
      const span = spec.far - spec.near;
      const place = (theta, side, jitter) => {
        const alpha = side * (clearance + spec.near + jitter * span);
        const obj = spec.make();
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        group.add(surfacePivot(theta, alpha, obj));
      };
      if (spec.even) {
        // Evenly spaced (and usually on both sides) so segments butt together
        // into a continuous run — random placement leaves gaps and overlaps,
        // which is fine for trees but breaks a hallway.
        for (let i = 0; i < spec.count; i++) {
          const theta = (i / spec.count) * Math.PI * 2;
          if (spec.bothSides) { place(theta, -1, 0); place(theta, 1, 0); }
          else place(theta, i % 2 === 0 ? -1 : 1, 0);
        }
      } else {
        for (let i = 0; i < spec.count; i++) {
          place(Math.random() * Math.PI * 2, Math.random() < 0.5 ? -1 : 1, Math.random());
        }
      }
    }
    planetGroup.add(group);
    sceneryGroups[theme.id] = group;
  }

  // Lane-divider dashes ring the whole globe — they scroll with the spin and
  // sell the "world rolling toward you" feel. Instanced: one draw call.
  const dashGeo = new THREE.BoxGeometry(0.05, 0.02, 0.34);
  const dashMat = new THREE.MeshBasicMaterial({
    color: first.dash, transparent: true, opacity: 0.55,
  });
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

  // Ground tufts inside the lane band — texture underfoot (grass, or floor
  // grain indoors; the theme just retints them)
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.16, 5);
  const tuftMat = P.lambert(first.tuft);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 150);
  for (let i = 0; i < 150; i++) {
    const theta = Math.random() * Math.PI * 2;
    const alpha = (Math.random() - 0.5) * 2 * edge; // tufts fill the running band
    m.makeRotationX(theta);
    m.multiply(mRot.makeRotationZ(alpha));
    m.multiply(mRot.makeTranslation(0, R + 0.02, 0));
    tufts.setMatrixAt(i, m);
  }
  planetGroup.add(tufts);

  // Clouds orbit slowly at lateral offsets so they never hit the camera
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = P.scCloud();
    const side = i % 2 === 0 ? -1 : 1;
    const alpha = side * (0.35 + Math.random() * 0.75);
    const pivot = surfacePivot(Math.random() * Math.PI * 2, alpha, cloud, R + 6 + Math.random() * 4);
    pivot.userData.speed = 0.008 + Math.random() * 0.012;
    scene.add(pivot);
    clouds.push(pivot);
  }

  // Low warm sun in the sky (unaffected by fog)
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffeec4, fog: false })
  );
  sunDisc.position.set(-13, 34, -42);
  sunDisc.lookAt(0, R + 5, 8.6);
  scene.add(sunDisc);

  return {
    planetGroup, clouds, sunDisc, sceneryGroups, tufts,
    lights: { hemi, sun },
    tintables: {
      planetMat: planet.material,
      tuftMat,
      dashMat,
      canopyMats: P.getCanopyMats(),
    },
  };
}
