import * as THREE from 'three';
import { CONFIG, TRAILS, POWER_AURA } from './config.js';

// Tiny pooled particle system: dust, bursts, wind streaks, tumbling planks.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.geo = new THREE.SphereGeometry(0.06, 6, 5);
    this.lineGeo = new THREE.BoxGeometry(0.035, 0.035, 1.2);
    // The trail's streaks are a separate, chunkier bar than the Zoomies wind
    // lines: those are meant to read as thin air rushing past, these are meant
    // to read as a ribbon you're leaving behind.
    this.trailGeo = new THREE.BoxGeometry(0.1, 0.06, 1.9);
    this.plankGeo = new THREE.BoxGeometry(0.1, 0.05, 0.55);
    this.shardGeo = new THREE.BoxGeometry(0.18, 0.22, 0.015); // flat, like glass
    this._mats = new Map(); // shared material per color
  }

  _mat(color) {
    if (!this._mats.has(color)) {
      this._mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
    }
    return this._mats.get(color);
  }

  // Particles get the same inverted-hull line every prop carries, so the trail
  // behind the paws reads as part of the same drawing rather than a spray of
  // untraced blobs. Two departures from props.js addOutline:
  //   * the shell is scaled RELATIVELY, not to a constant world thickness —
  //     a particle shrinks over its life and the line should shrink with it
  //   * its material is per-particle and transparent, because the shell has to
  //     fade out in step with what it's outlining. An opaque line around a
  //     particle that has faded to nothing is just a floating dark husk.
  _shell(mesh, thickness) {
    const s = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
      color: 0x21203a, side: THREE.BackSide, transparent: true,
    }));
    s.scale.setScalar(1 + thickness);
    mesh.add(s);
    return s;
  }

  // `colors` (a list) wins over `color`: each particle picks its own, which is
  // what turns a single-tone puff into a trail that shimmers.
  // `drift` pushes particles backward down the track (+z is behind the
  // runner), stretching an emission into a streak instead of a pile.
  _spawn(pos, {
    color, colors = null, count, speed, up, life, size, geo = this.geo,
    vel = null, gravity = 4.5, spin = 0, drift = 0, alpha = 1, outline = 0,
  }) {
    for (let i = 0; i < count; i++) {
      const tint = colors ? colors[Math.floor(Math.random() * colors.length)] : color;
      const mesh = new THREE.Mesh(geo, this._mat(tint).clone());
      mesh.position.copy(pos);
      const s = size * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(s);
      let v;
      if (vel) {
        v = vel.clone();
        v.x += (Math.random() - 0.5) * speed;
        v.y += (Math.random() - 0.5) * speed * 0.5;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = speed * (0.4 + Math.random() * 0.6);
        v = new THREE.Vector3(Math.cos(a) * r, up * (0.5 + Math.random()), Math.sin(a) * r);
      }
      if (drift) v.z += drift * (0.55 + Math.random() * 0.9);
      this.active.push({
        mesh, vel: v,
        shell: outline ? this._shell(mesh, outline) : null,
        life: 0,
        maxLife: life * (0.7 + Math.random() * 0.6),
        baseScale: s,
        alpha,
        gravity,
        rotVel: spin
          ? new THREE.Vector3(Math.random() * spin, Math.random() * spin, Math.random() * spin)
          : null,
      });
      this.scene.add(mesh);
    }
  }

  // The trail behind the paws. The look comes from the equipped trail cosmetic
  // (CONFIG TRAILS), so this is the same call site it always was.
  //
  // Two layers, because one never reads as a trail: a spread of drifting
  // particles for body, plus an occasional stretched streak thrown hard
  // backward for length. The streak is what you actually see at speed — the
  // particles are only the texture inside it.
  dust(pos, look = TRAILS.dust) {
    // Outlined only on Extra detail. Every shell is a second mesh AND a second
    // material on something there are ~70 of at once, which measured at about
    // 1.7ms a frame — real money for a line on a particle that lives half a
    // second. Thin when it is on: the dust spheres are 6-segment and a few
    // centimetres across, so a prop-weight line (0.3) turned each into a dark
    // hexagon ring and the trail read as a chain of debug wireframes.
    const outline = CONFIG.extraDetail ? (look.outline ?? 0.12) : 0;
    this._spawn(pos, { ...look, outline });
    if (look.streak) {
      // Every other tick, not every one. At every tick the bars overlap into a
      // solid slab and the individual particles stop being visible inside it.
      this._streakToggle = !this._streakToggle;
      if (this._streakToggle) {
        // A pair, offset either side of the centreline, so the ribbon has
        // width to it and reads as coming off both sets of paws.
        for (const side of [-1, 1]) {
          this._spawn(pos, {
            color: look.streak, count: 1, speed: 0.5,
            life: look.streakLife ?? 0.4, size: 0.8,
            // Half-transparent from birth. At full opacity the pair stopped
            // being a plume and became two solid rails painted on the grass,
            // and the particles inside them disappeared.
            alpha: 0.5, outline: CONFIG.extraDetail ? 0.18 : 0,
            geo: this.trailGeo, gravity: 0,
            vel: new THREE.Vector3(side * (0.3 + Math.random() * 0.55), 0.3, 8.5),
          });
        }
      }
    }
  }

  // The rings model's signature moment: a hit knocks every power off you at
  // once. Each one bursts outward in its OWN colour, so what you lost is
  // legible in the half second before it's gone — the same read as scattering
  // rings, and the reason the hit registers as "I lost my stack" rather than
  // as an unexplained flash.
  powerBurst(pos, lost = {}) {
    const colors = Object.keys(lost)
      .map((type) => POWER_AURA[type])
      .filter(Boolean);
    if (!colors.length) return;
    for (const color of colors) {
      this._spawn(pos, {
        color, count: 9, speed: 3.6, up: 3.2, life: 0.85, size: 0.9,
        gravity: 3.5, outline: CONFIG.extraDetail ? 0.14 : 0,
      });
    }
    this._spawn(pos, { color: 0xffffff, count: 8, speed: 2.2, up: 2.4, life: 0.4, size: 0.8 });
  }

  // Blast Off exhaust — fired downward from the airborne runner
  rocketExhaust(pos) {
    this._spawn(pos, { color: 0xffa62a, count: 3, speed: 1.1, up: -1.6, life: 0.4, size: 1, gravity: -2 });
    this._spawn(pos, { color: 0xdff2ff, count: 2, speed: 1.4, up: -0.8, life: 0.3, size: 0.7, gravity: -1 });
  }

  // An obstacle burning away under Scorch
  scorch(pos) {
    this._spawn(pos, { color: 0xff7a2a, count: 14, speed: 2.6, up: 3.0, life: 0.55, size: 1.1, gravity: 2 });
    this._spawn(pos, { color: 0x3a2420, count: 8, speed: 1.8, up: 1.6, life: 0.7, size: 0.9 });
  }

  // Tennis-ball pickup pop
  collect(pos) {
    this._spawn(pos, { color: 0xe8f77a, count: 12, speed: 2.2, up: 2.2, life: 0.5, size: 1 });
    this._spawn(pos, { color: 0xffffff, count: 4, speed: 1.2, up: 1.6, life: 0.35, size: 0.7 });
  }

  // Wipeout puff
  crash(pos) {
    this._spawn(pos, { color: 0xcbb890, count: 18, speed: 2.8, up: 2.6, life: 0.7, size: 1.3 });
    this._spawn(pos, { color: 0xffffff, count: 6, speed: 1.6, up: 2.0, life: 0.5, size: 0.9 });
  }

  // Zoomies wind streaks: fly backward past the runner
  speedLine(pos) {
    this._spawn(pos, {
      color: 0xffffff, count: 1, speed: 1.2, life: 0.28, size: 1,
      geo: this.lineGeo, vel: new THREE.Vector3(0, 0.5, 9), gravity: 0,
    });
  }

  // Cyan glints on balls being warped in by the magnet
  sparkle(pos) {
    this._spawn(pos, { color: 0x9be8ff, count: 2, speed: 0.9, up: 0.8, life: 0.3, size: 0.6 });
  }

  // Fence explosion when the chase smashes through
  plankBurst(pos) {
    this._spawn(pos, {
      color: 0x9c6b3f, count: 12, speed: 3.4, up: 3.6, life: 1.0, size: 1,
      geo: this.plankGeo, spin: 8, outline: 0.22,
    });
    this._spawn(pos, { color: 0xcbb890, count: 10, speed: 2.4, up: 2.4, life: 0.6, size: 1 });
  }

  // Bursting back out of the house through the patio glass. Shards tumble
  // fast and fall hard — the plank burst is too woody and floaty for glass.
  glassBurst(pos) {
    this._spawn(pos, {
      color: 0xbfe6f2, count: 14, speed: 4.2, up: 3.2, life: 0.9, size: 1,
      geo: this.shardGeo, spin: 12, gravity: 7, outline: 0.16,
    });
    this._spawn(pos, { color: 0xffffff, count: 10, speed: 2.8, up: 2.6, life: 0.45, size: 0.7 });
  }

  update(dt) {
    for (const p of [...this.active]) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.active = this.active.filter((x) => x !== p);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.rotVel) {
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        p.mesh.rotation.z += p.rotVel.z * dt;
      }
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.baseScale * (1 - t * 0.6));
      p.mesh.material.opacity = (1 - t * t) * p.alpha;
      if (p.shell) p.shell.material.opacity = p.mesh.material.opacity;
    }
  }
}
