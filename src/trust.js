// Public trust drift, broadcasts, promises, equity tracking.

import { zoneServed, servedPct } from './sim.js';

const clamp = (v) => Math.max(0, Math.min(10, v));

export const dailyTrustDrift = (state, log) => {
  const c = state.clocks;
  let delta = 0;
  const pct = servedPct(state);
  const progressed = pct > (state.prevServedPct ?? 0);
  state.prevServedPct = Math.max(state.prevServedPct ?? 0, pct);

  if (!c.hospitalOk && !c.hospitalEvac && state.day >= 4) delta -= 0.3;
  if (!c.waterOk && state.day >= 3) delta -= 0.3;
  if (c.boilOrder && !c.waterOk) delta -= 0.2;
  if (c.overflow && !c.sewageOk) delta -= 0.1;
  if (!zoneServed(state, 'Z16') && state.day >= 10) delta -= 0.3;
  // Visible progress buys patience; a stalled board does not.
  if (progressed) {
    delta += 0.4;
    log.push('       more of the valley lit tonight than last night. it buys patience.');
  } else if (state.day > 10) {
    delta -= (100 - pct) * 0.005;
  }

  if (state.trustEcho > 0) {
    delta += 0.25;
    state.trustEcho -= 1;
  }

  const milestone = (flag, cond, gain, line) => {
    if (!state.flags[flag] && cond) {
      state.flags[flag] = true;
      delta += gain;
      log.push(`       ${line}`);
    }
  };
  milestone('mHalf', servedPct(state) >= 50, 1,
    'HALF THE REGION HAS LIGHTS. people are talking about it.');
  milestone('mMost', servedPct(state) >= 80, 1,
    'MOST OF THE VALLEY IS BACK. the mood turns a corner.');

  state.trust = clamp(state.trust + delta);
};

// Equity: Westbrook served while Garfield sits ready and dark.
export const tickEquity = (state) => {
  const westOn = state.zones.Z10.picked > 0 && state.subs.S8.energized;
  const garReady = state.zones.Z11.dmg === 0 && state.subs.S9.energized;
  const garDark = state.zones.Z11.picked === 0;
  if (westOn && garReady && garDark) state.score.equityDebt += 1;
};

export const BROADCAST_DAYS = [1, 3, 5, 10, 15, 20, 25];

export const applyBroadcast = (state, stance, log) => {
  if (stance === 'honest') {
    state.trust = clamp(state.trust - 0.5);
    state.trustEcho = 3;
    state.score.honesty += 1;
    log.push('       BROADCAST: the honest version. numbers, dates we can defend, no varnish.');
    log.push('       vee: "they won\'t like it tonight. they\'ll remember it next week."');
  } else if (stance === 'reassure') {
    state.trust = clamp(state.trust + 1);
    state.score.honesty -= 1;
    state.promise = { pct: Math.min(95, servedPct(state) + 25), byDay: state.day + 5 };
    log.push(`       BROADCAST: the confident version. ${state.promise.pct}% by day ${state.promise.byDay}, on the record.`);
    log.push('       corbin approves. priya does not look up from her forecast.');
  } else {
    if (state.day > 5) {
      state.trust = clamp(state.trust - 0.5);
      log.push('       NO BROADCAST. after this long, silence reads as abandonment.');
    } else {
      log.push('       NO BROADCAST TODAY.');
    }
  }
};

export const checkPromise = (state, log) => {
  if (!state.promise || state.day < state.promise.byDay) return;
  const met = servedPct(state) >= state.promise.pct;
  if (met) {
    state.trust = clamp(state.trust + 0.5);
    log.push('       PROMISE KEPT. the radio said we would, and we did.');
  } else {
    state.trust = clamp(state.trust - 1.5);
    state.score.promisesMissed += 1;
    log.push(`**** PROMISE MISSED — ${state.promise.pct}% BY TODAY, ` +
      `ACTUAL ${servedPct(state)}%. the mayor plays the clip on his show.`);
  }
  state.promise = null;
};
