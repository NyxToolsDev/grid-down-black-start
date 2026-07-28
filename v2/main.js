// Black Start 2.0 — M1 living-map preview.
// Auto-restoration demo over the canon Harlan Valley board: watch the county
// come back on. Continuous clock, speed controls, tap-to-inspect.
import { SUBS, LINES, ZONES, UNITS, RIVER } from '../src/grid-data.js';

const WORLD = { w: 1600, h: 1200 };
const MIN_PER_SEC = 18;              // sim minutes per real second at 1x
const ENERGIZE_MIN = 150;            // line dash-pulse duration before it holds
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

const COL = {
  bg: '#0b1016', land: '#0e1620', river: '#152534', bank: '#1b3044',
  dead: '#232a33', energize: '#f0a028', served: '#e8d9a8',
  cream: '#f8f4e4', steel: '#8ca4b4', red: '#f05858', panel: '#121a24',
};

// ---- state ----------------------------------------------------------------
const S = {
  min: 6 * 60, day: 1, speed: 1, done: false,
  subs: {}, lines: {}, zones: {}, units: {},
  plan: [], step: 0, nextAt: 0,
  totalMw: 0, servedMw: 0,
  view: { s: 1, ox: 0, oy: 0, rot: false },
  selected: null,
};

function reset() {
  S.min = 6 * 60; S.day = 1; S.done = false; S.step = 0; S.nextAt = 0;
  S.servedMw = 0; S.selected = null;
  for (const id in SUBS) S.subs[id] = 'dead';
  for (const l of LINES) S.lines[l.id] = { state: 'dead', t0: 0 };
  for (const id in ZONES) S.zones[id] = { lit: 0, total: winCount(ZONES[id]) };
  for (const id in UNITS) S.units[id] = 'dead';
  S.units.dam = 'online';
  S.subs.S1 = 'live';
  S.totalMw = Object.values(ZONES).reduce((a, z) => a + zoneMw(z), 0);
  S.plan = buildPlan();
  document.getElementById('endcard').classList.remove('show');
}

const zoneMw = (z) => z.blocks.reduce((a, b) => a + b, 0);
const winCount = (z) => Math.max(3, Math.round(zoneMw(z) / 5));

// BFS from S1 across LINES; each reached sub queues its zones, then any unit
// parked there comes online. Produces the scripted M1 restoration order.
function buildPlan() {
  const plan = [];
  const seen = new Set(['S1']);
  const q = ['S1'];
  const unitAt = {};
  for (const id in UNITS) unitAt[UNITS[id].sub] = id;
  if (unitAt.S1) plan.push({ k: 'unit', id: unitAt.S1, wait: 0 });
  while (q.length) {
    const at = q.shift();
    for (const l of LINES) {
      const other = l.a === at ? l.b : l.b === at ? l.a : null;
      if (!other || seen.has(other)) continue;
      seen.add(other);
      q.push(other);
      plan.push({ k: 'line', id: l.id, to: other, wait: 90 + (l.dmg[1] || 0) * 60 });
      if (unitAt[other]) plan.push({ k: 'unit', id: unitAt[other], wait: 45 });
      for (const zid in ZONES) {
        if (ZONES[zid].sub === other) plan.push({ k: 'zone', id: zid, wait: 40 });
      }
    }
  }
  // S1's own zones (none in canon, but stay data-driven)
  for (const zid in ZONES) if (ZONES[zid].sub === 'S1') plan.unshift({ k: 'zone', id: zid, wait: 30 });
  return plan;
}

// ---- sim tick --------------------------------------------------------------
function tick(dtMin) {
  if (S.done) return;
  S.min += dtMin;
  if (S.min >= 24 * 60) { S.min -= 24 * 60; S.day += 1; }

  for (const l of LINES) {
    const st = S.lines[l.id];
    if (st.state === 'energizing' && S.elapsed() - st.t0 >= ENERGIZE_MIN) {
      st.state = 'served';
      S.subs[l.a] = 'live'; S.subs[l.b] = 'live';
    }
  }

  if (S.step < S.plan.length) {
    if (S.elapsed() >= S.nextAt) {
      const a = S.plan[S.step];
      const linesDone = LINES.every((l) => S.lines[l.id].state !== 'energizing');
      if (a.k === 'line') {
        S.lines[a.id] = { state: 'energizing', t0: S.elapsed() };
        advance(a.wait + ENERGIZE_MIN);
      } else if (a.k === 'unit' && linesDone) {
        S.units[a.id] = 'online';
        advance(a.wait);
      } else if (a.k === 'zone' && linesDone) {
        advance(a.wait);
      } else if (a.k !== 'line') {
        return; // wait for lines to settle
      }
    }
  } else if (!Object.values(S.zones).some((z) => z.lit < z.total)) {
    finish();
  }

  // zones behind a live sub light window-by-window
  for (const zid in ZONES) {
    const z = ZONES[zid];
    const st = S.zones[zid];
    if (S.subs[z.sub] === 'live' && zonePlanReached(zid) && st.lit < st.total) {
      st.acc = (st.acc || 0) + dtMin;
      while (st.acc >= 12 && st.lit < st.total) {
        st.acc -= 12;
        st.lit += 1;
        S.servedMw = Math.min(S.totalMw, S.servedMw + zoneMw(z) / st.total);
      }
    }
  }
}

function zonePlanReached(zid) {
  for (let i = 0; i <= Math.min(S.step, S.plan.length - 1); i++) {
    if (S.plan[i].k === 'zone' && S.plan[i].id === zid) return true;
  }
  return false;
}

S.elapsed = () => (S.day - 1) * 24 * 60 + S.min;
function advance(wait) { S.step += 1; S.nextAt = S.elapsed() + wait; }

function finish() {
  S.done = true;
  document.getElementById('endstats').textContent =
    `${Math.round(S.totalMw)} MW restored · Day ${S.day}`;
  document.getElementById('endcard').classList.add('show');
}

// ---- view transform --------------------------------------------------------
function layout() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rot = h > w;                        // portrait: rotate board 90°
  const bw = rot ? WORLD.h : WORLD.w, bh = rot ? WORLD.w : WORLD.h;
  const s = Math.min(w / bw, (h - 120) / bh) * 0.96;
  S.view = { s, ox: (w - bw * s) / 2, oy: 60 + (h - 120 - bh * s) / 2, rot };
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

// ---- draw -------------------------------------------------------------------
let dashOff = 0;
function nightAlpha() {
  const h = S.min / 60;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 21) return (h - 18) / 3 * 0.45;
  if (h >= 21 || h < 5) return 0.45;
  return (5 + 2 - h) / 2 * 0.45; // 5-7 dawn
}

function draw() {
  const w = window.innerWidth, h = window.innerHeight;
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

  // land + river
  const p0 = toScreen(0, 0), p1 = toScreen(WORLD.w, WORLD.h);
  const lx = Math.min(p0.x, p1.x), ly = Math.min(p0.y, p1.y);
  const lw = Math.abs(p1.x - p0.x), lh = Math.abs(p1.y - p0.y);
  ctx.fillStyle = COL.land; ctx.fillRect(lx, ly, lw, lh);
  const ra = toScreen(RIVER.x - 34, RIVER.top), rb = toScreen(RIVER.x + 34, RIVER.bottom);
  ctx.fillStyle = COL.river;
  ctx.fillRect(Math.min(ra.x, rb.x), Math.min(ra.y, rb.y),
    Math.abs(rb.x - ra.x), Math.abs(rb.y - ra.y));

  // transmission lines
  for (const l of LINES) {
    const a = toScreen(SUBS[l.a].x, SUBS[l.a].y);
    const b = toScreen(SUBS[l.b].x, SUBS[l.b].y);
    const st = S.lines[l.id].state;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    if (st === 'dead') {
      ctx.strokeStyle = COL.dead; ctx.lineWidth = 2; ctx.setLineDash([]);
    } else if (st === 'energizing') {
      ctx.strokeStyle = COL.energize; ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -dashOff;
    } else {
      ctx.strokeStyle = COL.served; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // feeders sub->zone (thin)
  for (const zid in ZONES) {
    const z = ZONES[zid];
    const a = toScreen(SUBS[z.sub].x, SUBS[z.sub].y);
    const b = toScreen(z.x, z.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = S.zones[zid].lit > 0 ? '#8a7a4a' : '#1a222c';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // substations
  for (const id in SUBS) {
    const p = toScreen(SUBS[id].x, SUBS[id].y);
    const live = S.subs[id] === 'live';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = live ? COL.served : COL.panel;
    ctx.strokeStyle = live ? COL.served : '#33404e';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  }

  // zones: window clusters
  for (const zid in ZONES) {
    const z = ZONES[zid];
    const st = S.zones[zid];
    const p = toScreen(z.x, z.y);
    const cols = Math.ceil(Math.sqrt(st.total * 1.6));
    for (let i = 0; i < st.total; i++) {
      const wx = p.x + (i % cols) * 8 - (cols * 8) / 2;
      const wy = p.y + Math.floor(i / cols) * 10 - 8;
      if (i < st.lit) {
        const flick = Math.random() < 0.004;
        ctx.fillStyle = flick ? '#7a6a3a' : '#ffd76a';
        ctx.fillRect(wx, wy, 5, 7);
      } else {
        ctx.fillStyle = '#151d27';
        ctx.fillRect(wx, wy, 5, 7);
      }
    }
    if (z.tags.length && st.lit === 0) {
      ctx.fillStyle = COL.red;
      ctx.fillRect(p.x - (cols * 8) / 2 - 8, p.y - 6, 3, 3);
    }
  }

  // units
  for (const id in UNITS) {
    const u = UNITS[id];
    const p = toScreen(u.x, u.y);
    const on = S.units[id] === 'online';
    ctx.fillStyle = on ? COL.energize : COL.panel;
    ctx.strokeStyle = on ? COL.energize : '#33404e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(p.x - 11, p.y - 11, 22, 22, 5);
    ctx.fill(); ctx.stroke();
    if (!on && u.blackStart && Math.floor(performance.now() / 600) % 2) {
      ctx.fillStyle = COL.red; ctx.fillRect(p.x - 2, p.y - 16, 4, 3);
    }
    ctx.fillStyle = on ? '#0b1016' : COL.steel;
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.name[0], p.x, p.y + 1);
  }

  // night tint (windows stay bright: draw over land only, then re-glow)
  const na = nightAlpha();
  if (na > 0) {
    ctx.fillStyle = `rgba(4,8,16,${na})`;
    ctx.fillRect(lx, ly, lw, lh);
    for (const zid in ZONES) {
      const z = ZONES[zid]; const st = S.zones[zid];
      const p = toScreen(z.x, z.y);
      const cols = Math.ceil(Math.sqrt(st.total * 1.6));
      for (let i = 0; i < st.lit; i++) {
        const wx = p.x + (i % cols) * 8 - (cols * 8) / 2;
        const wy = p.y + Math.floor(i / cols) * 10 - 8;
        ctx.fillStyle = '#ffd76a';
        ctx.fillRect(wx, wy, 5, 7);
      }
    }
  }
}

// ---- input ------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  const wpt = toWorld(e.clientX, e.clientY);
  let best = null, bestD = Infinity;
  const cand = [];
  for (const id in UNITS) cand.push({ x: UNITS[id].x, y: UNITS[id].y, kind: 'PLANT', id });
  for (const id in ZONES) cand.push({ x: ZONES[id].x, y: ZONES[id].y, kind: 'ZONE', id });
  for (const id in SUBS) cand.push({ x: SUBS[id].x, y: SUBS[id].y, kind: 'SUBSTATION', id });
  const tol = 55 / S.view.s;
  for (const c of cand) {
    const d = (c.x - wpt.x) ** 2 + (c.y - wpt.y) ** 2;
    if (d < tol * tol && (!best || d < bestD)) { best = c; bestD = d; }
  }
  const drawer = document.getElementById('drawer');
  if (!best) { drawer.classList.remove('open'); return; }
  drawer.innerHTML = describe(best);
  drawer.classList.add('open');
});

function describe(c) {
  if (c.kind === 'PLANT') {
    const u = UNITS[c.id];
    const st = S.units[c.id] === 'online' ? 'ONLINE' : u.blackStart ? 'DARK · BLACKSTART CAPABLE' : 'DARK';
    return `<div class="t">${u.name}</div><div class="tags">GENERATION · ${u.mw} MW</div><div class="row">${st}</div>`;
  }
  if (c.kind === 'ZONE') {
    const z = ZONES[c.id]; const st = S.zones[c.id];
    const pct = Math.round((st.lit / st.total) * 100);
    return `<div class="t">${z.name}</div><div class="tags">LOAD · ${zoneMw(z)} MW${z.tags.length ? ' · ' + z.tags.join(' · ') : ''}</div><div class="row">${pct}% SERVED</div>`;
  }
  const s = SUBS[c.id];
  return `<div class="t">${s.name}</div><div class="tags">SUBSTATION</div><div class="row">${S.subs[c.id] === 'live' ? 'ENERGIZED' : 'DEAD BUS'}</div>`;
}

for (const [i, id] of ['sp0', 'sp1', 'sp2'].entries()) {
  document.getElementById(id).addEventListener('click', () => {
    S.speed = i; // 0 = pause, 1 = 1x, 2 = 2x
    for (const b of ['sp0', 'sp1', 'sp2']) document.getElementById(b).classList.remove('on');
    document.getElementById(id).classList.add('on');
  });
}
document.getElementById('again').addEventListener('click', reset);

// ---- loop -------------------------------------------------------------------
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
  requestAnimationFrame(frame);
}

window.addEventListener('resize', layout);
layout();
reset();
requestAnimationFrame(frame);

// debug hook for automated tests: fast-forward N sim minutes
window.BS = { S, ff: (min) => { for (let i = 0; i < min; i += 5) tick(5); } };
