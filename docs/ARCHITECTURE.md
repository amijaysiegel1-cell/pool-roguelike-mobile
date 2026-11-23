# Architecture

Plain ES modules, no framework, no build step. Three layers that only depend downward:

```
 ui/  (DOM screens, touch input)  ──►  render/ (canvas)  ──►  game/ (rules, run, AI)  ──►  physics/  ──►  core/
                                          ▲                         ▲
                                          └──────── data/ (pure content: items, bosses, events…) ──┘
```

`physics/` and `game/` never touch the DOM, so the whole game — fights, AI, full runs — runs headless
in Node for tests and balancing.

## Directory map

| Path | Responsibility |
|---|---|
| `src/config.js` | **All tunables**: table geometry, friction/restitution, damage, HP, prices. Balance lives here. |
| `src/core/rng.js` | Seeded, splittable RNG. `streamFor(seed, purpose)` gives an independent stream per decision ("map:2", "shop:2-3-1"…), so a seed reproduces the same run regardless of play order. |
| `src/core/audio.js` | WebAudio synth: SFX + step-sequencer music with per-act styles and intensity layers. |
| `src/core/haptics.js` | Vibration API wrapper (swap in Capacitor Haptics for native). |
| `src/core/save.js` | localStorage wrapper. |
| `src/physics/sim.js` | The billiards engine (see below). |
| `src/physics/table.js` | Builds cushions/jaws/pockets from a pocket list — pockets can move, shrink, multiply. |
| `src/physics/predict.js` | Aim-guide raycasts and the full-simulation trajectory preview (Laser Sight). |
| `src/game/rules.js` | 8-ball shot evaluation (fouls, banks, combos, rack outcome). Pure. |
| `src/game/fight.js` | **The Fight**: turn state machine, damage, statuses, item hooks, boss scripts, save/rewind. Emits events. |
| `src/game/ai.js` | Opponent planner (generator, time-sliced across frames). |
| `src/game/stats.js` | Folds character + items + ascension + challenge into one stat block. |
| `src/game/mapgen.js` | Branching act map. |
| `src/game/run.js` | Run lifecycle: encounters, loot tables, shops, rewards, events context, endings. |
| `src/game/meta.js` | Persistent profile: unlocks, Legend Points, achievements, leaderboard. |
| `src/data/*` | Content. Adding content almost never needs code changes elsewhere. |
| `src/render/` | Canvas renderer, per-pixel rolling ball sprites, particle FX. |
| `src/ui/` | `app.js`-routed screens. `screens/match.js` holds the touch controls and wires Fight events to juice. |

## The physics engine (`physics/sim.js`)

Why custom instead of Matter.js: pool needs a ball model with **spin** — the slip between the
contact point and the cloth is what produces draw, follow, stun and english — plus exact
determinism (seeded runs, AI look-ahead and trajectory previews all re-simulate the same shot).
General rigid-body engines model neither.

Each ball stores velocity `(vx, vy)`, rolling spin as the contact-point surface velocity `(wx, wy)`
(pure rolling ⇔ `w = −v`), and side spin `ws`. Per 1/300 s step (sub-stepped adaptively for fast
balls):

1. **Fields** — tilt, drift, pocket magnets, black holes, massé curve, homing.
2. **Friction** — sliding friction acts on the slip `v + w` (converting it to roll in exactly
   2|u|/7μg, the textbook result); rolling resistance + drag once rolling; side spin decays.
3. **Ball–ball** — impulse along the line of centres + tangential friction (english "throw").
   Collisions sweep alternately forward/backward to avoid left-right bias on the break.
4. **Cushions** — closest-point capsules, speed-dependent restitution, english grips the rail.
5. **Pockets** — capture radius or falling through a gap past the cushion line.

It emits `first`, `collide`, `cushion`, `pocket`, … events that the Fight turns into gameplay.

## The Fight (`game/fight.js`)

State machine: `intro → aim → moving → resolving → wait → (think → enemyAim → moving) …`.

- `executeShot()` sets per-shot pocket scale, force fields and flags, then strikes.
- `onSimEvent()` handles mid-shot effects (explosions, splits, lightning, sticky jaws) via a queue
  processed between physics steps.
- `resolve()` → `rules.evaluateShot()` → `applyPlayerShot()/applyEnemyShot()` → `afterShot()`.
- UI subscribes with `fight.on('pocket' | 'hurtEnemy' | 'banner' | 'say' | …)`.
- `serialize()/restore()` power both auto-save (every turn start) and the Rewind consumable.

## Adding content

**A powerup** — add an object to `data/items.js`:

```js
{ id: 'ricochet', name: 'Ricochet', type: 'relic', rarity: 'rare', icon: '🪃',
  desc: 'Your balls deal +4 per cushion they hit before dropping.',
  hooks: { onSinkDamage: (f, info) => { info.flat += 4 * (info.ball.rails || 0); } } }
```

Use `stats` for pure number changes (see `STAT_DEFAULTS` in `game/stats.js`) and `hooks` for
behaviour. Hooks: `onFightStart, onRackStart, onTurnStart, onFirstContact, onCollide, onPocket,
onSinkDamage, onShotEnd, onFightEnd, onLethal`. Active cue upgrades use `charges` + `arm(shot)` and
set shot flags (`explode, ghost, curve, magnet, stun, laser, lightning, doubleShot, pocketMul,
bankMul, dmgMul, …`) — cards set the same flags, which is why they combo.

**A boss** — add to `data/bosses.js`: `enemies`, `intro`, `taunts`, `phases: [{ at, name, enter }]`,
optional `setup / onTurnStart / playerFields / onBumper / onEnemyDown`, `enemyMode: 'tilt'` for a
non-cue opponent, and a `relic`. Bosses reshape the table through `f.tableSpec` + `f.rebuildTable()`
and `f.sim.fields / f.sim.movers`.

**An event** — add to `data/events.js` with `choices(ctx)` returning `{ label, hint, disabled, run }`;
`run()` mutates via `ctx` helpers and returns `{ text }`, `{ fight: 'rival' }` or `{ sideGame: … }`.

**Opponents / elites / table modifiers** — `data/enemies.js`. **Characters** — `data/characters.js`.
**Achievements** — `data/achievements.js`. **Ascension & challenges** — `data/challenges.js`.

## Saving

- `profile` (meta) and `run` (current run, including the serialized fight at the last turn start
  and the current screen's state) live in localStorage under `rackruin.*`.
- Reloading the page mid-fight resumes at the start of the current turn.

## Global leaderboard

Daily runs share a seed (`DAILY-YYYYMMDD`). Scores are kept locally; `game/meta.js →
submitGlobalScore()` POSTs `{score, seed, mode, char, date}` to `window.RACKRUIN_LEADERBOARD_URL`
if you set one. Any tiny backend works (Supabase table, Cloudflare Worker + KV, Firebase). Add
server-side validation (e.g. replaying the seed) before trusting submissions.

## Shipping to the App Store / Play Store

The web build is already a PWA. For store builds, wrap it with **Capacitor**:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/haptics
npx cap init "Rack & Ruin" com.example.rackruin --web-dir .
npx cap add ios && npx cap add android
```

Then route `core/haptics.js` to `@capacitor/haptics` (iOS web pages can't vibrate) and open the
native projects in Xcode / Android Studio. If you later want a full native engine, the clean split
(physics / rules / data / UI) ports directly to Godot (GDScript) — `config.js` and `data/` map 1:1
to resources.

## Roadmap ideas

- Art pass: illustrated character portraits to replace emoji, per-act table props.
- More bosses/events per act; elite-specific mechanics; endless mode after the Cosmic 8.
- Global leaderboard backend; ghost replays of daily runs (deterministic sim makes this cheap).
- Accessibility: colour-blind ball palettes, larger UI scale option.
