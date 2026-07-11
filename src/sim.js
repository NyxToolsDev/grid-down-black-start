// Simulation core: state, islands, reserve margin, energization, sync, trips.

import {
  SUBS, LINES, ZONES, UNITS, STABILITY, TRIP_CHANCE, FUEL,
  START_REVEALED, OPENINGS, NORMAL_LOAD,
} from './grid-data.js';

export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashSeed = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const rollBand = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

export const newState = (seedStr, openingKey = 'book', exercise = false) => {
  const seed = hashSeed(seedStr);
  const rng = mulberry32(seed);
  const opening = OPENINGS[openingKey];

  const subs = {};
  for (const [id, s] of Object.entries(SUBS)) {
    subs[id] = {
      dmg: rollBand(rng, s.dmg), revealed: START_REVEALED.subs.includes(id),
      energized: false, secured: 0, transformer: 'ok',
    };
  }
  const lines = {};
  for (const l of LINES) {
    lines[l.id] = {
      dmg: rollBand(rng, l.dmg), revealed: START_REVEALED.lines.includes(l.id),
      closed: false,
    };
  }
  const zones = {};
  for (const [id, z] of Object.entries(ZONES)) {
    zones[id] = {
      dmg: rollBand(rng, z.dmg), revealed: false, picked: 0, servedDay: 0,
    };
  }

  // The dam rode through on house units. Day 1 begins with one live bus.
  subs.S1.energized = true;
  subs.S1.dmg = 0;

  const crews = [];
  for (let i = 1; i <= opening.crews; i++) {
    crews.push({ id: `L${i}`, kind: 'line', fatigue: 2, outDays: 0, mutual: false });
  }
  for (let i = 1; i <= opening.techs; i++) {
    crews.push({ id: `T${i}`, kind: 'tech', fatigue: 2, outDays: 0, mutual: false });
  }

  return {
    v: 1, seed, rngState: seed ^ 0x9E3779B9, opening: openingKey, exercise,
    day: 1, phase: 'brief',
    fuel: FUEL.start, spares: 2, trust: opening.trust,
    crews,
    subs, lines, zones,
    units: {
      dam:     { on: true },
      peakers: { on: false, battery: false },
      ccgt:    { on: false, stage: 0, staffed: false, startDay: 0 },
      coal:    { on: false, stage: 0, staffed: false, startDay: 0 },
      tie:     { on: false, gear: false, deal: false },
    },
    clocks: {
      hospitalH: 96, hospitalOk: false, hospitalEvac: false,
      waterOk: false, boilOrder: false, pressureLoss: false,
      sewageOk: false, overflow: false,
      commsH: 48, commsOk: false, commsDark: false,
      coldOk: false, spoiled: false,
      gasReadyDay: 0,
    },
    flags: {},
    score: {
      mwDays: 0, lives: 100, trips: 0, sheds: 0, fatality: false, injuries: 0,
      equityDebt: 0, honesty: 0, promisesMissed: 0, aided: false,
    },
    deck: [], discard: [], negStreak: 0, rumorIdx: 0,
    promise: null,      // { pct, byDay }
    trustEcho: 0,       // honest-broadcast payback days remaining
    dayLog: [],         // last resolution log, for the morning recap
    glossed: {},        // jargon terms already explained by Vee
  };
};

export const rng = (state) => {
  const r = mulberry32(state.rngState);
  const v = r();
  state.rngState = (state.rngState + 0x9E3779B9) >>> 0;
  return v;
};

// ---- readiness & generation -------------------------------------------------

export const unitReady = (state, id) => {
  const u = state.units[id];
  const host = state.subs[UNITS[id].sub];
  if (!host.energized) return false;
  if (id === 'dam') {
    return u.on && !(state.flags.damOffUntil && state.day <= state.flags.damOffUntil);
  }
  if (id === 'peakers') return u.on;
  if (id === 'ccgt' || id === 'coal') return u.on && u.stage > 0;
  if (id === 'tie') return u.on && u.deal && u.gear;
  return false;
};

export const unitMW = (state, id) => {
  if (!unitReady(state, id)) return 0;
  if (id === 'ccgt' || id === 'coal') return state.units[id].stage;
  return UNITS[id].mw;
};

export const gasReady = (state) =>
  state.clocks.gasReadyDay > 0 && state.day >= state.clocks.gasReadyDay;

// ---- load -------------------------------------------------------------------

export const loadMult = (state) => {
  const o = OPENINGS[state.opening];
  const [f0, f1] = o.freeze;
  const freezing = state.day >= f0 && state.day <= f1;
  return o.loadMult * (freezing ? 1.15 : 1.0);
};

export const zonePickedMW = (state, zid) => {
  const z = ZONES[zid];
  const st = state.zones[zid];
  if (!state.subs[z.sub].energized) return 0;
  let mw = 0;
  for (let i = 0; i < st.picked; i++) mw += z.blocks[i];
  return mw * loadMult(state);
};

export const zoneServed = (state, zid) =>
  state.zones[zid].picked >= ZONES[zid].blocks.length &&
  state.subs[ZONES[zid].sub].energized;

export const servedMW = (state) =>
  Object.keys(ZONES).reduce((sum, zid) => sum + zonePickedMW(state, zid), 0);

export const servedPct = (state) =>
  Math.round((servedMW(state) / (NORMAL_LOAD * loadMult(state))) * 100);

// ---- islands ----------------------------------------------------------------

const neighborsVia = (state, subId, predicate) => {
  const out = [];
  for (const l of LINES) {
    if (l.a !== subId && l.b !== subId) continue;
    const st = state.lines[l.id];
    if (!predicate(st)) continue;
    out.push({ other: l.a === subId ? l.b : l.a, line: l.id });
  }
  return out;
};

export const islandsOf = (state) => {
  const seen = new Set();
  const islands = [];
  for (const subId of Object.keys(SUBS)) {
    if (seen.has(subId) || !state.subs[subId].energized) continue;
    const comp = [];
    const queue = [subId];
    seen.add(subId);
    while (queue.length) {
      const cur = queue.pop();
      comp.push(cur);
      for (const { other } of neighborsVia(state, cur,
        (st) => st.closed && st.dmg === 0)) {
        if (!seen.has(other) && state.subs[other].energized) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    const units = Object.keys(UNITS).filter(
      (uid) => comp.includes(UNITS[uid].sub) && unitReady(state, uid));
    const gen = units.reduce((s, uid) => s + unitMW(state, uid), 0);
    const load = Object.keys(ZONES)
      .filter((zid) => comp.includes(ZONES[zid].sub))
      .reduce((s, zid) => s + zonePickedMW(state, zid), 0);
    islands.push({ subs: comp, units, gen, load, ...stability(gen, load) });
  }
  return islands;
};

export const stability = (gen, load) => {
  if (load <= 0) return { ratio: Infinity, status: 'SOLID' };
  const ratio = gen / load;
  if (ratio >= STABILITY.SOLID) return { ratio, status: 'SOLID' };
  if (ratio >= STABILITY.TIGHT) return { ratio, status: 'TIGHT' };
  return { ratio, status: 'CRITICAL' };
};

export const islandOfSub = (state, subId) =>
  islandsOf(state).find((i) => i.subs.includes(subId)) || null;

// ---- switching --------------------------------------------------------------

export const energizeTargets = (state) => {
  const out = [];
  for (const [subId, st] of Object.entries(state.subs)) {
    if (st.energized || !st.revealed || st.dmg > 0 || st.transformer !== 'ok') continue;
    for (const { other, line } of neighborsVia(state, subId,
      (ls) => ls.dmg === 0)) {
      if (state.subs[other].energized && state.lines[line].revealed) {
        out.push({ sub: subId, via: line });
        break;
      }
    }
  }
  return out;
};

export const energizeSub = (state, subId, viaLine) => {
  state.subs[subId].energized = true;
  state.lines[viaLine].closed = true;
};

export const syncCandidates = (state) => {
  const islands = islandsOf(state);
  const islandIdx = {};
  islands.forEach((isl, i) => isl.subs.forEach((s) => { islandIdx[s] = i; }));
  return LINES.filter((l) => {
    const st = state.lines[l.id];
    return st.revealed && st.dmg === 0 && !st.closed &&
      state.subs[l.a].energized && state.subs[l.b].energized &&
      islandIdx[l.a] !== islandIdx[l.b];
  }).map((l) => l.id);
};

// ---- trips ------------------------------------------------------------------

export const tripIsland = (state, island, log, cause) => {
  state.score.trips += 1;
  for (const subId of island.subs) {
    state.subs[subId].energized = false;
    for (const { line } of neighborsVia(state, subId, () => true)) {
      state.lines[line].closed = false;
    }
  }
  for (const zid of Object.keys(ZONES)) {
    if (island.subs.includes(ZONES[zid].sub)) state.zones[zid].picked = 0;
  }
  for (const uid of ['ccgt', 'coal']) {
    if (island.subs.includes(UNITS[uid].sub)) {
      const u = state.units[uid];
      if (u.on) log.push(`**** ${UNITS[uid].name} TRIPS OFFLINE`);
      u.on = false; u.stage = 0; u.staffed = false;
    }
  }
  state.trust = Math.max(0, state.trust - 2);
  log.push(`**** ISLAND TRIP${cause ? ` — ${cause}` : ''}. ` +
    `${island.subs.length} STATIONS DARK. ${Math.round(island.load)} MW LOST.`);
  log.push(`     the room is very quiet.`);
};

// Black-start units re-light their own bus at dawn after a trip.
export const dawnRestarts = (state, log) => {
  if (state.units.dam.on && !state.subs.S1.energized) {
    state.subs.S1.energized = true;
    log.push('06:0' + Math.floor(rng(state) * 9) +
      '  HARLAN FALLS BACK ON HOUSE UNITS. S1 BUS LIVE.');
  }
  if (state.units.peakers.on && !state.subs.S11.energized) {
    state.subs.S11.energized = true;
    log.push('06:1' + Math.floor(rng(state) * 9) +
      '  CEDAR RUN PEAKERS BLACK-START. S11 BUS LIVE.');
  }
};

// After damage to in-service lines: orphan any energized sub with no path to a
// ready unit through closed, undamaged lines.
export const validateConnectivity = (state, log) => {
  const sources = Object.keys(UNITS)
    .filter((uid) => unitReady(state, uid))
    .map((uid) => UNITS[uid].sub)
    .filter((s) => state.subs[s].energized);
  const reachable = new Set(sources);
  const queue = [...sources];
  while (queue.length) {
    const cur = queue.pop();
    for (const { other } of neighborsVia(state, cur,
      (st) => st.closed && st.dmg === 0)) {
      if (!reachable.has(other) && state.subs[other].energized) {
        reachable.add(other);
        queue.push(other);
      }
    }
  }
  for (const subId of Object.keys(SUBS)) {
    if (state.subs[subId].energized && !reachable.has(subId)) {
      state.subs[subId].energized = false;
      for (const { line } of neighborsVia(state, subId, () => true)) {
        state.lines[line].closed = false;
      }
      let shed = 0;
      for (const zid of Object.keys(ZONES)) {
        if (ZONES[zid].sub === subId && state.zones[zid].picked > 0) {
          shed += zonePickedMW(state, zid);
          state.zones[zid].picked = 0;
        }
      }
      state.trust = Math.max(0, state.trust - 1);
      log.push(`**** ${SUBS[subId].name} SEPARATED FROM GRID — ` +
        `${Math.round(shed)} MW DROPPED.`);
    }
  }
};

// ---- generation staging (runs each evening) ----------------------------------

export const generationStep = (state, log) => {
  const u = state.units;

  if (u.ccgt.staffed && !u.ccgt.on && state.subs.S5.energized && gasReady(state)) {
    u.ccgt.on = true; u.ccgt.startDay = state.day;
    log.push('20:05  MILLBROOK ENERGY CENTER START SEQUENCE INITIATED.');
  }
  if (u.ccgt.on) {
    const stageIdx = Math.min(2, state.day - u.ccgt.startDay);
    const next = UNITS.ccgt.stages[stageIdx];
    if (next && next !== u.ccgt.stage) {
      u.ccgt.stage = next;
      log.push(`20:30  MILLBROOK AT ${next} MW.`);
    }
  }

  if (u.coal.staffed && !u.coal.on && state.subs.S4.energized) {
    u.coal.on = true; u.coal.startDay = state.day;
    log.push('20:40  WARRICK STATION LIGHT-OFF. FIRST MW IN THREE DAYS.');
  }
  if (u.coal.on && !state.flags.coalFrozen) {
    const daysIn = state.day - u.coal.startDay;
    const stageIdx = daysIn - UNITS.coal.stageDelay - 1;
    const next = UNITS.coal.stages[Math.min(2, Math.max(-1, stageIdx))];
    if (stageIdx >= 0 && next && next !== u.coal.stage) {
      u.coal.stage = next;
      log.push(`20:45  WARRICK AT ${next} MW.`);
    }
  }

  if (u.tie.deal && u.tie.gear && !u.tie.on && state.subs.S10.energized) {
    u.tie.on = true;
    log.push('21:00  EASTLAKE INTERTIE CLOSED. 100 MW IMPORT AVAILABLE.');
  }
};

// ---- evening stability rolls --------------------------------------------------

export const stabilityResolve = (state, log) => {
  for (const island of islandsOf(state)) {
    if (island.load <= 0) continue;
    if (island.gen <= 0) {
      tripIsland(state, island, log, 'NO GENERATION');
      continue;
    }
    const chance = island.status === 'CRITICAL' ? TRIP_CHANCE.CRITICAL
      : island.status === 'TIGHT' ? TRIP_CHANCE.TIGHT : 0;
    if (chance > 0 && rng(state) < chance) {
      tripIsland(state, island, log,
        island.status === 'CRITICAL' ? 'RESERVE EXHAUSTED' : 'FREQUENCY EXCURSION');
    } else if (island.status !== 'SOLID') {
      log.push(`22:00  ISLAND HOLDS AT ${island.status} — ` +
        `${Math.round(island.gen)} MW GEN / ${Math.round(island.load)} MW LOAD.`);
    }
  }
};
