import { Input } from './input.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const input = new Input(canvas);
const game = new Game(canvas, input);
window.__game = game; // debug/test handle

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp to avoid tab-switch jumps
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
