import * as THREE from 'three';

// Tiny pooled particle system: dust, bursts, wind streaks, tumbling planks.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.geo = new THREE.SphereGeometry(0.06, 6, 5);
    this.lineGeo = new THREE.BoxGeometry(0.035, 0.035, 1.2);
    this.plankGeo = new THREE.BoxGeometry(0.1, 0.05, 0.55);
    this._mats = new Map(); // shared material per color
  }

  _mat(color) {
    if (!this._mats.has(color)) {
      this._mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
    }
    return this._mats.get(color);
  }

  _spawn(pos, { color, count, speed, up, life, size, geo = this.geo, vel = null, gravity = 4.5, spin = 0 }) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, this._mat(color).clone());
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
      this.active.push({
        mesh, vel: v,
        life: 0,
        maxLife: life * (0.7 + Math.random() * 0.6),
        baseScale: s,
        gravity,
        rotVel: spin
          ? new THREE.Vector3(Math.random() * spin, Math.random() * spin, Math.random() * spin)
          : null,
      });
      this.scene.add(mesh);
    }
  }

  // Little dirt kicks behind the paws
  dust(pos) {
    this._spawn(pos, { color: 0xd8c49a, count: 2, speed: 0.7, up: 0.9, life: 0.45, size: 0.8 });
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

  // Splash into the river
  splash(pos) {
    this._spawn(pos, { color: 0x8fd3f4, count: 20, speed: 2.6, up: 3.2, life: 0.7, size: 1.2 });
    this._spawn(pos, { color: 0xffffff, count: 8, speed: 1.8, up: 2.6, life: 0.5, size: 0.8 });
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
      geo: this.plankGeo, spin: 8,
    });
    this._spawn(pos, { color: 0xcbb890, count: 10, speed: 2.4, up: 2.4, life: 0.6, size: 1 });
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
      p.mesh.material.opacity = 1 - t * t;
    }
  }
}
