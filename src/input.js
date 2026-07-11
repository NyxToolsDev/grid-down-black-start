// Pointer pan/zoom/tap on the board, plus desktop keyboard.

import { view, markDirty, hitTest } from './board.js';

export const attachInput = (canvas, getState, onTap) => {
  const pointers = new Map();
  let panStart = null;
  let pinchStart = null;
  let moved = false;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    moved = false;
    if (pointers.size === 1) {
      panStart = { p: pos(e), x: view.x, y: view.y };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(a[0] - b[0], a[1] - b[1]),
        scale: view.scale,
        mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        x: view.x, y: view.y,
      };
      panStart = null;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const factor = dist / pinchStart.dist;
      const ns = Math.max(0.2, Math.min(2.5, pinchStart.scale * factor));
      const [mx, my] = pinchStart.mid;
      view.x = mx - ((mx - pinchStart.x) / pinchStart.scale) * ns;
      view.y = my - ((my - pinchStart.y) / pinchStart.scale) * ns;
      view.scale = ns;
      moved = true;
      markDirty();
    } else if (pointers.size === 1 && panStart) {
      const [px, py] = pos(e);
      const dx = px - panStart.p[0];
      const dy = py - panStart.p[1];
      if (Math.hypot(dx, dy) > 6) moved = true;
      view.x = panStart.x + dx;
      view.y = panStart.y + dy;
      markDirty();
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      if (!moved && e.type === 'pointerup') {
        const [px, py] = pos(e);
        const hit = hitTest(getState(), px, py);
        if (hit) onTap(hit);
      }
      panStart = null;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = pos(e);
    const ns = Math.max(0.2, Math.min(2.5, view.scale * (e.deltaY < 0 ? 1.15 : 0.87)));
    view.x = px - ((px - view.x) / view.scale) * ns;
    view.y = py - ((py - view.y) / view.scale) * ns;
    view.scale = ns;
    markDirty();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const step = 60;
    if (e.key === 'ArrowLeft') { view.x += step; markDirty(); }
    else if (e.key === 'ArrowRight') { view.x -= step; markDirty(); }
    else if (e.key === 'ArrowUp') { view.y += step; markDirty(); }
    else if (e.key === 'ArrowDown') { view.y -= step; markDirty(); }
    else if (e.key === '+' || e.key === '=') { view.scale = Math.min(2.5, view.scale * 1.15); markDirty(); }
    else if (e.key === '-') { view.scale = Math.max(0.2, view.scale * 0.87); markDirty(); }
  });
};
