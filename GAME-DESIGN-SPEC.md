# Grid Down: Black Start — Game Design Spec

**Working title:** Grid Down: Black Start
**Genre:** Turn-based grid-restoration strategy on a live one-line-diagram map ("reverse Plague Inc")
**Platform:** Browser-playable (HTML/JS canvas), installable as PWA, touch-first
**Price target:** Free browser demo (Exercise scenario) + PWYW full game ($5 min, $8 suggested) on itch.io
**Target audience:** Prepper/survivalist community (primary), strategy/sim players (secondary), grid nerds and engineers (tertiary — this game is unusually shareable to Hacker News)
**Solo dev scope:** 12-14 weeks evenings/weekends to shippable MVP
**Series position:** Game 3. Get Home = one person, one day. Grid Down = one family, 30 days. Black Start = one region, the same 30 days, seen from the control room.

---

## Core concept

It is 4:17 PM on a Tuesday when the grid fails — and you are the senior system operator on shift at Harlan Valley Power & Light. The opening 90 seconds are scripted and unwinnable: you watch the cascade take the board down, shedding load that cannot save it. Then the room goes quiet, the hum stops, and the real game begins.

Over 30 days you perform a **black start**: restarting a dead regional grid from a single hydro dam, energizing cranking paths to bigger plants, building fragile islands of light, and synchronizing them into a grid — while hospitals burn through generator diesel, water plants count down to failure, crews fatigue, copper thieves strip dead substations, and politicians demand their districts first.

Plague Inc inverted: the map starts dark and you fight to light it. The spreading threat isn't a disease — it's entropy: fuel clocks, frost, decay, and your own greed. Pick up load faster than your generation can hold and the island trips, and you give a town the grid and then take it away — the one thing the public never forgives.

The player of Grid Down survived 30 days waiting for the lights. The player of Black Start is the reason they came back on.

---

## Design pillars (in priority order)

### 1. Authenticity over entertainment
Black start is a real procedure; cranking paths, load blocks, reserve margin, switching orders, and mutual aid are real vocabulary. Grid engineers and preppers will evangelize a game that gets it right and dismiss one Hollywood detail in a single sentence. No sparking consoles, no red countdown timers, no terrorists storming the control room.

### 2. Trade-offs over optimization
Every crew-day spent is a crew-day not spent. Deep restoration (more MW to fewer people) versus wide restoration (fewer MW to more people) is the running dilemma, and there is no correct answer — only trade-offs the ending will remember.

### 3. Systems over scripts
The 30-day story emerges from interacting systems: fuel clocks, weather, fatigue, trust, and stability. Hand-written content frames the simulation; it doesn't replace it.

### 4. Tension over difficulty
Input randomness (a storm front is forecast; you decide how to prepare), not output randomness (your repair randomly fails). The one exception is the island trip roll — and the player always sees the risk state before committing load.

### Mechanical signature
**Greed trips the grid.** Reserve margin is the buffer between the board you've built and darkness. Games 1 and 2 asked "warm and visible, or cold and hidden?" — this game asks "serve more people tonight, or keep what you've already lit?"

---

## The board — Harlan Valley, ~480 MW

One hand-authored region rendered as a utility one-line diagram: generation nodes, transmission substations, load zones, and the lines between them. The board starts **black** — SCADA telemetry is down. Nodes reveal as comms are restored or crews physically patrol them. The first two days are as much reconnaissance as restoration.

The geography is the Get Home map at utility scale: Harlan City downtown in the west, the rail corridor, the Millbrook strip, the Harlan River, and the Cedar Run rural tail in the east. Rural is restored last. That's not a design choice — it's how restoration actually works, and it's why a certain family on Maple Lane waits 30 days.

### Generation fleet (5 units + 1 tie)

| Unit | Type | MW | Black start? | Restart requirements |
|---|---|---|---|---|
| Harlan Falls Dam | Hydro | 40 | **Yes** — rode through on house units | Online Day 1. The seed. |
| Cedar Run Peakers | 2x gas turbine (dual-fuel) | 50 | Yes, but start batteries are dead (vandalized pre-event) | 1 tech-day + parts to repair; burns diesel from the shared fuel pool |
| Millbrook Energy Center | Combined-cycle gas | 240 | No | 8 MW station power + Compressor C-4 zone live + 24h pipeline repack + 2-day staged start (80/160/240) |
| Warrick Station | Coal | 180 | No | 12 MW station power + staffed; 3 days to first MW, then +60 MW/day |
| Ridgeline Solar + Storage | Community solar | 20 | Auto | Serves daytime load only; **never counts toward reserve margin** |
| Eastlake Intertie | Import from neighboring utility | +100 | — | Available Day 18+ after Eastlake stabilizes; requires the sync-capable sub repaired and a negotiated price (Day 20 major decision) |

Total native fleet: 530 MW against 480 MW normal load and ~550 MW hard-freeze load. Full restoration in the freeze requires the intertie or deliberate industrial curtailment. The endgame is a knife edge by design.

The circular dependency is the mid-game puzzle: the big gas plant needs the pipeline compressor, the compressor needs power, and power at scale needs the big gas plant. You break the loop with the dam and the peakers — exactly as real restoration plans do.

### Load zones (18, ~480 MW total)

| # | Zone | MW | Tags / notes |
|---|---|---|---|
| 1 | Harlan General District | 15 | HOSPITAL — generator fuel clock |
| 2 | Downtown Harlan City | 50 | Where Get Home begins |
| 3 | Riverside Water Treatment | 10 | WATER — boil order Day 3, pressure loss Day 6 |
| 4 | Eastbank Wastewater | 8 | SEWAGE — overflows into the Harlan River Day 4 |
| 5 | Millbrook Town | 35 | |
| 6 | Millbrook Strip | 25 | FUEL — truck stop + distributor; enables fuel resupply once live |
| 7 | Railyard & Cold Storage | 20 | FOOD — regional cold chain; spoilage clock Day 5 |
| 8 | Compressor Station C-4 | 5 | GAS — gates the Millbrook CCGT |
| 9 | Signal Ridge Comms | 5 | COMMS — tower batteries die 48h in; dark = degraded forecasts and -1 effective crew action/day |
| 10 | Westbrook Heights (north suburbs) | 70 | Affluent. The mayor lives here. |
| 11 | Garfield (south suburbs) | 75 | Working-class. The equity index is watching. |
| 12 | Garfield Mills Industrial | 50 | INDUSTRY — the curtailment pressure valve; leaving it dark frees 50 MW at economic/trust cost |
| 13 | County Airport & Armory | 12 | STAGING — mutual aid arrives faster once live |
| 14 | University & Shelter Campus | 15 | SHELTER — warming center capacity during the freeze |
| 15 | Cedar Run Town | 30 | |
| 16 | Lakeview Care Cluster | 10 | MEDICAL — nursing homes; the freeze's most vulnerable point |
| 17 | Rural Co-op West | 25 | Long feeders, heavy storm damage |
| 18 | Rural Co-op East — Maple Lane | 20 | The family's street. No tag. The game never points at it. |

Each zone needs: its upstream substation live, its feeder repaired (0-3 crew-days of storm damage, seeded per run within per-sector bands — rural rolls worse), and a switching action to energize. **Load blocks:** zones 10, 11, and 15 pick up in two blocks each; everything else is a single block.

Transmission layer: ~12 substations and the lines between them, same repair/patrol/energize model. Two spare high-voltage transformers exist in the region. Certain events (fire, theft gone wrong, a botched switching order from an exhausted tech) can destroy a transformer. **A destroyed transformer with no spare kills that node for the run.** Equipment death is this game's character death.

---

## Resource systems — 6 tracks

| Resource | Unit | Start | Notes |
|---|---|---|---|
| Generation online | MW | 40 (the dam) | Capacity actually synchronized, per island |
| Load served | MW | 0 | The score-in-progress; also the trust engine |
| Crews | crew-days/day | 4 line crews + 2 techs | The action currency. Mutual aid adds up to +6 crews (see below) |
| Fuel | gallons (diesel pool) | 9,000 | Consumed by crew trucks (100/crew/day), hospital generator (500/day), peakers when on diesel (2,000/day at full output). Resupply via FUEL zone or convoy events |
| Public Trust | 1-10 | 6 | The cohesion analog — the region's willingness to hold together |
| Crew Fatigue | 1-10 per crew | 2 | The stress analog. +1 per worked day, +2 per night shift, -2 per rest day |

### Reserve margin and island stability (the signature system)

Every energized island has a stability state, always visible before the player commits load:

- **SOLID** — generation ≥ 1.20x load. No trip risk.
- **TIGHT** — 1.05x to 1.20x. 5% trip roll per day; events that drop a unit or spike load land here hard.
- **CRITICAL** — below 1.05x. 25% trip roll per day, and the board shows it: the island's lines flicker.

**A trip blacks out the entire island.** Every zone on it goes dark, restart begins from the island's black-start unit, each affected zone rolls 10% for equipment damage, and Trust takes -2 — double a normal grievance, because you gave them the light and took it away. One trip mid-game is a setback; one trip in the endgame with 400 MW online is the run's defining catastrophe.

**Synchronizing islands** merges two boards into one: both must be SOLID, a tech spends the day, and the sync succeeds at 90% (SOLID/SOLID) — on failure the smaller island trips. A merged island shares reserve, which is why you sync: one big island rides events two small ones can't.

**Frequency is abstracted to reserve margin.** No AC math, no per-line power flow. The player learns the real logic (keep headroom, stage load pickup, protect your reserve) without a single hertz on screen.

### Public Trust dynamics

- Daily drift: -0.3 per unserved critical tag (HOSPITAL/WATER/MEDICAL) past its deadline; -0.1 per 10% of population unserved after Day 10.
- +0.5 per critical tag restored; +1 for each first-time major milestone (water back, hospital on grid, freeze handled without deaths).
- Island trip: -2. Missed broadcast promise: -1.5. Honest bad news: -0.5 now, +0.25/day for three days ("at least they're straight with us").
- Below 3: security events double, crews report harassment, roadblock events begin, the mayor goes on the radio against you.
- At 0: **federal takeover ending** (loss). The region didn't collapse — you just don't get to finish the job.

### The equity index (tracked silently)

The game logs the order in which Westbrook Heights, Garfield, and the rural co-ops come back relative to their damage rolls. Restoring the affluent district ahead of equally-repairable working-class zones costs nothing that day — it surfaces in Trust drift, in event flavor (crews notice), and in the epilogue. Never shown as a meter. Like game 1's moral choices: tracked silently, remembered permanently.

---

## Turn structure — daily loop

Three phases, mirroring Grid Down's day:

### Phase 1: Morning briefing (06:00)
- Overnight results, weather forecast (quality degrades if COMMS is dark), deadline dashboard (fuel clocks, water countdown, freeze forecast)
- Assign each crew: **Patrol** (reveal damage/telemetry), **Repair** (line/feeder/substation), **Switching/Energize** (techs; brings zones online, executes syncs), **Secure** (guard a substation against theft), **Fuel run** (deliver 500 gal), **Staff plant** (Warrick/Millbrook restart support), **Rest**
- Optional night shift per crew: a second action at +2 fatigue and elevated mistake risk — night work is the "push on past dusk" of this game
- Set the load pickup plan: which blocks energize tonight, shown against projected reserve margin and resulting stability state
- On broadcast days (1, 3, 5, then every 5): draft the radio statement — **Honest / Reassuring / Silent** — with the projected restoration date you're willing to say out loud

### Phase 2: Midday events (1-2 from the weighted deck)
2-4 sentences, 2-4 choices, clear risk signals, results in resources/trust/fatigue — same contract as Grid Down.

### Phase 3: Evening resolution (dispatcher log)
Energizations resolve as a timestamped switching log — the game's most atmospheric screen:

```
18:41  CLOSE CB 4-12 .......... LINE 138-2 ENERGIZED
18:52  PICK UP BLOCK: MILLBROOK TOWN (35 MW)
18:52  ISLAND WEST: 90 MW GEN / 73 MW LOAD — TIGHT
19:15  MILLBROOK REPORTS STREETLIGHTS ON MAIN.
```

Stability rolls resolve, deadlines tick, fuel burns, fatigue accrues, autosave.

**Every 5 days: a major decision point.** Day 5 — the governor calls and wants a date. Day 10 — mutual aid arrives; the neighboring county begs for one of your crews. Day 15 — the mayor's ultimatum: Westbrook Heights or the Lakeview nursing homes. Day 20 — Eastlake offers the intertie, for a price. Day 25 — the freeze triage.

---

## Scripted arc and canon weather

The weather script is canon-locked to Get Home: **rain Day 2 (12:00-20:00), First Frost at dawn Day 4.** Then this game extends the record: a wind event around Day 9 (new damage rolls on energized rural lines), and the **hard freeze Days 16-19** — load +15%, exposure risk in unserved zones, warming-center pressure on the SHELTER zone, and Warrick's coal pile freezing if the plant isn't hot yet.

### Deadline clocks (visible from Day 1 where telemetry allows)

| Clock | Deadline | Miss consequence |
|---|---|---|
| Harlan General generator | 96h of diesel; each fuel run +48h | Patient evacuation event; lives cost; Trust -2 |
| Riverside Water | Day 3: boil order (Trust drift begins). Day 6: pressure loss | Fire-risk events; hospital multiplier |
| Eastbank Wastewater | Day 4: overflow into the Harlan River | Public-health event chain downstream; Trust drift |
| Signal Ridge Comms | 48h of battery | Forecast quality drops; -1 effective crew action/day |
| Cold storage | Day 5: regional food spoilage | FOOD tag lost for the run; Trust -1; feeds game-1-style scarcity flavor |
| Pipeline pack | Day 8: line pressure gone | Compressor restoration then needs +24h repack before the CCGT can start |

### Balance targets by band

- **Days 1-3:** The dark board. Telemetry recon, first cranking path from the dam, peaker battery repair. Tone: "we know the drill; we've never done it for real."
- **Days 4-8:** First islands. Frost arrives. Hospital and water clocks force the first triage. First broadcast promises come due. Tone: "the region is watching us now."
- **Days 9-14:** Mutual aid lands (if STAGING is live and Trust ≥ 4: +2 crews Day 8, up to +4 more by Day 14, scaling with Trust). Fuel crunch. Wind event re-damages lines you already fixed. Tone: "we're gaining — aren't we?"
- **Days 15-20:** The sync era. Two or three islands become one grid, the CCGT comes up in stages, the hard freeze hits at maximum vulnerability. Tone: "one mistake takes back everything."
- **Days 21-25:** Warrick's slow ramp, the intertie decision, industrial curtailment politics. Tone: "the end is visible and the margin is not."
- **Days 26-30:** The rural tail — long feeders, worst damage, fewest MW per crew-day, and the quiet knowledge of who's at the end of them. Tone: "finish it."

**A skilled player should reach the standard win on Normal about 60% of the time.** The S-tier ending about 10%. At least one island trip should occur in about half of all runs — the lesson has to land at least once.

---

## Characters — the ops room (6 voices, ~3,000 words)

No portraits; voices arrive as radio traffic, phone calls, and log annotations, 2-3 boxes max, understated.

| Character | Role | Voice |
|---|---|---|
| Vee | Veteran dispatcher, 30 years | Dry, unflappable; delivers jargon glosses in plain speech the first time each term appears ("Cranking path. We push a thread of power to a dead plant so it can wake itself up.") |
| Priya | Junior engineer | Runs the load forecasts; precise, anxious, right |
| Boone | Line foreman | The field's voice on the radio; will tell you no if you spend his crews carelessly, and mean it |
| Diane Okafor | County emergency manager | The deadline dashboard made human; your conduit to Trust |
| Corbin | Utility VP | Pressure for optics: visible wins, the mayor's district, a date for the press |
| Mayor Whitfield | Westbrook Heights | Political pressure with a radio show |

**Crew safety is sacred.** A fatigued crew forced onto night work can roll a mistake: usually botched switching (equipment damage), rarely an injury. A crew fatality is this game's child-death equivalent — Trust -3, all crews -1 effective for two days, a memorial line in the epilogue, and the S-tier ending permanently locked for the run. Boone's line, established early and meant: "No light is worth a lineman."

### Broadcasts — the game-1 bridge

The radio statements you issue are, canonically, the broadcasts the family hears in Grid Down. The full game reuses lines from Grid Down's actual radio event data where dates align. Honest broadcasts cost Trust today and pay it back; Reassuring broadcasts buy today at compound interest; Silence reads as abandonment after Day 5. The honesty index is tracked silently and surfaces in the epilogue.

### The cause

Never revealed. The rumor sub-deck offers three incompatible explanations (equipment cascade, solar weather, "somebody did this") and confirms none. Operators restore first and get root cause months later; the ambiguity is canon across all three games. Final-card line: "The cause report runs four hundred pages. Nobody on Maple Lane will ever read it."

---

## Event deck — 60 events minimum

| Category | Count | Examples |
|---|---|---|
| Weather | 8 | Ice on the 138 line, fog delays patrols, wind advisory, the freeze deepens |
| Equipment | 10 | Breaker won't close, relay misoperation, transformer bushing leak, the dam's #2 unit vibrates |
| Security | 8 | Copper theft at a dead sub, armed man refuses crews entry, substation fence cut, a guarded sub deters a strip attempt |
| Fuel & logistics | 6 | Convoy offer with strings, hospital fuel gauge dispute, a farm co-op offers off-road diesel |
| Political & media | 8 | Mayor's radio hour, a reporter at the gate, Corbin wants a photo op, the governor's aide calls twice |
| Crew & human | 8 | A lineman's own family is in a dark zone, fatigue argument, mutual aid crew needs housing, a retirement-age tech volunteers |
| Public health | 6 | Boil-order violations, carbon monoxide cluster (generators indoors), Lakeview's night nurse calls |
| Information & rumor | 6 | The cause rumors, ham radio traffic from Eastlake, misinformation spike that Trust must absorb |

Deck mechanics inherited from Grid Down verbatim: weighted by game state, drawn without replacement, bad-luck protection after 3 consecutive negatives, major events telegraphed 1-2 days ahead, state-aware gating (no theft events at secured subs; no freeze events before Day 14).

---

## Win / lose / scoring

### Endings (Day 30 unless noted)

- **Full Board (S):** ≥90% load served, all critical tags restored, zero crew fatalities, ≤1 island trip. The rare one.
- **Lights On (standard win):** ≥70% served, hospital and water restored. Roads reopen, the Guard arrives — this is the other side of Grid Down's "Rescued" ending.
- **Holding On:** 40-70%. The region limps into month two; the epilogue is honest about who's still dark.
- **Relieved (loss):** Trust hits 0, or <40% served at Day 30. Federal authorities assume control. The lights come back eventually — without you.
- **The Long Dark (loss, immediate):** all black-start-capable generation lost with the intertie unavailable. There is no path back onto the board.

### Legacy score
MW-days served, critical deadlines met, lives (hospital/Lakeview/freeze outcomes), crew safety record, equity index, honesty index, island trips, letter grade S/A/B/C/D/F — and one line of epilogue per named zone.

### The last card
When Rural Co-op East energizes, the log prints one extra line: `21:40  SOMEWHERE ON MAPLE LANE, A PORCH LIGHT COMES ON.` The ending card reads: **"Their 30 days are over. Play Grid Down."** — closing the loop Get Home opened.

### Replayability
Damage rolls, deck order, and event variants reseed per run. Three openings (chosen at start, stamped on the report): **By the Book** (baseline), **Short-Staffed** (3 crews, +1 starting Trust — the union sent who it could and the town knows it), **Ice Storm** (winter start: frost from Day 1, freeze Days 10-13, +15% load throughout — hard mode). Post-win toggle: **Zero Reserve** (TIGHT threshold moves to 1.10x, no bad-luck protection, report stamp) for the screenshot crowd.

---

## Writing standards

- **Dispatcher log voice:** timestamps, ALL-CAPS switching entries, lowercase human interjections. The contrast between `PICK UP BLOCK: GARFIELD (40 MW)` and "Boone says the crews cheered" is the game's whole tone.
- **Event text:** 2-4 sentences, understated, no exclamation marks. "The hospital's fuel gauge reads lower than the paperwork says" — not "FUEL EMERGENCY!"
- **Jargon with a handrail:** every term of art (cranking path, load block, reserve, sync) is used correctly and glossed once in plain speech by Vee, then trusted to stand.
- **Alarms are quiet:** an island going CRITICAL is a flicker on the board and one annunciator tone — not a klaxon. Understatement is the house style; the silence after a trip is the loudest thing in the game.
- **Zero tolerance:** no zombies, no supernatural, no terrorist-plot resolution, no Hollywood console sparks, no heroic-death spectacle, no magically fast repairs. Cause of the blackout is never confirmed.

---

## Presentation — the 1980s control room

The third retro register of the series: game 1 is an amber terminal, game 2 is a Game Boy, game 3 is a **phosphor-green vector board** — the SCADA mimic panel of a utility control room, WarGames big-board energy without the movie's bombast.

- **Palette (CSS variables):** background `#050807`; phosphor green `#33ff66` (live) / `#1a8040` (dim/de-energized trace) / `#0d2b18` (dead node outline); amber `#ffb000` reserved for alarms and TIGHT state; red `#e0301e` used **only** for trips and CRITICAL — rarity is what makes it land; off-white green `#d8ffe0` for text highlights.
- **Board rendering:** one canvas; nodes as one-line-diagram symbols (breaker squares, transformer circles, generator marks), lines as 2px vectors. Energized lines carry a slow marching-dot "flow" pulse. Dead board regions are outlines only. Fog: unrevealed nodes don't render at all — the map literally grows as telemetry returns.
- **CRT dressing (cheap, capped):** CSS scanline overlay at 4% opacity, subtle vignette, glow via pre-rendered blur sprites (no per-frame shadowBlur). No barrel distortion, no flicker shaders — performance and readability first.
- **The payoff loop:** when a zone energizes, its cluster of window-light pixels warms on over ~2 seconds with a soft mains-hum swell. This is the dopamine hit of the game — the inverse of Plague Inc's infection ping — and it must feel earned every single time.
- **Type:** system monospace stack with letter-spacing, matching game 1's terminal kinship. HUD text minimum 16px. No image assets anywhere; every symbol is canvas-drawn.

### Audio (WebAudio, zero asset files)

Synthesized, matching Get Home's approach: **the mains hum is the score** — a low 60 Hz-rooted drone whose volume scales with MW online. A trip cuts it to silence mid-note; that silence is the game's most important sound. SFX (~12): relay clunk (noise burst), annunciator tone, SCADA chirp, radio squelch, teletype tick for the log, sync-success chord, item/milestone sting, the hum swell, trip slam, freeze wind bed, morning-briefing sting, ending jingle. Master on/off only.

### Touch and layout

- Portrait-primary PWA (series consistency); landscape supported. Board pans/zooms via pointer events (drag + pinch), integer-scaled text.
- **Tap node → bottom sheet:** status, damage, required actions, assign-crew buttons. All commitment flows through an explicit **COMMIT DAY** button — turn-based, zero twitch, nothing irreversible from a stray tap.
- Crew roster as a persistent bottom-edge rail (portrait) or side rail (landscape); deadline dashboard one tap from anywhere; 44px minimum targets; safe-area respected.
- Desktop: mouse + keyboard (arrows pan, +/- zoom, number keys select crews, Enter commits).

---

## Technical requirements

### Stack (series pattern: no frameworks, no build, no external anything)

```
products/grid-down-black-start/
  index.html            shell, CSS, bottom sheets, bootstrap
  manifest.webmanifest  portrait-primary, standalone, theme #050807
  sw.js                 cache-first, versioned precache
  icons/                icon-192.png, icon-512.png
  src/main.js           boot, phase state machine (TITLE/BRIEF/EVENT/RESOLVE/BOARD/ENDING)
  src/board.js          canvas renderer: one-line diagram, fog, flow pulses, glow sprites
  src/sim.js            islands, reserve margin, stability rolls, sync, trips
  src/grid-data.js      nodes, lines, zones, generation fleet, damage bands
  src/crews.js          roster, actions, fatigue, mutual aid arrival logic
  src/clocks.js         deadlines, fuel pool, weather script, freeze
  src/trust.js          trust drift, equity + honesty indices, broadcasts
  src/events.js         deck engine (weights, protection, telegraphs)
  src/event-data.js     60+ events, major decisions, rumor chain
  src/dialog-data.js    ops-room voices, log flavor, endings
  src/audio.js          hum engine, synth SFX
  src/save.js           localStorage, autosave, export/import
  src/input.js          pointer pan/zoom, bottom sheets, keyboard
```

- **Save:** `gdbs_run_v1` + `gdbs_meta_v1`; autosave every phase transition; base64 export/import like game 1. Run state ~3KB (board bitsets, clocks, crew states, indices, seed).
- **Code budget (unminified):** board renderer 18KB, sim 16KB, crews/clocks/trust 14KB, event engine 6KB, grid data 14KB, event data 30KB, dialog/endings 22KB, audio 10KB, input/UI 16KB, save 5KB, shell/menus 12KB ≈ **~165KB** — comfortably inside the series' 200-300KB envelope.
- **Performance:** canvas redraws only on state change plus a 4-per-second pulse tick for flow dots; no continuous rAF burn on a static board; no per-frame glow computation.

---

## What is NOT in the MVP

- Real power-flow simulation (per-line MW, AC physics, frequency in hertz) — reserve margin IS the model
- Procedural or multiple maps (one authored region; scenarios are seeds + starts)
- Real utility names, real geography, real tariffs
- Individual lineman simulation (crews are units)
- Sandbox/endless mode
- Multiplayer, leaderboards, analytics
- Campaign meta-progression (design the report hook, implement later)
- Sound sliders (master toggle only)
- GBC-style art or sprite work — this is a vector board game

---

## Content inventory (what must be written/authored)

| Content type | Count | ~Words each | Total |
|---|---|---|---|
| Events (choices included) | 60 | 100 | 6,000 |
| Major decision points | 6 | 250 | 1,500 |
| Ops-room dialogue + jargon glosses | ~40 beats | 60 | 2,400 |
| Zone/node flavor + energization lines | 30 | 30 | 900 |
| Broadcast variants (3 stances x milestones) | 18 | 60 | 1,080 |
| Endings + epilogue lines per zone | 5 + 18 | — | 1,800 |
| Tutorial (Exercise scenario framing) | 1 | 600 | 600 |
| Rumor chain | 6 | 80 | 480 |
| **Total** | | | **~14,760** |

Board authoring: ~35 nodes + ~30 line segments with hand-placed coordinates, damage bands, and zone tables — days of work, not weeks.

**Solo timeline: 12-14 weeks.** Ship order: board renderer + fog → sim core (islands/reserve/trips) on a stub map → full grid data + crews/clocks → turn loop + events → trust/broadcasts/endings → audio → Exercise scenario → PWA polish.

---

## Cut order and post-MVP backlog

**If the schedule slips, cut in this order:** 1) Zero Reserve toggle; 2) Short-Staffed opening; 3) rumor chain (keep the ambiguity, lose the sub-deck); 4) wind event Day 9 (keep freeze); 5) equity index surfacing in epilogue (keep the tracking). **Never cut:** island trips, the fuel clocks, the sync mechanic, the freeze, the broadcast system, the Maple Lane log line.

**Post-MVP backlog:** Ice Storm as a full winter campaign; a "GridEx" weekly-seed challenge mode; GBC-palette board skin as a series in-joke; and the game-4 seed already on file — Get Home's archived "First Frost" town-hub concept, which remains the natural adventure-format entry if the series continues.

---

## Launch notes

1. itch.io page as "In development" immediately; devlogs bi-weekly — the dark-board-lighting-up GIF is the single strongest asset the series has produced; lead every post with it
2. **The demo is the Exercise scenario:** a 10-day tabletop drill (the annual black start exercise HVP&L runs every fall — authentic framing), fully playable, ending on a card: "In the full game, it isn't a drill."
3. Free demo + PWYW full ($5/$8), matching series pricing; "Same Tuesday Trilogy" bundle across all three games
4. Cross-promo: Grid Down and Get Home each get an end-card line pointing here; Black Start's ending card points back to Grid Down
5. Communities: r/preppers (established presence), r/basegame + itch strategy tags; **write one technical devlog specifically for Hacker News** ("I made a game about black-starting a power grid") — this game's audience overlap with HN is the series' best organic-reach shot
6. PWABuilder wrap for Google Play as phase 2 after web validation, same as Get Home

---

## Appendix: canon ledger (the Same Tuesday)

| Fact | Source | Black Start treatment |
|---|---|---|
| Grid fails 4:17 PM Tuesday | Get Home §13 | The scripted cold open, same timestamp on the wall clock |
| "Breakers are fine. There's just nothing coming in." | Dale, Get Home §10 | True: distribution held; transmission collapsed upstream. Dale's building is in Downtown Harlan City (zone 2) |
| Rain Day 2 12:00-20:00; First Frost dawn Day 4 | Get Home §5 | Weather script identical, then extended through Day 30 |
| Harlan River, Millbrook, Cedar Run, Maple Lane | Get Home §7 | Same geography at utility scale; Harlan Falls Dam sits on the same river the toll bridge crosses |
| Radio broadcasts with conflicting information | Grid Down events | Authored by this game's player; full game reuses game-1 radio lines where dates align |
| Day 30: roads reopen, National Guard arrives | Grid Down win condition | The "Lights On" ending is that event, seen from the other side |
| Rescue reaches the rural edge last | Grid Down premise | Rural Co-op East is mechanically the least efficient restoration target — the family waits 30 days because the math says so |
| Cause never confirmed | All three games | Preserved; rumor chain confirms nothing |

**Scale ladder:** Get Home = one person, five days, 47 screens. Grid Down = one family, 30 days, one house. Black Start = one region, the same 30 days, ~480 MW. Three games, one Tuesday.
