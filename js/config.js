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
  // Pulled back from 3.9 (~960mph) after playtest 6: past roughly 500mph the
  // run stops being a game of reading rows and becomes a coin flip, because
  // the horizon — not the spawn distance — bounds reaction time and no amount
  // of spawnAheadAngle buys it back. The ceiling is still a slider, so a
  // deliberate "how far can this go" run is one drag away.
  // Note collision is a SWEPT test (see `swept` in game.js) — at these speeds
  // an entity crosses the whole hit window inside a single frame, and the old
  // point test missed it entirely.
  maxSpeed: 2.05,          // ~504 mph
  // Spawn density ramps against THIS, not maxSpeed. Tying it to maxSpeed
  // meant tripling the ceiling silently halved mid-game density, because the
  // same speed now sat far lower on the 0..1 ramp. Anchored here, everything
  // up to the old ceiling plays exactly as it did.
  spawnRampSpeed: 1.3,
  metersPerRadian: 110,    // score scale: distance = rotation * this

  // Obstacle spawning
  spawnBaseInterval: 1.5,  // seconds between spawn rows at base speed
  // Raised alongside maxSpeed. The interval shrinks as you speed up, so
  // without this, top-speed play compounds "arrives sooner" with "more of
  // them" and tips from hard into unfair.
  spawnMinInterval: 0.68,
  doubleSpawnChance: 0.28, // chance a row has 2 obstacles (never blocks all lanes)
  // Tennis balls get MORE common as you speed up. At 900mph you aren't
  // chasing anything down, you just happen to run over what's in your line,
  // so the same chance yields far fewer per second of play.
  ballChance: 0.45,        // chance a row drops a ball, at base speed
  ballChanceMax: 0.9,      // ...and at spawnRampSpeed and above

  // SCORE. Distance is the engine — it accrues from rotation, so going faster
  // literally scores faster — and balls add a flat bonus on top.
  pointsPerBall: 25,

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

    // Ball Frenzy (yarn). Runs longer than the others because it's a treat,
    // not a tool — nothing can hurt you, so it's a breather as much as a
    // scoring window. Balls arrive in shapes and drift toward you.
    yarnDuration: 16,
    yarnMagnetPull: 2.2,   // gentle drift, well below the real magnet's 6
    yarnMagnetLaneDist: 1.4,

    // Golden Bone doubles EVERYTHING — score rate and per-ball bonus — plus a
    // small speed nudge so the 2x is felt, not just read off the HUD.
    goldboneSpeedBump: 1.1,

    // Blast Off (space): you fly OVER the track. Distinct from Zoomies —
    // Zoomies is "hit everything and win", this is "nothing is there to hit".
    // Lift is a compromise: the camera is high and behind, so height also
    // reads as "closer", and past ~2 the runner starts filling the screen.
    rocketLift: 1.8,       // how far above the surface the runner rides
    rocketRise: 5,         // per-second lerp rate for take-off and landing

    // Slo-Mo (heaven): the world crawls so you can thread a bad row. It costs
    // you distance while it runs, which is the balance — safety for score,
    // no extra tuning needed since score is derived from rotation.
    slowmoFactor: 0.5,

    // Scorch (hell): obstacles entering your lane burn away before they reach
    // you. Only YOUR lane, so it rewards committing to a line rather than
    // being a second invincibility.
    scorchWindow: 0.42,    // radians ahead of the runner that ignite
    scorchLaneDist: 0.75,  // lane distance counted as "your lane"
  },

  // Themed levels (see themes.js). A finished world rolls for the next one by
  // rarity tier; how long you stay is this range, scaled down for the rarer
  // tiers (RARITY.stageScale). Shortened from 2-4 so worlds cycle noticeably
  // quicker without being a blur.
  themeStagesMin: 1,
  themeStagesMax: 3,

  // Chance that a finished theme block drops into a SPECIAL world (the rare
  // and epic tiers) instead of a common/uncommon one. Which tier, and which
  // world inside it, is a second weighted roll — see pickNextTheme in
  // themes.js. Specials always last exactly one stage.
  rareChance: 0.18,

  // Playtest switches, also driven by URL flags (?stages=rare) and the
  // settings panel. Live: everything that reads these re-reads them per frame.
  rareOnly: false,          // run ONLY the rare/epic worlds, in order
  rareTestStageLength: 320, // shorter stages so they cycle quickly

  // Scenery outlines. Obstacles, pickups and characters always carry the dark
  // line — it's how you read them — but SCENERY is hundreds of objects and
  // each shell is its own draw call, which is roughly a third more of them in
  // the busiest worlds (the house and the graveyard are the two to watch). On
  // a phone that can't hold 60fps, this is the first thing to turn off: the
  // stage keeps its whole look inside the lanes and only the background goes
  // back to flat shapes.
  sceneryOutlines: true,

  // Dev tools. All live — read every frame, toggled from the settings panel.
  devHitboxes: false,       // draw the actual collision volumes
  invincible: false,        // nothing can kill you
  powerupsOnly: false,      // spawn powerups and nothing else

  // Intro chase cutscene. Longer and slower off the line than it was — it's a
  // placeholder for the real opening, and at 2.6s with a linear ramp the world
  // snapped to full speed before you'd registered what you were looking at.
  intro: {
    duration: 4.6,         // seconds; tap to skip
    fenceAhead: 0.55,      // fence spawns this far ahead of the dog (radians)
    rampPower: 2.2,        // >1 eases in: slow crawl first, then it winds up
  },

  // The squirrel runs at this angle ahead on the globe (near the crest)
  squirrelTheta: 0.06,

  // Rendering
  maxFPS: 200,             // frame cap; high-refresh displays run uncapped below this

  // Dog
  laneChangeTime: 0.13,    // seconds to tween between lanes
  // The dog's own hitbox; each obstacle type adds its own in obstacles.js.
  // lat is in lane units (1.0 = one lane apart), ang is radians along travel.
  // Trimmed from 0.32/0.022 — combined with the obstacle's own box, a
  // last-instant lane change was still clipping something you'd visually
  // cleared. Shrinking a hitbox can only ever be MORE forgiving, so there's
  // nothing here that can glitch: it removes hits, it can't add them.
  dogHitbox: { lat: 0.27, ang: 0.019 },
  collectWindowAngle: 0.09,
  nearMissLaneDist: 1.15,  // lane distance under this (but above hit) = close call

  // Death flow
  deathPauseBeforeInput: 0.6, // seconds before stat screen accepts a restart tap

  // Un-pausing straight back into a moving world is a cheap death: you put the
  // phone down mid-row and pick it up with an obstacle already on you. A
  // 3..2..1 hands the run back with the track frozen and readable.
  pauseCountdown: {
    seconds: 3,
    // ...but not forever. Deep into a run the pause is a breather you take
    // several times, and three seconds of waiting each time is friction, so
    // past this score RESUME goes straight back to play.
    maxScore: 40000,
  },

  // Swipe detection
  swipeMinDistance: 24,    // px
  swipeMaxTime: 600,       // ms — generous so casual swipes still count
};

// ---------------------------------------------------------------------------
// SETTINGS PANEL
// Declared here rather than in the UI so the tuning stays with the rest of the
// tuning. Each control reads and writes CONFIG directly, and everything that
// consumes these values re-reads them every frame — so a drag takes effect
// mid-run with no restart and no re-plumbing.
//
// Speeds are surfaced in mph because that's what the death screen reports;
// internally they're radians of planet rotation per second.
// ---------------------------------------------------------------------------
const toMph = (rad) => Math.round(rad * CONFIG.metersPerRadian * 2.23694);
const fromMph = (mph) => mph / (CONFIG.metersPerRadian * 2.23694);

export const SETTINGS = [
  {
    key: 'rareChance', group: 'Worlds', label: 'Special stage chance', hint: 'how often a RARE or EPIC world turns up instead of the usual rotation',
    min: 0, max: 100, step: 5, suffix: '%',
    read: () => Math.round(CONFIG.rareChance * 100),
    write: (v) => { CONFIG.rareChance = v / 100; },
  },
  {
    key: 'worldLength', group: 'Worlds', label: 'World length', hint: 'stages before the theme changes',
    min: 1, max: 6, step: 1, suffix: '',
    read: () => CONFIG.themeStagesMax,
    // Keeps the min a notch below the max so worlds still vary in length,
    // except at 1 where there's nowhere left to vary.
    write: (v) => { CONFIG.themeStagesMax = v; CONFIG.themeStagesMin = Math.max(1, v - 1); },
  },
  {
    key: 'stageLength', group: 'Worlds', label: 'Stage length', hint: 'metres per checkpoint',
    min: 100, max: 1600, step: 50, suffix: 'm',
    read: () => CONFIG.stageLength,
    write: (v) => { CONFIG.stageLength = v; },
  },
  {
    key: 'startSpeed', group: 'Speed', label: 'Starting speed', hint: '',
    min: 40, max: 700, step: 10, suffix: ' mph',
    read: () => toMph(CONFIG.baseSpeed),
    write: (v) => { CONFIG.baseSpeed = fromMph(v); },
  },
  {
    key: 'topSpeed', group: 'Speed', label: 'Top speed', hint: 'the ceiling the stage ramp climbs to',
    min: 100, max: 1600, step: 20, suffix: ' mph',
    read: () => toMph(CONFIG.maxSpeed),
    write: (v) => { CONFIG.maxSpeed = fromMph(v); },
  },
  {
    key: 'speedRamp', group: 'Speed', label: 'Speed ramp', hint: 'added at every checkpoint',
    min: 0, max: 120, step: 2, suffix: ' mph',
    read: () => toMph(CONFIG.stageSpeedBump),
    write: (v) => { CONFIG.stageSpeedBump = fromMph(v); },
  },
  {
    key: 'rareOnly', group: 'Worlds', label: 'Special stages only', hint: 'loop every rare and epic world in order',
    toggle: true,
    read: () => CONFIG.rareOnly,
    write: (v) => { CONFIG.rareOnly = v; },
  },
  {
    key: 'sceneryOutlines', group: 'Worlds', label: 'Scenery outlines',
    hint: 'dark outlines on background props — turn off if the frame rate dips',
    toggle: true,
    read: () => CONFIG.sceneryOutlines,
    write: (v) => { CONFIG.sceneryOutlines = v; },
  },
  // --- dev tools, kept together at the bottom ---
  {
    key: 'devHitboxes', label: 'Show hitboxes', hint: 'draw the real collision volumes', dev: true,
    toggle: true,
    read: () => CONFIG.devHitboxes,
    write: (v) => { CONFIG.devHitboxes = v; },
  },
  {
    key: 'invincible', label: 'Invincible', hint: 'nothing can wipe you out', dev: true,
    toggle: true,
    read: () => CONFIG.invincible,
    write: (v) => { CONFIG.invincible = v; },
  },
  {
    key: 'powerupsOnly', label: 'Powerups only', hint: 'spawn powerups and nothing else', dev: true,
    toggle: true,
    read: () => CONFIG.powerupsOnly,
    write: (v) => { CONFIG.powerupsOnly = v; },
  },
];

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

// Shop: tennis balls buy cosmetics + chase targets. The first entry in every
// category is the free default. Owned/equipped state persists in localStorage;
// UI._normalizeSaves keeps old saves working when this list changes.
//
// COATS replaced collars. A collar is a 6cm torus on a chibi model — you
// bought one, squinted, and couldn't tell. Recolouring the whole animal is the
// same click and you can see it from the menu.
//
// A coat overrides the breed's colour slots (see BREEDS below); anything it
// leaves out falls through to the breed, so a coat doesn't have to be
// exhaustive. `glow` makes the coat self-lit, which is what sells Celestial
// and Infernal as otherworldly rather than just "a beige dog".
//
// `glowStrength` has to scale INVERSELY with how light the coat already is.
// At a flat 1.0 the pale Celestial coat lost all its shading and the animal
// went to a featureless cream blob — the same trap documented on glowMat in
// props.js. Dark coats can take a lot of glow; light ones need a whisper.
export const COSMETICS = {
  fur: [
    { id: 'default', label: 'Natural', price: 0, swatch: '#c9a06a' },
    {
      id: 'cosmic', label: 'Cosmic', price: 350, swatch: '#5f4bb0',
      coat: {
        body: 0x4a3d8f, patches: 0x2e2560, head: 0x362b6e, muzzle: 0x5a4da8,
        ear: 0x271f52, chest: 0x9d8ce8, collar: 0x6fe8d8,
      },
      glow: 0x2a1f6a, glowStrength: 0.55,
    },
    {
      id: 'celestial', label: 'Celestial', price: 550, swatch: '#f2e6bf',
      coat: {
        body: 0xf7f2e4, patches: 0xe6d9b8, head: 0xf2ead6, muzzle: 0xfaf6ea,
        ear: 0xe0d3ae, chest: 0xfffdf6, collar: 0xf0c64a,
      },
      glow: 0x4a3c18, glowStrength: 0.3,
    },
    {
      id: 'infernal', label: 'Infernal', price: 550, swatch: '#8f3320',
      coat: {
        body: 0x3a2018, patches: 0x8f3320, head: 0x2e1a14, muzzle: 0x5a2b1e,
        ear: 0x1f110d, chest: 0xd9541f, collar: 0xffb02a,
      },
      glow: 0x6a1c00, glowStrength: 0.7,
    },
  ],
  hat: [
    { id: 'none', label: 'No Hat', price: 0 },
    { id: 'party', label: 'Party Hat', price: 200 },
    { id: 'propeller', label: 'Propeller', price: 350 },
    { id: 'crown', label: 'Crown', price: 600 },
    { id: 'halo', label: 'Halo', price: 450 },
    { id: 'horns', label: 'Horns', price: 450 },
    { id: 'helmet', label: 'Space Helmet', price: 700 },
  ],
  chase: [
    { id: 'squirrel', label: 'Squirrel', price: 0 },
    { id: 'butterfly', label: 'Butterfly', price: 250 },
    { id: 'rabbit', label: 'Rabbit', price: 400 },
    { id: 'ufo', label: 'UFO', price: 650 },
    { id: 'cherub', label: 'Cherub', price: 650 },
    { id: 'imp', label: 'Imp', price: 650 },
  ],
  // What kicks up behind the paws. Cheap to make, and unlike a hat you watch
  // it the entire run — the dust FX already existed, this just recolours it.
  trail: [
    { id: 'dust', label: 'Dust', price: 0, swatch: '#d8c49a' },
    { id: 'stardust', label: 'Stardust', price: 300, swatch: '#9be8ff' },
    { id: 'embers', label: 'Embers', price: 400, swatch: '#ff7a2a' },
    { id: 'feathers', label: 'Feathers', price: 400, swatch: '#ffe9a0' },
  ],
};

// Paw-trail looks, keyed by COSMETICS.trail id. `up` biases the particles
// upward so embers rise and feathers drift instead of falling like grit.
//
// These used to be two or three same-coloured specks that died in half a
// second — a puff at the paws, not a trail. Three things turn that into
// something you watch for a whole run:
//   * `colors` — each particle picks from the list, so the trail shimmers
//     between tones instead of reading as one flat blob
//   * `drift` — a backward push (+z is behind the runner) that STRETCHES the
//     trail out down the track rather than letting it pile up underfoot
//   * `streak` — every other emission adds a stretched bar travelling fast
//     backward, which is what actually sells length at speed
// Counts and lifetimes are up, but deliberately short of a bullet-hell: about
// 60-70 particles alive at once, which held 60fps on the phone test.
export const TRAILS = {
  dust: {
    colors: [0xd8c49a, 0xefe0bd, 0xbfa87c], count: 4, speed: 0.9, up: 1.0,
    life: 0.9, size: 0.85, drift: 5.4, streak: 0xefe0bd, streakLife: 0.4,
  },
  stardust: {
    colors: [0x9be8ff, 0xffffff, 0x7ab4ff, 0xd8b0ff], count: 5, speed: 1.1, up: 1.6,
    life: 1.25, size: 0.62, drift: 6.2, streak: 0xcdf3ff, streakLife: 0.5,
    gravity: 1.4, // near-weightless: stardust hangs in the air behind you
  },
  embers: {
    colors: [0xff7a2a, 0xffc247, 0xff3f2a, 0xfff0c0], count: 5, speed: 1.0, up: 2.4,
    life: 1.05, size: 0.6, drift: 5.8, streak: 0xffb02a, streakLife: 0.46,
    gravity: 1.8, // embers rise and curl away rather than dropping like grit
  },
  feathers: {
    colors: [0xffe9a0, 0xfffaf0, 0xffd166, 0xffeec4], count: 4, speed: 0.8, up: 1.9,
    life: 1.4, size: 0.95, drift: 4.8, streak: 0xfff4d0, streakLife: 0.58,
    gravity: 1.1, // they flutter down, they don't fall
  },
};

// Playable characters. Kona-style GSP first ("The Dog").
export const BREEDS = {
  gsp: {
    kind: 'dog',
    label: 'Kona',
    desc: 'Pure focus. Built to sprint.',
    body: 0xf2ede3,        // white coat
    // Liver brown, not black. A GSP's dark markings are brown, and at this
    // scale near-black just read as an unlit silhouette with no shape to it.
    patches: 0x4f3122,
    head: 0x4f3122,
    muzzle: 0x63402c,
    ear: 0x3b2419,
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
  // Modelled from a photo of the real Toby. A Jack Russell is mostly WHITE
  // with ginger markings, so he can't be built out of the colour slots alone
  // — the breed-defining bits are shape: folded button ears, a ginger skull
  // cap split by a white blaze, freckled ticking, and an upright tail.
  toby: {
    kind: 'dog',
    label: 'Old Man Toby',
    desc: 'Jack Russell. Retired, allegedly.',
    body: 0xf5f0e4,        // white coat
    patches: 0xc07a3e,     // ginger saddle (hue sampled off the photo: ~28°)
    head: 0xf4eee2,        // white face, ginger cap added on top
    muzzle: 0xfaf6ec,
    ear: 0xb06d34,         // ginger ears + skull cap
    chest: 0xfffdf6,
    collar: 0x2e2a26,      // his actual black collar
    tailScale: 0.8,
    fluffyTail: false,
    bodyScaleX: 0.82,      // stocky little terrier
    earStyle: 'button',    // folded-over JRT ears
    headCap: true,         // ginger over the skull, white blaze up the middle
    ticking: true,         // the freckling all over his white
    tailUp: true,          // carried up, not streaming behind
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
