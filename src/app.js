// App controller: screen routing, modals/toasts, the frame loop, persistence,
// and the high-level run flow (map → node → fight → rewards → next act).
import { storage } from './core/save.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { randomSeed, streamFor } from './core/rng.js';
import { todayKey } from './core/util.js';
import { el, esc, describe, itemChip, cardChip, hpBar } from './ui/dom.js';
import { loadProfile, saveProfile, checkAchievements, checkCharUnlocks } from './game/meta.js';
import {
  createRun, startAct, enterNode, encounterFor, rivalEncounter, raccoonScenario, finishRun, chooseEnding, recalcMaxHp,
} from './game/run.js';
import { computeStats } from './game/stats.js';
import { ITEM_MAP } from './data/items.js';
import { CARD_MAP } from './data/cards.js';
import { CHARACTERS, CHAR_MAP } from './data/characters.js';
import { ACTS } from './data/acts.js';
import { BOSS_MAP } from './data/bosses.js';
import { DAILY_MODS, CHALLENGE_MAP } from './data/challenges.js';
import { SCREENS } from './ui/screens/index.js';

export class App {
  constructor(root) {
    this.root = root;
    root.innerHTML = '<div id="screen-root" style="display:contents"></div><div class="toast-root"></div>';
    this.screenRoot = root.querySelector('#screen-root');
    this.toastRoot = root.querySelector('.toast-root');
    this.profile = loadProfile();
    this.run = storage.load('run');
    if (this.run && this.run.v !== 1) this.run = null;
    this.screen = null;
    this.last = performance.now();
    this.applySettings();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.persist(); if (audio.ctx) audio.ctx.suspend(); }
      else if (audio.ctx) audio.ctx.resume();
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  applySettings() {
    const s = this.profile.settings;
    audio.setVolumes(s.sfx, s.music);
    haptics.setEnabled(s.haptics);
  }

  start() {
    this.show('title');
    const loop = (t) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      try { this.screen?.update(dt); } catch (e) { console.error(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  show(name, params = {}, { record = true } = {}) {
    const S = SCREENS[name];
    if (!S) throw new Error('No screen ' + name);
    // leaving the tutorial restores the real saved run (if any)
    if (this.run?.mode === 'tutorial' && name !== 'match') this.run = storage.load('run');
    this.screen?.destroy();
    this.screen = new S(this, params);
    document.body.dataset.act = this.run && ['map', 'match', 'reward', 'shop', 'event', 'rest', 'treasure', 'act'].includes(name) ? this.run.act : '1';
    this.screen.mount(this.screenRoot);
    if (record && this.run && S.runScreen) {
      this.run.screen = { name, params };
      this.saveRun();
    }
  }

  // ───────── persistence ─────────
  saveRun() { if (this.run && this.run.mode !== 'tutorial') storage.save('run', this.run); }
  clearRun() { this.run = null; storage.remove('run'); }
  saveProfile() { saveProfile(this.profile); }
  persist() {
    if (this.screen?.fight && this.run && this.screen.fight.state === 'aim' && !this.screen.fight.scenario) {
      this.run.fight = this.screen.fight.serialize();
    }
    this.saveRun();
    this.saveProfile();
  }

  // ───────── modal / toast ─────────
  modal({ title = '', html = '', buttons = [{ label: 'OK', value: true, cls: 'primary' }], dismiss = true } = {}) {
    return new Promise((resolve) => {
      const back = el(`<div class="modal-back"><div class="modal">
        ${title ? `<h3>${title}</h3>` : ''}<div class="mbody">${html}</div>
        <div class="btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('')}</div>
      </div></div>`);
      const close = (v) => { back.remove(); resolve(v); };
      back.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) { audio.tap(); close(buttons[+b.dataset.i].value); return; }
        const a = e.target.closest('[data-act]');
        if (a && this.modalAction) { this.modalAction(a.dataset.act, a, close); return; }
        if (dismiss && e.target === back) close(null);
      });
      this.root.appendChild(back);
    });
  }

  toast(msg, ms = 2600) {
    const t = el(`<div class="toast">${msg}</div>`);
    this.toastRoot.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
  }

  showDetail(kind, id) {
    const d = describe(kind, id);
    return this.modal({ title: d.title, html: d.html });
  }

  async showInventory() {
    const run = this.run;
    if (!run) return;
    const st = computeStats(run);
    const byType = (t) => run.items.filter((i) => ITEM_MAP[i.id]?.type === t);
    const sec = (title, list) => list.length ? `<div class="section-title">${title}</div><div class="chips">${list.map((i) => itemChip(i.id, i.n)).join('')}</div>` : '';
    const ch = CHAR_MAP[run.char];
    const html = `
      <div class="row"><div style="font-size:40px">${ch.icon}</div><div class="grow"><b>${ch.name}</b><div class="muted" style="font-size:12px">${esc(ch.perk)}</div></div></div>
      <div style="margin-top:10px">${hpBar(run.hp, run.maxHp)}</div>
      <div class="row" style="margin-top:8px;font-size:13px"><span class="coins">🪙 ${run.coins}</span><span class="muted">Seed <b>${esc(run.seed)}</b></span>${run.ascension ? `<span class="tag">A${run.ascension}</span>` : ''}${run.challenge ? `<span class="tag">${CHALLENGE_MAP[run.challenge].icon} ${CHALLENGE_MAP[run.challenge].name}</span>` : ''}</div>
      ${sec('Cue Upgrades', byType('cue'))}${sec('Ball Modifiers', byType('ball'))}${sec('Relics', byType('relic'))}${sec('Curses', byType('curse'))}
      ${run.consumables.length ? `<div class="section-title">Consumables</div><div class="chips">${run.consumables.map((id, k) => itemChip(id, 1, `item:${id}`)).join('')}</div>` : ''}
      <div class="section-title">Shot Deck (${run.deck.length})</div><div class="chips">${run.deck.map((id) => cardChip(id)).join('')}</div>
      <div class="section-title">Stats</div><div class="muted" style="font-size:13px">Damage per ball: ${8 + st.ballDmg} × ${st.dmgMult.toFixed(2)} · Pockets ×${st.pocketScale.toFixed(2)} · Coins ×${st.coinMult.toFixed(2)}</div>`;
    this.modalAction = (act) => {
      const [k, id] = act.split(':');
      if (k === 'item') this.showDetail('item', id);
      if (k === 'card') this.showDetail('card', id);
    };
    await this.modal({ title: '🎒 Your Kit', html, buttons: [{ label: 'Close', value: true }] });
    this.modalAction = null;
  }

  // ───────── meta notifications ─────────
  celebrate(list = [], kind = 'achievement') {
    for (const a of list) {
      if (kind === 'achievement') this.toast(`🏅 Achievement: <b>${a.icon} ${esc(a.name)}</b>`, 3500);
      else this.toast(`🔓 Unlocked: <b>${a.icon} ${esc(a.name)}</b>`, 3500);
    }
    if (list.length) haptics.big();
  }

  checkMeta(on = 'profile', ctx = {}) {
    const a = checkAchievements(this.profile, on, ctx);
    const c = checkCharUnlocks(this.profile);
    this.celebrate(a, 'achievement');
    this.celebrate(c, 'unlock');
    this.saveProfile();
  }

  // ───────── run flow ─────────
  newRun({ char, seed, ascension = 0, mode = 'normal', challenge = null, dailyMod = null, dailyKey = null }) {
    this.run = createRun({ char, seed: seed || randomSeed(), ascension, mode, challenge, dailyMod }, this.profile);
    this.run.dailyKey = dailyKey;
    this.profile.seen.chars[char] = true;
    this.saveRun();
    this.saveProfile();
    this.show('act', { act: 1 });
  }

  dailySetup() {
    const key = todayKey();
    const rng = streamFor('DAILY-' + key, 'setup');
    const char = rng.pick(CHARACTERS).id;
    const mod = rng.pick(DAILY_MODS);
    return { key, seed: 'DAILY-' + key, char, mod };
  }

  continueRun() {
    const run = this.run;
    if (!run) return this.show('title');
    if (run.fight) return this.show('match', { enc: run.fight.enc, resume: true }, { record: false });
    const sc = run.screen;
    if (sc && SCREENS[sc.name]) return this.show(sc.name, sc.params, { record: false });
    this.show('map');
  }

  goMap() { this.run.fight = null; this.show('map'); }

  enterNode(nodeId) {
    const run = this.run;
    const { node, type, black } = enterNode(run, nodeId);
    run.floorsCleared++;
    this.saveRun();
    switch (type) {
      case 'fight': case 'elite': case 'boss':
        return this.startFight(encounterFor(run, node, type === 'fight' ? 'normal' : type));
      case 'shop': return this.show('shop', { nodeId, black });
      case 'event': return this.show('event', { nodeId });
      case 'rest': return this.show('rest', { nodeId });
      case 'treasure': return this.show('treasure', { nodeId });
      default: return this.show('map');
    }
  }

  startFight(enc, extra = {}) {
    const run = this.run;
    run.fight = null;
    run.pendingFight = { enc, ...extra };
    for (const e of enc.enemies) if (e.id) this.profile.seen.enemies[e.id] = true;
    if (enc.boss) this.profile.seen.bosses[enc.boss] = true;
    this.show('match', { enc, ...extra });
  }

  /** Dev helper: jump straight into a boss fight (console: __app.debugBoss('shark')). */
  debugBoss(id, act = null) {
    if (!this.run) this.newRun({ char: 'rookie', seed: 'DEBUG' });
    const run = this.run;
    run.map.boss = id;
    if (act) run.act = act;
    this.startFight(encounterFor(run, { id: 'debug-' + id, floor: 8 }, 'boss'));
  }

  startSpecialFight(kind) {
    const run = this.run;
    const node = run.map.nodes.find((n) => n.id === run.pos) || { id: 'x', floor: 3 };
    if (kind === 'rival') return this.startFight(rivalEncounter(run, node, this.profile), { special: 'rival' });
    if (kind === 'tournament') return this.startFight(encounterFor(run, node, 'elite', 'tournament'));
    if (kind === 'fightclub') return this.startFight(encounterFor(run, node, 'elite', 'fightclub'));
  }

  startRaccoon() {
    const run = this.run;
    const sc = raccoonScenario(run, run.pos + ':' + (run.flags.raccoonGames || 0));
    run.flags.raccoonGames = (run.flags.raccoonGames || 0) + 1;
    this.show('match', { enc: { key: 'raccoon:' + run.pos, kind: 'trick', act: run.act, enemies: [], scenario: sc }, special: 'raccoon' }, { record: false });
  }

  /** Called by the match screen when a fight ends. */
  fightOver(fight, result, params) {
    const run = this.run;
    run.fight = null;
    run.pendingFight = null;
    const enc = fight.enc;
    if (params.special === 'raccoon') {
      const p = this.profile;
      if (result.won) {
        p.npc.raccoon.beaten++;
        run.flags.raccoonWins = (run.flags.raccoonWins || 0) + 1;
        const coins = 35 + run.act * 10;
        run.coins += coins;
        this.saveProfile();
        this.checkMeta();
        return this.show('event', { nodeId: run.pos, outcome: `*Bandit throws his paws up* Fine! FINE! Take it! (+${coins} coins)`, npc: 'raccoon' });
      }
      const lost = Math.floor(run.coins / 3);
      run.coins -= lost;
      p.npc.raccoon.robbed++;
      this.saveProfile();
      return this.show('event', { nodeId: run.pos, outcome: `*Bandit cackles and runs off with ${lost} of your coins*`, npc: 'raccoon' });
    }
    if (run.mode === 'tutorial') return this.screen.tutorialNext?.(result.won);
    if (result.escaped) { this.toast('💨 You slipped away.'); return this.goMap(); }
    if (!result.won) return this.gameOver();

    run.stats.fightsWon++;
    this.profile.stats.fights++;
    const ach = checkAchievements(this.profile, 'fightWon', { run, fight });
    this.celebrate(ach);
    if (params.special === 'rival') {
      this.profile.npc.rival.wins++;
      this.profile.npc.rival.level++;
      if (this.profile.npc.rival.wins >= 3 && !this.profile.unlocked.cues.includes('dash')) {
        this.profile.unlocked.cues.push('dash');
        this.toast('🔓 Dash gave you his cue skin: <b>Dash\'s Flash</b>', 4000);
      }
    }
    if (enc.kind === 'boss') {
      run.stats.bossesBeaten++;
      run.bossesMet.push(enc.boss);
      this.profile.stats.bosses[enc.boss] = (this.profile.stats.bosses[enc.boss] || 0) + 1;
      if (run.act === 1) this.profile.flags.beatAct1 = true;
      if (run.act === 2) this.profile.flags.beatAct2 = true;
      this.celebrate(checkAchievements(this.profile, 'boss', { run, boss: enc.boss }));
      if (BOSS_MAP[enc.boss].final) {
        const ending = chooseEnding(run, fight.flags);
        return this.victory(ending);
      }
    }
    this.checkMeta();
    this.saveProfile();
    this.show('reward', { enc, flags: { lastBlowEight: fight.flags.lastBlowEight } });
  }

  nextAct() {
    const run = this.run;
    // heal some of the missing HP between acts
    run.hp = Math.min(run.maxHp, run.hp + Math.round((run.maxHp - run.hp) * 0.5));
    startAct(run, run.act + 1);
    if (run.act >= 2) this.profile.flags.reachAct2 = true;
    this.checkMeta();
    this.saveRun();
    this.show('act', { act: run.act });
  }

  gameOver() {
    const run = this.run;
    const summary = finishRun(run, this.profile, false);
    this.saveProfile();
    const snapshot = JSON.parse(JSON.stringify(run));
    this.clearRun();
    this.show('gameover', { run: snapshot, summary }, { record: false });
  }

  victory(ending) {
    const run = this.run;
    const summary = finishRun(run, this.profile, true, ending);
    this.checkMeta();
    this.saveProfile();
    const snapshot = JSON.parse(JSON.stringify(run));
    this.clearRun();
    this.show('victory', { run: snapshot, summary, ending }, { record: false });
  }

  async pauseMatch(fight) {
    const tut = this.run?.mode === 'tutorial';
    const trick = !!fight?.scenario && !tut;
    const buttons = [{ label: 'Resume', value: 'resume', cls: 'primary' }];
    if (tut) buttons.push({ label: '🚪 Exit tutorial', value: 'exit' });
    else if (!trick) {
      buttons.push({ label: '🎒 Your kit', value: 'inv' });
      buttons.push({ label: '🏠 Save & quit to title', value: 'title' });
      buttons.push({ label: '🏳️ Abandon run', value: 'abandon', cls: 'danger' });
    }
    const v = await this.modal({ title: '⏸ Paused', html: tut ? '<p class="muted">You can replay the tutorial any time from the title screen.</p>' : `<p class="muted">Seed <b>${esc(this.run.seed)}</b>. Fights save at the start of every turn.</p>`, buttons });
    if (v === 'exit') this.show('title');
    if (v === 'inv') this.showInventory();
    if (v === 'title') {
      if (fight && fight.state === 'aim' && !fight.result) this.run.fight = fight.serialize();
      this.saveRun();
      this.show('title');
    }
    if (v === 'abandon') this.abandonRun();
  }

  async abandonRun() {
    const ok = await this.modal({ title: 'Abandon run?', html: '<p class="muted">This run will end and count as a loss.</p>', buttons: [{ label: 'Abandon', value: true, cls: 'danger' }, { label: 'Keep playing', value: false }] });
    if (ok) this.gameOver();
  }

  // tutorial
  startTutorial() {
    this.run = {
      v: 1, seed: 'TUTORIAL', mode: 'tutorial', char: 'rookie', hp: 70, maxHp: 70, maxHpBonus: 0, coins: 0,
      items: [], deck: ['steady_hand', 'power_break', 'big_pockets', 'safety_net', 'second_chance'], consumables: [],
      act: 1, stats: { damage: 0, ballsSunk: 0, shots: 0, fouls: 0, coinsEarned: 0, fightsWon: 0, bossesBeaten: 0 }, flags: {}, bonusStats: {},
      ascension: 0, bossesMet: [], visited: [], map: { nodes: [], boss: 'shark' },
    };
    this.show('match', { tutorial: 0 }, { record: false });
  }

  finishTutorial() {
    this.profile.flags.tutorialDone = true;
    this.profile.lp += 20;
    this.run = storage.load('run');
    this.checkMeta();
    this.saveProfile();
    this.show('title');
    this.toast('🎓 Tutorial complete! +20 Legend Points', 3500);
  }
}

export { recalcMaxHp, ACTS };
