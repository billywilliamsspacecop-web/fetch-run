import { COSMETICS, SETTINGS } from './config.js';
import { icon, iconImg } from './icons.js';

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
      'shop-preview', 'shop-preview-stage', 'shop-preview-label',
      'settings', 'settings-items', 'btn-settings', 'btn-settings-close', 'btn-settings-reset',
      'btn-dev-off', 'dev-flag', 'countdown', 'countdown-num',
      'btn-play', 'btn-characters', 'btn-select-done',
      'btn-prev', 'btn-next', 'select-name', 'select-desc', 'select-stage',
      'btn-pause', 'btn-resume', 'btn-pause-home', 'btn-pause-settings', 'btn-mute',
      'hud-top', 'hud-distance', 'hud-balls', 'hud-bank', 'hud-closecalls', 'hud-power', 'hud-life', 'stage-banner',
      'death-title', 'death-distance', 'death-best', 'death-actions', 'btn-again', 'btn-home',
      'd-dist', 'd-stage', 'd-time', 'd-speed', 'd-balls', 'd-close',
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
    this.onMuteToggle = null;
    this.onShopPreview = null; // set by main; drives the shop's 3D preview
    this.onShopClose = null;   // set by main; parks the preview turntable

    // ?unlockall — everything owned, nothing charged. For looking at the
    // catalogue without grinding for it. Deliberately URL-driven so it can't
    // leak into a real save: drop the param and your actual unlocks are back,
    // untouched, because this never writes to localStorage.
    this.unlockAll = new URLSearchParams(location.search).has('unlockall');

    // Saved settings are applied BEFORE the Game is constructed (main.js makes
    // the UI first), so the very first run already honours them.
    this._applySavedSettings();
    // Menu only — settings are deliberately NOT reachable mid-run.
    this.el['btn-settings'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSettings();
    });
    // Settings can now be opened mid-run from the pause card, so DONE has to
    // go back where you came from. Returning to the menu from there would
    // silently end the run you were in the middle of.
    this.el['btn-settings-close'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.settings.classList.add('hidden');
      if (this._settingsFrom === 'pause') this.showPaused();
      else this.showMenu();
      this._settingsFrom = null;
    });
    this.el['btn-pause-settings'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSettings('pause');
    });
    this.el['btn-settings-reset'].addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem('fetchrun.settings');
      for (const s of SETTINGS) s.write(s.default);
      this._renderSettings();
      this.updateDevFlag();
    });
    // The hard stop. Invincible and Powerups-only have no natural end — they
    // run until something switches them off — so there's one button that
    // switches off everything under DEV TOOLS at once, no hunting.
    this.el['btn-dev-off'].addEventListener('click', (e) => {
      e.stopPropagation();
      for (const s of SETTINGS) if (s.dev) s.write(false);
      this._renderSettings();
      this.updateDevFlag();
    });
    // Input events fire continuously during a drag, which is what makes the
    // change land mid-run rather than on release.
    this.el['settings-items'].addEventListener('input', (e) => {
      const row = e.target.closest('[data-key]');
      if (!row) return;
      this._writeSetting(row.dataset.key, Number(e.target.value));
    });
    this.el['settings-items'].addEventListener('click', (e) => {
      const btn = e.target.closest('.setting-toggle');
      if (!btn) return;
      e.stopPropagation();
      const key = btn.closest('[data-key]').dataset.key;
      const s = SETTINGS.find((x) => x.key === key);
      this._writeSetting(key, !s.read());
      this._renderSettings();
      this.updateDevFlag();
    });

    this.el['btn-mute'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.setMuted(!this.onMuteToggle?.());
    });

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
      this.onShopClose?.();
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
      // Fullscreen has to be requested from inside a real user gesture, and
      // PLAY is the natural one. Fails harmlessly where it isn't supported
      // (notably iPhone Safari, which offers no fullscreen API at all).
      this._goFullscreen();
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

    this.updateDevFlag();
    this.showMenu();
  }

  _goFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      req?.call(el)?.catch?.(() => {});
    } catch {
      /* unsupported — the game just runs in the normal viewport */
    }
  }

  setMuted(muted) {
    // 3D-rendered speaker, not a font glyph
    this.el['btn-mute'].innerHTML = iconImg(muted ? 'soundOff' : 'soundOn', 'btn-icon');
    this.el['btn-mute'].classList.toggle('muted', muted);
  }

  // Called by the CharacterSelect as it cycles models
  setSelectInfo(key, breed) {
    localStorage.setItem('fetchrun.breed', key);
    this.el['select-name'].textContent = breed.label;
    this.el['select-desc'].textContent = breed.desc ?? '';
  }

  openSelect() {
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'shop', 'settings']) {
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

  // ---- settings ---------------------------------------------------------

  // Captured on first read so RESET has something to go back to, rather than
  // hardcoding the defaults a second time here and letting them drift.
  _applySavedSettings() {
    for (const s of SETTINGS) if (s.default === undefined) s.default = s.read();
    const saved = this._loadJSON('fetchrun.settings', {});
    // Dev tools are deliberately NOT restored, and any that a previous build
    // did persist are scrubbed on the way past. Leaving Invincible saved meant
    // it survived reloads with no visible cause — the run simply never ended
    // and nothing on screen said why.
    let dirty = false;
    for (const s of SETTINGS) {
      if (saved[s.key] === undefined) continue;
      if (s.dev) { delete saved[s.key]; dirty = true; continue; }
      s.write(saved[s.key]);
    }
    if (dirty) localStorage.setItem('fetchrun.settings', JSON.stringify(saved));
  }

  _writeSetting(key, value) {
    const s = SETTINGS.find((x) => x.key === key);
    if (!s) return;
    s.write(value);
    // Dev switches live for this session only — see _applySavedSettings.
    if (!s.dev) {
      const saved = this._loadJSON('fetchrun.settings', {});
      saved[key] = value;
      localStorage.setItem('fetchrun.settings', JSON.stringify(saved));
    }
    // Sliders update their own readout without a full re-render, so the thumb
    // doesn't get yanked out from under your finger mid-drag.
    const el = this.el['settings-items'].querySelector(`[data-key="${key}"] .setting-val`);
    if (el && !s.toggle) el.textContent = `${s.read()}${s.suffix}`;
  }

  openSettings(from = 'menu') {
    this._settingsFrom = from;
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'select', 'shop', 'paused']) {
      this.el[id].classList.add('hidden');
    }
    this.el.settings.classList.remove('hidden');
    this._renderSettings();
  }

  // A persistent corner tag naming every dev switch that's on. Without it the
  // only evidence of Invincible was that nothing killed you, which is
  // indistinguishable from the collision code being broken.
  updateDevFlag() {
    const on = SETTINGS.filter((s) => s.dev && s.read());
    this.el['dev-flag'].classList.toggle('hidden', on.length === 0);
    this.el['dev-flag'].textContent = on.map((s) => s.label.toUpperCase()).join(' · ');
    this.el['btn-dev-off'].classList.toggle('hidden', on.length === 0);
  }

  // ---- post-pause countdown ---------------------------------------------

  showCountdown(n) {
    const el = this.el.countdown;
    el.classList.remove('hidden');
    this.el['countdown-num'].textContent = String(n);
    // Restart the tick animation on every number
    this.el['countdown-num'].style.animation = 'none';
    void this.el['countdown-num'].offsetWidth;
    this.el['countdown-num'].style.animation = '';
  }

  hideCountdown() {
    this.el.countdown.classList.add('hidden');
  }

  _renderSettings() {
    let devHeaderDone = false;
    this.el['settings-items'].innerHTML = SETTINGS.map((s) => {
      // Dev tools live in their own block at the bottom, behind a divider, so
      // they read as debug switches rather than normal game options.
      let head = '';
      if (s.dev && !devHeaderDone) {
        devHeaderDone = true;
        head = '<p class="subhead dev-head">DEV TOOLS</p>';
      }
      const hint = s.hint ? `<div class="setting-hint">${s.hint}</div>` : '';
      if (s.toggle) {
        const on = s.read();
        return `${head}<div class="setting${s.dev ? ' dev' : ''}" data-key="${s.key}">
          <div class="setting-head"><b>${s.label}</b></div>${hint}
          <button class="setting-toggle${on ? ' on' : ''}">${on ? 'ON' : 'OFF'}</button>
        </div>`;
      }
      return `${head}<div class="setting${s.dev ? ' dev' : ''}" data-key="${s.key}">
        <div class="setting-head"><b>${s.label}</b><span class="setting-val">${s.read()}${s.suffix}</span></div>${hint}
        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.read()}">
      </div>`;
    }).join('');
    this.updateDevFlag();
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
    s.bestScore = Math.max(s.bestScore ?? 0, Math.floor(game.score));
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

  // Saved unlock/equip data predates whatever COSMETICS looks like today —
  // collars were removed, coats and trails were added. Rather than write a
  // migration per change, both are reconciled against the live catalogue on
  // every read: unknown categories and ids are dropped, missing ones default
  // to the first (free) entry. Adding a shop category needs no migration.
  _normalizeSaves(saved, pickDefault, keep) {
    const out = {};
    for (const [cat, items] of Object.entries(COSMETICS)) {
      const ids = items.map((i) => i.id);
      out[cat] = keep(saved?.[cat], ids) ?? pickDefault(ids);
    }
    return out;
  }

  unlocks() {
    if (this.unlockAll) {
      return Object.fromEntries(
        Object.entries(COSMETICS).map(([cat, items]) => [cat, items.map((i) => i.id)])
      );
    }
    const saved = this._loadJSON('fetchrun.unlocks', {});
    return this._normalizeSaves(
      saved,
      (ids) => [ids[0]],
      (owned, ids) => {
        if (!Array.isArray(owned)) return null;
        const valid = owned.filter((id) => ids.includes(id));
        // The free default is always owned, even if it was never written
        if (!valid.includes(ids[0])) valid.unshift(ids[0]);
        return valid;
      }
    );
  }

  equip() {
    if (this.unlockAll && this._sessionEquip) return { ...this._sessionEquip };
    const saved = this._loadJSON('fetchrun.equip', {});
    return this._normalizeSaves(
      saved,
      (ids) => ids[0],
      (id, ids) => (ids.includes(id) ? id : null)
    );
  }

  openShop() {
    for (const id of ['menu', 'hud', 'death', 'intro-hint', 'select', 'settings']) {
      this.el[id].classList.add('hidden');
    }
    this.el.shop.classList.remove('hidden');
    this._renderShop();
    // Open on whatever you're already wearing rather than an empty box
    this._preview('fur', this.equip());
  }

  _preview(cat, equip) {
    const item = COSMETICS[cat]?.find((i) => i.id === equip[cat]);
    this.el['shop-preview-label'].textContent = item?.label ?? '';
    this.onShopPreview?.(cat, equip);
  }

  _shopTap(cat, id) {
    const item = COSMETICS[cat].find((i) => i.id === id);
    if (!item) return;
    const unlocks = this.unlocks();
    const equip = this.equip();
    const owned = unlocks[cat].includes(id);
    const affordable = this.bank() >= item.price;

    // Tapping something you can't afford still SHOWS it. Being able to look
    // at what you're saving for is the whole point of the preview — refusing
    // to render it until it's paid for is the behaviour this replaces.
    if (!owned && !affordable) {
      this._preview(cat, { ...equip, [cat]: id });
      return;
    }
    if (!owned) {
      this._setBank(this.bank() - item.price);
      unlocks[cat].push(id);
      localStorage.setItem('fetchrun.unlocks', JSON.stringify(unlocks));
    }
    equip[cat] = id;
    // In ?unlockall the catalogue is browsable but nothing is really owned,
    // so the choice lives in memory for the session instead of on disk — the
    // real save is never written, and dropping the flag restores it intact.
    if (this.unlockAll) this._sessionEquip = equip;
    else localStorage.setItem('fetchrun.equip', JSON.stringify(equip));
    this._renderShop();
    this._preview(cat, equip);
    this.onCosmeticsChange?.(equip);
  }

  // Visual preview per cosmetic. Anything with a `swatch` colour in
  // COSMETICS (coats, trails) draws as a colour dot; the rest map cleanly
  // onto emoji.
  static ICONS = {
    hat: {
      none: 'hat.none', party: 'hat.party', propeller: 'hat.propeller', crown: 'hat.crown',
      halo: 'hat.halo', horns: 'hat.horns', helmet: 'hat.helmet',
    },
    chase: {
      squirrel: 'chase.squirrel', butterfly: 'chase.butterfly', rabbit: 'chase.rabbit',
      ufo: 'chase.ufo', cherub: 'chase.cherub', imp: 'chase.imp',
    },
  };

  _chipIcon(cat, item) {
    if (item.swatch) {
      return `<div class="chip-icon swatch" style="--swatch-color:${item.swatch}"></div>`;
    }
    // ICONS now holds icon NAMES, resolved to a baked render of the real model
    const name = UI.ICONS[cat]?.[item.id];
    return `<div class="chip-icon">${name ? iconImg(name, 'chip-img') : ''}</div>`;
  }

  _renderShop() {
    this.el['shop-bank'].textContent = this.unlockAll
      ? '🔓 PREVIEW — everything unlocked'
      : `${iconImg('ball', 'inline-icon')} ${this.bank()}`;
    const unlocks = this.unlocks();
    const equip = this.equip();
    const labels = { fur: 'COATS', hat: 'HATS', chase: 'CHASE', trail: 'TRAILS' };
    this.el['shop-items'].innerHTML = Object.entries(COSMETICS)
      .map(([cat, items]) => {
        const chips = items
          .map((item) => {
            const owned = unlocks[cat].includes(item.id);
            const equipped = equip[cat] === item.id;
            // Locked items keep their icon at FULL colour. Dimming it hid the
            // one thing that would make you want to buy it — the price tag
            // already says you don't own it yet.
            const cls = `shop-chip${equipped ? ' equipped' : owned ? ' owned' : ' locked'}`;
            const sub = equipped ? 'EQUIPPED' : owned ? 'EQUIP'
              : `${iconImg('ball', 'inline-icon')} ${item.price}`;
            return `<button class="${cls}" data-cat="${cat}" data-id="${item.id}">${this._chipIcon(cat, item)}${item.label}<span>${sub}</span></button>`;
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
    this.el.settings.classList.add('hidden');
    this.el.paused.classList.add('hidden');
    this.el['btn-pause'].classList.add('hidden');
    this.el['menu-best'].classList.toggle('hidden', best <= 0);
    this.el['menu-best'].textContent = `Best: ${best}m`;
    const bank = this.bank();
    this.el['menu-bank'].classList.toggle('hidden', bank <= 0);
    this.el['menu-bank'].innerHTML = `${iconImg('ball', 'inline-icon')} ${bank} to spend`;
  }

  showRunning() {
    this._show('hud');
    this.el['hud-closecalls'].textContent = '';
    this.el['stage-banner'].classList.add('hidden');
    this.el['btn-pause'].classList.remove('hidden');
    this.updateDevFlag();
  }

  // themeLabel is set only when this checkpoint also enters a NEW themed
  // world, so the banner announces the level change rather than just a number.
  showStageBanner(stage, themeLabel = null, rare = false) {
    const el = this.el['stage-banner'];
    const mark = rare ? iconImg('star', 'inline-icon tiny') : '';
    el.innerHTML = themeLabel
      ? `STAGE ${stage}<span class="banner-sub">${mark} ${themeLabel} ${mark}</span>`
      : `STAGE ${stage}`;
    el.classList.toggle('with-theme', !!themeLabel);
    el.classList.toggle('rare', !!rare);
    el.classList.remove('hidden');
    // Restart the pop animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    // Swell the whole corner cluster, then settle back. This is what carries
    // the announcement now that the banner is small and off to the side.
    const top = this.el['hud-top'];
    top.classList.remove('pop');
    void top.offsetWidth;
    top.classList.add('pop');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      el.classList.add('hidden');
      top.classList.remove('pop');
    }, rare ? 2500 : 1700);
    // Transition. A full-screen white strobe read as a distracting camera
    // flash, so: a plain checkpoint gets a soft edge-vignette pulse, and a
    // WORLD change gets a tinted iris sweeping outward from the horizon —
    // motion that suggests travelling into somewhere new rather than a blink.
    const fx = document.createElement('div');
    fx.className = themeLabel ? 'transition iris' : 'transition pulse';
    if (rare) fx.classList.add('rare');
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), themeLabel ? 1100 : 600);
  }

  updateHUD(game) {
    // Score, not metres. It rides on the same rotation distance does, so it
    // climbs faster the faster you're going, and pickups and multipliers fold
    // into it — which is what makes speeding up feel like it pays.
    this.el['hud-distance'].textContent = Math.floor(game.score).toLocaleString();
    this.el['hud-balls'].innerHTML = `${iconImg('ball', 'inline-icon')} ${game.balls}`;
    // ...and underneath, what the account is worth INCLUDING this run. The
    // bank itself is only credited on death (recordRun), so showing the raw
    // stored number mid-run would sit there ignoring every ball you picked up.
    const total = this.bank() + game.balls;
    this.el['hud-bank'].classList.toggle('hidden', total <= 0);
    this.el['hud-bank'].textContent = `${total.toLocaleString()} total`;
    this.el['hud-closecalls'].textContent =
      game.nearMisses > 0 ? `close calls: ${game.nearMisses}` : '';
    // Powers stack, so the HUD lists every active one with its own timer
    const LABELS = {
      zoomies: 'ZOOMIES',
      magnet: 'MAGNET',
      goldbone: '2X EVERYTHING',
      yarn: 'BALL FRENZY',
      rocket: 'BLAST OFF',
      slowmo: 'SLO-MO',
      scorch: 'SCORCH',
    };
    const active = Object.entries(game.powers ?? {})
      .filter(([, t]) => t > 0)
      .sort((a, b) => b[1] - a[1]);
    this.el['hud-power'].classList.toggle('hidden', active.length === 0);
    this.el['hud-power'].innerHTML = active
      .map(([type, t]) =>
        `<span class="pw">${iconImg(type, 'inline-icon')} ${LABELS[type] ?? type} ${Math.ceil(t)}s</span>`)
      .join('');

    const lives = game.extraLives ?? 0;
    this.el['hud-life'].classList.toggle('hidden', lives === 0);
    this.el['hud-life'].innerHTML = `${iconImg('steak', 'inline-icon')} ` +
      (lives > 1 ? `x${lives}` : 'EXTRA LIFE');
  }

  showDeath(game) {
    this._show('death');
    this.el['btn-pause'].classList.add('hidden');
    this.el['death-title'].textContent = 'WIPEOUT!';
    this.el['death-distance'].textContent = Math.floor(game.score).toLocaleString();
    this.el['death-best'].textContent = game.isNewBest
      ? 'NEW BEST!' : `best: ${game.best.toLocaleString()}`;

    this.el['d-dist'].textContent = `${Math.floor(game.distance)}m`;
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
      .map((r, i) => `<div class="row${i === 0 ? ' latest' : ''}"><span>${r.d}m</span><b>stage ${r.stage} &middot; ${iconImg('ball', 'inline-icon')} ${r.balls}</b></div>`)
      .join('');

    this.el['death-actions'].classList.add('hidden');
  }

  showRestartPrompt() {
    this.el['death-actions'].classList.remove('hidden');
  }
}
