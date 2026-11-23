// Playable characters. Each has a unique stat block, starting items and deck.
// `unlock` describes how the character is earned (checked in game/meta.js).

export const CHARACTERS = [
  {
    id: 'rookie', name: 'The Rookie', icon: '🧢', color: '#4fc3f7', hp: 70,
    tagline: 'Fresh chalk, big dreams.',
    perk: 'Balanced. Starts with Lucky Chalk and an Energy Drink.',
    items: ['lucky_chalk'], consumables: ['energy_drink'],
    deck: ['steady_hand', 'power_break', 'big_pockets', 'safety_net', 'second_chance'],
    stats: {},
    unlock: null,
  },
  {
    id: 'hustler', name: 'The Hustler', icon: '🕶️', color: '#ffd54f', hp: 62,
    tagline: 'Never lost a bet he set up.',
    perk: '+50% coins. Starts with a Gold Ball and Tip Jar.',
    items: ['gold_ball', 'tip_jar'], consumables: [],
    deck: ['gold_rush', 'steady_hand', 'big_pockets', 'safety_net', 'second_chance'],
    stats: { coinMult: 1.5 },
    unlock: { key: 'tutorial', text: 'Finish the tutorial.' },
  },
  {
    id: 'physicist', name: 'The Physicist', icon: '🥼', color: '#81c784', hp: 60,
    tagline: 'Angle of incidence, baby.',
    perk: 'Sees full trajectories (Laser Sight). Spin is 30% stronger. Bank shots +25%.',
    items: ['laser_sight'], consumables: [],
    deck: ['bank_job', 'curve_card', 'stun_card', 'safety_net', 'second_chance'],
    stats: { spinMult: 1.3, bankBonus: 0.25 },
    unlock: { key: 'reachAct2', text: 'Reach Act 2.' },
  },
  {
    id: 'brawler', name: 'The Brawler', icon: '🥊', color: '#ef5350', hp: 48,
    tagline: 'Breaks racks. And noses.',
    perk: '+40% damage, less HP. Starts with Explosive Tip and Heavy Cue.',
    items: ['explosive_tip', 'heavy_cue'], consumables: [],
    deck: ['power_break', 'boom_card', 'double_down', 'safety_net', 'big_pockets'],
    stats: { dmgMult: 1.4 },
    unlock: { key: 'beatAct1', text: 'Defeat an Act 1 boss.' },
  },
  {
    id: 'cardsharp', name: 'The Card Sharp', icon: '🎩', color: '#ba68c8', hp: 58,
    tagline: 'Always has one up the sleeve.',
    perk: 'Hand size +2, draws an extra card each turn. Starts with Ghost Cue.',
    items: ['ghost_cue'], consumables: ['wild_card'],
    deck: ['focus', 'ghost_card', 'steady_hand', 'second_chance', 'safety_net', 'gold_rush', 'big_pockets'],
    stats: { handSize: 2, drawPerTurn: 1 },
    unlock: { key: 'beatAct2', text: 'Defeat an Act 2 boss.' },
  },
  {
    id: 'bandit', name: 'Bandit', icon: '🦝', color: '#90a4ae', hp: 55,
    tagline: 'The raccoon. He wants in.',
    perk: 'Steals 4 coins per sink. Starts with Hand of God and Raccoon Paw. Shops 15% cheaper.',
    items: ['raccoon_paw'], consumables: ['hand_of_god', 'smoke_bomb'],
    deck: ['ball_in_hand_card', 'gold_rush', 'safety_net', 'second_chance', 'big_pockets'],
    stats: { coinsPerSink: 4, shopMult: 0.85 },
    unlock: { key: 'raccoonFriend', text: 'Beat Bandit the raccoon in 3 side games.' },
  },
];

export const CHAR_MAP = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
