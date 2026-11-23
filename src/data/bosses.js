// Bosses: unique rules, intros, taunts, mid-fight phase changes and relic drops.
// Each boss is data plus hooks that reshape the table through the Fight API:
//   f.tableSpec (pockets / bumpers / walls) + f.rebuildTable()
//   f.sim.fields / f.sim.movers, f.say(), f.banner(), f.shake(), f.rng
import { TABLE } from '../config.js';
import { standardPockets } from '../physics/table.js';

const { W, H } = TABLE;

function monaMagnets(f, strength) {
  const pockets = f.tableSpec.pockets;
  for (const p of pockets) { delete p.owner; delete p.attract; delete p.glow; }
  const idx = f.rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2);
  for (const i of idx) {
    pockets[i].owner = 'enemy';
    pockets[i].glow = '#ff2bd6';
    pockets[i].attract = { k: strength, radius: 175, groups: ['stripe', 'cue'] };
  }
  f.rebuildTable();
}

function shiftPockets(f, wild) {
  const pockets = standardPockets();
  const lt = f.rng.range(260, 740), rt = f.rng.range(260, 740);
  pockets[4].t = lt; pockets[5].t = rt;
  if (wild) {
    if (f.rng.chance(0.6)) pockets.push({ kind: 'side', side: f.rng.pick(['top', 'bottom']), t: f.rng.range(150, 350) });
    if (f.rng.chance(0.4)) pockets.push({ kind: 'side', side: f.rng.pick(['left', 'right']), t: f.rng.range(160, 840) });
  }
  f.tableSpec.pockets = pockets;
  const walls = [];
  if (wild) {
    const n = f.rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const cx = f.rng.range(120, 380), cy = f.rng.range(260, 740), a = f.rng.range(0, Math.PI), L = f.rng.range(50, 90);
      walls.push({ x1: cx - Math.cos(a) * L, y1: cy - Math.sin(a) * L, x2: cx + Math.cos(a) * L, y2: cy + Math.sin(a) * L });
    }
  }
  f.tableSpec.walls = walls;
  f.rebuildTable(true);
}

export const BOSSES = [
  {
    id: 'shark', name: 'The Shark', icon: '🦈', title: 'Dive Bar Hustler', acts: [1, 2], color: '#4fc3f7',
    intro: [
      'Well, well. Fresh fish.',
      'Friendly game? Small stakes. I\'m honestly not very good...',
    ],
    taunts: {
      playerMiss: ['Ooh, unlucky.', 'Happens to the best of us. Not me, but...', 'Tough break, friend.'],
      playerFoul: ['Yikes.', 'Want me to go easy?'],
      enemySink: ['Huh, would you look at that.', 'Beginner\'s luck!', 'Oops, did I do that?'],
      phase2Sink: ['Bank. Corner. Pay up.', 'Physics is my religion.', 'That\'s called a "lesson".'],
      hurt: ['Grr.', 'Okay, okay.'],
    },
    phaseLine: 'Alright. Fun\'s over. Let me show you how I REALLY play.',
    enemies: [{ name: 'The Shark', icon: '🦈', skill: 0.8, banks: false }],
    phases: [{
      at: 0.5, name: 'TRUE COLORS',
      enter: (f, e) => { e.skill = 0.93; e.banks = true; e.trickBias = 70; e.dmgMult = 1.4; e.hustle = 4; e.taunts = 'phase2Sink'; },
    }],
    relic: 'sharks_tooth',
  },
  {
    id: 'mona', name: 'Magnetic Mona', icon: '🧲', title: 'Queen of the Neon Floor', acts: [2], color: '#ff2bd6',
    intro: [
      'Darling, everything in this casino is attracted to me.',
      'Especially the balls. And your cue ball, eventually.',
    ],
    taunts: {
      playerMiss: ['Pulled off-line? How tragic.', 'Gravity is a fickle lover.'],
      playerFoul: ['My magnets send their regards.', 'Into my pocket, darling!'],
      enemySink: ['Irresistible.', 'They just can\'t stay away.'],
      hurt: ['How dare you.', 'You\'ll pay for that.'],
    },
    phaseLine: 'Enough charm. POLARITY... FLIP!',
    enemies: [{ name: 'Magnetic Mona', icon: '👩‍🎤', skill: 0.66 }],
    setup: (f) => { monaMagnets(f, 650); },
    phases: [{
      at: 0.5, name: 'POLARITY FLIP',
      enter: (f, e) => { e.magnetStrength = 950; e.skill += 0.06; monaMagnets(f, 950); },
    }],
    onTurnStart: (f, who) => {
      const e = f.enemies[0];
      if (who === 'enemy' && e.phase >= 1) monaMagnets(f, e.magnetStrength || 950);
    },
    playerFields: (f) => {
      // phase 2: her pockets repel YOUR balls on your shots
      if (f.enemies[0].phase >= 1) return [{ type: 'pockets', owner: 'enemy', k: -650, radius: 150, groups: ['solid'] }];
      return [];
    },
    relic: 'lodestone',
  },
  {
    id: 'twins', name: 'The Twin Cues', icon: '👯', title: 'Two Sticks, One Mind', acts: [1, 2, 3], color: '#ffd54f',
    intro: [
      'LEFTY: We finish each other\'s—',
      'RIGHTY: —shots. And we take turns beating you.',
    ],
    taunts: {
      playerMiss: ['Sloppy!', 'Our turn, our turn!'],
      playerFoul: ['Twin high-five!', 'Double trouble!'],
      enemySink: ['One for me!', 'Tag, you\'re it!'],
      hurt: ['Hey! That was my sibling\'s ball!', 'Ow!'],
    },
    phaseLine: 'You... you hurt my twin. Now I\'m ANGRY.',
    enemies: [
      { name: 'Lefty', icon: '👈', skill: 0.58, banks: true, hpShare: 0.5, dmgMult: 1.2 },
      { name: 'Righty', icon: '👉', skill: 0.74, hpShare: 0.5 },
    ],
    onEnemyDown: (f, e) => {
      const other = f.enemies.find((x) => x !== e && x.hp > 0);
      if (!other) return;
      other.dmgMult = (other.dmgMult || 1) * 1.5;
      other.skill = Math.min(0.95, other.skill + 0.12);
      other.enraged = true;
      f.say(other, 'You... you hurt my twin. Now I\'m ANGRY.');
      f.banner('ENRAGED!', '#ff5252');
    },
    relic: 'twin_tips',
  },
  {
    id: 'living_table', name: 'The Table Itself', icon: '👁️', title: 'It Was Never Furniture', acts: [3], color: '#8d6e63',
    intro: [
      '*the felt ripples*',
      '*the pockets... breathe*',
      'Y O U   H A V E   P L A Y E D   O N   M E   F O R   T H E   L A S T   T I M E',
    ],
    taunts: {
      playerMiss: ['*creaks with laughter*', '*a pocket yawns shut*'],
      playerFoul: ['*the felt shivers with delight*', 'M I N E'],
      enemySink: ['*gulp*', 'D E L I C I O U S'],
      hurt: ['*splinters crack*', '*groans*'],
    },
    phaseLine: 'T H E   T A B L E   A W A K E N S',
    enemyMode: 'tilt',
    enemies: [{ name: 'The Table', icon: '👁️', skill: 0.6, tilt: 620 }],
    setup: (f) => { shiftPockets(f, false); },
    phases: [{
      at: 0.5, name: 'IT AWAKENS',
      enter: (f, e) => {
        e.tilt = 820;
        f.tableSpec.bumpers = [{ x: W / 2, y: H / 2, r: 26, e: 1.1, eye: true }];
        shiftPockets(f, true);
      },
    }],
    onTurnStart: (f, who) => {
      if (who === 'player' && f.turnCount > 1) {
        shiftPockets(f, f.enemies[0].phase >= 1);
        f.banner('THE POCKETS SHIFT', '#bcaaa4', 0.9);
      }
    },
    onBumper: (f, ball, bumper) => {
      if (bumper.eye && f.shot?.who === 'player' && ball.group !== 'stripe') {
        f.hurtEnemy(f.enemies[0], 4, ball.x, ball.y, ['EYE!']);
      }
    },
    relic: 'heartwood',
  },
  {
    id: 'cosmic8', name: 'The Cosmic 8', icon: '🎱', title: 'The Ball at the End of Everything', acts: [4], color: '#7c4dff', final: true,
    intro: [
      'BEFORE THE FIRST RACK, THERE WAS ME.',
      'EVERY BALL YOU HAVE EVER SUNK FELL TOWARD THIS MOMENT.',
      'SHOOT, LITTLE ONE.',
    ],
    taunts: {
      playerMiss: ['ENTROPY WINS.', 'THE VOID ACCEPTS YOUR OFFERING.'],
      playerFoul: ['YOUR CUE BALL BELONGS TO THE DARK.', 'SWALLOWED.'],
      enemySink: ['ORBIT DECAYED.', 'INEVITABLE.'],
      hurt: ['...INTERESTING.', 'A FLICKER.'],
    },
    phaseLine: 'NOW SEE THE SINGULARITY.',
    enemies: [{ name: 'The Cosmic 8', icon: '🎱', skill: 0.76, banks: true }],
    setup: (f) => {
      f.rollMul = 0.45;
      for (const p of f.tableSpec.pockets) p.attract = { k: 380, radius: 115 };
      f.rebuildTable();
      f.sim.movers.push({ type: 'orbit', cx: W / 2, cy: H / 2, rad: 200, speed: 0.7, phase: 0, r: 16, e: 1, moon: true });
      f.sim.movers.push({ type: 'orbit', cx: W / 2, cy: H / 2, rad: 200, speed: 0.7, phase: Math.PI, r: 16, e: 1, moon: true });
    },
    phases: [{
      at: 0.5, name: 'SINGULARITY',
      enter: (f, e) => {
        e.dmgMult = (e.dmgMult || 1) * 1.25;
        f.tableSpec.pockets.push({ kind: 'hole', x: W / 2, y: H / 2, r: 22, attract: { k: 900, radius: 190 }, glow: '#7c4dff' });
        f.rebuildTable();
        f.sim.movers.push({ type: 'orbit', cx: W / 2, cy: H / 2, rad: 320, speed: -0.5, phase: Math.PI / 2, r: 18, e: 1, moon: true });
      },
    }],
    relic: 'event_horizon',
  },
];

export const BOSS_MAP = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

export function bossPool(act) {
  return BOSSES.filter((b) => b.acts.includes(act));
}
