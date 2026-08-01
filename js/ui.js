// DOM overlay screens: menu, HUD, death. Pure presentation.
export class UI {
  constructor(input) {
    this.input = input;
    this.el = {};
    for (const id of [
      'menu', 'hud', 'death', 'intro-hint',
      'menu-best', 'menu-bank', 'scheme-hint',
      'btn-tap', 'btn-swipe', 'btn-gsp', 'btn-golden', 'btn-cat',
      'hud-distance', 'hud-balls', 'hud-closecalls', 'hud-power', 'hud-life', 'stage-banner',
      'death-title', 'death-distance', 'death-best', 'death-actions', 'btn-again', 'btn-home',
      'd-stage', 'd-time', 'd-speed', 'd-balls', 'd-close',
      'l-runs', 'l-dist', 'l-balls', 'recent-runs',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.onScreenTap = null;   // set by main; menu taps land here
    this.onBreedChange = null; // set by main; rebuilds the character mesh
    this.onRunAgain = null;
    this.onHome = null;

    this.el['btn-again'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRunAgain?.();
    });
    this.el['btn-home'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onHome?.();
    });

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
    this.el['btn-cat'].addEventListener('click', (e) => {
      e.stopPropagation();
      this._setBreed('cat');
    });
    this._breedButtons(localStorage.getItem('fetchrun.breed') || 'gsp');
    this.el.menu.addEventListener('click', () => this.onScreenTap?.());
    this.el['intro-hint'].addEventListener('click', () => this.onScreenTap?.());

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
    this.el['btn-cat'].classList.toggle('active', breed === 'cat');
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
    for (const id of ['menu', 'hud', 'death', 'intro-hint']) {
      this.el[id].classList.toggle('hidden', id !== which);
    }
  }

  showIntro() {
    this._show('intro-hint');
  }

  // ---- persistent stats ------------------------------------------------

  _loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  stats() {
    return this._loadJSON('fetchrun.stats', {
      runs: 0, totalDist: 0, totalBalls: 0, bestCloseCalls: 0,
    });
  }

  recordRun(game) {
    const s = this.stats();
    s.runs += 1;
    s.totalDist += Math.floor(game.distance);
    s.totalBalls += game.balls;
    s.bestCloseCalls = Math.max(s.bestCloseCalls, game.nearMisses);
    localStorage.setItem('fetchrun.stats', JSON.stringify(s));

    const recent = this._loadJSON('fetchrun.recent', []);
    recent.unshift({ d: Math.floor(game.distance), stage: game.stage, balls: game.balls });
    localStorage.setItem('fetchrun.recent', JSON.stringify(recent.slice(0, 5)));
  }

  // ---- screens ---------------------------------------------------------

  showMenu(best = Number(localStorage.getItem('fetchrun.best') || 0)) {
    this._show('menu');
    this.el['menu-best'].classList.toggle('hidden', best <= 0);
    this.el['menu-best'].textContent = `Best: ${best}m`;
    const bank = this.stats().totalBalls;
    this.el['menu-bank'].classList.toggle('hidden', bank <= 0);
    this.el['menu-bank'].textContent = `🎾 ${bank} banked`;
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
    // Quick white checkpoint flash
    const flash = document.createElement('div');
    flash.id = 'flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  updateHUD(game) {
    this.el['hud-distance'].textContent = `${Math.floor(game.distance)}m`;
    this.el['hud-balls'].textContent = `🎾 ${game.balls}`;
    this.el['hud-closecalls'].textContent =
      game.nearMisses > 0 ? `close calls: ${game.nearMisses}` : '';
    const p = game.power;
    this.el['hud-power'].classList.toggle('hidden', !p);
    if (p) {
      const label = {
        zoomies: '🥏 ZOOMIES 2X',
        magnet: '🧲 MAGNET',
        goldbone: '🦴 2X SCORE',
        yarn: '🧶 BALL FRENZY',
      }[p.type];
      this.el['hud-power'].textContent = `${label} ${Math.ceil(p.timeLeft)}s`;
    }
    this.el['hud-life'].classList.toggle('hidden', !game.extraLife);
  }

  showDeath(game) {
    this._show('death');
    this.el['death-title'].textContent = game.deathCause === 'splash' ? 'SPLASH!' : 'WIPEOUT!';
    const d = Math.floor(game.distance);
    this.el['death-distance'].textContent = `${d}m`;
    this.el['death-best'].textContent = game.isNewBest ? 'NEW BEST!' : `best: ${game.best}m`;

    this.el['d-stage'].textContent = game.stage;
    this.el['d-time'].textContent = `${game.time.toFixed(1)}s`;
    this.el['d-speed'].textContent =
      `${Math.round(game.speed * 110 * 2.23694)} mph`;
    this.el['d-balls'].textContent = game.balls;
    this.el['d-close'].textContent = game.nearMisses;

    const s = this.stats();
    this.el['l-runs'].textContent = s.runs;
    this.el['l-dist'].textContent = `${s.totalDist.toLocaleString()}m`;
    this.el['l-balls'].textContent = s.totalBalls;

    const recent = this._loadJSON('fetchrun.recent', []);
    this.el['recent-runs'].innerHTML = recent
      .map((r, i) => `<div class="row${i === 0 ? ' latest' : ''}"><span>${r.d}m</span><b>stage ${r.stage} · 🎾 ${r.balls}</b></div>`)
      .join('');

    this.el['death-actions'].classList.add('hidden');
  }

  showRestartPrompt() {
    this.el['death-actions'].classList.remove('hidden');
  }
}
