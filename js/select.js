import * as THREE from 'three';
import { BREEDS } from './config.js';
import { buildDog } from './dog.js';

const ORDER = Object.keys(BREEDS);

// A real character select: the actual in-game model on a turntable, wearing
// whatever cosmetics you own, rather than a row of text buttons.
export class CharacterSelect {
  constructor(container, getEquip) {
    this.container = container;
    this.getEquip = getEquip;
    this.index = 0;
    this.visible = false;
    this.onChange = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    this.camera.position.set(0, 1.5, 5.2);
    this.camera.lookAt(0, 0.85, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6a6a80, 1.15));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa8c8ff, 0.55);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);

    // Turntable disc so the model doesn't float in a void
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.6, 0.16, 28),
      new THREE.MeshLambertMaterial({ color: 0x6b5a44, flatShading: true })
    );
    disc.position.y = -0.08;
    this.scene.add(disc);

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.model = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const size = this.container.clientWidth || 260;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  _build() {
    if (this.model) this.turntable.remove(this.model.group);
    this.model = buildDog(ORDER[this.index], this.getEquip());
    this.turntable.add(this.model.group);
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

  hide() {
    this.visible = false;
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
    if (this._spinStart === null) this._spinStart = t;
    // Models are built facing -Z (away from camera) for gameplay, so start
    // the turntable half-turned to greet the player face-on, then drift.
    this.turntable.rotation.y = Math.PI + (t - this._spinStart) * 0.5;
    // Idle run-in-place so you can see the character actually move
    this.model?.animate(t, 0.35, 'running', 0);
    this.renderer.render(this.scene, this.camera);
  }
}
