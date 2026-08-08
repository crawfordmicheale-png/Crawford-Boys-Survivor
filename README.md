# Crawford Boys: Survivor ⚡🌟

A fast, browser-based **survivor / horde-survival** game (in the spirit of *Vampire Survivors*)
starring two super brothers. Move to dodge — your attacks fire automatically. Collect the
glowing gems dropped by defeated foes to level up, pick powerful upgrades, and see how long
you can last against an endless, escalating horde.

No build step, no dependencies. Just open `index.html`.

## Play

Open `index.html` in any modern browser (desktop or mobile), or serve the folder:

```bash
# any static server works, e.g.:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## The heroes

| | **BOLT** — the Lightning Kid | **STAR** — the Golden Guardian |
|---|---|---|
| Look | Red suit, blue cape & mask, gold lightning bolt | Green suit, green cape & mask, gold star |
| Health | 100 HP | 140 HP |
| Signature | **Chain Lightning** — bolts arc between nearby foes | **Throwing Star** — piercing stars fly at the horde |
| Style | Fast & fragile, high reach | Tanky & armored, close-quarters |

## Controls

- **Move:** `WASD` / Arrow keys / gamepad left-stick / drag on touch screens
- **Attacks:** automatic — just survive and position yourself
- **Pause:** `P` or `Esc` (or the ⏸ button)

## Gameplay

- **Kill enemies** → they drop XP gems that home toward you.
- **Level up** → choose one of three upgrades each time.
- **Weapons:** Chain Bolt, Throwing Star, Orbit Stars, Shock Nova, Boom-Bolt — level each up
  or add new ones (up to five weapons).
- **Passives:** Might, Quick Feet, Overclock, Magnet, Armor, Vigor, Regen, Area.
- **Bosses** periodically crash the party — big HP, big reward.
- Difficulty ramps continuously: enemies get tougher and spawn faster the longer you last.
- Your **best survival time** is saved locally in the browser.

## Art

- The two heroes use the provided **hero portraits** (`assets/bolt.png`, `assets/star.png`),
  background-removed and composited into the world.
- Enemies are sliced from the provided **creature sheet** into 19 individual sprites
  (`assets/enemy_00.png` … `assets/enemy_18.png`) and assigned to enemy types:
  - **Swarm** — bat, flying eyeball, spiked ball
  - **Grunt** — goblin, skeleton, slime, piranha plant, archer, pirate, barrel-mimic
  - **Ghost** — purple wraith, fire elemental
  - **Brute** — rock golem, treant, boar, yeti, robot, crystal-skull
  - **Boss** — treasure-chest mimic
- If any image fails to load, the game falls back to procedural canvas art, so it always runs.

## Tech

- Pure vanilla **JavaScript + HTML5 Canvas**, one file each:
  - `index.html` — markup & screens (title, HUD, level-up, pause, game over)
  - `style.css` — UI styling
  - `game.js` — the entire game engine (input, spawning, weapons, physics, rendering)
- `assets/` — hero portraits + sliced enemy sprites (transparent PNGs).
- Runs from `file://`; works offline.
