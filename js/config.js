// Central tuning knobs — tweak these during playtests.
export const CONFIG = {
  lanes: 5,

  // Globe
  planetRadius: 20,
  laneAngle: 0.06,         // lateral radians between adjacent lanes (keeps outer lanes on-screen in portrait)
  dogTheta: 0.35,          // dog sits this far down the near side of the globe, below the crest
  spawnAheadAngle: 1.0,    // obstacles appear this far beyond the crest (relative to globe top)
  despawnBehindAngle: 0.5, // removed this far past the dog

  // Speed in radians of planet rotation per second.
  // Stage system: every stageLength meters is a checkpoint; speed steps up.
  baseSpeed: 0.16,         // stage 1 stays chill
  stageLength: 500,        // meters per stage/checkpoint
  stageSpeedBump: 0.05,    // speed added at each checkpoint
  maxSpeed: 0.62,
  metersPerRadian: 110,    // score scale: distance = rotation * this

  // Obstacle spawning
  spawnBaseInterval: 1.5,  // seconds between spawn rows at base speed
  spawnMinInterval: 0.55,
  doubleSpawnChance: 0.28, // chance a row has 2 obstacles (never blocks all lanes)
  ballChance: 0.45,        // chance a row also drops a tennis ball in a free lane

  // Dog
  laneChangeTime: 0.13,    // seconds to tween between lanes
  // The dog's own hitbox; each obstacle type adds its own in obstacles.js.
  // lat is in lane units (1.0 = one lane apart), ang is radians along travel.
  dogHitbox: { lat: 0.32, ang: 0.022 },
  collectWindowAngle: 0.09,
  nearMissLaneDist: 1.15,  // lane distance under this (but above hit) = close call

  // Death flow
  deathPauseBeforeInput: 0.6, // seconds before stat screen accepts a restart tap

  // Swipe detection
  swipeMinDistance: 24,    // px
  swipeMaxTime: 600,       // ms — generous so casual swipes still count
};

// Sunset picnic-park palette
export const COLORS = {
  sky: 0xffd29e,
  fog: 0xffc78f,
  planet: 0x7ec850,
  planetDark: 0x5da23c,
  trunk: 0x8a5a33,
  canopy: [0x4f9d3a, 0x6fb84e, 0x8fce62, 0xe8985a, 0xd9788f], // greens + autumn/blossom pops
  cloud: 0xfff4e6,
  nose: 0x2b2323,
  tongue: 0xe57a8a,
  gnomeHat: 0xc0392b,
  gnomeBody: 0x3b6ea5,
  gnomeBeard: 0xe8e0d0,
  gnomeSkin: 0xf0c8a0,
  gnomeArms: 0x35618f,
  basket: 0xa5713b,
  blanket: 0xd94f4f,
  bench: 0x9c6b3f,
  sprinkler: 0x7f8c8d,
  water: 0x8fd3f4,
  ball: 0xd7f25a,
  ballSeam: 0xf7f7f0,
};

// Playable dogs. Kona-style GSP first ("The Dog"), golden retriever second.
export const BREEDS = {
  gsp: {
    label: 'The Dog',
    body: 0xf2ede3,        // white coat
    patches: 0x26211f,     // black patches
    head: 0x26211f,        // dark head like Kona
    muzzle: 0x3a322e,
    ear: 0x1c1816,
    chest: 0xf7f3ea,
    collar: 0xc0392b,      // red collar
    tailScale: 0.7,        // docked-ish tail
    fluffyTail: false,
  },
  golden: {
    label: 'Goldie',
    body: 0xd9a441,
    patches: null,
    head: 0xd9a441,
    muzzle: 0xc89238,
    ear: 0xc08c2e,
    chest: 0xecc27a,
    collar: 0x7a4bd6,      // purple collar
    tailScale: 1.25,
    fluffyTail: true,
  },
};
