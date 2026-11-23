// Ascension levels (stacking difficulty after you beat the game) and challenge
// modes (alternate rule sets with their own leaderboards).

export const ASCENSION = [
  null,
  { name: 'Hard Felt', desc: 'Elites have +20% HP.', stats: { eliteHpMult: 1.2 } },
  { name: 'Sharp Sticks', desc: 'Enemies deal +1 damage per sink.', stats: { enemyDmg: 1 } },
  { name: 'Lean Start', desc: '-8 max HP.', stats: { maxHp: -8 } },
  { name: 'Big Bosses', desc: 'Bosses have +15% HP.', stats: { bossHpMult: 1.15 } },
  { name: 'Inflation', desc: 'Shops cost 15% more.', stats: { shopMult: 1.15 } },
  { name: 'Bad Sleep', desc: 'Rest sites heal 33% less.', stats: { restHealMult: 0.67 } },
  { name: 'Born Cursed', desc: 'Start every run with a random curse.', stats: {} , startCurse: true },
  { name: 'Hustled', desc: 'Enemies aim noticeably better.', stats: { enemySkill: 0.1 } },
  { name: 'Ref Is Watching', desc: 'Your fouls hurt twice as much.', stats: { foulMult: 2 } },
  { name: 'Final Form', desc: 'Bosses deal +30% damage after their phase change.', stats: { bossRage: 0.3 } },
];
export const MAX_ASCENSION = ASCENSION.length - 1;

export const CHALLENGES = [
  {
    id: 'sudden_death', name: 'Sudden Death', icon: '☠️',
    desc: 'You have 1 HP. Enemy sinks and misses don\'t hurt you — but any foul, or the enemy sinking the 8, is fatal.',
    stats: { suddenDeath: 1 },
  },
  { id: 'no_spin', name: 'No Spin Zone', icon: '🚫', desc: 'The spin selector is locked to center ball. Pure angles.', stats: { noSpin: 1 } },
  { id: 'banks_only', name: 'Banks Only', icon: '🏦', desc: 'Only bank, kick and combo shots deal damage — but they deal ×2.', stats: { banksOnly: 1 } },
  { id: 'pauper', name: 'Pauper', icon: '🥫', desc: 'No shops ever appear. Treasure is doubled.', stats: { noShops: 1 } },
  { id: 'cursed_run', name: 'Hex Run', icon: '🧿', desc: 'Start with 3 curses and a legendary relic.', stats: {}, startCurses: 3, startLegendary: 1 },
];
export const CHALLENGE_MAP = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

// Daily modifiers rotate by date.
export const DAILY_MODS = ['no_spin', 'banks_only', 'pauper', 'cursed_run', null, null];
