// DOM overlay screens: menu, HUD, death. Pure presentation.
export class UI {
  constructor(input) {
    this.input = input;
    this.el = {};
    for (const id of [
      'menu', 'hud', 'death',
      'menu-best', 'scheme-hint', 'btn-tap', 'btn-swipe', 'btn-gsp', 'btn-golden',
      'hud-distance', 'hud-balls', 'hud-closecalls', 'stage-banner',
      'death-distance', 'death-best', 'death-stats', 'death-prompt',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.onScreenTap = null;   // set by main; menu/death taps land here
    this.onBreedChange = null; // set by main; rebuilds the dog mesh

    this.el['btn-tap'].addEventListener('click', (e) => {
      e.stopPropagation();
      this._setScheme('tap');
    });
    this.el['btn-swipe'].addEventListener('click', (e) => {
      e.stopPropagation();
      this._setScheme('swipe');
    });
    this.el['btn-gsp'].addEventListener('click', (e) => {
      e.stopPropagation();
      this._setBreed('gsp');
    });
    this.el['btn-golden'].addEventListener('click', (e) => {
      e.stopPropagation();
      this._setBreed('golden');
    });
    this._breedButtons(localStorage.getItem('fetchrun.breed') || 'gsp');
    this.el.menu.addEventListener('click', () => this.onScreenTap?.());
    this.el.death.addEventListener('click', () => this.onScreenTap?.());

    this._setScheme(input.scheme);
    this.showMenu();
  }

  _setBreed(breed) {
    localStorage.setItem('fetchrun.breed', breed);
    this._breedButtons(breed);
    this.onBreedChange?.(breed);
  }

  _breedButtons(breed) {
    this.el['btn-gsp'].classList.toggle('active', breed === 'gsp');
    this.el['btn-golden'].classList.toggle('active', breed === 'golden');
  }

  _setScheme(scheme) {
    this.input.setScheme(scheme);
    this.el['btn-tap'].classList.toggle('active', scheme === 'tap');
    this.el['btn-swipe'].classList.toggle('active', scheme === 'swipe');
    this.el['scheme-hint'].textContent =
      scheme === 'tap'
        ? 'Tap a lane — the dog goes there'
        : 'Swipe left/right — one lane per swipe';
  }

  _show(which) {
    for (const id of ['menu', 'hud', 'death']) {
      this.el[id].classList.toggle('hidden', id !== which);
    }
  }

  showMenu(best = Number(localStorage.getItem('fetchrun.best') || 0)) {
    this._show('menu');
    this.el['menu-best'].classList.toggle('hidden', best <= 0);
    this.el['menu-best'].textContent = `Best: ${best}m`;
  }

  showRunning() {
    this._show('hud');
    this.el['hud-closecalls'].textContent = '';
    this.el['stage-banner'].classList.add('hidden');
  }

  showStageBanner(stage) {
    const el = this.el['stage-banner'];
    el.textContent = `STAGE ${stage}`;
    el.classList.remove('hidden');
    // Restart the pop animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  updateHUD(game) {
    this.el['hud-distance'].textContent = `${Math.floor(game.distance)}m`;
    this.el['hud-balls'].textContent = `🎾 ${game.balls}`;
    this.el['hud-closecalls'].textContent =
      game.nearMisses > 0 ? `close calls: ${game.nearMisses}` : '';
  }

  showDeath(game) {
    this._show('death');
    const d = Math.floor(game.distance);
    this.el['death-distance'].textContent = `${d}m`;
    this.el['death-best'].textContent = game.isNewBest ? 'NEW BEST!' : `best: ${game.best}m`;
    this.el['death-stats'].textContent =
      `stage ${game.stage}   time: ${game.time.toFixed(1)}s   🎾 ${game.balls}   close calls: ${game.nearMisses}`;
    this.el['death-prompt'].classList.add('hidden');
  }

  showRestartPrompt() {
    this.el['death-prompt'].classList.remove('hidden');
  }
}
