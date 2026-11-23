// Global tunables. Everything balance- or feel-related lives here so it can be
// tweaked without touching game logic.

export const VERSION = '0.1.0';

// Table geometry in world units (portrait: long axis is Y).
export const TABLE = {
  W: 500,
  H: 1000,
  R: 14,             // ball radius
  RAIL: 40,          // visual rail width outside the cushion line
  CORNER_MOUTH: 40,  // distance from corner to where the rail starts on each side
  SIDE_MOUTH: 29,    // half-width of a side pocket gap
  CORNER_CAPTURE: 19,
  SIDE_CAPTURE: 18,
  FALL_DEPTH: 9,     // how far past the cushion line a ball centre may go before it drops
};

export const PHYS = {
  DT: 1 / 300,        // fixed physics step
  MAX_SPEED: 2600,    // cue ball speed at 100% power
  MIN_SPEED: 140,     // cue ball speed at 0% power
  SLIDE_DECEL: 700,   // sliding friction (mu * g) in units/s^2
  ROLL_DECEL: 55,     // constant rolling resistance
  ROLL_DRAG: 0.22,    // speed-proportional drag (1/s) — keeps matches snappy
  BREAK_MULT: 1.7,    // break shots can be hit much harder
  SIDE_DECAY: 2.2,    // side-spin exponential decay (1/s)
  SIDE_DECEL: 60,     // side-spin linear decay
  BALL_E: 0.95,       // ball-ball restitution
  RAIL_E: 0.76,       // cushion restitution
  RAIL_MU: 0.2,       // cushion friction (english grip)
  BALL_MU: 0.05,      // ball-ball friction (throw)
  SPIN_K: 1.25,       // spin produced by a full-offset tip hit
  STOP_SPEED: 3,
  MAX_SIM_TIME: 14,   // safety cap per shot (seconds of sim time)
};

export const BALANCE = {
  START_HP: 70,
  BALL_DMG: 8,           // player base damage per ball sunk
  FINISHER_DMG: 24,      // legally sinking the 8
  EIGHT_PENALTY: 15,     // sinking the 8 illegally
  FOUL_DMG: [0, 5, 6, 7, 8],
  MISS_DMG: [0, 1, 2, 2, 3],
  ENEMY_DMG: [0, 4, 5, 6, 7],
  ELITE_DMG_BONUS: 2,
  ENEMY_HP: [0, [28, 36], [40, 50], [52, 64], [66, 80]],
  ELITE_HP_MULT: 1.45,
  BOSS_HP: [0, 80, 110, 145, 190],
  BOSS_DMG: [0, 6, 7, 8, 9],
  MULTI_BONUS: 0.5,      // each extra ball in one shot adds +50%
  BANK_MULT: 1.5,
  BANK2_MULT: 2,
  COMBO_MULT: 1.5,
  KICK_MULT: 1.5,
  LONG_MULT: 1.25,
  LONG_DIST: 620,
  FIGHT_COINS: [0, [14, 22], [18, 28], [22, 32], [26, 36]],
  ELITE_COINS_MULT: 1.8,
  BOSS_COINS: [0, 70, 90, 110, 0],
  REST_HEAL: 0.3,
  BOSS_HEAL: 0.5,        // heals this fraction of missing HP after a boss
  HAND_SIZE: 3,
  CONSUMABLE_SLOTS: 3,
  PRICES: { common: [42, 56], rare: [72, 92], epic: [115, 140], legendary: [175, 215], cursed: [55, 80], boss: [200, 240] },
  CARD_PRICES: { common: [32, 42], rare: [52, 66], epic: [80, 96] },
  REMOVE_BASE: 50,
  REROLL_BASE: 12,
};

export const RARITY_COLORS = {
  common: '#cfd8dc',
  rare: '#4fc3f7',
  epic: '#ba68c8',
  legendary: '#ffb300',
  cursed: '#ef5350',
  boss: '#ff7043',
  starter: '#a5d6a7',
};

export const BALL_COLORS = {
  1: '#f6c90e', 2: '#1e5bd8', 3: '#e53935', 4: '#6a1b9a', 5: '#fb8c00', 6: '#1b8a3a', 7: '#8d1c1c',
  8: '#151515',
  9: '#f6c90e', 10: '#1e5bd8', 11: '#e53935', 12: '#6a1b9a', 13: '#fb8c00', 14: '#1b8a3a', 15: '#8d1c1c',
};
