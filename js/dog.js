import * as THREE from 'three';
import { COLORS, BREEDS, COSMETICS } from './config.js';

// Chibi runners: huge head, tiny galloping body, enormous eyes.
// (v1 low-poly models archived in js/legacy/dog-v1.js.)
// cosmetics: { collar: id from COSMETICS.collar, hat: id from COSMETICS.hat }
export function buildDog(breedKey = 'gsp', cosmetics = {}) {
  const breed = BREEDS[breedKey] || BREEDS.gsp;
  const isCat = breed.kind === 'cat';
  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const bodyMat = mat(breed.body);
  const headMat = mat(breed.head);
  const earMat = mat(breed.ear);
  const darkMat = mat(COLORS.nose);

  const dog = new THREE.Group();

  // Small egg body — the head is the star
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), bodyMat);
  body.position.y = 0.4;
  dog.add(body);

  // GSP saddle patches on the little body
  if (breed.patches !== null) {
    const patchMat = mat(breed.patches);
    for (const s of [
      { pos: [0.1, 0.55, 0.16], scale: [0.2, 0.13, 0.22] },
      { pos: [-0.13, 0.47, 0.05], scale: [0.16, 0.14, 0.18] },
    ]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), patchMat);
      p.position.set(...s.pos);
      p.scale.set(...s.scale);
      dog.add(p);
    }
  }

  // Chest bib
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9), mat(breed.chest));
  chest.scale.set(0.85, 0.85, 0.55);
  chest.position.set(0, 0.34, -0.24);
  dog.add(chest);

  // THE HEAD — chibi scale, slightly squashed
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 22, 17), headMat);
  head.scale.set(1, 0.94, 0.96);
  head.position.set(0, 1.08, -0.18);
  dog.add(head);

  // Collar (cosmetic override or breed default). The chibi head is huge and
  // sits almost directly on the body with no real neck gap, so the old
  // position/radius buried the whole collar inside the overlapping
  // geometry — invisible regardless of color. Sized and placed to wrap
  // around the OUTSIDE of that head/body seam instead.
  const collarDef = COSMETICS.collar.find((c) => c.id === cosmetics.collar);
  const collarColor = collarDef?.color ?? breed.collar;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 10, 24), mat(collarColor));
  collar.scale.set(1, 0.82, 1);
  collar.position.set(0, 0.6, -0.05);
  collar.rotation.x = 1.42;
  dog.add(collar);

  // Muzzle + nose, small and low on the big face
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(isCat ? 0.15 : 0.18, 14, 11), mat(breed.muzzle));
  muzzle.scale.set(1.15, 0.75, 0.9);
  muzzle.position.set(0, 0.92, -0.62);
  dog.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(isCat ? 0.05 : 0.07, 10, 8), isCat ? mat(0xe08a9a) : darkMat);
  nose.position.set(0, 0.98, -0.72);
  dog.add(nose);

  // Tongue — flying in the wind on dogs
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.2), mat(COLORS.tongue));
  tongue.position.set(0.05, 0.82, -0.66);
  tongue.rotation.x = 0.45;
  tongue.visible = !isCat;
  dog.add(tongue);

  // ENORMOUS chibi eyes: white + iris + glint
  const eyeWhiteGeo = new THREE.SphereGeometry(0.115, 14, 11);
  const pupilGeo = new THREE.SphereGeometry(0.062, 10, 8);
  const glintGeo = new THREE.SphereGeometry(0.024, 8, 6);
  const whiteMat = mat(0xffffff);
  const irisMat = isCat ? mat(0x5fc94a) : breedKey === 'gsp' ? mat(0x9a7434) : mat(0x5c4326);
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(eyeWhiteGeo, whiteMat);
    white.scale.set(1, 1.25, 0.55);
    white.position.set(side * 0.21, 1.16, -0.6);
    const pupil = new THREE.Mesh(pupilGeo, irisMat);
    pupil.scale.set(1, 1.3, 0.6);
    pupil.position.set(side * 0.2, 1.15, -0.66);
    const glint = new THREE.Mesh(glintGeo, whiteMat);
    glint.position.set(side * 0.16, 1.21, -0.7);
    dog.add(white, pupil, glint);
  }

  // Blush cheeks
  const blushMat = mat(0xf0a0a0);
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), blushMat);
    blush.scale.set(1.2, 0.7, 0.5);
    blush.position.set(side * 0.34, 0.97, -0.52);
    dog.add(blush);
  }

  // Whiskers (cat)
  if (isCat) {
    const whiskerMat = mat(0xdedad2);
    for (const side of [-1, 1]) {
      for (const tilt of [-0.06, 0.06]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.008), whiskerMat);
        w.position.set(side * 0.33, 0.95 + tilt, -0.55);
        w.rotation.z = side * (0.12 + tilt * 2);
        w.rotation.y = side * -0.4;
        dog.add(w);
      }
    }
  }

  // Ears — big floppy teardrops on dogs, tall proud triangles on the cat
  let earL, earR;
  if (isCat) {
    // Fully above the skull this time — Tux gets his ears back
    const earGeo = new THREE.ConeGeometry(0.17, 0.34, 4);
    const innerGeo = new THREE.ConeGeometry(0.09, 0.2, 4);
    const innerMat = mat(0xe08a9a);
    earL = new THREE.Group();
    earR = new THREE.Group();
    for (const [grp, side] of [[earL, -1], [earR, 1]]) {
      const cone = new THREE.Mesh(earGeo, earMat);
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(0, -0.02, -0.06);
      grp.add(cone, inner);
      grp.position.set(side * 0.26, 1.62, -0.1);
      grp.rotation.z = side * 0.28;
      grp.rotation.y = side * 0.25;
    }
  } else {
    const earGeo = new THREE.SphereGeometry(0.17, 12, 9);
    earL = new THREE.Mesh(earGeo, earMat);
    earL.scale.set(0.55, 1.6, 0.8);
    earL.position.set(-0.5, 1.15, -0.12);
    earL.rotation.z = 0.4;
    earR = new THREE.Mesh(earGeo, earMat);
    earR.scale.copy(earL.scale);
    earR.position.set(0.5, 1.15, -0.12);
    earR.rotation.z = -0.4;
  }
  dog.add(earL, earR);

  // Hat (cosmetic) — perched on the crown of the big head
  const hatId = cosmetics.hat ?? 'none';
  if (hatId === 'party') {
    const hat = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 12), mat(0x3aa8e0));
    const stripe = new THREE.Mesh(new THREE.ConeGeometry(0.145, 0.3, 12), mat(0xffd54f));
    stripe.position.y = 0.07;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xe05a8a));
    pom.position.y = 0.24;
    hat.add(cone, stripe, pom);
    hat.position.set(0.1, 1.62, -0.1);
    hat.rotation.z = -0.15;
    dog.add(hat);
  } else if (hatId === 'crown') {
    const hat = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.14, 12), mat(0xf5c842));
    hat.add(band);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), mat(0xf5c842));
      const a = (i / 4) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.16, 0.12, Math.sin(a) * 0.16);
      hat.add(spike);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xe05a5a));
      jewel.position.set(Math.cos(a + 0.8) * 0.19, 0.01, Math.sin(a + 0.8) * 0.19);
      hat.add(jewel);
    }
    hat.position.set(0, 1.6, -0.12);
    hat.rotation.z = -0.08;
    dog.add(hat);
  } else if (hatId === 'propeller') {
    const hat = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd95a3c));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), mat(0x888888));
    stick.position.y = 0.14;
    const blades = new THREE.Group();
    for (const rot of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.06), mat(rot === 0 ? 0xffd54f : 0x3aa8e0));
      blade.rotation.y = rot;
      blades.add(blade);
    }
    blades.position.y = 0.2;
    hat.add(cap, stick, blades);
    hat.userData.blades = blades;
    hat.position.set(0, 1.56, -0.12);
    dog.add(hat);
    dog.userData.propeller = blades;
  }

  // Stubby galloping legs
  const legGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.3, 12);
  const sockMat = isCat ? mat(breed.chest) : null;
  const legs = [];
  for (const [x, z] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.22], [0.18, 0.22]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, z);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.y = -0.14;
    pivot.add(leg);
    if (sockMat) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), sockMat);
      sock.position.y = -0.28;
      pivot.add(sock);
    }
    dog.add(pivot);
    legs.push(pivot);
  }

  // Tails
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.52, 0.32);
  if (isCat) {
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.4, 10), bodyMat);
    seg1.position.y = 0.16;
    seg1.rotation.x = 0.4;
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 10), bodyMat);
    seg2.position.set(0, 0.4, 0.16);
    seg2.rotation.x = -0.3;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(breed.chest));
    tip.position.set(0, 0.55, 0.18);
    tailPivot.add(seg1, seg2, tip);
  } else if (breed.fluffyTail) {
    for (const t of [
      { r: 0.11, pos: [0, 0.1, 0.05], c: breed.ear },
      { r: 0.12, pos: [0.01, 0.24, 0.0], c: breed.body },
      { r: 0.1, pos: [-0.01, 0.36, -0.07], c: breed.body },
      { r: 0.07, pos: [0, 0.45, -0.15], c: breed.chest },
    ]) {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(t.r, 12, 9), mat(t.c));
      tuft.position.set(...t.pos);
      tuft.scale.set(0.85, 1.15, 0.9);
      tailPivot.add(tuft);
    }
  } else {
    const tailMat = breed.patches !== null ? mat(breed.patches) : mat(breed.ear);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.34, 12), tailMat);
    tail.position.y = 0.15;
    tail.rotation.x = 0.5;
    tailPivot.add(tail);
  }
  tailPivot.scale.setScalar(breed.tailScale);
  dog.add(tailPivot);

  const parts = { body, head, legs, tailPivot, earL, earR, tongue };
  const earAmp = isCat ? 0.09 : 0.32;
  const earBase = isCat ? 0.28 : 0.4;
  const baseX = breed.bodyScaleX + 0.12; // chibi bodies read a touch rounder

  // t: seconds, speed: rad/s planet spin, state, lean (targetLane - lane)
  // style/deathT drive the wipeout variants (see Game.WIPEOUT_BY_KIND)
  function animate(t, speed, state, lean = 0, style = 'spinout', deathT = 0) {
    if (state === 'dead') {
      wipeout(style, deathT);
      return;
    }
    dog.scale.set(1, 1, 1);
    const freq = 8.5 + speed * 24;
    const phase = t * freq;

    // Little legs going ABSOLUTELY flat out — bigger swing than v1
    parts.legs[0].rotation.x = Math.sin(phase) * 1.25;
    parts.legs[1].rotation.x = Math.sin(phase + 0.55) * 1.15;
    parts.legs[2].rotation.x = -Math.sin(phase + 2.75) * 1.3;
    parts.legs[3].rotation.x = -Math.sin(phase + 3.35) * 1.2;

    // Bound with suspension; chibi bodies bounce hard
    const hop = Math.pow(0.5 + 0.5 * Math.sin(phase + 0.3), 1.5);
    dog.position.y = hop * 0.24;
    dog.rotation.x = Math.cos(phase + 0.3) * 0.12;
    dog.rotation.z =
      THREE.MathUtils.clamp(-lean * 0.4, -0.45, 0.45) + Math.sin(phase * 0.5 + 1.2) * 0.03;
    const stretch = Math.sin(phase + 0.9);
    parts.body.scale.set(baseX, 1 - stretch * 0.06, 1.08 + stretch * 0.12);
    // The big head wobbles with a lag — peak chibi
    parts.head.position.y = 1.08 - Math.sin(phase - 0.5) * 0.06;
    parts.head.rotation.x = Math.sin(phase + 0.1) * 0.08;
    parts.head.rotation.z = Math.sin(phase * 0.5 + 0.7) * 0.05;

    parts.tailPivot.rotation.z = Math.sin(phase * 0.9) * 0.55 + Math.sin(phase * 1.7 + 1) * 0.2;
    parts.earL.rotation.z = earBase + Math.sin(phase + 0.4) * earAmp + Math.sin(phase * 1.31) * earAmp * 0.3;
    parts.earR.rotation.z = -earBase - Math.sin(phase + 0.7) * earAmp - Math.sin(phase * 1.19) * earAmp * 0.3;
    parts.tongue.rotation.x = 0.45 + Math.sin(phase * 0.93 + 0.5) * 0.14;
    if (dog.userData.propeller) dog.userData.propeller.rotation.y = t * (8 + speed * 20);
  }

  // Wipeout variants — comedic, and readable enough that you know what got
  // you. deathT is seconds since the crash, so each plays out over time.
  function wipeout(style, dt) {
    const p = Math.min(1, dt / 0.9);        // 0..1 progress
    const settle = 1 - Math.pow(1 - p, 3);  // ease-out
    dog.scale.set(1, 1, 1);
    switch (style) {
      case 'bounce': {
        // Springy things fling you up and back, tumbling
        const hop = Math.sin(Math.min(p, 1) * Math.PI) * 1.5;
        dog.position.y = hop;
        dog.position.z = settle * 1.6;
        dog.rotation.set(-settle * 7, 0, Math.sin(dt * 9) * 0.4);
        break;
      }
      case 'trip': {
        // Low obstacles catch the legs: face-plant forward
        dog.position.y = Math.sin(Math.min(p, 1) * Math.PI) * 0.35;
        dog.position.z = -settle * 0.5;
        dog.rotation.set(-settle * (Math.PI / 2), 0, 0);
        break;
      }
      case 'flatten': {
        // Immovable object: pancake against it, then slide down
        const squash = 1 - settle * 0.72;
        dog.scale.set(1 + settle * 0.7, squash, 1 - settle * 0.45);
        dog.position.y = -settle * 0.18;
        dog.rotation.set(0, 0, 0);
        break;
      }
      case 'tangle': {
        // Nets and hoppers: wrapped up, wobbling in place
        dog.position.y = 0.1 * (1 - settle);
        dog.rotation.set(settle * 0.5, Math.sin(dt * 7) * 0.8, settle * 1.2);
        dog.scale.set(1 - settle * 0.2, 1 - settle * 0.15, 1 - settle * 0.2);
        break;
      }
      default: { // 'spinout'
        // Knocked sideways, spinning like a cartoon
        dog.position.y = Math.sin(Math.min(p, 1) * Math.PI) * 0.45;
        dog.rotation.set(0, settle * 6, settle * (Math.PI / 2));
        dog.position.z = settle * 0.5;
        break;
      }
    }
  }

  dog.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return { group: dog, animate };
}
