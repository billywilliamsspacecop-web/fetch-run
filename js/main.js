import * as THREE from 'three';
import { CONFIG, PALETTES } from './config.js';
import { buildWorld, STAGE_TINTS } from './world.js';
import { buildDog } from './dog.js';
import { buildChase } from './squirrel.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const R = CONFIG.planetRadius;

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Filmic tone mapping: richer color, softer highlights — pushes the look
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 120);
// Dog sits at dogTheta down the near side; camera above and behind it so
// obstacles crest the globe top and roll down toward the player.
const CAM_POS = new THREE.Vector3(0, R + 7.5, 13.5);
camera.position.copy(CAM_POS);
camera.lookAt(0, R + 0.4, 3.0);
camera.updateProjectionMatrix();

// Lane spacing was a fixed guess (0.06 rad) that put lanes 0 and 4 partially
// OFF-SCREEN on normal portrait phones — the outermost lanes' obstacles and
// bridges rendered past the visible edge while gameplay logic (and the tap
// zones) assumed all 5 were evenly visible. That mismatch between "where a
// lane visually is" and "where tapping registers" was the real root cause
// behind every "I was on the bridge and died anyway" report. Fix: derive the
// lane angle from the ACTUAL camera projection so all 5 always fit on
// screen with margin, then derive tap zones from that same projection so
// taps and visuals can never drift apart again.
function computeLaneLayout() {
  const _p = new THREE.Vector3();
  const _axisX = new THREE.Vector3(1, 0, 0);
  const _axisZ = new THREE.Vector3(0, 0, 1);
  const screenFracForLane = (lane, laneAngle) => {
    const alpha = (2 - lane) * laneAngle;
    _p.set(0, R, 0);
    _p.applyAxisAngle(_axisX, CONFIG.dogTheta);
    _p.applyAxisAngle(_axisZ, alpha);
    const ndc = _p.clone().project(camera);
    return (ndc.x + 1) / 2;
  };
  // Binary-search the lane angle that puts the outermost lane at 94% of
  // screen width (a small margin so nothing clips at the very edge).
  let lo = 0.005, hi = 0.15;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (screenFracForLane(4, mid) > 0.94) hi = mid; else lo = mid;
  }
  const laneAngle = lo;
  const laneFracs = [0, 1, 2, 3, 4].map((l) => screenFracForLane(l, laneAngle));
  // Tap-zone boundary between lane i and i+1 is the midpoint of their
  // on-screen fractions; the last boundary is just past the visible edge.
  const zoneBoundaries = [
    (laneFracs[0] + laneFracs[1]) / 2,
    (laneFracs[1] + laneFracs[2]) / 2,
    (laneFracs[2] + laneFracs[3]) / 2,
    (laneFracs[3] + laneFracs[4]) / 2,
    1,
  ];
  return { laneAngle, zoneBoundaries };
}
const { laneAngle, zoneBoundaries } = computeLaneLayout();
CONFIG.laneAngle = laneAngle;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Re-derive tap zones for the new screen size — lane angle stays fixed
  // once the world is built (obstacles are already placed using it).
  input.setZoneBoundaries(computeLaneLayout().zoneBoundaries);
});

// --- world + dog + fx ---
const { planetGroup, clouds, lights, tintables } = buildWorld(scene);
const fx = new FX(scene);

// Cool fill light from the shade side keeps the dark GSP/cat readable
const fill = new THREE.DirectionalLight(0xa8c8ff, 0.4);
fill.position.set(-10, 16, 10);
scene.add(fill);

const getEquip = () => {
  try {
    return JSON.parse(localStorage.getItem('fetchrun.equip')) ?? {};
  } catch {
    return {};
  }
};
let dog = buildDog(localStorage.getItem('fetchrun.breed') || 'gsp', getEquip());
const dogPivot = new THREE.Group(); // rotation.z = lateral lane position
dogPivot.rotation.x = CONFIG.dogTheta; // down the near side of the globe
// Carrier lifts the dog to the surface; the run-cycle bob animates position.y
// *relative* to it (animate() writes dog.group.position.y directly).
const dogCarrier = new THREE.Group();
dogCarrier.position.y = R + 0.05;
dogCarrier.add(dog.group);
dogPivot.add(dogCarrier);
scene.add(dogPivot);

// The quarry: whatever's being chased, running near the crest (game drives the pivot)
let squirrel = buildChase(getEquip().chase || 'squirrel');
const squirrelPivot = new THREE.Group();
const squirrelCarrier = new THREE.Group();
squirrelCarrier.position.y = R + 0.05;
squirrelCarrier.add(squirrel.group);
squirrelPivot.add(squirrelCarrier);
squirrelPivot.rotation.x = CONFIG.squirrelTheta;
scene.add(squirrelPivot);

// --- game wiring ---
const input = new Input();
input.setZoneBoundaries(zoneBoundaries);
const ui = new UI(input);
const game = new Game({ planetGroup, dogPivot, squirrelPivot, fx }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
ui.onRunAgain = () => game.handleScreenTap();
ui.onHome = () => game.goHome();
ui.onPauseToggle = () => game.togglePause();
ui.onHomeFromPause = () => { game.resume(); game.goHome(); };
ui.onBreedChange = (breedKey) => {
  dogCarrier.remove(dog.group);
  dog = buildDog(breedKey, getEquip());
  dogCarrier.add(dog.group);
};
ui.onCosmeticsChange = (equip) => {
  dogCarrier.remove(dog.group);
  dog = buildDog(localStorage.getItem('fetchrun.breed') || 'gsp', equip);
  dogCarrier.add(dog.group);
  squirrelCarrier.remove(squirrel.group);
  squirrel = buildChase(equip.chase || 'squirrel');
  squirrelCarrier.add(squirrel.group);
};
window.__game = game; // debug/test handle

// --- on-screen diagnostics (?debug=1 in the URL) ---
// Lets a real death be screenshotted with the exact numbers the collision
// code was using at that instant — far more useful than guessing from a
// description when a bug reproduces on-device but not in scripted tests.
const debugOn = new URLSearchParams(location.search).has('debug');
const debugEl = document.getElementById('debug-overlay');
if (debugOn) debugEl.classList.remove('hidden');
let lastDt = 0, lastFrameMs = 0;
function updateDebugOverlay(dt) {
  if (!debugOn) return;
  lastDt = dt;
  lastFrameMs = dt * 1000;
  const g = game;
  const dogT = CONFIG.dogTheta;
  const river = g.spawner?.entities.find((e) => e.isRiver);
  let riverInfo = 'no river nearby';
  if (river) {
    const cur = g.spin + river.theta0 - dogT;
    const { approachBuffer, exitBuffer, safeLaneDist } = CONFIG.water;
    const inHazard = cur > -approachBuffer && cur < river.depth + exitBuffer;
    const onBridge = Math.abs(g.lane - river.bridgeLane) <= safeLaneDist;
    riverInfo =
      `river cur=${cur.toFixed(3)} depth=${river.depth} bridgeLane=${river.bridgeLane}\n` +
      `inHazardZone=${inHazard}  onBridge=${onBridge}  ${inHazard && !onBridge ? '*** WOULD DIE ***' : 'safe'}`;
  }
  debugEl.textContent =
    `state=${g.state} stage=${g.stage} water=${g.isWaterStage} stageBridgeLane=${g.waterStageBridgeLane}\n` +
    `lane=${g.lane?.toFixed(3)} targetLane=${g.targetLane} sqLane=${g.sqLane?.toFixed(2)} sqTarget=${g.sqTargetLane}\n` +
    `frameMs=${lastFrameMs.toFixed(1)} fps=${(1000 / lastFrameMs).toFixed(0)} entities=${g.spawner?.entities.length ?? 0}\n` +
    riverInfo;
}

// --- per-stage sky palette lerping ---
const paletteState = {
  sky: new THREE.Color(PALETTES[0].sky),
  fog: new THREE.Color(PALETTES[0].fog),
};
const _tmpColor = new THREE.Color();
function lerpPalette(dt) {
  const idx = game.state === 'running' ? game.paletteIndex : 0;
  const target = PALETTES[idx];
  const tint = STAGE_TINTS[idx];
  const k = 1 - Math.exp(-dt * 1.5);
  paletteState.sky.lerp(new THREE.Color(target.sky), k);
  paletteState.fog.lerp(new THREE.Color(target.fog), k);
  scene.background.copy(paletteState.sky);
  scene.fog.color.copy(paletteState.fog);
  lights.hemi.intensity += (target.hemi - lights.hemi.intensity) * k;
  lights.sun.intensity += (target.sun - lights.sun.intensity) * k;

  // Environment mood: planet green + tree canopies pulled toward the stage hue
  tintables.planetMat.color.lerp(_tmpColor.set(tint.planet), k);
  for (const c of tintables.canopyMats) {
    const targetC = tint.canopy
      ? _tmpColor.copy(c.base).lerp(new THREE.Color(tint.canopy), tint.mix)
      : _tmpColor.copy(c.base);
    c.mat.color.lerp(targetC, k);
  }
}

// --- camera shake on wipeout ---
let shakeT = 0;
let prevState = game.state;

// --- paw dust while running ---
let dustTimer = 0;
const dogWorldPos = new THREE.Vector3();

// --- loop ---
// Runs at native display refresh (60/120Hz ProMotion etc.) — all motion is
// dt-based so any rate plays identically. Capped at CONFIG.maxFPS.
const minFrameMs = 1000 / CONFIG.maxFPS;
let last = performance.now();
let pausedAccumMs = 0;   // total real time spent paused, excluded from anim clock
let pauseStartedAt = null;
function frame(now) {
  if (now - last < minFrameMs) {
    requestAnimationFrame(frame);
    return;
  }
  const rawDt = (now - last) / 1000;
  last = now;

  if (game.paused) {
    if (pauseStartedAt === null) pauseStartedAt = now;
    renderer.render(scene, camera); // keep the paused card visible, nothing else moves
    requestAnimationFrame(frame);
    return;
  }
  if (pauseStartedAt !== null) {
    pausedAccumMs += now - pauseStartedAt;
    pauseStartedAt = null;
  }
  const dt = Math.min(rawDt, 0.05); // clamp to avoid tab-switch jumps
  const animNow = now - pausedAccumMs; // gallop/cloud/etc phase excludes paused time

  game.update(dt);
  updateDebugOverlay(dt);
  const zoomies = game.power?.type === 'zoomies';
  // Zoomies: the gallop cycle itself goes into overdrive
  const animSpeed = game.speed * (zoomies ? CONFIG.powerups.zoomiesAnimBoost : 1);
  dog.animate(animNow / 1000, animSpeed, game.state, game.targetLane - game.lane);
  const chasing = game.state === 'intro' || game.state === 'running';
  squirrel.group.visible = chasing;
  if (chasing) squirrel.animate(animNow / 1000, animSpeed);
  game.spawner.animate(animNow / 1000);
  for (const c of clouds) c.rotation.x += c.userData.speed * dt;
  lerpPalette(dt);
  fx.update(dt);

  if (prevState !== 'dead' && game.state === 'dead') shakeT = 0.5;
  prevState = game.state;

  if (game.state === 'running') {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dog.group.getWorldPosition(dogWorldPos);
      dogWorldPos.z += 0.7; // just behind the paws
      fx.dust(dogWorldPos);
      if (zoomies) {
        // Wind streaks whipping past the runner
        for (let i = 0; i < 2; i++) {
          fx.speedLine(new THREE.Vector3(
            dogWorldPos.x + (Math.random() - 0.5) * 3.4,
            dogWorldPos.y + 0.4 + Math.random() * 1.6,
            dogWorldPos.z - 3 - Math.random() * 3
          ));
        }
      }
      dustTimer = zoomies ? 0.05 : 0.09;
    }
  }

  if (shakeT > 0) {
    shakeT -= dt;
    const a = Math.max(0, shakeT) * 0.5;
    camera.position.set(
      CAM_POS.x + (Math.random() - 0.5) * a,
      CAM_POS.y + (Math.random() - 0.5) * a,
      CAM_POS.z + (Math.random() - 0.5) * a
    );
  } else {
    camera.position.copy(CAM_POS);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
