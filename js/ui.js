import { COSMETICS } from './config.js';

// DOM overlay screens: menu, HUD, death, shop. Pure presentation + the
// tennis-ball economy (bank, unlocks, equipped cosmetics in localStorage).
export class UI {
  constructor(input) {
    this.input = input;
    this.el = {};
    for (const id of [
      'menu', 'hud', 'death', 'intro-hint', 'shop', 'paused', 'select',
      'menu-best', 'menu-bank',
      'btn-shop', 'btn-shop-close', 'shop-bank', 'shop-items',
      'btn-play', 'btn-characters', 'btn-select-done',
      'btn-prev', 'btn-next', 'select-name', 'select-desc', 'select-stage',
      'btn-pause', 'btn-resume', 'btn-pause-home',
      'hud-distance', 'hud-balls', 'hud-closecalls', 'hud-power', 'hud-life', 'stage-banner',
      'death-title', 'death-distance', 'death-best', 'death-actions', 'btn-again', 'btn-home',
      'd-stage', 'd-time', 'd-speed', 'd-balls', 'd-close',
      'l-runs', 'l-dist', 'l-balls', 'recent-runs',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.onScreenTap = null;   // set by main; menu taps land here
    this.onBreedChange = null; // set by main; rebuilds the character mesh
    this.onCosmeticsChange = null; // set by main; re-dresses runner / swaps chase
    this.onRunAgain = null;
    this.onHome = null;
    this.onPauseToggle = null; // set by main; pause button + Resume
    this.onHomeFromPause = null;
    this.onSelectOpen = null;  // set by main; drives the 3D character preview
    this.onSelectClose = null;
    this.onSelectStep = null;

    this.el['btn-pause'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPauseToggle?.();
    });
    this.el['btn-resume'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPauseToggle?.();
    });
    this.el['btn-pause-home'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onHomeFromPause?.();
    });

    // Migrate: spendable bank starts from lifetime balls collected pre-shop
    if (localStorage.getItem('fetchrun.bank') === null) {
      localStorage.setItem('fetchrun.bank', String(this.stats().totalBalls));
    }

    this.el['btn-shop'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.openShop();
    });
    this.el['btn-shop-close'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.shop.classList.add('hidden');
      this.showMenu();
    });
    this.el['shop-items'].addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      e.stopPropagation();
      this._shopTap(chip.dataset.cat, chip.dataset.id);
    });

    this.el['btn-again'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRunAgain?.();
    });
    this.el['btn-home'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onHome?.();
    });

    // Menu is now explicit buttons, not tap-anywhere, so PLAY can sit
    // alongside CHARACTERS and SHOP without them fighting each other.
    this.el['btn-play'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onScreenTap?.();
    });
    this.el['btn-characters'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSelect();
    });
    this.el['btn-select-done'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSelect();
    });
    this.el['btn-prev'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSelectStep?.(-1);
    });
    this.el['btn-next'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSelectStep?.(1);
    });
    this.el['intro-hint'].addEventListener('click', () => this.onScreenTap?.());

    this.showMenu();
  }

  // Called by the CharacterSelect as it cycles models
  setSelectInfo(key, breed) {
    localStorage.setItem('fetchrun.breed', key);
    this.el['select-name'].textContent = breed.label;
    this.el['select-desc'].textContent = breed.desc ?? '';
  }

  openSelect() {
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'shop']) {
      this.el[id].classList.add('hidden');
    }
    this.el.select.classList.remove('hidden');
    this.onSelectOpen?.(localStorage.getItem('fetchrun.breed') || 'gsp');
  }

  closeSelect() {
    this.el.select.classList.add('hidden');
    this.onSelectClose?.();
    this.showMenu();
  }

  _show(which) {
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'select']) {
      this.el[id].classList.toggle('hidden', id !== which);
    }
  }

  showIntro() {
    this._show('intro-hint');
    this.el['btn-pause'].classList.remove('hidden');
  }

  showPaused() {
    this.el.paused.classList.remove('hidden');
    this.el['btn-pause'].classList.add('hidden');
  }

  hidePaused() {
    this.el.paused.classList.add('hidden');
    this.el['btn-pause'].classList.remove('hidden');
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
    this._setBank(this.bank() + game.balls);

    const recent = this._loadJSON('fetchrun.recent', []);
    recent.unshift({ d: Math.floor(game.distance), stage: game.stage, balls: game.balls });
    localStorage.setItem('fetchrun.recent', JSON.stringify(recent.slice(0, 5)));
  }

  // ---- tennis-ball economy --------------------------------------------

  bank() {
    return Number(localStorage.getItem('fetchrun.bank') || 0);
  }

  _setBank(n) {
    localStorage.setItem('fetchrun.bank', String(n));
  }

  unlocks() {
    return this._loadJSON('fetchrun.unlocks', {
      collar: ['default'], hat: ['none'], chase: ['squirrel'],
    });
  }

  equip() {
    return this._loadJSON('fetchrun.equip', {
      collar: 'default', hat: 'none', chase: 'squirrel',
    });
  }

  openShop() {
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'select']) {
      this.el[id].classList.add('hidden');
    }
    this.el.shop.classList.remove('hidden');
    this._renderShop();
  }

  _shopTap(cat, id) {
    const item = COSMETICS[cat].find((i) => i.id === id);
    if (!item) return;
    const unlocks = this.unlocks();
    const equip = this.equip();
    if (!unlocks[cat].includes(id)) {
      if (this.bank() < item.price) return; // can't afford — chip shows price
      this._setBank(this.bank() - item.price);
      unlocks[cat].push(id);
      localStorage.setItem('fetchrun.unlocks', JSON.stringify(unlocks));
    }
    equip[cat] = id;
    localStorage.setItem('fetchrun.equip', JSON.stringify(equip));
    this._renderShop();
    this.onCosmeticsChange?.(equip);
  }

  // Visual preview per cosmetic — a colored swatch for collars (they have no
  // natural emoji), an emoji glyph for hats/chase since those map cleanly.
  static ICONS = {
    collar: {
      default: '#cfcfcf', sky: '#3aa8e0', gold: '#f5c842', neon: '#7cfc4f',
    },
    hat: { none: '🚫', party: '🎉', propeller: '🌀', crown: '👑' },
    chase: { squirrel: '🐿️', butterfly: '🦋', rabbit: '🐇' },
  };

  _chipIcon(cat, id) {
    if (cat === 'collar') {
      const color = UI.ICONS.collar[id] ?? '#cfcfcf';
      return `<div class="chip-icon collar-swatch" style="--swatch-color:${color}"></div>`;
    }
    return `<div class="chip-icon">${UI.ICONS[cat]?.[id] ?? '❔'}</div>`;
  }

  _renderShop() {
    this.el['shop-bank'].textContent = `🎾 ${this.bank()}`;
    const unlocks = this.unlocks();
    const equip = this.equip();
    const labels = { collar: 'COLLARS', hat: 'HATS', chase: 'CHASE' };
    this.el['shop-items'].innerHTML = Object.entries(COSMETICS)
      .map(([cat, items]) => {
        const chips = items
          .map((item) => {
            const owned = unlocks[cat].includes(item.id);
            const equipped = equip[cat] === item.id;
            // Not-yet-owned items show a darkened preview icon (a teaser of
            // what you're buying), regardless of whether you can afford it.
            const cls = `shop-chip${equipped ? ' equipped' : owned ? ' owned' : ' locked'}`;
            const sub = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `🎾 ${item.price}`;
            return `<button class="${cls}" data-cat="${cat}" data-id="${item.id}">${this._chipIcon(cat, item.id)}${item.label}<span>${sub}</span></button>`;
          })
          .join('');
        return `<p class="subhead">${labels[cat]}</p><div class="shop-row">${chips}</div>`;
      })
      .join('');
  }

  // ---- screens ---------------------------------------------------------

  showMenu(best = Number(localStorage.getItem('fetchrun.best') || 0)) {
    this._show('menu');
    this.el.shop.classList.add('hidden');
    this.el.paused.classList.add('hidden');
    this.el['btn-pause'].classList.add('hidden');
    this.el['menu-best'].classList.toggle('hidden', best <= 0);
    this.el['menu-best'].textContent = `Best: ${best}m`;
    const bank = this.bank();
    this.el['menu-bank'].classList.toggle('hidden', bank <= 0);
    this.el['menu-bank'].textContent = `🎾 ${bank} to spend`;
  }

  showRunning() {
    this._show('hud');
    this.el['hud-closecalls'].textContent = '';
    this.el['stage-banner'].classList.add('hidden');
    this.el['btn-pause'].classList.remove('hidden');
  }

  // themeLabel is set only when this checkpoint also enters a NEW themed
  // world, so the banner announces the level change rather than just a number.
  showStageBanner(stage, themeLabel = null) {
    const el = this.el['stage-banner'];
    el.innerHTML = themeLabel
      ? `STAGE ${stage}<span class="banner-sub">${themeLabel}</span>`
      : `STAGE ${stage}`;
    el.classList.toggle('with-theme', !!themeLabel);
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
    this.el['btn-pause'].classList.add('hidden');
    this.el['death-title'].textContent = 'WIPEOUT!';
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
