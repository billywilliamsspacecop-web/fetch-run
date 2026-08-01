import * as THREE from 'three';

// Chase targets: the quarry bounding along ahead of the runner, dodging on
// its own. Squirrel is default; rabbit and butterfly unlock in the shop.
// All face -Z like the runner. (v1 squirrel archived in js/legacy/.)

const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function buildSquirrelModel() {
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

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 11), fur);
  head.position.set(0, 0.52, -0.2);
  sq.add(head);

  const earGeo = new THREE.ConeGeometry(0.05, 0.12, 8);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.set(side * 0.09, 0.68, -0.18);
    sq.add(ear);
  }

  const eyeGeo = new THREE.SphereGeometry(0.032, 8, 6);
  const dark = mat(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(side * 0.08, 0.56, -0.34);
    sq.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), dark);
  nose.position.set(0, 0.5, -0.37);
  sq.add(nose);

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

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.3, 0.24);
  [
    { r: 0.09, pos: [0, 0.05, 0.08] },
    { r: 0.11, pos: [0, 0.2, 0.14] },
    { r: 0.12, pos: [0, 0.36, 0.1] },
    { r: 0.11, pos: [0, 0.5, 0.0] },
    { r: 0.08, pos: [0, 0.58, -0.12] },
  ].forEach((t, i) => {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(t.r, 10, 8), i >= 3 ? furLight : fur);
    tuft.position.set(...t.pos);
    tailPivot.add(tuft);
  });
  sq.add(tailPivot);

  return { root: sq, legs, tailPivot, flying: false };
}

function buildRabbitModel() {
  const fur = mat(0xe8e2d8);
  const furShade = mat(0xc9c0b2);
  const r = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 11), fur);
  body.scale.set(0.9, 0.9, 1.15);
  body.position.y = 0.28;
  r.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 11), fur);
  head.position.set(0, 0.55, -0.2);
  r.add(head);

  // The ears are the whole point of a rabbit
  const earGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const innerMat = mat(0xe8a8b0);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    const outer = new THREE.Mesh(earGeo, fur);
    outer.scale.set(0.55, 2.6, 0.7);
    const inner = new THREE.Mesh(earGeo, innerMat);
    inner.scale.set(0.32, 2.1, 0.4);
    inner.position.z = -0.03;
    ear.add(outer, inner);
    ear.position.set(side * 0.09, 0.85, -0.16);
    ear.rotation.z = side * 0.18;
    r.add(ear);
    ears.push(ear);
  }

  const eyeGeo = new THREE.SphereGeometry(0.034, 8, 6);
  const dark = mat(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(side * 0.09, 0.58, -0.35);
    r.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0xe08a9a));
  nose.position.set(0, 0.53, -0.38);
  r.add(nose);

  const legGeo = new THREE.CylinderGeometry(0.04, 0.055, 0.18, 8);
  const legs = [];
  for (const [x, z] of [[-0.11, -0.12], [0.11, -0.12], [-0.11, 0.16], [0.11, 0.16]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.17, z);
    const leg = new THREE.Mesh(legGeo, furShade);
    leg.position.y = -0.08;
    pivot.add(leg);
    r.add(pivot);
    legs.push(pivot);
  }

  // Pom tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.32, 0.3);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fur);
  tailPivot.add(pom);
  r.add(tailPivot);

  return { root: r, legs, tailPivot, ears, flying: false };
}

function buildButterflyModel() {
  const b = new THREE.Group();
  const bodyMat = mat(0x4a3a5a);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.34, 8), bodyMat);
  body.rotation.x = Math.PI / 2 - 0.3;
  body.position.y = 0.55;
  b.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bodyMat);
  head.position.set(0, 0.63, -0.2);
  b.add(head);

  // Wings: two hinged pairs
  const wingMat = new THREE.MeshLambertMaterial({
    color: 0xe8734f, flatShading: true, side: THREE.DoubleSide,
  });
  const wingMat2 = new THREE.MeshLambertMaterial({
    color: 0xf0a030, flatShading: true, side: THREE.DoubleSide,
  });
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const big = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), wingMat);
    big.scale.set(1.25, 0.9, 1);
    big.position.set(side * 0.2, 0.05, 0);
    big.rotation.x = -Math.PI / 2;
    const small = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), wingMat2);
    small.position.set(side * 0.14, 0.05, 0.18);
    small.rotation.x = -Math.PI / 2;
    wing.add(big, small);
    wing.position.y = 0.55;
    b.add(wing);
    wings.push(wing);
  }
  return { root: b, wings, flying: true };
}

export function buildChase(id = 'squirrel') {
  const model =
    id === 'rabbit' ? buildRabbitModel() :
    id === 'butterfly' ? buildButterflyModel() :
    buildSquirrelModel();

  model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  function animate(t, speed) {
    const freq = 11 + speed * 26;
    const phase = t * freq;
    if (model.flying) {
      // Butterfly: flutter + bob, wings beating fast
      model.root.position.y = 0.25 + Math.sin(t * 5.2) * 0.14;
      model.root.rotation.z = Math.sin(t * 2.6) * 0.15;
      const flap = Math.sin(t * 26);
      model.wings[0].rotation.z = 0.4 + flap * 0.75;
      model.wings[1].rotation.z = -0.4 - flap * 0.75;
      return;
    }
    const hop = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
    model.root.position.y = hop * 0.16;
    model.root.rotation.x = Math.cos(phase) * 0.14;
    model.legs[0].rotation.x = Math.sin(phase) * 0.9;
    model.legs[1].rotation.x = Math.sin(phase + 0.3) * 0.9;
    model.legs[2].rotation.x = -Math.sin(phase + 2.9) * 0.95;
    model.legs[3].rotation.x = -Math.sin(phase + 3.2) * 0.95;
    model.tailPivot.rotation.x = Math.sin(phase - 1.2) * 0.25 - 0.1;
    model.tailPivot.rotation.z = Math.sin(phase * 0.7) * 0.12;
    if (model.ears) {
      model.ears[0].rotation.x = Math.sin(phase * 0.9) * 0.22 - 0.15;
      model.ears[1].rotation.x = Math.sin(phase * 0.9 + 0.4) * 0.22 - 0.15;
    }
  }

  return { group: model.root, animate };
}

// Back-compat alias
export function buildSquirrel() {
  return buildChase('squirrel');
}
