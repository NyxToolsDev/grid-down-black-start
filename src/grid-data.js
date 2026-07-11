// Grid Down: Black Start — Harlan Valley grid definition.
// Coordinates are on a 1600x1200 virtual board, west (Harlan City) to east (Cedar Run).
// The Harlan River runs vertically at x~980; the crossing at S10 is the sync centerpiece.

export const SUBS = {
  S1:  { name: 'HARLAN FALLS SY', x: 980,  y: 170,  dmg: [0, 0] },
  S2:  { name: 'DOWNTOWN 138',    x: 280,  y: 520,  dmg: [0, 1] },
  S3:  { name: 'RIVERSIDE',       x: 840,  y: 610,  dmg: [0, 1] },
  S4:  { name: 'RAILYARD SY',     x: 560,  y: 330,  dmg: [0, 1] },
  S5:  { name: 'MILLBROOK 138',   x: 600,  y: 500,  dmg: [0, 1] },
  S6:  { name: 'COMPRESSOR TAP',  x: 700,  y: 280,  dmg: [0, 1] },
  S7:  { name: 'SIGNAL RIDGE',    x: 800,  y: 130,  dmg: [0, 1] },
  S8:  { name: 'WESTBROOK 138',   x: 420,  y: 760,  dmg: [0, 1] },
  S9:  { name: 'GARFIELD SY',     x: 540,  y: 980,  dmg: [0, 1] },
  S10: { name: 'RIVER CROSSING',  x: 980,  y: 820,  dmg: [1, 2] },
  S11: { name: 'CEDAR RUN SY',    x: 1240, y: 700,  dmg: [0, 1] },
  S12: { name: 'CO-OP EAST SY',   x: 1460, y: 930,  dmg: [1, 2] },
};

// Transmission lines. dmg band is crew-days of storm damage, seeded per run.
export const LINES = [
  { id: 'S1-S4',   a: 'S1',  b: 'S4',  dmg: [0, 1] },
  { id: 'S1-S10',  a: 'S1',  b: 'S10', dmg: [1, 2] },
  { id: 'S4-S2',   a: 'S4',  b: 'S2',  dmg: [0, 1] },
  { id: 'S4-S5',   a: 'S4',  b: 'S5',  dmg: [0, 1] },
  { id: 'S2-S3',   a: 'S2',  b: 'S3',  dmg: [0, 2] },
  { id: 'S3-S9',   a: 'S3',  b: 'S9',  dmg: [0, 2] },
  { id: 'S5-S6',   a: 'S5',  b: 'S6',  dmg: [0, 1] },
  { id: 'S6-S7',   a: 'S6',  b: 'S7',  dmg: [1, 2] },
  { id: 'S5-S8',   a: 'S5',  b: 'S8',  dmg: [0, 1] },
  { id: 'S8-S9',   a: 'S8',  b: 'S9',  dmg: [0, 1] },
  { id: 'S8-S10',  a: 'S8',  b: 'S10', dmg: [1, 3] },
  { id: 'S10-S11', a: 'S10', b: 'S11', dmg: [1, 2] },
  { id: 'S11-S12', a: 'S11', b: 'S12', dmg: [2, 4] },
];

// Load zones. blocks are MW pickup steps. dmg band = feeder repair crew-days.
// Westbrook is 70 MW gross; Ridgeline Solar+Storage self-serves 15 MW of it by
// day, so it lands on the board as 55 (30+25) — solar never counts toward reserve.
export const ZONES = {
  Z1:  { name: 'HARLAN GENERAL',    sub: 'S2',  blocks: [15],     tags: ['HOSPITAL'], dmg: [0, 1], x: 200,  y: 430 },
  Z2:  { name: 'DOWNTOWN',          sub: 'S2',  blocks: [50],     tags: [],           dmg: [0, 2], x: 170,  y: 590 },
  Z3:  { name: 'RIVERSIDE WATER',   sub: 'S3',  blocks: [10],     tags: ['WATER'],    dmg: [0, 1], x: 900,  y: 520 },
  Z4:  { name: 'EASTBANK WASTE',    sub: 'S3',  blocks: [8],      tags: ['SEWAGE'],   dmg: [0, 1], x: 920,  y: 690 },
  Z5:  { name: 'MILLBROOK TOWN',    sub: 'S5',  blocks: [35],     tags: [],           dmg: [0, 2], x: 500,  y: 570 },
  Z6:  { name: 'MILLBROOK STRIP',   sub: 'S5',  blocks: [25],     tags: ['FUEL'],     dmg: [0, 1], x: 680,  y: 570 },
  Z7:  { name: 'RAILYARD COLD STG', sub: 'S4',  blocks: [20],     tags: ['FOOD'],     dmg: [0, 1], x: 480,  y: 250 },
  Z8:  { name: 'COMPRESSOR C-4',    sub: 'S6',  blocks: [5],      tags: ['GAS'],      dmg: [0, 1], x: 760,  y: 350 },
  Z9:  { name: 'SIGNAL RIDGE COMMS',sub: 'S7',  blocks: [5],      tags: ['COMMS'],    dmg: [0, 1], x: 870,  y: 80  },
  Z10: { name: 'WESTBROOK HEIGHTS', sub: 'S8',  blocks: [30, 25], tags: [],           dmg: [0, 1], x: 300,  y: 820 },
  Z11: { name: 'GARFIELD',          sub: 'S9',  blocks: [40, 35], tags: [],           dmg: [0, 2], x: 430,  y: 1070 },
  Z12: { name: 'GARFIELD MILLS',    sub: 'S9',  blocks: [50],     tags: ['INDUSTRY'], dmg: [0, 1], x: 650,  y: 1060 },
  Z13: { name: 'AIRPORT & ARMORY',  sub: 'S8',  blocks: [12],     tags: ['STAGING'],  dmg: [0, 1], x: 250,  y: 700 },
  Z14: { name: 'UNIVERSITY SHELTER',sub: 'S9',  blocks: [15],     tags: ['SHELTER'],  dmg: [0, 1], x: 700,  y: 920 },
  Z15: { name: 'CEDAR RUN TOWN',    sub: 'S11', blocks: [15, 15], tags: [],           dmg: [1, 3], x: 1330, y: 600 },
  Z16: { name: 'LAKEVIEW CARE',     sub: 'S11', blocks: [10],     tags: ['MEDICAL'],  dmg: [1, 2], x: 1170, y: 580 },
  Z17: { name: 'RURAL CO-OP WEST',  sub: 'S12', blocks: [25],     tags: [],           dmg: [2, 4], x: 1380, y: 1050 },
  Z18: { name: 'CO-OP EAST · MAPLE LANE', sub: 'S12', blocks: [20], tags: [],         dmg: [2, 4], x: 1560, y: 1000 },
};

export const UNITS = {
  dam:     { name: 'HARLAN FALLS DAM', sub: 'S1',  mw: 40,  blackStart: true,
             x: 1060, y: 120 },
  peakers: { name: 'CEDAR RUN PEAKERS', sub: 'S11', mw: 50, blackStart: true,
             needsBattery: true, dieselPerDay: 1500, x: 1300, y: 760 },
  ccgt:    { name: 'MILLBROOK ENERGY CTR', sub: 'S5', mw: 240, blackStart: false,
             stages: [80, 160, 240], needsGas: true, x: 520, y: 420 },
  coal:    { name: 'WARRICK STATION', sub: 'S4', mw: 180, blackStart: false,
             stages: [60, 120, 180], stageDelay: 2, x: 640, y: 220 },
  tie:     { name: 'EASTLAKE INTERTIE', sub: 'S10', mw: 100, blackStart: false,
             isTie: true, x: 1120, y: 880 },
};

export const RIVER = { x: 980, top: 0, bottom: 1200 };

export const STABILITY = { SOLID: 1.20, TIGHT: 1.05 }; // gen/load thresholds
export const TRIP_CHANCE = { TIGHT: 0.05, CRITICAL: 0.25 };

export const FUEL = {
  start: 9000,
  perCrewTask: 100,
  hospitalRunCost: 1000,
  hospitalRunHours: 48,
  stripResupply: 1500, // per day once Z6 (FUEL) is served
};

export const RURAL_ELEMENTS = new Set([
  'S10-S11', 'S11-S12', 'S10', 'S11', 'S12', 'Z15', 'Z16', 'Z17', 'Z18',
]);

// First power reveals: the dam rode through; everything else is dark board.
export const START_REVEALED = { subs: ['S1'], lines: ['S1-S4', 'S1-S10'], zones: [] };

export const OPENINGS = {
  book:  { label: 'BY THE BOOK',   crews: 4, techs: 2, trust: 6, loadMult: 1.0,
           freeze: [16, 19], desc: 'The standard scenario. Four line crews, two techs.' },
  short: { label: 'SHORT-STAFFED', crews: 3, techs: 2, trust: 7, loadMult: 1.0,
           freeze: [16, 19], desc: 'The union sent who it could, and the town knows it. Three crews, +1 trust.' },
  ice:   { label: 'ICE STORM',     crews: 4, techs: 2, trust: 6, loadMult: 1.15,
           freeze: [10, 13], desc: 'Winter start. All loads +15%, the freeze comes early and stays.' },
};

export const NORMAL_LOAD = Object.values(ZONES)
  .reduce((sum, z) => sum + z.blocks.reduce((a, b) => a + b, 0), 0); // 460 on-board MW
