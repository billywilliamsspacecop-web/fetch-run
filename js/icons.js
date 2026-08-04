import * as THREE from 'three';
import * as P from './props.js';
import { makeHat } from './dog.js';
import { buildChase } from './squirrel.js';

// Every icon in the DOM UI is a real three.js model, rendered once to a PNG
// data URL at boot. No emoji anywhere except the tennis ball glyph the menus
// are allowed to keep.
//
// Emoji were never actually neutral: they're a different art style, they draw
// from whatever font the OS ships, and they render differently on iOS, Android
// and desktop — so the shop looked like three different games. Baking the
// game's OWN geometry means the icons match the models they represent,
// including cosmetics, and change automatically when a model does.
//
// Baked to images rather than kept as live canvases because the UI needs
// dozens of them in lists and scroll views; a WebGL context each would be
// absurd, and they never need to animate.

const SIZE = 128;                 // 2x the largest on-screen use, for retina
let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();

function ensureRig() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  // Lit brighter and flatter than the game world: an icon is read at 24px
  // against a dark chip, so shape legibility beats moody shading.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x707080, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.0);
  key.position.set(2.5, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 0.9);
  rim.position.set(-3, 1.5, -2);
  scene.add(rim);
}

// Frames `obj` from its own bounding box, so every icon fills the tile the
// same amount regardless of how big the underlying model happens to be.
function bake(obj, { yaw = 0.6, pitch = 0.35, zoom = 1 } = {}) {
  ensureRig();
  const holder = new THREE.Group();
  holder.add(obj);
  scene.add(holder);

  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

  // Distance that fits `radius` in the vertical fov, with a little air
  const dist = (radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.9 / zoom;
  camera.position.set(
    centre.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    centre.y + Math.sin(pitch) * dist,
    centre.z + Math.cos(yaw) * Math.cos(pitch) * dist
  );
  camera.lookAt(centre);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(holder);
  return url;
}

// Powerup props come pre-wrapped in the pickup glow language (halo ring,
// ground pad, orbit ring). Strip that for the icon — at 24px the halo is a
// bright blob that swallows the item it's supposed to be advertising.
function baresPickup(makeFn) {
  const g = makeFn();
  const inner = g.userData.float;
  const keep = new THREE.Group();
  for (const child of [...inner.children]) {
    if (child === g.userData.halo || child === g.userData.ring) continue;
    keep.add(child);
  }
  return keep;
}

// --- one-off icons that have no in-game model ------------------------------

const flat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

function makeGear() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 20), flat(0xc9ced8));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), flat(0xdfe4ee));
    tooth.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0);
    tooth.rotation.z = a;
    g.add(tooth);
  }
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 16), flat(0x6b7280));
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  return g;
}

function makeSpeaker(muted) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), flat(0xe8ecf4));
  body.position.x = -0.28;
  g.add(body);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), flat(0xf5f8ff));
  cone.rotation.z = -Math.PI / 2;
  cone.rotation.y = Math.PI / 4;
  cone.position.x = 0.06;
  g.add(cone);
  if (muted) {
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.1), flat(0xff5a5a));
      bar.position.set(0.62, 0, 0);
      bar.rotation.z = s * Math.PI / 4;
      g.add(bar);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const wave = new THREE.Mesh(
        new THREE.TorusGeometry(0.26 + i * 0.18, 0.045, 6, 14, Math.PI * 0.7),
        flat(0x8fe0ff)
      );
      wave.position.x = 0.32;
      wave.rotation.z = -Math.PI * 0.35;
      g.add(wave);
    }
  }
  return g;
}

function makeStar() {
  // The rare-stage marker that used to be a text glyph
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({
    color: 0xfff0b0, emissive: 0xffd97a, emissiveIntensity: 0.8, flatShading: true,
  });
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 4), m);
    spike.rotation.z = (i / 4) * Math.PI * 2;
    spike.position.set(Math.sin((i / 4) * Math.PI * 2) * 0.3, Math.cos((i / 4) * Math.PI * 2) * 0.3, 0);
    g.add(spike);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), m));
  return g;
}

function makeNoHat() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 10, 24), flat(0x9aa2b2));
  g.add(ring);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.09, 0.09), flat(0x9aa2b2));
  bar.rotation.z = Math.PI / 4;
  g.add(bar);
  return g;
}

// --- registry ---------------------------------------------------------------

const BUILDERS = {
  ball: () => baresPickup(P.collectTennisBall),
  zoomies: () => baresPickup(P.powerFrisbee),
  magnet: () => baresPickup(P.powerMagnet),
  goldbone: () => baresPickup(P.powerBone),
  yarn: () => baresPickup(P.powerYarn),
  steak: () => baresPickup(P.powerSteak),
  rocket: () => baresPickup(P.powerRocket),
  slowmo: () => baresPickup(P.powerHourglass),
  scorch: () => baresPickup(P.powerFlame),

  gear: makeGear,
  star: makeStar,
  soundOn: () => makeSpeaker(false),
  soundOff: () => makeSpeaker(true),

  'hat.none': makeNoHat,
  'hat.party': () => makeHat('party'),
  'hat.crown': () => makeHat('crown'),
  'hat.propeller': () => makeHat('propeller'),
  'hat.halo': () => makeHat('halo'),
  'hat.horns': () => makeHat('horns'),
  'hat.helmet': () => makeHat('helmet'),

  'chase.squirrel': () => buildChase('squirrel').group,
  'chase.butterfly': () => buildChase('butterfly').group,
  'chase.rabbit': () => buildChase('rabbit').group,
  'chase.ufo': () => buildChase('ufo').group,
  'chase.cherub': () => buildChase('cherub').group,
  'chase.imp': () => buildChase('imp').group,
};

// Per-icon framing tweaks where the default three-quarter view doesn't flatter
const VIEWS = {
  // Flat props (steak, frisbee, bone) are slivers edge-on — look down at them
  steak: { yaw: 0.5, pitch: 0.85 },
  zoomies: { yaw: 0.4, pitch: 0.75 },
  goldbone: { yaw: 0.3, pitch: 0.6 },
  gear: { yaw: 0, pitch: 0 },
  star: { yaw: 0, pitch: 0 },
  soundOn: { yaw: 0, pitch: 0.1 },
  soundOff: { yaw: 0, pitch: 0.1 },
  'hat.none': { yaw: 0, pitch: 0 },
  // Seen edge-on a halo is just a line; from above it reads as a ring
  'hat.halo': { yaw: 0.3, pitch: 0.85 },
  'hat.helmet': { yaw: 0.5, pitch: 0.15 },
  // Two small dark cones need to be head-on and close to read at all
  'hat.horns': { yaw: 0, pitch: 0.05, zoom: 1.25 },
  // Characters are modelled facing -Z for gameplay, so turn them to face us
  'chase.squirrel': { yaw: Math.PI - 0.5, pitch: 0.3 },
  'chase.butterfly': { yaw: Math.PI - 0.4, pitch: 0.7 },
  'chase.rabbit': { yaw: Math.PI - 0.5, pitch: 0.3 },
  'chase.ufo': { yaw: Math.PI - 0.4, pitch: 0.35 },
  'chase.cherub': { yaw: Math.PI - 0.4, pitch: 0.25 },
  'chase.imp': { yaw: Math.PI - 0.5, pitch: 0.3 },
};

// Data URL for an icon, built on first request and cached thereafter.
// Returns '' for unknown names so a missing icon degrades to a blank tile
// rather than throwing inside a template string.
export function icon(name) {
  if (cache.has(name)) return cache.get(name);
  const build = BUILDERS[name];
  if (!build) return '';
  let url = '';
  try {
    const obj = build();
    url = obj ? bake(obj, VIEWS[name]) : '';
  } catch {
    url = '';
  }
  cache.set(name, url);
  return url;
}

// Convenience for templating: a ready-to-drop <img>.
export function iconImg(name, cls = 'icon') {
  const src = icon(name);
  return src ? `<img class="${cls}" src="${src}" alt="">` : `<span class="${cls}"></span>`;
}
