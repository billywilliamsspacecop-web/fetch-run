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

  // The tail is the squirrel's whole silhouette, so it gets real shaping:
  // a BROAD, FLAT plume that sweeps up and arcs forward over the back,
  // flaring widest through the middle and tapering to a point. Segments are
  // wide-and-thin ellipsoids, not spheres — a stack of round balls on a stem
  // reads as, well, not a tail.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.26, 0.2);
  // A squirrel's tail is a FLAT vertical fan — broad side-to-side, thin
  // front-to-back (roughly 4:1) — held up like a flag and curling forward.
  // Round cross-sections stack into a cone/beehive instead, which is the
  // shape to avoid. Widest about two-thirds up, tapering to a point.
  // Few, LARGE, heavily-overlapping forms — many small stacked segments read
  // as horizontal ribbing (a beehive/pinecone) from directly behind, which is
  // exactly the angle the player sees. Three broad overlapping lobes plus a
  // tip give a smooth continuous fan instead.
  // Streams BACKWARD, the way a sprinting squirrel actually carries it,
  // rather than flagged straight up. Held upright it filled the screen from
  // the player's behind-view and hid the animal entirely; trailing back it
  // foreshortens naturally and the squirrel stays readable. The fan is still
  // flat — tall and thin — it just lies along the direction of travel.
  const tailSpine = [
    // pos (z = behind),      width, HEIGHT of fan, thin depth
    { pos: [0, 0.16, 0.12], s: [0.10, 0.16, 0.14] }, // root at the rump
    { pos: [0, 0.26, 0.30], s: [0.13, 0.28, 0.22] },
    { pos: [0, 0.34, 0.50], s: [0.14, 0.34, 0.24] }, // widest part of the plume
    { pos: [0, 0.40, 0.70], s: [0.12, 0.28, 0.20] },
    { pos: [0, 0.44, 0.86], s: [0.08, 0.17, 0.12] }, // tapered tip
  ];
  tailSpine.forEach((seg, i) => {
    const light = i >= 2; // sun-bleached toward the tip, like the real thing
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 11), light ? furLight : fur);
    tuft.position.set(...seg.pos);
    tuft.scale.set(...seg.s);
    tuft.rotation.x = 0.2 + i * 0.06; // gentle upward sweep
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

// A self-lit material for the otherworldly quarry — they should glow a little
// against a dark hell/space deck rather than going to silhouette.
const litMat = (color, emissive = color, intensity = 0.9) =>
  new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true });

function buildUfoModel() {
  // Hovers rather than runs, so it reuses the butterfly's `flying` path.
  const u = new THREE.Group();
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.1, 16), mat(0x9aa4b0));
  saucer.position.y = 0.5;
  u.add(saucer);
  const underside = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 16), mat(0x77818d));
  underside.position.y = 0.38;
  underside.rotation.x = Math.PI;
  u.add(underside);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    litMat(0x8fe8d8, 0x4fd8c0, 0.5)
  );
  dome.position.y = 0.55;
  u.add(dome);
  // A little pilot in the dome, so it reads as someone fleeing rather than a prop
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat(0x6fd06a));
  pilot.position.y = 0.58;
  u.add(pilot);
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), litMat(0xffd54f, 0xffc030, 1));
    bulb.position.set(Math.cos(a) * 0.26, 0.45, Math.sin(a) * 0.26);
    u.add(bulb);
    lights.push(bulb);
  }
  // `wings` is what the flying animation path drives; the UFO has no wings, so
  // it gets two throwaway groups and the beam does the visible motion instead.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.42, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x8fe8d8, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    })
  );
  beam.position.y = 0.16;
  u.add(beam);
  u.userData.beam = beam;
  return { root: u, wings: [new THREE.Group(), new THREE.Group()], flying: true, hover: true };
}

function buildCherubModel() {
  const c = new THREE.Group();
  const skin = mat(0xf0c8a0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 11), skin);
  body.scale.set(0.95, 0.85, 1);
  body.position.y = 0.46;
  c.add(body);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.24, 12), mat(0xf7f2e4));
  robe.position.y = 0.36;
  c.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 11), skin);
  head.position.set(0, 0.72, -0.06);
  c.add(head);
  const curls = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - 0.3;
    const curl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0xe8c96a));
    curl.position.set(Math.cos(a) * 0.14, 0.85, Math.sin(a) * 0.1 - 0.02);
    curls.add(curl);
  }
  c.add(curls);
  const dark = mat(0x2b2323);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dark);
    eye.position.set(side * 0.08, 0.73, -0.24);
    c.add(eye);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 16), litMat(0xffe9a0, 0xffd97a, 1));
  halo.rotation.x = Math.PI / 2 - 0.2;
  halo.position.set(0, 1.0, 0);
  c.add(halo);
  // Feathered wings, driven by the flying animation
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26 - i * 0.05, 0.11), mat(0xfaf7ef));
      f.position.set(side * (0.1 + i * 0.09), -i * 0.05, 0.02);
      f.rotation.z = side * (0.2 + i * 0.18);
      wing.add(f);
    }
    wing.position.set(0, 0.52, 0.12);
    c.add(wing);
    wings.push(wing);
  }
  return { root: c, wings, flying: true };
}

function buildImpModel() {
  // Runs on four legs like the squirrel, so it slots into the standard path.
  const i = new THREE.Group();
  const skin = mat(0xc4442f);
  const skinDark = mat(0x8f2f20);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 11), skin);
  body.scale.set(0.85, 0.85, 1.1);
  body.position.y = 0.3;
  i.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xe07a5a));
  belly.scale.set(0.7, 0.7, 0.6);
  belly.position.set(0, 0.24, -0.15);
  i.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 11), skin);
  head.position.set(0, 0.54, -0.2);
  i.add(head);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 7), mat(0x2f1e1a));
    horn.position.set(side * 0.1, 0.7, -0.16);
    horn.rotation.z = side * 0.42;
    i.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), litMat(0xffd02a, 0xffa000, 1));
    eye.position.set(side * 0.08, 0.57, -0.34);
    i.add(eye);
    // Bat ears
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 5), skinDark);
    ear.position.set(side * 0.19, 0.6, -0.14);
    ear.rotation.z = side * 0.9;
    i.add(ear);
  }
  const grin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.02), mat(0xf7f0e0));
  grin.position.set(0, 0.47, -0.37);
  i.add(grin);

  const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.18, 8);
  const legs = [];
  for (const [x, z] of [[-0.1, -0.12], [0.1, -0.12], [-0.1, 0.14], [0.1, 0.14]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.18, z);
    const leg = new THREE.Mesh(legGeo, skinDark);
    leg.position.y = -0.09;
    pivot.add(leg);
    i.add(pivot);
    legs.push(pivot);
  }

  // Barbed tail — the animation swings this the way it swings a squirrel's
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.34, 0.22);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.34, 8), skinDark);
  tail.position.set(0, 0.1, 0.08);
  tail.rotation.x = -0.6;
  tailPivot.add(tail);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), mat(0x2f1e1a));
  barb.position.set(0, 0.24, 0.2);
  barb.rotation.x = -0.9;
  tailPivot.add(barb);
  i.add(tailPivot);

  return { root: i, legs, tailPivot, flying: false };
}

export function buildChase(id = 'squirrel') {
  const model =
    id === 'rabbit' ? buildRabbitModel() :
    id === 'butterfly' ? buildButterflyModel() :
    id === 'ufo' ? buildUfoModel() :
    id === 'cherub' ? buildCherubModel() :
    id === 'imp' ? buildImpModel() :
    buildSquirrelModel();

  model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  function animate(t, speed) {
    const freq = 11 + speed * 26;
    const phase = t * freq;
    if (model.hover) {
      // A saucer has nothing to flap. It spins and drifts instead — the
      // wing path below would just jitter its two dummy groups.
      model.root.position.y = 0.3 + Math.sin(t * 3.4) * 0.1;
      model.root.rotation.y = t * 1.6;
      model.root.rotation.z = Math.sin(t * 1.9) * 0.08;
      return;
    }
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

  // Riding in the little ship (space stage): the quarry sits still too, so the
  // pair read as flying rather than sprinting mid-air. Everything set here is
  // rewritten by animate(), so the run cycle resumes on its own after.
  function ridePose(t) {
    model.root.position.y = 0.08;
    model.root.rotation.x = 0;
    if (model.hover) {
      // Keep it turning — a saucer sitting dead still in a cockpit is worse
      // than one that's clearly still under power.
      model.root.rotation.y = t * 1.0;
      model.root.rotation.z = 0;
      return;
    }
    if (model.flying) {
      // The butterfly still has to beat its wings — it has no other way to
      // stay up, and holding them flat looks dead rather than seated.
      model.root.rotation.z = Math.sin(t * 1.3) * 0.06;
      const flap = Math.sin(t * 18);
      model.wings[0].rotation.z = 0.4 + flap * 0.45;
      model.wings[1].rotation.z = -0.4 - flap * 0.45;
      return;
    }
    // Only touch channels the run cycle rewrites — rotation.z is NOT one of
    // them for a four-legged quarry, so leaning here would stick forever.
    for (const leg of model.legs) leg.rotation.x = 0.12;
    model.tailPivot.rotation.x = -0.1;
    model.tailPivot.rotation.z = Math.sin(t * 1.5) * 0.14;
    if (model.ears) {
      model.ears[0].rotation.x = -0.15;
      model.ears[1].rotation.x = -0.15;
    }
  }

  return { group: model.root, animate, ridePose };
}

// Back-compat alias
export function buildSquirrel() {
  return buildChase('squirrel');
}
