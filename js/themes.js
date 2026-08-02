import * as THREE from 'three';
import { CONFIG } from './config.js';
import * as P from './props.js';

// Hitboxes are MEASURED from each prop's real geometry, never hand-guessed.
// Hand-tuned numbers drifted badly from the models (the sprinkler's box was a
// third of its visual width, so you could run straight through it), and the
// drift is invisible on a desktop-width screen. Measuring keeps every prop
// honest automatically, including any added later.
const HITBOX_FORGIVENESS = 0.84; // slightly generous to the player
let maxObstacleHalfRad = 0.03;

// Widest thing that can occupy a lane, in radians — scenery must clear this.
export const playableEdgeAlpha = () =>
  2 * CONFIG.laneAngle + maxObstacleHalfRad + 0.015;

// Opaque geometry only: see-through bits (sprinkler spray, fountain jets)
// look passable, so they shouldn't be solid.
export function measureHalfExtents(builder, samples = 4) {
  let halfW = 0, halfD = 0;
  for (let i = 0; i < samples; i++) {
    const probe = builder();
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3();
    probe.traverse((n) => {
      if (n.isMesh && !(n.material && n.material.transparent)) {
        box.union(new THREE.Box3().setFromObject(n));
      }
    });
    if (box.isEmpty()) continue;
    halfW = Math.max(halfW, Math.abs(box.max.x), Math.abs(box.min.x));
    halfD = Math.max(halfD, Math.abs(box.max.z), Math.abs(box.min.z));
  }
  return { halfW, halfD };
}

// No obstacle may be wider than this fraction of a lane. Several props
// (picnic blanket, couch, fallen log, fountain) are modelled wider than a
// lane, which would make them unavoidable no matter where you stand —
// they get uniformly scaled down to fit instead. Lane width shrinks with
// screen width, so this matters most on phones.
const MAX_OBSTACLE_LANE_FRACTION = 0.9;

// Called once at boot, after CONFIG.laneAngle is finalised for this viewport.
export function calibrateHitboxes() {
  const R = CONFIG.planetRadius;
  const laneWidthUnits = CONFIG.laneAngle * R;
  const maxHalfW = (MAX_OBSTACLE_LANE_FRACTION / 2) * laneWidthUnits;
  maxObstacleHalfRad = 0.03;
  for (const theme of THEMES) {
    for (const o of theme.obstacles) {
      const { halfW, halfD } = measureHalfExtents(o.make);
      // Shrink oversized props to fit their lane; Spawner applies fitScale.
      o.fitScale = halfW > maxHalfW ? maxHalfW / halfW : 1;
      const w = halfW * o.fitScale;
      const d = halfD * o.fitScale;
      o.hitbox = {
        lat: (w / laneWidthUnits) * HITBOX_FORGIVENESS,
        ang: (d / R) * HITBOX_FORGIVENESS,
      };
      maxObstacleHalfRad = Math.max(maxObstacleHalfRad, w / R);
    }
  }
}

// Each theme is a self-contained level look: sky + lighting, ground colors,
// its own obstacle set, its own collectible, and its own scenery mix.
// Stages advance through these in order, spending 2-4 stages in each
// (see CONFIG.themeStagesMin/Max) so a world has time to land before it changes.
//
// hitbox: lat = lane units (1.0 == one full lane), ang = radians along travel.
// The runner's own hitbox (CONFIG.dogHitbox) is added on top at collision time.

export const THEMES = [
  {
    id: 'backyard',
    label: 'BACKYARD',
    outdoor: true,
    sky: 0xffd29e, fog: 0xffc78f, hemi: 1.05, sun: 1.6,
    planet: 0x7ec850, tuft: 0x5da23c, dash: 0xa8dd78,
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obGnome },
      { make: P.obPicnicBasket },
      { make: P.obSprinkler },
      { make: () => P.obBench() },
    ],
    scenery: [
      { make: P.scTree, count: 70, near: 0.02, far: 0.55 },
      { make: P.scBush, count: 56, near: 0.01, far: 0.6 },
      { make: P.scFlower, count: 70, near: 0, far: 0.45 },
    ],
  },
  {
    id: 'park',
    label: 'CITY PARK',
    outdoor: true,
    sky: 0x9fd8f0, fog: 0xbfe4f5, hemi: 1.15, sun: 1.7,
    planet: 0x6fbf4a, tuft: 0x559a38, dash: 0xcdeea6,
    canopyTint: null, canopyMix: 0,
    collectible: P.collectIceCream,
    obstacles: [
      { make: P.obTrashCan },
      { make: P.obHotDogCart },
      { make: P.obStroller },
      { make: P.obFountain },
      { make: () => P.obBench(0x4a7a4f) },
    ],
    scenery: [
      { make: P.scTree, count: 46, near: 0.03, far: 0.55 },
      { make: P.scLampPost, count: 16, near: 0.02, far: 0.4 },
      { make: P.scBush, count: 34, near: 0.01, far: 0.6 },
      { make: P.scFlower, count: 56, near: 0, far: 0.45 },
      { make: P.scStatue, count: 7, near: 0.12, far: 0.5 },
    ],
  },
  {
    id: 'forest',
    label: 'DEEP WOODS',
    outdoor: true,
    sky: 0x6f9b7e, fog: 0x4f7a63, hemi: 0.85, sun: 1.15,
    planet: 0x44702f, tuft: 0x335225, dash: 0x76a05c,
    canopyTint: 0x2f5f38, canopyMix: 0.25,
    collectible: P.collectAcorn,
    obstacles: [
      { make: P.obFallenLog },
      { make: P.obBoulder },
      { make: P.obStump },
      { make: P.obMushrooms },
      { make: P.obBramble },
    ],
    scenery: [
      { make: P.scPine, count: 84, near: 0.015, far: 0.55 },
      { make: P.scFern, count: 52, near: 0, far: 0.5 },
      { make: P.scBush, count: 40, near: 0.01, far: 0.6 },
      { make: P.scRock, count: 30, near: 0.01, far: 0.5 },
    ],
  },
  {
    id: 'tennis',
    label: 'CENTER COURT',
    outdoor: true,
    sky: 0x5fb8e8, fog: 0x8fd0f0, hemi: 1.1, sun: 1.75,
    planet: 0x3d7f70, tuft: 0x336a5e, dash: 0xf5f5f0, // white court lines
    tufts: false, // no grass sprouting through a hard court
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obTennisNet },
      { make: P.obBallHopper },
      { make: P.obBallMachine },
      { make: P.obUmpireChair },
      { make: P.obCourtCone },
    ],
    scenery: [
      { make: P.scChainFence, count: 30, near: 0.05, far: 0.35 },
      { make: P.scBleachers, count: 14, near: 0.2, far: 0.5 },
      { make: P.scFloodlight, count: 10, near: 0.15, far: 0.45 },
    ],
  },
  {
    id: 'house',
    label: 'INSIDE THE HOUSE',
    outdoor: false, // no clouds, no sun disc — we're indoors
    sky: 0xe4d3ba, fog: 0xd6c1a4, hemi: 1.0, sun: 1.15,
    planet: 0xb08a5a, tuft: 0x9a7448, dash: 0xc9a578, // wood floor + planks
    tufts: false, // no grass growing out of the living room rug
    canopyTint: null, canopyMix: 0,
    collectible: P.collectSock,
    obstacles: [
      { make: P.obCouch },
      { make: P.obCoffeeTable },
      { make: P.obVacuum },
      { make: P.obLaundryBasket },
      { make: P.obCatTower },
    ],
    scenery: [
      // Walls hug the lane band tightly so it reads as a hallway, not a field
      { make: P.scHouseWall, count: 52, near: 0.005, far: 0.09 },
      { make: P.scBookshelf, count: 14, near: 0.05, far: 0.3 },
      { make: P.scFloorLamp, count: 14, near: 0.04, far: 0.3 },
      { make: P.scHousePlant, count: 20, near: 0.02, far: 0.35 },
    ],
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];
