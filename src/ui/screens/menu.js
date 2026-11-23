// Out-of-run screens: title, character select, challenges, settings,
// collection book, clubhouse (meta unlocks), achievements, leaderboard.
import { Screen } from '../screen.js';
import { esc, hpBar, itemChip, cardChip } from '../dom.js';
import { audio } from '../../core/audio.js';
import { haptics } from '../../core/haptics.js';
import { normalizeSeed } from '../../core/rng.js';
import { VERSION } from '../../config.js';
import { CHARACTERS, CHAR_MAP } from '../../data/characters.js';
import { ITEMS, ITEM_MAP } from '../../data/items.js';
import { CARDS } from '../../data/cards.js';
import { BOSSES } from '../../data/bosses.js';
import { ENEMIES, ELITES, RIVAL } from '../../data/enemies.js';
import { NPCS } from '../../data/npcs.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';
import { ASCENSION, CHALLENGES, CHALLENGE_MAP } from '../../data/challenges.js';
import { ACTS, CUE_SKINS, FELT_SKINS } from '../../data/acts.js';
import { CLUBHOUSE, LOCKED_ITEMS, defaultProfile } from '../../game/meta.js';
import { ENDINGS } from '../../game/run.js';

const back = (label = '‹') => `<button class="icon-btn" data-act="back" aria-label="Back">${label}</button>`;

// ─────────────────────────────── TITLE ───────────────────────────────
export class TitleScreen extends Screen {
  render() {
    const p = this.app.profile, run = this.app.run;
    const cont = run ? `<div class="continue-card row"><div style="font-size:30px">${CHAR_MAP[run.char]?.icon}</div><div class="grow"><b>${CHAR_MAP[run.char]?.name}</b> · Act ${run.act}${run.mode === 'daily' ? ' · 📅 Daily' : ''}${run.challenge ? ' · ' + CHALLENGE_MAP[run.challenge].icon : ''}<div style="margin-top:5px">${hpBar(run.hp, run.maxHp)}</div></div></div>
      <button class="btn primary" data-act="continue">▶ CONTINUE RUN</button>` : '';
    const tut = !p.flags.tutorialDone;
    return `<div class="scroll"><div class="title-wrap">
      <div class="logo"><div class="balls">🎱</div><h1>Rack<br>&amp; Ruin</h1><div class="sub">a pool roguelike</div></div>
      <div class="center"><span class="lp-pill">⭐ ${p.lp} Legend Points</span>${p.ascension ? ` <span class="tag">Ascension ${p.ascension} unlocked</span>` : ''}</div>
      ${cont}
      ${tut ? '<button class="btn primary" data-act="tutorial">🎓 START HERE: TUTORIAL</button>' : ''}
      <button class="btn ${run || tut ? '' : 'primary'}" data-act="new">⚔️ NEW RUN</button>
      <div class="menu-grid">
        <button class="btn" data-act="daily"><span class="ico">📅</span>Daily Run</button>
        <button class="btn" data-act="challenges"><span class="ico">🎯</span>Challenges</button>
        <button class="btn" data-act="collection"><span class="ico">📚</span>Collection</button>
        <button class="btn" data-act="clubhouse"><span class="ico">🏛️</span>Clubhouse</button>
        <button class="btn" data-act="achievements"><span class="ico">🏅</span>Achievements</button>
        <button class="btn" data-act="leaderboard"><span class="ico">🏆</span>Leaderboard</button>
        ${tut ? '' : '<button class="btn" data-act="tutorial"><span class="ico">🎓</span>Tutorial</button>'}
        <button class="btn" data-act="settings"><span class="ico">⚙️</span>Settings</button>
      </div>
      <div class="center muted" style="font-size:11px;margin-top:auto;padding-top:10px">v${VERSION} · Add to Home Screen for full-screen play</div>
    </div></div>`;
  }
  mounted() { document.body.dataset.act = '1'; audio.music({ ...ACTS[1].music, style: 'lounge', bpm: 80 }, 0); }
  async action(act) {
    const app = this.app;
    if (act === 'continue') return app.continueRun();
    if (act === 'tutorial') return app.startTutorial();
    if (act === 'new') {
      if (app.run) {
        const ok = await app.modal({ title: 'Start a new run?', html: '<p class="muted">Your current run will be abandoned (counts as a loss).</p>', buttons: [{ label: 'Abandon & start new', value: true, cls: 'danger' }, { label: 'Cancel', value: false }] });
        if (!ok) return;
        app.gameOver();
      }
      return app.show('chars', { mode: 'normal' });
    }
    if (act === 'daily') {
      const d = app.dailySetup();
      const ch = CHAR_MAP[d.char];
      const mod = d.mod ? CHALLENGE_MAP[d.mod] : null;
      const best = app.profile.daily[d.key];
      const go = await app.modal({
        title: '📅 Daily Run',
        html: `<p>Everyone gets the same seed today.</p><div class="panel col" style="gap:6px"><div>Seed: <b>${d.seed}</b></div><div>Character: <b>${ch.icon} ${ch.name}</b></div><div>Modifier: <b>${mod ? mod.icon + ' ' + mod.name : 'None'}</b>${mod ? `<div class="muted" style="font-size:12px">${esc(mod.desc)}</div>` : ''}</div>${best ? `<div>Your best today: <b>${best}</b></div>` : ''}</div>`,
        buttons: [{ label: 'Start Daily', value: true, cls: 'primary' }, { label: 'Cancel', value: false }],
      });
      if (!go) return;
      if (app.run) app.gameOver();
      return app.newRun({ char: d.char, seed: d.seed, mode: 'daily', dailyMod: d.mod, dailyKey: d.key });
    }
    app.show(act === 'challenges' ? 'challenges' : act);
  }
}

// ─────────────────────────────── CHARACTER SELECT ───────────────────────────────
export class CharSelectScreen extends Screen {
  constructor(app, params) {
    super(app, params);
    this.sel = app.profile.unlocked.chars.includes(params.last) ? params.last : 'rookie';
    this.asc = app.profile.ascension ? Math.min(app.profile.ascension, app.profile.lastAsc ?? app.profile.ascension) : 0;
    this.seed = '';
  }
  render() {
    const p = this.app.profile;
    const ch = CHAR_MAP[this.sel];
    const ch_ = this.params.challenge ? CHALLENGE_MAP[this.params.challenge] : null;
    const tiles = CHARACTERS.map((c) => {
      const locked = !p.unlocked.chars.includes(c.id);
      return `<button class="char-tile ${c.id === this.sel ? 'sel' : ''} ${locked ? 'locked' : ''}" data-act="pick:${c.id}">${locked ? '<span class="lock">🔒</span>' : ''}<div class="ico">${c.icon}</div><div class="nm">${esc(c.name)}</div></button>`;
    }).join('');
    const locked = !p.unlocked.chars.includes(ch.id);
    const asc = ASCENSION[this.asc];
    return `<div class="header">${back()}<h2>${ch_ ? ch_.icon + ' ' + esc(ch_.name) : 'Choose your player'}</h2></div>
      <div class="scroll col" style="padding-top:0">
        ${ch_ ? `<div class="panel" style="font-size:13px">${esc(ch_.desc)}</div>` : ''}
        <div class="char-grid">${tiles}</div>
        <div class="panel">
          <div class="char-detail"><div class="big">${ch.icon}</div><div class="grow"><h3 style="font-size:20px">${esc(ch.name)}</h3><div class="muted" style="font-style:italic;font-size:13px">"${esc(ch.tagline)}"</div>
          <div style="margin-top:6px;font-size:13px">❤️ ${ch.hp} HP</div></div></div>
          <p style="font-size:14px;line-height:1.4">${esc(ch.perk)}</p>
          ${locked ? `<div class="tag" style="color:var(--gold)">🔒 ${esc(ch.unlock.text)}</div>` : `<div class="chips">${ch.items.map((id) => itemChip(id)).join('')}${ch.consumables.map((id) => itemChip(id)).join('')}</div>
          <div class="chips" style="margin-top:6px">${ch.deck.map((id) => cardChip(id)).join('')}</div>`}
        </div>
        ${p.ascension > 0 ? `<div class="panel"><div class="row"><div class="grow"><b>Ascension ${this.asc}</b><div class="muted" style="font-size:12px">${this.asc ? esc(asc.name + ': ' + asc.desc) + (this.asc > 1 ? ' (+ all lower levels)' : '') : 'Standard difficulty'}</div></div>
          <div class="stepper"><button data-act="asc:-1">−</button><button data-act="asc:1">+</button></div></div></div>` : ''}
        ${this.params.mode !== 'daily' ? `<div><div class="section-title">Seed (optional — share runs!)</div><input class="input" id="seed" placeholder="RANDOM" maxlength="24" value="${esc(this.seed)}" autocomplete="off" autocapitalize="characters"></div>` : ''}
        <button class="btn primary" data-act="start" ${locked ? 'disabled' : ''}>START RUN</button>
      </div>`;
  }
  mounted() {
    const inp = this.$('#seed');
    if (inp) {
      inp.addEventListener('input', () => { this.seed = normalizeSeed(inp.value); });
      inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }
  action(act) {
    const [k, v] = act.split(':');
    if (k === 'back') return this.app.show(this.params.challenge ? 'challenges' : 'title');
    if (k === 'pick') { this.sel = v; haptics.tick(); }
    if (k === 'asc') this.asc = Math.max(0, Math.min(this.app.profile.ascension, this.asc + +v));
    if (k === 'start') {
      this.app.profile.lastAsc = this.asc;
      return this.app.newRun({ char: this.sel, seed: this.seed || null, ascension: this.asc, mode: this.params.challenge ? 'challenge' : 'normal', challenge: this.params.challenge || null });
    }
    this.refresh();
  }
}

// ─────────────────────────────── CHALLENGES ───────────────────────────────
export class ChallengesScreen extends Screen {
  render() {
    const lb = this.app.profile.leaderboard;
    return `<div class="header">${back()}<h2>🎯 Challenge Modes</h2></div>
      <div class="scroll col" style="padding-top:0">
      <p class="muted" style="margin:0">Alternate rules, separate high scores.</p>
      ${CHALLENGES.map((c) => {
        const best = lb.filter((e) => e.challenge === c.id).reduce((m, e) => Math.max(m, e.score), 0);
        return `<button class="offer" data-act="c:${c.id}"><div class="ico" style="--r:var(--accent)">${c.icon}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.desc)}</div>${best ? `<div class="rar" style="--r:var(--gold)">Best: ${best}</div>` : ''}</div></button>`;
      }).join('')}</div>`;
  }
  action(act) {
    if (act === 'back') return this.app.show('title');
    const [, id] = act.split(':');
    if (this.app.run) { this.app.toast('Finish or abandon your current run first.'); return; }
    this.app.show('chars', { mode: 'challenge', challenge: id });
  }
}

// ─────────────────────────────── SETTINGS ───────────────────────────────
export class SettingsScreen extends Screen {
  render() {
    const s = this.app.profile.settings;
    const tog = (k, label, sub = '') => `<div class="setting"><label>${label}${sub ? `<div class="muted" style="font-size:12px;font-weight:500">${sub}</div>` : ''}</label><button class="toggle ${s[k] ? 'on' : ''}" data-act="tog:${k}" aria-label="${label}"></button></div>`;
    return `<div class="header">${back()}<h2>⚙️ Settings</h2></div>
      <div class="scroll" style="padding-top:0">
        <div class="setting"><label>Sound effects</label><input class="slider" type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx" style="flex:1"></div>
        <div class="setting"><label>Music</label><input class="slider" type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music" style="flex:1"></div>
        ${tog('haptics', 'Haptics', 'Vibration on hits & sinks (Android)')}
        ${tog('guide', 'Aim guide', 'Show the aiming line & ghost ball')}
        ${tog('leftHanded', 'Left-handed controls', 'Swap power and fine-aim sides')}
        <div class="section-title">How to play</div>
        <div class="panel" style="font-size:13px;line-height:1.5">
          <b>Aim:</b> drag anywhere on the table. <b>Shoot:</b> pull the POWER slider down and release — or drag back from the cue ball like a slingshot.<br>
          <b>Fine aim:</b> slide the ridged strip. <b>Spin:</b> drag the dot on the white ball (double-tap to reset).<br>
          <b>Zoom:</b> pinch the table, double-tap to reset. <b>Fast-forward:</b> hold the table while balls roll.<br>
          <b>Combat:</b> your solids deal damage when sunk. Banks, combos, kicks and multi-sinks multiply it. Their stripes, your fouls and misses hurt you. Clear your group then sink the 8 for a finisher.
        </div>
        <div class="section-title">Data</div>
        <button class="btn danger" data-act="reset">Reset all progress</button>
        <p class="muted center" style="font-size:11px">Rack &amp; Ruin v${VERSION}. Everything is saved on this device.</p>
      </div>`;
  }
  mounted() {
    for (const sl of this.$$('.slider')) {
      sl.addEventListener('input', () => { this.app.profile.settings[sl.dataset.k] = +sl.value; this.app.applySettings(); });
      sl.addEventListener('change', () => { this.app.saveProfile(); audio.coin(); });
    }
  }
  async action(act) {
    const [k, v] = act.split(':');
    if (k === 'back') {
      if (this.params.back === 'resume') return this.app.continueRun();
      return this.app.show('title');
    }
    if (k === 'tog') { this.app.profile.settings[v] = !this.app.profile.settings[v]; this.app.applySettings(); this.app.saveProfile(); haptics.tick(); this.refresh(); }
    if (k === 'reset') {
      const ok = await this.app.modal({ title: 'Reset everything?', html: '<p class="muted">All unlocks, Legend Points, achievements and your current run will be erased.</p>', buttons: [{ label: 'Erase everything', value: true, cls: 'danger' }, { label: 'Cancel', value: false }] });
      if (!ok) return;
      this.app.profile = defaultProfile();
      this.app.clearRun();
      this.app.saveProfile();
      this.app.applySettings();
      this.app.show('title');
    }
  }
}

// ─────────────────────────────── COLLECTION ───────────────────────────────
export class CollectionScreen extends Screen {
  constructor(app, params) { super(app, params); this.tab = 'items'; }
  render() {
    const p = this.app.profile;
    const tabs = [['items', 'Powerups'], ['cards', 'Cards'], ['bosses', 'Bosses'], ['enemies', 'Opponents'], ['chars', 'Players'], ['npcs', 'Characters'], ['endings', 'Endings']];
    let body = '';
    const cell = (known, icon, act, rar = '') => `<button class="book-cell ${known ? '' : 'unknown'} ${rar ? 'r-' + rar : ''}" data-act="${known ? act : 'unknown'}">${icon}</button>`;
    if (this.tab === 'items') {
      const groups = [['cue', 'Cue Upgrades'], ['ball', 'Ball Modifiers'], ['relic', 'Relics'], ['curse', 'Curses'], ['consumable', 'Consumables']];
      const n = ITEMS.filter((i) => p.seen.items[i.id]).length;
      body = `<p class="muted">${n} / ${ITEMS.length} discovered</p>` + groups.map(([t, name]) => `<div class="section-title">${name}</div><div class="book-grid">${ITEMS.filter((i) => i.type === t).map((i) => cell(p.seen.items[i.id], i.icon, 'item:' + i.id, i.rarity)).join('')}</div>`).join('');
    } else if (this.tab === 'cards') {
      body = `<div class="book-grid">${CARDS.map((c) => cell(p.seen.cards[c.id] || CHARACTERS.some((ch) => ch.deck.includes(c.id) && p.unlocked.chars.includes(ch.id)), c.icon, 'card:' + c.id, c.rarity)).join('')}</div>`;
    } else if (this.tab === 'bosses') {
      body = BOSSES.map((b) => {
        const k = p.seen.bosses[b.id];
        const wins = p.stats.bosses[b.id] || 0;
        return `<div class="ach ${k ? '' : 'locked'}"><div class="ico">${k ? b.icon : '❔'}</div><div class="grow"><b>${k ? esc(b.name) : '???'}</b><div class="muted" style="font-size:12px">${k ? esc(b.title) + ` · Acts ${b.acts.join('/')}` : 'Not yet encountered'}</div>${k ? `<div style="font-size:12px">Defeated ×${wins} · Drops ${ITEM_MAP[b.relic].icon} ${esc(ITEM_MAP[b.relic].name)}</div>` : ''}</div></div>`;
      }).join('');
    } else if (this.tab === 'enemies') {
      body = [1, 2, 3, 4].map((a) => `<div class="section-title">Act ${ACTS[a].roman} · ${ACTS[a].name}</div><div class="book-grid">${[...ENEMIES, ...ELITES].filter((e) => e.act === a).map((e) => cell(p.seen.enemies[e.id], e.icon, 'enemy:' + e.id, e.traits ? 'cursed' : '')).join('')}</div>`).join('');
    } else if (this.tab === 'chars') {
      body = CHARACTERS.map((c) => {
        const u = p.unlocked.chars.includes(c.id);
        return `<div class="ach ${u ? '' : 'locked'}"><div class="ico">${c.icon}</div><div class="grow"><b>${esc(c.name)}</b><div class="muted" style="font-size:12px">${u ? esc(c.perk) : '🔒 ' + esc(c.unlock.text)}</div></div></div>`;
      }).join('');
    } else if (this.tab === 'npcs') {
      const list = [['mentor', NPCS.mentor, `Met ${p.npc.mentor.met}×`], ['rival', { ...NPCS.rival, icon: RIVAL.icon }, `Level ${p.npc.rival.level + 1} · beaten ${p.npc.rival.wins}×`], ['oracle', NPCS.oracle, `Consulted ${p.npc.oracle.asks}×`], ['raccoon', NPCS.raccoon, `Beaten ${p.npc.raccoon.beaten}× · robbed you ${p.npc.raccoon.robbed}×`]];
      body = list.map(([id, n, s]) => {
        const k = p.seen.npcs[id];
        return `<div class="ach ${k ? '' : 'locked'}"><div class="ico">${k ? n.icon : '❔'}</div><div class="grow"><b>${k ? esc(n.name) : '???'}</b><div class="muted" style="font-size:12px">${k ? esc(n.title) + ' · ' + s : 'Not yet met'}</div></div></div>`;
      }).join('');
    } else if (this.tab === 'endings') {
      body = Object.entries(ENDINGS).map(([id, e]) => {
        const k = p.seen.endings[id];
        return `<div class="ach ${k ? '' : 'locked'}"><div class="ico">${k ? e.icon : '❔'}</div><div class="grow"><b>${k ? esc(e.title) : e.secret ? 'Secret ending' : '???'}</b><div class="muted" style="font-size:12px">${k ? 'Seen' : e.secret ? 'Some say the Oracle knows…' : 'Win a run'}</div></div></div>`;
      }).join('');
    }
    return `<div class="header">${back()}<h2>📚 Collection</h2></div>
      <div class="scroll" style="padding-top:0"><div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-act="tab:${id}">${n}</button>`).join('')}</div>${body}</div>`;
  }
  action(act) {
    const [k, v] = act.split(':');
    if (k === 'back') return this.app.show('title');
    if (k === 'tab') { this.tab = v; this.keepScroll = true; this.refresh(); this.keepScroll = false; return; }
    if (k === 'item') return this.app.showDetail('item', v);
    if (k === 'card') return this.app.showDetail('card', v);
    if (k === 'enemy') {
      const e = [...ENEMIES, ...ELITES].find((x) => x.id === v);
      return this.app.modal({ title: `${e.icon} ${esc(e.name)}`, html: `<p class="muted">"${esc(e.quote)}"</p><p>Act ${e.act}${e.traits ? ' · Elite' : ''}</p>` });
    }
    if (k === 'unknown') this.app.toast('❔ Not discovered yet');
  }
}

// ─────────────────────────────── CLUBHOUSE ───────────────────────────────
export class ClubhouseScreen extends Screen {
  render() {
    const p = this.app.profile;
    const owned = (c) => (c.kind === 'item' ? p.unlocked.items.includes(c.ref) : c.kind === 'felt' ? p.unlocked.felts.includes(c.ref) : p.unlocked.cues.includes(c.ref));
    const row = (c) => {
      const o = owned(c);
      const equipped = (c.kind === 'felt' && p.settings.felt === c.ref) || (c.kind === 'cue' && p.settings.cue === c.ref);
      const icon = c.kind === 'item' ? ITEM_MAP[c.ref].icon : c.icon;
      const name = c.kind === 'item' ? ITEM_MAP[c.ref].name : c.name;
      const desc = c.kind === 'item' ? ITEM_MAP[c.ref].desc : c.kind === 'felt' ? 'Table cloth for every act.' : 'Cue stick skin.';
      const rar = c.kind === 'item' ? ITEM_MAP[c.ref].rarity : 'common';
      const right = !o ? `<div class="price">⭐ ${c.cost}</div>` : c.kind === 'item' ? '<div class="price" style="color:var(--good)">IN POOL</div>' : `<div class="price" style="color:${equipped ? 'var(--good)' : 'var(--muted)'}">${equipped ? 'EQUIPPED' : 'EQUIP'}</div>`;
      return `<button class="offer r-${rar}" data-act="${o ? (c.kind === 'item' ? 'info:' + c.ref : 'equip:' + c.id) : 'buy:' + c.id}"><div class="ico">${icon}</div><div class="grow"><div class="t">${esc(name)}</div><div class="d">${esc(desc)}</div></div>${right}</button>`;
    };
    const def = (kind, ref, name, icon) => {
      const eq = p.settings[kind] === ref;
      return `<button class="offer" data-act="equip:${kind}:${ref}"><div class="ico">${icon}</div><div class="grow"><div class="t">${name}</div></div><div class="price" style="color:${eq ? 'var(--good)' : 'var(--muted)'}">${eq ? 'EQUIPPED' : 'EQUIP'}</div></button>`;
    };
    const dash = p.unlocked.cues.includes('dash') ? def('cue', 'dash', "Dash's Flash (rival reward)", '⚡') : '';
    return `<div class="header">${back()}<h2>🏛️ Clubhouse</h2><span class="lp-pill">⭐ ${p.lp}</span></div>
      <div class="scroll col" style="padding-top:0">
        <p class="muted" style="margin:0;font-size:13px">Spend Legend Points (earned every run) to add powerups to the loot pool and unlock cosmetics.</p>
        <div class="section-title">Loot pool unlocks</div>${CLUBHOUSE.filter((c) => c.kind === 'item').map(row).join('')}
        <div class="section-title">Table felts</div>${def('felt', 'default', 'Act default felt', '🟩')}${CLUBHOUSE.filter((c) => c.kind === 'felt').map(row).join('')}
        <div class="section-title">Cue skins</div>${def('cue', 'maple', 'Classic Maple', '🪵')}${dash}${CLUBHOUSE.filter((c) => c.kind === 'cue').map(row).join('')}
        <div class="section-title">Quest rewards</div>
        ${[...LOCKED_ITEMS].filter((id) => !CLUBHOUSE.some((c) => c.ref === id)).map((id) => `<div class="offer r-${ITEM_MAP[id].rarity} ${p.unlocked.items.includes(id) ? '' : 'sold'}" style="${p.unlocked.items.includes(id) ? '' : 'opacity:.5'}"><div class="ico">${p.unlocked.items.includes(id) ? ITEM_MAP[id].icon : '🔒'}</div><div class="grow"><div class="t">${p.unlocked.items.includes(id) ? esc(ITEM_MAP[id].name) : '???'}</div><div class="d">${p.unlocked.items.includes(id) ? 'Unlocked' : 'Earned by befriending the regulars…'}</div></div></div>`).join('')}
      </div>`;
  }
  action(act) {
    const p = this.app.profile;
    const parts = act.split(':');
    const k = parts[0];
    if (k === 'back') return this.app.show('title');
    if (k === 'info') return this.app.showDetail('item', parts[1]);
    if (k === 'buy') {
      const c = CLUBHOUSE.find((x) => x.id === `${parts[1]}:${parts[2]}`);
      if (!c) return;
      if (p.lp < c.cost) { audio.error(); this.app.toast(`Need ⭐ ${c.cost} Legend Points.`); return; }
      p.lp -= c.cost;
      if (c.kind === 'item') p.unlocked.items.push(c.ref);
      if (c.kind === 'felt') { p.unlocked.felts.push(c.ref); p.settings.felt = c.ref; }
      if (c.kind === 'cue') { p.unlocked.cues.push(c.ref); p.settings.cue = c.ref; }
      audio.buy(); haptics.big();
      this.app.toast('🔓 Unlocked!');
    }
    if (k === 'equip') {
      if (parts.length === 3 && (parts[1] === 'felt' || parts[1] === 'cue') && !parts[2].includes(':')) {
        const kind = parts[1], ref = parts[2];
        if (kind === 'felt' && (ref === 'default' || FELT_SKINS[ref])) p.settings.felt = ref;
        if (kind === 'cue' && CUE_SKINS[ref]) p.settings.cue = ref;
      }
    }
    this.app.saveProfile();
    this.refresh();
  }
}

// ─────────────────────────────── ACHIEVEMENTS ───────────────────────────────
export class AchievementsScreen extends Screen {
  render() {
    const p = this.app.profile;
    const got = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
    return `<div class="header">${back()}<h2>🏅 Achievements</h2><span class="tag">${got}/${ACHIEVEMENTS.length}</span></div>
      <div class="scroll col" style="padding-top:0">${ACHIEVEMENTS.map((a) => {
        const has = p.achievements[a.id];
        const hidden = a.secret && !has;
        return `<div class="ach ${has ? '' : 'locked'}"><div class="ico">${hidden ? '❔' : a.icon}</div><div class="grow"><b>${hidden ? 'Secret' : esc(a.name)}</b><div class="muted" style="font-size:12px">${hidden ? 'Keep playing…' : esc(a.desc)}</div></div>${has ? '✅' : ''}</div>`;
      }).join('')}
      <div class="section-title">Lifetime</div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${p.stats.runs}</div><div class="k">Runs</div></div>
        <div class="stat"><div class="v">${p.stats.wins}</div><div class="k">Wins</div></div>
        <div class="stat"><div class="v">${p.stats.ballsSunk}</div><div class="k">Balls sunk</div></div>
        <div class="stat"><div class="v">${Math.round(p.stats.damage)}</div><div class="k">Damage</div></div>
      </div></div>`;
  }
  action(act) { if (act === 'back') this.app.show('title'); }
}

// ─────────────────────────────── LEADERBOARD ───────────────────────────────
export class LeaderboardScreen extends Screen {
  constructor(app, params) { super(app, params); this.tab = 'all'; }
  render() {
    const p = this.app.profile;
    let list = p.leaderboard;
    if (this.tab === 'daily') list = list.filter((e) => e.mode === 'daily');
    if (this.tab === 'challenge') list = list.filter((e) => e.challenge);
    const rows = list.slice(0, 30).map((e, i) => `<div class="lb-row"><div class="rank">${i + 1}</div><div>${CHAR_MAP[e.char]?.icon || ''} <b>${e.score}</b> <span class="muted" style="font-size:11px">${e.won ? '🏆 Won' : 'Act ' + e.act}${e.asc ? ' · A' + e.asc : ''}${e.challenge ? ' · ' + CHALLENGE_MAP[e.challenge]?.icon : ''}${e.mode === 'daily' ? ' · 📅' : ''}</span></div><div class="muted" style="font-size:11px">${new Date(e.date).toLocaleDateString()}</div></div>`).join('');
    return `<div class="header">${back()}<h2>🏆 Leaderboard</h2></div>
      <div class="scroll" style="padding-top:0">
        <div class="tabs">${[['all', 'All runs'], ['daily', 'Daily'], ['challenge', 'Challenges']].map(([id, n]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-act="tab:${id}">${n}</button>`).join('')}</div>
        ${rows || '<p class="muted center">No runs yet. Go make history.</p>'}
        <p class="muted" style="font-size:11px;margin-top:14px">These are your best runs on this device. The global daily leaderboard needs a small backend — see docs/ARCHITECTURE.md.</p>
      </div>`;
  }
  action(act) {
    const [k, v] = act.split(':');
    if (k === 'back') return this.app.show('title');
    if (k === 'tab') { this.tab = v; this.refresh(); }
  }
}
