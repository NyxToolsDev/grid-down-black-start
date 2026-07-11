// Weighted event deck engine: state-gated draws, bad-luck protection, telegraphs.

import { EVENTS, MAJORS } from './event-data.js';
import { rng } from './sim.js';

export const initDeck = (state) => {
  const ids = EVENTS.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng(state) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.deck = ids;
  state.discard = [];
};

const eligible = (state, ev) => !ev.when || ev.when(state);

// Draw 1-2 events for the day. After 3 consecutive negatives, the next draw
// is guaranteed neutral-or-positive.
export const drawDay = (state) => {
  const count = rng(state) < 0.6 ? 1 : 2;
  const drawn = [];
  const skipped = [];
  while (drawn.length < count && state.deck.length > 0) {
    const id = state.deck.shift();
    const ev = EVENTS.find((e) => e.id === id);
    if (!eligible(state, ev) ||
        (state.negStreak >= 3 && ev.tone === 'neg')) {
      skipped.push(id);
      continue;
    }
    drawn.push(ev);
    state.discard.push(id);
    state.negStreak = ev.tone === 'neg' ? state.negStreak + 1 : 0;
  }
  state.deck.push(...skipped);
  if (state.deck.length < 8) {
    state.deck.push(...state.discard);
    state.discard = [];
  }
  return drawn;
};

export const majorFor = (state) =>
  state.exercise ? null : (MAJORS[state.day] || null);

export const applyChoice = (state, ev, idx, log) => {
  const choice = ev.choices[idx];
  if (choice.fx) choice.fx(state, log);
  if (choice.out) log.push(`       ${choice.out}`);
};
