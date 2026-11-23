// Random events. Each choice runs against an EventCtx (see game/run.js):
//   ctx.run, ctx.profile, ctx.rng
//   ctx.coins(n) ctx.hurt(n) ctx.heal(n) ctx.maxHp(n)
//   ctx.randomItem({types, rarity}) ctx.giveItem(id) ctx.addCurse()
//   ctx.removeRandom(types) ctx.randomCard(rarity) ctx.giveConsumable(id)
// A choice returns { text } and optionally { fight: spec } or { sideGame: true }.
import { NPCS } from './npcs.js';
import { RIVAL } from './enemies.js';

const pctLuck = (ctx, p) => p + (ctx.run.items.some((i) => i.id === 'lucky_chalk') ? 0.1 : 0);

export const EVENTS = [
  {
    id: 'side_bet', title: 'The Side Bet', icon: '🎲', acts: [1, 2, 3, 4],
    text: () => 'A grinning regular slaps a coin on the rail. "Coin flip. Double or nothing. You feelin\' lucky?"',
    choices: (ctx) => [
      { label: 'Bet 20 coins', hint: '~55% to win 20', disabled: ctx.run.coins < 20, run: () => {
        if (ctx.rng.chance(pctLuck(ctx, 0.55))) { ctx.coins(20); return { text: 'Heads! He pays up, grumbling.' }; }
        ctx.coins(-20); return { text: 'Tails. He pockets your coins with a wink.' };
      } },
      { label: 'Bet 50 coins', hint: '~50% to win 60', disabled: ctx.run.coins < 50, run: () => {
        if (ctx.rng.chance(pctLuck(ctx, 0.5))) { ctx.coins(60); return { text: 'You win big! The bar cheers.' }; }
        ctx.coins(-50); return { text: 'Ouch. Should\'ve walked away.' };
      } },
      { label: 'Walk away', run: () => ({ text: '"Coward," he mutters. You live to bet another day.' }) },
    ],
  },
  {
    id: 'stranger', title: 'Stranger in Need', icon: '🧥', acts: [1, 2, 3],
    text: () => 'A shivering stranger asks for coins for the bus home. Their cue case has seen better days.',
    choices: (ctx) => [
      { label: 'Give 25 coins', hint: 'Karma...', disabled: ctx.run.coins < 25, run: () => {
        ctx.coins(-25);
        if (ctx.rng.chance(0.6)) { const it = ctx.randomItem({ types: ['relic'], rarity: 'rare' }); return { text: `They press something into your hand: "${it.name}". "Pay it forward."` }; }
        ctx.maxHp(6); return { text: 'They smile warmly. You feel good about yourself. (+6 Max HP)' };
      } },
      { label: 'Teach them a trick shot', hint: 'Gain a shot card', run: () => { const c = ctx.randomCard('common'); return { text: `They show you one back! You learn "${c.name}".` }; } },
      { label: 'Ignore them', run: () => ({ text: 'You walk past. The felt feels colder somehow.' }) },
    ],
  },
  {
    id: 'pawn_shop', title: 'Pawn Shop Gamble', icon: '🏪', acts: [1, 2, 3, 4],
    text: () => 'A pawnbroker eyes your relics. "Trade me one blind. Might get something better. Might not."',
    choices: (ctx) => {
      const relics = ctx.run.items.filter((i) => ctx.def(i.id)?.type === 'relic' && ctx.def(i.id).rarity !== 'boss');
      return [
        { label: 'Gamble a random relic', hint: '70%: rarer relic. 30%: a curse', disabled: !relics.length, run: () => {
          const lost = ctx.removeRandom(['relic']);
          if (ctx.rng.chance(0.7)) { const it = ctx.randomItem({ types: ['relic'], rarity: ctx.rng.pick(['rare', 'epic', 'epic', 'legendary']) }); return { text: `You lose ${lost.name}... and get ${it.name}! Upgrade!` }; }
          const c = ctx.addCurse(); return { text: `You lose ${lost.name} and receive... ${c.name}. It hums ominously.` };
        } },
        { label: 'Sell a random relic for 60', disabled: !relics.length, run: () => { const lost = ctx.removeRandom(['relic']); ctx.coins(60); return { text: `Sold ${lost.name}. Cold hard cash.` }; } },
        { label: 'Leave', run: () => ({ text: '"Your loss," he shrugs.' }) },
      ];
    },
  },
  {
    id: 'back_alley_doc', title: 'Back-Alley Doctor', icon: '💉', acts: [2, 3, 4],
    text: () => 'A "doctor" in a stained coat offers enhancements. "Trade a little life for a lot of power."',
    choices: (ctx) => [
      { label: 'Lose 10 Max HP → +2 damage per ball', run: () => { ctx.maxHp(-10); ctx.bonus({ ballDmg: 2 }); return { text: 'It stings. Your arm feels... stronger.' }; } },
      { label: 'Lose 15 HP → random epic item', disabled: ctx.run.hp <= 16, run: () => { ctx.hurt(15); const it = ctx.randomItem({ types: ['relic', 'cue', 'ball'], rarity: 'epic' }); return { text: `Woozy, you wake up holding ${it.name}.` }; } },
      { label: 'Get a check-up (heal 15, 20 coins)', disabled: ctx.run.coins < 20, run: () => { ctx.coins(-20); ctx.heal(15); return { text: 'Surprisingly competent. You feel better.' }; } },
      { label: 'Run', run: () => ({ text: 'You leave before he finds his scalpel.' }) },
    ],
  },
  {
    id: 'mentor', title: 'Old Chalky', icon: '👴', npc: 'mentor', acts: [1, 2, 3],
    text: (ctx) => NPCS.mentor.greet(ctx.profile.npc.mentor.met),
    onEnter: (ctx) => { ctx.profile.npc.mentor.met++; ctx.seeNpc('mentor'); },
    choices: (ctx) => {
      const out = [
        { label: '"Teach me something."', hint: '+1 charge to all cue upgrades this run', run: () => { ctx.bonus({ charges: 1 }); return { text: '"Chalk every shot. Commit to every stroke. Now go." (+1 cue upgrade charge)' }; } },
        { label: '"Patch me up."', hint: 'Heal 30% HP', run: () => { ctx.heal(Math.round(ctx.run.maxHp * 0.3)); return { text: 'He hands you a thermos of something hot and terrible. You feel great.' }; } },
        { label: '"Got any tricks?"', hint: 'Gain a rare shot card', run: () => { const c = ctx.randomCard('rare'); return { text: `"Here. My old favorite." You learn ${c.name}.` }; } },
      ];
      if (ctx.profile.npc.mentor.met >= 3 && !ctx.profile.unlocked.items.includes('old_chalkys_cue')) {
        out.unshift({ label: '"You said you had something?"', hint: 'Quest reward', run: () => {
          ctx.unlockItem('old_chalkys_cue'); ctx.giveItem('old_chalkys_cue');
          return { text: '"My old cue. It sank the 8 in the Cosmic Arena once. Make it do it again." (Old Chalky\'s Cue unlocked!)' };
        } });
      }
      return out;
    },
  },
  {
    id: 'oracle', title: 'The 8-Ball Oracle', icon: '🔮', npc: 'oracle', acts: [1, 2, 3, 4],
    text: (ctx) => NPCS.oracle.greet(ctx.profile.npc.oracle.asks),
    onEnter: (ctx) => ctx.seeNpc('oracle'),
    choices: (ctx) => [
      { label: 'Ask about the boss (10 coins)', disabled: ctx.run.coins < 10, run: () => {
        ctx.coins(-10); ctx.profile.npc.oracle.asks++; ctx.run.flags.oracleHint = true;
        return { text: `*the die floats up*\n\n"${NPCS.oracle.hints[ctx.run.map.boss] || 'THE MIST IS TOO THICK.'}"` };
      } },
      { label: 'Shake it!', hint: 'Something random happens', run: () => {
        ctx.profile.npc.oracle.asks++;
        const r = ctx.rng.next();
        if (r < 0.3) { ctx.coins(30); return { text: '"IT IS CERTAIN... THAT YOU ARE RICHER." (+30 coins)' }; }
        if (r < 0.55) { ctx.heal(15); return { text: '"OUTLOOK GOOD." Warmth fills you. (+15 HP)' }; }
        if (r < 0.8) { const it = ctx.randomItem({ types: ['consumable'] }); return { text: `"REPLY HAZY... TAKE THIS." (${it.name})` }; }
        ctx.hurt(6); return { text: '"DON\'T COUNT ON IT." It bonks you on the head. (-6 HP)' };
      } },
      { label: 'Ask for wisdom', run: () => {
        ctx.profile.npc.oracle.asks++;
        if (ctx.profile.npc.oracle.asks >= 5 && !ctx.profile.unlocked.items.includes('crystal_eight')) {
          ctx.unlockItem('crystal_eight'); ctx.unlockItem('oracle_eye');
          return { text: '"YOU HAVE ASKED ENOUGH TO BE ANSWERED. THE CRYSTAL 8 IS YOURS TO FIND." (Crystal 8 and Oracle\'s Eye added to the loot pool!)' };
        }
        return { text: `"${ctx.rng.pick(NPCS.oracle.riddles)}"` };
      } },
    ],
  },
  {
    id: 'raccoon', title: 'A Raccoon Appears', icon: '🦝', npc: 'raccoon', acts: [1, 2, 3, 4],
    text: (ctx) => `${NPCS.raccoon.greet(ctx.profile.npc.raccoon.beaten)}\n\nHe sets up a trick shot. Make it in 2 tries and you win his stash. Miss, and he takes a third of your coins.`,
    onEnter: (ctx) => ctx.seeNpc('raccoon'),
    choices: (ctx) => [
      { label: 'Take the shot', hint: 'Side game', run: () => ({ sideGame: 'raccoon' }) },
      { label: 'Pay him off (15 coins)', disabled: ctx.run.coins < 15, run: () => { ctx.coins(-15); return { text: '*he bows and scampers off with your coins*' }; } },
      { label: 'Shoo him away', run: () => {
        if (ctx.rng.chance(0.5)) { const lost = Math.floor(ctx.run.coins * 0.2); ctx.coins(-lost); ctx.profile.npc.raccoon.robbed++; return { text: `He grabs ${lost} coins on his way out! Rude.` }; }
        return { text: 'He hisses and leaves empty-pawed.' };
      } },
    ],
  },
  {
    id: 'rival', title: 'Rival Showdown', icon: '😎', npc: 'rival', acts: [1, 2, 3, 4],
    text: (ctx) => {
      const lvl = ctx.profile.npc.rival.level;
      return `${RIVAL.name} leans on your table. "${RIVAL.lines[Math.min(lvl, RIVAL.lines.length - 1)]}"\n\nHe's Level ${lvl + 1}. Beat him for a rare relic.`;
    },
    onEnter: (ctx) => ctx.seeNpc('rival'),
    choices: () => [
      { label: 'Accept the challenge', hint: 'Elite fight', run: () => ({ fight: 'rival' }) },
      { label: '"Not today, Dash."', run: () => ({ text: '"Scared? Figures." He saunters off.' }) },
    ],
  },
  {
    id: 'spilled_drink', title: 'Spilled Drink', icon: '🍹', acts: [1, 2],
    text: () => 'Someone knocks a drink across the felt — and your cue. The bartender glares at YOU.',
    choices: (ctx) => [
      { label: 'Pay for it (15 coins)', disabled: ctx.run.coins < 15, run: () => { ctx.coins(-15); return { text: 'Expensive drink. You\'re back in his good books.' }; } },
      { label: 'Argue', hint: '-6 HP, but…', run: () => { ctx.hurt(6); if (ctx.rng.chance(0.5)) { ctx.coins(25); return { text: 'A brief scuffle. You find 25 coins on the floor afterwards.' }; } return { text: 'You get thrown out on your ear. Ow.' }; } },
    ],
  },
  {
    id: 'jukebox', title: 'The Jukebox', icon: '📻', acts: [1, 2, 3],
    text: () => 'An ancient jukebox glows in the corner. One song left on your credit.',
    choices: (ctx) => [
      { label: 'Power ballad', hint: '+12 Max HP', run: () => { ctx.maxHp(12); ctx.heal(12); return { text: 'You feel INVINCIBLE. (+12 Max HP)' }; } },
      { label: 'Heavy metal', hint: '+1 damage per ball', run: () => { ctx.bonus({ ballDmg: 1 }); return { text: 'Your cue hand won\'t stop headbanging. (+1 damage per ball)' }; } },
      { label: 'Smooth jazz', hint: 'Gain a common relic', run: () => { const it = ctx.randomItem({ types: ['relic'], rarity: 'common' }); return { text: `So smooth. You find ${it.name} under the jukebox.` }; } },
    ],
  },
  {
    id: 'tournament', title: 'Tournament Sign-Up', icon: '🏆', acts: [1, 2, 3, 4],
    text: () => 'A flyer: "Underground Open — winner takes the pot." Entry fee: 30 coins.',
    choices: (ctx) => [
      { label: 'Enter (30 coins)', hint: 'Elite fight, double coin reward', disabled: ctx.run.coins < 30, run: () => { ctx.coins(-30); return { fight: 'tournament' }; } },
      { label: 'Pass', run: () => ({ text: 'Maybe next year.' }) },
    ],
  },
  {
    id: 'lost_case', title: 'Lost Cue Case', icon: '💼', acts: [1, 2, 3, 4],
    text: () => 'You find an expensive cue case under a table. The tag reads: "If found, return for reward."',
    choices: (ctx) => [
      { label: 'Keep it', hint: 'Random cue upgrade', run: () => { const it = ctx.randomItem({ types: ['cue'] }); return { text: `Finders keepers. Inside: ${it.name}.` }; } },
      { label: 'Return it', hint: '40 coins + heal', run: () => { ctx.coins(40); ctx.heal(10); return { text: 'The grateful owner tips you 40 coins and buys you dinner.' }; } },
    ],
  },
  {
    id: 'cursed_chalk', title: 'Mysterious Chalk', icon: '🟪', acts: [2, 3, 4],
    text: () => 'A cube of purple chalk pulses on the rail. It whispers your name. It wants to be used.',
    choices: (ctx) => [
      { label: 'Chalk up', hint: 'Gain a random curse + 80 coins', run: () => { const c = ctx.addCurse(); ctx.coins(80); return { text: `Power floods in. So does ${c.name}. Also, coins fall out of your sleeve?` }; } },
      { label: 'Destroy it', hint: 'Remove a curse if you have one', disabled: !ctx.run.items.some((i) => ctx.def(i.id)?.type === 'curse'), run: () => { const r = ctx.removeRandom(['curse']); return { text: `The chalk shatters — and ${r.name} goes with it.` }; } },
      { label: 'Leave it', run: () => ({ text: 'It sulks.' }) },
    ],
  },
  {
    id: 'vending', title: 'Vending Machine', icon: '🥫', acts: [1, 2, 3, 4],
    text: () => 'A humming vending machine. Half the labels are in a language you don\'t recognize.',
    choices: (ctx) => [
      { label: 'Buy something (15 coins)', disabled: ctx.run.coins < 15 || ctx.run.consumables.length >= 3, run: () => { ctx.coins(-15); const it = ctx.randomItem({ types: ['consumable'] }); return { text: `*clunk* You get ${it.name}.` }; } },
      { label: 'Kick it', hint: 'Risky', run: () => {
        if (ctx.rng.chance(0.4)) { const it = ctx.randomItem({ types: ['consumable'] }); ctx.randomItem({ types: ['consumable'] }); return { text: `Jackpot! Two items fall out, including ${it.name}.` }; }
        ctx.hurt(5); return { text: 'You stub your toe. (-5 HP)' };
      } },
      { label: 'Leave', run: () => ({ text: 'Probably for the best.' }) },
    ],
  },
  {
    id: 'card_shark', title: 'The Card Shark', icon: '🃏', acts: [2, 3, 4],
    text: () => 'A slick dealer fans a deck of shot cards. "Trade you. Or I can take a bad one off your hands."',
    choices: (ctx) => [
      { label: 'Remove a random starter card', hint: 'Thin your deck', disabled: ctx.run.deck.length <= 3, run: () => { const id = ctx.removeCard(); return { text: `He palms ${id} and it vanishes.` }; } },
      { label: 'Buy a rare card (30 coins)', disabled: ctx.run.coins < 30, run: () => { ctx.coins(-30); const c = ctx.randomCard('rare'); return { text: `He deals you ${c.name}.` }; } },
      { label: 'Buy an epic card (60 coins)', disabled: ctx.run.coins < 60, run: () => { ctx.coins(-60); const c = ctx.randomCard('epic'); return { text: `A gleaming card: ${c.name}.` }; } },
    ],
  },
  {
    id: 'slots', title: 'Slot Machine', icon: '🎰', acts: [2],
    text: () => 'A gaudy slot machine flashes JACKPOT JACKPOT JACKPOT. 10 coins a pull.',
    choices: (ctx) => [
      { label: 'Pull (10 coins)', disabled: ctx.run.coins < 10, run: () => {
        ctx.coins(-10);
        const r = ctx.rng.next();
        if (r < 0.08) { const it = ctx.randomItem({ types: ['relic'], rarity: 'legendary' }); return { text: `🍒🍒🍒 JACKPOT!!! You win ${it.name}!` }; }
        if (r < 0.35) { ctx.coins(25); return { text: '🍋🍋🍋 Small win: 25 coins.' }; }
        return { text: '🍒🍋🔔 Nothing. The machine laughs at you.' };
      } },
      { label: 'Walk away', run: () => ({ text: 'The smart move.' }) },
    ],
  },
  {
    id: 'fight_club', title: 'Underground Fight Club', icon: '🥊', acts: [3],
    text: () => 'Bare-knuckle pool. No refs, no rules, big purse. "First rule: you don\'t talk about it."',
    choices: (ctx) => [
      { label: 'Fight', hint: 'Elite fight, +60 coins', run: () => ({ fight: 'fightclub' }) },
      { label: 'Spectate (bet 25 on the underdog)', disabled: ctx.run.coins < 25, run: () => { if (ctx.rng.chance(0.4)) { ctx.coins(50); return { text: 'Underdog wins! +50 coins.' }; } ctx.coins(-25); return { text: 'Favorite wins. You lose 25.' }; } },
    ],
  },
  {
    id: 'wormhole', title: 'A Wormhole', icon: '🌀', acts: [4],
    text: () => 'Space folds. Through the wormhole you see a thousand versions of your run.',
    choices: (ctx) => [
      { label: 'Step through', hint: 'Swap a random item for a random item of any rarity', disabled: !ctx.run.items.length, run: () => {
        const lost = ctx.removeRandom(['relic', 'ball', 'cue']);
        const it = ctx.randomItem({ types: ['relic', 'ball', 'cue'], rarity: ctx.rng.pick(['rare', 'epic', 'legendary']) });
        return { text: `${lost ? lost.name : 'Nothing'} fades away. ${it.name} materializes.` };
      } },
      { label: 'Throw coins in (40)', hint: 'Heal to full', disabled: ctx.run.coins < 40, run: () => { ctx.coins(-40); ctx.heal(999); return { text: 'The cosmos accepts your offering. You feel whole.' }; } },
      { label: 'Back away slowly', run: () => ({ text: 'Wise.' }) },
    ],
  },
  {
    id: 'trade_blood', title: 'Blood Pact', icon: '🩸', acts: [3, 4],
    text: () => 'A hooded figure: "Your vitality for my artifacts. A fair trade, no?"',
    choices: (ctx) => [
      { label: 'Trade 20% Max HP for a legendary', run: () => { ctx.maxHp(-Math.round(ctx.run.maxHp * 0.2)); const it = ctx.randomItem({ types: ['relic'], rarity: 'legendary' }); return { text: `Your blood runs cold. ${it.name} is yours.` }; } },
      { label: 'Refuse', run: () => ({ text: '"Another time, then." The figure dissolves.' }) },
    ],
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
