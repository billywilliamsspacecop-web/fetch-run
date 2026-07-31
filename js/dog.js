import * as THREE from 'three';
import { COLORS, BREEDS } from './config.js';

// Cute low-poly pup assembled from primitives. Faces -Z (away from camera).
// breed: key into BREEDS ('gsp' = Kona-style, 'golden' = retriever).
export function buildDog(breedKey = 'gsp') {
  const breed = BREEDS[breedKey] || BREEDS.gsp;
  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const bodyMat = mat(breed.body);
  const headMat = mat(breed.head);
  const earMat = mat(breed.ear);
  const darkMat = mat(COLORS.nose);

  const dog = new THREE.Group();

  // Body — plump rounded torso
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), bodyMat);
  body.position.y = 0.58;
  dog.add(body);

  // Coat patches (GSP): black blobs over the white base, like Kona's saddle + rump
  if (breed.patches !== null) {
    const patchMat = mat(breed.patches);
    const patchSpecs = [
      { pos: [0.16, 0.82, 0.28], scale: [0.32, 0.18, 0.34] },  // rump/back right
      { pos: [-0.22, 0.72, -0.05], scale: [0.24, 0.2, 0.28] }, // left side
      { pos: [0.05, 0.62, 0.52], scale: [0.26, 0.22, 0.2] },   // tail base
    ];
    for (const s of patchSpecs) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), patchMat);
      p.position.set(...s.pos);
      p.scale.set(...s.scale);
      dog.add(p);
    }
  }

  // Chest patch
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(breed.chest));
  chest.scale.set(0.75, 0.7, 0.5);
  chest.position.set(0, 0.5, -0.42);
  dog.add(chest);

  // Head — big for cuteness (dark on the GSP, like the reference photo)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), headMat);
  head.position.set(0, 1.12, -0.52);
  dog.add(head);

  // Collar — sits between head and body
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.065, 8, 16), mat(breed.collar));
  collar.position.set(0, 0.92, -0.38);
  collar.rotation.x = 1.15;
  dog.add(collar);

  // Muzzle + nose
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat(breed.muzzle));
  muzzle.scale.set(1, 0.8, 1.25);
  muzzle.position.set(0, 1.0, -0.9);
  dog.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), darkMat);
  nose.position.set(0, 1.05, -1.1);
  dog.add(nose);

  // Tongue — GSPs run mouth-open
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.24), mat(COLORS.tongue));
  tongue.position.set(0.04, 0.86, -0.98);
  tongue.rotation.x = 0.4;
  dog.add(tongue);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const eyeMat = breedKey === 'gsp' ? mat(0x8a6a3a) : darkMat; // amber on the dark head
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
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

  // Legs — stubby cylinders on pivots, animated gallop
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

  // Tail — docked-short on the GSP, big and fluffy on the golden
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.85, 0.62);
  const tailMat = breed.patches !== null ? mat(breed.patches) : mat(breed.ear);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 8), tailMat);
  tail.position.y = 0.22;
  tail.rotation.x = 0.5;
  tailPivot.add(tail);
  if (breed.fluffyTail) {
    const plume = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(breed.chest));
    plume.scale.set(0.8, 1.4, 0.8);
    plume.position.set(0, 0.42, -0.12);
    tailPivot.add(plume);
  }
  tailPivot.scale.setScalar(breed.tailScale);
  dog.add(tailPivot);

  const parts = { body, head, muzzle, nose, legs, tailPivot, earL, earR };

  // t: seconds, speed: rad/s planet spin, state: 'menu'|'running'|'dead',
  // lean: lane-change velocity (targetLane - lane), for banking into moves.
  function animate(t, speed, state, lean = 0) {
    if (state === 'dead') {
      dog.rotation.set(0, 0, 1.5);
      dog.position.y = -0.25;
      return;
    }
    // Full-send GSP gallop: fast cycle, big leg swing, body stretch + pitch
    const freq = 9 + speed * 26;
    const phase = t * freq;
    const s = Math.sin(phase);

    // Rotary gallop: front pair leads, rear pair drives half a cycle later
    parts.legs[0].rotation.x = Math.sin(phase) * 1.05;
    parts.legs[1].rotation.x = Math.sin(phase + 0.35) * 1.05;
    parts.legs[2].rotation.x = -Math.sin(phase + 2.9) * 1.1;
    parts.legs[3].rotation.x = -Math.sin(phase + 3.25) * 1.1;

    // Bound: body rises + pitches + stretches through the stride
    dog.position.y = Math.abs(s) * 0.16;
    dog.rotation.x = s * 0.09;
    dog.rotation.z = THREE.MathUtils.clamp(-lean * 0.4, -0.45, 0.45);
    parts.body.scale.set(0.85, 0.8 - s * 0.04, 1.25 + s * 0.09);
    parts.head.position.y = 1.12 + s * 0.045;

    parts.tailPivot.rotation.z = Math.sin(phase * 0.95) * 0.7;
    parts.earL.rotation.z = 0.35 + Math.sin(phase + 0.4) * 0.28;
    parts.earR.rotation.z = -0.35 - Math.sin(phase + 0.6) * 0.28;
  }

  return { group: dog, animate };
}
