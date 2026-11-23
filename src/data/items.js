// Every powerup in the game, defined as data + small hook functions.
//
// type:    'cue' (active ability w/ charges, or passive), 'ball' (ball modifier),
//          'relic' (passive), 'consumable' (one-shot), 'curse' (cursed relic)
// rarity:  common | rare | epic | legendary | cursed | boss | starter
// stats:   numbers merged into the run's stat block (see game/stats.js)
// hooks:   functions called by the Fight (see Fight.fire for the list)
// charges: for active cue upgrades — uses per fight; arm(shot) sets shot flags
// locked:  must be unlocked in the Clubhouse before it can drop
//
// Shot flags understood by the Fight: explode, ghost, curve, magnet, stun,
// laser, lightning, doubleShot, powerCap, pocketMul, safety, secondChance,
// bankMul, dmgMul, doubleDown, healPerBall, coinsPerBall, ballInHand.

function markRandomOwn(f, mod, count, extra = {}) {
  const pool = f.ownBalls().filter((b) => !b.mods[mod] && !b.mods.fragment);
  const picks = f.rng.shuffle(pool).slice(0, count);
  for (const b of picks) Object.assign(b.mods, { [mod]: true }, extra);
  return picks;
}

export const ITEMS = [
  // ───────────── CUE UPGRADES ─────────────
  {
    id: 'explosive_tip', name: 'Explosive Tip', type: 'cue', rarity: 'rare', icon: '💥',
    desc: 'ARM: the cue ball detonates on first contact, blasting nearby balls.',
    charges: 2, arm: (shot) => { shot.flags.explode = (shot.flags.explode || 0) + 1; },
  },
  {
    id: 'ghost_cue', name: 'Ghost Cue', type: 'cue', rarity: 'rare', icon: '👻',
    desc: 'ARM: the cue ball phases through the first ball it touches.',
    charges: 2, arm: (shot) => { shot.flags.ghost = true; },
  },
  {
    id: 'laser_sight', name: 'Laser Sight', type: 'cue', rarity: 'epic', icon: '🔴',
    desc: 'Passive: full trajectory preview — see where every ball will go.',
    stats: { laser: 1 },
  },
  {
    id: 'double_shot', name: 'Double Shot', type: 'cue', rarity: 'epic', icon: '⏩',
    desc: 'ARM: after this shot, take another one — no matter what happens.',
    charges: 1, arm: (shot) => { shot.flags.doubleShot = true; },
  },
  {
    id: 'masse_cue', name: 'Massé Cue', type: 'cue', rarity: 'common', icon: '🌀',
    desc: 'ARM: side spin curves the cue ball\'s path. Bend shots around blockers.',
    charges: 3, arm: (shot) => { shot.flags.curve = true; },
  },
  {
    id: 'magnet_tip', name: 'Magnet Tip', type: 'cue', rarity: 'rare', icon: '🧲',
    desc: 'ARM: for this shot, every pocket pulls your balls in.',
    charges: 2, arm: (shot) => { shot.flags.magnet = true; },
  },
  {
    id: 'stun_gun', name: 'Stun Gun', type: 'cue', rarity: 'common', icon: '🛑',
    desc: 'ARM: the cue ball stops dead on contact. No more scratches.',
    charges: 3, arm: (shot) => { shot.flags.stun = true; },
  },
  {
    id: 'chain_lightning', name: 'Chain Lightning', type: 'cue', rarity: 'epic', icon: '⚡',
    desc: 'ARM: on contact, lightning arcs to your 2 nearest balls and flings them pocket-ward.',
    charges: 1, arm: (shot) => { shot.flags.lightning = true; },
  },
  {
    id: 'heavy_cue', name: 'Heavy Cue', type: 'cue', rarity: 'common', icon: '🔨',
    desc: 'Passive: +20% max power. Break shots deal ×2 damage.',
    stats: { powerMult: 1.2, breakMult: 2 },
  },

  // ───────────── BALL MODIFIERS ─────────────
  {
    id: 'fire_balls', name: 'Fire Balls', type: 'ball', rarity: 'rare', icon: '🔥',
    desc: '2 of your balls burn each rack. Sinking one applies 3 Burn (2 dmg per enemy turn). Fire spreads to your balls on contact.',
    hooks: {
      onRackStart: (f, inst) => markRandomOwn(f, 'fire', 2 * inst.n),
      onCollide: (f, a, b) => {
        if (f.shot?.who !== 'player') return;
        for (const [x, y] of [[a, b], [b, a]]) {
          if (x.mods.fire && y.group === 'solid' && !y.mods.fire) { y.mods.fire = true; f.text(y.x, y.y, 'IGNITE', '#ff7043', 14); }
        }
      },
    },
  },
  {
    id: 'split_ball', name: 'Split Ball', type: 'ball', rarity: 'rare', icon: '🪓',
    desc: '1 of your balls splits in two when hit hard or blasted. Each half deals 70% damage.',
    hooks: { onRackStart: (f, inst) => markRandomOwn(f, 'split', inst.n) },
  },
  {
    id: 'bouncy_balls', name: 'Bouncy Balls', type: 'ball', rarity: 'common', icon: '🏀',
    desc: 'Your balls lose no energy off cushions. Bank shots deal +25%.',
    stats: { bankBonus: 0.25 },
    hooks: { onRackStart: (f) => { for (const b of f.ownBalls()) b.mods.bouncy = true; } },
  },
  {
    id: 'sticky_balls', name: 'Sticky Balls', type: 'ball', rarity: 'rare', icon: '🍯',
    desc: 'Your balls that touch a pocket jaw get sucked in.',
    stats: { stickyJaws: 1 },
  },
  {
    id: 'gold_ball', name: 'Gold Ball', type: 'ball', rarity: 'common', icon: '🪙',
    desc: '1 of your balls is solid gold: +15 coins and +4 damage when sunk.',
    hooks: { onRackStart: (f, inst) => markRandomOwn(f, 'gold', inst.n) },
  },
  {
    id: 'homing_ball', name: 'Homing Ball', type: 'ball', rarity: 'epic', icon: '🛰️',
    desc: '1 of your balls steers itself toward the nearest pocket while rolling.',
    hooks: { onRackStart: (f, inst) => markRandomOwn(f, 'homing', inst.n) },
  },
  {
    id: 'cluster_bomb', name: 'Cluster Bomb', type: 'ball', rarity: 'epic', icon: '💣',
    desc: '1 of your balls explodes when it drops, blasting everything near that pocket.',
    hooks: { onRackStart: (f, inst) => markRandomOwn(f, 'cluster', inst.n) },
  },
  {
    id: 'lucky_seven', name: 'Lucky Seven', type: 'ball', rarity: 'rare', icon: '7️⃣',
    desc: 'Your 7-ball deals ×3 damage and drops 7 coins.',
    hooks: { onRackStart: (f) => { const b = f.sim.balls.find((x) => x.num === 7 && x.group === 'solid'); if (b) b.mods.lucky7 = true; } },
  },
  {
    id: 'turncoat', name: 'Turncoat', type: 'ball', rarity: 'epic', icon: '🎭',
    desc: 'When you sink a ball, 30% chance an enemy stripe defects to your side.',
    hooks: {
      onShotEnd: (f, res) => {
        if (res.side !== 'player' || !res.own.length) return;
        for (let i = 0; i < res.own.length; i++) {
          if (!f.rng.chance(0.3)) continue;
          const s = f.rng.pick(f.sim.balls.filter((b) => !b.pocketed && b.group === 'stripe'));
          if (s) { s.group = 'solid'; s.mods.turncoat = true; f.text(s.x, s.y, 'DEFECTED!', '#ffd54f', 16); }
        }
      },
    },
  },

  // ───────────── RELICS ─────────────
  { id: 'lucky_chalk', name: 'Lucky Chalk', type: 'relic', rarity: 'common', icon: '🍀', desc: 'Pockets are 12% bigger on your shots.', stats: { pocketScale: 1.12 } },
  {
    id: 'extra_pocket', name: 'Extra Pocket', type: 'relic', rarity: 'rare', icon: '➕',
    desc: 'A 7th pocket opens on the top rail. Only your balls drop in it.',
    stats: { extraPocket: 1 },
  },
  {
    id: 'bullet_time', name: 'Bullet Time', type: 'relic', rarity: 'common', icon: '⏱️',
    desc: 'Slow-mo on long shots. Long-distance sinks deal +40% damage.',
    stats: { longBonus: 0.4, slowmo: 1 },
  },
  {
    id: 'vampire_cue', name: 'Vampire Cue', type: 'relic', rarity: 'rare', icon: '🧛',
    desc: 'Heal 2 HP whenever you sink a ball.', stats: { healPerSink: 2 },
  },
  {
    id: 'gravity_well', name: 'Gravity Well', type: 'relic', rarity: 'epic', icon: '🌌',
    desc: 'On your shots, pockets gently pull nearby balls in.', stats: { gravityWell: 1 },
  },
  { id: 'iron_will', name: 'Iron Will', type: 'relic', rarity: 'common', icon: '🛡️', desc: '+12 max HP.', stats: { maxHp: 12 } },
  { id: 'hustlers_wallet', name: "Hustler's Wallet", type: 'relic', rarity: 'common', icon: '👛', desc: '+30% coins from everything.', stats: { coinMult: 1.3 } },
  { id: 'bank_vault', name: 'Bank Vault', type: 'relic', rarity: 'rare', icon: '🏦', desc: 'Bank shots deal ×2.5 instead of ×1.5.', stats: { bankBonus: 1.0 } },
  {
    id: 'combo_meter', name: 'Combo Meter', type: 'relic', rarity: 'rare', icon: '📈',
    desc: 'Each ball you sink in the same turn deals +3 more than the last.',
    hooks: { onSinkDamage: (f, info) => { info.flat += 3 * (f.turnSinks || 0); } },
  },
  { id: 'break_master', name: 'Break Master', type: 'relic', rarity: 'common', icon: '🎳', desc: 'Balls sunk on the break deal ×3 damage.', stats: { breakMult: 3 } },
  { id: 'thick_felt', name: 'Thick Felt', type: 'relic', rarity: 'common', icon: '🧱', desc: 'Take 1 less damage from each enemy sink.', stats: { takenFlat: 1 } },
  { id: 'chalk_box', name: 'Chalk Box', type: 'relic', rarity: 'rare', icon: '📦', desc: '+1 charge for every cue upgrade.', stats: { charges: 1 } },
  {
    id: 'phoenix_feather', name: 'Phoenix Feather', type: 'relic', rarity: 'legendary', icon: '🪶',
    desc: 'Once per run, survive a lethal blow at 30% HP.',
    hooks: {
      onLethal: (f, inst) => {
        if (inst.used) return false;
        inst.used = true;
        f.run.hp = Math.max(1, Math.round(f.run.maxHp * 0.3));
        f.banner('🪶 PHOENIX!', '#ffb300');
        return true;
      },
    },
  },
  { id: 'eight_ball_charm', name: '8-Ball Charm', type: 'relic', rarity: 'rare', icon: '🎱', desc: 'Legally sinking the 8 deals ×2 finisher damage.', stats: { finisherMult: 2 } },
  {
    id: 'pocket_lint', name: 'Pocket Lint', type: 'relic', rarity: 'common', icon: '🧦',
    desc: 'Scratches hurt you 50% less, and you find 4 coins each time.',
    stats: { scratchMult: 0.5 },
    hooks: { onShotEnd: (f, res) => { if (res.side === 'player' && res.cueScratch) f.addCoins(4); } },
  },
  { id: 'tip_jar', name: 'Tip Jar', type: 'relic', rarity: 'common', icon: '🫙', desc: '+2 coins per ball you sink.', stats: { coinsPerSink: 2 } },
  {
    id: 'first_blood', name: 'First Blood', type: 'relic', rarity: 'common', icon: '🩸',
    desc: 'The first ball you sink each fight deals +12 damage.',
    hooks: { onSinkDamage: (f, info, inst) => { if (!f.flags.firstBlood) { f.flags.firstBlood = true; info.flat += 12; } } },
  },
  { id: 'second_wind', name: 'Second Wind', type: 'relic', rarity: 'rare', icon: '💨', desc: 'Heal 8 HP after every fight.', stats: { healAfterFight: 8 } },
  { id: 'card_sleeve', name: 'Card Sleeve', type: 'relic', rarity: 'common', icon: '🃏', desc: 'Hold 1 more shot card.', stats: { handSize: 1 } },
  { id: 'rubber_rails', name: 'Rubber Rails', type: 'relic', rarity: 'common', icon: '🟦', desc: 'Cushions are bouncier on your shots. Kick shots deal +30%.', stats: { railBoost: 0.1, kickBonus: 0.3 } },
  {
    id: 'overtime', name: 'Overtime', type: 'relic', rarity: 'epic', icon: '⌛',
    desc: 'Against enemies below 30% HP, your sinks deal +50%.',
    hooks: { onSinkDamage: (f, info) => { const e = f.target(); if (e && e.hp < e.maxHp * 0.3) info.mult *= 1.5; } },
  },
  { id: 'crown_of_cues', name: 'Crown of Cues', type: 'relic', rarity: 'legendary', icon: '👑', desc: 'All your damage +25%.', stats: { dmgMult: 1.25 } },
  {
    id: 'midas_touch', name: 'Midas Touch', type: 'relic', rarity: 'legendary', icon: '✨',
    desc: 'Every one of your balls is gold.',
    hooks: { onRackStart: (f) => { for (const b of f.ownBalls()) b.mods.gold = true; } },
  },
  {
    id: 'spin_doctor', name: 'Spin Doctor', type: 'relic', rarity: 'rare', icon: '🌪️',
    desc: 'Spin is 40% stronger. Sinks with heavy spin deal +3.',
    stats: { spinMult: 1.4 },
    hooks: { onSinkDamage: (f, info) => { if (f.shot && Math.hypot(f.shot.spinX, f.shot.spinY) > 0.5) info.flat += 3; } },
  },
  {
    id: 'safety_glasses', name: 'Safety Glasses', type: 'relic', rarity: 'common', icon: '🥽',
    desc: 'Your first foul each fight is forgiven.',
    hooks: { onFightStart: (f) => { f.flags.forgiveFoul = 1; } },
  },
  {
    id: 'piggy_bank', name: 'Piggy Bank', type: 'relic', rarity: 'rare', icon: '🐷',
    desc: 'Gain 10% interest on your coins after each fight (max 20).',
    hooks: { onFightEnd: (f, won) => { if (won) f.addCoins(Math.min(20, Math.floor(f.run.coins * 0.1)), true); } },
  },
  {
    id: 'trick_shot_trophy', name: 'Trick Shot Trophy', type: 'relic', rarity: 'epic', icon: '🏆',
    desc: 'Combination shots deal ×2.5 and heal 3.',
    stats: { comboBonus: 1.0 },
    hooks: { onSinkDamage: (f, info) => { if (info.tags.includes('COMBO')) f.heal(3); } },
  },
  {
    id: 'oracle_eye', name: "Oracle's Eye", type: 'relic', rarity: 'rare', icon: '🔮', locked: true,
    desc: 'Mystery nodes reveal themselves on the map, and you see the opponent\'s planned shot line.',
    stats: { revealMap: 1, seeEnemyAim: 1 },
  },
  {
    id: 'old_chalkys_cue', name: "Old Chalky's Cue", type: 'relic', rarity: 'legendary', icon: '🪄', locked: true,
    desc: 'The legend\'s own cue. +2 damage per ball, +10 max HP, and your aim guide shows one extra bounce.',
    stats: { ballDmg: 2, maxHp: 10, guideBounces: 1 },
  },
  {
    id: 'crystal_eight', name: 'Crystal 8', type: 'relic', rarity: 'legendary', icon: '💎', locked: true,
    desc: 'The 8-ball counts as one of yours for damage: hitting it into a pocket early no longer loses the rack — it deals 15 and respawns.',
    stats: { crystalEight: 1 },
  },
  {
    id: 'raccoon_paw', name: 'Raccoon Paw', type: 'relic', rarity: 'rare', icon: '🐾', locked: true,
    desc: 'Every enemy sink has a 25% chance to drop 3 coins for you instead.',
    hooks: { onShotEnd: (f, res) => { if (res.side === 'enemy') for (const _ of res.opp.concat(res.own)) if (f.rng.chance(0.25)) f.addCoins(3); } },
  },

  // ───────────── BOSS RELICS ─────────────
  {
    id: 'sharks_tooth', name: "Shark's Tooth", type: 'relic', rarity: 'boss', icon: '🦷',
    desc: 'Bank and combo shots deal +50% damage, and every sink hustles 3 coins.',
    stats: { bankBonus: 0.5, comboBonus: 0.5, coinsPerSink: 3 },
  },
  {
    id: 'lodestone', name: 'Lodestone', type: 'relic', rarity: 'boss', icon: '🧲',
    desc: 'Two pockets become yours: they pull your balls in on every shot.',
    stats: { lodestone: 1 },
  },
  {
    id: 'twin_tips', name: 'Twin Tips', type: 'relic', rarity: 'boss', icon: '🥢',
    desc: 'Your first miss each fight gives you another shot. Double Shot gets +1 charge.',
    hooks: { onFightStart: (f) => { f.flags.freeMiss = 1; if (f.charges.double_shot !== undefined) f.charges.double_shot++; } },
  },
  {
    id: 'heartwood', name: 'Heartwood', type: 'relic', rarity: 'boss', icon: '🌳',
    desc: '+20 max HP. Heal 4 at the start of every rack.',
    stats: { maxHp: 20 },
    hooks: { onRackStart: (f) => f.heal(4) },
  },
  {
    id: 'event_horizon', name: 'Event Horizon', type: 'relic', rarity: 'boss', icon: '🕳️',
    desc: 'A tiny black hole sits mid-table on your shots: it swallows enemy balls only.',
    stats: { eventHorizon: 1 },
  },

  // ───────────── CURSES (big upside, big downside) ─────────────
  { id: 'glass_cannon', name: 'Glass Cannon', type: 'curse', rarity: 'cursed', icon: '🍷', desc: 'Deal ×1.6 damage. Take ×1.6 damage.', stats: { dmgMult: 1.6, takenMult: 1.6 } },
  {
    id: 'blood_chalk', name: 'Blood Chalk', type: 'curse', rarity: 'cursed', icon: '🩸',
    desc: '+40% damage. Lose 1 HP every time you shoot.', stats: { dmgMult: 1.4, hpPerShot: 1 },
  },
  { id: 'greedy_pockets', name: 'Greedy Pockets', type: 'curse', rarity: 'cursed', icon: '💰', desc: 'Coins ×2. Your pockets shrink 15%.', stats: { coinMult: 2, pocketScale: 0.85 } },
  { id: 'shaky_hands', name: 'Shaky Hands', type: 'curse', rarity: 'cursed', icon: '🫨', desc: '+5 damage per ball. Your shots wobble slightly off-line.', stats: { ballDmg: 5, aimJitter: 0.7 } },
  { id: 'devils_deal', name: "Devil's Deal", type: 'curse', rarity: 'cursed', icon: '😈', desc: '+35 max HP. Enemies have +25% HP.', stats: { maxHp: 35, enemyHpMult: 1.25 } },
  { id: 'jinxed_eight', name: 'Jinxed Eight', type: 'curse', rarity: 'cursed', icon: '🎱', desc: 'The 8 finisher deals ×3. Sinking it early costs ×2.', stats: { finisherMult: 3, eightPenaltyMult: 2 } },
  { id: 'no_mercy', name: 'No Mercy', type: 'curse', rarity: 'cursed', icon: '⚔️', desc: 'Enemy fouls hurt them ×3. Your fouls hurt you ×2.', stats: { enemyFoulMult: 3, foulMult: 2 } },
  {
    id: 'cursed_coin', name: 'Cursed Coin', type: 'curse', rarity: 'cursed', icon: '🪙',
    desc: 'Shops are 30% cheaper. Lose 5 coins every time you miss.',
    stats: { shopMult: 0.7 },
    hooks: { onShotEnd: (f, res) => { if (res.side === 'player' && !res.own.length && !res.rack) f.addCoins(-5); } },
  },

  // ───────────── CONSUMABLES ─────────────
  { id: 'rewind', name: 'Rewind Shot', type: 'consumable', rarity: 'rare', icon: '⏪', desc: 'Undo your last shot completely (use before the opponent shoots).', use: 'rewind' },
  { id: 'freeze_turn', name: 'Freeze Ray', type: 'consumable', rarity: 'rare', icon: '🧊', desc: "Freeze your opponent's next turn — you shoot again.", use: 'freeze' },
  { id: 'pocket_shrink', name: 'Pocket Shrink', type: 'consumable', rarity: 'common', icon: '🤏', desc: "Opponent's pockets are 45% smaller for their next 2 turns.", use: 'shrink' },
  { id: 'energy_drink', name: 'Energy Drink', type: 'consumable', rarity: 'common', icon: '🥤', desc: 'Heal 20 HP.', use: 'heal20' },
  { id: 'chalk_bomb', name: 'Chalk Bomb', type: 'consumable', rarity: 'common', icon: '🧨', desc: 'Deal 12 damage to your opponent.', use: 'bomb12' },
  { id: 'hand_of_god', name: 'Hand of God', type: 'consumable', rarity: 'common', icon: '✋', desc: 'Place the cue ball anywhere.', use: 'ballInHand' },
  { id: 'wild_card', name: 'Wild Card', type: 'consumable', rarity: 'rare', icon: '🎴', desc: 'Draw 2 shot cards.', use: 'draw2' },
  { id: 'smoke_bomb', name: 'Smoke Bomb', type: 'consumable', rarity: 'rare', icon: '💨', desc: 'Escape a non-boss fight (no rewards).', use: 'escape' },
  { id: 'big_pockets_potion', name: 'Pocket Expander', type: 'consumable', rarity: 'common', icon: '🕳️', desc: 'Pockets are 50% bigger for your next shot.', use: 'bigPockets' },
];

export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const item = (id) => ITEM_MAP[id];

export function itemsOfType(...types) {
  return ITEMS.filter((i) => types.includes(i.type));
}
