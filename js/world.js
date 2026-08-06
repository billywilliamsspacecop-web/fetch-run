import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { THEMES, ALL_THEMES, playableEdgeAlpha, measureHalfExtents } from './themes.js';
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

// The space stage's sky: a shell of stars plus a few galaxies, sitting well
// outside the globe so the horizon occludes the lower half naturally. All of
// it is fog-exempt and additive — fogged stars just turn the same colour as
// the sky and vanish.
const SKY_RADIUS = 78;

// Untextured THREE.Points render as hard SQUARES, which at these sizes read
// as blocky dead pixels rather than stars. A generated radial-gradient sprite
// makes them round and soft — still no asset files, it's drawn in code.
let _starSprite = null;
function starSprite() {
  if (_starSprite) return _starSprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _starSprite = new THREE.CanvasTexture(c);
  return _starSprite;
}

function starPoints(count, size, color, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform on a sphere: acos-distributed latitude, or the poles clump.
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d = SKY_RADIUS * (0.85 + Math.random() * 0.3);
    pos.set([Math.cos(a) * r * d, u * d, Math.sin(a) * r * d], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color, size, sizeAttenuation: true, transparent: true, opacity,
    map: starSprite(), alphaTest: 0.02, depthWrite: false, fog: false,
  }));
}

// Built face-on in the XY plane (the default orientation for both Torus and
// Circle), so the whole group can simply be aimed at the camera and then
// tipped back to taste.
function makeGalaxy(tint) {
  const g = new THREE.Group();
  const glow = (c, o) => new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), glow(0xfff2d8, 0.6));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), glow(0xfff0d0, 0.15));
  g.add(halo);
  // Fat, overlapping, slightly eccentric rings. Thin well-separated ones
  // read as a bullseye rather than a galaxy — the tube radius has to be
  // large enough relative to the spacing that they blend into one disc.
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4 + i * 1.7, 1.0 + i * 0.45, 6, 32),
      glow(tint, 0.13 - i * 0.025)
    );
    ring.scale.set(1.05 + i * 0.07, 0.92 - i * 0.05, 1);
    ring.rotation.z = i * 0.4;
    g.add(ring);
  }
  return g;
}

function buildStarfield(camera) {
  const sky = new THREE.Group();
  sky.visible = false; // only the space stage turns this on
  // Sizes are in world units and scale by 1/distance, so at SKY_RADIUS these
  // land at roughly 2-6px. Anything above ~0.6 turned into obvious blobs.
  sky.add(starPoints(520, 0.22, 0xffffff, 0.95));
  sky.add(starPoints(260, 0.38, 0xbfd8ff, 0.85));
  sky.add(starPoints(110, 0.6, 0xffe9c0, 0.8));

  // Galaxies are aimed in CAMERA space, not world space. Placed by world
  // azimuth/elevation they kept landing outside the frustum: the camera is
  // pitched ~34 degrees down and portrait is narrow, so the strip of sky
  // actually on screen is only about 20 degrees tall and 35 wide. Offsetting
  // from the camera's own forward vector puts them where they can be seen,
  // and stays correct if the camera is ever re-framed.
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  const tints = [0x8f6fe8, 0x4f9ad8, 0xe86f9a, 0x5fd8c0];
  // [yaw, pitch, scale, tilt] — pitch 0.2-0.55rad is the band above the horizon
  const spots = [
    [-0.17, 0.27, 0.62, 1.1], [0.15, 0.44, 0.8, 0.75],
    [0.02, 0.56, 0.5, 1.3], [-0.3, 0.5, 0.55, 0.9],
  ];
  for (let i = 0; i < spots.length; i++) {
    const gal = makeGalaxy(tints[i]);
    const [yaw, pitch, scale, tilt] = spots[i];
    const dir = fwd.clone()
      .addScaledVector(right, Math.tan(yaw))
      .addScaledVector(up, Math.tan(pitch))
      .normalize();
    gal.position.copy(camera.position).addScaledVector(dir, SKY_RADIUS);
    gal.lookAt(camera.position); // face-on, then tip back so it reads as a disc
    gal.rotateX(tilt);
    gal.rotateZ(i * 0.7);
    gal.scale.setScalar(scale);
    sky.add(gal);
  }
  return sky;
}

// Builds the whole world. Every theme's scenery is built once into its own
// group; only the active theme's group is visible, so switching levels is a
// visibility toggle rather than a rebuild (all primitives, cheap to hold).
export function buildWorld(scene, camera) {
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
  for (const theme of ALL_THEMES) {
    const group = new THREE.Group();
    group.visible = theme.id === first.id;
    for (const spec of theme.scenery) {
      const { halfW } = measureHalfExtents(spec.make, 5);
      const clearance = edge + halfW / R;
      const span = spec.far - spec.near;
      const place = (theta, side, jitter) => {
        const alpha = side * (clearance + spec.near + jitter * span);
        const obj = spec.make();
        // Scenery gets the same dark line the obstacles do — without it the
        // stage split into two art styles, outlined things in the lanes and
        // un-outlined ones either side of them. It's a heavier line than a
        // prop's (background objects are small on screen and a hairline
        // disappears) and it skips the tiny details (see addOutline's
        // minRadius) so the draw-call count stays sane out here.
        P.addOutline(obj, { thickness: 0.06, minRadius: 0.07 });
        obj.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
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
  // Opaque now that they carry an outline. They used to be blended at 0.8 to
  // soften them against the ground; with a dark shell behind them that blend
  // pulled the shell's colour THROUGH the tick, so the same lane markings came
  // out muddy or bright depending on draw order. The outline does the job the
  // transparency was doing — separating tick from ground — and does it
  // consistently.
  const dashMat = new THREE.MeshBasicMaterial({ color: first.dash });
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
  // ...and the trail markings carry the line too. A dash is a thin chip lying
  // flat on the ground, so the shell grows by a fixed few MILLIMETRES rather
  // than by a percentage: the tick is only 5cm across, and the 5cm margin a
  // prop-sized outline would give doubled its width into a fat domino.
  const dashOutline = P.outlineInstanced(
    dashes, new THREE.BoxGeometry(0.05 + 0.022, 0.02 + 0.012, 0.34 + 0.022)
  );
  planetGroup.add(dashOutline);

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
  // Fattened cone, and dropped so the wider base still meets the ground
  // instead of hovering a shell's thickness above it.
  const tuftFat = new THREE.ConeGeometry(0.07 + 0.025, 0.16 + 0.04, 5);
  tuftFat.translate(0, -0.012, 0);
  const tuftOutline = P.outlineInstanced(tufts, tuftFat);
  planetGroup.add(tuftOutline);

  // Clouds orbit slowly at lateral offsets so they never hit the camera
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = P.addOutline(P.scCloud(), { thickness: 0.09 });
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

  const starfield = buildStarfield(camera);
  scene.add(starfield);

  // Bubbles drifting through the water column (underwater stage only). Same
  // trick as the clouds — parked on orbiting pivots above the surface — but
  // they rise as well as orbit, which is what sells "submerged" over "foggy".
  const bubbles = [];
  const bubbleMat = new THREE.MeshLambertMaterial({
    color: 0xdff6ff, transparent: true, opacity: 0.34, flatShading: true,
  });
  for (let i = 0; i < 26; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.22, 8, 6), bubbleMat);
    const side = i % 2 === 0 ? -1 : 1;
    const alpha = side * (0.06 + Math.random() * 0.5);
    const pivot = surfacePivot(Math.random() * Math.PI * 2, alpha, b, R + 1 + Math.random() * 7);
    pivot.userData.speed = 0.05 + Math.random() * 0.09;  // orbit (toward camera)
    pivot.userData.rise = 0.5 + Math.random() * 1.1;     // upward drift
    pivot.userData.baseY = b.position.y;
    pivot.visible = false;
    scene.add(pivot);
    bubbles.push(pivot);
  }

  return {
    planetGroup, clouds, sunDisc, sceneryGroups, tufts, tuftOutline, starfield, bubbles,
    lights: { hemi, sun },
    tintables: {
      planetMat: planet.material,
      tuftMat,
      dashMat,
      canopyMats: P.getCanopyMats(),
    },
  };
}
