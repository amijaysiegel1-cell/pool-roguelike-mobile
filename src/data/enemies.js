// Regular and elite opponents, elite traits, and table modifiers.
// skill: 0..1 accuracy (see ai.aimNoiseDeg). banks: considers bank shots.

export const ENEMIES = [
  // ── Act 1: Dive Bar ──
  { id: 'barfly', name: 'Barfly Benny', icon: '🍺', act: 1, skill: 0.28, quote: "Hic— rack 'em up, pal!" , taunts: ['Shhh, I\'m concentrating.', 'One more round!', 'That pocket moved.'] },
  { id: 'darts', name: 'Darts Doreen', icon: '🎯', act: 1, skill: 0.4, quote: 'I usually throw things. Same idea.', taunts: ['Bullseye.', 'You call that aim?', 'Wrong game, sweetie.'] },
  { id: 'biglou', name: 'Big Lou', icon: '🧔', act: 1, skill: 0.34, dmg: 1, quote: 'This is MY table.', taunts: ['Heh.', 'You\'re in Lou\'s house.', 'Nice try, kid.'] },
  { id: 'sleepy', name: 'Sleepy Sal', icon: '😴', act: 1, skill: 0.22, hpMult: 1.15, quote: '...zzz... oh, it\'s my turn?', taunts: ['*yawn*', 'Wake me when it\'s over.', 'Zzz...'] },
  { id: 'karaoke', name: 'Karaoke Kim', icon: '🎤', act: 1, skill: 0.36, quote: '🎵 Don\'t stop believin\'... in your aim 🎵', taunts: ['🎵 La la LAAA 🎵', 'Encore!', 'Off-key, just like you.'] },
  // ── Act 2: Neon Casino ──
  { id: 'highroller', name: 'High Roller Hal', icon: '🎲', act: 2, skill: 0.42, banks: true, quote: 'Let\'s make this interesting.', taunts: ['Snake eyes for you.', 'House always wins.', 'Double or nothing?'] },
  { id: 'croupier', name: 'Croupier Coco', icon: '🃏', act: 2, skill: 0.47, quote: 'Place your bets.', taunts: ['No more bets.', 'Rien ne va plus.', 'The odds favor me.'] },
  { id: 'slots', name: 'Slot Jockey', icon: '🎰', act: 2, skill: 0.35, dmg: 1, quote: 'I can feel a jackpot coming!', taunts: ['🍒🍒🍒!', 'Just one more pull!', 'Almost hit!'] },
  { id: 'showgirl', name: 'Showgirl Sasha', icon: '💃', act: 2, skill: 0.45, quote: 'Dazzle them, darling.', taunts: ['Ta-da!', 'Watch the feathers.', 'Showtime!'] },
  { id: 'pitboss', name: 'Pit Boss Pete', icon: '👔', act: 2, skill: 0.49, hpMult: 1.1, quote: 'I\'ve been watching you.', taunts: ['Security...', 'No counting cards.', 'You\'re cut off.'] },
  // ── Act 3: Underground Pool Hall ──
  { id: 'moleman', name: 'Mole Man', icon: '⛏️', act: 3, skill: 0.46, quote: 'Down here, we play rough.', taunts: ['Dig it.', 'Deep cut.', 'Bury \'em.'] },
  { id: 'rustbucket', name: 'Rust Bucket', icon: '🤖', act: 3, skill: 0.54, quote: 'CALCULATING. ANGLE. OPTIMAL.', taunts: ['BEEP.', 'ERROR: YOU.', 'SKILL ISSUE DETECTED.'] },
  { id: 'graffiti', name: 'Graffiti Gus', icon: '🎨', act: 3, skill: 0.44, banks: true, quote: 'I tag every rail I touch.', taunts: ['Fresh.', 'That\'s art.', 'Signed it.'] },
  { id: 'gator', name: 'Sewer Gator', icon: '🐊', act: 3, skill: 0.42, dmg: 1, hpMult: 1.1, quote: '*hisssss*', taunts: ['*chomp*', '*hiss*', '*tail thwack*'] },
  { id: 'smokey', name: 'Smokey Joe', icon: '💨', act: 3, skill: 0.5, quote: 'Can\'t hit what you can\'t see.', taunts: ['Poof.', 'Smoke and mirrors.', 'Hazy?'] },
  // ── Act 4: Cosmic Arena ──
  { id: 'starchild', name: 'Star Child', icon: '🌟', act: 4, skill: 0.54, quote: 'I was born in a supernova.', taunts: ['Twinkle.', 'Stellar!', 'Light years ahead.'] },
  { id: 'comet', name: 'Comet Kid', icon: '☄️', act: 4, skill: 0.5, dmg: 1, quote: 'Fastest cue in the galaxy!', taunts: ['Whoosh!', 'Catch my tail!', 'Too slow!'] },
  { id: 'moonmime', name: 'Moon Mime', icon: '🌙', act: 4, skill: 0.52, quote: '...', taunts: ['...', '*pretends to cry*', '*invisible cue*'] },
  { id: 'alien', name: 'Zorp the Hustler', icon: '👽', act: 4, skill: 0.58, banks: true, quote: 'Earthling geometry is so quaint.', taunts: ['Blorp.', 'Primitive.', 'Probing your defense.'] },
  { id: 'robo', name: 'Robo Racker', icon: '🦾', act: 4, skill: 0.6, hpMult: 1.1, quote: 'RACK. BREAK. REPEAT.', taunts: ['EFFICIENT.', 'RE-RACKING YOU.', 'OPTIMAL.'] },
];

export const ELITES = [
  { id: 'bouncer', name: 'The Bouncer', icon: '🦍', act: 1, skill: 0.41, dmg: 1, quote: 'You\'re not on the list.', traits: ['bully'] },
  { id: 'lucky_lucy', name: 'Lucky Lucy', icon: '🍀', act: 1, skill: 0.38, quote: 'Luck? Never heard of her.', traits: ['lucky'] },
  { id: 'card_counter', name: 'Card Counter', icon: '🧮', act: 2, skill: 0.55, quote: 'I know exactly what\'s coming.', traits: ['precise'] },
  { id: 'whale', name: 'The Whale', icon: '🐋', act: 2, skill: 0.43, hpMult: 1.2, quote: 'I could buy this casino.', traits: ['armored', 'thief'] },
  { id: 'undertaker', name: 'The Undertaker', icon: '⚰️', act: 3, skill: 0.52, quote: 'I\'ve measured you already.', traits: ['regen'] },
  { id: 'iron_maiden', name: 'Iron Maiden', icon: '🛡️', act: 3, skill: 0.48, quote: 'Nothing gets through.', traits: ['armored', 'hot_streak'] },
  { id: 'nebula_queen', name: 'Nebula Queen', icon: '🌌', act: 4, skill: 0.58, banks: true, quote: 'Kneel before the cosmos.', traits: ['trickster', 'precise'] },
  { id: 'void_walker', name: 'The Void Walker', icon: '🕳️', act: 4, skill: 0.54, quote: 'Everything falls in eventually.', traits: ['lucky', 'regen'] },
];

// The rival appears across runs and levels up each time you beat him.
export const RIVAL = {
  id: 'rival', name: 'Dash Darnell', icon: '😎', skill: 0.5, banks: true,
  quote: 'You again? Let\'s see if you\'ve improved.',
  lines: [
    'You again? Let\'s see if you\'ve improved.',
    'Lucky last time. I\'ve been practicing.',
    'Okay. Okay. You\'re actually good. Doesn\'t mean I\'ll let you win.',
    'Same time next run? ...I mean, whatever. Rack \'em.',
  ],
  taunts: ['Too easy.', 'Watch and learn.', 'Is that all?', 'Ha! Called it.'],
};

export const TRAITS = {
  armored: { name: 'Armored', icon: '🛡️', desc: 'Takes 20% less damage.' },
  hot_streak: { name: 'Hot Streak', icon: '🔥', desc: 'Each consecutive sink deals +2 more.' },
  thief: { name: 'Thief', icon: '🦹', desc: 'Steals 3 coins per sink.' },
  precise: { name: 'Precise', icon: '🎯', desc: 'Much more accurate.' },
  bully: { name: 'Bully', icon: '👊', desc: 'Your fouls hurt twice as much.' },
  regen: { name: 'Regenerates', icon: '💗', desc: 'Heals 2 HP at the start of each turn.' },
  lucky: { name: 'Lucky', icon: '🍀', desc: 'Pockets are bigger on their shots.' },
  trickster: { name: 'Trickster', icon: '🃏', desc: 'Loves bank shots — and makes them.' },
};

export const TABLE_MODS = {
  bumpers: { name: 'Bumper Table', icon: '🔴', desc: 'Two bumpers sit mid-table.' },
  drift: { name: 'Crooked Table', icon: '↘️', desc: 'The table leans — rolling balls drift.' },
  fast_felt: { name: 'Fast Felt', icon: '💨', desc: 'Balls roll much further.', rollMul: 0.6 },
  slow_felt: { name: 'Sticky Felt', icon: '🍯', desc: 'Balls slow down quickly.', rollMul: 1.7 },
  tight: { name: 'Tight Pockets', icon: '🤏', desc: 'Pockets are 12% smaller for everyone.', pocketScale: 0.88 },
  buckets: { name: 'Buckets', icon: '🪣', desc: 'Pockets are 15% bigger for everyone.', pocketScale: 1.15 },
  wall: { name: 'Divider', icon: '🧱', desc: 'A short wall splits the table.' },
};

export const ACT_TABLE_MODS = {
  1: [['none', 6], ['slow_felt', 1], ['buckets', 1], ['drift', 1]],
  2: [['none', 4], ['bumpers', 2], ['fast_felt', 1], ['buckets', 1], ['tight', 1]],
  3: [['none', 4], ['wall', 2], ['drift', 1], ['tight', 1], ['slow_felt', 1]],
  4: [['none', 3], ['bumpers', 1], ['fast_felt', 2], ['drift', 1], ['wall', 1]],
};
