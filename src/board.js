// The phosphor board: one-line diagram on canvas with fog, flow pulses,
// stability alarms, and the window-light payoff. Redraws on demand plus a
// 4 Hz pulse tick — no continuous rAF burn.

import { SUBS, LINES, ZONES, UNITS, RIVER } from './grid-data.js';
import { islandsOf, unitReady, unitMW, zoneServed } from './sim.js';

export const COLORS = {
  bg: '#050807',
  live: '#33ff66',
  dim: '#1a8040',
  dead: '#0d3520',
  text: '#d8ffe0',
  amber: '#ffb000',
  red: '#e0301e',
  river: '#0a2030',
};

export const view = { x: 0, y: 0, scale: 0.5, w: 0, h: 0 };

let canvas, ctx;
let pulse = 0;

export const initBoard = (el) => {
  canvas = el;
  ctx = canvas.getContext('2d');
  resize();
  setInterval(() => { pulse = (pulse + 1) % 8; boardDirty = true; }, 250);
};

export const resize = () => {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  view.w = canvas.clientWidth;
  view.h = canvas.clientHeight;
  canvas.width = view.w * dpr;
  canvas.height = view.h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boardDirty = true;
};

export const fitBoard = () => {
  const margin = 60;
  const sx = view.w / (1700 + margin);
  const sy = view.h / (1250 + margin);
  view.scale = Math.min(sx, sy);
  view.x = (view.w - 1650 * view.scale) / 2;
  view.y = (view.h - 1150 * view.scale) / 2;
  boardDirty = true;
};

export let boardDirty = true;
export const markDirty = () => { boardDirty = true; };

const toScreen = (x, y) => [x * view.scale + view.x, y * view.scale + view.y];

export const toWorld = (sx, sy) => [
  (sx - view.x) / view.scale, (sy - view.y) / view.scale,
];

export const hitTest = (state, sx, sy) => {
  const [wx, wy] = toWorld(sx, sy);
  const r = 40;
  for (const [id, u] of Object.entries(UNITS)) {
    if (id === 'tie' && !state.units.tie.deal) continue;
    if (Math.hypot(u.x - wx, u.y - wy) < r) return { type: 'unit', id };
  }
  for (const [id, s] of Object.entries(SUBS)) {
    if (!state.subs[id].revealed) continue;
    if (Math.hypot(s.x - wx, s.y - wy) < r) return { type: 'sub', id };
  }
  for (const [id, z] of Object.entries(ZONES)) {
    if (!state.zones[id].revealed) continue;
    if (Math.hypot(z.x - wx, z.y - wy) < r + 10) return { type: 'zone', id };
  }
  return null;
};

const line = (x1, y1, x2, y2, color, width, dash = []) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(...toScreen(x1, y1));
  ctx.lineTo(...toScreen(x2, y2));
  ctx.stroke();
  ctx.setLineDash([]);
};

const label = (text, x, y, color, size = 11, align = 'center') => {
  if (view.scale < 0.35) return;
  ctx.fillStyle = color;
  ctx.font = `${Math.max(9, size * Math.min(1, view.scale * 1.6))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = align;
  const [sx, sy] = toScreen(x, y);
  ctx.fillText(text, sx, sy);
};

export const render = (state) => {
  if (!ctx) return;
  boardDirty = false;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, view.w, view.h);

  // The Harlan River
  ctx.strokeStyle = COLORS.river;
  ctx.lineWidth = 26 * view.scale;
  ctx.beginPath();
  const [rx0, ry0] = toScreen(RIVER.x, RIVER.top);
  ctx.moveTo(rx0, ry0);
  ctx.bezierCurveTo(
    ...toScreen(RIVER.x - 60, 400), ...toScreen(RIVER.x + 60, 800),
    ...toScreen(RIVER.x, RIVER.bottom));
  ctx.stroke();
  label('HARLAN RIVER', RIVER.x + 30, 450, COLORS.river.replace('30', '60'), 10, 'left');

  const islands = islandsOf(state);
  const islandStatus = {};
  islands.forEach((isl) => isl.subs.forEach((s) => { islandStatus[s] = isl.status; }));

  // Transmission lines
  for (const l of LINES) {
    const st = state.lines[l.id];
    const A = SUBS[l.a]; const B = SUBS[l.b];
    if (!st.revealed) continue;
    if (st.dmg > 0) {
      line(A.x, A.y, B.x, B.y, COLORS.dead, 2, [6, 8]);
      const mx = (A.x + B.x) / 2; const my = (A.y + B.y) / 2;
      label(`${st.dmg}D`, mx, my - 8, COLORS.amber, 10);
    } else if (st.closed && state.subs[l.a].energized && state.subs[l.b].energized) {
      line(A.x, A.y, B.x, B.y, COLORS.live, 2.5);
      // marching flow dots
      const dots = 4;
      for (let i = 0; i < dots; i++) {
        const t = ((i / dots) + pulse / 8) % 1;
        const x = A.x + (B.x - A.x) * t;
        const y = A.y + (B.y - A.y) * t;
        const [sx, sy] = toScreen(x, y);
        ctx.fillStyle = COLORS.text;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
    } else {
      line(A.x, A.y, B.x, B.y, COLORS.dim, 1.5, [2, 4]);
    }
  }

  // Substations
  for (const [id, s] of Object.entries(SUBS)) {
    const st = state.subs[id];
    if (!st.revealed) continue;
    const [sx, sy] = toScreen(s.x, s.y);
    const size = 14 * Math.max(0.6, view.scale);
    const status = islandStatus[id];
    let color = st.energized ? COLORS.live : COLORS.dead;
    if (st.energized && status === 'TIGHT') color = COLORS.amber;
    if (st.energized && status === 'CRITICAL') color = pulse % 2 ? COLORS.red : COLORS.amber;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - size / 2, sy - size / 2, size, size);
    if (st.energized) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    if (st.transformer === 'destroyed') label('XFMR LOST', s.x, s.y + 34, COLORS.red, 9);
    else if (st.dmg > 0) label(`${st.dmg}D`, s.x, s.y + 34, COLORS.amber, 10);
    if (st.secured > 0) label('SEC', s.x, s.y - 22, COLORS.dim, 8);
    label(s.name, s.x, s.y + (st.dmg > 0 ? 46 : 34) - (st.dmg > 0 ? 0 : 12) + 12,
      st.energized ? COLORS.text : COLORS.dim, 9);
  }

  // Generation units
  for (const [id, u] of Object.entries(UNITS)) {
    if (id === 'tie' && !state.units.tie.deal) continue;
    const revealed = state.subs[u.sub].revealed || id === 'dam';
    if (!revealed) continue;
    const [sx, sy] = toScreen(u.x, u.y);
    const r = 11 * Math.max(0.6, view.scale);
    const ready = unitReady(state, id);
    const mw = unitMW(state, id);
    ctx.strokeStyle = ready ? COLORS.live : COLORS.dead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ready ? COLORS.live : COLORS.dead;
    ctx.font = `${Math.max(8, 10 * view.scale)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('~', sx, sy + 3);
    const host = SUBS[u.sub];
    line(u.x, u.y, host.x, host.y, ready ? COLORS.live : COLORS.dead, 1.5, ready ? [] : [2, 4]);
    label(u.name, u.x, u.y - 20, ready ? COLORS.text : COLORS.dim, 9);
    label(ready ? `${mw} MW` : offlineTag(state, id), u.x, u.y + 28,
      ready ? COLORS.live : COLORS.dim, 9);
  }

  // Load zones: clusters of window lights
  for (const [id, z] of Object.entries(ZONES)) {
    const st = state.zones[id];
    if (!st.revealed) continue;
    const [sx, sy] = toScreen(z.x, z.y);
    const on = st.picked > 0 && state.subs[z.sub].energized;
    const full = zoneServed(state, id);
    const cols = 4; const rows = 2;
    for (let i = 0; i < cols * rows; i++) {
      const px = sx + (i % cols) * 7 - 10;
      const py = sy + Math.floor(i / cols) * 7 - 4;
      const litShare = st.picked / z.blocks.length;
      const lit = on && (i / (cols * rows)) < litShare;
      ctx.fillStyle = lit ? COLORS.amber : COLORS.dead;
      ctx.globalAlpha = lit ? 0.9 : 0.5;
      ctx.fillRect(px, py, 4, 4);
      ctx.globalAlpha = 1;
    }
    const host = SUBS[z.sub];
    line(z.x, z.y, host.x, host.y, on ? COLORS.dim : COLORS.dead, 1, [1, 5]);
    label(z.name, z.x, z.y + 26, full ? COLORS.text : COLORS.dim, 8);
    if (st.dmg > 0) label(`FDR ${st.dmg}D`, z.x, z.y - 14, COLORS.amber, 8);
  }

  // Eastlake direction arrow
  if (state.units.tie.deal) {
    label('→ EASTLAKE', 1180, 890, COLORS.dim, 9, 'left');
  }
};

const offlineTag = (state, id) => {
  const u = state.units[id];
  if (id === 'peakers') return u.battery ? 'READY' : 'BATT DEAD';
  if (id === 'ccgt') return u.staffed ? 'STAGING' : 'DARK';
  if (id === 'coal') return u.staffed ? 'FIRING' : 'DARK';
  if (id === 'tie') return u.gear ? 'STANDBY' : 'NO GEAR';
  return 'OFF';
};
