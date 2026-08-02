import * as P from './props.js';

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
      { make: P.obGnome, hitbox: { lat: 0.3, ang: 0.018 } },
      { make: P.obPicnicBasket, hitbox: { lat: 0.38, ang: 0.028 } },
      { make: P.obSprinkler, hitbox: { lat: 0.28, ang: 0.018 } },
      { make: () => P.obBench(), hitbox: { lat: 0.48, ang: 0.014 } },
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
      { make: P.obTrashCan, hitbox: { lat: 0.3, ang: 0.02 } },
      { make: P.obHotDogCart, hitbox: { lat: 0.42, ang: 0.024 } },
      { make: P.obStroller, hitbox: { lat: 0.32, ang: 0.024 } },
      { make: P.obFountain, hitbox: { lat: 0.45, ang: 0.032 } },
      { make: () => P.obBench(0x4a7a4f), hitbox: { lat: 0.48, ang: 0.014 } },
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
      { make: P.obFallenLog, hitbox: { lat: 0.5, ang: 0.018 } },
      { make: P.obBoulder, hitbox: { lat: 0.38, ang: 0.028 } },
      { make: P.obStump, hitbox: { lat: 0.36, ang: 0.026 } },
      { make: P.obMushrooms, hitbox: { lat: 0.34, ang: 0.024 } },
      { make: P.obBramble, hitbox: { lat: 0.4, ang: 0.028 } },
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
      { make: P.obTennisNet, hitbox: { lat: 0.48, ang: 0.014 } },
      { make: P.obBallHopper, hitbox: { lat: 0.3, ang: 0.02 } },
      { make: P.obBallMachine, hitbox: { lat: 0.32, ang: 0.022 } },
      { make: P.obUmpireChair, hitbox: { lat: 0.32, ang: 0.022 } },
      { make: P.obCourtCone, hitbox: { lat: 0.24, ang: 0.018 } },
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
      { make: P.obCouch, hitbox: { lat: 0.5, ang: 0.022 } },
      { make: P.obCoffeeTable, hitbox: { lat: 0.44, ang: 0.02 } },
      { make: P.obVacuum, hitbox: { lat: 0.3, ang: 0.022 } },
      { make: P.obLaundryBasket, hitbox: { lat: 0.34, ang: 0.026 } },
      { make: P.obCatTower, hitbox: { lat: 0.32, ang: 0.024 } },
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
