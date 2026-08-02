// Central tuning knobs — tweak these during playtests.
export const CONFIG = {
  lanes: 5,

  // Globe
  planetRadius: 20,
  laneAngle: 0.06,         // lateral radians between adjacent lanes (keeps outer lanes on-screen in portrait)
  dogTheta: 0.35,          // dog sits this far down the near side of the globe, below the crest
  spawnAheadAngle: 1.15,   // obstacles appear this far beyond the crest (relative to globe top)
  despawnBehindAngle: 0.5, // removed this far past the dog

  // Speed in radians of planet rotation per second.
  // Stage system: every stageLength meters is a checkpoint; speed steps up.
  baseSpeed: 0.44,         // fast out of the gate (doubled per playtest 4)
  // Lengthened with the speed increase: at 500m a top-speed stage lasted
  // barely 4 seconds, so checkpoints and worlds blurred past.
  stageLength: 900,        // meters per stage/checkpoint
  // Ceiling raised after Bryce cruised the old cap (0.8 == 197mph) for 100
  // stages. Reaction time is bounded by the horizon, not the spawn distance,
  // so spawnAheadAngle goes up alongside it — otherwise props pop into view
  // too late to react rather than merely arriving faster.
  // Keeps climbing well into a long run rather than pinning early: with
  // 900m stages you hit the ceiling around stage 18, not stage 12.
  stageSpeedBump: 0.05,    // speed added at each checkpoint
  maxSpeed: 1.3,           // ~320 mph
  metersPerRadian: 110,    // score scale: distance = rotation * this

  // Obstacle spawning
  spawnBaseInterval: 1.5,  // seconds between spawn rows at base speed
  // Raised alongside maxSpeed. The interval shrinks as you speed up, so
  // without this, top-speed play compounds "arrives sooner" with "more of
  // them" and tips from hard into unfair.
  spawnMinInterval: 0.68,
  doubleSpawnChance: 0.28, // chance a row has 2 obstacles (never blocks all lanes)
  ballChance: 0.45,        // chance a row also drops a tennis ball in a free lane

  // Powerups: rare pickups granting a timed ability. All of them STACK —
  // several can run at once, and grabbing the same one again extends it —
  // so the rarity does the balancing, not mutual exclusion.
  powerups: {
    chance: 0.055,         // per spawn row (kept low: stacking is strong)
    duration: 9,           // seconds active (was 7 — most felt too short)
    maxDuration: 20,       // ceiling when re-grabbing the same power
    maxExtraLives: 3,      // steaks bank up instead of being one-at-a-time
    magnetLaneDist: 2.6,   // Ball Magnet warp reach, in lanes
    magnetWindow: 0.5,     // pickups inside this travel window get pulled, radians
    magnetPull: 6,         // warp strength (per-second lerp rate)
    zoomiesAnimBoost: 1.7, // gallop animation speed multiplier during Zoomies
  },

  // Themed levels (see themes.js). Stages advance through the theme list in
  // order, spending a random 1-3 stages in each before moving on. Shortened
  // from 2-4 so worlds cycle noticeably quicker without being a blur.
  themeStagesMin: 1,
  themeStagesMax: 3,

  // Chance that a finished theme block drops into an ultra-rare stage
  // (heaven / space / hell) instead of the next normal world. Rare stages
  // always last exactly one stage.
  rareChance: 0.18,

  // Intro chase cutscene
  intro: {
    duration: 2.6,         // seconds; tap to skip
    fenceAhead: 0.55,      // fence spawns this far ahead of the dog (radians)
  },

  // The squirrel runs at this angle ahead on the globe (near the crest)
  squirrelTheta: 0.06,

  // Rendering
  maxFPS: 200,             // frame cap; high-refresh displays run uncapped below this

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

// Sky/ground moods now live per-theme in themes.js — each themed level brings
// its own palette, lighting, ground color and scenery instead of a global cycle.

// Shop: tennis balls buy cosmetics + chase targets. 'default' collar keeps
// the breed's own color. Owned/equipped state persists in localStorage.
export const COSMETICS = {
  collar: [
    { id: 'default', label: 'Classic', price: 0 },
    { id: 'sky', label: 'Sky', price: 120, color: 0x3aa8e0 },
    { id: 'gold', label: 'Gold', price: 300, color: 0xf5c842 },
    { id: 'neon', label: 'Neon', price: 500, color: 0x7cfc4f },
  ],
  hat: [
    { id: 'none', label: 'No Hat', price: 0 },
    { id: 'party', label: 'Party Hat', price: 200 },
    { id: 'propeller', label: 'Propeller', price: 350 },
    { id: 'crown', label: 'Crown', price: 600 },
  ],
  chase: [
    { id: 'squirrel', label: 'Squirrel', price: 0 },
    { id: 'butterfly', label: 'Butterfly', price: 250 },
    { id: 'rabbit', label: 'Rabbit', price: 400 },
  ],
};

// Playable characters. Kona-style GSP first ("The Dog").
export const BREEDS = {
  gsp: {
    kind: 'dog',
    label: 'The Dog',
    desc: 'Pure focus. Built to sprint.',
    body: 0xf2ede3,        // white coat
    patches: 0x26211f,     // black patches
    head: 0x26211f,        // dark head like Kona
    muzzle: 0x3a322e,
    ear: 0x1c1816,
    chest: 0xf7f3ea,
    collar: 0xc0392b,      // red collar
    tailScale: 0.7,        // docked-ish tail
    fluffyTail: false,
    bodyScaleX: 0.74,      // athletic GSP build
  },
  golden: {
    kind: 'dog',
    label: 'Goldie',
    desc: 'All heart, all floof.',
    body: 0xd9a441,
    patches: null,
    head: 0xd9a441,
    muzzle: 0xc89238,
    ear: 0xc08c2e,
    chest: 0xecc27a,
    collar: 0x7a4bd6,      // purple collar
    tailScale: 1.25,
    fluffyTail: true,
    bodyScaleX: 0.85,
  },
  cat: {
    kind: 'cat',
    label: 'Tux',
    desc: 'Dressed for the occasion.',
    body: 0x211f24,        // black coat
    patches: null,
    head: 0x211f24,
    muzzle: 0xf4f0e8,      // white muzzle patch
    ear: 0x1a181c,
    chest: 0xf4f0e8,       // tuxedo bib
    collar: 0x2aa8a0,      // teal collar
    tailScale: 1.0,
    fluffyTail: false,
    bodyScaleX: 0.68,      // slinky
  },
};
