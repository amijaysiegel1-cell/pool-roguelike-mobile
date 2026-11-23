// Run screens: act intro, branching map, rewards, shop, events, rest, treasure,
// game over and victory.
import { Screen } from '../screen.js';
import { esc, hpBar, offerHtml, itemChip, cardChip, confetti, describe } from '../dom.js';
import { audio } from '../../core/audio.js';
import { haptics } from '../../core/haptics.js';
import { streamFor } from '../../core/rng.js';
import { ACTS } from '../../data/acts.js';
import { ITEM_MAP } from '../../data/items.js';
import { CARD_MAP } from '../../data/cards.js';
import { CHAR_MAP } from '../../data/characters.js';
import { BOSS_MAP } from '../../data/bosses.js';
import { EVENT_MAP } from '../../data/events.js';
import { NPCS } from '../../data/npcs.js';
import { SHOPKEEPERS, BLACK_MARKET } from '../../data/shops.js';
import { BALANCE } from '../../config.js';
import { computeStats } from '../../game/stats.js';
import { NODE_INFO, FLOORS } from '../../game/mapgen.js';
import {
  availableNodes, nodeById, resolveNode, fightRewards, giveItem, giveCard, removeItem, makeShop, pickEvent, makeEventCtx,
  treasureLoot, ENDINGS,
} from '../../game/run.js';

function statusBar(app, title = '') {
  const run = app.run;
  return `<div class="statusbar">
    <div style="font-size:20px">${CHAR_MAP[run.char].icon}</div>
    <div class="grow" style="min-width:0"><div style="font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>${hpBar(run.hp, run.maxHp)}</div>
    <div class="coins">🪙 ${run.coins}</div>
    <button class="icon-btn" data-act="inv" aria-label="Inventory">🎒</button>
    <button class="icon-btn" data-act="menu" aria-label="Menu">⚙️</button>
  </div>`;
}

async function runMenu(app) {
  const v = await app.modal({
    title: '⏸ Paused',
    html: `<p class="muted">Your run is saved automatically. Seed: <b>${esc(app.run.seed)}</b></p>`,
    buttons: [{ label: 'Resume', value: 'resume', cls: 'primary' }, { label: '⚙️ Settings', value: 'settings' }, { label: '🏠 Save & quit to title', value: 'title' }, { label: '🏳️ Abandon run', value: 'abandon', cls: 'danger' }],
  });
  if (v === 'settings') app.show('settings', { back: 'resume' }, { record: false });
  if (v === 'title') { app.saveRun(); app.show('title'); }
  if (v === 'abandon') app.abandonRun();
}

function commonAction(app, act) {
  if (act === 'inv') { app.showInventory(); return true; }
  if (act === 'menu') { runMenu(app); return true; }
  return false;
}

// ─────────────────────────────── ACT INTRO ───────────────────────────────
export class ActScreen extends Screen {
  static runScreen = true;
  render() {
    const a = ACTS[this.params.act];
    const boss = BOSS_MAP[this.app.run.map.boss];
    return `<div class="scroll" style="display:flex;flex-direction:column;justify-content:center;text-align:center;gap:14px">
      <div class="act-banner"><div class="roman">ACT ${a.roman}</div></div>
      <div style="font-size:90px;animation:bob 3s ease-in-out infinite">${a.icon}</div>
      <h1 style="font-size:34px;text-transform:uppercase">${esc(a.name)}</h1>
      <p class="muted" style="font-size:16px;line-height:1.5">${esc(a.blurb)}</p>
      <div class="panel" style="text-align:left"><div class="section-title" style="margin-top:0">Rumors</div>
        <div class="row"><div style="font-size:34px">${boss.icon}</div><div><b>${esc(boss.name)}</b> waits at the top.<div class="muted" style="font-size:12px">${esc(boss.title)}</div></div></div></div>
      <button class="btn primary" data-act="go">ENTER ${a.roman === 'I' ? 'THE BAR' : 'ACT ' + a.roman}</button>
    </div>`;
  }
  mounted() { audio.music(ACTS[this.params.act].music, 0); }
  action(act) { if (act === 'go') this.app.show('map'); }
}

// ─────────────────────────────── MAP ───────────────────────────────
const NODE_COLORS = { fight: '#455a64', elite: '#b71c1c', shop: '#f9a825', event: '#1565c0', mystery: '#6a1b9a', rest: '#e65100', treasure: '#2e7d32', boss: '#111' };

export class MapScreen extends Screen {
  static runScreen = true;
  render() {
    const run = this.app.run;
    const act = ACTS[run.act];
    const st = computeStats(run);
    const avail = new Set(availableNodes(run).map((n) => n.id));
    const visited = new Set(run.visited);
    const VW = 400, rowH = 88, top = 70, VH = top + FLOORS * rowH + 60;
    const X = (n) => 34 + n.x * (VW - 68);
    const Y = (n) => (n.type === 'boss' ? 46 : VH - 50 - n.floor * rowH);
    let edges = '', nodes = '';
    for (const n of run.map.nodes) {
      for (const id of n.next) {
        const m = nodeById(run, id);
        const onPath = visited.has(n.id) && visited.has(id);
        const fromCur = run.pos === n.id;
        edges += `<line x1="${X(n)}" y1="${Y(n)}" x2="${X(m)}" y2="${Y(m)}" stroke="${onPath ? act.accent : fromCur ? '#fff' : 'rgba(255,255,255,0.22)'}" stroke-width="${onPath ? 4 : 2.5}" ${onPath ? '' : 'stroke-dasharray="5 6"'} stroke-linecap="round"/>`;
      }
    }
    for (const n of run.map.nodes) {
      const isBoss = n.type === 'boss';
      let icon = isBoss ? BOSS_MAP[run.map.boss].icon : NODE_INFO[n.type].icon;
      if (n.type === 'mystery' && st.revealMap) {
        const r = resolveNode(run, n);
        icon = r.black ? '🕴️' : NODE_INFO[r.type].icon;
      }
      const cls = [avail.has(n.id) ? 'available' : '', visited.has(n.id) ? 'visited' : '', !avail.has(n.id) && !visited.has(n.id) ? 'locked' : ''].join(' ');
      const r = isBoss ? 32 : 21;
      const cur = run.pos === n.id;
      nodes += `<g class="map-node ${cls}" data-act="${avail.has(n.id) ? 'node:' + n.id : 'info:' + n.type}">
        <circle class="base" cx="${X(n)}" cy="${Y(n)}" r="${r}" fill="${NODE_COLORS[n.type]}" stroke="${cur ? '#fff' : avail.has(n.id) ? act.accent : 'rgba(255,255,255,0.35)'}"/>
        <text x="${X(n)}" y="${Y(n) + 1}" text-anchor="middle" dominant-baseline="central" font-size="${isBoss ? 30 : 19}">${icon}</text>
        ${visited.has(n.id) && !cur ? `<text x="${X(n) + 15}" y="${Y(n) - 14}" font-size="13">✅</text>` : ''}
        ${cur ? `<text x="${X(n)}" y="${Y(n) - 30}" text-anchor="middle" font-size="18">📍</text>` : ''}
      </g>`;
    }
    const legend = ['fight', 'elite', 'event', 'mystery', 'shop', 'rest', 'treasure'].map((t) => `<span>${NODE_INFO[t].icon} ${NODE_INFO[t].name}</span>`).join('');
    return `${statusBar(this.app, `ACT ${act.roman} · ${act.name.toUpperCase()}`)}
      <div class="map-wrap"><svg class="map-svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMin meet">${edges}${nodes}</svg></div>
      <div class="map-legend">${legend}</div>`;
  }
  mounted() {
    audio.music(ACTS[this.app.run.act].music, 0);
    const wrap = this.$('.map-wrap');
    const run = this.app.run;
    const floor = run.pos ? nodeById(run, run.pos).floor : -1;
    requestAnimationFrame(() => {
      const frac = 1 - (floor + 1.5) / (FLOORS + 1);
      wrap.scrollTop = Math.max(0, wrap.scrollHeight * frac - wrap.clientHeight * 0.6);
    });
  }
  action(act) {
    if (commonAction(this.app, act)) return;
    const [k, v] = act.split(':');
    if (k === 'node') { audio.ui(); haptics.tick(); this.app.enterNode(v); }
    if (k === 'info') this.app.toast(`${NODE_INFO[v].icon} ${NODE_INFO[v].name} — not reachable from here`);
  }
}

// ─────────────────────────────── REWARD ───────────────────────────────
export class RewardScreen extends Screen {
  static runScreen = true;
  constructor(app, params) {
    super(app, params);
    if (!params.rewards) {
      params.rewards = fightRewards(app.run, params.enc, app.profile);
      params.claimed = {};
      const st = computeStats(app.run);
      params.rewards.coins = Math.round(params.rewards.coins * st.coinMult);
    }
  }
  render() {
    const p = this.params, r = p.rewards, c = p.claimed, enc = p.enc;
    const boss = enc.boss ? BOSS_MAP[enc.boss] : null;
    const rows = [];
    rows.push(`<button class="offer" ${c.coins ? 'style="opacity:.5"' : ''} data-act="coins"><div class="ico" style="--r:var(--gold)">🪙</div><div class="grow"><div class="t">${r.coins} coins</div><div class="d">${c.coins ? 'Collected' : 'Tap to collect'}</div></div></button>`);
    if (r.relic && !c.relic) rows.push(offerHtml('item', r.relic, `<div class="price">${boss ? 'BOSS RELIC' : 'ELITE'}</div>`, 'relic'));
    if (r.consumable && !c.consumable) rows.push(offerHtml('item', r.consumable, `<div class="price" style="font-size:11px">${this.app.run.consumables.length >= BALANCE.CONSUMABLE_SLOTS ? 'SLOTS FULL' : 'TAKE'}</div>`, 'cons'));
    const choices = c.choice !== undefined ? '' : r.choices.map((ch, i) => offerHtml(ch.kind, ch.id, '', `pick:${i}`)).join('');
    return `${statusBar(this.app, 'SPOILS')}
      <div class="scroll col">
        <div class="center" style="padding:6px 0"><div style="font-size:56px">${boss ? boss.icon : enc.kind === 'elite' ? '💀' : '🏆'}</div><h2 style="font-size:26px;text-transform:uppercase">${boss ? `${esc(boss.name)} defeated!` : 'Match won!'}</h2></div>
        ${rows.join('')}
        ${choices ? `<div class="section-title">Choose one</div>${choices}<button class="btn small" data-act="skip" style="align-self:center">Skip</button>` : ''}
        <button class="btn primary" data-act="done" style="margin-top:8px">${boss ? 'ONWARD ⟶ NEXT ACT' : 'CONTINUE'}</button>
      </div>`;
  }
  mounted() { audio.music(ACTS[this.app.run.act].music, 0); if (!this.params.claimed.coins) setTimeout(() => this.action('coins'), 350); }
  action(act) {
    if (commonAction(this.app, act)) return;
    const run = this.app.run, p = this.params, r = p.rewards, c = p.claimed;
    const [k, v] = act.split(':');
    if (k === 'coins' && !c.coins) { c.coins = true; run.coins += r.coins; run.stats.coinsEarned += r.coins; audio.coin(); }
    else if (k === 'relic' && !c.relic) { c.relic = true; giveItem(run, r.relic, this.app.profile); audio.buy(); this.app.toast(`${ITEM_MAP[r.relic].icon} ${ITEM_MAP[r.relic].name}`); }
    else if (k === 'cons' && !c.consumable) {
      if (run.consumables.length >= BALANCE.CONSUMABLE_SLOTS) { audio.error(); this.app.toast('Consumable slots full (3).'); return; }
      c.consumable = true; giveItem(run, r.consumable, this.app.profile); audio.buy();
    } else if (k === 'pick') {
      const ch = r.choices[+v];
      c.choice = +v;
      if (ch.kind === 'card') giveCard(run, ch.id, this.app.profile); else giveItem(run, ch.id, this.app.profile);
      audio.buy(); haptics.tick();
      this.app.toast(`Added ${ch.kind === 'card' ? CARD_MAP[ch.id].icon + ' ' + CARD_MAP[ch.id].name : ITEM_MAP[ch.id].icon + ' ' + ITEM_MAP[ch.id].name}`);
    } else if (k === 'skip') c.choice = -1;
    else if (k === 'done') {
      if (p.enc.kind === 'boss') return this.app.nextAct();
      return this.app.goMap();
    }
    this.app.saveRun();
    this.app.saveProfile();
    this.refresh();
  }
}

// ─────────────────────────────── SHOP ───────────────────────────────
export class ShopScreen extends Screen {
  static runScreen = true;
  constructor(app, params) {
    super(app, params);
    if (!params.shop) params.shop = makeShop(app.run, nodeById(app.run, params.nodeId), app.profile, params.black);
  }
  keeper() { const s = this.params.shop; return s.black ? BLACK_MARKET : SHOPKEEPERS.find((k) => k.id === s.keeper); }
  render() {
    const s = this.params.shop, k = this.keeper(), run = this.app.run;
    const stock = s.stock.map((it, i) => {
      const price = `<div class="price">${it.sale ? '<span class="sale">SALE</span>' : ''}${it.price}🪙${it.hpPrice ? `<span class="old" style="text-decoration:none;color:#ff8a80">or ${it.hpPrice}❤️</span>` : ''}</div>`;
      return `<div class="${it.sold ? 'offer sold' : ''}" style="${it.sold ? '' : ''}">${it.sold ? `<div class="offer sold"><div class="grow center">SOLD</div></div>` : offerHtml(it.kind, it.id, price, `buy:${i}`)}</div>`;
    }).join('');
    return `${statusBar(this.app, s.black ? 'THE BLACK MARKET' : 'SHOP')}
      <div class="scroll col">
        <div class="row panel" style="border-color:${k.color}"><div style="font-size:48px">${k.icon}</div><div class="grow"><b style="color:${k.color}">${esc(k.name)}</b><div class="muted" style="font-size:12px">${esc(k.specialty)}</div><div style="font-size:13px;margin-top:4px;font-style:italic">"${esc(s.line)}"</div></div></div>
        ${stock}
        <div class="section-title">Services</div>
        <button class="offer" data-act="heal" ${s.healed || run.hp >= run.maxHp ? 'style="opacity:.4;pointer-events:none"' : ''}><div class="ico" style="--r:var(--good)">💚</div><div class="grow"><div class="t">Patch Up</div><div class="d">Heal ${s.healAmt} HP${s.healed ? ' (used)' : ''}</div></div><div class="price">${s.healCost}🪙</div></button>
        <button class="offer" data-act="remove" ${s.removed ? 'style="opacity:.4;pointer-events:none"' : ''}><div class="ico" style="--r:var(--cursed)">🗑️</div><div class="grow"><div class="t">Remove an item or card</div><div class="d">Get rid of a curse or thin your deck${s.removed ? ' (used)' : ''}</div></div><div class="price">${s.removeCost}🪙</div></button>
        <button class="offer" data-act="reroll"><div class="ico">🔄</div><div class="grow"><div class="t">Reroll stock</div><div class="d">New goods, same keeper</div></div><div class="price">${s.rerollCost}🪙</div></button>
        <button class="btn primary" data-act="leave" style="margin-top:6px">LEAVE SHOP</button>
      </div>`;
  }
  mounted() { audio.music(ACTS[this.app.run.act].music, 0); }
  pay(n) {
    const run = this.app.run;
    if (run.coins < n) { audio.error(); this.app.toast('Not enough coins.'); return false; }
    run.coins -= n;
    audio.buy();
    return true;
  }
  async action(act) {
    if (commonAction(this.app, act)) return;
    const run = this.app.run, s = this.params.shop;
    const [k, v] = act.split(':');
    if (k === 'buy') {
      const it = s.stock[+v];
      if (it.sold) return;
      const def = it.kind === 'card' ? CARD_MAP[it.id] : ITEM_MAP[it.id];
      const isCons = it.kind === 'item' && def.type === 'consumable';
      if (isCons && run.consumables.length >= BALANCE.CONSUMABLE_SLOTS) { audio.error(); this.app.toast('Consumable slots full.'); return; }
      const d = describe(it.kind, it.id);
      const btns = [{ label: `Buy for ${it.price}🪙`, value: 'coins', cls: 'primary', disabled: run.coins < it.price }];
      if (it.hpPrice) btns.push({ label: `Pay ${it.hpPrice} ❤️ HP instead`, value: 'hp', cls: 'danger', disabled: run.hp <= it.hpPrice });
      btns.push({ label: 'Cancel', value: null });
      const how = await this.app.modal({ title: d.title, html: d.html, buttons: btns });
      if (!how) return;
      if (how === 'coins' && !this.pay(it.price)) return;
      if (how === 'hp') { run.hp -= it.hpPrice; audio.hurt(); }
      it.sold = true;
      if (it.kind === 'card') giveCard(run, it.id, this.app.profile); else giveItem(run, it.id, this.app.profile);
      haptics.tick();
    } else if (k === 'heal') {
      if (s.healed || !this.pay(s.healCost)) return;
      s.healed = true;
      run.hp = Math.min(run.maxHp, run.hp + s.healAmt);
      audio.heal();
    } else if (k === 'remove') {
      if (s.removed) return;
      if (run.coins < s.removeCost) { audio.error(); this.app.toast('Not enough coins.'); return; }
      const removable = run.items.filter((i) => ITEM_MAP[i.id] && ITEM_MAP[i.id].rarity !== 'boss');
      const html = `<p class="muted">Tap what to remove.</p><div class="section-title">Items</div><div class="chips">${removable.map((i) => itemChip(i.id, i.n, `rm-item:${i.id}`)).join('') || '<span class="muted">none</span>'}</div>
        <div class="section-title">Deck</div><div class="chips">${run.deck.map((id, j) => cardChip(id, `rm-card:${j}`)).join('')}</div>`;
      this.app.modalAction = (a, el, close) => close(a);
      const pick = await this.app.modal({ title: '🗑️ Remove', html, buttons: [{ label: 'Cancel', value: null }] });
      this.app.modalAction = null;
      if (!pick) return;
      const [kk, vv] = pick.split(':');
      if (kk === 'rm-card' && run.deck.length <= 3) { this.app.toast('Your deck needs at least 3 cards.'); return; }
      if (!this.pay(s.removeCost)) return;
      s.removed = true;
      run.removals = (run.removals || 0) + 1;
      if (kk === 'rm-item') { const nm = ITEM_MAP[vv].name; removeItem(run, vv); this.app.toast(`Removed ${nm}`); }
      else { const id = run.deck.splice(+vv, 1)[0]; this.app.toast(`Removed ${CARD_MAP[id].name}`); }
    } else if (k === 'reroll') {
      if (!this.pay(s.rerollCost)) return;
      run.rerolls = (run.rerolls || 0) + 1;
      const old = s;
      this.params.shop = makeShop(run, nodeById(run, this.params.nodeId), this.app.profile, this.params.black);
      Object.assign(this.params.shop, { healed: old.healed, removed: old.removed, keeper: old.keeper, line: old.line });
    } else if (k === 'leave') {
      return this.app.goMap();
    }
    this.app.saveRun();
    this.app.saveProfile();
    this.refresh();
  }
}

// ─────────────────────────────── EVENT ───────────────────────────────
export class EventScreen extends Screen {
  static runScreen = true;
  constructor(app, params) {
    super(app, params);
    const run = app.run;
    if (!params.outcome && !params.eventId) {
      const ev = pickEvent(run, nodeById(run, params.nodeId) || { id: params.nodeId }, app.profile);
      params.eventId = ev.id;
    }
    if (params.eventId && !params.entered) {
      params.entered = true;
      const ev = EVENT_MAP[params.eventId];
      const ctx = makeEventCtx(run, app.profile, streamFor(run.seed, 'evenv:' + params.nodeId));
      ev.onEnter?.(ctx);
      app.saveProfile();
    }
  }
  ctx(i = 'view') { const run = this.app.run; return makeEventCtx(run, this.app.profile, streamFor(run.seed, `evc:${this.params.nodeId}:${i}:${run.visited.length}`)); }
  render() {
    const p = this.params;
    const ev = p.eventId ? EVENT_MAP[p.eventId] : null;
    const npc = (p.npc && NPCS[p.npc]) || (ev?.npc && NPCS[ev.npc]);
    const icon = npc ? npc.icon : ev?.icon || '💬';
    const title = ev ? ev.title : npc ? npc.name : 'Encounter';
    let body;
    if (p.outcome) {
      body = `<div class="story">${esc(p.outcome)}</div><button class="btn primary" data-act="done">CONTINUE</button>`;
    } else {
      const ctx = this.ctx();
      const choices = ev.choices(ctx);
      body = `<div class="story">${esc(typeof ev.text === 'function' ? ev.text(ctx) : ev.text)}</div>
        <div class="col">${choices.map((c, i) => `<button class="btn choice" data-act="choose:${i}" ${c.disabled ? 'disabled' : ''}>${esc(c.label)}${c.hint ? `<span class="h">${esc(c.hint)}</span>` : ''}</button>`).join('')}</div>`;
    }
    return `${statusBar(this.app, 'ENCOUNTER')}
      <div class="scroll col">
        <div class="npc-portrait">${icon}</div>
        <h2 class="center" style="font-size:24px">${esc(title)}</h2>
        ${npc ? `<div class="center muted" style="font-size:12px;margin-top:-6px">${esc(npc.title || '')}</div>` : ''}
        ${body}
      </div>`;
  }
  action(act) {
    if (commonAction(this.app, act)) return;
    const [k, v] = act.split(':');
    const run = this.app.run;
    if (k === 'done') return this.app.goMap();
    if (k === 'choose') {
      const ev = EVENT_MAP[this.params.eventId];
      const ctx = this.ctx(v);
      const choice = ev.choices(ctx)[+v];
      if (!choice || choice.disabled) return;
      const out = choice.run() || {};
      this.app.saveProfile();
      if (out.fight) { this.app.saveRun(); return this.app.startSpecialFight(out.fight); }
      if (out.sideGame) { this.app.saveRun(); return this.app.startRaccoon(); }
      this.params.outcome = out.text || '...';
      haptics.tick();
      this.app.checkMeta();
      this.app.saveRun();
      this.refresh();
      if (run.hp <= 0) this.app.gameOver();
    }
  }
}

// ─────────────────────────────── REST ───────────────────────────────
export class RestScreen extends Screen {
  static runScreen = true;
  render() {
    const run = this.app.run, st = computeStats(run);
    const heal = Math.round(run.maxHp * BALANCE.REST_HEAL * st.restHealMult);
    const cues = run.items.filter((i) => ITEM_MAP[i.id]?.type === 'cue' && ITEM_MAP[i.id].charges);
    const body = this.params.done
      ? `<div class="story">${esc(this.params.done)}</div><button class="btn primary" data-act="leave">CONTINUE</button>`
      : `<button class="offer" data-act="heal"><div class="ico" style="--r:var(--good)">🛌</div><div class="grow"><div class="t">Rest</div><div class="d">Heal ${heal} HP</div></div></button>
         <button class="offer" data-act="train" ${cues.length ? '' : 'style="opacity:.4;pointer-events:none"'}><div class="ico" style="--r:var(--rare)">🏋️</div><div class="grow"><div class="t">Practice</div><div class="d">${cues.length ? 'Permanently give a cue upgrade +1 charge per fight' : 'You have no cue upgrades to practice with'}</div></div></button>
         <button class="offer" data-act="trim" ${run.deck.length > 3 ? '' : 'style="opacity:.4;pointer-events:none"'}><div class="ico" style="--r:var(--epic)">🧘</div><div class="grow"><div class="t">Reflect</div><div class="d">Remove a shot card from your deck</div></div></button>
         <button class="offer" data-act="drink"><div class="ico" style="--r:var(--gold)">🍺</div><div class="grow"><div class="t">One for the road</div><div class="d">Heal ${Math.round(heal / 2)} HP and gain a random common card</div></div></button>`;
    return `${statusBar(this.app, 'REST STOP')}
      <div class="scroll col"><div class="npc-portrait">🔥</div><h2 class="center">A quiet corner</h2>
      <p class="center muted">The jukebox hums. Your arm aches. Choose one.</p>${body}</div>`;
  }
  async action(act) {
    if (commonAction(this.app, act)) return;
    const run = this.app.run, st = computeStats(run);
    const heal = Math.round(run.maxHp * BALANCE.REST_HEAL * st.restHealMult);
    if (act === 'leave') return this.app.goMap();
    if (act === 'heal') {
      if (!st.suddenDeath) run.hp = Math.min(run.maxHp, run.hp + heal);
      this.params.done = `You nap in a booth. (+${heal} HP)`;
      audio.heal();
    } else if (act === 'train') {
      const cues = run.items.filter((i) => ITEM_MAP[i.id]?.type === 'cue' && ITEM_MAP[i.id].charges);
      this.app.modalAction = (a, el, close) => close(a);
      const pick = await this.app.modal({ title: '🏋️ Practice which?', html: `<div class="chips">${cues.map((i) => itemChip(i.id, i.n, `t:${i.id}`)).join('')}</div>`, buttons: [{ label: 'Cancel', value: null }] });
      this.app.modalAction = null;
      if (!pick) return;
      const inst = run.items.find((i) => i.id === pick.split(':')[1]);
      inst.extra = (inst.extra || 0) + 1;
      this.params.done = `Hours of drills. ${ITEM_MAP[inst.id].name} now has +1 charge every fight.`;
    } else if (act === 'trim') {
      this.app.modalAction = (a, el, close) => close(a);
      const pick = await this.app.modal({ title: '🧘 Remove which card?', html: `<div class="chips">${run.deck.map((id, j) => cardChip(id, `c:${j}`)).join('')}</div>`, buttons: [{ label: 'Cancel', value: null }] });
      this.app.modalAction = null;
      if (!pick) return;
      const id = run.deck.splice(+pick.split(':')[1], 1)[0];
      this.params.done = `You let go of ${CARD_MAP[id].name}. Your deck feels lighter.`;
    } else if (act === 'drink') {
      if (!st.suddenDeath) run.hp = Math.min(run.maxHp, run.hp + Math.round(heal / 2));
      const ctx = makeEventCtx(run, this.app.profile, streamFor(run.seed, 'rest:' + run.pos));
      const c = ctx.randomCard('common');
      this.params.done = `The bartender slides you a drink and a tip: ${c.name}.`;
      audio.heal();
    }
    this.app.saveRun();
    this.refresh();
  }
}

// ─────────────────────────────── TREASURE ───────────────────────────────
export class TreasureScreen extends Screen {
  static runScreen = true;
  render() {
    const p = this.params;
    const loot = p.loot;
    return `${statusBar(this.app, 'TREASURE')}
      <div class="scroll col"><h2 class="center" style="margin-top:20px">${loot ? 'Loot!' : 'A dusty chest under the pool table'}</h2>
      <div class="chest ${loot ? 'open' : ''}" data-act="open">${loot ? '🎉' : '🎁'}</div>
      ${loot ? `<div class="offer"><div class="ico" style="--r:var(--gold)">🪙</div><div class="grow"><div class="t">${loot.coins} coins</div></div></div>${loot.items.map((id) => offerHtml('item', id)).join('')}
        <button class="btn primary" data-act="leave">CONTINUE</button>` : '<p class="center muted">Tap to open</p>'}
      </div>`;
  }
  action(act) {
    if (commonAction(this.app, act)) return;
    const run = this.app.run;
    if (act === 'open' && !this.params.loot) {
      const loot = treasureLoot(run, nodeById(run, this.params.nodeId), this.app.profile);
      this.params.loot = loot;
      run.coins += loot.coins;
      for (const id of loot.items) giveItem(run, id, this.app.profile);
      audio.chest(); haptics.big();
      this.app.saveRun(); this.app.saveProfile();
      this.refresh();
    } else if (act === 'leave') this.app.goMap();
  }
}

// ─────────────────────────────── END SCREENS ───────────────────────────────
function summaryHtml(run, summary) {
  const s = run.stats;
  const stat = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  return `<div class="stat-grid">
    ${stat('Act ' + run.act, 'Reached')}${stat(run.stats.fightsWon, 'Fights won')}
    ${stat(Math.round(s.damage), 'Damage dealt')}${stat(s.ballsSunk, 'Balls sunk')}
    ${stat(s.bestHit || 0, 'Biggest hit')}${stat(s.bossesBeaten, 'Bosses beaten')}
    ${stat(summary.score, 'Score')}${stat('+' + summary.lp, 'Legend Points')}
  </div>
  ${summary.newAsc ? '<div class="panel center" style="margin-top:10px">⬆️ <b>New Ascension level unlocked!</b></div>' : ''}
  ${summary.chars.map((c) => `<div class="panel center" style="margin-top:10px">🔓 New character: <b>${c.icon} ${esc(c.name)}</b></div>`).join('')}
  ${summary.achievements.map((a) => `<div class="panel center" style="margin-top:10px">🏅 <b>${a.icon} ${esc(a.name)}</b></div>`).join('')}
  <div class="muted center" style="font-size:12px;margin-top:10px">Seed ${esc(run.seed)} · ${CHAR_MAP[run.char].name}${run.ascension ? ' · A' + run.ascension : ''}</div>`;
}

export class GameOverScreen extends Screen {
  render() {
    const { run, summary } = this.params;
    return `<div class="scroll col"><div class="center" style="padding-top:20px"><div style="font-size:80px">💀</div>
      <h1 style="font-size:36px;color:var(--bad)">RACKED &amp; RUINED</h1><p class="muted">Every legend loses a few. Your Legend Points carry over.</p></div>
      ${summaryHtml(run, summary)}
      <button class="btn primary" data-act="again" style="margin-top:12px">TRY AGAIN</button>
      <button class="btn" data-act="title">TITLE</button></div>`;
  }
  mounted() { audio.music(null); audio.lose(); }
  action(act) { if (act === 'again') this.app.show('chars', { mode: 'normal' }); if (act === 'title') this.app.show('title'); }
}

export class VictoryScreen extends Screen {
  render() {
    const { run, summary, ending } = this.params;
    const e = ENDINGS[ending] || ENDINGS.normal;
    return `<div class="scroll col"><div class="center" style="padding-top:20px"><div style="font-size:84px">${e.icon}</div>
      ${e.secret ? '<div class="tag" style="color:var(--legendary)">✨ SECRET ENDING</div>' : ''}
      <h1 style="font-size:32px;margin-top:8px">${esc(e.title)}</h1></div>
      <div class="story ending">${esc(e.text)}</div>
      ${summaryHtml(run, summary)}
      <button class="btn primary" data-act="title" style="margin-top:12px">RETURN TO THE BAR</button></div>`;
  }
  mounted() { audio.music(ACTS[4].music, 0); audio.win(); confetti(this.root); haptics.big(); }
  action(act) { if (act === 'title') this.app.show('title'); }
}
