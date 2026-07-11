// Grid Down: Black Start — boot, phase machine, and all DOM UI.
// Phases: TITLE → COLDOPEN → BRIEF → (commit) → EVENTS → RESOLVE → BRIEF … → ENDING

import { SUBS, LINES, ZONES, UNITS, OPENINGS } from './grid-data.js';
import {
  newState, islandsOf, servedMW, servedPct, zoneServed, unitReady, unitMW,
  dawnRestarts, generationStep, stabilityResolve, loadMult,
} from './sim.js';
import { availableJobs, resolveAssignments, endOfDayCrews, activeCrews } from './crews.js';
import { weatherFor, applyWindDamage, tickClocks, tickFuel, tickFreeze, tickSecurity } from './clocks.js';
import { dailyTrustDrift, tickEquity, BROADCAST_DAYS, applyBroadcast, checkPromise } from './trust.js';
import { initDeck, drawDay, majorFor, applyChoice } from './events.js';
import {
  COLD_OPEN, EXERCISE_OPEN, EXERCISE_CLOSE, GLOSSES,
  computeEnding, reportLines, zoneEpilogue, FINAL_CARD, CROSS_PROMO,
} from './dialog-data.js';
import { initBoard, render, fitBoard, resize, markDirty, boardDirty } from './board.js';
import { attachInput } from './input.js';
import { initAudio, sfx, setHumMW, setEnabled, isEnabled } from './audio.js';
import { saveRun, loadRun, clearRun, exportSave, importSave } from './save.js';

let state = null;
let plan = { assignments: [], broadcast: null, selectedJob: null, armed: false };
let pickSnapshot = {};
let jobsToday = [];
let pendingEvents = [];
let eventLog = [];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const show = (id) => { $(id).classList.remove('hidden'); };
const hide = (id) => { $(id).classList.add('hidden'); };
const hideAll = () => ['title', 'coldopen', 'brief', 'eventmodal', 'logscreen', 'sheet', 'ending', 'menu']
  .forEach(hide);

// ---- boot -------------------------------------------------------------------

const canvas = $('board');
initBoard(canvas);
attachInput(canvas, () => state, (hit) => {
  if (state && !$('brief').classList.contains('hidden')) showSheet(hit);
});
window.addEventListener('resize', () => { resize(); if (state) markDirty(); });

const frame = () => {
  if (state && boardDirty) render(state);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

document.body.addEventListener('pointerdown', () => initAudio(), { once: true });

// ---- title ------------------------------------------------------------------

const showTitle = () => {
  hideAll();
  show('title');
  const saved = loadRun();
  $('t-continue').classList.toggle('hidden', !saved);
  $('t-continue').onclick = () => {
    state = saved;
    sfx('confirm');
    startBrief();
  };
  for (const key of Object.keys(OPENINGS)) {
    $(`t-${key}`).onclick = () => startRun(key, false);
  }
  $('t-exercise').onclick = () => startRun('book', true);
  $('t-sound').onclick = () => {
    setEnabled(!isEnabled());
    $('t-sound').textContent = `SOUND: ${isEnabled() ? 'ON' : 'OFF'}`;
  };
};

const startRun = (opening, exercise) => {
  clearRun();
  state = newState(`${opening}-${exercise}-${Math.floor(performance.now())}`,
    opening, exercise);
  initDeck(state);
  state.dayLog = [GLOSSES.blackstart];
  markDirty();
  fitBoard();
  showColdOpen(exercise ? EXERCISE_OPEN : COLD_OPEN, 0);
};

const showColdOpen = (cards, i) => {
  hideAll();
  show('coldopen');
  const card = cards[i];
  $('co-h').textContent = card.h;
  $('co-p').textContent = card.p;
  $('co-next').textContent = i < cards.length - 1 ? 'CONTINUE' : 'TO THE BOARD';
  $('co-next').onclick = () => {
    sfx('tick');
    if (i < cards.length - 1) showColdOpen(cards, i + 1);
    else startBrief();
  };
};

// ---- morning briefing ---------------------------------------------------------

const startBrief = () => {
  hideAll();
  const log = [];
  dawnRestarts(state, log);
  if (log.length) state.dayLog.push(...log);
  plan = { assignments: [], broadcast: null, selectedJob: null, armed: false };
  jobsToday = availableJobs(state);
  pickSnapshot = {};
  for (const zid of Object.keys(ZONES)) pickSnapshot[zid] = state.zones[zid].picked;
  saveRun(state);
  fitBoard();
  markDirty();
  setHumMW(totalGen());
  sfx('dawn');
  renderBrief();
  show('brief');
};

const totalGen = () =>
  Object.keys(UNITS).reduce((s, id) => s + unitMW(state, id), 0);

const fmtTrust = () => '■'.repeat(Math.round(state.trust)) +
  '□'.repeat(10 - Math.round(state.trust));

const clockLines = () => {
  const c = state.clocks;
  const out = [];
  if (!c.hospitalOk && !c.hospitalEvac) out.push(['HOSPITAL GEN', `${c.hospitalH}H FUEL`, c.hospitalH <= 48]);
  if (c.hospitalEvac) out.push(['HOSPITAL', 'EVACUATED', true]);
  if (!c.waterOk) out.push(['WATER TREATMENT', c.pressureLoss ? 'PRESSURE LOST' : c.boilOrder ? 'BOIL ORDER' : `FAILS DAY 3`, c.boilOrder]);
  if (!c.sewageOk && state.day >= 3) out.push(['WASTEWATER', c.overflow ? 'OVERFLOWING' : 'OVERFLOW DAY 4', c.overflow]);
  if (!c.commsOk) out.push(['SCADA COMMS', c.commsDark ? 'DARK — DEGRADED' : `${c.commsH}H BATTERY`, c.commsDark]);
  if (!c.coldOk && !c.spoiled) out.push(['COLD STORAGE', 'SPOILS DAY 5', state.day >= 4]);
  if (state.promise) out.push(['PROMISE', `${state.promise.pct}% BY DAY ${state.promise.byDay}`, true]);
  return out;
};

const renderBrief = () => {
  const w = weatherFor(state);
  const b = $('brief-body');
  b.innerHTML = '';

  // header strip
  const head = el('div', 'b-head');
  head.append(
    el('div', 'b-day', `DAY ${state.day}${state.exercise ? ' / 10 — EXERCISE' : ' / 30'}`),
    el('div', 'b-stat', `WEATHER: <span class="${w.freeze || w.wind ? 'amber' : ''}">${w.label}</span>`),
    el('div', 'b-stat', `TRUST <span class="mono">${fmtTrust()}</span>`),
    el('div', 'b-stat', `FUEL ${Math.round(state.fuel)} GAL · SPARES ${state.spares} · SERVED ${servedPct(state)}%`),
  );
  b.append(head);

  // overnight recap
  if (state.dayLog.length) {
    const rec = el('details', 'b-recap');
    rec.append(el('summary', '', 'OVERNIGHT LOG'));
    const pre = el('div', 'b-log');
    state.dayLog.forEach((line) => pre.append(el('div', logCls(line), line)));
    rec.append(pre);
    b.append(rec);
  }

  // deadline clocks
  const clocks = clockLines();
  if (clocks.length) {
    const cw = el('div', 'b-clocks');
    cw.append(el('div', 'b-sect', 'DEADLINES'));
    clocks.forEach(([k, v, hot]) =>
      cw.append(el('div', `b-clock ${hot ? 'amber' : ''}`, `${k} — ${v}`)));
    b.append(cw);
  }

  // broadcast
  if (!state.exercise && BROADCAST_DAYS.includes(state.day)) {
    const bc = el('div', 'b-bcast');
    bc.append(el('div', 'b-sect', 'RADIO BROADCAST — the valley is listening'));
    const row = el('div', 'b-row');
    [['honest', 'HONEST'], ['reassure', 'REASSURING'], ['silent', 'SILENCE']].forEach(([k, lbl]) => {
      const btn = el('button', `b-choice ${plan.broadcast === k ? 'sel' : ''}`, lbl);
      btn.onclick = () => { plan.broadcast = k; sfx('squelch'); renderBrief(); };
      row.append(btn);
    });
    bc.append(row);
    b.append(bc);
  }

  // job board
  const jb = el('div', 'b-jobs');
  jb.append(el('div', 'b-sect', `WORK ORDERS — tap a job, then a crew (${activeCrews(state).length} available)`));
  if (!jobsToday.length) jb.append(el('div', 'b-dim', 'No field work available. The board is what it is.'));
  for (const job of jobsToday) {
    const assigned = plan.assignments.filter((a) => a.job.id === job.id);
    const row = el('div', `b-job ${plan.selectedJob === job.id ? 'sel' : ''}`);
    row.append(el('span', 'b-joblabel',
      `${job.label} <span class="b-dim">[${job.need.toUpperCase()}${job.days > 1 ? ` · ~${job.days}D` : ''}]</span>`));
    const chips = el('span', 'b-chips');
    assigned.forEach((a) => {
      const chip = el('button', `b-chip on ${a.night ? 'night' : ''}`,
        `${a.crewId}${a.night ? ' ☾' : ''}`);
      chip.onclick = (e) => {
        e.stopPropagation();
        plan.assignments = plan.assignments.filter((x) => x !== a);
        renderBrief();
      };
      chips.append(chip);
    });
    row.append(chips);
    row.onclick = () => {
      plan.selectedJob = plan.selectedJob === job.id ? null : job.id;
      renderBrief();
    };
    jb.append(row);
  }
  b.append(jb);

  // crew tray
  const tray = el('div', 'b-tray');
  tray.append(el('div', 'b-sect', 'CREWS — unassigned crews rest (−2 fatigue)'));
  const trow = el('div', 'b-row wrap');
  for (const crew of state.crews) {
    const jobs = plan.assignments.filter((a) => a.crewId === crew.id);
    const out = crew.outDays > 0;
    const pips = '●'.repeat(Math.min(10, Math.round(crew.fatigue))) || '·';
    const chip = el('button',
      `b-crew ${out ? 'out' : ''} ${jobs.length ? 'busy' : ''} ${crew.fatigue >= 8 ? 'hot' : ''}`,
      `${crew.id}${crew.mutual ? '*' : ''} <span class="pips">${pips}</span>` +
      (out ? ` OUT ${crew.outDays}D` : ''));
    chip.onclick = () => assignCrew(crew);
    trow.append(chip);
  }
  tray.append(trow);
  if (state.crews.some((c) => c.fatigue >= 8)) {
    tray.append(el('div', 'b-warn',
      'Crews at high fatigue make mistakes. Night work in bad weather can end careers, or worse.'));
  }
  b.append(tray);

  // pickup plan
  const islands = islandsOf(state);
  const pk = el('div', 'b-pickup');
  pk.append(el('div', 'b-sect', 'LOAD PICKUP PLAN — greed trips the grid'));
  if (!islands.length) pk.append(el('div', 'b-dim', 'No energized islands. Build the network first.'));
  islands.forEach((isl, i) => {
    const stat = el('div', `b-island ${isl.status.toLowerCase()}`,
      `ISLAND ${i + 1} — ${Math.round(isl.gen)} MW GEN / ${Math.round(isl.load)} MW LOAD — ` +
      `<b>${isl.status}</b>${isl.ratio !== Infinity ? ` (${isl.ratio.toFixed(2)}x)` : ''}`);
    pk.append(stat);
    for (const zid of Object.keys(ZONES)) {
      const z = ZONES[zid];
      const zs = state.zones[zid];
      if (!isl.subs.includes(z.sub) || !zs.revealed) continue;
      const row = el('div', 'b-zone');
      const ready = zs.dmg === 0;
      row.append(el('span', '', `${z.name} <span class="b-dim">` +
        `${z.blocks.map((mw, bi) => (bi < zs.picked ? `[${mw}]` : `${mw}`)).join(' ')} MW` +
        `${z.tags.length ? ' · ' + z.tags.join(',') : ''}${ready ? '' : ` · FDR ${zs.dmg}D`}</span>`));
      const ctl = el('span', 'b-stepper');
      const minus = el('button', 'b-step', '−');
      minus.disabled = zs.picked === 0;
      minus.onclick = () => { zs.picked -= 1; sfx('relay'); markDirty(); renderBrief(); };
      const plus = el('button', 'b-step', '+');
      plus.disabled = !ready || zs.picked >= z.blocks.length;
      plus.onclick = () => {
        zs.picked += 1;
        if (!state.glossed.pickup) { state.glossed.pickup = true; state.dayLog.push(GLOSSES.pickup, GLOSSES.reserve); }
        sfx('relay'); markDirty(); renderBrief();
      };
      ctl.append(minus, el('span', 'b-pk', `${zs.picked}/${z.blocks.length}`), plus);
      row.append(ctl);
      pk.append(row);
    }
  });
  b.append(pk);

  // commit
  const anyCritical = islands.some((i) => i.status === 'CRITICAL');
  const commit = el('button', `b-commit ${anyCritical ? 'danger' : ''}`,
    plan.armed ? 'ISLAND AT CRITICAL — COMMIT ANYWAY' :
      anyCritical ? 'COMMIT DAY (RESERVE CRITICAL)' : 'COMMIT DAY');
  commit.onclick = () => {
    if (anyCritical && !plan.armed) { plan.armed = true; sfx('alarm'); renderBrief(); return; }
    commitDay();
  };
  b.append(commit);
};

const logCls = (line) => line.startsWith('****') ? 'b-alarm'
  : line.trim().startsWith('vee:') || /^ {5,}[a-z"]/.test(line) ? 'b-human' : '';

const assignCrew = (crew) => {
  if (crew.outDays > 0 || !plan.selectedJob) return;
  const job = jobsToday.find((j) => j.id === plan.selectedJob);
  if (!job) return;
  if (job.need !== 'any' && crew.kind !== job.need) { sfx('annunc'); return; }
  const existing = plan.assignments.filter((a) => a.crewId === crew.id);
  if (existing.length >= 2) { sfx('annunc'); return; }
  if (plan.assignments.some((a) => a.crewId === crew.id && a.job.id === job.id)) return;
  const singleCrew = !['repair'].includes(job.kind);
  if (singleCrew && plan.assignments.some((a) => a.job.id === job.id)) { sfx('annunc'); return; }
  plan.assignments.push({ job, crewId: crew.id, night: existing.length === 1 });
  if (['energize', 'blackstart'].includes(job.kind) && !state.glossed.cranking) {
    state.glossed.cranking = true; state.dayLog.push(GLOSSES.cranking);
  }
  if (job.kind === 'sync' && !state.glossed.sync) {
    state.glossed.sync = true; state.dayLog.push(GLOSSES.sync);
  }
  plan.selectedJob = null;
  sfx('confirm');
  renderBrief();
};

// ---- commit → events → resolve -------------------------------------------------

const commitDay = () => {
  hide('brief');
  sfx('relay');
  eventLog = [];
  pendingEvents = [];
  const major = majorFor(state);
  if (major) pendingEvents.push({ ...major, isMajor: true });
  pendingEvents.push(...drawDay(state));
  nextEvent();
};

const nextEvent = () => {
  if (!pendingEvents.length) { resolveDay(); return; }
  const ev = pendingEvents.shift();
  const text = typeof ev.text === 'function' ? ev.text(state) : ev.text;
  hideAll();
  show('eventmodal');
  sfx(ev.isMajor ? 'alarm' : 'squelch');
  $('ev-cat').textContent = ev.isMajor ? ev.title : `FIELD REPORT — ${ev.cat.toUpperCase()}`;
  $('ev-text').textContent = text;
  const cw = $('ev-choices');
  cw.innerHTML = '';
  ev.choices.forEach((choice, i) => {
    const btn = el('button', 'b-choice block', choice.label);
    btn.onclick = () => {
      applyChoice(state, ev, i, eventLog);
      markDirty();
      $('ev-text').textContent = choice.out || 'Noted.';
      cw.innerHTML = '';
      const next = el('button', 'b-choice block sel', 'CONTINUE');
      next.onclick = () => { sfx('tick'); nextEvent(); };
      cw.append(next);
    };
    cw.append(btn);
  });
};

const resolveDay = () => {
  const log = [`DAY ${state.day} — DISPATCHER LOG`];
  const w = weatherFor(state);

  if (plan.broadcast) applyBroadcast(state, plan.broadcast, log);
  if (eventLog.length) log.push(...eventLog);
  if (w.wind) applyWindDamage(state, log);

  // planned sheds
  for (const zid of Object.keys(ZONES)) {
    const cut = (pickSnapshot[zid] || 0) - state.zones[zid].picked;
    if (cut > 0) {
      state.trust = Math.max(0, state.trust - 0.5 * cut);
      state.score.sheds += cut;
      log.push(`17:00  PLANNED SHED: ${ZONES[zid].name} — ${cut} BLOCK${cut > 1 ? 'S' : ''}. ` +
        'the phones start within minutes.');
    }
  }

  const assignedIds = new Set(plan.assignments.map((a) => a.crewId));
  resolveAssignments(state, plan.assignments, w, log);
  endOfDayCrews(state, assignedIds, log);
  generationStep(state, log);

  // pickup log lines
  for (const zid of Object.keys(ZONES)) {
    const gained = state.zones[zid].picked - (pickSnapshot[zid] || 0);
    if (gained > 0 && state.subs[ZONES[zid].sub].energized) {
      const mw = Math.round(ZONES[zid].blocks.slice(0, state.zones[zid].picked)
        .reduce((a, b) => a + b, 0) * loadMult(state));
      log.push(`19:10  PICK UP BLOCK: ${ZONES[zid].name} (${mw} MW)`);
      sfx('energize');
      if (zid === 'Z18' && zoneServed(state, 'Z18')) {
        log.push('21:40  SOMEWHERE ON MAPLE LANE, A PORCH LIGHT COMES ON.');
      }
    }
  }

  const islands = islandsOf(state);
  islands.forEach((isl, i) => {
    log.push(`21:00  ISLAND ${i + 1}: ${Math.round(isl.gen)} MW GEN / ` +
      `${Math.round(isl.load)} MW LOAD — ${isl.status}`);
  });

  const tripsBefore = state.score.trips;
  stabilityResolve(state, log);
  if (state.score.trips > tripsBefore) {
    sfx('trip');
    if (!state.glossed.trip) { state.glossed.trip = true; log.push(GLOSSES.trip); }
  }

  tickFuel(state, log);
  tickClocks(state, log);
  tickFreeze(state, w, log);
  tickSecurity(state, log);
  dailyTrustDrift(state, log);
  tickEquity(state);
  checkPromise(state, log);

  state.score.mwDays += servedMW(state);
  log.push(`23:59  SERVED: ${servedPct(state)}% OF NORMAL LOAD. TRUST ${state.trust.toFixed(1)}/10.`);

  state.dayLog = log;
  state.day += 1;
  saveRun(state);
  markDirty();
  setHumMW(totalGen());
  showLog(log);
};

// ---- dispatcher log screen ------------------------------------------------------

let logTimer = null;
const showLog = (lines) => {
  hideAll();
  show('logscreen');
  const wrap = $('log-lines');
  wrap.innerHTML = '';
  $('log-next').classList.add('hidden');
  let i = 0;
  const step = () => {
    if (i >= lines.length) { finishLog(); return; }
    wrap.append(el('div', `l-line ${logCls(lines[i])}`, lines[i]));
    wrap.scrollTop = wrap.scrollHeight;
    if (i % 2 === 0) sfx('tick');
    i += 1;
    logTimer = setTimeout(step, 260);
  };
  const finishLog = () => {
    clearTimeout(logTimer);
    logTimer = null;
    while (i < lines.length) {
      wrap.append(el('div', `l-line ${logCls(lines[i])}`, lines[i]));
      i += 1;
    }
    wrap.scrollTop = wrap.scrollHeight;
    $('log-next').classList.remove('hidden');
  };
  $('logscreen').onclick = () => { if (logTimer) finishLog(); };
  $('log-next').onclick = (e) => {
    e.stopPropagation();
    sfx('confirm');
    afterLog();
  };
  step();
};

const afterLog = () => {
  const cap = state.exercise ? 10 : 30;
  // Trust must sit at zero two day-ends running before the feds move in.
  state.zeroDays = state.trust <= 0 ? (state.zeroDays || 0) + 1 : 0;
  if (state.zeroDays >= 2 || state.day > cap) showEnding();
  else startBrief();
};

// ---- node sheet ------------------------------------------------------------------

const showSheet = (hit) => {
  const s = $('sheet-body');
  s.innerHTML = '';
  if (hit.type === 'sub') {
    const sub = state.subs[hit.id];
    const isl = islandsOf(state).find((i) => i.subs.includes(hit.id));
    s.append(el('div', 'sh-h', SUBS[hit.id].name));
    s.append(el('div', '', sub.energized
      ? `ENERGIZED — ISLAND ${isl ? isl.status : ''}`
      : sub.transformer === 'destroyed' ? '<span class="red">TRANSFORMER DESTROYED</span>'
        : sub.dmg > 0 ? `DAMAGED — ${sub.dmg} CREW-DAYS` : 'DE-ENERGIZED, SERVICEABLE'));
    if (sub.secured > 0) s.append(el('div', 'b-dim', `SECURED ${sub.secured} MORE DAY(S)`));
    const fed = Object.entries(ZONES).filter(([, z]) => z.sub === hit.id);
    if (fed.length) s.append(el('div', 'b-dim',
      `FEEDS: ${fed.map(([, z]) => z.name).join(', ')}`));
  } else if (hit.type === 'zone') {
    const z = ZONES[hit.id];
    const zs = state.zones[hit.id];
    s.append(el('div', 'sh-h', z.name));
    s.append(el('div', '', `${z.blocks.join('+')} MW · PICKED ${zs.picked}/${z.blocks.length}` +
      (z.tags.length ? ` · ${z.tags.join(', ')}` : '')));
    s.append(el('div', 'b-dim', zs.dmg > 0
      ? `FEEDER DAMAGE: ${zs.dmg} CREW-DAYS` : 'FEEDER SERVICEABLE'));
    s.append(el('div', 'b-dim', `FED FROM ${SUBS[z.sub].name}` +
      (state.subs[z.sub].energized ? ' (LIVE)' : ' (DARK)')));
  } else {
    const u = UNITS[hit.id];
    s.append(el('div', 'sh-h', u.name));
    s.append(el('div', '', unitReady(state, hit.id)
      ? `ONLINE — ${unitMW(state, hit.id)} MW`
      : 'OFFLINE'));
    const hints = {
      peakers: 'Black-start capable once start batteries are repaired. Burns diesel until pipeline gas is restored.',
      ccgt: 'Needs its bus energized, Compressor C-4 running, pipeline pressure, and plant staffing. Stages 80/160/240 MW.',
      coal: 'Needs its bus energized and staffing. Three days to first MW, then +60 MW/day.',
      tie: 'Requires the Eastlake agreement and sync gear at River Crossing.',
      dam: 'The seed. It rode through on house units and it will ride through whatever you do next.',
    };
    s.append(el('div', 'b-dim', hints[hit.id]));
  }
  const close = el('button', 'b-choice block', 'CLOSE');
  close.onclick = () => hide('sheet');
  s.append(close);
  show('sheet');
};

// ---- ending ----------------------------------------------------------------------

const showEnding = () => {
  hideAll();
  show('ending');
  sfx('ending');
  const e = $('ending-body');
  e.innerHTML = '';
  if (state.exercise) {
    e.append(el('div', 'sh-h', EXERCISE_CLOSE.h));
    e.append(el('p', '', EXERCISE_CLOSE.p));
  } else {
    const end = computeEnding(state);
    e.append(el('div', 'sh-h', end.title));
    e.append(el('div', 'e-grade', `GRADE: ${end.grade}`));
    end.lines.forEach((l) => e.append(el('p', '', l)));
  }
  const rep = el('div', 'e-report');
  rep.append(el('div', 'b-sect', 'AFTER-ACTION REPORT'));
  reportLines(state).forEach(([k, v]) =>
    rep.append(el('div', 'e-row', `<span>${k}</span><span>${v}</span>`)));
  e.append(rep);
  if (!state.exercise) {
    const ep = el('details', 'b-recap');
    ep.append(el('summary', '', 'THE VALLEY, ZONE BY ZONE'));
    Object.keys(ZONES).forEach((zid) =>
      ep.append(el('div', 'l-line b-human', zoneEpilogue(state, zid))));
    e.append(ep);
    e.append(el('p', 'b-dim', FINAL_CARD));
  }
  e.append(el('p', 'e-promo', CROSS_PROMO));
  const again = el('button', 'b-commit', 'NEW RUN');
  again.onclick = () => { clearRun(); state = null; showTitle(); };
  e.append(again);
  clearRun();
};

// ---- menu ------------------------------------------------------------------------

$('menubtn').onclick = () => {
  if ($('menu').classList.contains('hidden')) renderMenu();
  else hide('menu');
};

const renderMenu = () => {
  show('menu');
  $('m-sound').textContent = `SOUND: ${isEnabled() ? 'ON' : 'OFF'}`;
  $('m-sound').onclick = () => {
    setEnabled(!isEnabled());
    $('m-sound').textContent = `SOUND: ${isEnabled() ? 'ON' : 'OFF'}`;
  };
  $('m-export').onclick = () => {
    if (!state) return;
    $('m-io').value = exportSave(state);
    $('m-io').select();
  };
  $('m-import').onclick = () => {
    const s = importSave($('m-io').value);
    if (s) {
      state = s;
      hide('menu');
      sfx('confirm');
      startBrief();
    } else {
      $('m-io').value = 'INVALID SAVE STRING';
    }
  };
  $('m-abandon').onclick = () => {
    clearRun();
    state = null;
    hide('menu');
    showTitle();
  };
  $('m-close').onclick = () => hide('menu');
};

// ---- go --------------------------------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
showTitle();
