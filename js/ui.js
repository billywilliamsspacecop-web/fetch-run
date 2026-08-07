import { COSMETICS, SETTINGS, CONFIG } from './config.js';
import { ALL_THEMES, RARITY } from './themes.js';
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
      'shop-preview', 'shop-preview-stage', 'shop-preview-label', 'shop-sort',
      'settings', 'settings-items', 'btn-settings', 'btn-settings-close', 'btn-settings-reset',
      'settings-tabs', 'tab-game', 'tab-stats', 'tab-dev', 'dev-items', 'stats-body', 'btn-stats-reset',
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
    // set by main; lets the settings panel tell a live run from a dead one
    this.isRunInProgress = null;

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
      // Decided by whether a run is actually IN PROGRESS, not by where the
      // panel remembers being opened from. Falling through to showMenu() while
      // a paused run was still alive underneath put the main menu on screen
      // with the run hidden behind it — and the next tap on PLAY started a
      // fresh run, which silently threw the old one's score away. The remembered
      // origin is only a fallback now, for when there's no run to go back to.
      if (this.isRunInProgress?.() || this._settingsFrom === 'pause') this.showPaused();
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
    this.el.settings.addEventListener('input', (e) => {
      const row = e.target.closest('[data-key]');
      if (!row) return;
      this._writeSetting(row.dataset.key, Number(e.target.value));
    });
    this.el.settings.addEventListener('click', (e) => {
      const btn = e.target.closest('.setting-toggle');
      if (!btn) return;
      e.stopPropagation();
      const key = btn.closest('[data-key]').dataset.key;
      const s = SETTINGS.find((x) => x.key === key);
      this._writeSetting(key, !s.read());
      this._renderSettings();
      this.updateDevFlag();
    });

    this.el['settings-tabs'].addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      e.stopPropagation();
      this.showSettingsTab(t.dataset.tab);
    });
    this.el['btn-stats-reset'].addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem('fetchrun.stats');
      localStorage.removeItem('fetchrun.recent');
      this._renderStats();
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
    this.el['shop-sort'].addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      e.stopPropagation();
      this._shopSort = t.dataset.sort;
      for (const b of this.el['shop-sort'].querySelectorAll('.tab')) {
        b.classList.toggle('on', b.dataset.sort === this._shopSort);
      }
      this._renderShop();
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
    this.showSettingsTab('game');
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

  _settingRow(s) {
    const hint = s.hint ? `<div class="setting-hint">${s.hint}</div>` : '';
    if (s.toggle) {
      const on = s.read();
      return `<div class="setting${s.dev ? ' dev' : ''}" data-key="${s.key}">
        <div class="setting-head"><b>${s.label}</b>
          <button class="setting-toggle${on ? ' on' : ''}">${on ? 'ON' : 'OFF'}</button>
        </div>${hint}
      </div>`;
    }
    return `<div class="setting" data-key="${s.key}">
      <div class="setting-head"><b>${s.label}</b><span class="setting-val">${s.read()}${s.suffix}</span></div>${hint}
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.read()}">
    </div>`;
  }

  // Game settings, grouped by what they affect. Previously every slider sat in
  // one undifferentiated column, so "rare stage chance" and "top speed" looked
  // equally related to each other, which is to say not at all.
  _renderSettings() {
    const groups = new Map();
    for (const s of SETTINGS) {
      if (s.dev) continue;
      const g = s.group ?? 'Game';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    this.el['settings-items'].innerHTML = [...groups]
      .map(([name, list]) =>
        `<p class="subhead">${name.toUpperCase()}</p>
         <div class="setting-group">${list.map((s) => this._settingRow(s)).join('')}</div>`)
      .join('');
    this.el['dev-items'].innerHTML = SETTINGS.filter((s) => s.dev)
      .map((s) => this._settingRow(s)).join('');
    this.updateDevFlag();
  }

  // ---- extended stats ---------------------------------------------------
  //
  // Bars, not pies. Every question here is "which of these is biggest, and by
  // how much" — that's a length comparison, and length is the one encoding
  // people read accurately. A pie of nine obstacles would be nine wedges you
  // can't rank by eye. Headline numbers are stat tiles instead of charts,
  // because a single value has no shape worth drawing.
  //
  // One hue carries magnitude; rare worlds get a second hue AND a text tag,
  // so identity is never colour-alone.

  // 'obTrashCan' -> 'Trash Can'
  static prettyKind(k) {
    return String(k).replace(/^ob/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  _barChart(rows, { accentKey = null } = {}) {
    if (!rows.length) return '<p class="stat-empty">nothing recorded yet</p>';
    const max = Math.max(...rows.map((r) => r.value));
    return `<div class="bars">${rows.map((r) => {
      const pct = Math.max(3, Math.round((r.value / max) * 100));
      const rare = accentKey && r[accentKey];
      // The tag names the actual tier when the row knows it, so an epic world
      // isn't filed under the same "RARE" label as a rare one.
      const tag = rare ? (RARITY[r.tier]?.label ?? 'RARE') : '';
      return `<div class="bar-row">
        <span class="bar-label">${r.label}${tag ? `<i class="tag">${tag}</i>` : ''}</span>
        <span class="bar-track"><span class="bar-fill${rare ? ' rare' : ''}" style="width:${pct}%"></span></span>
        <b class="bar-value">${r.value.toLocaleString()}</b>
      </div>`;
    }).join('')}</div>`;
  }

  _renderStats() {
    const s = this.stats();
    const mph = (rad) => Math.round(rad * CONFIG.metersPerRadian * 2.23694);
    const body = this.el['stats-body'];

    if (!s.runs) {
      body.innerHTML = '<p class="stat-empty big">No runs yet.<br>Play a round and this fills in.</p>';
      return;
    }

    const tiles = [
      ['LONGEST RUN', `${s.bestDist.toLocaleString()}m`],
      ['TOP SPEED', `${mph(s.topSpeed)} mph`],
      ['BEST SCORE', s.bestScore.toLocaleString()],
      ['RUNS', s.runs.toLocaleString()],
      ['FURTHEST STAGE', s.maxStage],
      ['AVG STAGE', (s.totalStages / s.runs).toFixed(1)],
    ];

    const killRows = Object.entries(s.kills)
      .map(([k, v]) => ({ label: UI.prettyKind(k), value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const worldRows = Object.entries(s.worlds)
      .map(([id, v]) => {
        const t = ALL_THEMES.find((x) => x.id === id);
        return { label: t?.label ?? id, value: v, rare: !!t?.rare, tier: t?.rarity };
      })
      .sort((a, b) => b.value - a.value);

    // Rarest = the rare worlds you've actually reached, least-seen first.
    const rarest = worldRows.filter((w) => w.rare).sort((a, b) => a.value - b.value);

    // The collection view: every world in the game grouped by tier, with the
    // ones you haven't reached yet left blank. This is the point of having
    // tiers at all — you can see there IS something behind the epic slot
    // before you've ever landed on it.
    const seen = new Set(Object.keys(s.worlds));
    const tiers = Object.entries(RARITY).map(([key, meta]) => {
      const list = ALL_THEMES.filter((t) => t.rarity === key);
      return { key, meta, list, found: list.filter((t) => seen.has(t.id)).length };
    });

    body.innerHTML = `
      <div class="stat-tiles">
        ${tiles.map(([k, v]) => `<div class="stat-tile"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div>
      <p class="subhead">WHAT ENDS YOUR RUNS</p>
      ${this._barChart(killRows)}
      <p class="subhead">WORLDS VISITED</p>
      ${this._barChart(worldRows, { accentKey: 'rare' })}
      <p class="subhead">THE COLLECTION</p>
      <div class="rarity-groups">
        ${tiers.map((g) => `
          <div class="rarity-group tier-${g.key}">
            <div class="rarity-head"><span>${g.meta.label}</span><b>${g.found}/${g.list.length}</b></div>
            <div class="rarity-chips">
              ${g.list.map((t) => (seen.has(t.id)
                ? `<span class="world-chip found">${t.label}</span>`
                : '<span class="world-chip">? ? ?</span>')).join('')}
            </div>
          </div>`).join('')}
      </div>
      ${rarest.length
        ? `<p class="stat-note">rarest so far is <b>${rarest[0].label}</b> at
           ${rarest[0].value} run${rarest[0].value === 1 ? '' : 's'}</p>`
        : '<p class="stat-empty">no rare or epic world yet — they turn up about one theme block in five</p>'}
      <div class="stat-rows small">
        <div class="row"><span>total distance</span><b>${s.totalDist.toLocaleString()}m</b></div>
        <div class="row"><span>balls collected</span><b>${s.totalBalls.toLocaleString()}</b></div>
        <div class="row"><span>best close calls</span><b>${s.bestCloseCalls}</b></div>
      </div>`;
  }

  showSettingsTab(tab) {
    this._settingsTab = tab;
    for (const t of this.el['settings-tabs'].querySelectorAll('.tab')) {
      t.classList.toggle('on', t.dataset.tab === tab);
    }
    for (const name of ['game', 'stats', 'dev']) {
      this.el[`tab-${name}`].classList.toggle('hidden', name !== tab);
    }
    if (tab === 'stats') this._renderStats();
  }

  // ---- persistent stats ------------------------------------------------

  _loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  // Lifetime totals. Every field defaults, because saves written by older
  // builds won't have the newer ones and a missing key must never read as NaN
  // halfway down a stats screen.
  stats() {
    const s = this._loadJSON('fetchrun.stats', {});
    return {
      runs: 0, totalDist: 0, totalBalls: 0, bestCloseCalls: 0,
      bestScore: 0, bestDist: 0, topSpeed: 0, maxStage: 0, totalStages: 0,
      kills: {},        // obstacle builder name -> times it ended a run
      worlds: {},       // theme id -> runs that passed through it
      ...s,
    };
  }

  recordRun(game) {
    const s = this.stats();
    s.runs += 1;
    s.totalDist += Math.floor(game.distance);
    s.bestScore = Math.max(s.bestScore, Math.floor(game.score));
    s.bestDist = Math.max(s.bestDist, Math.floor(game.distance));
    s.topSpeed = Math.max(s.topSpeed, game.topSpeed ?? 0);
    s.maxStage = Math.max(s.maxStage, game.stage);
    s.totalStages += game.stage;
    s.totalBalls += game.balls;
    s.bestCloseCalls = Math.max(s.bestCloseCalls, game.nearMisses);
    // What actually ended the run. Only counted on a real wipeout — a run you
    // quit out of didn't have a killer, and logging one would skew the chart
    // toward whatever happened to be on screen when you pressed HOME.
    if (game.deathCause === 'wipeout' && game.lastHitKind) {
      s.kills[game.lastHitKind] = (s.kills[game.lastHitKind] ?? 0) + 1;
    }
    // Each world counted ONCE per run, not once per stage spent in it, so a
    // long stay in the backyard doesn't drown out a one-stage rare world.
    for (const id of new Set(game.themesSeen ?? [])) {
      s.worlds[id] = (s.worlds[id] ?? 0) + 1;
    }
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

  static SHOP_LABELS = { fur: 'COATS', hat: 'HATS', chase: 'CHASE', trail: 'TRAILS' };

  _shopChip(cat, item, unlocks, equip) {
    const owned = unlocks[cat].includes(item.id);
    const equipped = equip[cat] === item.id;
    // Locked items keep their icon at FULL colour. Dimming it hid the one
    // thing that would make you want to buy it — the price tag already says
    // you don't own it yet.
    const cls = `shop-chip${equipped ? ' equipped' : owned ? ' owned' : ' locked'}`;
    const sub = equipped ? 'EQUIPPED' : owned ? 'EQUIP'
      : `${iconImg('ball', 'inline-icon')} ${item.price}`;
    return `<button class="${cls}" data-cat="${cat}" data-id="${item.id}">
      ${this._chipIcon(cat, item)}<span class="chip-name">${item.label}</span><span>${sub}</span>
    </button>`;
  }

  _renderShop() {
    this.el['shop-bank'].innerHTML = this.unlockAll
      ? 'PREVIEW — everything unlocked'
      : `${iconImg('ball', 'inline-icon')} ${this.bank()}`;
    const unlocks = this.unlocks();
    const equip = this.equip();
    const sort = this._shopSort ?? 'type';

    // Flat list of every item with the context each sort mode needs
    const all = Object.entries(COSMETICS).flatMap(([cat, items]) =>
      items.map((item) => ({
        cat, item,
        owned: unlocks[cat].includes(item.id),
        affordable: this.bank() >= item.price,
      })));

    let sections;
    if (sort === 'price') {
      // Cheapest first, and free things last rather than first — a wall of
      // 0-cost defaults at the top is not what "sort by price" is for.
      const rows = all.slice().sort((a, b) =>
        (a.item.price || Infinity) - (b.item.price || Infinity));
      sections = [['ALL ITEMS, CHEAPEST FIRST', rows]];
    } else if (sort === 'owned') {
      const rows = all.filter((r) => !r.owned)
        .sort((a, b) => a.item.price - b.item.price);
      sections = rows.length
        ? [['STILL TO BUY, CHEAPEST FIRST', rows]]
        : [['STILL TO BUY', []]];
    } else {
      sections = Object.entries(COSMETICS).map(([cat, items]) =>
        [UI.SHOP_LABELS[cat] ?? cat.toUpperCase(),
         items.map((item) => all.find((r) => r.cat === cat && r.item === item))]);
    }

    this.el['shop-items'].innerHTML = sections.map(([title, rows]) => {
      if (!rows.length) {
        return `<p class="subhead">${title}</p><p class="stat-empty">you own everything — nice</p>`;
      }
      return `<p class="subhead">${title}</p><div class="shop-row">${
        rows.map((r) => this._shopChip(r.cat, r.item, unlocks, equip)).join('')
      }</div>`;
    }).join('');
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
  // `rarity` is the tier key ('common'...'epic'); it drives the tier flash
  // under the world name and the colour of the whole announcement.
  showStageBanner(stage, themeLabel = null, rarity = null) {
    const el = this.el['stage-banner'];
    const rare = rarity === 'rare' || rarity === 'epic';
    const mark = rare ? iconImg('star', 'inline-icon tiny') : '';
    const tier = rarity && RARITY[rarity]
      ? `<span class="banner-rarity">${RARITY[rarity].label}</span>`
      : '';
    el.innerHTML = themeLabel
      ? `STAGE ${stage}<span class="banner-sub">${mark} ${themeLabel} ${mark}</span>${tier}`
      : `STAGE ${stage}`;
    el.classList.toggle('with-theme', !!themeLabel);
    el.classList.toggle('rare', !!rare);
    // One class per tier so the colour lives in the stylesheet rather than
    // being poked in as an inline style from three different call sites.
    for (const key of Object.keys(RARITY)) el.classList.toggle(`tier-${key}`, rarity === key);
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
    if (rarity) fx.classList.add(`tier-${rarity}`);
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
      shrink: 'SHRINK',
      scorch: 'SCORCH',
    };
    const stacking = game.stacking;
    const active = Object.entries(game.powers ?? {})
      .filter(([, t]) => t > 0)
      .sort((a, b) => b[1] - a[1]);
    this.el['hud-power'].classList.toggle('hidden', active.length === 0);
    // Under stacking the number is a COUNT, not a countdown — "x2" rather than
    // "9s". Showing seconds there would be a straight lie: nothing is ticking.
    this.el['hud-power'].innerHTML = active
      .map(([type, n]) => {
        // Blast Off is the one power with a clock under stacking, so it shows
        // both: how many flights are banked, and how long this one has left.
        let suffix;
        if (!stacking) suffix = `${Math.ceil(n)}s`;
        else if (type === 'rocket') {
          suffix = `${n > 1 ? `x${n} ` : ''}${Math.ceil(game.rocketTimer ?? 0)}s`;
        } else suffix = n > 1 ? `x${n}` : '';
        return `<span class="pw">${iconImg(type, 'inline-icon')} ${LABELS[type] ?? type} ${suffix}</span>`;
      })
      .join('');

    // THE SHIELD LINE. Under stacking, holding any power at all is a life, and
    // that has to be stated outright — the rings show you HAVE something, but
    // not that the something is what's keeping you alive. Banked steaks are
    // counted alongside, since they're the next life down.
    const lives = game.extraLives ?? 0;
    const shielded = stacking && (game.powerCount ?? 0) > 0;
    this.el['hud-life'].classList.toggle('hidden', lives === 0 && !shielded);
    this.el['hud-life'].classList.toggle('shielded', shielded);
    const parts = [];
    if (shielded) parts.push(`SHIELDED &middot; ${game.powerCount}`);
    if (lives > 0) {
      parts.push(`${iconImg('steak', 'inline-icon')} ` + (lives > 1 ? `x${lives}` : 'EXTRA LIFE'));
    }
    this.el['hud-life'].innerHTML = parts.join(' &nbsp; ');
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
