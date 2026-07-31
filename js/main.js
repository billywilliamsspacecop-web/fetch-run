import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld } from './world.js';
import { buildDog } from './dog.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const R = CONFIG.planetRadius;

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 120);
// Dog sits at dogTheta down the near side; camera above and behind it so
// obstacles crest the globe top and roll down toward the player.
camera.position.set(0, R + 7.5, 13.5);
camera.lookAt(0, R + 0.4, 3.0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- world + dog ---
const { planetGroup, clouds, shadow } = buildWorld(scene);

const dog = buildDog();
const dogPivot = new THREE.Group(); // rotation.z = lateral lane position
dogPivot.rotation.x = CONFIG.dogTheta; // down the near side of the globe
// Carrier lifts the dog to the surface; the run-cycle bob animates position.y
// *relative* to it (animate() writes dog.group.position.y directly).
const dogCarrier = new THREE.Group();
dogCarrier.position.y = R + 0.05;
dogCarrier.add(dog.group);
shadow.position.y = R + 0.06;
dogPivot.add(dogCarrier, shadow);
scene.add(dogPivot);

// --- game wiring ---
const input = new Input();
const ui = new UI(input);
const game = new Game({ planetGroup, dogPivot }, input, ui);
ui.onScreenTap = () => game.handleScreenTap();
window.__game = game; // debug/test handle

// --- loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp to avoid tab-switch jumps
  last = now;

  game.update(dt);
  dog.animate(now / 1000, game.speed, game.state);
  game.spawner.animate(now / 1000);
  for (const c of clouds) c.rotation.x += c.userData.speed * dt;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
