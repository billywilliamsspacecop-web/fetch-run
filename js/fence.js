import * as THREE from 'three';
import { CONFIG } from './config.js';
import { lambert } from './props.js';

// The intro fence: spans the lane band, smashed through at the end of the
// chase short. Pickets hug the globe's curve so it sits flush on the surface.
const HALF = 0.2; // lateral half-width in radians (covers all lanes + margin)

export function makeFence() {
  const R = CONFIG.planetRadius;
  const g = new THREE.Group();
  const wood = lambert(0xb08a5a);

  const step = 0.028;
  for (let a = -HALF; a <= HALF + 0.001; a += step) {
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.06), wood);
    picket.position.set(Math.sin(a) * R, Math.cos(a) * R - R + 0.42, 0);
    picket.rotation.z = -a;
    g.add(picket);
  }
  for (const railY of [0.28, 0.62]) {
    for (let a = -HALF; a <= HALF - 0.05 + 0.001; a += 0.05) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05 + 0.05, 0.09, 0.05), wood);
      const mid = a + 0.025;
      rail.position.set(Math.sin(mid) * R, Math.cos(mid) * R - R + railY, 0.05);
      rail.rotation.z = -mid;
      g.add(rail);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
