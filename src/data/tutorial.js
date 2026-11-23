// The tutorial run: four short lessons with Old Chalky, ending in a real fight.
import { TABLE } from '../config.js';

const { W, H } = TABLE;

export const TUTORIAL = [
  {
    id: 'aim', title: 'Lesson 1 — Aim & Shoot',
    coach: [
      'Kid, a pool match here is a FIGHT. Sink your balls, hurt your opponent. Simple.',
      'DRAG anywhere on the table to aim — the dotted line shows the cue ball\'s path, the yellow line shows where the ball you hit will go.',
      'Then PULL DOWN on the cue slider at the right and LET GO to shoot. Further = harder. Sink the 1-ball in the corner.',
    ],
    scenario: { goal: 'pot', balls: [{ num: 1, x: 115, y: 115 }], cue: { x: 290, y: 290 } },
  },
  {
    id: 'spin', title: 'Lesson 2 — Spin',
    coach: [
      'Good. Now, position is everything. Spin controls where the cue ball goes AFTER contact.',
      'Drag the dot on the small cue ball (bottom-left) DOWN for backspin — "draw". Up is follow, sideways is english.',
      'Sink the 2-ball in the corner AND make the cue ball roll back toward you.',
    ],
    scenario: { goal: 'draw', drawLine: 230, balls: [{ num: 2, x: 420, y: 140 }], cue: { x: 320, y: 314 } },
  },
  {
    id: 'power', title: 'Lesson 3 — Powerups',
    coach: [
      'Now the fun part. Out there you\'ll find cue upgrades, ball mods, relics and shot cards. They stack. They combo. They get WILD.',
      'Tap the 💥 Explosive Tip button above the controls to ARM it. Your cue ball will detonate on contact.',
      'Blast that cluster and sink anything!',
    ],
    scenario: {
      goal: 'explode', charges: { explosive_tip: 3 },
      balls: [
        { num: 3, x: 420, y: 95 }, { num: 4, x: 448, y: 120 }, { num: 5, x: 395, y: 125 }, { num: 6, x: 425, y: 150 },
        { num: 7, x: 80, y: 90 }, { num: 1, x: 450, y: 70, mods: { split: true } },
      ],
      cue: { x: 300, y: 420 },
    },
    items: ['explosive_tip', 'split_ball'],
  },
  {
    id: 'fight', title: 'Lesson 4 — Your First Fight',
    coach: [
      'Time for a real match. You\'re SOLIDS (1-7), they\'re STRIPES. You always break first.',
      'Every ball you sink deals damage. Bank shots, combos and multi-sinks multiply it. Fouls, misses and THEIR sinks hurt YOU.',
      'Clear your solids then sink the 8 for a huge finisher. Shot cards (bottom row) give one-shot boosts. Now go!',
    ],
    fight: { kind: 'normal', act: 1, enemies: [{ id: 'dummy', name: 'Practice Dummy', icon: '🪆', skill: 0.12, hp: 30, quote: '...' }] },
  },
];
