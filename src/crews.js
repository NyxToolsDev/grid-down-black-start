// Crew roster, the morning job board, and evening task resolution.

import { SUBS, LINES, ZONES, UNITS, FUEL } from './grid-data.js';
import { energizeTargets, energizeSub, syncCandidates, islandsOf, islandOfSub,
  tripIsland, zoneServed, rng } from './sim.js';

export const activeCrews = (state) =>
  state.crews.filter((c) => c.outDays === 0);

const adjacentToRevealed = (state, subId) =>
  LINES.some((l) => (l.a === subId || l.b === subId) &&
    (state.subs[l.a].revealed || state.subs[l.b].revealed));

export const availableJobs = (state) => {
  const jobs = [];

  for (const [subId, s] of Object.entries(state.subs)) {
    if (!s.revealed && adjacentToRevealed(state, subId)) {
      jobs.push({ id: `patrol:${subId}`, kind: 'patrol', need: 'any',
        target: subId, label: `PATROL ${SUBS[subId].name} AREA`, days: 1 });
    }
  }

  for (const [lid, l] of Object.entries(state.lines)) {
    if (l.revealed && l.dmg > 0) {
      jobs.push({ id: `repline:${lid}`, kind: 'repair', need: 'line',
        target: lid, label: `REPAIR LINE ${lid}`, days: l.dmg });
    }
  }
  for (const [subId, s] of Object.entries(state.subs)) {
    if (s.revealed && s.dmg > 0) {
      jobs.push({ id: `repsub:${subId}`, kind: 'repair', need: 'line',
        target: subId, label: `REPAIR ${SUBS[subId].name}`, days: s.dmg });
    }
    if (s.revealed && s.transformer === 'destroyed' && state.spares > 0) {
      jobs.push({ id: `spare:${subId}`, kind: 'spare', need: 'line',
        target: subId, label: `SET SPARE XFMR — ${SUBS[subId].name}`, days: 1 });
    }
    if (s.revealed && !s.energized && s.secured === 0 && s.dmg === 0 &&
        s.transformer === 'ok') {
      jobs.push({ id: `secure:${subId}`, kind: 'secure', need: 'line',
        target: subId, label: `SECURE ${SUBS[subId].name}`, days: 1 });
    }
  }

  for (const [zid, z] of Object.entries(state.zones)) {
    if (z.revealed && z.dmg > 0) {
      jobs.push({ id: `repfeed:${zid}`, kind: 'repair', need: 'line',
        target: zid, label: `REPAIR FEEDER — ${ZONES[zid].name}`, days: z.dmg });
    }
  }

  for (const t of energizeTargets(state)) {
    jobs.push({ id: `energize:${t.sub}:${t.via}`, kind: 'energize', need: 'tech',
      target: t.sub, via: t.via,
      label: `ENERGIZE ${SUBS[t.sub].name} (VIA ${t.via})`, days: 1 });
  }
  for (const lid of syncCandidates(state)) {
    jobs.push({ id: `sync:${lid}`, kind: 'sync', need: 'tech', target: lid,
      label: `SYNCHRONIZE ISLANDS AT ${lid}`, days: 1 });
  }

  const u = state.units;
  if (state.subs.S11.revealed && !u.peakers.battery) {
    jobs.push({ id: 'battery', kind: 'battery', need: 'tech', target: 'S11',
      label: 'REPAIR PEAKER START BATTERIES', days: 1 });
  }
  if (u.peakers.battery && !u.peakers.on && state.subs.S11.dmg === 0 &&
      state.subs.S11.revealed) {
    jobs.push({ id: 'blackstart', kind: 'blackstart', need: 'tech', target: 'S11',
      label: 'BLACK-START CEDAR RUN PEAKERS', days: 1 });
  }
  if (state.subs.S5.energized && !u.ccgt.staffed) {
    jobs.push({ id: 'staff:ccgt', kind: 'staff', need: 'any', target: 'ccgt',
      label: 'STAFF MILLBROOK ENERGY CTR', days: 1 });
  }
  if (state.subs.S4.energized && !u.coal.staffed) {
    jobs.push({ id: 'staff:coal', kind: 'staff', need: 'any', target: 'coal',
      label: 'STAFF WARRICK STATION', days: 1 });
  }
  if (u.tie.deal && !u.tie.gear && state.subs.S10.revealed &&
      state.subs.S10.dmg === 0) {
    jobs.push({ id: 'tiegear', kind: 'tiegear', need: 'tech', target: 'S10',
      label: 'COMMISSION EASTLAKE SYNC GEAR', days: 1 });
  }
  if (!state.clocks.hospitalOk && !state.clocks.hospitalEvac &&
      state.fuel >= FUEL.hospitalRunCost) {
    jobs.push({ id: 'fuelrun', kind: 'fuelrun', need: 'any', target: 'Z1',
      label: `FUEL RUN — HARLAN GENERAL (+${FUEL.hospitalRunHours}H)`, days: 1 });
  }

  return jobs;
};

const mkTime = (i) => {
  const mins = 17 * 60 + 30 + i * 7;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// assignments: [{ job, crewId, night }]
export const resolveAssignments = (state, assignments, weather, log) => {
  let t = 0;
  const stamp = () => mkTime(t++);

  for (const asg of assignments) {
    const crew = state.crews.find((c) => c.id === asg.crewId);
    if (!crew || crew.outDays > 0) continue;
    const job = asg.job;

    if (state.fuel < FUEL.perCrewTask) {
      log.push(`${stamp()}  ${crew.id} STOOD DOWN — NO VEHICLE FUEL.`);
      continue;
    }
    state.fuel -= FUEL.perCrewTask;

    const outdoor = ['patrol', 'repair', 'secure', 'spare'].includes(job.kind);
    if (weather.rain && outdoor && crew.kind === 'line' && rng(state) < 0.25) {
      log.push(`${stamp()}  ${crew.id} WASHED OUT AT ${job.label} — NO PROGRESS.`);
      crew.fatigue = Math.min(10, crew.fatigue + 1);
      continue;
    }

    const preFatigue = crew.fatigue;
    crew.fatigue = Math.min(10, crew.fatigue + (asg.night ? 3 : 1));
    const mistakeChance = preFatigue >= 8 ? (asg.night ? 0.35 : 0.25) : 0;
    const mistake = mistakeChance > 0 && rng(state) < mistakeChance;

    if (mistake) {
      applyMistake(state, crew, job, asg.night, weather, log, stamp);
      continue;
    }
    applyJob(state, crew, job, log, stamp);
  }
};

const applyMistake = (state, crew, job, night, weather, log, stamp) => {
  if (night && (weather.freeze || weather.wind) && rng(state) < 0.03) {
    state.score.fatality = true;
    state.trust = Math.max(0, state.trust - 3);
    state.crews = state.crews.filter((c) => c.id !== crew.id);
    log.push(`${stamp()}  RADIO TRAFFIC STOPS.`);
    log.push(`       ${crew.id} — LINE CONTACT DURING NIGHT WORK. FATALITY.`);
    log.push(`       boone, after a long time: "i told you. i told you."`);
    return;
  }
  if (job.kind === 'energize' || job.kind === 'sync') {
    const subId = job.kind === 'energize' ? job.target
      : LINES.find((l) => l.id === job.target).a;
    if (rng(state) < 0.2 && state.subs[subId].transformer === 'ok') {
      state.subs[subId].transformer = 'destroyed';
      state.subs[subId].energized = false;
      log.push(`${stamp()}  SWITCHING ERROR AT ${SUBS[subId].name}. ` +
        'TRANSFORMER DAMAGE — UNIT IS GONE.');
    } else {
      state.subs[subId].dmg += 1;
      log.push(`${stamp()}  SWITCHING ERROR AT ${SUBS[subId].name}. ` +
        'EQUIPMENT DAMAGE. RE-INSPECTION REQUIRED.');
    }
  } else if (rng(state) < 0.15) {
    crew.outDays = 3;
    state.score.injuries += 1;
    state.trust = Math.max(0, state.trust - 1);
    log.push(`${stamp()}  ${crew.id} INJURY ON THE JOB — OUT 3 DAYS. ` +
      'exhaustion. boone warned us.');
  } else {
    log.push(`${stamp()}  ${crew.id} FUMBLED ${job.label} — NO PROGRESS. ` +
      'they need rest.');
  }
};

const applyJob = (state, crew, job, log, stamp) => {
  switch (job.kind) {
    case 'patrol': {
      const subId = job.target;
      state.subs[subId].revealed = true;
      for (const l of LINES) {
        if (l.a === subId || l.b === subId) state.lines[l.id].revealed = true;
      }
      for (const [zid, z] of Object.entries(ZONES)) {
        if (z.sub === subId) state.zones[zid].revealed = true;
      }
      log.push(`${stamp()}  ${crew.id} PATROL COMPLETE — ${SUBS[subId].name} ` +
        'AREA MAPPED. DAMAGE ASSESSED.');
      break;
    }
    case 'repair': {
      const store = job.id.startsWith('repline') ? state.lines
        : job.id.startsWith('repsub') ? state.subs : state.zones;
      const el = store[job.target];
      if (el.dmg === 0) {
        log.push(`${stamp()}  ${crew.id} ARRIVED AT ${job.label.replace('REPAIR ', '')} — ` +
          'ALREADY IN SERVICE CONDITION. CREW-DAY LOST.');
        break;
      }
      el.dmg = Math.max(0, el.dmg - 1);
      log.push(`${stamp()}  ${crew.id} REPAIR — ${job.label.replace('REPAIR ', '')}` +
        (el.dmg === 0 ? ' RESTORED TO SERVICE CONDITION.' : ` — ${el.dmg}D REMAINING.`));
      break;
    }
    case 'spare':
      state.spares -= 1;
      state.subs[job.target].transformer = 'ok';
      log.push(`${stamp()}  SPARE TRANSFORMER SET AT ${SUBS[job.target].name}. ` +
        `${state.spares} SPARE${state.spares === 1 ? '' : 'S'} LEFT IN THE REGION.`);
      break;
    case 'secure':
      state.subs[job.target].secured = 3;
      log.push(`${stamp()}  ${crew.id} POSTED AT ${SUBS[job.target].name} — ` +
        'SITE SECURED 3 DAYS.');
      break;
    case 'energize':
      energizeSub(state, job.target, job.via);
      log.push(`${stamp()}  CLOSE CB ${job.via} .......... ` +
        `${SUBS[job.target].name} ENERGIZED.`);
      break;
    case 'sync': {
      const line = job.target;
      const [a] = [LINES.find((l) => l.id === line)].map((l) => l.a);
      const islands = islandsOf(state);
      const islA = islands.find((i) => i.subs.includes(a));
      const other = islands.find((i) => i !== islA &&
        (i.subs.includes(LINES.find((l) => l.id === line).b) ||
         i.subs.includes(LINES.find((l) => l.id === line).a)));
      const bothSolid = islA && other &&
        islA.status === 'SOLID' && other.status === 'SOLID';
      const base = state.flags.noTestSet ? 0.8 : 0.9;
      const ok = rng(state) < (bothSolid ? base : 0.5);
      if (ok) {
        state.lines[line].closed = true;
        log.push(`${stamp()}  SYNC AT ${line} .......... BREAKER CLOSED.`);
        log.push('       ISLANDS PARALLELED. ONE GRID.');
        if (!state.flags.firstSync) {
          state.flags.firstSync = true;
          state.trust = Math.min(10, state.trust + 1);
        }
      } else {
        const smaller = [islA, other].filter(Boolean)
          .sort((x, y) => x.gen - y.gen)[0];
        log.push(`${stamp()}  SYNC AT ${line} FAILED — PHASE ANGLE. `);
        if (smaller) tripIsland(state, smaller, log, 'FAILED SYNCHRONIZATION');
      }
      break;
    }
    case 'battery':
      state.units.peakers.battery = true;
      log.push(`${stamp()}  PEAKER START BATTERIES REPLACED. ` +
        'BLACK-START CAPABILITY RESTORED.');
      break;
    case 'blackstart':
      state.units.peakers.on = true;
      state.subs.S11.energized = true;
      log.push(`${stamp()}  CEDAR RUN GT-1 ROLLS .......... S11 BUS LIVE.`);
      log.push('       EAST ISLAND ESTABLISHED. 50 MW.');
      break;
    case 'staff':
      state.units[job.target].staffed = true;
      log.push(`${stamp()}  ${UNITS[job.target].name} STAFFED FOR RESTART.`);
      break;
    case 'tiegear':
      state.units.tie.gear = true;
      log.push(`${stamp()}  EASTLAKE SYNC GEAR COMMISSIONED AT RIVER CROSSING.`);
      break;
    case 'fuelrun':
      state.fuel -= FUEL.hospitalRunCost;
      state.clocks.hospitalH = Math.min(96,
        state.clocks.hospitalH + FUEL.hospitalRunHours);
      log.push(`${stamp()}  FUEL CONVOY TO HARLAN GENERAL — ` +
        `GENERATOR GOOD FOR ${state.clocks.hospitalH}H.`);
      break;
  }
};

// Unassigned crews rest. Mutual aid arrives in waves, gated by staging + trust.
export const endOfDayCrews = (state, assignedIds, log) => {
  for (const crew of state.crews) {
    if (crew.outDays > 0) {
      crew.outDays -= 1;
      if (crew.outDays === 0) log.push(`       ${crew.id} CLEARED TO RETURN.`);
      continue;
    }
    if (!assignedIds.has(crew.id)) {
      crew.fatigue = Math.max(0, crew.fatigue - 2);
    }
  }

  const aid = (wave, ids, need) => {
    if (state.flags[wave] || state.day < need.day) return;
    if (need.staging && !zoneServed(state, 'Z13')) return;
    if (state.trust < need.trust) return;
    state.flags[wave] = true;
    for (const id of ids) {
      state.crews.push({ id, kind: 'line', fatigue: 0, outDays: 0, mutual: true });
    }
    log.push(`       MUTUAL AID: ${ids.join(', ')} ROLL IN. ` +
      'out-of-state plates. boone shakes every hand.');
  };
  aid('aid1', ['M1', 'M2'], { day: 8, trust: 4, staging: true });
  aid('aid2', ['M3', 'M4'], { day: 12, trust: 5, staging: false });
  aid('aid3', ['M5', 'M6'], { day: 14, trust: 4, staging: false });
};
