// The match screen: HUD, canvas table, touch controls, loadout tray, intros,
// coach (tutorial) and all the juice wired to Fight events.
import { Screen } from '../screen.js';
import { el, esc, hpBar, setHp, describe, confetti } from '../dom.js';
import { Fight } from '../../game/fight.js';
import { Renderer } from '../../render/renderer.js';
import { aimGuide, tracePreview } from '../../physics/predict.js';
import { remaining } from '../../game/rules.js';
import { audio } from '../../core/audio.js';
import { haptics } from '../../core/haptics.js';
import { PHYS, TABLE, BALL_COLORS } from '../../config.js';
import { ITEM_MAP } from '../../data/items.js';
import { CARD_MAP } from '../../data/cards.js';
import { ACTS, TUTORIAL_THEME, FELT_SKINS } from '../../data/acts.js';
import { BOSS_MAP } from '../../data/bosses.js';
import { TRAITS, TABLE_MODS } from '../../data/enemies.js';
import { CHAR_MAP } from '../../data/characters.js';
import { TUTORIAL } from '../../data/tutorial.js';
import { NPCS } from '../../data/npcs.js';

export class MatchScreen extends Screen {
  constructor(app, params) {
    super(app, params);
    this.cls = 'match';
    const run = app.run;
    this.lesson = params.tutorial !== undefined ? TUTORIAL[params.tutorial] : null;
    let enc = params.enc;
    if (this.lesson) {
      run.items = (this.lesson.items || []).map((id) => ({ id, n: 1 }));
      run.hp = run.maxHp = 70;
      enc = this.lesson.scenario
        ? { key: 'tut-' + this.lesson.id, kind: 'tutorial', act: 1, enemies: [], scenario: this.lesson.scenario }
        : { key: 'tut-fight', ...this.lesson.fight };
    }
    this.enc = enc;
    this.fight = params.resume && run.fight ? new Fight(run, run.fight.enc, run.fight) : new Fight(run, enc);
    this.theme = this.lesson ? TUTORIAL_THEME : ACTS[enc.act || run.act || 1];
    this.pointers = new Map();
    this.mode = null;
    this.previewKey = '';
    this.previewT = 0;
    this.preview = null;
    this.sheet = null;
    this.lastTap = 0;
    this.bubbleTimers = {};
  }

  render() {
    const left = this.app.profile.settings.leftHanded;
    return `
      <div class="hud">
        <div class="fighter player" data-act="inv">
          <div class="av">${CHAR_MAP[this.app.run.char]?.icon || '🧢'}</div>
          <div class="info"><div class="nm">YOU <span class="ball-dot" style="background:${BALL_COLORS[1]}"></span> <span class="p-left"></span></div>
          <div class="p-hp">${hpBar(this.app.run.hp, this.app.run.maxHp)}</div><div class="st p-st"></div></div>
        </div>
        <div class="vs">VS<span class="coins hud-coins"></span></div>
        <div class="enemies col" style="flex:1;gap:4px;min-width:0"></div>
      </div>
      <div class="table-area">
        <canvas></canvas>
        <div class="turn-pill"></div>
        <div class="side-ctl ${left ? 'left' : 'right'} power"><div class="lbl top">POWER</div><div class="power-fill"></div><div class="power-handle">⬇</div><div class="power-pct"></div></div>
        <div class="side-ctl ${left ? 'right' : 'left'} fine"><div class="lbl top">FINE</div><div class="fine-ridges"></div></div>
        <div class="banner-root"></div>
        <div class="ffwd"></div>
      </div>
      <div class="controls" style="position:relative">
        <div class="spin-pad"><div class="spin-ball"><div class="spin-dot"></div><div class="spin-lbl">SPIN</div></div></div>
        <div class="loadout"></div>
      </div>`;
  }

  mounted() {
    const f = this.fight;
    this.canvas = this.$('canvas');
    this.area = this.$('.table-area');
    this.renderer = new Renderer(this.canvas);
    const s = this.app.profile.settings;
    this.renderer.setTheme(this.theme, FELT_SKINS[s.felt] || null, s.cue);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.area);
    this.resize();
    this.bindInput();
    this.bindFight();
    this.renderEnemies();
    this.updateHud();
    this.renderLoadout();
    audio.music(this.theme.music, this.enc.kind === 'boss' ? 2 : this.lesson ? 0 : 1);
    if (f.stats.noSpin) this.$('.spin-pad').classList.add('locked');
    if (this.params.resume) { f.resume(); this.updateHud(); this.renderLoadout(); }
    else this.showIntro();
  }

  cleanup() {
    this.ro?.disconnect();
    audio.setIntensity(0);
  }

  resize() {
    const r = this.area.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.renderer.resize(r.width, r.height);
  }

  // ───────────────────────── intro ─────────────────────────

  showIntro() {
    const f = this.fight;
    const enc = this.enc;
    if (this.lesson) return this.coach(this.lesson.coach, () => f.start(), this.lesson.title);
    if (enc.kind === 'trick') {
      const n = this.app.profile.npc.raccoon.beaten;
      return this.coach([NPCS.raccoon.greet(n), `Sink the ${enc.scenario.target}-ball. You get 2 tries. Don't scratch.`], () => f.start(), '🦝 Bandit\'s Trick Shot', '🦝 BANDIT');
    }
    const boss = enc.boss ? BOSS_MAP[enc.boss] : null;
    const ov = el(`<div class="overlay ${boss ? 'boss' : ''}"></div>`);
    if (boss) {
      audio.bossIntro();
      haptics.big();
      let i = 0;
      ov.innerHTML = `<div class="intro-card"><div class="title">${esc(boss.title)}</div><div class="big">${boss.icon}</div><h2>${esc(boss.name)}</h2><div class="boss-line"></div><div class="muted" style="font-size:12px">tap to continue</div></div>`;
      const line = ov.querySelector('.boss-line');
      const next = () => {
        if (i < boss.intro.length) { line.textContent = boss.intro[i++]; line.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1 }], 300); }
        else { ov.remove(); this.vsFlash(() => f.start()); }
      };
      ov.addEventListener('click', () => { audio.tap(); next(); });
      next();
    } else {
      const e = enc.enemies[0];
      const traits = (e.traits || []).map((t) => `<span class="trait">${TRAITS[t].icon} ${TRAITS[t].name}: ${TRAITS[t].desc}</span>`).join('');
      const mods = (enc.tableMods || []).map((m) => `<span class="trait">${TABLE_MODS[m].icon} ${TABLE_MODS[m].name}: ${TABLE_MODS[m].desc}</span>`).join('');
      const kindTag = enc.kind === 'elite' ? '<span class="tag" style="color:#ff8a80">💀 ELITE</span>' : '<span class="tag">⚔️ MATCH</span>';
      ov.innerHTML = `<div class="intro-card">${kindTag}<div class="big" style="margin-top:12px">${e.icon}</div><h2>${esc(f.enemies[0].name)}</h2>
        <div class="quote">"${esc(e.quote || '...')}"</div><div class="traits">${traits}${mods}</div>
        <div class="muted" style="font-size:13px;margin-top:10px">HP ${f.enemies[0].maxHp} · Hits for ${f.enemies[0].dmg} per ball</div>
        <button class="btn primary" style="margin-top:18px">RACK 'EM 🎱</button></div>`;
      ov.querySelector('button').addEventListener('click', () => { audio.ui(); ov.remove(); f.start(); });
    }
    this.root.appendChild(ov);
  }

  vsFlash(cb) {
    const ov = el('<div class="overlay" style="background:rgba(0,0,0,0.4)"><div class="vsflash">FIGHT!</div></div>');
    this.root.appendChild(ov);
    haptics.big();
    setTimeout(() => { ov.remove(); cb(); }, 900);
  }

  coach(lines, done, title = '', who = '👴 OLD CHALKY') {
    let i = 0;
    const box = el(`<div class="coach"><div class="who">${who}${title ? ' — ' + esc(title) : ''}</div><div class="txt"></div><div class="next">TAP ▶</div></div>`);
    const txt = box.querySelector('.txt');
    const ov = el('<div class="overlay" style="background:rgba(0,0,0,0.35);justify-content:flex-end;padding-bottom:30px"></div>');
    ov.appendChild(box);
    box.style.position = 'relative'; box.style.left = '0'; box.style.right = '0'; box.style.width = '100%';
    const step = () => {
      if (i < lines.length) { txt.innerHTML = esc(lines[i++]).replace(/(DRAG|PULL DOWN|LET GO|DOWN|ARM|Tap|SOLIDS|STRIPES)/g, '<b>$1</b>'); }
      else { ov.remove(); this.hint = lines[lines.length - 1]; done(); }
    };
    ov.addEventListener('click', () => { audio.tap(); step(); });
    step();
    this.area.appendChild(ov);
  }

  tutorialNext(won) {
    const idx = this.params.tutorial;
    if (!won) { this.app.show('match', { tutorial: idx }, { record: false }); return; }
    if (idx + 1 < TUTORIAL.length) this.app.show('match', { tutorial: idx + 1 }, { record: false });
    else this.app.finishTutorial();
  }

  // ───────────────────────── fight events → juice ─────────────────────────

  bindFight() {
    const f = this.fight, r = this.renderer, fx = r.fx;
    f.on('hud', () => this.updateHud());
    f.on('hand', () => this.renderLoadout());
    f.on('turn', (who) => {
      this.closeSheet();
      this.renderLoadout();
      this.updateHud();
      this.preview = null;
      if (who === 'player' && !f.scenario) {
        if (f.isBreak) this.banner('BREAK!', '#ffd54f', 0.8);
        else if (f.ballInHand) this.banner('BALL IN HAND', '#80deea', 0.9);
      }
    });
    f.on('rack', () => { r.sprites.clear(); this.updateHud(); });
    f.on('shot', (shot) => {
      this.closeSheet();
      if (!shot.tilt) { audio.cue(shot.power || 0.5); haptics.cue(shot.power || 0.5); }
      else { this.banner('THE TABLE TILTS!', '#bcaaa4', 0.9); audio.phase(); }
      this.renderLoadout();
      this.preview = null;
    });
    f.on('collide', (a, b, imp) => {
      audio.clack(imp);
      if (imp > 300) haptics.hit(imp);
      fx.clack((a.x + b.x) / 2, (a.y + b.y) / 2, imp);
    });
    f.on('cushion', (b, kind, imp) => { if (imp > 120) audio.cushion(imp); });
    f.on('pocket', (ball, pocket) => {
      r.addSinking(ball, pocket);
      audio.pocket();
      haptics.sink();
      const col = ball.group === 'cue' ? '#ffffff' : ball.mods.gold ? '#ffd54f' : BALL_COLORS[ball.num] || '#fff';
      fx.sink(pocket.x, pocket.y, col);
      fx.shake(ball.group === 'solid' ? 4 : 2);
    });
    f.on('explode', (x, y, rad, depth) => { fx.explosion(x, y, rad, depth > 0); audio.explode(); haptics.big(); });
    f.on('split', (b) => { fx.burst(b.x, b.y, '#fff', 16, 300, 0.5, 3); fx.text(b.x, b.y - 20, 'SPLIT!', '#80deea', 16); audio.hit(); });
    f.on('lightning', (arcs) => { fx.lightning(arcs); audio.zap(); haptics.big(); });
    f.on('ghost', (c) => { audio.ghost(); fx.burst(c.x, c.y, '#b0bec5', 10, 120, 0.5, 3); });
    f.on('text', (x, y, s, c, size) => fx.text(x, y, s, c, size));
    f.on('banner', (s, c, d) => this.banner(s, c, d));
    f.on('say', (e, s) => this.say(e, s));
    f.on('shake', (a) => fx.shake(a));
    f.on('coins', (n, silent) => {
      this.updateHud();
      if (n > 0 && !silent) { audio.coin(); const cue = f.sim.cue; fx.coins(cue.x, cue.y - 10, n); }
    });
    f.on('heal', (n) => { audio.heal(); this.floatHud('.p-hp', `+${n}`, '#69f0ae'); this.updateHud(); });
    f.on('hurtPlayer', (a, reason, x, y) => {
      audio.hurt(); haptics.hurt();
      fx.flashScreen('#ff1744', 0.3);
      fx.shake(Math.min(16, 5 + a));
      const label = reason && reason !== 'SINK' ? `-${a} ${reason}` : `-${a}`;
      if (x !== null && y !== null) fx.text(x, y - 18, label, '#ff5252', 20);
      else fx.text(TABLE.W / 2, TABLE.H * 0.62, label, '#ff5252', 24);
      this.floatHud('.p-hp', `-${a}`, '#ff5252');
      this.updateHud();
    });
    f.on('hurtEnemy', (e, a, x, y, tags) => {
      audio.hit(a >= 15);
      const big = a >= 20;
      if (x !== null && y !== null) {
        fx.text(x, y - 16, `${a}`, big ? '#ffd54f' : '#fff', big ? 30 : 22);
        if (tags?.length) fx.text(x, y - 46, tags.join(' · '), '#80d8ff', 14);
      } else {
        fx.text(TABLE.W / 2, TABLE.H * 0.38, `${a} ${tags?.[0] || ''}`, '#ffd54f', 22);
      }
      if (tags?.some((t) => /DOUBLE|TRIPLE|QUAD|PENTA|BANK|COMBO|8-BALL/.test(t))) {
        const t = tags.find((x) => /TRIPLE|QUAD|PENTA|8-BALL/.test(x)) || tags.find((x) => /DOUBLE|BANK|COMBO/.test(x));
        if (t) { this.banner(t, '#ffd54f', 0.8); audio.combo(tags.length); }
      }
      if (big) fx.shake(10);
      this.flashEnemy(e.idx);
      this.updateHud();
    });
    f.on('enemyDown', (e) => { this.banner(`${e.name} DOWN!`, '#69f0ae', 1.2); this.updateHud(); });
    f.on('burn', (e) => { this.flashEnemy(e.idx); });
    f.on('burnApplied', () => this.updateHud());
    f.on('phase', () => { audio.phase(); audio.setIntensity(3); haptics.big(); this.renderEnemies(); this.updateHud(); });
    f.on('cardPlayed', (c) => { audio.card(); this.banner(`${c.icon} ${c.name}`, '#fff59d', 0.8); });
    f.on('consumableUsed', (d) => { audio.card(); this.banner(`${d.icon} ${d.name}`, '#80cbc4', 0.8); this.renderLoadout(); });
    f.on('rewind', () => { r.sprites.clear(); this.renderLoadout(); this.updateHud(); });
    f.on('save', () => {
      if (this.app.run.mode === 'tutorial' || f.scenario) return;
      this.app.run.fight = f.serialize();
      this.app.saveRun();
    });
    f.on('scenarioShot', (ok) => { if (!ok) this.banner('TRY AGAIN', '#ffb74d', 0.8); });
    f.on('over', (result) => this.onOver(result));
  }

  onOver(result) {
    const f = this.fight;
    if (result.won) { audio.win(); if (!f.scenario) confetti(this.root); }
    else audio.lose();
    const title = f.scenario ? (result.won ? 'NAILED IT!' : 'MISSED!') : result.escaped ? 'ESCAPED' : result.won ? 'VICTORY!' : 'DEFEATED';
    const ov = el(`<div class="overlay" style="background:rgba(0,0,0,0.55)"><div class="vsflash" style="color:${result.won ? '#69f0ae' : '#ff5252'}">${title}</div></div>`);
    this.root.appendChild(ov);
    setTimeout(() => this.app.fightOver(f, result, this.params), result.won ? 1400 : 1700);
  }

  banner(text, color = '#fff', dur = 1.2) {
    const root = this.$('.banner-root');
    if (!root) return;
    root.innerHTML = '';
    const b = el(`<div class="banner" style="color:${color}">${esc(text)}</div>`);
    root.appendChild(b);
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, dur * 1000);
  }

  say(enemy, text) {
    const panel = this.$(`.fighter.enemy[data-idx="${enemy.idx}"]`);
    if (!panel) return;
    panel.querySelector('.bubble')?.remove();
    const b = el(`<div class="bubble">${esc(text)}</div>`);
    panel.appendChild(b);
    clearTimeout(this.bubbleTimers[enemy.idx]);
    this.bubbleTimers[enemy.idx] = setTimeout(() => b.remove(), 2600);
  }

  floatHud(sel, text, color) {
    const host = this.$(sel);
    if (!host) return;
    const r = host.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    const t = el(`<div style="position:absolute;left:${r.left - rr.left + r.width / 2}px;top:${r.top - rr.top}px;transform:translateX(-50%);font:900 18px var(--display);color:${color};text-shadow:0 2px 0 #000;z-index:40;pointer-events:none">${esc(text)}</div>`);
    this.root.appendChild(t);
    t.animate([{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-30px)', opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => t.remove();
  }

  flashEnemy(idx) {
    const p = this.$(`.fighter.enemy[data-idx="${idx}"]`);
    p?.animate([{ transform: 'translateX(-4px)', filter: 'brightness(2)' }, { transform: 'translateX(4px)' }, { transform: 'none', filter: 'none' }], 260);
  }

  // ───────────────────────── HUD ─────────────────────────

  renderEnemies() {
    const f = this.fight;
    const box = this.$('.enemies');
    if (!f.enemies.length) {
      box.innerHTML = this.enc.kind === 'trick'
        ? `<div class="fighter enemy" data-idx="0"><div class="av">🦝</div><div class="info"><div class="nm">BANDIT</div><div class="muted" style="font-size:11px">Shots left: <b class="shots-left"></b></div></div></div>`
        : `<div class="fighter enemy" data-idx="0"><div class="av">🎯</div><div class="info"><div class="nm">PRACTICE</div><div class="muted" style="font-size:11px">${esc(this.lesson?.title || '')}</div></div></div>`;
      return;
    }
    const compact = f.enemies.length > 1;
    box.innerHTML = f.enemies.map((e) => `
      <div class="fighter enemy ${compact ? 'compact' : ''}" data-idx="${e.idx}" data-act="target:${e.idx}">
        <div class="av">${e.icon}</div>
        <div class="info"><div class="nm">${esc(e.name)}${e.phase ? ' 😡' : ''} <span class="e-left"></span></div>
        <div class="e-hp">${hpBar(e.hp, e.maxHp, 'enemy')}</div>${compact ? '' : '<div class="st e-st"></div>'}</div>
      </div>`).join('');
  }

  updateHud() {
    const f = this.fight, run = this.app.run;
    if (!this.root) return;
    setHp(this.$('.p-hp .hpbar'), run.hp, run.maxHp);
    this.$('.hud-coins').textContent = f.scenario ? '' : `🪙${run.coins}`;
    const pl = this.$('.fighter.player');
    pl.classList.toggle('active', f.turn === 'player');
    if (f.sim.balls.length) this.$('.p-left').textContent = `×${remaining(f.sim, 'solid')}`;
    const pst = [];
    if (f.flags.forgiveFoul) pst.push('🥽');
    if (f.flags.freeMiss) pst.push('🥢');
    if (Object.values(f.charges).some((c) => c > 0)) pst.push(`⚡${Object.values(f.charges).reduce((a, b) => a + b, 0)}`);
    this.$('.p-st').textContent = pst.join(' ');
    for (const e of f.enemies) {
      const p = this.$(`.fighter.enemy[data-idx="${e.idx}"]`);
      if (!p) continue;
      setHp(p.querySelector('.hpbar'), e.hp, e.maxHp);
      p.classList.toggle('active', f.turn === 'enemy' && f.activeEnemy === e);
      p.classList.toggle('dead', e.dead);
      p.classList.toggle('target', f.enemies.length > 1 && f.target() === e);
      const left = p.querySelector('.e-left');
      if (left && f.sim.balls.length) left.textContent = `×${remaining(f.sim, 'stripe')}`;
      const st = p.querySelector('.e-st');
      if (st) {
        const s = [];
        if (e.status.burn) s.push(`🔥${e.status.burn}`);
        if (e.status.frozen) s.push('🧊');
        if (e.status.shrink) s.push(`🤏${e.status.shrink}`);
        for (const t of e.traits) s.push(TRAITS[t].icon);
        st.textContent = s.join(' ');
      }
    }
    const sl = this.$('.shots-left');
    if (sl && f.scenario) sl.textContent = Math.max(0, (f.scenario.maxShots || 99) - f.practiceShots);
    this.updatePill();
  }

  updatePill() {
    const f = this.fight;
    const pill = this.$('.turn-pill');
    if (!pill) return;
    let txt = '', cls = '';
    if (f.state === 'aim') {
      cls = 'you';
      txt = f.ballInHand ? (f.ballInHand === 'kitchen' ? 'YOUR BREAK · drag ✋ the cue ball behind the line' : 'BALL IN HAND · drag the cue ball') : f.isBreak ? 'YOUR BREAK' : 'YOUR SHOT';
    } else if (f.state === 'think' || f.state === 'enemyAim') {
      cls = 'them';
      txt = `${f.activeEnemy?.name || 'Opponent'} is ${f.state === 'think' ? 'thinking…' : 'aiming…'}`;
    } else if (f.state === 'moving') txt = '';
    pill.className = 'turn-pill ' + cls;
    pill.textContent = txt;
    pill.style.display = txt ? '' : 'none';
    const ff = this.$('.ffwd');
    ff.textContent = f.state === 'moving' ? (f.ffwd > 1 ? '⏩ FAST' : 'hold table to fast-forward') : '';
  }

  // ───────────────────────── loadout tray ─────────────────────────

  renderLoadout() {
    const f = this.fight, run = this.app.run;
    const lo = this.$('.loadout');
    if (!lo) return;
    const parts = [];
    const abil = run.items.filter((i) => ITEM_MAP[i.id]?.type === 'cue' && ITEM_MAP[i.id].charges);
    for (const inst of abil) {
      const d = ITEM_MAP[inst.id];
      const c = f.charges[d.id] ?? 0;
      parts.push(`<button class="lo-chip r-${d.rarity} ${f.armed.has(d.id) ? 'armed' : ''} ${c <= 0 ? 'empty' : ''}" data-act="abil:${d.id}">${d.icon}<span class="n">${c}</span></button>`);
    }
    if (parts.length) parts.push('<div class="lo-sep"></div>');
    f.hand.forEach((id, i) => {
      const d = CARD_MAP[id];
      if (!d) return;
      parts.push(`<button class="lo-card r-${d.rarity} ${f.cardPlayed && !d.free ? 'played' : ''}" data-act="card:${i}">${d.icon}<span class="cn">${esc(d.name)}</span></button>`);
    });
    if (!f.hand.length) parts.push('<div class="muted" style="font-size:10px;flex:none">no cards</div>');
    if (run.consumables.length) {
      parts.push('<div class="lo-sep"></div>');
      run.consumables.forEach((id, i) => {
        const d = ITEM_MAP[id];
        const usable = f.canUseConsumable(id);
        parts.push(`<button class="lo-chip r-${d.rarity} ${id === 'rewind' && usable && f.turn === 'enemy' ? 'armed' : ''} ${usable ? '' : 'empty'}" data-act="cons:${i}">${d.icon}</button>`);
      });
    }
    lo.innerHTML = parts.join('');
  }

  closeSheet() { this.sheet?.remove(); this.sheet = null; }

  openSheet(kind, ref) {
    this.closeSheet();
    const f = this.fight, run = this.app.run;
    let d, btn = '', disabled = false;
    if (kind === 'abil') {
      d = ITEM_MAP[ref];
      const armed = f.armed.has(ref);
      disabled = !f.canAct() || (!armed && !(f.charges[ref] > 0));
      btn = armed ? 'DISARM' : `ARM (${f.charges[ref] || 0} left)`;
    } else if (kind === 'card') {
      d = CARD_MAP[f.hand[ref]];
      disabled = !f.canAct() || (f.cardPlayed && !d.free);
      btn = f.cardPlayed && !d.free ? 'ALREADY PLAYED A CARD' : 'PLAY CARD';
    } else {
      d = ITEM_MAP[run.consumables[ref]];
      disabled = !f.canUseConsumable(run.consumables[ref]);
      btn = 'USE';
    }
    const info = describe(kind === 'card' ? 'card' : 'item', d.id);
    this.sheet = el(`<div class="pop-sheet"><div class="row"><div class="ico">${d.icon}</div><div class="grow"><div class="t">${esc(d.name)}</div>${info.html.replace(/<p[^>]*>/, '<div class="d">').replace('</p>', '</div>')}</div></div>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="sheet:close" style="flex:1">Close</button><button class="btn small primary" data-act="sheet:go" style="flex:2" ${disabled ? 'disabled' : ''}>${btn}</button></div></div>`);
    this.sheetRef = { kind, ref };
    this.$('.controls').appendChild(this.sheet);
  }

  action(act) {
    const f = this.fight;
    const [k, v] = act.split(':');
    if (k === 'abil' || k === 'card' || k === 'cons') {
      if (this.sheetRef && this.sheet && this.sheetRef.kind === k && String(this.sheetRef.ref) === v) { this.doSheet(); return; }
      return this.openSheet(k, k === 'abil' ? v : +v);
    }
    if (k === 'sheet') { if (v === 'go') this.doSheet(); else this.closeSheet(); return; }
    if (k === 'target') { f.setTarget(+v); return; }
    if (k === 'inv') { if (!f.scenario && this.app.run.mode !== 'tutorial') this.app.showInventory(); }
  }

  doSheet() {
    const f = this.fight;
    const { kind, ref } = this.sheetRef || {};
    this.closeSheet();
    this.sheetRef = null;
    let ok = false;
    if (kind === 'abil') ok = f.toggleArm(ref);
    else if (kind === 'card') ok = f.playCard(ref);
    else if (kind === 'cons') ok = f.useConsumable(ref);
    if (ok) { haptics.tick(); this.preview = null; this.previewKey = ''; } else audio.error();
    this.renderLoadout();
    this.updateHud();
  }

  // ───────────────────────── input ─────────────────────────

  bindInput() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      this.closeSheet();
      const f = this.fight;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.mode = 'pinch';
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.renderer.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        if (this.prevAim !== undefined) f.aim.angle = this.prevAim;
        return;
      }
      this.downAt = { ...p, t: performance.now(), moved: false };
      if (f.state === 'moving') { this.mode = 'ffwd'; f.ffwd = 4; return; }
      if (!f.canAct()) { this.mode = null; return; }
      const cue = f.sim.cue;
      const cs = this.renderer.toScreen(cue.x, cue.y);
      const d = Math.hypot(cs.x - p.x, cs.y - p.y);
      const rpx = cue.r * this.renderer.scale;
      if (f.ballInHand && d < rpx + 30) { this.mode = 'place'; return; }
      if (d < rpx + 16) { this.mode = 'pull'; return; }
      this.mode = 'aim';
      this.prevAim = f.aim.angle;
      this.aimTo(p);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = pos(e);
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, p);
      if (this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 6) this.downAt.moved = true;
      const f = this.fight;
      if (this.mode === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.renderer.setZoom(this.pinch.z * (d / this.pinch.d), cx, cy);
        this.renderer.pan(cx - this.pinch.cx, cy - this.pinch.cy);
        this.pinch.cx = cx; this.pinch.cy = cy;
        return;
      }
      if (!f.canAct()) return;
      if (this.mode === 'place') {
        const w = this.renderer.toWorld(p.x, p.y);
        f.moveCueBall(w.x, w.y);
      } else if (this.mode === 'pull') {
        const cue = f.sim.cue;
        const cs = this.renderer.toScreen(cue.x, cue.y);
        const dx = cs.x - p.x, dy = cs.y - p.y;
        const L = Math.hypot(dx, dy);
        if (L > 8) f.aim.angle = Math.atan2(dy, dx);
        f.aim.power = Math.min(1, Math.max(0, (L - 10) / 150));
        this.updatePower();
      } else if (this.mode === 'aim') {
        this.aimTo(p);
      }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      const f = this.fight;
      if (this.mode === 'pinch') { if (this.pointers.size === 0) this.mode = null; return; }
      if (this.mode === 'ffwd') { f.ffwd = 1; this.mode = null; return; }
      if (this.mode === 'pull') {
        if (f.aim.power > 0.04) this.shoot(); else { f.aim.power = 0; this.updatePower(); }
      }
      if (this.downAt && !this.downAt.moved && performance.now() - this.downAt.t < 250) {
        const now = performance.now();
        if (now - this.lastTap < 320) { this.renderer.resetView(); if (this.prevAim !== undefined) f.aim.angle = this.prevAim; }
        this.lastTap = now;
      }
      this.mode = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); this.renderer.setZoom(this.renderer.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

    // power slider: drag down to pull the cue back, release to shoot
    const pw = this.$('.power');
    pw.addEventListener('pointerdown', (e) => {
      if (!this.fight.canAct()) return;
      pw.setPointerCapture(e.pointerId);
      this.powerDrag = { y0: e.clientY, h: pw.getBoundingClientRect().height };
      this.closeSheet();
    });
    pw.addEventListener('pointermove', (e) => {
      if (!this.powerDrag || !this.fight.canAct()) return;
      const p = Math.max(0, Math.min(1, (e.clientY - this.powerDrag.y0) / (this.powerDrag.h * 0.8)));
      if (Math.floor(p * 10) !== Math.floor(this.fight.aim.power * 10)) haptics.tick();
      this.fight.aim.power = p;
      this.updatePower();
    });
    const pup = () => {
      if (!this.powerDrag) return;
      this.powerDrag = null;
      if (this.fight.aim.power > 0.03) this.shoot();
      else { this.fight.aim.power = 0; this.updatePower(); }
    };
    pw.addEventListener('pointerup', pup);
    pw.addEventListener('pointercancel', pup);

    // fine aim strip
    const fine = this.$('.fine');
    const ridges = this.$('.fine-ridges');
    let fy = null, acc = 0, off = 0;
    fine.addEventListener('pointerdown', (e) => { if (!this.fight.canAct()) return; fine.setPointerCapture(e.pointerId); fy = e.clientY; acc = 0; });
    fine.addEventListener('pointermove', (e) => {
      if (fy === null || !this.fight.canAct()) return;
      const dy = e.clientY - fy;
      fy = e.clientY;
      this.fight.aim.angle += dy * 0.0018;
      off += dy;
      ridges.style.backgroundPosition = `0 ${off}px`;
      acc += Math.abs(dy);
      if (acc > 9) { acc = 0; haptics.tick(); }
    });
    const fup = () => { fy = null; };
    fine.addEventListener('pointerup', fup);
    fine.addEventListener('pointercancel', fup);

    // spin pad
    const pad = this.$('.spin-pad');
    const dot = this.$('.spin-dot');
    const lbl = this.$('.spin-lbl');
    let lastPadTap = 0;
    const setSpin = (e) => {
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      let y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const L = Math.hypot(x, y);
      if (L > 0.8) { x *= 0.8 / L; y *= 0.8 / L; }
      this.fight.aim.spinX = x / 0.8;
      this.fight.aim.spinY = -y / 0.8;
      this.updateSpin();
    };
    this.updateSpin = () => {
      const a = this.fight.aim;
      dot.style.left = `${50 + a.spinX * 40}%`;
      dot.style.top = `${50 - a.spinY * 40}%`;
      const parts = [];
      if (a.spinY > 0.25) parts.push('FOLLOW'); else if (a.spinY < -0.25) parts.push('DRAW');
      if (a.spinX > 0.25) parts.push('R'); else if (a.spinX < -0.25) parts.push('L');
      lbl.textContent = parts.join('+') || 'SPIN';
      this.preview = null;
    };
    pad.addEventListener('pointerdown', (e) => {
      if (this.fight.stats.noSpin) { this.app.toast('🚫 No Spin Zone: spin is locked.'); return; }
      pad.setPointerCapture(e.pointerId);
      const now = performance.now();
      if (now - lastPadTap < 300) { this.fight.aim.spinX = 0; this.fight.aim.spinY = 0; this.updateSpin(); lastPadTap = 0; this.padDrag = false; return; }
      lastPadTap = now;
      this.padDrag = true;
      setSpin(e);
    });
    pad.addEventListener('pointermove', (e) => { if (this.padDrag) setSpin(e); });
    pad.addEventListener('pointerup', () => { this.padDrag = false; });
    pad.addEventListener('pointercancel', () => { this.padDrag = false; });
  }

  aimTo(p) {
    const f = this.fight;
    const w = this.renderer.toWorld(p.x, p.y);
    const cue = f.sim.cue;
    if (Math.hypot(w.x - cue.x, w.y - cue.y) < cue.r * 1.2) return;
    f.aim.angle = Math.atan2(w.y - cue.y, w.x - cue.x);
  }

  updatePower() {
    const pw = this.$('.power');
    if (!pw) return;
    const h = pw.getBoundingClientRect().height;
    const p = this.fight.aim.power;
    const top = 3 + p * (h - 44);
    pw.querySelector('.power-handle').style.top = top + 'px';
    pw.querySelector('.power-fill').style.height = Math.max(0, top - 3) + 'px';
    pw.querySelector('.power-pct').textContent = p > 0 ? Math.round(p * 100) + '%' : '';
  }

  shoot() {
    const f = this.fight;
    if (f.playerShoot()) {
      this.prevAim = undefined;
      f.aim.power = 0;
      this.updatePower();
    }
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt) {
    const f = this.fight, r = this.renderer;
    f.update(dt);
    const view = {};
    const sim = f.sim;
    const cue = sim.cue;
    if (f.canAct() && cue && !cue.pocketed) {
      const pend = f.pending.flags;
      const armed = f.armed;
      const showGuide = this.app.profile.settings.guide !== false || f.stats.laser || pend.laser;
      if (showGuide) view.guide = aimGuide(sim, f.aim.angle, f.stats.noSpin ? 0 : f.aim.spinY, 1 + (f.stats.guideBounces || 0));
      if (f.stats.laser || pend.laser) {
        const power = f.aim.power > 0.05 ? f.aim.power : 0.55;
        const key = `${f.aim.angle.toFixed(4)}|${power.toFixed(2)}|${f.aim.spinX.toFixed(2)}|${f.aim.spinY.toFixed(2)}|${[...armed].join()}`;
        this.previewT -= dt;
        if (key !== this.previewKey && this.previewT <= 0) {
          this.previewKey = key;
          this.previewT = 0.08;
          let speed = PHYS.MIN_SPEED + (PHYS.MAX_SPEED - PHYS.MIN_SPEED) * power;
          speed *= f.stats.powerMult * (pend.powerCap || 1);
          if (f.isBreak) speed *= PHYS.BREAK_MULT;
          this.preview = tracePreview(sim, f.aim.angle, speed, f.aim.spinX, f.aim.spinY, PHYS.SPIN_K * f.stats.spinMult, { ghost: armed.has('ghost_cue') || pend.ghost });
        }
        view.preview = this.preview;
        view.guide = null;
      }
      view.legalGroups = f.isBreak ? null : remaining(sim, 'solid') > 0 ? ['solid'] : ['eight'];
      view.cue = { x: cue.x, y: cue.y, angle: f.aim.angle, pull: f.aim.power * 80 };
      view.ballInHand = !!f.ballInHand;
      view.kitchen = f.ballInHand === 'kitchen';
      if (armed.has('explosive_tip') || pend.explode) view.cueGlow = '#ff7043';
      else if (armed.has('ghost_cue') || pend.ghost) view.cueGlow = '#b0bec5';
      else if (armed.size || Object.keys(pend).length) view.cueGlow = '#80d8ff';
    } else if (f.state === 'enemyAim' && f.enemyAim && cue && !cue.pocketed) {
      const ea = f.enemyAim;
      if (ea.tilt) view.tilt = ea.angle;
      else {
        view.cue = { x: cue.x, y: cue.y, angle: ea.angle, pull: ea.power * 80, alpha: 0.9 };
        if (ea.show) view.enemyGuide = aimGuide(sim, ea.angle, 0, 1);
      }
    }
    r.draw(f, view, dt);
    if (view.tilt !== undefined) this.drawTilt(view.tilt);
    // keep the pill text fresh (cheap)
    this.pillT = (this.pillT || 0) - dt;
    if (this.pillT <= 0) { this.pillT = 0.2; this.updatePill(); if (f.state === 'think' || f.state === 'enemyAim') this.renderLoadoutMaybe(); }
    if (!this.powerDrag && this.mode !== 'pull' && f.aim.power === 0 && this.lastPow !== 0) { this.updatePower(); }
    this.lastPow = f.aim.power;
  }

  renderLoadoutMaybe() {
    const has = this.app.run.consumables.includes('rewind');
    if (has !== this.lastRewindState) { this.lastRewindState = has; this.renderLoadout(); }
  }

  drawTilt(angle) {
    const r = this.renderer, ctx = r.ctx;
    const c = r.toScreen(TABLE.W / 2, TABLE.H / 2);
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 120);
    ctx.fillStyle = '#bcaaa4';
    ctx.beginPath();
    ctx.moveTo(70, 0); ctx.lineTo(10, -40); ctx.lineTo(10, -16); ctx.lineTo(-60, -16); ctx.lineTo(-60, 16); ctx.lineTo(10, 16); ctx.lineTo(10, 40);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
