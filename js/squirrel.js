import * as THREE from 'three';

// The chase target: a small squirrel bounding along ahead of the runner,
// dodging obstacles on its own. Faces -Z like the runner.
export function buildSquirrel() {
  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const fur = mat(0x9a6a44);
  const furLight = mat(0xc59a72);

  const sq = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 11), fur);
  body.scale.set(0.8, 0.85, 1.15);
  body.position.y = 0.3;
  sq.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), furLight);
  belly.scale.set(0.7, 0.7, 0.6);
  belly.position.set(0, 0.24, -0.16);
  sq.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 11), fur);
  head.position.set(0, 0.52, -0.22);
  sq.add(head);

  // Perky little ears
  const earGeo = new THREE.ConeGeometry(0.05, 0.12, 8);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.set(side * 0.08, 0.66, -0.2);
    sq.add(ear);
  }

  // Eyes + nose
  const eyeGeo = new THREE.SphereGeometry(0.025, 8, 6);
  const dark = mat(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(side * 0.07, 0.56, -0.34);
    sq.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), dark);
  nose.position.set(0, 0.51, -0.38);
  sq.add(nose);

  // Tiny legs
  const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.18, 8);
  const legs = [];
  for (const [x, z] of [[-0.1, -0.12], [0.1, -0.12], [-0.1, 0.14], [0.1, 0.14]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.18, z);
    const leg = new THREE.Mesh(legGeo, fur);
    leg.position.y = -0.09;
    pivot.add(leg);
    sq.add(pivot);
    legs.push(pivot);
  }

  // The famous tail: an arc of fluff curling up over the back
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.3, 0.24);
  const tuftSpecs = [
    { r: 0.09, pos: [0, 0.05, 0.08] },
    { r: 0.11, pos: [0, 0.2, 0.14] },
    { r: 0.12, pos: [0, 0.36, 0.1] },
    { r: 0.11, pos: [0, 0.5, -0.0] },
    { r: 0.08, pos: [0, 0.58, -0.12] },
  ];
  tuftSpecs.forEach((t, i) => {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(t.r, 10, 8), i >= 3 ? furLight : fur);
    tuft.position.set(...t.pos);
    tailPivot.add(tuft);
  });
  sq.add(tailPivot);

  sq.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // Squirrels bound — double-time hop with the tail counter-flowing
  function animate(t, speed) {
    const freq = 11 + speed * 26;
    const phase = t * freq;
    const hop = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
    sq.position.y = hop * 0.16;
    sq.rotation.x = Math.cos(phase) * 0.14;
    legs[0].rotation.x = Math.sin(phase) * 0.9;
    legs[1].rotation.x = Math.sin(phase + 0.3) * 0.9;
    legs[2].rotation.x = -Math.sin(phase + 2.9) * 0.95;
    legs[3].rotation.x = -Math.sin(phase + 3.2) * 0.95;
    tailPivot.rotation.x = Math.sin(phase - 1.2) * 0.25 - 0.1;
    tailPivot.rotation.z = Math.sin(phase * 0.7) * 0.12;
  }

  return { group: sq, animate };
}
