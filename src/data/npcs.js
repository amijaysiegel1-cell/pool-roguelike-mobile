// Recurring characters. Their dialogue reacts to how often you've met them
// across runs (profile.npc.*), so they remember you.

export const NPCS = {
  mentor: {
    id: 'mentor', name: 'Old Chalky Reyes', icon: '👴', color: '#a5d6a7',
    title: 'Retired Legend',
    greet: (n) => [
      'Kid. You hold that cue like it owes you money. Sit down.',
      'Back again? Good. Means you\'re still alive.',
      'Third time\'s the charm. I\'ve got something for you, if you\'re ready.',
      'You remind me of me. Before the Cosmic Arena took my nerve.',
    ][Math.min(n, 3)],
  },
  rival: {
    id: 'rival', name: 'Dash Darnell', icon: '😎', color: '#ffd54f', title: 'Your Rival',
  },
  oracle: {
    id: 'oracle', name: 'Orbo', icon: '🔮', color: '#b388ff', title: 'The 8-Ball Oracle',
    greet: (n) => [
      'SHAKE ME... GENTLY. I SEE ALL ANGLES.',
      'THE SPHERE REMEMBERS YOU, TRAVELER.',
      'AGAIN THE SEEKER RETURNS. THE FELT WHISPERS YOUR NAME.',
      'YOU HAVE ASKED MANY TIMES. PERHAPS THE ANSWER WAS INSIDE THE 8 ALL ALONG.',
    ][Math.min(n, 3)],
    hints: {
      shark: 'THE FISH THAT SMILES HAS MANY TEETH. WHEN IT BLEEDS HALF, IT STOPS PRETENDING.',
      mona: 'SOME POCKETS HUNGER FOR THE WRONG BALLS. FEAR THE PINK GLOW — IT WANTS YOUR CUE BALL.',
      twins: 'TWO HALVES, ONE RAGE. FELL ONE, AND THE OTHER BURNS BRIGHTER. CHOOSE YOUR TARGET WISELY.',
      living_table: 'THE GROUND BENEATH YOU IS NOT GROUND. WHEN IT OPENS ITS EYE — STRIKE THE EYE.',
      cosmic8: 'IN THE DARK, ALL THINGS ORBIT. THE CENTER SWALLOWS EVERYTHING. EVEN YOU.',
    },
    riddles: [
      'THE STRAIGHTEST PATH IS OFTEN OFF THE RAIL.',
      'WHAT FALLS LAST, WINS FIRST.',
      'A BALL AT REST DREAMS OF POCKETS.',
      'SPIN IS A PROMISE THE CUSHION KEEPS.',
      'THE RACCOON KNOWS MORE THAN HE STEALS.',
      'END WITH THE 8 IN THE COSMOS, AND SEE WHAT THE 8 SEES.',
    ],
  },
  raccoon: {
    id: 'raccoon', name: 'Bandit', icon: '🦝', color: '#90a4ae', title: 'Coin Thief',
    greet: (n) => [
      '*chitters* Nice coins. Mine now. ...Unless you can make this shot?',
      '*recognizes you* Oh. YOU. Double or nothing, sucker.',
      '*grins* My favorite mark is back! One shot. You know the deal.',
      '*offers a tiny paw* We\'re practically business partners now.',
    ][Math.min(n, 3)],
  },
  shopkeepers: {},
};
