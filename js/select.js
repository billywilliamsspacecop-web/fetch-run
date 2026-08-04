import * as THREE from 'three';
import { BREEDS, TRAILS } from './config.js';
import { buildDog } from './dog.js';
import { buildChase } from './squirrel.js';
import { FX } from './fx.js';

const ORDER = Object.keys(BREEDS);

// A lit turntable in a DOM box. Both the character select and the shop
// preview are this plus a rule for what to put on it, so they share lighting,
// framing and the idle animation rather than drifting apart.
class Turntable {
  constructor(container, { disc = true, fov = 38, camZ = 5.2, lookY = 0.85 } = {}) {
    this.container = container;
    this.visible = false;
    this.model = null;
    this._spinStart = null;
    this._lastT = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 40);
    this.camera.position.set(0, 1.5, camZ);
    this.camera.lookAt(0, lookY, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6a6a80, 1.15));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa8c8ff, 0.55);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);

    if (disc) {
      // Turntable disc so the model doesn't float in a void
      const d = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.6, 0.16, 28),
        new THREE.MeshLambertMaterial({ color: 0x6b5a44, flatShading: true })
      );
      d.position.y = -0.08;
      this.scene.add(d);
    }

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const size = this.container.clientWidth || 260;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  _setModel(model, scale = 1) {
    if (this.model) this.turntable.remove(this.model.group);
    this.model = model;
    this.model.group.scale.setScalar(scale);
    this.turntable.add(this.model.group);
  }

  hide() {
    this.visible = false;
  }

  // Returns seconds since the last update, for anything that needs real dt.
  _tick(t) {
    const dt = this._lastT === null ? 0 : Math.min(t - this._lastT, 0.05);
    this._lastT = t;
    return dt;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// A real character select: the actual in-game model on a turntable, wearing
// whatever cosmetics you own, rather than a row of text buttons.
export class CharacterSelect extends Turntable {
  constructor(container, getEquip) {
    super(container);
    this.getEquip = getEquip;
    this.index = 0;
    this.onChange = null;
  }

  _build() {
    this._setModel(buildDog(ORDER[this.index], this.getEquip()));
  }

  show(breedKey) {
    const i = ORDER.indexOf(breedKey);
    this.index = i >= 0 ? i : 0;
    this.visible = true;
    this._spinStart = null; // restart the turntable facing the camera
    this._resize();
    this._build();
    this._emit();
  }

  step(dir) {
    this.index = (this.index + dir + ORDER.length) % ORDER.length;
    this._build();
    this._emit();
  }

  // Re-dress the current model (called when cosmetics change in the shop)
  refresh() {
    if (this.visible) this._build();
  }

  get currentKey() {
    return ORDER[this.index];
  }

  _emit() {
    const breed = BREEDS[this.currentKey];
    this.onChange?.(this.currentKey, breed);
  }

  update(t) {
    if (!this.visible) return; // don't burn battery while hidden
    this._tick(t);
    if (this._spinStart === null) this._spinStart = t;
    // Models are built facing -Z (away from camera) for gameplay, so start
    // the turntable half-turned to greet the player face-on, then drift.
    this.turntable.rotation.y = Math.PI + (t - this._spinStart) * 0.5;
    // Idle run-in-place so you can see the character actually move
    this.model?.animate(t, 0.35, 'running', 0);
    this.render();
  }
}

// The same turntable inside the shop, showing whatever chip you last tapped.
// The point is being able to SEE a cosmetic before spending on it — a colour
// dot and a word never told you what "Celestial" actually looked like.
export class ShopPreview extends Turntable {
  constructor(container, getBreed) {
    // No disc, and framed tighter than the character select: this box is half
    // the size, and at the shared framing the turntable disc ate most of it
    // and left the cosmetic — the entire point — too small to judge.
    super(container, { disc: false, fov: 30, camZ: 4.3, lookY: 1.0 });
    this.getBreed = getBreed;
    this.kind = 'dog';
    // Its own particle system so paw trails can be previewed too — those are
    // pure motion and a static swatch says nothing about them.
    this.fx = new FX(this.scene);
    this.trailLook = TRAILS.dust;
    this._trailTimer = 0;
  }

  show() {
    this.visible = true;
    this._spinStart = null;
    this._resize();
  }

  // equip: the full equipped set with the previewed item already layered in.
  // cat tells us WHAT is being shown, which decides dog vs chase creature.
  preview(cat, equip) {
    this.visible = true;
    this._resize();
    this.trailLook = TRAILS[equip.trail] ?? TRAILS.dust;
    if (cat === 'chase') {
      this.kind = 'chase';
      // Chase creatures are roughly a third the runner's height, so they need
      // scaling up or they sit as a speck in the middle of the frame.
      this._setModel(buildChase(equip.chase), 1.9);
    } else {
      this.kind = 'dog';
      this._setModel(buildDog(this.getBreed(), equip));
    }
  }

  update(t) {
    if (!this.visible) return;
    const dt = this._tick(t);
    if (this._spinStart === null) this._spinStart = t;
    this.turntable.rotation.y = Math.PI + (t - this._spinStart) * 0.55;
    if (this.kind === 'chase') this.model?.animate(t, 0.4);
    else this.model?.animate(t, 0.35, 'running', 0);

    // Puff the equipped trail at the model's feet. Emitted in scene space
    // rather than parented to the turntable, so the particles stay put and
    // drift while the model spins past them.
    this._trailTimer -= dt;
    if (this._trailTimer <= 0) {
      this.fx.dust(new THREE.Vector3(0, 0.18, 0.42), this.trailLook);
      this._trailTimer = 0.1;
    }
    this.fx.update(dt);
    this.render();
  }
}
