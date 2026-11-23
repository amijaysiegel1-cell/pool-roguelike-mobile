# 🎱 Rack & Ruin — an 8-ball pool roguelike

Real billiards physics meets Slay-the-Spire-style runs. Every pool match is a fight: sink your
balls to hurt your opponent, and watch out for scratches, misses and their sinks. Climb four acts
(Dive Bar → Neon Casino → Underground Hall → Cosmic Arena), build wild powerup combos, and beat five
bosses with their own rules.

Runs in any modern mobile browser (Safari / Chrome, iOS & Android). No app store, no install, no
build step, no dependencies. "Add to Home Screen" makes it a full-screen app with offline support.

## Play it

**Locally**

```bash
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000 on your computer, or http://<your-computer-ip>:8000 on your phone (same Wi-Fi)
```

**On your phone, anywhere (GitHub Pages)** — Settings → Pages → *Deploy from branch* → `main` / root.
Open the Pages URL on your phone, then Share → **Add to Home Screen** (iOS) or ⋮ → **Install app** (Android).

**As one file** — `node tools/build.mjs` writes `dist/rack-and-ruin.html`, a single self-contained
file (~450 KB) you can open from disk, AirDrop, or host anywhere.

## Controls (portrait)

| Action | Gesture |
|---|---|
| Aim | Drag anywhere on the table |
| Shoot | Pull the **POWER** slider down and release — or drag back from the cue ball like a slingshot |
| Fine aim | Slide the ridged **FINE** strip |
| Spin (top / draw / english) | Drag the red dot on the small cue ball (double-tap to reset) |
| Zoom | Pinch the table (double-tap to reset) |
| Fast-forward | Hold the table while balls roll |
| Ball in hand | Drag the cue ball |
| Powerups | Tap a chip in the bottom tray: cue upgrades (arm), shot cards (play), consumables (use) |

Left-handed mode swaps the power and fine-aim sides (Settings).

## What's in this build

- **Physics**: custom deterministic engine — sliding→rolling friction, draw/follow/stun, english off
  cushions and throw, pocket jaws, adaptive sub-stepping for 4000+ u/s breaks, force fields (magnets,
  tilt, black holes, massé curve), moving obstacles.
- **Combat rules**: 8-ball with fixed groups (you're solids). Bank, kick, combo, long and multi-ball
  multipliers; fouls, misses, early-8 penalties, 8-ball finishers, multi-rack fights.
- **Opponent AI**: simulates ~20–40 candidate shots per turn (ghost-ball, bank mirrors, safeties,
  spin variants) on a cloned table, then executes with skill-scaled aim error.
- **Run structure**: 4 acts × 8 floors of branching map + boss; matches, elites, shops (3 keepers +
  rare black market), events, rest stops, treasure, mystery nodes. Seeds make every run shareable.
- **5 bosses** with intros, taunts, phase changes and unique relics: The Shark, Magnetic Mona, The
  Twin Cues, The Table Itself, The Cosmic 8.
- **71 powerups** (cue upgrades, ball modifiers, relics, curses, consumables) + **19 shot cards**,
  all data-driven with hooks so they combo (Split Ball + Explosive Tip = chain reaction, Fire Balls
  spread on contact and get ignited by blasts, bank builds, money builds…).
- **6 characters**, recurring NPCs who remember you (mentor quest, levelling rival, oracle hints,
  coin-thief raccoon side game), 19 events, 4 endings (3 secret).
- **Meta**: Legend Points, Clubhouse unlocks (loot pool, felts, cue skins), 10 ascension levels,
  daily seeded runs, 5 challenge modes, collection book, 24 achievements, local leaderboards.
- **Juice**: rolling 3D-shaded balls, particles, shockwaves, lightning, screen shake, slow-mo on big
  shots, damage numbers, haptics (Android), synthesized SFX and per-act dynamic music that
  intensifies in boss fights.
- Tutorial (4 lessons), auto-save every turn (resume mid-fight), pause menu.

## Tests

```bash
node tests/physics.test.mjs     # draw/follow/english/pots/break sanity
node tests/fight.test.mjs 4     # headless bot-vs-AI fights incl. all bosses
node tests/run.test.mjs 4       # whole runs: every node type, events, shops, act transitions
python3 -m http.server 8765 & node tests/smoke.mjs . && node tests/screens.mjs .   # browser (Playwright)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the code structure, how to add bosses /
powerups / events, and the path to native iOS/Android builds.
