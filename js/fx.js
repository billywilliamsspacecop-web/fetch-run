import * as THREE from 'three';

// Tiny pooled particle system: dust kicks, collect bursts, wipeout puffs.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.geo = new THREE.SphereGeometry(0.06, 6, 5);
    this._mats = new Map(); // shared material per color
  }

  _mat(color) {
    if (!this._mats.has(color)) {
      this._mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
    }
    return this._mats.get(color);
  }

  _spawn(pos, { color, count, speed, up, life, size }) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this._mat(color).clone());
      mesh.position.copy(pos);
      const s = size * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(s);
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.4 + Math.random() * 0.6);
      this.active.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * r, up * (0.5 + Math.random()), Math.sin(a) * r),
        life: 0,
        maxLife: life * (0.7 + Math.random() * 0.6),
        baseScale: s,
      });
      this.scene.add(mesh);
    }
  }

  // Little dirt kicks behind the dog's paws
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

  update(dt) {
    for (const p of [...this.active]) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.active = this.active.filter((x) => x !== p);
        continue;
      }
      p.vel.y -= 4.5 * dt; // light gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.baseScale * (1 - t * 0.6));
      p.mesh.material.opacity = 1 - t * t;
    }
  }
}
