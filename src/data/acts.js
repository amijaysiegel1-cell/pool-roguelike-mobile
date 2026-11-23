// The four acts: visual theme, music style and map flavour.

export const ACTS = [
  null,
  {
    id: 1, name: 'The Dive Bar', roman: 'I', icon: '🍺',
    blurb: 'Sticky floors, sticky cues, and a jukebox that only plays one song.',
    felt: ['#239058', '#14603a'], cushion: '#1d7a4a', rail: ['#7a4a22', '#4a2a10'], railEdge: '#2c1708',
    diamond: '#f3e2b3', pocket: '#070707', bg: ['#3a2414', '#120a05'], accent: '#ffb74d', ambient: 'dust',
    music: { bpm: 88, root: 45, scale: 'blues', style: 'shuffle' },
  },
  {
    id: 2, name: 'The Neon Casino', roman: 'II', icon: '🎰',
    blurb: 'Everything blinks. The house always wins. Unless you\'re the house now.',
    felt: ['#7b2bbf', '#3f0f6e'], cushion: '#6a22a8', rail: ['#22223a', '#0d0d1a'], railEdge: '#ff2bd6',
    diamond: '#00e5ff', pocket: '#05000c', bg: ['#2a0548', '#05000f'], accent: '#00e5ff', ambient: 'sparkle', neon: true,
    music: { bpm: 112, root: 41, scale: 'minor', style: 'synth' },
  },
  {
    id: 3, name: 'The Underground Hall', roman: 'III', icon: '⛓️',
    blurb: 'Below the city, they play for keeps. The tables here remember everything.',
    felt: ['#8c2424', '#4e0f0f'], cushion: '#7a1c1c', rail: ['#5a5a5a', '#2a2a2a'], railEdge: '#a1887f',
    diamond: '#ffab91', pocket: '#050303', bg: ['#262222', '#070505'], accent: '#ff7043', ambient: 'smoke',
    music: { bpm: 124, root: 38, scale: 'phrygian', style: 'techno' },
  },
  {
    id: 4, name: 'The Cosmic Arena', roman: 'IV', icon: '🌌',
    blurb: 'Zero gravity. Infinite stakes. The final rack.',
    felt: ['#1a2a7a', '#060d33'], cushion: '#16236a', rail: ['#1e1b4b', '#0a0826'], railEdge: '#7c4dff',
    diamond: '#b388ff', pocket: '#000000', bg: ['#14063a', '#000000'], accent: '#b388ff', ambient: 'stars', neon: true, stars: true,
    music: { bpm: 100, root: 43, scale: 'dorian', style: 'cosmic' },
  },
];

export const TUTORIAL_THEME = { ...ACTS[1], name: 'Practice Table' };

export const FELT_SKINS = {
  default: null,
  royal: { felt: ['#1f4fbf', '#0e2a6e'], cushion: '#1a43a6' },
  crimson: { felt: ['#b3202d', '#6b0d16'], cushion: '#9a1b27' },
  midnight: { felt: ['#2b2f3a', '#111318'], cushion: '#252833' },
  gold: { felt: ['#b8860b', '#6b4a00'], cushion: '#a07408' },
  mint: { felt: ['#26a69a', '#0f5f57'], cushion: '#1f8f84' },
};

export const CUE_SKINS = {
  maple: { shaft: ['#f3d9a4', '#d9b06c'], butt: ['#3e2410', '#1d0f05'], wrap: '#111', ring: '#ddd' },
  carbon: { shaft: ['#555', '#222'], butt: ['#111', '#000'], wrap: '#ff5252', ring: '#999' },
  neon: { shaft: ['#e0f7fa', '#80deea'], butt: ['#ff2bd6', '#7b1fa2'], wrap: '#00e5ff', ring: '#fff' },
  dragon: { shaft: ['#ffe0b2', '#ffb74d'], butt: ['#b71c1c', '#3e0000'], wrap: '#ffd54f', ring: '#ffd54f' },
  ghost: { shaft: ['#ffffffcc', '#cfd8dccc'], butt: ['#b0bec5cc', '#607d8bcc'], wrap: '#e0e0e0', ring: '#fff' },
  dash: { shaft: ['#fff59d', '#fbc02d'], butt: ['#1565c0', '#0d47a1'], wrap: '#fff', ring: '#ffd54f' },
};
