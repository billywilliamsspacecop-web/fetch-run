import * as THREE from 'three';
import { CONFIG, PALETTES } from './config.js';
import { buildWorld } from './world.js';
import { buildDog } from './dog.js';
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
const { planetGroup, clouds, lights } = buildWorld(scene);
const fx = new FX(scene);

let dog = buildDog(localStorage.getItem('fetchrun.breed') || 'gsp');
const dogPivot = new THREE.Group(); // rotation.z = lateral lane position
dogPivot.rotation.x = CONFIG.dogTheta; // down the near side of the globe
// Carrier lifts the dog to the surface; the run-cycle bob animates position.y
// *relative* to it (animate() writes dog.group.position.y directly).
const dogCarrier = new THREE.Group();
dogCarrier.position.y = R + 0.05;
dogCarrier.add(dog.group);
dogPivot.add(dogCarrier);
scene.add(dogPivot);

// --- game wiring ---
const input = new Input();
const ui = new UI(input);
const game = new Game({ planetGroup, dogPivot, fx }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
ui.onBreedChange = (breedKey) => {
  dogCarrier.remove(dog.group);
  dog = buildDog(breedKey);
  dogCarrier.add(dog.group);
};
window.__game = game; // debug/test handle

// --- per-stage sky palette lerping ---
const paletteState = {
  sky: new THREE.Color(PALETTES[0].sky),
  fog: new THREE.Color(PALETTES[0].fog),
};
function lerpPalette(dt) {
  const target = PALETTES[game.state === 'running' ? game.paletteIndex : 0];
  const k = 1 - Math.exp(-dt * 1.5);
  paletteState.sky.lerp(new THREE.Color(target.sky), k);
  paletteState.fog.lerp(new THREE.Color(target.fog), k);
  scene.background.copy(paletteState.sky);
  scene.fog.color.copy(paletteState.fog);
  lights.hemi.intensity += (target.hemi - lights.hemi.intensity) * k;
  lights.sun.intensity += (target.sun - lights.sun.intensity) * k;
}

// --- camera shake on wipeout ---
let shakeT = 0;
let prevState = game.state;

// --- paw dust while running ---
let dustTimer = 0;
const dogWorldPos = new THREE.Vector3();

// --- loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp to avoid tab-switch jumps
  last = now;

  game.update(dt);
  dog.animate(now / 1000, game.speed, game.state, game.targetLane - game.lane);
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
      dustTimer = 0.09;
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
