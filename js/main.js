import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld } from './world.js';
import { THEMES, calibrateHitboxes } from './themes.js';
import { buildDog } from './dog.js';
import { buildChase } from './squirrel.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { CharacterSelect } from './select.js';

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
  return { laneAngle };
}
const { laneAngle } = computeLaneLayout();
CONFIG.laneAngle = laneAngle;
// Hitboxes and scenery clearance both derive from lane width, so calibrate
// against real prop geometry now that laneAngle is final for this viewport.
calibrateHitboxes();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- world + dog + fx ---
const { planetGroup, clouds, sunDisc, sceneryGroups, tufts, lights, tintables } = buildWorld(scene);
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
const ui = new UI(input);
const game = new Game({ planetGroup, dogPivot, squirrelPivot, fx }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
ui.onRunAgain = () => game.handleScreenTap();
ui.onHome = () => game.goHome();
ui.onPauseToggle = () => game.togglePause();
ui.onHomeFromPause = () => { game.resume(); game.goHome(); };
const charSelect = new CharacterSelect(document.getElementById('select-stage'), getEquip);
charSelect.onChange = (key, breed) => {
  ui.setSelectInfo(key, breed);
  // Swap the in-world runner immediately so DONE returns you to a menu
  // already showing the character you picked.
  dogCarrier.remove(dog.group);
  dog = buildDog(key, getEquip());
  dogCarrier.add(dog.group);
};
ui.onSelectOpen = (key) => charSelect.show(key);
ui.onSelectClose = () => charSelect.hide();
ui.onSelectStep = (dir) => charSelect.step(dir);
ui.onCosmeticsChange = (equip) => {
  dogCarrier.remove(dog.group);
  dog = buildDog(localStorage.getItem('fetchrun.breed') || 'gsp', equip);
  dogCarrier.add(dog.group);
  charSelect.refresh();
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
let lastFrameMs = 0;
function updateDebugOverlay(dt) {
  if (!debugOn) return;
  lastFrameMs = dt * 1000;
  const g = game;
  const dogT = CONFIG.dogTheta;
  // Nearest obstacle ahead, and how close it is to the runner's line
  let nearest = null;
  for (const e of g.spawner?.entities ?? []) {
    if (!e.hitbox) continue;
    const cur = g.spin + e.theta0 - dogT;
    if (cur > 0.05) continue;
    if (!nearest || cur > nearest.cur) nearest = { cur, lane: e.lane };
  }
  debugEl.textContent =
    `state=${g.state} stage=${g.stage} theme=${g.theme?.id} (${g.stagesLeftInTheme} left)\n` +
    `lane=${g.lane?.toFixed(3)} targetLane=${g.targetLane} sqLane=${g.sqLane?.toFixed(2)}\n` +
    `frameMs=${lastFrameMs.toFixed(1)} fps=${(1000 / lastFrameMs).toFixed(0)} entities=${g.spawner?.entities.length ?? 0}\n` +
    (nearest
      ? `nearest obstacle: lane=${nearest.lane} dist=${nearest.cur.toFixed(3)} laneGap=${Math.abs(nearest.lane - g.lane).toFixed(2)}`
      : 'no obstacle near');
}

// --- themed level transitions ---
// Colors/lighting cross-fade smoothly; the scenery swap is a discrete
// visibility toggle the moment the theme changes (all groups are prebuilt).
const paletteState = {
  sky: new THREE.Color(THEMES[0].sky),
  fog: new THREE.Color(THEMES[0].fog),
};
const _tmpColor = new THREE.Color();
let shownThemeId = THEMES[0].id;

function applyThemeSwap(theme) {
  for (const [id, grp] of Object.entries(sceneryGroups)) grp.visible = id === theme.id;
  // Indoors there's no sky to see — hide the clouds and the sun disc
  for (const c of clouds) c.visible = theme.outdoor;
  sunDisc.visible = theme.outdoor;
  // Grass tufts only make sense on natural ground, not courts or floors
  tufts.visible = theme.tufts !== false;
  shownThemeId = theme.id;
}

function lerpTheme(dt) {
  const theme = game.state === 'menu' ? THEMES[0] : game.theme;
  if (theme.id !== shownThemeId) applyThemeSwap(theme);

  const k = 1 - Math.exp(-dt * 1.5);
  paletteState.sky.lerp(_tmpColor.set(theme.sky), k);
  paletteState.fog.lerp(_tmpColor.set(theme.fog), k);
  scene.background.copy(paletteState.sky);
  scene.fog.color.copy(paletteState.fog);
  lights.hemi.intensity += (theme.hemi - lights.hemi.intensity) * k;
  lights.sun.intensity += (theme.sun - lights.sun.intensity) * k;

  tintables.planetMat.color.lerp(_tmpColor.set(theme.planet), k);
  tintables.tuftMat.color.lerp(_tmpColor.set(theme.tuft), k);
  tintables.dashMat.color.lerp(_tmpColor.set(theme.dash), k);
  for (const c of tintables.canopyMats) {
    const target = theme.canopyTint
      ? _tmpColor.copy(c.base).lerp(new THREE.Color(theme.canopyTint), theme.canopyMix)
      : _tmpColor.copy(c.base);
    c.mat.color.lerp(target, k);
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
  lerpTheme(dt);
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
  charSelect.update(animNow / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
