import * as THREE from 'three';
import { COLORS, BREEDS } from './config.js';

// Cute low-poly runner assembled from primitives. Faces -Z (away from camera).
// breed: key into BREEDS — dogs ('gsp', 'golden') and cats ('cat') share a rig.
export function buildDog(breedKey = 'gsp') {
  const breed = BREEDS[breedKey] || BREEDS.gsp;
  const isCat = breed.kind === 'cat';
  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const bodyMat = mat(breed.body);
  const headMat = mat(breed.head);
  const earMat = mat(breed.ear);
  const darkMat = mat(COLORS.nose);

  const dog = new THREE.Group();

  // Body — rounded torso, width set per breed
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), bodyMat);
  body.position.y = 0.58;
  dog.add(body);

  // Coat patches (GSP): black blobs over the white base, like Kona's saddle + rump
  if (breed.patches !== null) {
    const patchMat = mat(breed.patches);
    const patchSpecs = [
      { pos: [0.14, 0.82, 0.28], scale: [0.3, 0.18, 0.34] },   // rump/back right
      { pos: [-0.2, 0.72, -0.05], scale: [0.22, 0.2, 0.28] },  // left side
      { pos: [0.05, 0.62, 0.52], scale: [0.24, 0.22, 0.2] },   // tail base
    ];
    for (const s of patchSpecs) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 13, 10), patchMat);
      p.position.set(...s.pos);
      p.scale.set(...s.scale);
      dog.add(p);
    }
  }

  // Chest bib
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 11), mat(breed.chest));
  chest.scale.set(0.75, 0.7, 0.5);
  chest.position.set(0, 0.5, -0.42);
  dog.add(chest);

  // Head — big for cuteness
  const head = new THREE.Mesh(new THREE.SphereGeometry(isCat ? 0.38 : 0.42, 18, 14), headMat);
  head.position.set(0, 1.12, -0.52);
  dog.add(head);

  // Collar — sits between head and body
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.06, 10, 22), mat(breed.collar));
  collar.position.set(0, 0.92, -0.38);
  collar.rotation.x = 1.15;
  dog.add(collar);

  // Muzzle + nose (short white patch on the cat, longer snout on dogs)
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(isCat ? 0.16 : 0.19, 14, 11), mat(breed.muzzle));
  muzzle.scale.set(1, 0.8, isCat ? 0.9 : 1.25);
  muzzle.position.set(0, isCat ? 0.98 : 1.0, isCat ? -0.82 : -0.9);
  dog.add(muzzle);
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(isCat ? 0.05 : 0.075, 10, 8),
    isCat ? mat(0xe08a9a) : darkMat
  );
  nose.position.set(0, isCat ? 1.02 : 1.05, isCat ? -0.95 : -1.1);
  dog.add(nose);

  // Tongue — dogs run mouth-open; cats keep their dignity
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.24), mat(COLORS.tongue));
  tongue.position.set(0.04, 0.86, -0.98);
  tongue.rotation.x = 0.4;
  tongue.visible = !isCat;
  dog.add(tongue);

  // Whiskers (cat)
  if (isCat) {
    const whiskerMat = mat(0xdedad2);
    for (const side of [-1, 1]) {
      for (const tilt of [-0.12, 0.1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.008), whiskerMat);
        w.position.set(side * 0.24, 1.0 + tilt, -0.8);
        w.rotation.z = side * (0.18 + tilt);
        w.rotation.y = side * -0.35;
        dog.add(w);
      }
    }
  }

  // Eyes — amber on the dark GSP head, green on the cat
  const eyeGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const eyeMat = isCat ? mat(0x6fd34f) : breedKey === 'gsp' ? mat(0x8a6a3a) : darkMat;
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.17, 1.24, isCat ? -0.8 : -0.86);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.17;
  dog.add(eyeL, eyeR);

  // Ears — floppy spheres on dogs, upright cones on the cat
  let earL, earR;
  if (isCat) {
    const earGeo = new THREE.ConeGeometry(0.13, 0.28, 10);
    earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.2, 1.46, -0.48);
    earL.rotation.z = 0.22;
    earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.2, 1.46, -0.48);
    earR.rotation.z = -0.22;
  } else {
    const earGeo = new THREE.SphereGeometry(0.16, 12, 9);
    earL = new THREE.Mesh(earGeo, earMat);
    earL.scale.set(0.55, 1.5, 0.75);
    earL.position.set(-0.4, 1.05, -0.45);
    earL.rotation.z = 0.35;
    earR = new THREE.Mesh(earGeo, earMat);
    earR.scale.copy(earL.scale);
    earR.position.set(0.4, 1.05, -0.45);
    earR.rotation.z = -0.35;
  }
  dog.add(earL, earR);

  // Legs — pivoted cylinders, animated gallop; cat gets white tuxedo socks
  const legGeo = new THREE.CylinderGeometry(isCat ? 0.07 : 0.09, isCat ? 0.09 : 0.11, 0.42, 12);
  const legs = [];
  for (const [x, z] of [[-0.24, -0.35], [0.24, -0.35], [-0.24, 0.38], [0.24, 0.38]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.y = -0.21;
    pivot.add(leg);
    if (isCat) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mat(breed.chest));
      sock.position.y = -0.4;
      pivot.add(sock);
    }
    dog.add(pivot);
    legs.push(pivot);
  }

  // Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.85, 0.62);
  if (isCat) {
    // Long slinky tail curving up, white tip
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 10), bodyMat);
    seg1.position.y = 0.2;
    seg1.rotation.x = 0.35;
    tailPivot.add(seg1);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 10), bodyMat);
    seg2.position.set(0, 0.48, 0.16);
    seg2.rotation.x = -0.25;
    tailPivot.add(seg2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(breed.chest));
    tip.position.set(0, 0.66, 0.2);
    tailPivot.add(tip);
  } else {
    const tailMat = breed.patches !== null ? mat(breed.patches) : mat(breed.ear);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 12), tailMat);
    tail.position.y = 0.22;
    tail.rotation.x = 0.5;
    tailPivot.add(tail);
    if (breed.fluffyTail) {
      // Feathered plume: overlapping tufts along an arc that curls up over the
      // back, tapering to a lighter tip — reads like a golden's flag tail
      const tuftSpecs = [
        { r: 0.15, pos: [0, 0.2, 0.06], sc: [0.85, 1.1, 0.9], c: breed.ear },
        { r: 0.16, pos: [0.02, 0.34, -0.02], sc: [0.9, 1.15, 0.95], c: breed.body },
        { r: 0.14, pos: [-0.02, 0.47, -0.1], sc: [0.85, 1.1, 0.9], c: breed.body },
        { r: 0.11, pos: [0, 0.58, -0.2], sc: [0.8, 1.05, 0.85], c: breed.chest },
        { r: 0.08, pos: [0.01, 0.65, -0.3], sc: [0.75, 1, 0.8], c: breed.chest },
      ];
      for (const t of tuftSpecs) {
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(t.r, 12, 9), mat(t.c));
        tuft.position.set(...t.pos);
        tuft.scale.set(...t.sc);
        tuft.rotation.x = -0.4;
        tailPivot.add(tuft);
      }
    }
  }
  tailPivot.scale.setScalar(breed.tailScale);
  dog.add(tailPivot);

  const parts = { body, head, muzzle, nose, legs, tailPivot, earL, earR, tongue };
  const earAmp = isCat ? 0.07 : 0.3; // pointed ears twitch, floppy ears fly
  const baseX = breed.bodyScaleX;

  // t: seconds, speed: rad/s planet spin, state: 'menu'|'running'|'dead',
  // lean: lane-change velocity (targetLane - lane), for banking into moves.
  function animate(t, speed, state, lean = 0) {
    if (state === 'dead') {
      dog.rotation.set(0, 0, 1.5);
      dog.position.y = -0.25;
      return;
    }
    const freq = 8.5 + speed * 24;
    const phase = t * freq;

    // Rotary gallop with uneven leg phasing (real gallops aren't symmetric):
    // fronts lead close together, rears drive ~half a cycle later, each leg
    // with its own amplitude so no two ever mirror exactly.
    parts.legs[0].rotation.x = Math.sin(phase) * 1.0;
    parts.legs[1].rotation.x = Math.sin(phase + 0.55) * 0.92;
    parts.legs[2].rotation.x = -Math.sin(phase + 2.75) * 1.12;
    parts.legs[3].rotation.x = -Math.sin(phase + 3.35) * 1.02;

    // Bound with suspension: sharp push-off, floaty hang at the top
    const hop = Math.pow(0.5 + 0.5 * Math.sin(phase + 0.3), 1.5);
    dog.position.y = hop * 0.2;
    // Pitch leads the bounce (nose dips into landing, lifts on push-off)
    dog.rotation.x = Math.cos(phase + 0.3) * 0.1;
    // Bank into lane changes + a whisper of body roll at half frequency
    dog.rotation.z =
      THREE.MathUtils.clamp(-lean * 0.4, -0.45, 0.45) + Math.sin(phase * 0.5 + 1.2) * 0.03;
    // Stretch peaks mid-air, squash on landing — offset from the hop
    const stretch = Math.sin(phase + 0.9);
    parts.body.scale.set(baseX, 0.8 - stretch * 0.045, 1.25 + stretch * 0.11);
    // Head counter-bobs with a lag so it floats instead of pistoning
    parts.head.position.y = 1.12 - Math.sin(phase - 0.4) * 0.05;
    parts.head.rotation.x = Math.sin(phase + 0.1) * 0.07;

    // Secondary motion at unrelated frequencies — kills the metronome feel
    parts.tailPivot.rotation.z = Math.sin(phase * 0.9) * 0.55 + Math.sin(phase * 1.7 + 1) * 0.2;
    parts.earL.rotation.z = (isCat ? 0.22 : 0.35) + Math.sin(phase + 0.4) * earAmp + Math.sin(phase * 1.31) * earAmp * 0.3;
    parts.earR.rotation.z = -(isCat ? 0.22 : 0.35) - Math.sin(phase + 0.7) * earAmp - Math.sin(phase * 1.19) * earAmp * 0.3;
    parts.tongue.rotation.x = 0.4 + Math.sin(phase * 0.93 + 0.5) * 0.12;
  }

  // Shadows: every part casts
  dog.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return { group: dog, animate };
}
