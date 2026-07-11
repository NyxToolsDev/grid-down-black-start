// Deadline clocks, weather script, fuel pool, freeze exposure.

import { OPENINGS, FUEL, ZONES, SUBS, LINES } from './grid-data.js';
import { zoneServed, rng, validateConnectivity } from './sim.js';

export const weatherFor = (state) => {
  const o = OPENINGS[state.opening];
  const d = state.day;
  const [f0, f1] = o.freeze;
  const w = { label: 'CLEAR, CALM', rain: false, wind: false, freeze: false, frost: false };
  if (state.opening === 'ice' || d >= 4) w.frost = true;
  if (d === 2) { w.rain = true; w.label = 'RAIN 12:00-20:00 — CREW WASHOUT RISK'; }
  else if (d === 9) { w.wind = true; w.label = 'WIND ADVISORY — LINE DAMAGE RISK'; }
  else if (d >= f0 && d <= f1) {
    w.freeze = true;
    w.label = `HARD FREEZE DAY ${d - f0 + 1}/${f1 - f0 + 1} — ALL LOADS +15%`;
  }
  else if (d === f0 - 1) w.label = 'FRONT APPROACHING — HARD FREEZE TOMORROW';
  else if (d === 4) w.label = 'FIRST FROST ON THE GRASS';
  else if (w.frost) w.label = 'CLEAR, COLD';
  return w;
};

export const applyWindDamage = (state, log) => {
  const candidates = Object.entries(state.lines)
    .filter(([id, l]) => l.dmg === 0 &&
      (state.subs[LINES.find((x) => x.id === id).a].revealed ||
       state.subs[LINES.find((x) => x.id === id).b].revealed));
  let hits = 0;
  for (const [id, l] of candidates) {
    if (hits >= 2) break;
    if (rng(state) < 0.25) {
      l.dmg += 1;
      hits += 1;
      log.push(`**** WIND TAKES LINE ${id} — CONDUCTOR DOWN.`);
    }
  }
  if (hits > 0) validateConnectivity(state, log);
  else log.push('       the wind howls all day. the lines hold.');
};

export const tickClocks = (state, log) => {
  const c = state.clocks;
  const d = state.day;

  // Hospital generator
  if (!c.hospitalOk && !c.hospitalEvac) {
    if (zoneServed(state, 'Z1')) {
      c.hospitalOk = true;
      state.trust = Math.min(10, state.trust + 1);
      log.push('       HARLAN GENERAL ON GRID POWER. the generator spins down.');
      log.push('       diane, on the phone: "you hear that? that\'s nothing. that\'s the sound of nothing wrong."');
    } else {
      c.hospitalH -= 24;
      if (c.hospitalH <= 0) {
        c.hospitalEvac = true;
        state.score.lives -= 20;
        state.trust = Math.max(0, state.trust - 2);
        log.push('**** HARLAN GENERAL GENERATOR DOWN. EVACUATION ORDERED.');
        log.push('       ambulances in the dark. not everyone travels well.');
      } else if (c.hospitalH <= 48) {
        log.push(`       HOSPITAL GENERATOR: ${c.hospitalH}H OF FUEL REMAIN.`);
      }
    }
  }

  // Water treatment
  if (!c.waterOk) {
    if (zoneServed(state, 'Z3')) {
      c.waterOk = true;
      state.trust = Math.min(10, state.trust + 1);
      log.push('       RIVERSIDE WATER BACK ON GRID. pressure normal by morning.');
    } else {
      if (d >= 3 && !c.boilOrder) {
        c.boilOrder = true;
        log.push('**** COUNTY ISSUES BOIL ORDER. trust erodes daily until water is restored.');
      }
      if (d >= 6 && !c.pressureLoss) {
        c.pressureLoss = true;
        log.push('**** WATER PRESSURE LOST IN THE MAINS. fire coverage degraded.');
      }
    }
  }

  // Wastewater
  if (!c.sewageOk) {
    if (zoneServed(state, 'Z4')) {
      c.sewageOk = true;
      log.push('       EASTBANK LIFT STATIONS RUNNING. the river is safe again.');
    } else if (d >= 4 && !c.overflow) {
      c.overflow = true;
      log.push('**** EASTBANK OVERFLOWS INTO THE HARLAN RIVER. health advisories downstream.');
    }
  }

  // Comms
  if (!c.commsOk) {
    if (zoneServed(state, 'Z9')) {
      c.commsOk = true;
      c.commsDark = false;
      for (const id of Object.keys(state.subs)) state.subs[id].revealed = true;
      for (const id of Object.keys(state.lines)) state.lines[id].revealed = true;
      for (const id of Object.keys(state.zones)) state.zones[id].revealed = true;
      state.trust = Math.min(10, state.trust + 0.5);
      log.push('       SIGNAL RIDGE ON GRID. SCADA TELEMETRY FLOODS BACK.');
      log.push('       the whole board lights up with data. priya exhales.');
    } else {
      c.commsH -= 24;
      if (c.commsH <= 0 && !c.commsDark) {
        c.commsDark = true;
        log.push('**** SIGNAL RIDGE BATTERIES DEAD. FORECASTS DEGRADED, CREW COORDINATION SUFFERS.');
      }
    }
  }

  // Cold storage
  if (!c.coldOk) {
    if (zoneServed(state, 'Z7')) {
      c.coldOk = true;
      log.push('       RAILYARD COLD STORAGE HOLDING. the region\'s food is safe.');
    } else if (d >= 5 && !c.spoiled) {
      c.spoiled = true;
      state.trust = Math.max(0, state.trust - 1);
      log.push('**** COLD CHAIN LOST. the region\'s reserve food spoils in the dark.');
    }
  }

  // Gas pipeline pack
  if (c.gasReadyDay === 0 && zoneServed(state, 'Z8')) {
    c.gasReadyDay = d <= 8 ? d : d + 1;
    log.push(d <= 8
      ? '       COMPRESSOR C-4 SPINNING. PIPELINE PRESSURE GOOD — MILLBROOK CAN START.'
      : '       COMPRESSOR C-4 SPINNING. LINE PACKED DOWN — 24H TO REPRESSURIZE.');
  }
};

export const tickFuel = (state, log) => {
  if (zoneServed(state, 'Z6')) {
    state.fuel += FUEL.stripResupply;
    if (!state.flags.fuelFlow) {
      state.flags.fuelFlow = true;
      log.push('       MILLBROOK STRIP PUMPS RUNNING — DIESEL RESUPPLY SECURED.');
    }
  }
  const p = state.units.peakers;
  const gasOn = state.clocks.gasReadyDay > 0 && state.day >= state.clocks.gasReadyDay;
  if (p.on && !gasOn) {
    const burn = state.flags.peakerTune ? 1200 : 1500;
    if (state.fuel >= burn) {
      state.fuel -= burn;
    } else {
      p.on = false;
      log.push('**** CEDAR RUN PEAKERS OUT OF DIESEL — UNITS SHUT DOWN.');
    }
  }
};

const RESIDENTIAL = ['Z2', 'Z5', 'Z10', 'Z11', 'Z15', 'Z17', 'Z18'];

export const tickFreeze = (state, weather, log) => {
  if (!weather.freeze) return;
  if (!zoneServed(state, 'Z16')) {
    state.score.lives -= 3;
    log.push('**** LAKEVIEW CARE IS COLD AND DARK. the night nurse calls again.');
  }
  const dark = RESIDENTIAL.filter((z) => !zoneServed(state, z)).length;
  if (dark > 0) {
    const shelter = zoneServed(state, 'Z14') ? 0.5 : 1;
    const hit = Math.ceil((dark / 3) * shelter);
    state.score.lives -= hit;
    log.push(`       EXPOSURE RISK: ${dark} DISTRICTS DARK IN THE FREEZE` +
      (shelter < 1 ? ' — WARMING CENTER ABSORBING SOME.' : '.'));
  }
};

// Theft pressure on dead, unsecured, revealed subs.
export const tickSecurity = (state, log) => {
  for (const [subId, s] of Object.entries(state.subs)) {
    if (s.secured > 0) s.secured -= 1;
  }
  const targets = Object.entries(state.subs).filter(([id, s]) =>
    s.revealed && !s.energized && s.secured === 0 && s.transformer === 'ok');
  let riskBase = state.trust < 3 ? 0.10 : 0.05;
  if (state.flags.theftUpUntil && state.day <= state.flags.theftUpUntil) {
    riskBase += 0.05;
  }
  for (const [subId, s] of targets) {
    if (rng(state) < riskBase) {
      s.dmg += 1;
      log.push(`**** COPPER STRIPPED AT ${SUBS[subId].name} OVERNIGHT — ` +
        'DAMAGE +1D.');
      break; // one theft per night at most
    }
  }
};
