// Cold open, jargon glosses, endings, epilogues. House voice: understated.

import { ZONES } from './grid-data.js';
import { zoneServed, servedPct } from './sim.js';

export const COLD_OPEN = [
  {
    h: 'TUESDAY. 4:17 PM.',
    p: 'Control room, Harlan Valley Power & Light. Your coffee is still warm when the first alarm comes in — a line loading where no line should be loading, somewhere upstream, out of your area and out of your hands.',
  },
  {
    h: '4:19 PM.',
    p: 'The cascade walks across the interconnection like weather on a radar loop. You shed load. It is the right call, made fast, and it does not matter. Twelve seconds later the frequency is gone and the board goes dark from the top down.',
  },
  {
    h: '4:20 PM.',
    p: 'The hum stops. You have worked in this room for eleven years and you have never once heard it this quiet. Vee says, to nobody: "Well." Somewhere out there, thirty-eight miles of people are about to start walking home.',
  },
  {
    h: 'WEDNESDAY. 6:00 AM. DAY 1.',
    p: 'Harlan Falls rode it out on house units — forty megawatts of hydro, alive behind a dam, connected to nothing. Everything else on the board is a question mark. This is a black start. You have done it in drills every fall. The drill never had this many phone calls in it.',
  },
];

export const EXERCISE_OPEN = [
  {
    h: 'ANNUAL BLACK START EXERCISE',
    p: 'Every fall, Harlan Valley Power & Light kills the simulator board and makes the ops room bring it back from one hydro dam. Ten days on the clock, real procedures, no real consequences. Vee runs the scenario desk and shows no mercy.',
  },
];

export const EXERCISE_CLOSE = {
  h: 'EXERCISE COMPLETE',
  p: 'Vee collects the switching orders and stacks them square. "Not bad. Do it again with phones ringing and the mayor outside and we\'ll call it practice." In the full game, it isn\'t a drill: thirty days, the same valley, and everything that happens when the lights actually go out.',
};

// Vee explains each term of art exactly once, in plain speech.
export const GLOSSES = {
  blackstart: 'vee: "black start. the grid is dead and you restart it from a unit that can wake itself. everything grows from there."',
  cranking: 'vee: "cranking path. a thread of power pushed to a dead plant so it can restart its own pumps and fans. small carries big."',
  pickup: 'vee: "load blocks. you bring customers back in bites, never all at once — every bite drags the frequency down before the governors catch it."',
  reserve: 'vee: "reserve margin. generation minus load — your cushion. run it thin and one bad minute takes the whole island back to black."',
  sync: 'vee: "synchronizing. two live islands, matched in speed and phase, tied into one. done right, nobody notices. done wrong, everybody does."',
  trip: 'vee: "that\'s a trip. the island protected itself the only way it knows — by dying. we start that part over."',
};

export const zoneEpilogue = (state, zid) => {
  const on = zoneServed(state, zid);
  const E = {
    Z1: on ? 'Harlan General: full census, warm halls, the generator back to being furniture.'
      : 'Harlan General: still on diesel and dwindling patience.',
    Z2: on ? 'Downtown: open signs, uneven hours, the diner\'s griddle running flat out.'
      : 'Downtown: shutters and generator cords across sidewalks.',
    Z3: on ? 'Riverside Water: pressure normal, the boil order a bad memory.'
      : 'Riverside Water: the boil order enters its second month.',
    Z4: on ? 'Eastbank: the lift stations run, the river forgets.'
      : 'Eastbank: the river will remember this year.',
    Z5: on ? 'Millbrook: porch lights the whole length of Main.'
      : 'Millbrook: dark past the strip, and angry about it.',
    Z6: on ? 'The Strip: fuel pumps humming, the truck stop cooking again.'
      : 'The Strip: pumps dry, lot empty.',
    Z7: on ? 'Cold storage: the region\'s food made it.'
      : 'Cold storage: a season\'s food lost to the dark.',
    Z8: on ? 'Compressor C-4: pipeline pressure nominal, Millbrook fed.'
      : 'Compressor C-4: a five-megawatt padlock on 240 megawatts.',
    Z9: on ? 'Signal Ridge: telemetry solid, forecasts trusted again.'
      : 'Signal Ridge: the valley still flying half-blind.',
    Z10: on ? 'Westbrook Heights: recovered, and mostly sure it deserved to be first.'
      : 'Westbrook Heights: dark, and very loud about it.',
    Z11: on ? 'Garfield: back on, kitchen windows yellow at dusk.'
      : 'Garfield: still waiting, and keeping score.',
    Z12: on ? 'Garfield Mills: lines restarted, shifts recalled.'
      : 'Garfield Mills: idle stacks, furloughed shifts.',
    Z13: on ? 'The airport: staging lights on, aid flowing through.'
      : 'The airport: dark apron, aid routed the long way.',
    Z14: on ? 'The university: a shelter that held, cots slowly emptying.'
      : 'The university: locked buildings, cold classrooms.',
    Z15: on ? 'Cedar Run: the checkpoint town got its lights back.'
      : 'Cedar Run: lanterns in windows, tempers thin.',
    Z16: on ? 'Lakeview Care: forty-one residents, warm.'
      : 'Lakeview Care: a hard winter, counted in blankets.',
    Z17: on ? 'Co-op West: long feeders alive again, farm tanks pumping.'
      : 'Co-op West: still dark at the end of the gravel roads.',
    Z18: on ? 'Maple Lane: a porch light. A family of four under it.'
      : 'Maple Lane: their 30 days ended without you.',
  };
  return E[zid];
};

export const computeEnding = (state) => {
  const pct = servedPct(state);
  const c = state.clocks;
  const criticals = c.hospitalOk && c.waterOk && zoneServed(state, 'Z16');

  if (state.trust <= 0) {
    return {
      key: 'relieved', title: 'RELIEVED OF COMMAND',
      grade: gradeFor(state, 30),
      lines: [
        'The federal coordination team is polite about it. Your badge works until Friday.',
        'The lights come back eventually. All lights do. But the valley will tell this story without you in it, and the version they tell is the one you earned.',
      ],
    };
  }
  if (pct >= 90 && criticals && !state.score.fatality && state.score.trips <= 1) {
    return {
      key: 'fullboard', title: 'FULL BOARD',
      grade: gradeFor(state, 95),
      lines: [
        'Day 30. The board is green edge to edge, and the hum in the walls is the loudest it has been all month.',
        'Vee initials the last switching order and puts the pen down. "Textbook," she says, which from her is a parade.',
        'The roads reopen. The Guard rolls in to a valley that mostly doesn\'t need them anymore.',
      ],
    };
  }
  if (pct >= 70 && c.hospitalOk && c.waterOk) {
    return {
      key: 'lightson', title: 'LIGHTS ON',
      grade: gradeFor(state, 80),
      lines: [
        'Day 30. Most of the valley is lit. The hard tail can be finished by crews who sleep at night.',
        'The roads reopen and the National Guard arrives — the moment the whole valley was surviving toward, and it happened because the grid was there to meet it.',
      ],
    };
  }
  if (pct >= 40) {
    return {
      key: 'holding', title: 'HOLDING ON',
      grade: gradeFor(state, 60),
      lines: [
        'Day 30. Half a valley lit is not a victory lap, and nobody takes one.',
        'The epilogue is honest about who is still dark. So were you, mostly. It counts for something. Not enough.',
      ],
    };
  }
  return {
    key: 'relieved', title: 'RELIEVED OF COMMAND',
    grade: gradeFor(state, 30),
    lines: [
      'Thirty days, and the board is still mostly a memory of a grid.',
      'The federal team arrives with generators, spreadsheets, and no questions they don\'t already know the answers to.',
    ],
  };
};

const gradeFor = (state, base) => {
  const s = state.score;
  let pts = base;
  pts -= (100 - s.lives) * 0.3;
  pts -= s.trips * 3;
  pts -= s.equityDebt;
  pts -= s.injuries * 2;
  pts += Math.max(-6, Math.min(6, s.honesty * 2));
  if (s.fatality) pts -= 15;
  if (pts >= 90) return 'S';
  if (pts >= 80) return 'A';
  if (pts >= 70) return 'B';
  if (pts >= 55) return 'C';
  if (pts >= 40) return 'D';
  return 'F';
};

export const reportLines = (state) => {
  const s = state.score;
  return [
    ['LOAD SERVED', `${servedPct(state)}%`],
    ['MW-DAYS DELIVERED', `${Math.round(s.mwDays)}`],
    ['ISLAND TRIPS', `${s.trips}`],
    ['LIVES INDEX', `${s.lives}/100`],
    ['CREW SAFETY', s.fatality ? 'ONE FATALITY' : s.injuries > 0 ? `${s.injuries} INJURED` : 'CLEAN'],
    ['HONESTY INDEX', s.honesty > 2 ? 'STRAIGHT TALK' : s.honesty < 0 ? 'SPIN ON RECORD' : 'MIXED'],
    ['EQUITY', s.equityDebt === 0 ? 'ORDER HELD FAIR' : `${s.equityDebt} DAYS OF SKEW`],
    ['PROMISES MISSED', `${s.promisesMissed}`],
    ['MUTUAL AID GIVEN', s.aided ? 'ONE CREW, FIVE DAYS' : 'NONE'],
  ];
};

export const FINAL_CARD =
  'The cause report will run four hundred pages. Nobody on Maple Lane will ever read it.';

export const CROSS_PROMO =
  'Their 30 days are over. ' +
  '<a href="https://nyxtoolsdev.github.io/grid-down-game/" target="_blank" ' +
  'rel="noopener">PLAY GRID DOWN</a>';
