// Shopkeepers: each has a specialty that shapes their stock.

export const SHOPKEEPERS = [
  {
    id: 'cuesmith', name: 'Brick the Cue Smith', icon: '🔨', color: '#ffb74d',
    specialty: 'Cue upgrades & shot cards',
    pools: { cue: 3, card: 3, consumable: 1 },
    lines: ['Every cue I make is perfectly straight. Mostly.', 'Chalk\'s free. Everything else ain\'t.', 'Feel that weight? That\'s craftsmanship.'],
  },
  {
    id: 'marbles', name: 'Marbles Malone', icon: '🧑‍🔬', color: '#4fc3f7',
    specialty: 'Ball modifiers & consumables',
    pools: { ball: 3, consumable: 3, card: 1 },
    lines: ['Fresh balls! Some of \'em explode!', 'Don\'t ask what\'s in the Fire Balls.', 'Satisfaction guaranteed. Or no refunds.'],
  },
  {
    id: 'velvet', name: 'Velvet Vic', icon: '🥸', color: '#ba68c8',
    specialty: 'Relics (no questions asked)',
    pools: { relic: 4, curse: 1, consumable: 1 },
    lines: ['Where\'d I get these? Where\'d YOU get those coins?', 'Psst. Over here. Quality goods.', 'Cash only. Obviously.'],
  },
];

export const BLACK_MARKET = {
  id: 'blackmarket', name: 'The Black Market', icon: '🕴️', color: '#ef5350',
  specialty: 'Legendary & cursed goods — pay in coins or blood',
  pools: { legendary: 2, curse: 2, epic: 1 },
  lines: ['You didn\'t see this place.', 'Everything has a price. Some prices are HP.', 'The good stuff. The forbidden stuff.'],
};
