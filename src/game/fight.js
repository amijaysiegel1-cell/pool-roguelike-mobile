// The Fight: one pool match against one or more opponents, wrapped in combat.
// Owns the simulation, the turn state machine, damage, statuses, item hooks,
// boss scripts and the AI. It is DOM-free: the match screen subscribes to its
// events (fight.on(...)) to draw effects and play sounds, which also lets the
// whole thing run headless in tests.
import { BALANCE, PHYS, TABLE } from '../config.js';
import { Sim, makeBall } from '../physics/sim.js';
import { buildTable, standardPockets, rackPositions, rackOrder, HEAD_Y, FOOT_SPOT } from '../physics/table.js';
import { pocketAim } from '../physics/predict.js';
import { RNG, streamFor } from '../core/rng.js';
import { evaluateShot, remaining, groupOf } from './rules.js';
import { planShot, planTilt } from './ai.js';
import { computeStats } from './stats.js';
import { ITEM_MAP } from '../data/items.js';
import { CARD_MAP } from '../data/cards.js';
import { BOSS_MAP } from '../data/bosses.js';
import { TABLE_MODS } from '../data/enemies.js';

const { W, H, R } = TABLE;

export class Fight {
  /**
   * @param run        the run state (hp, items, deck... — mutated in place)
   * @param enc        encounter description (JSON-serialisable)
   * @param saved      optional serialized fight to resume
   */
  constructor(run, enc, saved = null) {
    this.run = run;
    this.enc = enc;
    this.act = enc.act || 1;
    this.stats = computeStats(run);
    this.boss = enc.boss ? BOSS_MAP[enc.boss] : null;
    this.handlers = {};
    this.timers = [];
    this.queue = [];
    this.flags = {};
    this.timeScale = 1;
    this.slowmoT = 0;
    this.ffwd = 1;
    this.acc = 0;
    this.state = 'intro';
    this.turn = 'player';
    this.turnCount = 0;
    this.rackNo = 0;
    this.shotNo = 0;
    this.turnSinks = 0;
    this.nextId = 100;
    this.enemyTurnIdx = 0;
    this.targetIdx = 0;
    this.rollMul = 1;
    this.pending = { flags: {} };
    this.armed = new Set();
    this.cardPlayed = false;
    this.snapshot = null;
    this.ballInHand = null;
    this.aim = { angle: -Math.PI / 2, power: 0, spinX: 0, spinY: 0 };
    this.enemyAim = null;
    this.result = null;
    this.scenario = enc.scenario || null;
    this.practiceShots = 0;

    if (saved) { this.restore(saved, true); return; }

    this.rng = streamFor(run.seed, 'fight:' + enc.key);
    this.tableSpec = { pockets: standardPockets(), bumpers: [], walls: [] };
    this.baseFields = [];
    this.basePocketScale = 1;
    this.enemies = (enc.enemies || []).map((e, i) => this.makeEnemy(e, i));
    this.applyTableMods();
    this.sim = new Sim(buildTable(this.tableSpec));
    this.sim.listener = (...a) => this.onSimEvent(...a);
    this.deck = this.rng.shuffle(run.deck || []);
    this.hand = [];
    this.discard = [];
    this.charges = {};
    for (const inst of run.items) {
      const def = ITEM_MAP[inst.id];
      if (def?.type === 'cue' && def.charges) this.charges[def.id] = def.charges * (inst.n || 1) + (inst.extra || 0) + this.stats.charges;
    }
    if (this.boss?.setup) this.boss.setup(this);
    this.sim.rollMul = this.rollMul;
    if (this.stats.suddenDeath) { this.run.hp = 1; }
    this.fire('onFightStart');
    this.drawCards(Math.max(1, this.handSize() - 1));
  }

  // ───────────────────────── setup ─────────────────────────

  makeEnemy(e, idx) {
    const st = this.stats;
    const act = this.act;
    let maxHp = e.hp;
    if (!maxHp) {
      if (this.enc.kind === 'boss') maxHp = BALANCE.BOSS_HP[act] * (e.hpShare || 1) * st.bossHpMult;
      else {
        const [a, b] = BALANCE.ENEMY_HP[act];
        maxHp = (a + (b - a) * (e.hpRoll ?? 0.5)) * (e.hpMult || 1);
        if (this.enc.kind === 'elite') maxHp *= BALANCE.ELITE_HP_MULT * st.eliteHpMult;
      }
      maxHp *= st.enemyHpMult;
    }
    maxHp = Math.round(maxHp);
    let dmg = this.enc.kind === 'boss' ? BALANCE.BOSS_DMG[act] : BALANCE.ENEMY_DMG[act] + (e.dmg || 0);
    if (this.enc.kind === 'elite') dmg += BALANCE.ELITE_DMG_BONUS;
    dmg += st.enemyDmg + (e.dmgBonus || 0);
    const traits = e.traits || [];
    let skill = (e.skill ?? 0.4) + st.enemySkill + (traits.includes('precise') ? 0.08 : 0);
    return {
      idx, id: e.id, name: e.name, icon: e.icon, hp: maxHp, maxHp, dmg, skill: Math.min(0.97, skill),
      banks: !!e.banks || traits.includes('trickster'), trickBias: traits.includes('trickster') ? 50 : (e.trickBias || 0),
      dmgMult: e.dmgMult || 1, traits, status: { burn: 0, frozen: 0, shrink: 0 }, phase: 0, streak: 0,
      tilt: e.tilt || 0, taunts: e.taunts || null, quote: e.quote || '', dead: false,
    };
  }

  applyTableMods() {
    const mods = this.enc.tableMods || [];
    for (const id of mods) {
      const m = TABLE_MODS[id];
      if (!m) continue;
      if (m.rollMul) this.rollMul *= m.rollMul;
      if (m.pocketScale) this.basePocketScale *= m.pocketScale;
      if (id === 'bumpers') {
        this.tableSpec.bumpers.push({ x: W * 0.3, y: H * 0.5, r: 16, e: 1.05 }, { x: W * 0.7, y: H * 0.5, r: 16, e: 1.05 });
      } else if (id === 'drift') {
        const a = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + this.rng.range(-0.4, 0.4);
        this.baseFields.push({ type: 'drift', ax: Math.cos(a) * 70, ay: Math.sin(a) * 70, show: true });
      } else if (id === 'wall') {
        const y = this.rng.range(420, 580);
        this.tableSpec.walls.push({ x1: W / 2 - 55, y1: y, x2: W / 2 + 55, y2: y });
      }
    }
    if (this.stats.extraPocket) {
      this.tableSpec.pockets.push({ kind: 'side', side: 'top', t: W / 2, owner: 'player', glow: '#69f0ae' });
    }
    if (this.stats.lodestone) {
      for (const i of [1, 2]) {
        const p = this.tableSpec.pockets[i];
        p.attract = { k: 420, radius: 140, groups: ['solid'] };
        p.glow = p.glow || '#69f0ae';
      }
    }
  }

  rebuildTable(keepScale = false) {
    const scale = keepScale ? this.sim.table.pocketScale : this.sim?.table?.pocketScale || this.basePocketScale;
    const t = buildTable({ ...this.tableSpec, pocketScale: scale });
    if (this.sim) this.sim.table = t;
    this.emit('table');
    // nudge balls out of any new geometry
    if (this.sim) for (const b of this.sim.balls) if (!b.pocketed) this.settleBall(b);
  }

  setPocketScale(scale) {
    if (Math.abs(this.sim.table.pocketScale - scale) < 0.001) return;
    this.sim.table = buildTable({ ...this.tableSpec, pocketScale: scale });
  }

  settleBall(b) {
    for (const s of this.sim.table.segs) {
      let t = ((b.x - s.x1) * s.dx + (b.y - s.y1) * s.dy) / s.len2;
      t = Math.max(0, Math.min(1, t));
      const cx = s.x1 + s.dx * t, cy = s.y1 + s.dy * t;
      const d = Math.hypot(b.x - cx, b.y - cy);
      if (d < b.r) {
        const nx = (b.x - cx) / (d || 1), ny = (b.y - cy) / (d || 1);
        b.x = cx + nx * (b.r + 0.5); b.y = cy + ny * (b.r + 0.5);
      }
    }
    b.x = Math.max(b.r, Math.min(W - b.r, b.x));
    b.y = Math.max(b.r, Math.min(H - b.r, b.y));
  }

  handSize() { return BALANCE.HAND_SIZE + this.stats.handSize; }

  // ───────────────────────── events & helpers ─────────────────────────

  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, ...args) { for (const fn of this.handlers[type] || []) fn(...args); }
  wait(sec, fn) { this.timers.push({ t: sec, fn }); }

  /** Call an item hook on every owned item (and the boss script where relevant). */
  fire(hook, ...args) {
    for (const inst of this.run.items) {
      const def = ITEM_MAP[inst.id];
      const fn = def?.hooks?.[hook];
      if (fn) {
        const r = fn(this, ...args, inst);
        if (hook === 'onLethal' && r) return true;
      }
    }
    return false;
  }

  ownBalls() { return this.sim.balls.filter((b) => !b.pocketed && b.group === 'solid'); }
  alive() { return this.enemies.filter((e) => !e.dead); }
  target() {
    const t = this.enemies[this.targetIdx];
    if (t && !t.dead) return t;
    return this.alive().sort((a, b) => a.hp - b.hp)[0] || null;
  }
  setTarget(idx) { if (this.enemies[idx] && !this.enemies[idx].dead) { this.targetIdx = idx; this.emit('hud'); } }

  text(x, y, str, color = '#fff', size = 18) { this.emit('text', x, y, str, color, size); }
  banner(str, color = '#fff', dur = 1.4) { this.emit('banner', str, color, dur); }
  say(enemy, str) { if (enemy && str) this.emit('say', enemy, str); }
  shake(a) { this.emit('shake', a); }
  taunt(key, enemy = this.activeEnemy || this.enemies[0], chance = 0.6) {
    if (!enemy || enemy.dead || !this.rng.chance(chance)) return;
    const pool = this.boss?.taunts?.[enemy.taunts && key === 'enemySink' ? enemy.taunts : key] || this.boss?.taunts?.[key];
    if (pool) return this.say(enemy, this.rng.pick(pool));
    if (Array.isArray(enemy.taunts) && enemy.taunts.length) this.say(enemy, this.rng.pick(enemy.taunts));
  }

  addCoins(n, silent = false) {
    if (!n) return;
    const amt = n > 0 ? Math.round(n * this.stats.coinMult) : n;
    this.run.coins = Math.max(0, this.run.coins + amt);
    if (amt > 0) this.run.stats.coinsEarned += amt;
    this.emit('coins', amt, silent);
  }

  heal(n) {
    if (n <= 0 || this.stats.suddenDeath) return;
    const before = this.run.hp;
    this.run.hp = Math.min(this.run.maxHp, this.run.hp + Math.round(n));
    if (this.run.hp > before) this.emit('heal', this.run.hp - before);
  }

  hurtPlayer(amount, reason = '', x = null, y = null) {
    if (this.result) return;
    if (this.stats.suddenDeath && (reason === 'SINK' || reason === 'MISS')) return;
    let a = amount;
    if (reason === 'SINK') a = a * this.stats.takenMult - this.stats.takenFlat;
    else a *= this.stats.takenMult;
    a = Math.max(reason === 'SINK' ? 1 : 0, Math.round(a));
    if (this.stats.suddenDeath && a > 0) a = this.run.hp;
    if (a <= 0) return;
    this.run.hp -= a;
    this.flags.tookDamage = true;
    this.emit('hurtPlayer', a, reason, x, y);
    if (this.run.hp <= 0) {
      this.run.hp = 0;
      if (this.fire('onLethal')) { this.emit('hud'); return; }
      this.end(false);
    }
  }

  hurtEnemy(e, amount, x = null, y = null, tags = []) {
    if (!e || e.dead || this.result) return 0;
    let a = amount;
    if (e.traits.includes('armored')) a *= 0.8;
    a = Math.max(0, Math.round(a));
    if (a <= 0) return 0;
    e.hp -= a;
    this.run.stats.damage += a;
    this.run.stats.bestHit = Math.max(this.run.stats.bestHit || 0, a);
    this.emit('hurtEnemy', e, a, x, y, tags);
    if (a >= 18) this.taunt('hurt', e, 0.5);
    // phase changes
    if (this.boss?.phases) {
      this.boss.phases.forEach((ph, i) => {
        if (e.phase <= i && e.hp > 0 && e.hp <= e.maxHp * ph.at) {
          e.phase = i + 1;
          ph.enter(this, e);
          if (this.stats.bossRage) e.dmgMult *= 1 + this.stats.bossRage;
          this.emit('phase', e, ph);
          this.banner(ph.name, this.boss.color || '#ff5252', 2);
          this.say(e, this.boss.phaseLine);
          this.shake(14);
        }
      });
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      this.emit('enemyDown', e);
      if (this.boss?.onEnemyDown) this.boss.onEnemyDown(this, e);
      if (!this.alive().length) this.end(true);
    }
    return a;
  }

  end(won, extra = {}) {
    if (this.result) return;
    this.result = { won, ...extra };
    this.fire('onFightEnd', won);
    if (won && this.stats.healAfterFight && !this.scenario) this.heal(this.stats.healAfterFight);
    this.state = 'over';
    this.timers = [];
    this.wait(1.1, () => this.emit('over', this.result));
  }

  // ───────────────────────── rack & turns ─────────────────────────

  start() {
    if (this.scenario) { this.setupScenario(); return; }
    this.newRack(this.enc.enemyBreaks ? 'enemy' : 'player');
  }

  newRack(breaker) {
    this.rackNo++;
    const sim = this.sim;
    sim.balls = [];
    const order = rackOrder(this.rng);
    rackPositions(R).forEach((p, i) => {
      const num = order[i];
      const b = makeBall(num, num, num === 8 ? 'eight' : num < 8 ? 'solid' : 'stripe', p.x, p.y);
      randomOrient(b, this.rng);
      sim.balls.push(b);
    });
    const cue = makeBall(0, 0, 'cue', W / 2, HEAD_Y + 90);
    sim.balls.push(cue);
    this.isBreak = true;
    this.ballInHand = 'kitchen';
    this.fire('onRackStart');
    this.emit('rack', this.rackNo);
    if (this.rackNo > 1) this.banner(`RACK ${this.rackNo}`, '#fff', 1.2);
    this.beginTurn(breaker);
  }

  setupScenario() {
    const sc = this.scenario;
    this.sim.balls = [];
    for (const b of sc.balls) {
      const ball = makeBall(b.id ?? b.num, b.num, b.group || (b.num === 8 ? 'eight' : b.num < 8 ? 'solid' : 'stripe'), b.x, b.y);
      Object.assign(ball.mods, b.mods || {});
      randomOrient(ball, this.rng);
      this.sim.balls.push(ball);
    }
    this.sim.balls.push(makeBall(0, 0, 'cue', sc.cue.x, sc.cue.y));
    this.isBreak = false;
    this.ballInHand = sc.ballInHand || null;
    if (sc.charges) Object.assign(this.charges, sc.charges);
    this.fire('onRackStart');
    this.emit('rack', 1);
    this.beginTurn('player');
  }

  beginTurn(who) {
    if (this.result) return;
    this.turn = who;
    this.turnCount++;
    this.turnSinks = 0;
    this.shot = null;
    if (this.boss?.onTurnStart) this.boss.onTurnStart(this, who);
    this.fire('onTurnStart', who);
    if (who === 'enemy') {
      const alive = this.alive();
      if (!alive.length) return;
      const e = alive[this.enemyTurnIdx++ % alive.length];
      this.activeEnemy = e;
      e.streak = 0;
      if (e.status.burn > 0) {
        e.status.burn--;
        this.hurtEnemy(e, 2 + (this.stats.burnBonus || 0), null, null, ['BURN']);
        this.emit('burn', e);
        if (this.result) return;
      }
      if (e.traits.includes('regen') && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + 2);
        this.emit('enemyHeal', e, 2);
      }
      if (e.status.frozen > 0) {
        e.status.frozen--;
        this.banner(`${e.name} is FROZEN!`, '#80deea', 1.1);
        this.state = 'wait';
        this.wait(1.1, () => this.beginTurn('player'));
        this.emit('turn', who);
        return;
      }
      this.state = 'think';
      this.planner = this.boss?.enemyMode === 'tilt'
        ? planTilt(this.sim, 'enemy', e.tilt || 620, this.rng)
        : planShot(this.sim, 'enemy', this.isBreak, !!this.ballInHand, this.aiProfile(e), this.rng);
      this.thinkTime = 0;
    } else {
      if (this.turnCount > 1) this.drawCards(1 + this.stats.drawPerTurn);
      this.state = 'aim';
      this.pending = { flags: {} };
      this.armed.clear();
      this.cardPlayed = false;
      this.aim.power = 0;
      this.autoAim();
    }
    this.emit('turn', who);
    this.emit('hud');
    if (!this.scenario) this.emit('save');
  }

  aiProfile(e) {
    return { skill: e.skill, banks: e.banks, trickBias: e.trickBias, width: e.skill > 0.6 ? 10 : 7 };
  }

  autoAim() {
    // point the cue at the nearest legal ball to start with
    const cue = this.sim.cue;
    if (!cue || cue.pocketed) return;
    const g = this.isBreak ? null : remaining(this.sim, 'solid') > 0 ? 'solid' : 'eight';
    let best = null, bd = 1e9;
    for (const b of this.sim.balls) {
      if (b.pocketed || b.group === 'cue' || (g && b.group !== g)) continue;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.aim.angle = Math.atan2(best.y - cue.y, best.x - cue.x);
  }

  drawCards(n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= this.handSize()) break;
      if (!this.deck.length) {
        if (!this.discard.length) break;
        this.deck = this.rng.shuffle(this.discard);
        this.discard = [];
      }
      this.hand.push(this.deck.pop());
      drawn++;
    }
    if (drawn) this.emit('hand');
    return drawn;
  }

  grantBallInHand() {
    this.ballInHand = 'anywhere';
    this.emit('hud');
  }

  // ───────────────────────── player actions ─────────────────────────

  canAct() { return this.state === 'aim' && this.turn === 'player' && !this.result; }

  toggleArm(id) {
    if (!this.canAct()) return false;
    if (this.armed.has(id)) { this.armed.delete(id); this.emit('hud'); return true; }
    if (!(this.charges[id] > 0)) return false;
    this.armed.add(id);
    this.emit('hud');
    return true;
  }

  playCard(idx) {
    if (!this.canAct()) return false;
    const id = this.hand[idx];
    const def = CARD_MAP[id];
    if (!def) return false;
    if (!def.free && this.cardPlayed) return false;
    if (!def.free) this.cardPlayed = true;
    this.hand.splice(idx, 1);
    this.discard.push(id);
    def.play(this.pending, this);
    this.emit('cardPlayed', def);
    this.emit('hand');
    this.emit('hud');
    return true;
  }

  canUseConsumable(id) {
    const def = ITEM_MAP[id];
    if (!def || this.result) return false;
    if (def.use === 'rewind') return !!this.snapshot && (this.state === 'think' || this.state === 'enemyAim' || this.state === 'aim') && this.lastShooter === 'player';
    if (def.use === 'escape') return this.enc.kind !== 'boss' && !this.scenario && this.canAct();
    if (def.use === 'bomb12') return this.canAct() && !!this.target();
    return this.canAct();
  }

  useConsumable(slot) {
    const id = this.run.consumables[slot];
    if (!this.canUseConsumable(id)) return false;
    const def = ITEM_MAP[id];
    if (def.use === 'rewind') {
      const snap = this.snapshot;
      this.restore(snap);
      const i = this.run.consumables.indexOf('rewind');
      if (i >= 0) this.run.consumables.splice(i, 1);
      this.banner('⏪ REWIND', '#80cbc4');
      this.emit('rewind');
      this.emit('hud');
      return true;
    }
    this.run.consumables.splice(slot, 1);
    switch (def.use) {
      case 'freeze': for (const e of this.enemies) e.status.frozen = 1; this.banner('🧊 OPPONENT FROZEN', '#80deea'); break;
      case 'shrink': for (const e of this.enemies) e.status.shrink = 2; this.banner('🤏 THEIR POCKETS SHRINK', '#ffcc80'); break;
      case 'heal20': this.heal(20); break;
      case 'bomb12': { const t = this.target(); this.hurtEnemy(t, 12, null, null, ['BOMB']); this.shake(10); break; }
      case 'ballInHand': this.grantBallInHand(); break;
      case 'draw2': this.drawCards(2); break;
      case 'bigPockets': this.pending.flags.pocketMul = (this.pending.flags.pocketMul || 1) * 1.5; break;
      case 'escape': this.end(false, { escaped: true }); break;
      default: break;
    }
    this.emit('consumableUsed', def);
    this.emit('hud');
    return true;
  }

  canPlaceAt(x, y, zone = this.ballInHand) {
    const cue = this.sim.cue;
    const r = cue.r;
    if (x < r || x > W - r || y < r || y > H - r) return false;
    if (zone === 'kitchen' && y < HEAD_Y) return false;
    for (const b of this.sim.balls) {
      if (b === cue || b.pocketed) continue;
      if (Math.hypot(b.x - x, b.y - y) < b.r + r + 0.5) return false;
    }
    for (const bp of this.sim.table.bumpers) if (Math.hypot(bp.x - x, bp.y - y) < bp.r + r + 1) return false;
    for (const p of this.sim.table.pockets) if (Math.hypot(p.x - x, p.y - y) < p.r + r) return false;
    return true;
  }

  moveCueBall(x, y) {
    if (!this.canAct() || !this.ballInHand) return false;
    const zone = this.ballInHand;
    x = Math.max(R, Math.min(W - R, x));
    y = Math.max(zone === 'kitchen' ? HEAD_Y : R, Math.min(H - R, y));
    if (!this.canPlaceAt(x, y)) return false;
    const c = this.sim.cue;
    c.x = x; c.y = y; c.pocketed = false;
    return true;
  }

  playerShoot() {
    if (!this.canAct()) return false;
    const a = this.aim;
    if (a.power < 0.02) return false;
    const shot = {
      who: 'player', angle: a.angle, power: a.power,
      spinX: this.stats.noSpin ? 0 : a.spinX, spinY: this.stats.noSpin ? 0 : a.spinY,
      flags: { ...this.pending.flags },
    };
    for (const id of this.armed) {
      const def = ITEM_MAP[id];
      if (def?.arm && this.charges[id] > 0) { def.arm(shot); this.charges[id]--; }
    }
    this.armed.clear();
    if (this.stats.aimJitter) shot.angle += this.rng.gauss() * this.stats.aimJitter * (Math.PI / 180);
    this.snapshot = this.serialize();
    this.lastShooter = 'player';
    if (this.stats.hpPerShot) this.hurtPlayer(this.stats.hpPerShot, 'BLOOD');
    if (this.result) return true;
    this.run.stats.shots++;
    this.executeShot(shot);
    return true;
  }

  executeShot(shot) {
    this.shot = shot;
    this.shotNo++;
    this.ballInHand = null;
    const sim = this.sim;
    const e = this.activeEnemy;
    // pockets
    let ps = this.basePocketScale;
    if (shot.who === 'player') ps *= this.stats.pocketScale * (shot.flags.pocketMul || 1);
    else if (e) {
      if (e.traits.includes('lucky')) ps *= 1.15;
      if (e.status.shrink > 0) { ps *= 0.55; e.status.shrink--; }
    }
    this.setPocketScale(ps);
    // fields
    const fields = this.baseFields.map((f) => ({ ...f }));
    if (shot.who === 'player') {
      if (this.stats.gravityWell) fields.push({ type: 'pockets', k: 300, radius: 110, groups: ['solid', 'stripe', 'eight'] });
      if (shot.flags.magnet) fields.push({ type: 'pockets', k: 750, radius: 175, groups: ['solid'] });
      if (shot.flags.curve) fields.push({ type: 'curve', k: 1500 });
      if (this.boss?.playerFields) fields.push(...this.boss.playerFields(this));
      sim.railBoost = this.stats.railBoost;
    } else {
      sim.railBoost = 0;
    }
    sim.fields = fields;
    // event horizon (player shots only: a centre hole that eats stripes)
    const pockets = this.tableSpec.pockets.filter((p) => !p.eventHorizon);
    if (shot.who === 'player' && this.stats.eventHorizon) pockets.push({ kind: 'hole', x: W / 2, y: H / 2, r: 15, accept: ['stripe'], eventHorizon: true, glow: '#b388ff' });
    if (pockets.length !== this.tableSpec.pockets.length) {
      this.tableSpec.pockets = pockets;
      sim.table = buildTable({ ...this.tableSpec, pocketScale: ps });
    }
    sim.flags = { ghost: !!shot.flags.ghost };
    sim.rollMul = this.rollMul;
    const own = groupOf(shot.who);
    this.ownLeftBefore = remaining(sim, own);
    this.shotWasBreak = this.isBreak;
    sim.startShot();
    this.shotStart = sim.time;
    this.sinksThisShot = 0;
    if (shot.tilt) {
      sim.fields.push({ type: 'tilt', ax: Math.cos(shot.angle) * shot.strength, ay: Math.sin(shot.angle) * shot.strength, until: sim.time + 0.8 });
      this.shake(8);
    } else {
      let speed = PHYS.MIN_SPEED + (PHYS.MAX_SPEED - PHYS.MIN_SPEED) * shot.power;
      if (shot.who === 'player') speed *= this.stats.powerMult * (shot.flags.powerCap || 1);
      if (this.isBreak) speed *= PHYS.BREAK_MULT;
      const spinK = PHYS.SPIN_K * (shot.who === 'player' ? this.stats.spinMult : 1);
      sim.strike(sim.cue, shot.angle, speed, shot.spinX, shot.spinY, spinK);
    }
    this.state = 'moving';
    this.acc = 0;
    this.emit('shot', shot);
  }

  // ───────────────────────── simulation events ─────────────────────────

  onSimEvent(type, a, b, c) {
    const shot = this.shot;
    switch (type) {
      case 'first': {
        if (!shot) break;
        if (shot.flags.stun) { a.vx *= 0.06; a.vy *= 0.06; a.wx = -a.vx; a.wy = -a.vy; a.ws = 0; }
        if (shot.flags.explode) this.queue.push({ t: 'explode', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, radius: 150, power: 950, depth: 0, chain: true });
        if (shot.flags.lightning) this.queue.push({ t: 'lightning', from: b.id });
        this.fire('onFirstContact', a, b);
        break;
      }
      case 'collide': {
        this.emit('collide', a, b, c);
        if (c > 650) {
          if (a.mods.split) this.queue.push({ t: 'split', id: a.id, chain: !!shot?.flags.explode });
          if (b.mods.split) this.queue.push({ t: 'split', id: b.id, chain: !!shot?.flags.explode });
        }
        this.fire('onCollide', a, b, c);
        break;
      }
      case 'cushion': {
        this.emit('cushion', a, b, c);
        if (b === 'jaw' && this.stats.stickyJaws && a.group === 'solid' && shot?.who === 'player') this.queue.push({ t: 'force', id: a.id });
        break;
      }
      case 'pocket': {
        const ball = a, pocket = b;
        if (pocket.owner === 'player' && ball.group !== 'solid') { this.queue.push({ t: 'respot', id: ball.id }); break; }
        this.emit('pocket', ball, pocket);
        if (ball.mods.cluster) this.queue.push({ t: 'explode', x: ball.x, y: ball.y, radius: 170, power: 900, depth: 1 });
        if (shot?.who === 'player' && ball.group === 'solid') {
          this.sinksThisShot++;
          if (this.sinksThisShot >= 2) this.slowmo(0.5, 0.35);
        }
        this.fire('onPocket', ball, pocket);
        break;
      }
      case 'bumper':
        this.emit('cushion', a, 'bumper', c);
        if (this.boss?.onBumper) this.boss.onBumper(this, a, b);
        break;
      case 'mover':
        this.emit('collide', a, b, c);
        break;
      case 'ghost':
        this.emit('ghost', a, b);
        break;
      default: break;
    }
  }

  processQueue() {
    while (this.queue.length) {
      const q = this.queue.shift();
      if (q.t === 'explode') this.explode(q.x, q.y, q.radius, q.power, q.depth, q.chain);
      else if (q.t === 'split') this.splitBall(this.sim.ball(q.id), q.chain);
      else if (q.t === 'lightning') this.lightning(this.sim.ball(q.from));
      else if (q.t === 'force') {
        const b = this.sim.ball(q.id);
        if (b && !b.pocketed) {
          let best = null, bd = 1e9;
          for (const p of this.sim.table.pockets) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
          if (best && bd < 70) { this.text(b.x, b.y, 'STICKY!', '#ffca28', 14); this.sim.pocketBall(b, best); }
        }
      } else if (q.t === 'respot') {
        const b = this.sim.ball(q.id);
        if (b) {
          b.pocketed = false;
          this.sim.log.pockets = this.sim.log.pockets.filter((p) => p.id !== b.id);
          this.spotBall(b);
          this.text(b.x, b.y, 'SPAT OUT', '#69f0ae', 13);
        }
      }
    }
  }

  spotBall(b, x = FOOT_SPOT.x, y = FOOT_SPOT.y) {
    b.vx = b.vy = b.wx = b.wy = b.ws = 0;
    for (let k = 0; k < 60; k++) {
      const tx = x + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3 : 0), ty = y - (k > 30 ? (k - 30) * 3 : 0);
      if (!this.sim.balls.some((o) => o !== b && !o.pocketed && Math.hypot(o.x - tx, o.y - ty) < o.r + b.r + 0.5)) {
        b.x = tx; b.y = ty; return;
      }
    }
    b.x = x; b.y = y;
  }

  explode(x, y, radius, power, depth = 0, chain = false) {
    const fireOwned = this.run.items.some((i) => i.id === 'fire_balls');
    for (const b of this.sim.balls) {
      if (b.pocketed || b.group === 'cue') continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d > radius || d < 0.01) continue;
      const push = power * Math.pow(1 - d / radius, 0.6);
      b.vx += (dx / d) * push; b.vy += (dy / d) * push;
      b.wx = -b.vx * 0.3; b.wy = -b.vy * 0.3;
      if (b.mods.split && depth < 3) this.queue.push({ t: 'split', id: b.id, chain: chain || depth > 0, depth: depth + 1 });
      if (fireOwned && b.group === 'solid' && !b.mods.fire) { b.mods.fire = true; }
    }
    this.emit('explode', x, y, radius, depth);
    this.shake(depth ? 6 : 12);
  }

  splitBall(b, chain) {
    if (!b || b.pocketed || !b.mods.split) return;
    b.pocketed = true;
    b.removed = true;
    const sp = Math.hypot(b.vx, b.vy);
    const ang = sp > 1 ? Math.atan2(b.vy, b.vx) : this.rng.range(0, Math.PI * 2);
    const speed = Math.max(sp, 450) * 0.85;
    const r = R * 0.72;
    for (const s of [-1, 1]) {
      const a = ang + s * 0.55;
      const px = -Math.sin(ang) * s, py = Math.cos(ang) * s;
      const f = makeBall(this.nextId++, b.num, b.group, b.x + px * (r + 0.6), b.y + py * (r + 0.6), r);
      f.mods = { ...b.mods, split: false, fragment: true, cluster: false };
      f.vx = Math.cos(a) * speed; f.vy = Math.sin(a) * speed;
      f.wx = -f.vx * 0.5; f.wy = -f.vy * 0.5;
      f.q = b.q.slice();
      this.settleBall(f);
      this.sim.balls.push(f);
    }
    this.run.stats.splits = (this.run.stats.splits || 0) + 1;
    this.emit('split', b);
    if (chain) {
      this.flags.chainReaction = true;
      this.queue.push({ t: 'explode', x: b.x, y: b.y, radius: 100, power: 520, depth: 1, chain: true });
    }
  }

  lightning(from) {
    if (!from) return;
    const targets = this.ownBalls().filter((b) => b !== from)
      .sort((p, q) => Math.hypot(p.x - from.x, p.y - from.y) - Math.hypot(q.x - from.x, q.y - from.y)).slice(0, 2);
    const arcs = [];
    for (const t of targets) {
      let best = null, bd = 1e9;
      for (const p of this.sim.table.pockets) {
        if (p.accept) continue;
        const a = pocketAim(p), d = Math.hypot(a.x - t.x, a.y - t.y);
        if (d < bd) { bd = d; best = a; }
      }
      if (!best) continue;
      const sp = Math.min(1500, 180 + bd * 1.15);
      t.vx = ((best.x - t.x) / bd) * sp; t.vy = ((best.y - t.y) / bd) * sp;
      t.wx = -t.vx; t.wy = -t.vy;
      arcs.push([from.x, from.y, t.x, t.y]);
    }
    this.emit('lightning', arcs);
  }

  slowmo(dur, scale) {
    this.slowmoT = Math.max(this.slowmoT, dur);
    this.slowScale = Math.min(this.slowScale || 1, scale);
  }

  // ───────────────────────── main update ─────────────────────────

  update(dt) {
    // timers
    if (this.timers.length) {
      for (const t of this.timers) t.t -= dt;
      const due = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      for (const t of due) t.fn();
    }
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      this.timeScale = this.slowScale;
      if (this.slowmoT <= 0) { this.timeScale = 1; this.slowScale = 1; }
    }
    if (this.state === 'moving') {
      this.acc += dt * this.timeScale * this.ffwd;
      let steps = 0;
      const maxSteps = 40 * this.ffwd + 20;
      while (this.acc >= PHYS.DT && steps < maxSteps) {
        this.sim.step(PHYS.DT);
        if (this.queue.length) this.processQueue();
        this.acc -= PHYS.DT;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0;
      if (this.stats.slowmo && this.shot?.who === 'player') this.checkBulletTime();
      const elapsed = this.sim.time - this.shotStart;
      if ((!this.sim.isMoving() && elapsed > 0.15) || elapsed > PHYS.MAX_SIM_TIME) {
        if (elapsed > PHYS.MAX_SIM_TIME) for (const b of this.sim.balls) { b.vx = b.vy = b.wx = b.wy = 0; }
        this.resolve();
      }
    } else if (this.state === 'think') {
      this.thinkTime += dt;
      const t0 = (globalThis.performance || Date).now();
      let r;
      do { r = this.planner.next(); } while (!r.done && (globalThis.performance || Date).now() - t0 < 6);
      if (r.done) {
        this.plan = r.value;
        this.state = 'enemyAim';
        this.enemyAimT = 0;
        const minThink = this.headless ? 0 : 0.5;
        this.enemyAimDelay = Math.max(0, minThink - this.thinkTime);
        if (this.plan.place) this.moveEnemyCue(this.plan.place);
        const from = this.enemyAim?.angle ?? this.aim.angle;
        this.enemyAim = { from, angle: from, target: this.plan.tilt ?? this.plan.angle, power: 0, tilt: this.plan.tilt !== undefined };
        if (this.stats.seeEnemyAim) this.enemyAim.show = true;
      }
    } else if (this.state === 'enemyAim') {
      const dur = this.headless ? 0 : 0.9;
      if (this.enemyAimDelay > 0) { this.enemyAimDelay -= dt; return; }
      this.enemyAimT += dt;
      const ea = this.enemyAim;
      const t = Math.min(1, this.enemyAimT / Math.max(0.001, dur * 0.65));
      const ease = t * t * (3 - 2 * t);
      let d = ea.target - ea.from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ea.angle = ea.from + d * ease;
      ea.power = Math.max(0, (this.enemyAimT - dur * 0.65) / (dur * 0.35)) * (this.plan.power ?? 0.6);
      if (this.enemyAimT >= dur) {
        this.lastShooter = 'enemy';
        if (this.plan.tilt !== undefined) this.executeShot({ who: 'enemy', tilt: true, angle: this.plan.tilt, strength: this.plan.strength, flags: {} });
        else this.executeShot({ who: 'enemy', angle: this.plan.angle, power: this.plan.power, spinX: this.plan.spinX || 0, spinY: this.plan.spinY || 0, flags: {} });
        this.enemyAim = null;
      }
    }
  }

  moveEnemyCue(p) {
    const c = this.sim.cue;
    c.pocketed = false; c.x = p.x; c.y = p.y; c.vx = c.vy = 0;
    this.settleBall(c);
  }

  checkBulletTime() {
    if (this.slowmoT > 0) return;
    for (const b of this.sim.balls) {
      if (b.pocketed || b.group !== 'solid' || b.travel < 350) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 150) continue;
      for (const p of this.sim.table.pockets) {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
        if (d < 80 && (dx * b.vx + dy * b.vy) / (d * sp) > 0.9) { this.slowmo(0.55, 0.3); return; }
      }
    }
  }

  // ───────────────────────── resolution ─────────────────────────

  resolve() {
    const shot = this.shot;
    this.state = 'resolving';
    // un-remove split originals from the ball list
    this.sim.balls = this.sim.balls.filter((b) => !b.removed);
    const res = evaluateShot(this.sim, shot.who, { ownLeft: this.ownLeftBefore }, this.shotWasBreak, shot.flags);
    if (shot.tilt && res.foul === 'noHit') { res.foul = null; res.continueTurn = false; }
    if (res.kick && !this.shotWasBreak) res.kick = true;
    // Crystal 8: an early 8 isn't a rack loss for the player
    if (shot.who === 'player' && this.stats.crystalEight && res.rack === 'lose' && !res.foul) {
      res.rack = null; res.respotEight = true; res.crystal = true;
    }
    this.lastRes = res;
    this.fire('onShotEnd', res);
    if (this.boss?.onShotEnd) this.boss.onShotEnd(this, res);
    if (this.scenario) return this.resolveScenario(res);
    if (shot.who === 'player') this.applyPlayerShot(res, shot);
    else this.applyEnemyShot(res, shot);
    this.isBreak = false;
    if (this.result) return;
    this.afterShot(res, shot);
  }

  sinkDamage(entry, idx, res, shot) {
    const st = this.stats;
    const b = entry.ball;
    const info = { ball: b, base: BALANCE.BALL_DMG + st.ballDmg, flat: 0, mult: 1, tags: [], index: idx };
    if (b.mods.gold) info.flat += 4;
    if (b.mods.lucky7) { info.mult *= 3; info.tags.push('LUCKY 7'); }
    if (b.mods.fragment) info.mult *= 0.7;
    if (entry.bank) {
      const m = (entry.rails >= 2 ? BALANCE.BANK2_MULT : BALANCE.BANK_MULT) + st.bankBonus;
      info.mult *= shot.flags.bankMul ? Math.max(m, shot.flags.bankMul) : m;
      info.tags.push(entry.rails >= 2 ? 'DOUBLE BANK' : 'BANK');
    }
    if (entry.combo) { info.mult *= BALANCE.COMBO_MULT + st.comboBonus; info.tags.push('COMBO'); }
    if (res.kick) { info.mult *= BALANCE.KICK_MULT + st.kickBonus; info.tags.push('KICK'); }
    if (entry.long) { info.mult *= BALANCE.LONG_MULT + st.longBonus; info.tags.push('LONG'); }
    if (idx > 0) { info.mult *= 1 + BALANCE.MULTI_BONUS * idx; info.tags.push(['', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA'][Math.min(idx, 4)] + '!'); }
    if (res.isBreak) { info.mult *= st.breakMult; info.tags.push('BREAK'); }
    if (shot.flags.dmgMul) info.mult *= shot.flags.dmgMul;
    if (st.banksOnly) {
      if (entry.bank || entry.combo || res.kick) info.mult *= 2; else { info.mult = 0; info.tags = ['NO BANK']; }
    }
    this.fire('onSinkDamage', info);
    info.amount = Math.round((info.base + info.flat) * info.mult * st.dmgMult);
    return info;
  }

  applyPlayerShot(res, shot) {
    const st = this.stats;
    const rs = this.run.stats;
    const act = this.act;
    res.own.forEach((entry, i) => {
      const b = entry.ball;
      const info = this.sinkDamage(entry, i, res, shot);
      const tgt = this.target();
      const px = b.sinkX ?? b.x, py = b.sinkY ?? b.y;
      if (tgt && info.amount > 0) this.hurtEnemy(tgt, info.amount, px, py, info.tags);
      let coins = st.coinsPerSink + (shot.flags.coinsPerBall || 0);
      if (b.mods.gold) coins += 15;
      if (b.mods.lucky7) coins += 7;
      if (i > 0) coins += 3;
      if (entry.bank) coins += 2;
      if (entry.combo) coins += 2;
      if (coins) this.addCoins(coins);
      this.heal(st.healPerSink + (shot.flags.healPerBall || 0));
      if (b.mods.fire && tgt) { tgt.status.burn += 3; this.emit('burnApplied', tgt); }
      this.turnSinks++;
      rs.ballsSunk++;
      if (entry.bank) rs.banks = (rs.banks || 0) + 1;
      if (entry.rails >= 2) rs.doubleBanks = (rs.doubleBanks || 0) + 1;
      if (entry.combo) rs.combos = (rs.combos || 0) + 1;
    });
    rs.bestMulti = Math.max(rs.bestMulti || 0, res.own.length);
    if (this.flags.chainReaction) rs.chainReactions = (rs.chainReactions || 0) + 1;
    this.flags.chainReaction = false;

    if (res.foul) {
      rs.fouls++;
      if (res.cueScratch) this.flags.scratches = (this.flags.scratches || 0) + 1;
      if (shot.flags.safety) this.text(this.sim.cue.x, this.sim.cue.y, 'SAFETY NET', '#80cbc4', 16);
      else if (this.flags.forgiveFoul > 0) { this.flags.forgiveFoul--; this.text(W / 2, H / 2, 'FOUL FORGIVEN', '#80cbc4', 18); }
      else {
        let d = BALANCE.FOUL_DMG[act] * st.foulMult;
        if (res.cueScratch) d *= st.scratchMult;
        if (this.activeEnemy?.traits.includes('bully') || this.alive().some((e) => e.traits.includes('bully'))) d *= 2;
        this.hurtPlayer(d, res.foul === 'scratch' ? 'SCRATCH' : 'FOUL');
        this.taunt('playerFoul');
      }
    } else if (!res.own.length && !res.isBreak && !res.rack) {
      if (shot.flags.doubleDown) this.hurtPlayer(shot.flags.doubleDown, 'BUST');
      if (this.flags.freeMiss > 0 && !shot.flags.secondChance) { this.flags.freeMiss--; res.freeMiss = true; }
      else if (!shot.flags.secondChance) this.hurtPlayer(BALANCE.MISS_DMG[act], 'MISS');
      this.taunt('playerMiss', undefined, 0.35);
    }

    if (res.rack === 'win') {
      const t = this.target();
      const dmg = BALANCE.FINISHER_DMG * st.finisherMult * st.dmgMult * (shot.flags.dmgMul || 1);
      this.flags.lastBlowEight = true;
      if (t) this.hurtEnemy(t, dmg, this.sim.ball(8)?.sinkX, this.sim.ball(8)?.sinkY, ['8-BALL!']);
      this.banner('🎱 RACK WON!', '#ffd54f');
      this.rackLoser = 'enemy';
      rs.racksWon = (rs.racksWon || 0) + 1;
    } else if (res.rack === 'lose') {
      this.hurtPlayer(BALANCE.EIGHT_PENALTY * st.eightPenaltyMult, 'EARLY 8');
      this.banner('💀 EARLY 8 — RACK LOST', '#ff5252');
      this.rackLoser = 'player';
    }
    if (res.crystal) { const t = this.target(); if (t) this.hurtEnemy(t, 15, null, null, ['CRYSTAL 8']); }
    if (this.result) this.flags.lastBlowEight = res.rack === 'win';
    else this.flags.lastBlowEight = false;
  }

  applyEnemyShot(res, shot) {
    const e = this.activeEnemy;
    const act = this.act;
    if (!e) return;
    res.own.forEach((entry, i) => {
      let d = e.dmg * (e.dmgMult || 1);
      if (entry.bank) d *= 1.3;
      if (entry.combo) d *= 1.3;
      if (i > 0) d *= 1 + 0.25 * i;
      if (e.traits.includes('hot_streak')) d += 2 * e.streak;
      e.streak++;
      const b = entry.ball;
      this.hurtPlayer(d, 'SINK', b.sinkX ?? b.x, b.sinkY ?? b.y);
      if (e.traits.includes('thief')) { this.addCoins(-3); this.text(b.sinkX ?? b.x, b.sinkY ?? b.y, '-3¢', '#ffd54f', 14); }
      if (e.hustle) { this.addCoins(-e.hustle); this.text(b.sinkX ?? b.x, (b.sinkY ?? b.y) + 20, `HUSTLED -${e.hustle}¢`, '#ffd54f', 13); }
    });
    if (res.own.length) this.taunt('enemySink', e, 0.45);
    if (res.foul) {
      this.hurtEnemy(e, BALANCE.FOUL_DMG[act] * this.stats.enemyFoulMult, null, null, ['FOUL']);
    } else if (!res.own.length && !res.isBreak && !res.rack && !shot.tilt) {
      this.hurtEnemy(e, BALANCE.MISS_DMG[act], null, null, ['MISS']);
    }
    if (res.rack === 'win') {
      this.hurtPlayer(12 + act * 2, 'THEIR 8');
      if (this.stats.suddenDeath) this.hurtPlayer(99, 'THEIR 8');
      this.banner(`🎱 ${e.name} WINS THE RACK`, '#ff8a65');
      this.rackLoser = 'player';
    } else if (res.rack === 'lose') {
      this.hurtEnemy(e, BALANCE.EIGHT_PENALTY, null, null, ['EARLY 8']);
      this.banner('THEY SANK THE 8 EARLY!', '#69f0ae');
      this.rackLoser = 'enemy';
    }
  }

  afterShot(res, shot) {
    const sim = this.sim;
    if (res.respotEight) {
      const eight = sim.balls.find((b) => b.group === 'eight');
      if (eight) { eight.pocketed = false; this.spotBall(eight); }
    }
    if (res.cueScratch || sim.cue.pocketed) {
      const c = sim.cue;
      c.pocketed = false;
      c.x = W / 2; c.y = HEAD_Y + 90;
      if (!this.canPlaceAt(c.x, c.y, 'anywhere')) this.spotBall(c, W / 2, HEAD_Y + 90);
      c.vx = c.vy = 0;
    }
    if (res.rack) {
      const loser = this.rackLoser || 'player';
      this.state = 'wait';
      this.wait(1.5, () => this.newRack(loser));
      return;
    }
    const me = shot.who;
    const other = me === 'player' ? 'enemy' : 'player';
    let next = res.continueTurn ? me : other;
    if (me === 'player') {
      if (shot.flags.doubleShot) { next = 'player'; this.banner('⏩ DOUBLE SHOT', '#80d8ff', 0.9); }
      if (!res.continueTurn && shot.flags.secondChance && !res.foul && !res.own.length) { next = 'player'; this.banner('🔁 SECOND CHANCE', '#80d8ff', 0.9); }
      if (res.freeMiss) { next = 'player'; this.banner('🥢 FREE SHOT', '#80d8ff', 0.9); }
    }
    if (!this.enemies.length) next = 'player';
    if (res.foul && next !== me) this.ballInHand = 'anywhere';
    else if (res.foul && next === me) this.ballInHand = 'anywhere';
    if (next === 'enemy') this.snapshotHold = true;
    if (me === 'enemy') this.snapshot = null;
    this.state = 'wait';
    this.wait(next === me ? 0.35 : 0.6, () => this.beginTurn(next));
  }

  resolveScenario(res) {
    const sc = this.scenario;
    this.practiceShots++;
    const goal = sc.goal || 'pot';
    let ok = false;
    const potted = res.own.length > 0 && !res.cueScratch;
    if (goal === 'pot') ok = potted;
    else if (goal === 'draw') ok = potted && (sc.drawX ? this.sim.cue.x > sc.drawX : this.sim.cue.y > (sc.drawLine ?? 0));
    else if (goal === 'explode') ok = potted && this.shot.flags.explode;
    else if (goal === 'target') ok = res.pocketed.some((p) => p.ball.num === sc.target) && !res.cueScratch;
    this.emit('scenarioShot', ok, res);
    if (ok) { this.end(true); return; }
    if (sc.maxShots && this.practiceShots >= sc.maxShots) { this.end(false); return; }
    // reset the layout for another try
    this.state = 'wait';
    this.wait(0.9, () => { if (sc.resetOnMiss !== false) this.setupScenario(); else this.beginTurn('player'); });
  }

  // ───────────────────────── save / restore ─────────────────────────

  serialize() {
    return {
      v: 1,
      rng: this.rng.s,
      enc: this.enc,
      balls: this.sim.balls.filter((b) => !b.removed).map((b) => ({
        id: b.id, num: b.num, group: b.group, x: b.x, y: b.y, r: b.r, mods: { ...b.mods }, pocketed: b.pocketed, q: b.q.slice(),
      })),
      tableSpec: JSON.parse(JSON.stringify(this.tableSpec)),
      pocketScale: this.sim.table.pocketScale,
      basePocketScale: this.basePocketScale,
      baseFields: this.baseFields.map((f) => ({ ...f })),
      movers: this.sim.movers.map((m) => ({ ...m })),
      simTime: this.sim.time,
      rollMul: this.rollMul,
      enemies: this.enemies.map((e) => ({ ...e, status: { ...e.status } })),
      turn: this.turn, isBreak: this.isBreak, ballInHand: this.ballInHand,
      rackNo: this.rackNo, turnCount: this.turnCount, enemyTurnIdx: this.enemyTurnIdx, targetIdx: this.targetIdx,
      nextId: this.nextId, deck: this.deck.slice(), hand: this.hand.slice(), discard: this.discard.slice(),
      charges: { ...this.charges }, flags: { ...this.flags }, practiceShots: this.practiceShots,
      aimAngle: this.aim.angle,
      runState: { hp: this.run.hp, coins: this.run.coins, consumables: this.run.consumables.slice(), stats: { ...this.run.stats } },
      itemState: this.run.items.map((i) => ({ ...i })),
    };
  }

  restore(s, fresh = false) {
    this.rng = new RNG(1);
    this.rng.s = s.rng;
    this.tableSpec = s.tableSpec;
    this.basePocketScale = s.basePocketScale;
    this.baseFields = s.baseFields;
    this.rollMul = s.rollMul;
    if (!this.sim) {
      this.sim = new Sim(buildTable({ ...this.tableSpec, pocketScale: s.pocketScale }));
      this.sim.listener = (...a) => this.onSimEvent(...a);
    } else {
      this.sim.table = buildTable({ ...this.tableSpec, pocketScale: s.pocketScale });
    }
    this.sim.rollMul = this.rollMul;
    this.sim.time = s.simTime;
    this.sim.movers = s.movers.map((m) => ({ ...m }));
    this.sim.fields = [];
    this.sim.balls = s.balls.map((b) => {
      const nb = makeBall(b.id, b.num, b.group, b.x, b.y, b.r);
      nb.mods = { ...b.mods }; nb.pocketed = b.pocketed; nb.q = b.q.slice();
      return nb;
    });
    this.enemies = s.enemies.map((e) => ({ ...e, status: { ...e.status } }));
    this.turn = s.turn; this.isBreak = s.isBreak; this.ballInHand = s.ballInHand;
    this.rackNo = s.rackNo; this.turnCount = s.turnCount; this.enemyTurnIdx = s.enemyTurnIdx; this.targetIdx = s.targetIdx;
    this.nextId = s.nextId; this.deck = s.deck.slice(); this.hand = s.hand.slice(); this.discard = s.discard.slice();
    this.charges = { ...s.charges }; this.flags = { ...s.flags }; this.practiceShots = s.practiceShots || 0;
    this.aim.angle = s.aimAngle ?? this.aim.angle;
    if (!fresh) {
      Object.assign(this.run, { hp: s.runState.hp, coins: s.runState.coins, consumables: s.runState.consumables.slice(), stats: { ...s.runState.stats } });
      this.run.items = s.itemState.map((i) => ({ ...i }));
    }
    this.timers = [];
    this.queue = [];
    this.shot = null;
    this.snapshot = null;
    this.armed = new Set();
    this.pending = { flags: {} };
    this.cardPlayed = false;
    this.enemyAim = null;
    this.restoredTurn = s.turn;
    if (!fresh) {
      // rewind: back to the player's aim
      this.turn = 'player';
      this.state = 'aim';
      this.emit('table');
      this.emit('hand');
    } else {
      this.state = 'intro';
    }
  }

  /** Resume a saved fight at the start of the saved turn. */
  resume() {
    this.turnCount--;
    this.beginTurnResume(this.restoredTurn || 'player');
  }

  beginTurnResume(who) {
    // like beginTurn but without drawing/status ticks (they already happened)
    this.turn = who;
    this.turnCount++;
    if (who === 'enemy') {
      this.enemyTurnIdx = Math.max(0, this.enemyTurnIdx - 1);
      const alive = this.alive();
      const e = alive[this.enemyTurnIdx++ % alive.length];
      this.activeEnemy = e;
      this.state = 'think';
      this.planner = this.boss?.enemyMode === 'tilt'
        ? planTilt(this.sim, 'enemy', e.tilt || 620, this.rng)
        : planShot(this.sim, 'enemy', this.isBreak, !!this.ballInHand, this.aiProfile(e), this.rng);
      this.thinkTime = 0;
    } else {
      this.state = 'aim';
      this.pending = { flags: {} };
      this.autoAim();
    }
    this.emit('turn', who);
    this.emit('hud');
  }
}

function randomOrient(b, rng) {
  // numbers mostly face up so racks are readable
  const a = rng.range(-0.5, 0.5), c = rng.range(0, Math.PI * 2);
  const ax = Math.cos(c), ay = Math.sin(c);
  b.q = [Math.cos(a / 2), ax * Math.sin(a / 2), ay * Math.sin(a / 2), 0];
}
