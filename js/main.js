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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
const ui = new UI(input);
const game = new Game({ planetGroup, dogPivot, squirrelPivot, fx }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
ui.onRunAgain = () => game.handleScreenTap();
ui.onHome = () => game.goHome();
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
function frame(now) {
  if (now - last < minFrameMs) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min((now - last) / 1000, 0.05); // clamp to avoid tab-switch jumps
  last = now;

  game.update(dt);
  const zoomies = game.power?.type === 'zoomies';
  // Zoomies: the gallop cycle itself goes into overdrive
  const animSpeed = game.speed * (zoomies ? CONFIG.powerups.zoomiesAnimBoost : 1);
  dog.animate(now / 1000, animSpeed, game.state, game.targetLane - game.lane);
  const chasing = game.state === 'intro' || game.state === 'running';
  squirrel.group.visible = chasing;
  if (chasing) squirrel.animate(now / 1000, animSpeed);
  game.spawner.animate(now / 1000);
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
