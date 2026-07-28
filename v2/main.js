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

function reset() {
  S.min = 6 * 60; S.day = 1; S.over = false; S.trust = 5; S.zeroDawns = 0;
  S.lastServedFrac = 0; S.servedMw = 0; S.sel = null; S.focus = null; S.toasts = [];
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
  toast(`STORM SEED ${SEED} · 3 LINE CREWS AT HARLAN FALLS`);
  toast('TAP A CREW CHIP, THEN TAP DAMAGE.');
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
  toast(`ENERGIZING ${lineId} · ${ENERGIZE_MIN / 60}H SOAK`);
  S.focus = null;
}

function assignCrew(ci, target) {
  const c = S.crews[ci];
  c.job = target; // {kind:'line'|'zone', id}
  const p = target.kind === 'line' ? lineMid(target.id)
    : { x: ZONES[target.id].x, y: ZONES[target.id].y };
  c.dest = p;
  toast(`CREW ${ci + 1} ROLLING TO ${target.kind === 'line' ? target.id : ZONES[target.id].name}`);
  S.sel = null;
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
  for (const c of S.crews) {
    if (!c.job) continue;
    const d = Math.hypot(c.dest.x - c.x, c.dest.y - c.y);
    const step = CREW_SPEED * dtMin;
    if (d > 14) {
      c.x += ((c.dest.x - c.x) / d) * Math.min(step, d);
      c.y += ((c.dest.y - c.y) / d) * Math.min(step, d);
    } else {
      const pool = c.job.kind === 'line' ? S.lines[c.job.id] : S.zones[c.job.id];
      if (pool.dmg > 0) {
        pool.dmg -= dtMin;
        if (pool.dmg <= 0) {
          pool.dmg = 0;
          toast(`${c.job.kind === 'line' ? c.job.id : ZONES[c.job.id].name} REPAIRED`);
          c.job = null;
        }
      } else c.job = null;
    }
  }

  // energizing lines settle
  for (const l of LINES) {
    const st = S.lines[l.id];
    if (st.state === 'energizing' && S.elapsed() - st.t0 >= ENERGIZE_MIN) {
      st.state = 'served';
      S.subs[l.a] = 'live'; S.subs[l.b] = 'live';
    }
  }

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
  if (S.pickAcc >= 30) {
    S.pickAcc = 0;
    const gen = genMw();
    for (const id in ZONES) {
      const z = ZONES[id], st = S.zones[id];
      if (S.subs[z.sub] !== 'live' || st.dmg > 0 || st.picked >= z.blocks.length) continue;
      const block = z.blocks[st.picked];
      const after = loadMw() + block;
      if (after * STABILITY.TIGHT > gen) continue;                 // blocked: too tight
      if (after * STABILITY.SOLID > gen && rnd() < TRIP_CHANCE.TIGHT) { trip(); return; }
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
  toast('UNDERFREQUENCY TRIP · LOAD SHED · TRUST FALLING');
}

function dawn() {
  const frac = S.servedMw / S.totalMw;
  S.trust = Math.max(0, S.trust - (1 - frac) * 0.8);
  if (frac > S.lastServedFrac + 0.001) S.trust = Math.min(5, S.trust + 0.4);
  S.lastServedFrac = frac;
  if (S.trust <= 0.01) {
    S.zeroDawns += 1;
    if (S.zeroDawns >= 2) return lose();
    toast('THE COUNTY EXECUTIVE IS ASKING FOR NAMES.');
  } else S.zeroDawns = 0;
  toast(`DAY ${S.day} · ${Math.round(frac * 100)}% SERVED · TRUST ${S.trust.toFixed(1)}`);
}

function win() {
  S.over = true;
  end('HARLAN VALLEY · LIGHTS ON',
    `${Math.round(S.totalMw)} MW restored · Day ${S.day} · Trust ${S.trust.toFixed(1)}/5`);
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
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);
  const p0 = toScreen(0, 0), p1 = toScreen(WORLD.w, WORLD.h);
  const lx = Math.min(p0.x, p1.x), ly = Math.min(p0.y, p1.y);
  const lw = Math.abs(p1.x - p0.x), lh = Math.abs(p1.y - p0.y);
  ctx.fillStyle = COL.land; ctx.fillRect(lx, ly, lw, lh);
  const ra = toScreen(RIVER.x - 34, RIVER.top), rb = toScreen(RIVER.x + 34, RIVER.bottom);
  ctx.fillStyle = COL.river;
  ctx.fillRect(Math.min(ra.x, rb.x), Math.min(ra.y, rb.y), Math.abs(rb.x - ra.x), Math.abs(rb.y - ra.y));

  for (const l of LINES) {
    const a = toScreen(SUBS[l.a].x, SUBS[l.a].y);
    const b = toScreen(SUBS[l.b].x, SUBS[l.b].y);
    const st = S.lines[l.id];
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
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = COL.red; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
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
  }

  const gen = genMw(), load = loadMw();
  const tight = load > 0 && load * STABILITY.SOLID > gen;
  for (const zid in ZONES) {
    const z = ZONES[zid], st = S.zones[zid];
    const p = toScreen(z.x, z.y);
    const cols = Math.ceil(Math.sqrt(st.total * 1.6));
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
}

// ---- input -------------------------------------------------------------------
function dist2seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

canvas.addEventListener('pointerdown', (e) => {
  if (S.over) return;
  const wpt = toWorld(e.clientX, e.clientY);
  const tol = 50 / S.view.s;

  // nearest node
  let best = null, bestD = Infinity;
  const cand = [];
  for (const id in UNITS) cand.push({ x: UNITS[id].x, y: UNITS[id].y, kind: 'PLANT', id });
  for (const id in ZONES) cand.push({ x: ZONES[id].x, y: ZONES[id].y, kind: 'ZONE', id });
  for (const id in SUBS) cand.push({ x: SUBS[id].x, y: SUBS[id].y, kind: 'SUB', id });
  for (const [i, c] of S.crews.entries()) cand.push({ x: c.x, y: c.y, kind: 'CREW', id: i });
  for (const c of cand) {
    const d = Math.hypot(c.x - wpt.x, c.y - wpt.y);
    if (d < tol && d < bestD) { best = c; bestD = d; }
  }
  // else nearest line
  if (!best) {
    for (const l of LINES) {
      const d = dist2seg(wpt.x, wpt.y, SUBS[l.a].x, SUBS[l.a].y, SUBS[l.b].x, SUBS[l.b].y);
      if (d < tol * 0.8 && d < bestD) { best = { kind: 'LINE', id: l.id }; bestD = d; }
    }
  }

  if (!best) { S.focus = null; renderDrawer(); return; }

  if (best.kind === 'CREW') { S.sel = S.sel === best.id ? null : best.id; syncChips(); return; }

  // crew selected -> assign if target is damaged
  if (S.sel !== null) {
    if (best.kind === 'LINE' && S.lines[best.id].dmg > 0) return assignCrew(S.sel, { kind: 'line', id: best.id });
    if (best.kind === 'ZONE' && S.zones[best.id].dmg > 0) return assignCrew(S.sel, { kind: 'zone', id: best.id });
    toast('NO DAMAGE THERE. TAP A RED MARKER.');
    return;
  }

  S.focus = best;
  renderDrawer();
});

function renderDrawer() {
  const drawer = document.getElementById('drawer');
  if (!S.focus) { drawer.classList.remove('open'); return; }
  const f = S.focus;
  let html = '';
  if (f.kind === 'LINE') {
    const st = S.lines[f.id];
    const l = LINES.find((x) => x.id === f.id);
    const status = st.state === 'served' ? 'IN SERVICE'
      : st.state === 'energizing' ? 'ENERGIZING · SOAKING'
      : st.dmg > 0 ? `STORM DAMAGE · ${Math.ceil(st.dmg / 60)}H OF CREW WORK`
      : lineTouchesLive(l) ? 'REPAIRED · READY TO ENERGIZE' : 'REPAIRED · NO LIVE SOURCE YET';
    html = `<div class="t">LINE ${f.id}</div><div class="tags">TRANSMISSION</div><div class="row">${status}</div>`;
    if (st.state === 'dead' && st.dmg <= 0 && lineTouchesLive(l)) {
      html += `<button class="act" data-energize="${f.id}">ENERGIZE — ${ENERGIZE_MIN / 60}H SOAK</button>`;
    }
  } else if (f.kind === 'PLANT') {
    const u = UNITS[f.id], st = S.units[f.id];
    const mw = st.state === 'online' ? (u.stages ? u.stages[st.stage - 1] : u.mw) : 0;
    html = `<div class="t">${u.name}</div><div class="tags">GENERATION · ${u.mw} MW MAX</div>
      <div class="row">${st.state.toUpperCase()}${mw ? ` · ${mw} MW ON THE BUS` : ''}${u.needsGas && S.zones.Z8.picked === 0 ? ' · WAITING ON GAS (SERVE C-4)' : ''}</div>`;
  } else if (f.kind === 'ZONE') {
    const z = ZONES[f.id], st = S.zones[f.id];
    html = `<div class="t">${z.name}</div>
      <div class="tags">LOAD · ${zoneMw(z)} MW${z.tags.length ? ' · ' + z.tags.join(' · ') : ''}</div>
      <div class="row">${st.dmg > 0 ? `FEEDER DAMAGE · ${Math.ceil(st.dmg / 60)}H CREW WORK` : `${st.picked}/${z.blocks.length} BLOCKS PICKED UP`}</div>`;
  } else {
    html = `<div class="t">${SUBS[f.id].name}</div><div class="tags">SUBSTATION</div>
      <div class="row">${S.subs[f.id] === 'live' ? 'ENERGIZED' : 'DEAD BUS'}</div>`;
  }
  drawer.innerHTML = html;
  drawer.classList.add('open');
  const btn = drawer.querySelector('[data-energize]');
  if (btn) btn.addEventListener('click', () => { tryEnergize(btn.dataset.energize); renderDrawer(); });
}

function syncChips() {
  for (const [i, c] of S.crews.entries()) {
    const el = document.getElementById('crew' + i);
    el.classList.toggle('sel', S.sel === i);
    el.textContent = `C${i + 1} ${c.job ? '⚒' : '·'}`;
  }
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

  requestAnimationFrame(frame);
}

window.addEventListener('resize', layout);
layout();
reset();
syncChips();
requestAnimationFrame(frame);

// debug/test hook
window.BS = {
  S, LINES, ZONES,
  ff: (min) => { for (let i = 0; i < min; i += 5) tick(5); },
  assign: (ci, kind, id) => assignCrew(ci, { kind, id }),
  energize: tryEnergize,
  gen: genMw, load: loadMw,
};
