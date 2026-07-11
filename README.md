# Grid Down: Black Start

A turn-based grid-restoration strategy game for the browser. Part three of the
Same Tuesday trilogy: [Grid Down](../grid-down-game) (one family, 30 days) and
[Grid Down: Get Home](../grid-down-get-home) (one person, one day) — and now
one region, the same 30 days, seen from the control room.

**It is 4:17 PM on a Tuesday when the grid fails — and you are the senior
system operator on shift.**

Perform a real black start: restart a dead regional grid from a single hydro
dam. Energize cranking paths, build fragile islands of light, and synchronize
them into a grid — while hospitals burn through generator diesel, water plants
count down to failure, crews fatigue, copper thieves strip dead substations,
and politicians demand their districts first. Reverse Plague Inc: the map
starts dark, and you fight to light it.

**Greed trips the grid.** Pick up more load than your reserve can hold and the
island collapses — and you gave a town the light and took it away, the one
thing the public never forgives.

## Features

- 1980s control-room presentation: phosphor-green vector board, CRT scanlines,
  a synthesized mains hum that scales with megawatts online — and cuts to
  silence when an island trips
- Real restoration vocabulary, gently taught: cranking paths, load blocks,
  reserve margin, synchronization, mutual aid
- 30-day turn loop: morning briefing → crew assignments and load pickup plan →
  field events → evening dispatcher log
- 60-event deck plus five major decision points (the governor wants a date,
  the mayor wants his district, Eastlake wants paying)
- Radio broadcasts you author — honest, reassuring, or silent — with trust
  mechanics that remember
- Silently tracked equity, honesty, and crew safety; they surface in the
  epilogue
- Three openings (By the Book / Short-Staffed / Ice Storm) plus a 10-day
  Exercise mode that doubles as the tutorial and demo
- Works offline, installs as an app (PWA). No ads, no tracking, no server.

## Play

Serve the folder with any static file server and open it in a browser:

```sh
npx serve .
# or
python -m http.server 8080
```

On a phone: open the hosted URL, then "Add to Home Screen" to install.

## Tech

Plain HTML5 canvas + vanilla JavaScript ES modules. No frameworks, no build
step, no external assets — the board, icons, and every sound are generated in
code. ~170KB unminified.

| Path | What |
|---|---|
| `index.html` | shell, CSS, overlays |
| `src/main.js` | phase machine, briefing UI, dispatcher log |
| `src/board.js` | canvas one-line diagram, fog, flow pulses |
| `src/sim.js` | islands, reserve margin, trips, synchronization |
| `src/grid-data.js` | the Harlan Valley: 12 substations, 18 zones, 5 units |
| `src/crews.js` | job board, task resolution, fatigue, mutual aid |
| `src/clocks.js` | deadline clocks, weather script, fuel, security |
| `src/trust.js` | public trust, broadcasts, promises, equity |
| `src/events.js` + `src/event-data.js` | weighted deck, 60 events, 5 majors |
| `src/dialog-data.js` | cold open, glosses, endings, epilogues |
| `src/audio.js` | hum engine + synthesized SFX |
| `tools/` | icon generator |

## License

(c) NyxTools. All rights reserved.
