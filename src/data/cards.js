// Shot cards. Your deck is shuffled each fight; you draw at the start of each
// of your turns and may play one card per shot. Cards set shot flags (the same
// flags cue upgrades use), so they combo with everything else.

export const CARDS = [
  { id: 'steady_hand', name: 'Steady Hand', rarity: 'common', icon: '🎯', desc: 'Full trajectory preview this shot.', play: (s) => { s.flags.laser = true; } },
  { id: 'power_break', name: 'Power Stroke', rarity: 'common', icon: '💪', desc: '+40% max power this shot.', play: (s) => { s.flags.powerCap = 1.4; } },
  { id: 'big_pockets', name: 'Big Pockets', rarity: 'common', icon: '🕳️', desc: 'Pockets +35% this shot.', play: (s) => { s.flags.pocketMul = (s.flags.pocketMul || 1) * 1.35; } },
  { id: 'safety_net', name: 'Safety Net', rarity: 'common', icon: '🥅', desc: 'No foul penalty this shot.', play: (s) => { s.flags.safety = true; } },
  { id: 'second_chance', name: 'Second Chance', rarity: 'common', icon: '🔁', desc: 'If you sink nothing, shoot again.', play: (s) => { s.flags.secondChance = true; } },
  { id: 'heal_shot', name: 'Bandage Break', rarity: 'common', icon: '💚', desc: 'Heal 5 per ball you sink this shot.', play: (s) => { s.flags.healPerBall = 5; } },
  { id: 'gold_rush', name: 'Gold Rush', rarity: 'common', icon: '💰', desc: '+7 coins per ball you sink this shot.', play: (s) => { s.flags.coinsPerBall = 7; } },
  { id: 'curve_card', name: 'Curveball', rarity: 'common', icon: '🌀', desc: 'Massé: side spin curves the cue ball.', play: (s) => { s.flags.curve = true; } },
  { id: 'stun_card', name: 'Dead Stop', rarity: 'common', icon: '🛑', desc: 'Cue ball stops dead on contact.', play: (s) => { s.flags.stun = true; } },
  { id: 'focus', name: 'Focus', rarity: 'common', icon: '🧘', desc: 'Draw 2 cards. (Doesn\'t use your card play.)', free: true, play: (s, f) => { f.drawCards(2); } },
  { id: 'bank_job', name: 'Bank Job', rarity: 'rare', icon: '🏦', desc: 'Bank shots deal ×3 this shot.', play: (s) => { s.flags.bankMul = 3; } },
  { id: 'double_down', name: 'Double Down', rarity: 'rare', icon: '✌️', desc: 'Damage ×2 this shot. Sink nothing and take 6.', play: (s) => { s.flags.dmgMul = (s.flags.dmgMul || 1) * 2; s.flags.doubleDown = 6; } },
  { id: 'magnetize', name: 'Magnetize', rarity: 'rare', icon: '🧲', desc: 'Pockets pull your balls this shot.', play: (s) => { s.flags.magnet = true; } },
  { id: 'ghost_card', name: 'Phase Shift', rarity: 'rare', icon: '👻', desc: 'Cue ball passes through the first ball.', play: (s) => { s.flags.ghost = true; } },
  { id: 'boom_card', name: 'Kaboom', rarity: 'rare', icon: '💥', desc: 'Explosive contact this shot.', play: (s) => { s.flags.explode = (s.flags.explode || 0) + 1; } },
  { id: 'ball_in_hand_card', name: 'Sleight of Hand', rarity: 'rare', icon: '✋', desc: 'Place the cue ball anywhere.', free: true, play: (s, f) => { f.grantBallInHand(); } },
  { id: 'zap_card', name: 'Zap', rarity: 'epic', icon: '⚡', desc: 'Chain lightning on contact.', play: (s) => { s.flags.lightning = true; } },
  { id: 'encore', name: 'Encore', rarity: 'epic', icon: '⏩', desc: 'Shoot again after this shot, whatever happens.', play: (s) => { s.flags.doubleShot = true; } },
  { id: 'all_in', name: 'All In', rarity: 'epic', icon: '🎰', desc: 'Damage ×3 this shot. Sink nothing and take 12.', play: (s) => { s.flags.dmgMul = (s.flags.dmgMul || 1) * 3; s.flags.doubleDown = 12; } },
];

export const CARD_MAP = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const card = (id) => CARD_MAP[id];

export const STARTER_DECK = ['steady_hand', 'power_break', 'big_pockets', 'safety_net', 'second_chance'];
