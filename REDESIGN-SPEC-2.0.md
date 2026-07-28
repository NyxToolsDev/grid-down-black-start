# Black Start 2.0 — The Living Map Redesign

Status: DESIGN. Direction locked 2026-07-28: full redesign, web-native JS/canvas.
Supersedes the presentation layer of GAME-DESIGN-SPEC.md; the simulation core,
event content, characters, and canon survive.

## Why the redesign

Verdict on 1.0: mechanically sound, doesn't *feel* like anything. The target
feel is Plague Inc inverted — and Plague Inc's feel comes from five specific
things, none of which 1.0 had:

1. **One map that IS the game.** You stare at the world and watch your work
   spread across it. 1.0 buried the county in menus.
2. **Bubbles.** Events surface as tappable pops ON the map, with timers.
   The map interrupts you; you don't go looking for events.
3. **A tree.** Between moments you spend earned points in an upgrade tree
   and feel yourself compounding.
4. **Time you control.** Continuous sim with 1x/2x/pause — tension comes
   from watching, not from pressing END TURN.
5. **One global race.** Cure-vs-infection becomes trust-vs-restoration:
   the county's patience runs out on a visible political clock.

## The map (the whole game happens here)

- Stylized Harlan Valley, portrait canvas: river on the diagonal, town
  clusters, the 5 generation units and 18 load zones as nodes, transmission
  and feeder lines as polylines between them.
- **Line states are the core visual:** dead lines near-black, energizing
  lines pulse amber along their length (animated dash flow), served lines
  hold warm white. Zones light up as window-cluster sprites — dozens of
  tiny lights popping on when a zone is served.
- The opening frame is an almost fully dark county with one blinking
  blackstart unit. The endgame frame is a lit valley. That transformation
  IS the game and IS the marketing GIF (already flagged as lead asset).
- Island stability made visible: when an island's reserve margin thins,
  its lit zones flicker. No numbers needed to feel danger; exact figures
  live in a slide-up inspector drawer for players who want them.
- Weather moves across the map as drifting overlay bands (canon arc: rain
  Day 2, frost Day 4) — you can SEE the storm approach your weakest line.

## Interaction model

- **Bubbles:** the 60-event deck (kept, re-tagged) surfaces as map bubbles
  anchored to relevant nodes. Red = damage/safety, amber = decision,
  blue = story/broadcast (characters speak here), green = opportunity
  (mutual aid, National Guard fuel run). Bubbles have visible timers;
  ignored bubbles auto-resolve to their worst outcome. Tap → compact card
  with 2-3 choices, reusing existing event writing.
- **Crews as chips:** crew tokens live on the map; drag one to a node (or
  tap node → tap crew) to assign. A crew driving to its job is a dot
  moving along roads — travel time is real and visible.
- **Speed controls:** pause / 1x / 2x, always on screen. One game-day ≈
  60 seconds at 1x (tune 45-75s). Everything is tappable while paused —
  phone-friendly, same as Plague Inc.

## The Grid Ops tree (new system)

Currency: **Restoration Points (RP)**, earned at mileposts — first stable
island, hospital energized, each +10% served, surviving canon weather
without a trip. Spend in a 3-branch tree, ~24 nodes MVP:

- **LINES** — repair speed, spare transformers, vegetation crews, storm
  hardening (mitigates the frost/rain arc).
- **PEOPLE** — shelter capacity, comms/broadcasts (slows trust decay),
  equity outreach (feeds the silent equity index), volunteer spotters
  (bubbles get longer timers).
- **POWER** — fuel logistics, tie-line import capacity, finer load-shed
  steps, blackstart battery redundancy.

Tree choices should create distinct run identities (a LINES run plays
differently from a PEOPLE run) — that's the replayability engine.

## Kept from 1.0 (do not re-litigate)

- Reserve margin / island stability math — the signature system.
- Public Trust + silent equity index; trust is the political clock: the
  county executive's deadline ticks on screen, trust collapse still fires
  the RELIEVED/fired endings.
- Canon: 4:17 PM Tuesday start, Harlan River geography, Maple Lane
  restored last, game-1 broadcast bridges.
- The 6 ops-room voices — recast as advisor portraits inside blue bubbles
  and the morning-briefing card.
- Endings, legacy score, writing standards, Annual Exercise mode as the
  free demo / tutorial.
- Series tech pattern: vanilla JS, no build, PWA, same repo and URL
  (nyxtoolsdev.github.io/grid-down-black-start/), sw cache bump on ship.

## Dropped from 1.0

- The 1980s control-room panel presentation and per-phase screen flow.
- END TURN structure (replaced by continuous time + morning-briefing
  pause card at 06:00 each day).
- Job/crew menu taps and +/- pickup steppers (her thumb-feel complaint —
  replaced by drag-to-assign).

## Technical shape

- Single canvas, layered draw: terrain → lines → zones → weather → crew
  dots → FX. requestAnimationFrame; sim ticks decoupled from draw.
- DOM overlays for bubbles/cards/tree/drawer, positioned via world→screen
  transform. Tap targets ≥ 44px. Target: 60fps on a mid phone.
- Salvage from src/: sim math (dispatch, margins, islanding), event data,
  ending logic. Replace: all rendering/input/screen-flow modules.
- Save = serialized sim state to localStorage, autosave each game-day.

## MVP cut order

1. Map + line/zone rendering + continuous time + speed controls (the GIF
   must be possible from this milestone alone).
2. Crews as draggable chips, travel, repair jobs.
3. Bubbles wired to the existing event deck.
4. Grid Ops tree + RP mileposts.
5. Weather overlay + canon arc + endings + legacy score.
6. Annual Exercise tutorial mode; polish pass; itch build (PWYW $5/$8).

Post-MVP: sandbox county generator, scenario packs (ice storm start,
cyber cause), Play Store via PWABuilder.
