// Black Start 2.0 — M2: the playable living map.
// You dispatch crews to storm damage, choose the energization order, and pick
// up load against a real reserve margin while the county's patience decays.
import { SUBS, LINES, ZONES, UNITS, RIVER, STABILITY, TRIP_CHANCE } from '../src/grid-data.js';

const WORLD = { w: 1600, h: 1200 };
const MIN_PER_SEC = 18;            // sim minutes per real second at 1x
const ENERGIZE_MIN = 120;          // line soak time once energization starts
const CREW_SPEED = 9;              // world units per sim minute
const WORK_MIN_PER_DAY = 600;      // one "crew-day" of damage = 600 working min
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

const COL = {
  bg: '#0b1016', land: '#0e1620', river: '#152534',
  dead: '#232a33', energize: '#f0a028', served: '#e8d9a8',
  cream: '#f8f4e4', steel: '#8ca4b4', red: '#f05858', panel: '#121a24',
  crew: '#5ac8fa', trust: '#7bc47f',
};

// seeded rng so a run is shareable/reproducible (?seed=)
let rngState = Number(new URLSearchParams(location.search).get('seed')) || (Date.now() % 100000);
const SEED = rngState;
function rnd() { rngState = (rngState * 48271) % 2147483647; return rngState / 2147483647; }
const roll = (band) => band[0] + Math.floor(rnd() * (band[1] - band[0] + 1));

// ---- state ----------------------------------------------------------------
const S = {
  min: 6 * 60, day: 1, speed: 1, over: false,
  subs: {}, lines: {}, zones: {}, units: {}, crews: [],
  trust: 5, zeroDawns: 0, lastServedFrac: 0, servedMw: 0, totalMw: 0,
  view: { s: 1, ox: 0, oy: 0, rot: false },
  sel: null,            // selected crew index or null
  focus: null,          // {kind, id} for drawer
  toasts: [],
};
S.elapsed = () => (S.day - 1) * 24 * 60 + S.min;

const zoneMw = (z) => z.blocks.reduce((a, b) => a + b, 0);
const winCount = (z) => Math.max(3, Math.round(zoneMw(z) / 5));

// human names — nobody outside a control room says "S1-S4"
const SHORT = {
  S1: 'FALLS', S2: 'DOWNTOWN', S3: 'RIVERSIDE', S4: 'RAILYARD',
  S5: 'MILLBROOK', S6: 'COMPRESSOR', S7: 'SIGNAL RIDGE', S8: 'WESTBROOK',
  S9: 'GARFIELD', S10: 'RIVER XING', S11: 'CEDAR RUN', S12: 'CO-OP EAST',
};
function lineName(id) {
  const l = LINES.find((x) => x.id === id);
  return `${SHORT[l.a]}–${SHORT[l.b]}`;
}

function reset() {
  S.min = 6 * 60; S.day = 1; S.over = false; S.trust = 5; S.zeroDawns = 0;
  S.lastServedFrac = 0; S.servedMw = 0; S.sel = null; S.focus = null; S.toasts = [];
  S.rp = 0; S.miles = {}; S.up = {}; S.bubbles = []; S.pledges = [];
  S.usedEv = new Set(); S.spareParts = 0; S.tripRiskUntil = 0;
  S.bubbleT = 150 + rnd() * 120; S.card = null; S.tripped = false;
  for (const id in SUBS) S.subs[id] = id === 'S1' ? 'live' : 'dead';
  for (const l of LINES) {
    S.lines[l.id] = { dmg: roll(l.dmg) * WORK_MIN_PER_DAY, state: 'dead', t0: 0 };
  }
  for (const id in ZONES) {
    const z = ZONES[id];
    S.zones[id] = {
      dmg: roll(z.dmg) * WORK_MIN_PER_DAY,
      picked: 0, lit: 0, total: winCount(z), acc: 0,
    };
  }
  for (const id in UNITS) S.units[id] = { state: 'dark', stage: 0, timer: 0 };
  S.units.dam = { state: 'online', stage: 1, timer: 0 };
  S.totalMw = Object.values(ZONES).reduce((a, z) => a + zoneMw(z), 0);
  S.crews = [0, 1, 2].map((i) => ({
    x: SUBS.S1.x + 40 + i * 26, y: SUBS.S1.y + 40, job: null, eta: 0, work: 0,
  }));
  document.getElementById('endcard').classList.remove('show');
  document.getElementById('drawer').classList.remove('open');
}

// ---- tutorial ----------------------------------------------------------------
const TUT = {
  step: 0,   // 1 power-up intact line · 2 tap crew · 3 tap damage · 4 speed · 5 power fixed line · 6 wrap
  first: null,   // intact line off the dam — the "free win" that teaches the core verb
  line: null,    // damaged line for the crew lesson
  done: localStorage.getItem('bs2_tut') === '1',
};
function tutStart() {
  TUT.step = 1;
  const byDist = (arr) => arr
    .map((l) => ({ l, d: Math.hypot(lineMid(l.id).x - SUBS.S1.x, lineMid(l.id).y - SUBS.S1.y) }))
    .sort((a, b) => a.d - b.d)
    .map((s) => s.l);
  const intact = byDist(LINES.filter((l) => S.lines[l.id].dmg <= 0 && lineTouchesLive(l)));
  TUT.first = intact.length ? intact[0].id : null;
  // crew lesson: damaged line that touches the dam yard or the far end of the free-win line
  const liveSoon = new Set(['S1']);
  if (TUT.first) {
    const fl = LINES.find((x) => x.id === TUT.first);
    liveSoon.add(fl.a); liveSoon.add(fl.b);
  }
  const damaged = byDist(LINES.filter((l) => S.lines[l.id].dmg > 0));
  const adjacent = damaged.filter((l) => liveSoon.has(l.a) || liveSoon.has(l.b));
  TUT.line = (adjacent[0] || damaged[0] || { id: null }).id;
  if (!TUT.first) TUT.step = TUT.line ? 2 : 6;
}
function tutFinish() { TUT.step = 0; TUT.done = true; localStorage.setItem('bs2_tut', '1'); }
function tutHint() {
  switch (TUT.step) {
    case 1: return `WALKTHROUGH · THE DAM IS LIVE. TAP THE CIRCLED ${lineName(TUT.first)} LINE, THEN "POWER UP THIS LINE".`;
    case 2: return 'IT\'S SPREADING — WATCH FOR LIGHTS. NEXT LESSON: TAP THE C1 CREW BUTTON BELOW.';
    case 3: return `NOW TAP THE CIRCLED RED MARKER — THE ${lineName(TUT.line)} LINE HAS STORM DAMAGE.`;
    case 4: return 'CREW 1 IS ON IT. TAP 2× BELOW TO SPEED UP TIME WHILE THEY WORK.';
    case 5: return `FIXED! TAP THE CIRCLED ${lineName(TUT.line)} LINE, THEN "POWER UP THIS LINE".`;
    case 6: return 'THAT\'S THE WHOLE GAME: FIX, POWER UP, PUSH EAST. PLANTS START THEMSELVES. CREWS 2 & 3 ARE WAITING.';
    default: return '';
  }
}
function tutAdvance() {
  if (TUT.step === 1 && S.lines[TUT.first].state !== 'dead') TUT.step = TUT.line ? 2 : 6;
  else if (TUT.step === 2 && S.sel === 0) TUT.step = 3;
  else if (TUT.step === 3 && S.crews[0].job && S.crews[0].job.id === TUT.line) TUT.step = 4;
  else if (TUT.step === 4 && S.lines[TUT.line].dmg <= 0) TUT.step = 5;
  else if (TUT.step === 5 && S.lines[TUT.line].state !== 'dead') {
    TUT.step = 6;
    setTimeout(tutFinish, 14000);
  }
}

// ---- M3: events, pledges, storm re-damage, Grid Ops tree ---------------------
const soakMin = () => (S.up.switching ? 60 : ENERGIZE_MIN);
const tightGate = () => (S.up.finesse ? 1.02 : STABILITY.TIGHT);

// cut a served line: re-check what still has a path to the dam
function cutLine(id, log) {
  const st = S.lines[id];
  st.state = 'dead';
  st.dmg += WORK_MIN_PER_DAY * (1 + Math.floor(rnd() * 2));
  const reach = new Set(['S1']);
  const q = ['S1'];
  while (q.length) {
    const at = q.shift();
    for (const l of LINES) {
      if (S.lines[l.id].state !== 'served') continue;
      const o = l.a === at ? l.b : l.b === at ? l.a : null;
      if (o && !reach.has(o)) { reach.add(o); q.push(o); }
    }
  }
  for (const sid in SUBS) if (!reach.has(sid)) S.subs[sid] = 'dead';
  for (const zid in ZONES) {
    if (S.subs[ZONES[zid].sub] === 'dead' && S.zones[zid].picked > 0) {
      S.zones[zid].picked = 0;
    }
  }
  toast(log || `${lineName(id)} LINE IS DOWN — EVERYTHING BEHIND IT WENT DARK`);
}

const servedLineIds = () => LINES.filter((l) => S.lines[l.id].state === 'served').map((l) => l.id);
const stuckCrew = (hours) => {
  const c = S.crews[Math.floor(rnd() * S.crews.length)];
  c.stuckUntil = S.elapsed() + hours * 60;
};
const pledge = (hours, check, yes, no, dTrustYes, dTrustNo) => {
  S.pledges.push({ due: S.elapsed() + hours * 60, check, yes, no, dy: dTrustYes, dn: dTrustNo });
};

const EVENTS = [
  { id: 'tree', tone: 'red', when: (s) => servedLineIds().length > 0, timer: 240,
    anchor: () => { const id = servedLineIds()[Math.floor(rnd() * servedLineIds().length)]; return { ...lineMid(id), line: id }; },
    text: (b) => `A trooper calls in a leaning oak over the ${lineName(b.line)} span. It isn't down yet.`,
    choices: [
      { label: 'PULL A CREW TO CLEAR IT (3H)', out: 'The oak comes down in pieces, away from the wire.', fx: () => stuckCrew(3) },
      { label: 'CHANCE IT', out: 'You leave it standing and watch the wind.', fx: (b) => { if (rnd() < 0.4) cutLine(b.line, `THE OAK TOOK THE ${lineName(b.line)} SPAN`); } },
    ], worst: 1 },
  { id: 'ice', tone: 'red', when: (s) => s.day >= 4 && servedLineIds().length > 0, timer: 200,
    anchor: () => { const id = servedLineIds()[Math.floor(rnd() * servedLineIds().length)]; return { ...lineMid(id), line: id }; },
    text: (b) => `Ice is building on the ${lineName(b.line)} span faster than anyone likes. It sheds or it doesn't. Or a bucket crew knocks it off in the cold.`,
    choices: [
      { label: 'SEND THE BUCKET CREW (2H)', out: 'The span is cleared by dark. The crew comes back stiff and quiet.', fx: () => stuckCrew(2) },
      { label: 'LET IT SHED', out: 'You watch the loading numbers all afternoon.', fx: (b) => { if (rnd() < 0.35) cutLine(b.line, `ICE TOOK THE ${lineName(b.line)} SPAN`); } },
    ], worst: 1 },
  { id: 'washout', tone: 'red', when: () => true, timer: 180,
    anchor: () => ({ x: SUBS.S8.x - 60, y: SUBS.S8.y + 60 }),
    text: () => 'A crew truck is axle-deep in a washed-out shoulder on the Westbrook road. Nobody is hurt.',
    choices: [
      { label: 'WINCH IT OUT (2H)', out: 'Mud everywhere. Truck fine.', fx: () => stuckCrew(2) },
      { label: 'LEAVE IT, WALK THE TOOLS IN (4H)', out: 'They carry what they can. The truck waits for daylight.', fx: () => stuckCrew(4) },
    ], worst: 1 },
  { id: 'hospital', tone: 'amber', when: (s) => s.day >= 2 && S.zones.Z1.picked === 0, timer: 220, once: true,
    anchor: () => ({ x: ZONES.Z1.x, y: ZONES.Z1.y }),
    text: () => 'Harlan General is on its backup diesel and burning it fast. The administrator asks, evenly, how long.',
    choices: [
      { label: 'PROMISE POWER IN 24H', out: 'She says she will hold you to it.', fx: () => pledge(24, () => S.zones.Z1.picked > 0, 'HARLAN GENERAL HAS POWER. WORD GETS AROUND.', 'THE HOSPITAL IS STILL DARK. THAT PROMISE COST YOU.', 0.5, -0.8) },
      { label: 'PROMISE NOTHING', out: 'She thanks you for the honesty. It does not feel like thanks.', fx: () => { S.trust = Math.max(0, S.trust - 0.2); } },
    ], worst: 1 },
  { id: 'shelter', tone: 'amber', when: (s) => s.day >= 2 && S.zones.Z14.picked === 0, timer: 220, once: true,
    anchor: () => ({ x: ZONES.Z14.x, y: ZONES.Z14.y }),
    text: () => 'The university shelter is past capacity and the gym is getting cold. The Red Cross coordinator wants a number, not a speech.',
    choices: [
      { label: 'PROMISE POWER IN 36H', out: '"36 hours." She writes it on the whiteboard where everyone can see.', fx: () => pledge(36, () => S.zones.Z14.picked > 0, 'THE SHELTER HAS HEAT. THE WHITEBOARD GETS A CHECKMARK.', 'THE WHITEBOARD STILL SAYS YOUR NAME. TRUST SLIPS.', 0.4, -0.6) },
      { label: 'NO PROMISES', out: 'She nods once and goes back inside.', fx: () => { S.trust = Math.max(0, S.trust - 0.15); } },
    ], worst: 1 },
  { id: 'radio', tone: 'blue', when: (s) => s.day >= 2, timer: 200, once: true,
    anchor: () => ({ x: ZONES.Z9.x, y: ZONES.Z9.y }),
    text: () => 'The AM station is still up on a generator and wants you on air. Half the county is listening on car radios.',
    choices: [
      { label: 'GIVE HONEST NUMBERS', out: 'You read the numbers straight. It lands better than optimism would have.', fx: () => { S.trust = Math.min(5, S.trust + 0.25); } },
      { label: 'PROMISE A BIG WEEKEND', out: 'You say what they want to hear.', fx: () => { S.trust = Math.min(5, S.trust + 0.5); pledge(48, () => S.servedMw / S.totalMw > S.lastServedFrac + 0.15, 'THE WEEKEND DELIVERED. PEOPLE REMEMBER.', 'THE BIG WEEKEND DIDN\'T COME. PEOPLE REMEMBER THAT TOO.', 0.2, -0.9); } },
    ], worst: 0 },
  { id: 'aid', tone: 'green', when: (s) => s.day >= 3, timer: 260, once: true,
    anchor: () => ({ x: SUBS.S11.x + 60, y: SUBS.S11.y - 60 }),
    text: () => 'A mutual-aid crew from two counties over rolls in with their own bucket truck and a thermos the size of a fire extinguisher. They can give you 24 hours.',
    choices: [
      { label: 'PUT THEM ON THE LINES', out: 'Crew 4 checks in on your frequency — tap their blue dot on the map to task them.', fx: () => { S.crews.push({ x: SUBS.S11.x, y: SUBS.S11.y, job: null, stuckUntil: 0, expires: S.elapsed() + 1440, temp: true }); syncChips(); } },
      { label: 'SEND THEM HOME RESTED', out: 'They leave the thermos.', fx: () => { S.rp += 1; } },
    ], worst: 1 },
  { id: 'diesel', tone: 'green', when: (s) => S.units.peakers.state !== 'online', timer: 200, once: true,
    anchor: () => ({ x: UNITS.peakers.x, y: UNITS.peakers.y }),
    text: () => 'The National Guard can escort a diesel tanker to the Cedar Run peakers tonight if you ask for it now.',
    choices: [
      { label: 'ASK FOR THE ESCORT', out: 'The tanker arrives before midnight. The peakers will start hot.', fx: () => { S.rp += 1; } },
      { label: 'SAVE THE FAVOR', out: 'You keep the number in your pocket.', fx: () => {} },
    ], worst: 1 },
  { id: 'parts', tone: 'green', when: (s) => s.day >= 2, timer: 240, once: true,
    anchor: () => ({ x: ZONES.Z7.x, y: ZONES.Z7.y }),
    text: () => 'An inventory clerk at the railyard swears there is a pallet of spare hardware in warehouse three, mislabeled since spring.',
    choices: [
      { label: 'SEND SOMEONE TO LOOK (1H)', out: 'Cutouts, splices, a whole reel of conductor. The next repair goes fast.', fx: () => { stuckCrew(1); S.spareParts = 1; } },
      { label: 'IGNORE IT', out: 'Probably nothing anyway.', fx: () => {} },
    ], worst: 1 },
  { id: 'downtown', tone: 'amber', when: (s) => s.day >= 3 && S.zones.Z2.picked === 0, timer: 200, once: true,
    anchor: () => ({ x: ZONES.Z2.x, y: ZONES.Z2.y }),
    text: () => 'The sheriff reports two smashed storefronts downtown overnight. He is not asking for a lecture about triage.',
    choices: [
      { label: 'PROMISE DOWNTOWN IN 24H', out: '"Good," he says, and hangs up.', fx: () => pledge(24, () => S.zones.Z2.picked > 0, 'DOWNTOWN LIGHTS UP. THE RADIO CHATTER GOES QUIET.', 'ANOTHER DARK NIGHT DOWNTOWN. IT GETS WORSE.', 0.35, -0.6) },
      { label: 'HOLD YOUR SEQUENCE', out: 'You tell him the grid does not care about storefronts. It sounds worse out loud.', fx: () => { S.trust = Math.max(0, S.trust - 0.25); } },
    ], worst: 1 },
  { id: 'refreeze', tone: 'amber', when: (s) => s.day >= 4 && s.day <= 5 && loadMw() > 100, timer: 160, once: true,
    anchor: () => ({ x: SUBS.S5.x, y: SUBS.S5.y - 80 }),
    text: () => 'Tonight refreezes hard. Demand will spike when every heat pump in the valley hits its backup strips at once.',
    choices: [
      { label: 'HOLD PICKUPS UNTIL MIDNIGHT', out: 'You sit on your hands through the cold snap. Nobody thanks you for the outage that didn\'t happen.', fx: () => { S.tripRiskUntil = 0; S.holdUntil = S.elapsed() + 360; } },
      { label: 'RIDE IT OUT', out: 'You keep picking up load and watch the frequency like a hawk.', fx: () => { S.tripRiskUntil = S.elapsed() + 720; } },
    ], worst: 1 },
  { id: 'exec', tone: 'amber', when: (s) => s.day >= 5 && S.trust < 3, timer: 180, once: true,
    anchor: () => ({ x: ZONES.Z2.x + 80, y: ZONES.Z2.y - 40 }),
    text: () => 'The county executive calls. He has a press conference in an hour and wants to say the word "restored" in a sentence about you.',
    choices: [
      { label: 'GIVE HIM A DATE', out: 'He says the date on live radio before you finish the sentence.', fx: () => pledge(48, () => S.servedMw / S.totalMw > 0.8, 'THE DATE HELD. HE TAKES THE CREDIT. FINE.', 'THE DATE BLEW BY. HE SAYS YOUR NAME ON AIR.', 0.4, -0.8) },
      { label: 'REFUSE TO GUESS', out: 'The press conference goes badly for both of you.', fx: () => { S.trust = Math.max(0, S.trust - 0.3); } },
    ], worst: 1 },
  { id: 'drone', tone: 'blue', when: (s) => servedLineIds().length > 2, timer: 150,
    anchor: () => ({ x: SUBS.S10.x, y: SUBS.S10.y - 70 }),
    text: () => 'Somebody is flying a drone over the river crossing to film the lights coming back. It is a beautiful shot. It is also fifty feet from an energized span.',
    choices: [
      { label: 'SEND A PATROL TO SHOO THEM', out: 'The pilot apologizes and posts the footage anyway. It looks incredible.', fx: () => { S.trust = Math.min(5, S.trust + 0.15); } },
      { label: 'IGNORE THEM', out: 'You have bigger problems than cinematography.', fx: () => { if (rnd() < 0.15) stuckCrew(1); } },
    ], worst: 1 },
];

function spawnBubble(evId) {
  const ev = EVENTS.find((e) => e.id === evId);
  if (!ev || (ev.once && S.usedEv.has(ev.id)) || !ev.when(S)) return false;
  const a = ev.anchor();
  S.bubbles.push({ ev, x: a.x, y: a.y, line: a.line || null, born: S.elapsed(), timer: ev.timer });
  S.usedEv.add(ev.id);
  return true;
}

function updateBubbles(dtMin) {
  S.bubbleT -= dtMin;
  if (S.bubbleT <= 0 && S.bubbles.length < 2) {
    S.bubbleT = 260 + rnd() * 240;
    const pool = EVENTS.filter((e) => !(e.once && S.usedEv.has(e.id)) && e.when(S));
    if (pool.length) spawnBubble(pool[Math.floor(rnd() * pool.length)].id);
  }
  for (let i = S.bubbles.length - 1; i >= 0; i--) {
    const b = S.bubbles[i];
    if (S.elapsed() - b.born >= b.timer) {
      S.bubbles.splice(i, 1);
      const c = b.ev.choices[b.ev.worst];
      toast('IGNORED · ' + c.out);
      c.fx(b);
      if (S.card && S.card.b === b) closeCard();
    }
  }
}

function updatePledges() {
  for (let i = S.pledges.length - 1; i >= 0; i--) {
    const p = S.pledges[i];
    if (p.check()) {
      S.trust = Math.min(5, S.trust + p.dy);
      toast(p.yes);
      S.pledges.splice(i, 1);
    } else if (S.elapsed() >= p.due) {
      S.trust = Math.max(0, S.trust + p.dn);
      toast(p.no);
      S.pledges.splice(i, 1);
    }
  }
}

function checkMilestones() {
  const frac = S.servedMw / S.totalMw;
  const award = (key, msg) => {
    if (S.miles[key]) return;
    S.miles[key] = true;
    S.rp += 1;
    toast(`+1 OPS POINT · ${msg}`);
  };
  for (const pct of [20, 40, 60, 80]) if (frac >= pct / 100) award('pct' + pct, `${pct}% OF THE COUNTY SERVED`);
  if (S.zones.Z1.picked > 0) award('hosp', 'HARLAN GENERAL ENERGIZED');
  for (const uid of ['coal', 'ccgt', 'peakers', 'tie']) {
    if (S.units[uid].state === 'online') award('u_' + uid, `${UNITS[uid].name} ON THE BUS`);
  }
}

const UPGRADES = [
  { id: 'fleet', cost: 2, name: 'FLEET STAGING', desc: 'Crews drive 60% faster.' },
  { id: 'rigs', cost: 2, name: 'HEAVY RIGS', desc: 'Repairs go 40% faster.' },
  { id: 'switching', cost: 2, name: 'HOT SWITCHING', desc: 'Powering up a line takes 1 hour, not 2.' },
  { id: 'comms', cost: 2, name: 'PRESS BRIEFINGS', desc: 'Trust decays 40% slower each dark morning.' },
  { id: 'outreach', cost: 2, name: 'COMMUNITY OUTREACH', desc: '+0.15 trust every dawn.' },
  { id: 'finesse', cost: 3, name: 'LOAD FINESSE', desc: 'Pick up load closer to the edge, half the trip risk.' },
];

// the single suggested next action, always current
function nextHint() {
  S.hintLineId = null;
  if (S.over) return '';
  if (TUT.step) return tutHint();
  if (S.bubbles.length && !S.card) return 'A FIELD REPORT NEEDS A DECISION — TAP THE PULSING BUBBLE';
  const ready = LINES.find((l) => S.lines[l.id].state === 'dead'
    && S.lines[l.id].dmg <= 0 && lineTouchesLive(l));
  if (ready) {
    S.hintLineId = ready.id;
    return `NEXT · TAP THE CIRCLED ${lineName(ready.id)} LINE AND POWER IT UP`;
  }
  const idle = S.crews.findIndex((c) => !c.job);
  const anyDamage = LINES.some((l) => S.lines[l.id].dmg > 0)
    || Object.keys(ZONES).some((z) => S.zones[z].dmg > 0);
  const gen = genMw(), load = loadMw();
  if (load > 0 && load * STABILITY.SOLID > gen)
    return 'CAREFUL · SPARE POWER IS THIN — LET THE PLANTS CATCH UP BEFORE PUSHING ON';
  if (idle >= 0 && anyDamage) return `NEXT · TAP CREW C${idle + 1} BELOW, THEN A RED MARKER`;
  if (anyDamage) return 'CREWS ARE WORKING · SPEED UP TIME (2×)';
  return 'DAMAGE CLEAR · POWER UP LINES AND LET THE WINDOWS FILL IN';
}

function toast(msg) { S.toasts.push({ msg, until: performance.now() + 4200 }); }

// ---- generation & load -----------------------------------------------------
function genMw() {
  let g = 0;
  for (const id in UNITS) {
    const u = UNITS[id], st = S.units[id];
    if (st.state !== 'online') continue;
    g += u.stages ? u.stages[st.stage - 1] : u.mw;
  }
  return g;
}
function loadMw() {
  let l = 0;
  for (const id in ZONES) {
    const z = ZONES[id], st = S.zones[id];
    for (let i = 0; i < st.picked; i++) l += z.blocks[i];
  }
  return l;
}

// ---- actions ----------------------------------------------------------------
function lineRepaired(id) { return S.lines[id].dmg <= 0; }
function lineTouchesLive(l) { return S.subs[l.a] === 'live' || S.subs[l.b] === 'live'; }

function tryEnergize(lineId) {
  const l = LINES.find((x) => x.id === lineId);
  const st = S.lines[lineId];
  if (st.state !== 'dead' || !lineRepaired(lineId) || !lineTouchesLive(l)) return;
  st.state = 'energizing'; st.t0 = S.elapsed();
  toast(`POWERING UP ${lineName(lineId)} — TAKES ${ENERGIZE_MIN / 60} HOURS`);
  S.focus = null;
}

function assignCrew(ci, target) {
  const c = S.crews[ci];
  c.job = target; // {kind:'line'|'zone', id}
  const p = target.kind === 'line' ? lineMid(target.id)
    : { x: ZONES[target.id].x, y: ZONES[target.id].y };
  c.dest = p;
  toast(`CREW ${ci + 1} ROLLING TO ${target.kind === 'line' ? lineName(target.id) : ZONES[target.id].name}`);
  S.sel = null;
  syncChips();
}
function lineMid(id) {
  const l = LINES.find((x) => x.id === id);
  return { x: (SUBS[l.a].x + SUBS[l.b].x) / 2, y: (SUBS[l.a].y + SUBS[l.b].y) / 2 };
}

// ---- sim tick ----------------------------------------------------------------
function tick(dtMin) {
  if (S.over) return;
  const prevMin = S.min;
  S.min += dtMin;
  if (S.min >= 24 * 60) { S.min -= 24 * 60; S.day += 1; dawn(); }

  // crews travel & work
  for (let ci = S.crews.length - 1; ci >= 0; ci--) {
    const c = S.crews[ci];
    if (c.expires && S.elapsed() >= c.expires) {
      S.crews.splice(ci, 1);
      toast('THE MUTUAL-AID CREW HEADS HOME. GOOD PEOPLE.');
      if (S.sel === ci) S.sel = null;
      syncChips();
      continue;
    }
    if (!c.job || (c.stuckUntil && S.elapsed() < c.stuckUntil)) continue;
    const d = Math.hypot(c.dest.x - c.x, c.dest.y - c.y);
    const step = CREW_SPEED * (S.up.fleet ? 1.6 : 1) * dtMin;
    if (d > 14) {
      c.x += ((c.dest.x - c.x) / d) * Math.min(step, d);
      c.y += ((c.dest.y - c.y) / d) * Math.min(step, d);
    } else {
      const pool = c.job.kind === 'line' ? S.lines[c.job.id] : S.zones[c.job.id];
      if (pool.dmg > 0) {
        pool.dmg -= dtMin * (S.up.rigs ? 1.4 : 1) * (S.spareParts ? 3 : 1);
        if (pool.dmg <= 0) {
          pool.dmg = 0;
          if (S.spareParts) S.spareParts = 0;
          toast(`${c.job.kind === 'line' ? lineName(c.job.id) + ' LINE' : ZONES[c.job.id].name} FIXED`);
          c.job = null;
          syncChips();
        }
      } else { c.job = null; syncChips(); }
    }
  }

  // energizing lines settle
  for (const l of LINES) {
    const st = S.lines[l.id];
    if (st.state === 'energizing' && S.elapsed() - st.t0 >= soakMin()) {
      st.state = 'served';
      S.subs[l.a] = 'live'; S.subs[l.b] = 'live';
    }
  }

  updateBubbles(dtMin);
  updatePledges();
  checkMilestones();

  // units: staged starts once their sub is live
  for (const id in UNITS) {
    const u = UNITS[id], st = S.units[id];
    if (st.state === 'dark' && S.subs[u.sub] === 'live') {
      if (u.needsGas && S.zones.Z8.picked === 0) continue;   // ccgt waits on compressor
      st.state = 'starting'; st.timer = S.elapsed() + (u.isTie ? 120 : 360);
    }
    if (st.state === 'starting' && S.elapsed() >= st.timer) {
      st.state = 'online'; st.stage = 1;
      toast(`${u.name} ONLINE`);
      st.timer = S.elapsed() + 720;
    } else if (st.state === 'online' && u.stages && st.stage < u.stages.length
      && S.elapsed() >= st.timer) {
      st.stage += 1; st.timer = S.elapsed() + 720;
    }
  }

  // load pickup: every 30 sim-min, each eligible zone tries one block
  S.pickAcc = (S.pickAcc || 0) + dtMin;
  if (S.pickAcc >= 30 && !(S.holdUntil && S.elapsed() < S.holdUntil)) {
    S.pickAcc = 0;
    const gen = genMw();
    const tripMult = (S.up.finesse ? 0.5 : 1) * (S.tripRiskUntil > S.elapsed() ? 2 : 1);
    for (const id in ZONES) {
      const z = ZONES[id], st = S.zones[id];
      if (S.subs[z.sub] !== 'live' || st.dmg > 0 || st.picked >= z.blocks.length) continue;
      const block = z.blocks[st.picked];
      const after = loadMw() + block;
      if (after * tightGate() > gen) continue;                     // blocked: too tight
      if (after * STABILITY.SOLID > gen && rnd() < TRIP_CHANCE.TIGHT * tripMult) { trip(); return; }
      st.picked += 1;
    }
  }

  // windows follow picked blocks
  for (const id in ZONES) {
    const z = ZONES[id], st = S.zones[id];
    const target = Math.round((st.picked / z.blocks.length) * st.total);
    if (st.lit < target) {
      st.acc += dtMin;
      while (st.acc >= 8 && st.lit < target) { st.acc -= 8; st.lit += 1; }
    } else if (st.lit > target) st.lit = target;
  }
  S.servedMw = loadMw();

  if (S.servedMw >= S.totalMw - 0.5 && !S.over) win();
}

function trip() {
  // shed ~25% of load, dramatic flicker, trust hit
  let shed = loadMw() * 0.25;
  const ids = Object.keys(ZONES).filter((id) => S.zones[id].picked > 0);
  while (shed > 0 && ids.length) {
    const id = ids[Math.floor(rnd() * ids.length)];
    const st = S.zones[id];
    if (st.picked > 0) { st.picked -= 1; shed -= ZONES[id].blocks[st.picked]; }
    else ids.splice(ids.indexOf(id), 1);
  }
  S.trust = Math.max(0, S.trust - 0.4);
  S.flash = 0.7;
  toast('OVERLOAD! BREAKERS TRIPPED — LIGHTS LOST. LET THE PLANTS CATCH UP.');
}

function dawn() {
  const frac = S.servedMw / S.totalMw;
  S.trust = Math.max(0, S.trust - (1 - frac) * 0.8 * (S.up.comms ? 0.6 : 1));
  if (frac > S.lastServedFrac + 0.001) S.trust = Math.min(5, S.trust + 0.4);
  if (S.up.outreach) S.trust = Math.min(5, S.trust + 0.15);
  S.lastServedFrac = frac;

  // the storm isn't done with you: fresh damage overnight into Days 2 and 4
  if (S.day === 2 || S.day === 4) {
    const hits = 2 + Math.floor(rnd() * 2);
    const label = S.day === 2 ? 'THE RAIN BANDS' : 'THE ICE';
    let cut = 0;
    for (let i = 0; i < hits; i++) {
      const l = LINES[Math.floor(rnd() * LINES.length)];
      const st = S.lines[l.id];
      if (st.state === 'served' && cut === 0) { cutLine(l.id, `${label} TOOK THE ${lineName(l.id)} SPAN OVERNIGHT`); cut++; }
      else { st.dmg += WORK_MIN_PER_DAY * (1 + Math.floor(rnd() * 2)); if (st.state === 'energizing') st.state = 'dead'; }
    }
    toast(`${label} DID FRESH DAMAGE OVERNIGHT — CHECK THE RED MARKERS`);
  }
  if (S.trust <= 0.01) {
    S.zeroDawns += 1;
    if (S.zeroDawns >= 2) return lose();
    toast('THE COUNTY EXECUTIVE IS ASKING FOR NAMES.');
  } else S.zeroDawns = 0;
  toast(`DAY ${S.day} · ${Math.round(frac * 100)}% SERVED · TRUST ${S.trust.toFixed(1)}`);
}

function win() {
  S.over = true;
  const grade = S.day <= 9 && S.trust >= 3.5 ? 'A'
    : S.day <= 12 && S.trust >= 2.5 ? 'B'
    : S.day <= 16 ? 'C' : 'D';
  end('HARLAN VALLEY · LIGHTS ON',
    `${Math.round(S.totalMw)} MW restored · Day ${S.day} · Trust ${S.trust.toFixed(1)}/5 · GRADE ${grade}`);
}
function lose() {
  S.over = true;
  end('RELIEVED OF DUTY',
    `Day ${S.day} · ${Math.round((S.servedMw / S.totalMw) * 100)}% served wasn't fast enough.`);
}
function end(title, stats) {
  document.querySelector('#endcard .big').textContent = title;
  document.getElementById('endstats').textContent = stats;
  document.getElementById('endcard').classList.add('show');
}

// ---- view transform ----------------------------------------------------------
function layout() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rot = h > w;
  const bw = rot ? WORLD.h : WORLD.w, bh = rot ? WORLD.w : WORLD.h;
  const s = Math.min(w / bw, (h - 190) / bh) * 0.97;
  S.view = { s, ox: (w - bw * s) / 2, oy: 64 + (h - 190 - bh * s) / 2, rot };
  buildStaticLayers();
}
function toScreen(x, y) {
  const v = S.view;
  return v.rot
    ? { x: v.ox + (WORLD.h - y) * v.s, y: v.oy + x * v.s }
    : { x: v.ox + x * v.s, y: v.oy + y * v.s };
}
function toWorld(sx, sy) {
  const v = S.view;
  return v.rot
    ? { x: (sy - v.oy) / v.s, y: WORLD.h - (sx - v.ox) / v.s }
    : { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s };
}

// ---- static art layers (rebuilt on resize; own rng so game rolls stay put)
let terrainLayer = null, vignetteLayer = null;
function buildStaticLayers() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let vs = 777;
  const vr = () => (vs = (vs * 48271) % 2147483647) / 2147483647;

  terrainLayer = document.createElement('canvas');
  terrainLayer.width = w * dpr; terrainLayer.height = h * dpr;
  const t = terrainLayer.getContext('2d');
  t.setTransform(dpr, 0, 0, dpr, 0, 0);
  t.fillStyle = COL.bg; t.fillRect(0, 0, w, h);

  const p0 = toScreen(0, 0), p1 = toScreen(WORLD.w, WORLD.h);
  const lx = Math.min(p0.x, p1.x), ly = Math.min(p0.y, p1.y);
  const lw = Math.abs(p1.x - p0.x), lh = Math.abs(p1.y - p0.y);

  const base = t.createLinearGradient(0, ly, 0, ly + lh);
  base.addColorStop(0, '#111b26'); base.addColorStop(0.55, '#0e1620'); base.addColorStop(1, '#0b121b');
  t.fillStyle = base; t.fillRect(lx, ly, lw, lh);

  // soft hills and field patches
  for (let i = 0; i < 80; i++) {
    const x = lx + vr() * lw, y = ly + vr() * lh, r = 24 + vr() * 100;
    const col = vr() < 0.45 ? 'rgba(28,44,36,0.20)' : 'rgba(30,38,52,0.18)';
    const rg = t.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = rg; t.beginPath(); t.arc(x, y, r, 0, Math.PI * 2); t.fill();
  }
  // clumped forest stipple
  t.fillStyle = 'rgba(36,56,42,0.5)';
  for (let c = 0; c < 26; c++) {
    const cx = lx + vr() * lw, cy = ly + vr() * lh, cr = 12 + vr() * 34;
    for (let i = 0; i < 34; i++) {
      const a = vr() * Math.PI * 2, d = vr() * cr;
      t.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2);
    }
  }
  // the Harlan River — gentle meander instead of a dead-straight band
  const pts = [];
  for (let yy = -40; yy <= WORLD.h + 40; yy += 50) {
    const wob = Math.sin(yy * 0.004) * 42 + Math.sin(yy * 0.011 + 2) * 20;
    pts.push(toScreen(RIVER.x + wob, yy));
  }
  const river = (width, col) => {
    t.strokeStyle = col; t.lineWidth = width; t.lineJoin = 'round'; t.lineCap = 'round';
    t.beginPath(); t.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) t.lineTo(p.x, p.y);
    t.stroke();
  };
  river(76 * S.view.s, '#0a141d');
  river(60 * S.view.s, '#152534');
  river(18 * S.view.s, '#1b3044');

  vignetteLayer = document.createElement('canvas');
  vignetteLayer.width = w * dpr; vignetteLayer.height = h * dpr;
  const vg = vignetteLayer.getContext('2d');
  vg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rad = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.72);
  rad.addColorStop(0, 'rgba(0,0,8,0)'); rad.addColorStop(1, 'rgba(0,0,8,0.42)');
  vg.fillStyle = rad; vg.fillRect(0, 0, w, h);
}

// ---- draw ----------------------------------------------------------------------
let dashOff = 0;
function nightAlpha() {
  const h = S.min / 60;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 21) return ((h - 18) / 3) * 0.45;
  if (h >= 21 || h < 5) return 0.45;
  return ((7 - h) / 2) * 0.45;
}

function draw() {
  const w = window.innerWidth, h = window.innerHeight;
  const now = performance.now();
  const vdt = Math.min(0.05, (now - (S._lastDraw || now)) / 1000);
  S._lastDraw = now;

  if (terrainLayer) ctx.drawImage(terrainLayer, 0, 0, w, h);
  else { ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h); }
  const p0 = toScreen(0, 0), p1 = toScreen(WORLD.w, WORLD.h);
  const lx = Math.min(p0.x, p1.x), ly = Math.min(p0.y, p1.y);
  const lw = Math.abs(p1.x - p0.x), lh = Math.abs(p1.y - p0.y);

  // drifting cloud shadows — the map breathes even when nothing happens
  for (let i = 0; i < 3; i++) {
    const cr = 130 + i * 55;
    const cx = lx - cr + ((now * 0.008 + i * 977) % (lw + cr * 2));
    const cy = ly + (0.18 + 0.27 * i) * lh + Math.sin(now * 0.0001 + i * 2.1) * 26;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cg.addColorStop(0, 'rgba(2,4,10,0.10)'); cg.addColorStop(1, 'rgba(2,4,10,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  }

  for (const l of LINES) {
    const a = toScreen(SUBS[l.a].x, SUBS[l.a].y);
    const b = toScreen(SUBS[l.b].x, SUBS[l.b].y);
    const st = S.lines[l.id];
    if (st.state !== 'dead') {  // glow pass under live/energizing wires
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = st.state === 'energizing' ? 'rgba(240,160,40,0.22)' : 'rgba(240,205,130,0.15)';
      ctx.lineWidth = st.state === 'energizing' ? 9 : 7;
      ctx.setLineDash([]); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    if (st.state === 'dead') {
      ctx.strokeStyle = COL.dead; ctx.lineWidth = 2; ctx.setLineDash([]);
    } else if (st.state === 'energizing') {
      ctx.strokeStyle = COL.energize; ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -dashOff;
    } else {
      ctx.strokeStyle = COL.served; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (st.dmg > 0) {
      const m = toScreen(lineMid(l.id).x, lineMid(l.id).y);
      const big = S.sel !== null || (TUT.step === 3 && TUT.line === l.id);
      const r = big ? 6 + Math.sin(performance.now() / 180) * 2 : 4;
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = COL.red; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
    const ringTarget = (TUT.step === 1 && TUT.first === l.id)
      || ((TUT.step === 3 || TUT.step === 5) && TUT.line === l.id)
      || (TUT.step === 0 && S.hintLineId === l.id);
    if (ringTarget) {
      const m = toScreen(lineMid(l.id).x, lineMid(l.id).y);
      ctx.strokeStyle = COL.energize; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 16 + Math.sin(performance.now() / 200) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (S.focus && S.focus.kind === 'LINE' && S.focus.id === l.id) {
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  for (const zid in ZONES) {
    const z = ZONES[zid];
    const a = toScreen(SUBS[z.sub].x, SUBS[z.sub].y);
    const b = toScreen(z.x, z.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = S.zones[zid].lit > 0 ? '#8a7a4a' : '#1a222c';
    ctx.lineWidth = 1; ctx.stroke();
  }

  for (const id in SUBS) {
    const p = toScreen(SUBS[id].x, SUBS[id].y);
    const live = S.subs[id] === 'live';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = live ? COL.served : COL.panel;
    ctx.strokeStyle = live ? COL.served : '#33404e'; ctx.lineWidth = 1.5;
    ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
    ctx.fillStyle = live ? '#a89f80' : '#4a5a6a';
    ctx.font = '600 8px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(SHORT[id], p.x, p.y - 8);
  }

  const gen = genMw(), load = loadMw();
  const tight = load > 0 && load * STABILITY.SOLID > gen;
  for (const zid in ZONES) {
    const z = ZONES[zid], st = S.zones[zid];
    const p = toScreen(z.x, z.y);
    const cols = Math.ceil(Math.sqrt(st.total * 1.6));
    const litFrac = st.total ? st.lit / st.total : 0;
    if (litFrac > 0) {  // warm town glow under lit windows
      const r = (cols * 8) / 2 + 18;
      const zg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
      zg.addColorStop(0, `rgba(255,205,100,${0.18 * litFrac})`);
      zg.addColorStop(1, 'rgba(255,205,100,0)');
      ctx.fillStyle = zg; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < st.total; i++) {
      const wx = p.x + (i % cols) * 8 - (cols * 8) / 2;
      const wy = p.y + Math.floor(i / cols) * 10 - 8;
      if (i < st.lit) {
        const flick = tight ? Math.random() < 0.03 : Math.random() < 0.004;
        ctx.fillStyle = flick ? '#7a6a3a' : '#ffd76a';
        ctx.fillRect(wx, wy, 5, 7);
      } else { ctx.fillStyle = '#151d27'; ctx.fillRect(wx, wy, 5, 7); }
    }
    if (st.dmg > 0) {
      ctx.fillStyle = COL.red;
      ctx.fillRect(p.x - (cols * 8) / 2 - 9, p.y - 6, 4, 4);
    }
  }

  for (const id in UNITS) {
    const u = UNITS[id], st = S.units[id];
    const p = toScreen(u.x, u.y);
    const on = st.state === 'online';
    ctx.fillStyle = on ? COL.energize : st.state === 'starting' ? '#8a6516' : COL.panel;
    ctx.strokeStyle = on || st.state === 'starting' ? COL.energize : '#33404e';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(p.x - 11, p.y - 11, 22, 22, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#0b1016' : COL.steel;
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.name[0], p.x, p.y + 1);
    if (on) {  // steam drifting off a running plant
      st.puffs = st.puffs || [];
      if (Math.random() < vdt * 2.5 && st.puffs.length < 6) {
        st.puffs.push({ ox: (Math.random() - 0.5) * 10, age: 0 });
      }
      for (let i = st.puffs.length - 1; i >= 0; i--) {
        const pf = st.puffs[i];
        pf.age += vdt;
        if (pf.age > 1.6) { st.puffs.splice(i, 1); continue; }
        const a = 0.20 * (1 - pf.age / 1.6);
        ctx.fillStyle = `rgba(200,210,220,${a})`;
        ctx.beginPath();
        ctx.arc(p.x + pf.ox + pf.age * 4, p.y - 14 - pf.age * 20, 2.5 + pf.age * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ambient sparks travelling live wires — the grid feels electric
  S.sparks = S.sparks || [];
  S.sparkT = (S.sparkT || 0) + vdt;
  if (S.sparkT > 2.1) {
    S.sparkT = 0;
    const live = LINES.filter((l) => S.lines[l.id].state === 'served');
    if (live.length) S.sparks.push({ id: live[Math.floor(Math.random() * live.length)].id, t: 0 });
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const sp = S.sparks[i];
    sp.t += vdt * 0.55;
    if (sp.t >= 1) { S.sparks.splice(i, 1); continue; }
    const l = LINES.find((x) => x.id === sp.id);
    if (!l || S.lines[sp.id].state !== 'served') { S.sparks.splice(i, 1); continue; }
    const a = toScreen(SUBS[l.a].x, SUBS[l.a].y);
    const b = toScreen(SUBS[l.b].x, SUBS[l.b].y);
    const x = a.x + (b.x - a.x) * sp.t, y = a.y + (b.y - a.y) * sp.t;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, 7);
    sg.addColorStop(0, 'rgba(255,240,190,0.9)'); sg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }

  // crews
  for (const [i, c] of S.crews.entries()) {
    const p = toScreen(c.x, c.y);
    ctx.fillStyle = COL.crew;
    ctx.beginPath(); ctx.arc(p.x, p.y, S.sel === i ? 8 : 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1016'; ctx.font = '700 9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p.x, p.y + 0.5);
    if (S.sel === i) {
      ctx.strokeStyle = COL.crew; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const na = nightAlpha();
  if (na > 0) {
    ctx.fillStyle = `rgba(4,8,16,${na})`;
    ctx.fillRect(lx, ly, lw, lh);
    for (const zid in ZONES) {
      const z = ZONES[zid], st = S.zones[zid];
      const p = toScreen(z.x, z.y);
      const cols = Math.ceil(Math.sqrt(st.total * 1.6));
      for (let i = 0; i < st.lit; i++) {
        const wx = p.x + (i % cols) * 8 - (cols * 8) / 2;
        const wy = p.y + Math.floor(i / cols) * 10 - 8;
        ctx.fillStyle = '#ffd76a'; ctx.fillRect(wx, wy, 5, 7);
      }
    }
  }

  // canon weather: rain moves in Day 2, frost snow Days 4-5
  const weather = S.day === 2 ? 'rain' : (S.day === 4 || S.day === 5) ? 'snow' : null;
  if (weather) {
    S.wparts = S.wparts || Array.from({ length: 120 }, () => ({
      x: Math.random() * w, y: Math.random() * h, v: 0.5 + Math.random() * 0.8,
    }));
    if (weather === 'rain') {
      ctx.strokeStyle = 'rgba(140,164,180,0.20)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const wp of S.wparts) {
        wp.y += wp.v * vdt * 640; wp.x += wp.v * vdt * 140;
        if (wp.y > h) { wp.y = -12; wp.x = Math.random() * w; }
        ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x - 3, wp.y - 12);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(220,228,236,0.35)';
      for (const wp of S.wparts) {
        wp.y += wp.v * vdt * 60;
        wp.x += Math.sin((wp.y + wp.v * 999) * 0.02) * 0.4;
        if (wp.y > h) { wp.y = -6; wp.x = Math.random() * w; }
        ctx.fillRect(wp.x, wp.y, 2, 2);
      }
    }
  } else S.wparts = null;

  // time-of-day grade
  const hr = S.min / 60;
  let tint = null;
  if (hr >= 5 && hr < 8) tint = 'rgba(255,150,60,0.05)';
  else if (hr >= 17 && hr < 20.5) tint = 'rgba(255,110,70,0.07)';
  else if (hr >= 8 && hr < 17) tint = 'rgba(150,190,225,0.04)';
  else tint = 'rgba(40,70,140,0.07)';
  ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h);

  if (S.flash > 0) {  // grid trip: red pulse
    S.flash -= vdt;
    ctx.fillStyle = `rgba(240,70,55,${Math.max(0, S.flash) * 0.3})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (vignetteLayer) ctx.drawImage(vignetteLayer, 0, 0, w, h);

  // event bubbles ride above everything — they are the interrupt
  const TONE = { red: '#f05858', amber: '#f0a028', blue: '#5ac8fa', green: '#7bc47f' };
  for (const b of S.bubbles) {
    const p = toScreen(b.x, b.y);
    const col = TONE[b.ev.tone];
    const pulse = 1 + Math.sin(now / 260) * 0.12;
    const bg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 26 * pulse);
    bg.addColorStop(0, col + '55'); bg.addColorStop(1, col + '00');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.x, p.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#121a24'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const frac = Math.max(0, 1 - (S.elapsed() - b.born) / b.timer);
    ctx.beginPath(); ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = col; ctx.font = '700 13px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', p.x, p.y + 1);
  }
}

// ---- input -------------------------------------------------------------------
function dist2seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// All hit-testing happens in SCREEN pixels so tap targets are finger-sized
// regardless of zoom. When a crew is selected, red damage markers win first.
canvas.addEventListener('pointerdown', (e) => {
  if (S.over) return;
  const sx = e.clientX, sy = e.clientY;
  const distTo = (wx, wy) => {
    const p = toScreen(wx, wy);
    return Math.hypot(p.x - sx, p.y - sy);
  };
  const nearest = (items, radius) => {
    let best = null, bestD = radius;
    for (const it of items) {
      const d = distTo(it.x, it.y);
      if (d <= bestD) { best = it; bestD = d; }
    }
    return best;
  };

  // event bubbles outrank everything
  const bubbleHit = nearest(S.bubbles.map((b) => ({ x: b.x, y: b.y, b })), 32);
  if (bubbleHit) { openCard(bubbleHit.b); return; }

  // crews are always tappable (switch selection)
  const crewHit = nearest(S.crews.map((c, i) => ({ x: c.x, y: c.y, id: i })), 24);
  if (crewHit) { S.sel = S.sel === crewHit.id ? null : crewHit.id; syncChips(); return; }

  if (S.sel !== null) {
    // damage first, generous 36px targets
    const marks = [];
    for (const l of LINES) {
      if (S.lines[l.id].dmg > 0) {
        const m = lineMid(l.id);
        marks.push({ x: m.x, y: m.y, kind: 'line', id: l.id });
      }
    }
    for (const zid in ZONES) {
      if (S.zones[zid].dmg > 0) marks.push({ x: ZONES[zid].x, y: ZONES[zid].y, kind: 'zone', id: zid });
    }
    const hit = nearest(marks, 36);
    if (hit) return assignCrew(S.sel, { kind: hit.kind, id: hit.id });
    toast('NO DAMAGE THERE — TAP ONE OF THE RED MARKERS.');
    return;
  }

  // inspect: nodes at 24px, then lines at 16px from the wire itself
  const cand = [];
  for (const id in UNITS) cand.push({ x: UNITS[id].x, y: UNITS[id].y, kind: 'PLANT', id });
  for (const id in ZONES) cand.push({ x: ZONES[id].x, y: ZONES[id].y, kind: 'ZONE', id });
  for (const id in SUBS) cand.push({ x: SUBS[id].x, y: SUBS[id].y, kind: 'SUB', id });
  let best = nearest(cand, 24);
  if (!best) {
    let bestD = 16;
    for (const l of LINES) {
      const a = toScreen(SUBS[l.a].x, SUBS[l.a].y);
      const b = toScreen(SUBS[l.b].x, SUBS[l.b].y);
      const d = dist2seg(sx, sy, a.x, a.y, b.x, b.y);
      if (d <= bestD) { best = { kind: 'LINE', id: l.id }; bestD = d; }
    }
  }
  if (!best) { S.focus = null; renderDrawer(); return; }
  S.focus = best;
  renderDrawer();
});

function openCard(b) {
  S.card = { b, resumeSpeed: S.speed || 1 };
  setSpeed(0);
  const drawer = document.getElementById('drawer');
  const tone = { red: '#f05858', amber: '#f0a028', blue: '#5ac8fa', green: '#7bc47f' }[b.ev.tone];
  drawer.innerHTML = `<div class="t" style="color:${tone}">FIELD REPORT</div>
    <div class="row">${b.ev.text(b)}</div>
    ${b.ev.choices.map((c, i) => `<button class="act${i > 0 ? ' alt' : ''}" data-choice="${i}">${c.label}</button>`).join('')}`;
  drawer.classList.add('open');
  for (const btn of drawer.querySelectorAll('[data-choice]')) {
    btn.addEventListener('click', () => {
      const c = b.ev.choices[Number(btn.dataset.choice)];
      S.bubbles = S.bubbles.filter((x) => x !== b);
      c.fx(b);
      toast(c.out);
      closeCard();
    });
  }
}
function closeCard() {
  if (!S.card) return;
  setSpeed(S.card.resumeSpeed);
  S.card = null;
  document.getElementById('drawer').classList.remove('open');
}

function renderDrawer() {
  if (S.card) return;   // a field report owns the drawer until answered
  const drawer = document.getElementById('drawer');
  if (!S.focus) { drawer.classList.remove('open'); return; }
  const f = S.focus;
  let html = '';
  if (f.kind === 'LINE') {
    const st = S.lines[f.id];
    const l = LINES.find((x) => x.id === f.id);
    const status = st.state === 'served' ? 'LIVE'
      : st.state === 'energizing' ? 'POWERING UP…'
      : st.dmg > 0 ? `STORM DAMAGE — NEEDS A CREW (~${Math.ceil(st.dmg / 60)}H OF WORK)`
      : lineTouchesLive(l) ? 'FIXED — READY TO POWER UP'
      : 'FIXED — NO POWER HERE YET. LIGHT A PATH TO IT FIRST.';
    html = `<div class="t">${lineName(f.id)} LINE</div><div class="row">${status}</div>`;
    if (st.state === 'dead' && st.dmg <= 0 && lineTouchesLive(l)) {
      html += `<button class="act" data-energize="${f.id}">POWER UP THIS LINE (${soakMin() / 60} HR${soakMin() > 60 ? 'S' : ''})</button>`;
    }
  } else if (f.kind === 'PLANT') {
    const u = UNITS[f.id], st = S.units[f.id];
    const mw = st.state === 'online' ? (u.stages ? u.stages[st.stage - 1] : u.mw) : 0;
    const label = st.state === 'online' ? `RUNNING · MAKING ${mw} MW`
      : st.state === 'starting' ? 'STARTING UP — GIVE IT A FEW HOURS'
      : u.needsGas && S.zones.Z8.picked === 0 ? 'DARK — NEEDS GAS. POWER THE COMPRESSOR (C-4) FIRST.'
      : 'DARK — STARTS ON ITS OWN ONCE POWER REACHES IT';
    html = `<div class="t">${u.name}</div><div class="tags">POWER PLANT · UP TO ${u.mw} MW</div>
      <div class="row">${label}</div>`;
  } else if (f.kind === 'ZONE') {
    const z = ZONES[f.id], st = S.zones[f.id];
    html = `<div class="t">${z.name}</div>
      <div class="tags">NEIGHBORHOOD · NEEDS ${zoneMw(z)} MW${z.tags.length ? ' · ' + z.tags.join(' · ') : ''}</div>
      <div class="row">${st.dmg > 0 ? `LOCAL LINES DOWN — NEEDS A CREW (~${Math.ceil(st.dmg / 60)}H)` : st.picked >= z.blocks.length ? 'FULLY BACK ON' : st.picked > 0 ? 'COMING BACK ON, SECTION BY SECTION' : 'DARK — WAITING ON POWER'}</div>`;
  } else {
    html = `<div class="t">${SUBS[f.id].name}</div><div class="tags">SWITCHYARD</div>
      <div class="row">${S.subs[f.id] === 'live' ? 'LIVE' : 'DARK'}</div>`;
  }
  drawer.innerHTML = html;
  drawer.classList.add('open');
  const btn = drawer.querySelector('[data-energize]');
  if (btn) btn.addEventListener('click', () => { tryEnergize(btn.dataset.energize); renderDrawer(); });
}

function syncChips() {
  for (const [i, c] of S.crews.entries()) {
    const el = document.getElementById('crew' + i);
    if (!el) continue;   // mutual-aid crew 4 lives on the map only
    el.classList.toggle('sel', S.sel === i);
    el.textContent = `C${i + 1} ${(c.stuckUntil && S.elapsed() < c.stuckUntil) ? '✕' : c.job ? '⚒' : '·'}`;
  }
  const ops = document.getElementById('ops');
  if (ops) ops.textContent = `OPS · ${S.rp}`;
}
for (const i of [0, 1, 2]) {
  document.getElementById('crew' + i).addEventListener('click', () => {
    S.sel = S.sel === i ? null : i; syncChips();
    if (S.sel !== null) toast(`CREW ${i + 1} SELECTED — TAP A RED DAMAGE MARKER`);
  });
}

for (const [i, id] of ['sp0', 'sp1', 'sp2'].entries()) {
  document.getElementById(id).addEventListener('click', () => {
    S.speed = i;
    for (const b of ['sp0', 'sp1', 'sp2']) document.getElementById(b).classList.remove('on');
    document.getElementById(id).classList.add('on');
  });
}
document.getElementById('again').addEventListener('click', () => { reset(); syncChips(); });

document.getElementById('begin').addEventListener('click', () => {
  document.getElementById('intro').classList.remove('show');
  setSpeed(1);
  if (!TUT.done) tutStart();
});
document.getElementById('skiptut').addEventListener('click', () => {
  tutFinish();
  document.getElementById('intro').classList.remove('show');
  setSpeed(1);
});
document.getElementById('help').addEventListener('click', () => {
  document.getElementById('legend').classList.add('show');
});
document.getElementById('legendclose').addEventListener('click', () => {
  document.getElementById('legend').classList.remove('show');
});

function renderOps() {
  const list = document.getElementById('uplist');
  list.innerHTML = UPGRADES.map((u) => {
    const owned = !!S.up[u.id];
    const afford = S.rp >= u.cost;
    return `<div class="uprow${owned ? ' owned' : ''}">
      <div><div class="nm">${u.name}</div><div class="ds">${u.desc}</div></div>
      <button class="buy" data-up="${u.id}" ${owned || !afford ? 'disabled' : ''}>${owned ? 'OWNED' : u.cost + ' PTS'}</button>
    </div>`;
  }).join('');
  for (const btn of list.querySelectorAll('[data-up]')) {
    btn.addEventListener('click', () => {
      const u = UPGRADES.find((x) => x.id === btn.dataset.up);
      if (S.up[u.id] || S.rp < u.cost) return;
      S.rp -= u.cost;
      S.up[u.id] = true;
      toast(`${u.name} ACTIVE`);
      syncChips();
      renderOps();
    });
  }
}
document.getElementById('ops').addEventListener('click', () => {
  renderOps();
  document.getElementById('opspanel').classList.add('show');
});
document.getElementById('opsclose').addEventListener('click', () => {
  document.getElementById('opspanel').classList.remove('show');
});

function setSpeed(i) {
  S.speed = i;
  for (const b of ['sp0', 'sp1', 'sp2']) document.getElementById(b).classList.remove('on');
  document.getElementById(['sp0', 'sp1', 'sp2'][i]).classList.add('on');
}

// ---- loop --------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  dashOff += dt * 30;
  tick(dt * MIN_PER_SEC * S.speed);
  draw();

  document.getElementById('day').textContent = S.day;
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0');
  const mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  document.getElementById('clock').textContent = `${hh}:${mm}`;
  const pct = Math.round((S.servedMw / S.totalMw) * 100) || 0;
  document.getElementById('served').textContent = pct + '%';
  document.getElementById('servedFill').style.width = pct + '%';

  const gen = genMw(), load = loadMw();
  document.getElementById('gen').textContent = `${Math.round(gen)} MW GEN / ${Math.round(load)} LOAD`;
  const margin = load > 0 ? gen / load : 9;
  document.getElementById('gen').style.color =
    margin < STABILITY.TIGHT ? '#f05858' : margin < STABILITY.SOLID ? '#f0a028' : '#8ca4b4';
  document.getElementById('trustFill').style.width = (S.trust / 5) * 100 + '%';

  const tEl = document.getElementById('toasts');
  S.toasts = S.toasts.filter((t) => t.until > now);
  tEl.innerHTML = S.toasts.slice(-3).map((t) => `<div>${t.msg}</div>`).join('');

  tutAdvance();
  document.getElementById('hintline').textContent = nextHint();
  document.getElementById('crew0').classList.toggle('pulse', TUT.step === 2);
  document.getElementById('sp2').classList.toggle('pulse', TUT.step === 4 && S.speed < 2);

  requestAnimationFrame(frame);
}

window.addEventListener('resize', layout);
layout();
reset();
syncChips();
S.speed = 0;   // paused behind the intro card until BEGIN
requestAnimationFrame(frame);

// debug/test hook
window.BS = {
  S, LINES, ZONES, TUT, lineName, toScreen: (x, y) => toScreen(x, y), lineMid,
  EVENTS, spawnBubble, openCard, UPGRADES,
  ff: (min) => { for (let i = 0; i < min; i += 5) tick(5); },
  assign: (ci, kind, id) => assignCrew(ci, { kind, id }),
  energize: tryEnergize,
  gen: genMw, load: loadMw,
};
