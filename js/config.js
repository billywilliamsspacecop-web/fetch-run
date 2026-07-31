// Central tuning knobs — tweak these during playtests.
export const CONFIG = {
  lanes: 5,

  // Speed is in "world units" (canvas heights) per second.
  baseSpeed: 0.55,        // chill opening speed
  chillDuration: 75,      // seconds before difficulty starts ramping
  rampPerSecond: 0.012,   // linear speed increase per second after chill phase
  maxSpeed: 1.6,

  // Obstacle spawning: interval shrinks as speed grows so density stays fair.
  spawnBaseInterval: 1.1,   // seconds between spawns at base speed
  spawnMinInterval: 0.45,
  doubleSpawnChance: 0.25,  // chance a spawn drops 2 obstacles (never blocks all lanes)

  // Dog
  laneChangeTime: 0.12,   // seconds to tween between lanes
  dogY: 0.78,             // dog's vertical position as fraction of canvas height
  hitboxForgiveness: 0.72, // scale factor on collision boxes (forgiving = fun)

  // Near-miss detection (groundwork for the combo system)
  nearMissWindow: 0.055,  // horizontal fraction of width that counts as "close"

  // Death flow
  deathPauseBeforeInput: 0.6, // seconds before stat screen accepts a restart tap

  // Swipe detection
  swipeMinDistance: 24,   // px
  swipeMaxTime: 600,      // ms — generous so casual swipes still count
};
