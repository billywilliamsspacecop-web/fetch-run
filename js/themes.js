import * as THREE from 'three';
import { CONFIG } from './config.js';
import * as P from './props.js';

// Hitboxes are MEASURED from each prop's real geometry, never hand-guessed.
// Hand-tuned numbers drifted badly from the models (the sprinkler's box was a
// third of its visual width, so you could run straight through it), and the
// drift is invisible on a desktop-width screen. Measuring keeps every prop
// honest automatically, including any added later.
// Trimmed from 0.84. A last-instant lane change was still clipping props you
// had visually cleared, because the measured box is the prop's full extent
// including bits that read as empty space (a gnome's hat brim, a bench's
// overhang). Shrinking this can only REMOVE collisions, never add them, so
// there's no way for it to introduce a glitch.
const HITBOX_FORGIVENESS = 0.74; // generous to the player
let maxObstacleHalfRad = 0.03;

// Widest thing that can occupy a lane, in radians — scenery must clear this.
export const playableEdgeAlpha = () =>
  2 * CONFIG.laneAngle + maxObstacleHalfRad + 0.015;

// How far past that clearance the house's hallway walls sit. The door gate
// and the glass exit wall size their wings from this, so the facade always
// meets the walls no matter how the lane angle works out on a given screen.
export const HOUSE_WALL_NEAR = 0.085;

// Opaque geometry only: see-through bits (sprinkler spray, fountain jets)
// look passable, so they shouldn't be solid. Outline hulls are skipped too —
// they're a rendering trick that sits a few centimetres proud of the real
// mesh, and counting them would quietly fatten every hitbox they're on.
export function measureHalfExtents(builder, samples = 4) {
  let halfW = 0, halfD = 0;
  for (let i = 0; i < samples; i++) {
    const probe = builder();
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3();
    probe.traverse((n) => {
      if (n.isMesh && !n.userData.isOutline && !(n.material && n.material.transparent)) {
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

// ...and none may be much NARROWER than this, either. Every prop is modelled
// at a fixed world size while lane width is derived from the viewport, so a
// slim one (harp, pitchfork, cone, sprinkler) ended up occupying a third of
// its lane and reading as scenery you could ignore — the "some obstacles are
// still too small" complaint, and the reason heaven in particular vanished.
// Anything under this gets scaled UP to meet it.
const MIN_OBSTACLE_LANE_FRACTION = 0.62;
// Ceiling on that scale-up. Without it a genuinely tiny prop would balloon to
// twice its designed size and start clipping through the ground plane.
const MAX_UPSCALE = 1.85;

// Called once at boot, after CONFIG.laneAngle is finalised for this viewport.
export function calibrateHitboxes() {
  const R = CONFIG.planetRadius;
  const laneWidthUnits = CONFIG.laneAngle * R;
  const maxHalfW = (MAX_OBSTACLE_LANE_FRACTION / 2) * laneWidthUnits;
  maxObstacleHalfRad = 0.03;
  for (const theme of ALL_THEMES) {
    // A theme may demand chunkier props than the global floor (heaven does —
    // pale on pale needs the extra bulk to be seen at all).
    const minHalfW =
      ((theme.minLaneFraction ?? MIN_OBSTACLE_LANE_FRACTION) / 2) * laneWidthUnits;
    for (const o of theme.obstacles) {
      const { halfW, halfD } = measureHalfExtents(o.make);
      // Fit the prop to its lane: shrink the oversized, grow the undersized.
      // Spawner applies fitScale. Note the hitbox is derived from the SCALED
      // extents below, so a prop that grew is honestly harder to squeeze past
      // — that's the point, it now looks like what it collides as.
      o.fitScale = halfW > maxHalfW ? maxHalfW / halfW
        : halfW < minHalfW ? Math.min(MAX_UPSCALE, minHalfW / halfW)
        : 1;
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
    planet: 0x7ec850, tuft: 0x5da23c, dash: 0xf7b8dd, // pastel pink on grass
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obGnome },
      { make: P.obPicnicBasket },
      { make: P.obSprinkler },
      { make: P.obBenchWood },
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
    planet: 0x6fbf4a, tuft: 0x559a38, dash: 0xdcc0f7, // pastel lavender on grass
    canopyTint: null, canopyMix: 0,
    collectible: P.collectIceCream,
    obstacles: [
      { make: P.obTrashCan },
      { make: P.obHotDogCart },
      { make: P.obStroller },
      { make: P.obFountain },
      { make: P.obBenchPark },
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
    planet: 0x44702f, tuft: 0x335225, dash: 0xffd9a0, // pastel peach on deep green
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
    planet: 0x3d7f70, tuft: 0x336a5e, dash: 0xffc4a8, // pastel coral on teal court
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
      // Continuous green sidewalls, both sides, evenly spaced so the segments
      // join — the same treatment as the house hallway. count is picked so the
      // arc per segment (2*PI*R / count) sits just under COURT_WALL_LEN.
      { make: P.scCourtWall, count: 50, near: 0.02, far: 0, even: true, bothSides: true },
      // Stands and lights sit OUTSIDE the wall and are tall enough to clear
      // it, which is where they'd be on a real court anyway.
      { make: P.scBleachers, count: 16, near: 0.16, far: 0.4 },
      { make: P.scFloodlight, count: 12, near: 0.13, far: 0.42 },
    ],
  },
  {
    id: 'house',
    label: 'INSIDE THE HOUSE',
    outdoor: false, // no clouds, no sun disc — we're indoors
    sky: 0xe4d3ba, fog: 0xd6c1a4, hemi: 1.0, sun: 1.15,
    planet: 0xb08a5a, tuft: 0x9a7448, dash: 0xa8d8f5, // pastel blue on wood
    tufts: false, // no grass growing out of the living room rug
    gate: true,   // you enter this world by bursting through its front door
    // ...and you leave it the same way: a patio slider you smash back out
    // through. Arriving through a door but dissolving out of the house made
    // the whole stage feel like a backdrop rather than somewhere you were.
    exitGate: 'glass',
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
      // Evenly spaced on BOTH sides so segments butt together into an
      // unbroken hallway. count is chosen so arc-length per segment
      // (2*PI*R / count) is just under HOUSE_WALL_LEN, giving slight overlap.
      // `near` pushes the walls out past the minimum clearance — hugging the
      // lanes too tightly made the room feel like a narrow chute.
      { make: P.scHouseWall, count: 50, near: HOUSE_WALL_NEAR, far: 0, even: true, bothSides: true },
      { make: P.scBookshelf, count: 14, near: 0.05, far: 0.3 },
      { make: P.scFloorLamp, count: 14, near: 0.04, far: 0.3 },
      { make: P.scHousePlant, count: 20, near: 0.02, far: 0.35 },
    ],
  },
];

// ---------------------------------------------------------------------------
// ULTRA-RARE STAGES. These are NOT part of the normal rotation — when a theme
// block ends there's a small chance (CONFIG.rareChance) of dropping into one
// of these instead. They always last exactly one stage, so they stay a
// surprise rather than an endurance test.
// ---------------------------------------------------------------------------
export const RARE_THEMES = [
  {
    id: 'heaven',
    label: 'THE GOOD PLACE',
    rare: true,
    outdoor: true,
    sky: 0xdfeeff, fog: 0xeef6ff, hemi: 1.55, sun: 1.95,
    // Ground pulled off pure white: at 0xf4f7ff the pale marble/cloud props
    // had nothing to sit against and the whole stage read as fog.
    planet: 0xe6ecfa, tuft: 0xd6e0f2, dash: 0x4a4460, // DARK on near-white ground
    tufts: false,
    // Heaven's props are pale marble and cloud on a near-white floor, so they
    // lose the contrast every other stage's obstacles get for free. Two
    // corrections: they're built noticeably chunkier than the global minimum
    // (see MIN_OBSTACLE_LANE_FRACTION), and every one of them carries a dark
    // outline (see addOutline in props.js). Neither alone was enough.
    minLaneFraction: 0.78,
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obCloudBank },
      { make: P.obHarp },
      { make: P.obPillar },
      { make: P.obGate },
      { make: P.obAngelStatue },
      { make: P.obGoldenBell },
      { make: P.obAngelGnome },
    ],
    scenery: [
      { make: P.scHeavenCloud, count: 54, near: 0.01, far: 0.5 },
      { make: P.scHalo, count: 22, near: 0.03, far: 0.4 },
      { make: P.obPillar, count: 26, near: 0.06, far: 0.45 },
    ],
  },
  {
    id: 'hell',
    label: 'THE BAD PLACE',
    rare: true,
    outdoor: false,
    // Brightened a second time. The mood survives a lighter floor — what it
    // doesn't survive is not being able to read a lava rock against it.
    sky: 0x3d1410, fog: 0x5c1d13, hemi: 1.05, sun: 1.4,
    planet: 0x6e3423, tuft: 0x4d2117, dash: 0xa8f0d2, // pastel mint on hot red
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obLavaRock },
      { make: P.obPitchfork },
      { make: P.obFireGeyser },
      { make: P.obDemonGnome },
      { make: P.obCauldron },
      { make: P.obSkullPile },
      { make: P.obDemonDoghouse },
    ],
    scenery: [
      { make: P.scStalagmite, count: 62, near: 0.01, far: 0.5 },
      { make: P.scLavaPool, count: 26, near: 0.05, far: 0.45 },
      { make: P.scTorch, count: 24, near: 0.02, far: 0.35 },
    ],
  },
  {
    id: 'underwater',
    label: 'THE DEEP',
    rare: true,
    outdoor: false,   // no clouds, no sun disc — you're under the surface
    caustics: true,   // rippling light on the seabed + drifting bubbles
    sky: 0x1b6f8f, fog: 0x2b87a6, hemi: 1.25, sun: 1.5,
    fogNear: 20, fogFar: 56, // water closes in far sooner than open air
    planet: 0xd9c48f, tuft: 0x3f8f52, dash: 0xb8a8f0, // pastel violet on sand
    canopyTint: null, canopyMix: 0,
    collectible: P.collectPearl,
    obstacles: [
      { make: P.obCoral },
      { make: P.obTreasureChest },
      { make: P.obGiantClam },
      { make: P.obAnchor },
      { make: P.obSeaUrchin },
      { make: P.obJellyfish },
    ],
    scenery: [
      { make: P.scKelp, count: 70, near: 0.01, far: 0.5 },
      { make: P.scSeaFan, count: 30, near: 0.03, far: 0.42 },
      { make: P.scSeaRock, count: 34, near: 0.02, far: 0.5 },
      { make: P.scBubbleColumn, count: 22, near: 0.04, far: 0.4 },
    ],
  },
  {
    id: 'space',
    label: 'DEEP SPACE',
    rare: true,
    outdoor: false, // no clouds or sun disc — the starfield backdrop instead
    starfield: true,// real stars and galaxies in the sky, not on the ground
    ships: true,    // runner + quarry fly little spaceships here
    noRunCycle: true, // riders sit in the cockpit — no galloping in a spaceship
    // The sky stays black (it's space), but the TRACK doesn't: on a near-black
    // deck you couldn't see what you were dodging until it was on top of you.
    // Lighting and ground now sit close to the other stages; only the backdrop
    // is dark, and the starfield gives that darkness something to be.
    sky: 0x090818, fog: 0x1a1540, hemi: 1.45, sun: 1.85,
    planet: 0x5d5494, tuft: 0x6f66ab, dash: 0xfff0a8, // pastel yellow on purple
    tufts: false,
    canopyTint: null, canopyMix: 0,
    collectible: P.collectTennisBall,
    obstacles: [
      { make: P.obAsteroid },
      { make: P.obSatellite },
      { make: P.obSpaceRock },
      { make: P.obUFO },
    ],
    scenery: [
      // Ground glints only — the real stars live in the sky now, so this is
      // dialled well back from the 130 that used to carpet the deck.
      { make: P.scStar, count: 46, near: 0, far: 0.6 },
      { make: P.scSpacePlanet, count: 12, near: 0.22, far: 0.55 },
    ],
  },
];

// Everything that needs hitbox calibration and prebuilt scenery groups
export const ALL_THEMES = [...THEMES, ...RARE_THEMES];

// Never serve the same rare stage twice running — with only a handful of
// them, pure random meant you could hit hell repeatedly and go a very long
// time without ever seeing heaven or space.
let lastRareId = null;
export function pickRareTheme() {
  const pool = RARE_THEMES.filter((t) => t.id !== lastRareId);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  lastRareId = pick.id;
  return pick;
}

export const themeById = (id) => ALL_THEMES.find((t) => t.id === id) ?? THEMES[0];
