import * as THREE from 'three';
import { CONFIG, TRAILS } from './config.js';
import { buildWorld } from './world.js';
import { THEMES, calibrateHitboxes } from './themes.js';
import { buildDog } from './dog.js';
import { buildChase } from './squirrel.js';
import { makeShip } from './props.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { CharacterSelect, ShopPreview } from './select.js';
import { Sound } from './sound.js';

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
//
// Reverted to the original framing. Pulling the camera up and back did buy
// ~15% more visible track, but it also pushed the outer lanes out to the
// screen edges and made everything read as zoomed-out — a worse trade than
// the warning was worth. Extra reaction time is better bought from the
// settings panel (lower the speed ramp) than from the camera.
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
  // project() reads camera.matrixWorldInverse, which three.js only refreshes
  // during a render. Called at boot — before the first frame — it projected
  // against a stale matrix and produced a lane angle for a camera that wasn't
  // pointing anywhere near where it actually points. Force it current first.
  camera.updateMatrixWorld(true);
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
  // Binary-search the lane angle that puts the outermost lane's CENTRE at
  // this fraction of screen width.
  //
  // 0.86, not 0.94. The target has to leave room for the prop standing in
  // that lane, not just the lane's centre line: a lane-width obstacle centred
  // at 94% has its outer edge at 100.2%, i.e. sliced off by the screen edge,
  // which is what made the outer lanes impossible to read. At 0.86 the same
  // prop's edge lands at 92%, comfortably inside — and still wide enough that
  // all five lanes clearly use the full width.
  //
  // (This only started mattering once the stale-matrix bug above was fixed.
  // Before that the search was solving against a garbage projection and
  // never actually reached its target, which hid the problem.)
  const OUTER_LANE_TARGET = 0.86;
  // The upper bound has to stay clear of the answer or the search saturates
  // and the lanes bunch into the middle — 0.15 was hit exactly on any aspect
  // wider than portrait, which is what landscape looked so wrong at.
  let lo = 0.005, hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (screenFracForLane(4, mid) > OUTER_LANE_TARGET) hi = mid; else lo = mid;
  }
  const laneAngle = lo;
  return { laneAngle };
}
// Sizes the renderer AND re-derives the lane layout for the new aspect.
//
// This used to only update the camera and canvas on resize, leaving laneAngle
// at whatever the viewport was on first paint. Every consequence of lane width
// — where the lanes visually sit, tap zones, hitbox widths, scenery clearance
// — then disagreed with the picture, which is why the game looked wrong after
// a rotate, a window drag, or a mobile URL bar showing and hiding.
function applyViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  const { laneAngle } = computeLaneLayout();
  if (Math.abs(laneAngle - CONFIG.laneAngle) > 1e-4) {
    CONFIG.laneAngle = laneAngle;
    // Hitboxes and scenery clearance both derive from lane width, so they
    // have to be re-measured against real prop geometry whenever it changes.
    calibrateHitboxes();
  }
}
applyViewport();

// Mobile browsers fire resize constantly while the URL bar slides, and each
// one would otherwise re-measure every prop in the game. Coalesce to one pass
// on the next frame.
let resizePending = false;
const onViewportChange = () => {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    applyViewport();
  });
};
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
// visualViewport tracks the *usable* area (URL bar, on-screen keyboard) more
// accurately than window resize does on iOS.
window.visualViewport?.addEventListener('resize', onViewportChange);

// --- world + dog + fx ---
const { planetGroup, clouds, sunDisc, sceneryGroups, tufts, tuftOutline, starfield, bubbles, lights, tintables } =
  buildWorld(scene, camera);
const fx = new FX(scene);
const sfx = new Sound();
// iOS blocks audio until a real gesture; unlock on the first touch/click
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, () => sfx.unlock(), { once: true });
}

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
const game = new Game({ planetGroup, dogPivot, squirrelPivot, fx, sfx }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
ui.onRunAgain = () => game.handleScreenTap();
ui.onHome = () => game.goHome();
ui.onPauseToggle = () => { sfx.uiTap(); game.togglePause(); };
ui.onMuteToggle = () => sfx.toggle();
ui.setMuted(!sfx.enabled);
ui.onHomeFromPause = () => { game.resume(); game.goHome(); };
const charSelect = new CharacterSelect(document.getElementById('select-stage'), getEquip);
charSelect.onChange = (key, breed) => {
  ui.setSelectInfo(key, breed);
  // Swap the in-world runner immediately so DONE returns you to a menu
  // already showing the character you picked.
  dogCarrier.remove(dog.group);
  dog = buildDog(key, getEquip());
  dogCarrier.add(dog.group);
  applyShips(dogRiding);
};
// Space stage: both runners get a little ship. The characters aren't
// replaced — they ride inside, so your chosen runner is still visible.
const dogShip = makeShip(0xd8dde6, 0xe8622e);
dogShip.visible = false;
dogCarrier.add(dogShip);
const sqShip = makeShip(0xc8d8e8, 0x4fb8a0);
sqShip.scale.setScalar(0.72);
sqShip.visible = false;
squirrelCarrier.add(sqShip);

// The runner's ship and the quarry's are driven SEPARATELY. The space stage
// puts both in one, but Blast Off is the runner's power alone — the thing
// you're chasing should still be sprinting along the ground while you fly
// over it. (In space it's already in a ship, so nothing changes there.)
function setDogShip(on) {
  dogShip.visible = on;
  dog.group.position.z = on ? 0.12 : 0; // sits up in the cockpit
  dogRiding = on;
}
function setChaseShip(on) {
  sqShip.visible = on;
  squirrel.group.position.z = on ? 0.1 : 0;
  chaseRiding = on;
}
function applyShips(on) {
  setDogShip(on);
  setChaseShip(on);
}
let dogRiding = false;
let chaseRiding = false;
let themeShips = false;
let noRunCycle = false;
game.onThemeChange = (theme) => {
  themeShips = !!theme.ships;
  applyShips(themeShips);
  noRunCycle = !!theme.noRunCycle;
};

ui.onSelectOpen = (key) => charSelect.show(key);
ui.onSelectClose = () => charSelect.hide();
ui.onSelectStep = (dir) => charSelect.step(dir);

// Shop turntable — shows the tapped cosmetic on the runner (or the chase
// creature) before you commit any tennis balls to it.
const shopPreview = new ShopPreview(
  document.getElementById('shop-preview-stage'),
  () => localStorage.getItem('fetchrun.breed') || 'gsp'
);
ui.onShopPreview = (cat, equip) => shopPreview.preview(cat, equip);
ui.onShopClose = () => shopPreview.hide();
ui.onCosmeticsChange = (equip) => {
  dogCarrier.remove(dog.group);
  dog = buildDog(localStorage.getItem('fetchrun.breed') || 'gsp', equip);
  dogCarrier.add(dog.group);
  charSelect.refresh();
  squirrelCarrier.remove(squirrel.group);
  squirrel = buildChase(equip.chase || 'squirrel');
  squirrelCarrier.add(squirrel.group);
  trailLook = TRAILS[equip.trail] ?? TRAILS.dust;
  applyShips(dogRiding); // re-seat riders if we're mid-space-stage
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
  starfield.visible = !!theme.starfield;
  for (const b of bubbles) b.visible = !!theme.caustics;
  // Grass tufts only make sense on natural ground, not courts or floors
  tufts.visible = theme.tufts !== false;
  tuftOutline.visible = tufts.visible;
  shownThemeId = theme.id;
}

// The scenery outline shells, gathered once so the quality toggle is a flat
// pass over an array rather than a traverse of every scenery group in the
// game. Only collected on demand — most sessions never touch the setting.
let sceneryOutlineMeshes = null;
let sceneryOutlinesShown = true;

function applySceneryOutlines() {
  const want = CONFIG.sceneryOutlines;
  if (want === sceneryOutlinesShown) return;
  if (!sceneryOutlineMeshes) {
    sceneryOutlineMeshes = [];
    for (const grp of Object.values(sceneryGroups)) {
      grp.traverse((o) => { if (o.userData.isOutline) sceneryOutlineMeshes.push(o); });
    }
  }
  for (const o of sceneryOutlineMeshes) o.visible = want;
  sceneryOutlinesShown = want;
}

function lerpTheme(dt) {
  applySceneryOutlines();
  const theme = game.state === 'menu' ? THEMES[0] : game.theme;
  if (theme.id !== shownThemeId) applyThemeSwap(theme);

  const k = 1 - Math.exp(-dt * 1.5);
  paletteState.sky.lerp(_tmpColor.set(theme.sky), k);
  paletteState.fog.lerp(_tmpColor.set(theme.fog), k);
  scene.background.copy(paletteState.sky);
  scene.fog.color.copy(paletteState.fog);
  // Fog DISTANCE is per-theme too: underwater needs to close in much sooner
  // than open ground, and murk is the main thing that reads as "submerged"
  // rather than "outdoors, but blue".
  scene.fog.near += ((theme.fogNear ?? 36) - scene.fog.near) * k;
  scene.fog.far += ((theme.fogFar ?? 72) - scene.fog.far) * k;
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

// --- hitbox viewer (settings > Show hitboxes) ---
// Draws the volumes collision ACTUALLY uses, derived from the same numbers
// the test reads — not a re-measure of the mesh. If a box doesn't match what
// you feel in play, the box is the truth and the model is lying.
//
// hitbox.lat is in LANE units and hitbox.ang is in radians of travel, so both
// have to be converted back into world units to be drawn.
// depthTest is OFF on purpose. With it on, a wire only showed where it
// happened to poke outside the prop it belongs to — and since the boxes are
// FORGIVENESS-shrunk they mostly sit inside their model, so the viewer looked
// broken: you'd switch it on, see a couple of stray corners, and conclude
// nothing had happened. Drawing through geometry is also just what you want
// from a debug overlay.
const HB_MAT = {
  obstacle: new THREE.LineBasicMaterial({ color: 0xff3b3b, depthTest: false, depthWrite: false, fog: false }),
  pickup: new THREE.LineBasicMaterial({ color: 0x4fff6a, depthTest: false, depthWrite: false, fog: false }),
  runner: new THREE.LineBasicMaterial({ color: 0x35d7ff, depthTest: false, depthWrite: false, fog: false }),
};
const hbBox = new THREE.BoxGeometry(1, 1, 1);
const hbEdges = new THREE.EdgesGeometry(hbBox);

function makeHitboxWire(kind) {
  const wire = new THREE.LineSegments(hbEdges, HB_MAT[kind]);
  wire.renderOrder = 999;
  wire.userData.isHitboxWire = true;
  return wire;
}

// `parentScale` undoes the prop's own fitScale. The wire is parented to the
// prop group, which themes.js may have scaled to fit (or fill) its lane — so
// without this the drawn box was off by exactly that factor, which is worst
// on the props whose size was most in question.
function sizeHitboxWire(wire, lat, ang, height, parentScale = 1) {
  const laneWidthUnits = CONFIG.laneAngle * R;
  const k = 1 / (parentScale || 1);
  wire.scale.set(
    Math.max(0.02, lat * 2 * laneWidthUnits) * k,
    height * k,
    Math.max(0.02, ang * 2 * R) * k
  );
  wire.position.y = (height / 2) * k;
}

function updateHitboxView() {
  const on = CONFIG.devHitboxes;
  // Runner's own box
  if (on && !dogCarrier.userData.hbWire) {
    const w = makeHitboxWire('runner');
    dogCarrier.userData.hbWire = w;
    dogCarrier.add(w);
  }
  if (dogCarrier.userData.hbWire) {
    const w = dogCarrier.userData.hbWire;
    w.visible = on;
    if (on) sizeHitboxWire(w, CONFIG.dogHitbox.lat, CONFIG.dogHitbox.ang, 1.4);
  }
  // Every live entity
  for (const e of game.spawner.entities) {
    const wanted = on && (e.hitbox || e.isBall || e.isPower);
    if (!wanted) {
      if (e.group.userData.hbWire) e.group.userData.hbWire.visible = false;
      continue;
    }
    let w = e.group.userData.hbWire;
    if (!w) {
      w = makeHitboxWire(e.hitbox ? 'obstacle' : 'pickup');
      e.group.userData.hbWire = w;
      e.group.add(w);
    }
    w.visible = true;
    // Pickups don't carry a hitbox: they use the shared collect window.
    const lat = e.hitbox ? e.hitbox.lat : 0.65;
    const ang = e.hitbox ? e.hitbox.ang : CONFIG.collectWindowAngle;
    sizeHitboxWire(w, lat, ang, e.hitbox ? 1.4 : 0.9, e.group.scale.x);
  }
}

// --- camera shake on wipeout ---
let shakeT = 0;
let prevState = game.state;

// --- paw dust while running ---
let dustTimer = 0;
const dogWorldPos = new THREE.Vector3();
let trailLook = TRAILS[getEquip().trail] ?? TRAILS.dust;

// --- Blast Off lift ---
// The runner rides above the track, so it's the CARRIER that moves, not the
// model — the run cycle owns dog.group.position.y and would fight it.
const DOG_GROUND_Y = R + 0.05;
let rocketLift = 0;

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
  // game.power (singular) hasn't existed since powers became a stacking map,
  // so this was permanently false — the Zoomies gallop boost and its wind
  // streaks have never actually fired for a player.
  const zoomies = game.has('zoomies');
  // Zoomies: the gallop cycle itself goes into overdrive
  const animSpeed = game.speed * (zoomies ? CONFIG.powerups.zoomiesAnimBoost : 1);
  // Stages that put the characters in vehicles switch off the run cycle —
  // a gallop inside a sealed cockpit just reads as thrashing. A wipeout still
  // plays its full animation, ship or not.
  // Blast Off puts the RUNNER in a ship mid-run. The quarry keeps running.
  const rocketFlying = game.state === 'running' && game.has('rocket');
  const wantDogShip = themeShips || rocketFlying;
  if (wantDogShip !== dogRiding) setDogShip(wantDogShip);
  if (themeShips !== chaseRiding) setChaseShip(themeShips);

  // Seated = no gallop. True in space (both are flying) and while the runner
  // is rocketing; the chase animates normally unless the THEME seats it.
  const seated = (noRunCycle || rocketFlying) && game.state !== 'dead';
  if (seated) dog.ridePose(animNow / 1000);
  else {
    dog.animate(animNow / 1000, animSpeed, game.state, game.targetLane - game.lane,
      game.wipeoutStyle, game.deathTimer);
  }
  const chasing = game.state === 'intro' || game.state === 'running';
  squirrel.group.visible = chasing;
  if (chasing) {
    if (seated) squirrel.ridePose(animNow / 1000);
    else squirrel.animate(animNow / 1000, animSpeed);
  }
  game.spawner.animate(animNow / 1000);
  updateHitboxView();
  for (const c of clouds) c.rotation.x += c.userData.speed * dt;
  // Very slow drift, so the sky has life without reading as the ship yawing
  if (starfield.visible) starfield.rotation.y += dt * 0.006;
  for (const b of bubbles) {
    if (!b.visible) continue;
    b.rotation.x += b.userData.speed * dt;
    // Rise, then loop back down to the seabed so the column never empties
    const child = b.children[0];
    child.position.y += b.userData.rise * dt;
    if (child.position.y > b.userData.baseY + 9) child.position.y = b.userData.baseY;
  }
  lerpTheme(dt);
  fx.update(dt);

  if (dogRiding) {
    const flick = 0.85 + Math.sin(animNow / 40) * 0.15;
    dogShip.userData.thruster.scale.set(flick, 1, flick);
    sqShip.userData.thruster.scale.set(flick, 1, flick);
    // Ships bank into lane changes instead of a four-legged gallop lean
    dogShip.rotation.z = THREE.MathUtils.clamp((game.targetLane - game.lane) * 0.45, -0.5, 0.5);
    dogShip.position.y = Math.sin(animNow / 260) * 0.06;
  }

  if (prevState !== 'dead' && game.state === 'dead') shakeT = 0.5;
  prevState = game.state;

  // Blast Off: ease up off the deck and back down, so take-off and landing
  // read as movement rather than the runner teleporting into the air.
  const wantLift =
    game.state === 'running' && game.has('rocket') ? CONFIG.powerups.rocketLift : 0;
  if (game.state === 'menu') {
    rocketLift = 0; // a fresh run always starts on the ground
    dogCarrier.position.y = DOG_GROUND_Y;
  } else if (rocketLift !== wantLift) {
    const k = 1 - Math.exp(-dt * CONFIG.powerups.rocketRise);
    rocketLift += (wantLift - rocketLift) * k;
    if (Math.abs(wantLift - rocketLift) < 0.005) rocketLift = wantLift;
    dogCarrier.position.y = DOG_GROUND_Y + rocketLift;
  }

  // The world is frozen during the post-pause countdown, so nothing should be
  // streaming off the paws either — a trail pouring out of a stationary runner
  // is the one thing that would give the freeze away as a bug.
  if (game.state === 'running' && !game.countdown) {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dog.group.getWorldPosition(dogWorldPos);
      dogWorldPos.z += 0.7; // just behind the paws
      // Airborne there's no ground to kick up — it's thruster wash instead
      if (rocketLift > 0.2) fx.rocketExhaust(dogWorldPos);
      else fx.dust(dogWorldPos, trailLook);
      sfx.step();
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
      // Tighter than it was (0.09 / 0.05). The trail cosmetics now emit a
      // spread plus a streak per tick, and at the old spacing you could see
      // the gaps between puffs — it read as a stutter rather than a ribbon.
      dustTimer = zoomies ? 0.035 : 0.055;
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
  shopPreview.update(animNow / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// requestAnimationFrame stops entirely in a backgrounded tab, which leaves
// automated screenshots stuck on whatever was drawn before the window lost
// focus. Exposing the loop body lets a test pump frames by hand.
window.__debug = { scene, camera, renderer, frame };
