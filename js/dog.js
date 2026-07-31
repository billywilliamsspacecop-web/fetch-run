import * as THREE from 'three';
import { COLORS } from './config.js';

// Cute low-poly puppy assembled from primitives. Faces -Z (away from camera).
export function buildDog() {
  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const bodyMat = mat(COLORS.dogBody);
  const earMat = mat(COLORS.dogEar);
  const darkMat = mat(COLORS.nose);

  const dog = new THREE.Group();

  // Body — plump rounded torso
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), bodyMat);
  body.scale.set(0.85, 0.8, 1.25);
  body.position.y = 0.58;
  dog.add(body);

  // Chest patch
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(COLORS.dogChest));
  chest.scale.set(0.75, 0.7, 0.5);
  chest.position.set(0, 0.5, -0.42);
  dog.add(chest);

  // Head — big for cuteness
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bodyMat);
  head.position.set(0, 1.12, -0.52);
  dog.add(head);

  // Muzzle + nose
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat(COLORS.dogChest));
  muzzle.scale.set(1, 0.8, 1.1);
  muzzle.position.set(0, 1.0, -0.88);
  dog.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), darkMat);
  nose.position.set(0, 1.05, -1.05);
  dog.add(nose);

  // Tongue
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.22), mat(COLORS.tongue));
  tongue.position.set(0.04, 0.88, -0.95);
  tongue.rotation.x = 0.35;
  dog.add(tongue);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, darkMat);
  eyeL.position.set(-0.18, 1.24, -0.86);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18;
  dog.add(eyeL, eyeR);

  // Floppy ears
  const earGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const earL = new THREE.Mesh(earGeo, earMat);
  earL.scale.set(0.55, 1.5, 0.75);
  earL.position.set(-0.4, 1.05, -0.45);
  earL.rotation.z = 0.35;
  const earR = new THREE.Mesh(earGeo, earMat);
  earR.scale.copy(earL.scale);
  earR.position.set(0.4, 1.05, -0.45);
  earR.rotation.z = -0.35;
  dog.add(earL, earR);

  // Legs — stubby cylinders, animated gallop
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.42, 8);
  const legs = [];
  for (const [x, z] of [[-0.26, -0.35], [0.26, -0.35], [-0.26, 0.38], [0.26, 0.38]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.y = -0.21;
    pivot.add(leg);
    dog.add(pivot);
    legs.push(pivot);
  }

  // Tail — perky, wags
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.85, 0.62);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 8), bodyMat);
  tail.position.y = 0.22;
  tail.rotation.x = 0.5;
  tailPivot.add(tail);
  dog.add(tailPivot);

  const parts = { body, head, legs, tailPivot, earL, earR, tongue };

  // t: seconds, speed: rad/s planet spin, state: 'menu'|'running'|'dead'
  function animate(t, speed, state) {
    if (state === 'dead') {
      dog.rotation.z = 1.5;
      dog.position.y = -0.25;
      return;
    }
    dog.position.y = 0;

    const freq = 7 + speed * 22;
    const phase = t * freq;
    // Gallop: front pair and back pair swing opposite
    parts.legs[0].rotation.x = Math.sin(phase) * 0.75;
    parts.legs[1].rotation.x = Math.sin(phase + 0.3) * 0.75;
    parts.legs[2].rotation.x = -Math.sin(phase + 0.15) * 0.75;
    parts.legs[3].rotation.x = -Math.sin(phase + 0.45) * 0.75;
    // Body bob + tail wag + ear flap
    dog.position.y = Math.abs(Math.sin(phase)) * 0.09;
    parts.tailPivot.rotation.z = Math.sin(phase * 0.9) * 0.5;
    parts.earL.rotation.z = 0.35 + Math.sin(phase) * 0.12;
    parts.earR.rotation.z = -0.35 - Math.sin(phase + 0.2) * 0.12;
  }

  return { group: dog, animate };
}
