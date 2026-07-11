// The event deck: 60 events across 8 categories, 5 major decision points,
// and the rumor chain. Tone contract: 2-4 sentences, understated, no
// exclamation marks, no melodrama. The cause is never confirmed.

import { SUBS, LINES, ZONES } from './grid-data.js';
import { rng, zoneServed, islandsOf, validateConnectivity } from './sim.js';

const clampTrust = (s, d) => { s.trust = Math.max(0, Math.min(10, s.trust + d)); };
const lives = (s, d) => { s.score.lives = Math.max(0, Math.min(100, s.score.lives + d)); };

const pickSub = (s, pred) => {
  const ids = Object.keys(SUBS).filter((id) => pred(s.subs[id], id));
  return ids.length ? ids[Math.floor(rng(s) * ids.length)] : null;
};
const pickLine = (s, pred) => {
  const ids = LINES.map((l) => l.id).filter((id) => pred(s.lines[id], id));
  return ids.length ? ids[Math.floor(rng(s) * ids.length)] : null;
};
const anyEnergized = (s) => Object.values(s.subs).some((x) => x.energized);
const activeCrewIds = (s) => s.crews.filter((c) => c.outDays === 0).map((c) => c.id);
const randomCrew = (s) => {
  const ids = activeCrewIds(s);
  return ids.length ? s.crews.find((c) => c.id === ids[Math.floor(rng(s) * ids.length)]) : null;
};
const allCrews = (s, fn) => s.crews.forEach((c) => { if (c.outDays === 0) fn(c); });
const fat = (c, d) => { c.fatigue = Math.max(0, Math.min(10, c.fatigue + d)); };

export const EVENTS = [

  // ---- WEATHER (8) ----------------------------------------------------------
  {
    id: 'wx_ice_line', cat: 'weather', tone: 'neg',
    when: (s) => s.day >= 4 && anyEnergized(s),
    text: 'Boone radios in. Ice is building on an energized span faster than he likes. "It sheds or it doesn\'t. Or we knock it off now, but that\'s a bucket crew in the cold."',
    choices: [
      { label: 'Send a crew to de-ice it', out: 'The span is cleared by dark. The crew comes back stiff and quiet.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 2); } },
      { label: 'Let it shed on its own', out: 'You watch the loading numbers all afternoon.',
        fx: (s, log) => {
          if (rng(s) < 0.3) {
            const lid = pickLine(s, (l) => l.closed && l.dmg === 0);
            if (lid) { s.lines[lid].dmg += 1; log.push(`**** ICE TAKES LINE ${lid}.`); validateConnectivity(s, log); }
          }
        } },
    ],
  },
  {
    id: 'wx_fog', cat: 'weather', tone: 'neu',
    text: 'River fog sits on the valley until almost noon. Patrol crews report visibility in feet, not miles.',
    choices: [
      { label: 'Work through it carefully', out: 'Slow morning. Nobody gets hurt.' },
      { label: 'Hold crews until it lifts', out: 'A half day lost. A half day rested.',
        fx: (s) => allCrews(s, (c) => fat(c, -1)) },
    ],
  },
  {
    id: 'wx_forecast_spike', cat: 'weather', tone: 'neu',
    when: (s) => anyEnergized(s),
    text: 'Priya slides a forecast across the desk. Overnight temperatures are coming in three degrees under the model. "Heating load will run above plan. I\'d carry more reserve tonight than you think you need."',
    choices: [
      { label: 'Noted', out: 'You mark the pickup plan accordingly. Or you don\'t.' },
    ],
  },
  {
    id: 'wx_gusts', cat: 'weather', tone: 'neg',
    text: 'Gusts out of the northwest all afternoon. Somewhere out there, a tree limb is deciding.',
    choices: [
      { label: 'Pre-stage a crew near the worst spans', out: 'The limb comes down on a span your crew can see from the truck. Repaired by midnight.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 1); } },
      { label: 'Ride it out', out: 'The night passes. Mostly.',
        fx: (s, log) => {
          if (rng(s) < 0.25) {
            const lid = pickLine(s, (l) => l.revealed && l.dmg === 0);
            if (lid) { s.lines[lid].dmg += 1; log.push(`**** WIND DROPS A LIMB ON ${lid}.`); validateConnectivity(s, log); }
          }
        } },
    ],
  },
  {
    id: 'wx_clear_day', cat: 'weather', tone: 'pos',
    text: 'High pressure. Cold, windless, and clear as glass. Boone: "If you\'ve got work you\'ve been saving, today is the day."',
    choices: [
      { label: 'A good day for it', out: 'Crews move fast. Morale moves with them.',
        fx: (s) => allCrews(s, (c) => fat(c, -1)) },
    ],
  },
  {
    id: 'wx_sleet', cat: 'weather', tone: 'neg',
    text: 'Sleet starts mid-morning and doesn\'t let up. Ladders and bucket trucks stop being safe.',
    choices: [
      { label: 'Stand the line crews down early', out: 'Half a day lost to the ice. Better than a crew.',
        fx: (s) => allCrews(s, (c) => { if (c.kind === 'line') fat(c, -1); }) },
      { label: 'Push through', out: 'The work gets done. The crews pay for it.',
        fx: (s) => allCrews(s, (c) => { if (c.kind === 'line') fat(c, 1); }) },
    ],
  },
  {
    id: 'wx_frost_heave', cat: 'weather', tone: 'neg',
    when: (s) => s.day >= 4,
    text: 'Frost heave has tilted a pole line on a feeder you already signed off. Not down. Leaning.',
    choices: [
      { label: 'Send an inspection', out: 'Two poles reset before they became six.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 1); } },
      { label: 'It can wait', out: 'You add it to a list that only grows.',
        fx: (s, log) => {
          if (rng(s) < 0.35) {
            const zid = Object.keys(ZONES).find((z) => s.zones[z].revealed && s.zones[z].dmg === 0 && s.zones[z].picked === 0);
            if (zid) { s.zones[zid].dmg += 1; log.push(`**** POLES DOWN ON THE ${ZONES[zid].name} FEEDER.`); }
          }
        } },
    ],
  },
  {
    id: 'wx_aurora', cat: 'weather', tone: 'neu',
    text: 'Aurora, faint and green, visible from the parking lot. In the valley people stand in their yards and look up. Nobody says the obvious thing.',
    choices: [
      { label: 'Look up for a minute', out: 'Vee: "Pretty. Get back to work."' },
    ],
  },

  // ---- EQUIPMENT (10) -------------------------------------------------------
  {
    id: 'eq_breaker_stuck', cat: 'equipment', tone: 'neg',
    when: (s) => anyEnergized(s),
    text: 'A breaker refuses its close order. The mechanism is cold-soaked and stiff. You can force it with a manual close, or wait for a tech to strip and grease it.',
    choices: [
      { label: 'Manual close', out: 'It goes in with a bang that everyone pretends was normal.',
        fx: (s, log) => {
          if (rng(s) < 0.2) {
            const sid = pickSub(s, (x) => x.energized);
            if (sid) { s.subs[sid].dmg += 1; log.push(`**** MECHANISM DAMAGE AT ${SUBS[sid].name}.`); }
          }
        } },
      { label: 'Wait for the tech', out: 'A day\'s delay. The right call, probably.',
        fx: (s) => clampTrust(s, -0.2) },
    ],
  },
  {
    id: 'eq_bushing_leak', cat: 'equipment', tone: 'neg',
    when: (s) => anyEnergized(s),
    text: 'Oil weeping from a transformer bushing at an energized station. Slow. For now.',
    choices: [
      { label: 'Take it out of service and fix it', out: 'Four hours dark on that bus. The bushing was worse than it looked.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 200); } },
      { label: 'Watch it and run', out: 'You put a camera on it and try not to check every ten minutes.',
        fx: (s, log) => {
          if (rng(s) < 0.15) {
            const sid = pickSub(s, (x) => x.energized && x.transformer === 'ok');
            if (sid) {
              s.subs[sid].transformer = 'destroyed'; s.subs[sid].energized = false;
              log.push(`**** BUSHING FAILURE AT ${SUBS[sid].name}. TRANSFORMER IS GONE.`);
              validateConnectivity(s, log);
            }
          }
        } },
    ],
  },
  {
    id: 'eq_spare_found', cat: 'equipment', tone: 'pos',
    text: 'An inventory error in your favor. A mothballed mobile transformer at the service center, listed as scrapped, tests clean.',
    choices: [
      { label: 'Add it to the fleet', out: 'One more spare between the region and permanent damage.',
        fx: (s) => { s.spares += 1; } },
    ],
  },
  {
    id: 'eq_ccgt_valve', cat: 'equipment', tone: 'neg',
    when: (s) => s.units.ccgt.on,
    text: 'Millbrook reports a stuck bypass valve on the heat recovery unit. The startup sequence holds where it is until someone frees it.',
    choices: [
      { label: 'Fly a millwright in by county helicopter', out: 'Expensive. Fast.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 300); } },
      { label: 'Let plant staff work it', out: 'The sequence resumes a day late.',
        fx: (s) => { s.units.ccgt.startDay += 1; } },
    ],
  },
  {
    id: 'eq_coal_mill', cat: 'equipment', tone: 'neg',
    when: (s) => s.units.coal.on,
    text: 'Warrick loses a pulverizer to a bearing that had been complaining since before the event. The ramp plan slips.',
    choices: [
      { label: 'Cannibalize the spare mill', out: 'The ramp holds. There is no spare anymore.',
        fx: () => {} },
      { label: 'Accept the slower ramp', out: 'A day slower to full output.',
        fx: (s) => { s.units.coal.startDay += 1; } },
    ],
  },
  {
    id: 'eq_scada_ghost', cat: 'equipment', tone: 'neg',
    when: (s) => s.clocks.commsOk,
    text: 'SCADA throws a breaker-open alarm at a station that reports closed on the phone. Ghost point, or real trouble telemetered wrong.',
    choices: [
      { label: 'Roll a truck to verify', out: 'Ghost point. A morning spent proving a wire wrong.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 1); } },
      { label: 'Trust the phone report', out: 'Probably fine.',
        fx: (s, log) => {
          if (rng(s) < 0.1) {
            const lid = pickLine(s, (l) => l.revealed && l.dmg === 0);
            if (lid) { s.lines[lid].dmg += 1; log.push(`**** THE ALARM WAS REAL. ${lid} FAULTED.`); validateConnectivity(s, log); }
          }
        } },
    ],
  },
  {
    id: 'eq_recloser_rack', cat: 'equipment', tone: 'pos',
    text: 'A retired storeroom manager calls the office landline. There is a rack of reconditioned reclosers behind the old fleet garage, and he still remembers the gate code.',
    choices: [
      { label: 'Send a truck', out: 'Hardware that makes the next feeder job a half-day instead of a day.',
        fx: (s) => {
          const zid = Object.keys(ZONES).find((z) => s.zones[z].revealed && s.zones[z].dmg > 1);
          if (zid) s.zones[zid].dmg -= 1;
        } },
    ],
  },
  {
    id: 'eq_test_set', cat: 'equipment', tone: 'neg',
    when: (s) => s.day >= 6,
    text: 'The relay test set lets its smoke out mid-calibration. Synchronizing without verified relays is a bigger roll of the dice.',
    choices: [
      { label: 'Buy Eastlake\'s spare set, sight unseen', out: 'It arrives on a flatbed with a note: "You owe us."',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 500); } },
      { label: 'Work without it', out: 'Vee, flatly: "Then we sync by the book and by the ear."',
        fx: (s) => { s.flags.noTestSet = true; } },
    ],
  },
  {
    id: 'eq_dam_racks', cat: 'equipment', tone: 'neg',
    text: 'Storm debris is packing the dam\'s trash racks. Head is dropping. Left alone, the units will have to be backed down.',
    choices: [
      { label: 'Send a crew with the crane', out: 'A cold, wet, ugly job. The racks run clean by evening.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 2); } },
      { label: 'Defer it', out: 'The river keeps its own schedule.',
        fx: (s, log) => {
          if (rng(s) < 0.15) {
            s.flags.damOffUntil = s.day + 1;
            log.push('**** HARLAN FALLS BACKED DOWN — RACKS CHOKED. DAM OFFLINE TOMORROW.');
          }
        } },
    ],
  },
  {
    id: 'eq_station_batteries', cat: 'equipment', tone: 'neg',
    when: (s) => anyEnergized(s),
    text: 'Routine checks find a station battery bank at an energized substation reading low. Control power is what closes breakers when you need them closed.',
    choices: [
      { label: 'Replace the bank now', out: 'Done before dark.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 200); } },
      { label: 'Schedule it for next week', out: 'A note on a whiteboard that everyone walks past.',
        fx: (s, log) => {
          if (rng(s) < 0.1) {
            const sid = pickSub(s, (x) => x.energized);
            if (sid) { s.subs[sid].dmg += 1; log.push(`**** CONTROL POWER FAULT AT ${SUBS[sid].name}.`); }
          }
        } },
    ],
  },

  // ---- SECURITY (8) ---------------------------------------------------------
  {
    id: 'sec_copper_spotted', cat: 'security', tone: 'neg',
    text: 'A patrol crew spots a pickup backed against the fence at a dead substation, bolt cutters on the tailgate. Two men, unhurried.',
    choices: [
      { label: 'Have the crew stand visible and wait', out: 'The pickup leaves without hurry. It will be back somewhere else.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 1); } },
      { label: 'Call it in and keep the crew moving', out: 'The sheriff\'s office logs it. Fourth one today.',
        fx: (s, log) => {
          if (rng(s) < 0.3) {
            const sid = pickSub(s, (x) => x.revealed && !x.energized && x.secured === 0);
            if (sid) { s.subs[sid].dmg += 1; log.push(`**** ${SUBS[sid].name} STRIPPED OVERNIGHT.`); }
          }
        } },
    ],
  },
  {
    id: 'sec_armed_man', cat: 'security', tone: 'neg',
    text: 'A crew calls in from a rural feeder. A property owner is standing at his gate with a rifle held low, saying nobody told him anyone was coming. He is not aiming it. He is not moving, either.',
    choices: [
      { label: 'Pull the crew back, call ahead next time', out: 'Boone: "Right answer. He\'s scared, not stupid. We\'ll call the county and come back tomorrow."',
        fx: (s) => clampTrust(s, 0.3) },
      { label: 'Request a sheriff escort now', out: 'The work gets done under a light bar. The story travels.',
        fx: (s) => clampTrust(s, -0.3) },
    ],
  },
  {
    id: 'sec_fence_cut', cat: 'security', tone: 'neg',
    text: 'Fence cut at a de-energized station. Nothing taken yet. The cut is neat, and it is fresh.',
    choices: [
      { label: 'Post a crew on it tonight', out: 'Headlights sweep the fence twice after midnight and keep going.',
        fx: (s) => {
          const sid = pickSub(s, (x) => x.revealed && !x.energized && x.secured === 0);
          if (sid) s.subs[sid].secured = 3;
        } },
      { label: 'Patch the fence and move on', out: 'Wire where wire was.',
        fx: (s, log) => {
          if (rng(s) < 0.3) {
            const sid = pickSub(s, (x) => x.revealed && !x.energized && x.secured === 0);
            if (sid) { s.subs[sid].dmg += 1; log.push(`**** THEY CAME BACK. ${SUBS[sid].name} DAMAGED.`); }
          }
        } },
    ],
  },
  {
    id: 'sec_guard_deters', cat: 'security', tone: 'pos',
    when: (s) => Object.values(s.subs).some((x) => x.secured > 0),
    text: 'The overnight report from a posted station: one vehicle slowed, saw the truck and the work lights, and kept driving.',
    choices: [
      { label: 'Worth the crew-day', out: 'Cheaper than a transformer.',
        fx: (s) => clampTrust(s, 0.3) },
    ],
  },
  {
    id: 'sec_camp_in_sub', cat: 'security', tone: 'neg',
    text: 'A family is camping inside the fence of a dead substation — it blocks the wind, and nothing in there hums anymore. They have a propane heater and a dog.',
    choices: [
      { label: 'Move them along', out: 'They pack slowly. The dog watches you the whole time.',
        fx: (s) => clampTrust(s, -0.3) },
      { label: 'Drive them to the shelter yourself', out: 'The switchyard is no place to be when it comes back. And it is coming back.',
        fx: (s) => clampTrust(s, zoneServed(s, 'Z14') ? 0.5 : 0.2) },
    ],
  },
  {
    id: 'sec_roadblock', cat: 'security', tone: 'neg',
    when: (s) => s.trust < 5,
    text: 'A crew reports an improvised roadblock on the county road — pallets and a parked flatbed. The men there want to know why the lights are on in Millbrook and not here.',
    choices: [
      { label: 'Send a supervisor to talk it through', out: 'An hour of hard questions with honest answers. The flatbed moves.',
        fx: (s) => { clampTrust(s, 0.3); const c = randomCrew(s); if (c) fat(c, 1); } },
      { label: 'Reroute around them', out: 'The long way costs a day for one crew.',
        fx: (s) => { const c = randomCrew(s); if (c) c.outDays = 1; } },
    ],
  },
  {
    id: 'sec_copper_market', cat: 'security', tone: 'neg',
    text: 'Word from the sheriff: a buyer two counties over is paying cash for copper, no questions. Every dead station in the valley just became more interesting.',
    choices: [
      { label: 'Tip the state police to the buyer', out: 'The market dries up in a day or two.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 100); } },
      { label: 'Nothing to be done tonight', out: 'You re-read the list of unguarded stations before bed.',
        fx: (s) => { s.flags.theftUpUntil = s.day + 3; } },
    ],
  },
  {
    id: 'sec_guard_offer', cat: 'security', tone: 'pos',
    when: (s) => s.day >= 10,
    text: 'The armory commander calls. He can spare soldiers to sit on two substations, if you tell him which two matter.',
    choices: [
      { label: 'Give him the two worst exposures', out: 'Humvees at the gates by dusk.',
        fx: (s) => {
          let n = 0;
          for (const [, sub] of Object.entries(s.subs)) {
            if (n >= 2) break;
            if (sub.revealed && !sub.energized && sub.secured === 0) { sub.secured = 5; n += 1; }
          }
        } },
    ],
  },

  // ---- FUEL & LOGISTICS (6) ---------------------------------------------------
  {
    id: 'fuel_coop_diesel', cat: 'fuel', tone: 'pos',
    text: 'A farm co-op manager offers eight hundred gallons of off-road diesel. "It\'s dyed. I figure the EPA has bigger problems this month."',
    choices: [
      { label: 'Take it with thanks', out: 'Eight hundred gallons closer to fine.',
        fx: (s) => { s.fuel += 800; } },
      { label: 'Decline', out: 'He shrugs. "Offer stands."' },
    ],
  },
  {
    id: 'fuel_convoy_strings', cat: 'fuel', tone: 'neu',
    text: 'A distributor can bring two thousand gallons up from the south — if you provide an escort vehicle and a driver who knows which bridges still take the weight.',
    choices: [
      { label: 'Send a crew as escort', out: 'A crew-day for a tanker. The math works.',
        fx: (s) => { const c = randomCrew(s); if (c) c.outDays = 1; s.fuel += 2000; } },
      { label: 'Pass', out: 'The tanker goes to whoever said yes.' },
    ],
  },
  {
    id: 'fuel_hospital_gauge', cat: 'fuel', tone: 'neg',
    when: (s) => !s.clocks.hospitalOk && !s.clocks.hospitalEvac,
    text: 'The hospital\'s facilities manager sounds tired. The day-tank gauge and the delivery paperwork disagree by most of a day\'s burn.',
    choices: [
      { label: 'Send someone to stick the tank', out: 'The gauge was right. The paperwork was hope.',
        fx: (s) => { s.clocks.hospitalH = Math.max(12, s.clocks.hospitalH - 12); } },
      { label: 'Trust the paperwork', out: 'The paperwork has been through a lot this week.',
        fx: (s, log) => {
          if (rng(s) < 0.2) {
            s.clocks.hospitalH = Math.max(12, s.clocks.hospitalH - 24);
            log.push('**** HOSPITAL DAY TANK LOWER THAN BOOKED. THE CLOCK JUST MOVED.');
          }
        } },
    ],
  },
  {
    id: 'fuel_tanker_ditch', cat: 'fuel', tone: 'neu',
    text: 'A fuel tanker bound for the staging yard slides into a ditch on the frost. Driver fine, load intact, wheels ten degrees from useful.',
    choices: [
      { label: 'Winch it out with a line truck', out: 'Twelve hundred gallons arrives four hours late.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 1); s.fuel += 1200; } },
      { label: 'Leave it for the wrecker service', out: 'The wrecker service has a waiting list.',
        fx: () => {} },
    ],
  },
  {
    id: 'fuel_gt_tune', cat: 'fuel', tone: 'pos',
    when: (s) => s.units.peakers.on && !(s.clocks.gasReadyDay > 0 && s.day >= s.clocks.gasReadyDay),
    text: 'The peaker plant\'s one remaining operator thinks he can lean out the fuel schedule on GT-2. "She\'ll grumble. She\'ll also drink less."',
    choices: [
      { label: 'Let him tune it', out: 'The burn rate drops. The grumble is audible from the fence.',
        fx: (s) => { s.flags.peakerTune = true; } },
      { label: 'Run them as designed', out: 'By the book. The book is thirsty.' },
    ],
  },
  {
    id: 'fuel_school_buses', cat: 'fuel', tone: 'neu',
    text: 'The school district offers its bus depot tanks — but wants a promise its buildings get priority when their feeder section comes up.',
    choices: [
      { label: 'Deal', out: 'Six hundred gallons, and a promise you intend to keep.',
        fx: (s) => { s.fuel += 600; s.flags.schoolPromise = true; } },
      { label: 'No side deals', out: 'The superintendent takes it better than expected.',
        fx: (s) => clampTrust(s, 0.2) },
    ],
  },

  // ---- POLITICAL & MEDIA (8) ---------------------------------------------------
  {
    id: 'pol_mayor_hour', cat: 'political', tone: 'neg',
    text: 'Mayor Whitfield\'s daily radio hour is mostly about you today. The phrase "utility executives in warm offices" gets used twice.',
    choices: [
      { label: 'Call in with the actual numbers', out: 'Uncomfortable radio. But numbers are hard to argue with on air.',
        fx: (s) => clampTrust(s, s.score.honesty > 0 ? 0.5 : -0.2) },
      { label: 'Stay off the air, keep working', out: 'The show fills the silence with a caller from Westbrook.',
        fx: (s) => clampTrust(s, -0.5) },
    ],
  },
  {
    id: 'pol_reporter', cat: 'political', tone: 'neu',
    text: 'A reporter from the regional paper is at the gate. She wants an hour in the control room. Corbin has opinions about camera angles.',
    choices: [
      { label: 'Let her in, show her everything', out: 'Her piece runs under the headline "The Quietest Room in the Valley."',
        fx: (s) => {
          const critical = islandsOf(s).some((i) => i.status === 'CRITICAL');
          clampTrust(s, critical ? -0.7 : 0.5);
        } },
      { label: 'Not today', out: 'She writes the story anyway, from the parking lot.',
        fx: (s) => clampTrust(s, -0.3) },
    ],
  },
  {
    id: 'pol_photo_op', cat: 'political', tone: 'neg',
    text: 'Corbin wants Westbrook Heights energized in time for the evening news cycle. "Optics matter. People need to see recovery in a neighborhood that looks like recovery."',
    choices: [
      { label: 'Restoration order stays technical', out: 'Corbin leaves the room without closing the door.',
        fx: (s) => { s.flags.corbinCrossed = true; } },
      { label: 'Give him his shot', out: 'The cameras get their porch lights. Garfield watches the same broadcast in the dark.',
        fx: (s) => { clampTrust(s, 0.3); s.score.equityDebt += 2; } },
    ],
  },
  {
    id: 'pol_governor_aide', cat: 'political', tone: 'neu',
    text: 'The governor\'s aide calls for numbers. Not the situation — the numbers. It is clear the ones you give will be repeated on a podium within the hour.',
    choices: [
      { label: 'The real numbers, with error bars', out: 'The podium version drops the error bars. They always do.',
        fx: (s) => { s.score.honesty += 1; } },
      { label: 'Round everything up a little', out: 'It buys a good news cycle.',
        fx: (s, log) => {
          clampTrust(s, 0.3); s.score.honesty -= 1;
          if (rng(s) < 0.3) { clampTrust(s, -1); log.push('**** THE ROUNDED NUMBERS GET FACT-CHECKED ON AIR.'); }
        } },
    ],
  },
  {
    id: 'pol_council_fuel', cat: 'political', tone: 'neu',
    text: 'The county council requisitions five hundred gallons of diesel for snowplows. Technically they can. Practically, it is your fuel.',
    choices: [
      { label: 'Release it', out: 'Plowed roads move your trucks too.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 500); clampTrust(s, 0.5); } },
      { label: 'Fight the requisition', out: 'You win. It costs you the room.',
        fx: (s) => clampTrust(s, -0.5) },
    ],
  },
  {
    id: 'pol_church_bells', cat: 'political', tone: 'pos',
    when: (s) => Object.values(s.zones).some((z) => z.picked > 0),
    text: 'The first evening a district came back, somebody rang the church bell. Tonight, two more churches did it. It is becoming a thing people listen for.',
    choices: [
      { label: 'Let it become a thing', out: 'Vee: "Better than a siren."',
        fx: (s) => clampTrust(s, 0.5) },
    ],
  },
  {
    id: 'pol_corbin_overtime', cat: 'political', tone: 'neg',
    when: (s) => s.day >= 8,
    text: 'Corbin circulates a memo about "restoration velocity" and floats mandatory sixteen-hour shifts. Boone\'s reply is short and contains the word "no" several times.',
    choices: [
      { label: 'Back Boone', out: 'The memo dies quietly. Your crews notice who killed it.',
        fx: (s) => { allCrews(s, (c) => fat(c, -1)); s.flags.corbinCrossed = true; } },
      { label: 'Back the memo', out: 'Velocity improves for a day. Then the mistakes start.',
        fx: (s) => allCrews(s, (c) => fat(c, 2)) },
    ],
  },
  {
    id: 'pol_misinformation', cat: 'political', tone: 'neg',
    text: 'A rumor with good production values: the utility is "holding back power" to sell across the state line. It has screenshots. The screenshots are of a training simulator.',
    choices: [
      { label: 'Publish the switching logs, annotated', out: 'Dry, unglamorous, and it works on the people still deciding what to believe.',
        fx: (s) => { s.score.honesty += 1; clampTrust(s, 0.3); } },
      { label: 'Ignore it', out: 'It compounds nightly, like interest.',
        fx: (s) => clampTrust(s, -0.7) },
    ],
  },

  // ---- CREW & HUMAN (8) ---------------------------------------------------------
  {
    id: 'crew_own_family', cat: 'crew', tone: 'neu',
    text: 'One of your linemen lives in a zone that is still dark. He has not mentioned it once. Boone mentions it for him.',
    choices: [
      { label: 'Give him the day to see to his family', out: 'He argues, loses, and goes. The crew works better for knowing you\'d do it.',
        fx: (s) => { const c = randomCrew(s); if (c) c.outDays = 1; allCrews(s, (x) => fat(x, -1)); } },
      { label: 'Keep the roster as is', out: 'He never brings it up. That is somehow worse.',
        fx: (s) => { const c = randomCrew(s); if (c) fat(c, 2); } },
    ],
  },
  {
    id: 'crew_aid_housing', cat: 'crew', tone: 'neu',
    when: (s) => s.crews.some((c) => c.mutual),
    text: 'The mutual aid crews have been sleeping in their trucks. The motel has no power and the county has no plan.',
    choices: [
      { label: 'Put them up at the university shelter', out: 'Cots, hot food, and the first real sleep in days — if the campus has power.',
        fx: (s) => {
          if (zoneServed(s, 'Z14')) s.crews.forEach((c) => { if (c.mutual) fat(c, -2); });
          else s.crews.forEach((c) => { if (c.mutual) fat(c, 1); });
        } },
      { label: 'They knew what they signed up for', out: 'They did. They will also remember it.',
        fx: (s) => s.crews.forEach((c) => { if (c.mutual) fat(c, 1); }) },
    ],
  },
  {
    id: 'crew_retired_tech', cat: 'crew', tone: 'pos',
    when: (s) => !s.flags.retiredTech,
    text: 'A man in a flannel shirt is at the front desk with a substation maintenance license that expired in 2019 and thirty years of relay work behind it. "Figured you could use hands that know which end of a test lead is which."',
    choices: [
      { label: 'Deputize him on the spot', out: 'Vee vouches for him before you finish asking. T3 is on the board.',
        fx: (s) => {
          s.flags.retiredTech = true;
          s.crews.push({ id: 'T3', kind: 'tech', fatigue: 0, outDays: 0, mutual: false });
        } },
      { label: 'Liability says no', out: 'He nods like he expected it, and leaves his number anyway.',
        fx: (s) => { s.flags.retiredTech = true; } },
    ],
  },
  {
    id: 'crew_hours_argument', cat: 'crew', tone: 'neg',
    text: 'Two crew leads are close to shouting in the ready room over who got the short assignments three days running. Everyone is tired in a way sleep doesn\'t fix anymore.',
    choices: [
      { label: 'Rotate assignments publicly from now on', out: 'A whiteboard, a marker, and no more arguments about fairness.',
        fx: (s) => allCrews(s, (c) => fat(c, -1)) },
      { label: 'Tell them to sort it out', out: 'They do, badly.',
        fx: (s) => allCrews(s, (c) => fat(c, 1)) },
    ],
  },
  {
    id: 'crew_kickback', cat: 'crew', tone: 'neg',
    text: 'A chainsaw kickback on right-of-way clearing. Eleven stitches and a tetanus shot. It could have been the femoral, and everyone on that crew knows it.',
    choices: [
      { label: 'Stand the crew down for the day', out: 'Boone runs a tailboard on saw work that nobody complains about.',
        fx: (s) => { const c = randomCrew(s); if (c) c.outDays = 1; } },
    ],
  },
  {
    id: 'crew_hot_meal', cat: 'crew', tone: 'pos',
    text: 'The church on the green has been cooking for shelters all week. Tonight, unasked, they show up at the service center with foil trays and folding tables.',
    choices: [
      { label: 'Stop work twenty minutes early', out: 'Casserole, coffee, and quiet. The best twenty minutes of the week.',
        fx: (s) => allCrews(s, (c) => fat(c, -2)) },
    ],
  },
  {
    id: 'crew_yard_cache', cat: 'crew', tone: 'pos',
    text: 'A crew poking through the old fleet yard finds a locked shed: two drums of diesel, chains, and a stretcher-load of hardware from a storm response nobody remembers.',
    choices: [
      { label: 'Log it and use it', out: 'Five hundred gallons, and hardware for the rural feeders.',
        fx: (s) => { s.fuel += 500; } },
    ],
  },
  {
    id: 'crew_rookie_question', cat: 'crew', tone: 'neu',
    text: 'The youngest tech asks, over cold coffee at two in the morning, what actually caused it. The room gets a little quieter than the question deserves.',
    choices: [
      { label: '"We don\'t know. That\'s the honest answer."', out: 'She nods. "Weird that it\'s easier to fix than to explain."',
        fx: (s) => { s.score.honesty += 1; } },
      { label: 'Change the subject to tomorrow\'s switching', out: 'The question keeps sitting there anyway.' },
    ],
  },

  // ---- PUBLIC HEALTH (6) ----------------------------------------------------------
  {
    id: 'health_co_cluster', cat: 'health', tone: 'neg',
    text: 'The hospital reports a carbon monoxide cluster — families running generators in closed garages. Three admissions overnight, one of them a child.',
    choices: [
      { label: 'Blast PSAs on every channel you have', out: 'The radio reads it every hour. The admissions stop.',
        fx: (s) => clampTrust(s, 0.3) },
      { label: 'That\'s the county\'s lane', out: 'The county\'s lane is congested this month.',
        fx: (s) => lives(s, -3) },
    ],
  },
  {
    id: 'health_dialysis', cat: 'health', tone: 'neg',
    when: (s) => !zoneServed(s, 'Z1'),
    text: 'The dialysis clinic has nineteen patients and a rental generator with a cracked head. Diane\'s voice is very level, which is how you know.',
    choices: [
      { label: 'Divert diesel and an electrician to the clinic', out: 'The rental limps through on your fuel and Boone\'s best splice.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 600); } },
      { label: 'Ambulance transfers to the county line', out: 'Nineteen cold rides. Most of them tolerate it.',
        fx: (s) => lives(s, -4) },
    ],
  },
  {
    id: 'health_boil_fatigue', cat: 'health', tone: 'neg',
    when: (s) => s.clocks.boilOrder && !s.clocks.waterOk,
    text: 'Boil-order fatigue is setting in. The clinic is seeing GI cases from people who quietly stopped bothering.',
    choices: [
      { label: 'Door hangers and school flyers', out: 'Unglamorous public health, the kind that works.',
        fx: (s) => clampTrust(s, 0.3) },
      { label: 'The order is posted; that has to be enough', out: 'It is not, quite.',
        fx: (s) => lives(s, -2) },
    ],
  },
  {
    id: 'health_night_nurse', cat: 'health', tone: 'neg',
    when: (s) => !zoneServed(s, 'Z16') && s.day >= 8,
    text: 'The night nurse at Lakeview calls the ops room directly — someone gave her the number, and honestly, good. Forty-one residents, one fireplace, and a propane budget measured in days.',
    choices: [
      { label: 'Send heaters and a fuel drop tonight', out: 'A box truck, six heaters, and a driver who refuses the paperwork.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 400); s.flags.lakeviewHelped = true; } },
      { label: 'Log it as another reason to hurry', out: 'The list of reasons is long, and this one has a voice.',
        fx: (s) => lives(s, -2) },
    ],
  },
  {
    id: 'health_ops_flu', cat: 'health', tone: 'neg',
    when: (s) => s.day >= 10,
    text: 'Half the control room is coughing into the same recycled air. Priya is running her models from the break room in a mask.',
    choices: [
      { label: 'Split shifts, disinfect, air the room', out: 'Colder, slower, healthier.',
        fx: (s) => s.crews.forEach((c) => { if (c.kind === 'tech') fat(c, 1); }) },
    ],
  },
  {
    id: 'health_well_pumps', cat: 'health', tone: 'pos',
    text: 'Out east, a farmer with a PTO generator has been running his neighbors\' well pumps on a rotation he organized himself with a clipboard and a horn.',
    choices: [
      { label: 'Send him fuel and put him on the map', out: 'He asks for nothing. He gets two hundred gallons and a radio.',
        fx: (s) => { s.fuel = Math.max(0, s.fuel - 200); clampTrust(s, 0.5); lives(s, 1); } },
    ],
  },

  // ---- INFORMATION & RUMOR (6) — the cause is never confirmed ------------------------
  {
    id: 'info_rumor_equipment', cat: 'info', tone: 'neu',
    text: 'The trade press has a theory: a protection misoperation upstream, a cascade with nobody\'s name on it. An analyst calls it "statistically overdue." Vee reads it twice and puts it down.',
    choices: [
      { label: 'Could be', out: 'Vee: "Could be. Doesn\'t change tomorrow\'s switching order."' },
    ],
  },
  {
    id: 'info_rumor_solar', cat: 'info', tone: 'neu',
    text: 'A university physicist is on the regional news pointing at a coronal mass ejection from last Tuesday. The timing almost fits. The magnetometer data, Priya notes, does not.',
    choices: [
      { label: 'Almost fits isn\'t fits', out: 'Priya: "People like a cause with no villain. I understand the appeal."' },
    ],
  },
  {
    id: 'info_rumor_somebody', cat: 'info', tone: 'neg',
    text: 'The sheriff asks, off the record, whether somebody did this. He has been asked the same thing forty times this week and would like something to say.',
    choices: [
      { label: '"We restore first. Cause comes later, from people with more data than us."', out: 'He nods slowly. "That\'s a no comment." — "That\'s the truth."',
        fx: (s) => { s.score.honesty += 1; } },
      { label: 'Speculate a little', out: 'By Friday your speculation is a fact on three radio stations.',
        fx: (s) => clampTrust(s, -0.5) },
    ],
  },
  {
    id: 'info_ham_eastlake', cat: 'info', tone: 'pos',
    when: (s) => s.day >= 12,
    text: 'A ham operator relays traffic from the east: Eastlake has islands holding and is talking about "regional support" once they are stable. It is the first good news from over the line.',
    choices: [
      { label: 'Log it', out: 'Vee marks the map with a pencil dot. "Neighbors."' },
    ],
  },
  {
    id: 'info_investigators', cat: 'info', tone: 'neu',
    when: (s) => s.day >= 15,
    text: 'Two federal investigators arrive with identical laptops and excellent manners. They want event recorder data, relay targets, and the sequence-of-events log. All of it.',
    choices: [
      { label: 'Give them everything, unedited', out: 'They thank you and say nothing at all about what they are looking for.',
        fx: (s) => { s.score.honesty += 1; } },
      { label: 'Route it through legal first', out: 'Corbin approves. The investigators\' manners get slightly less excellent.' },
    ],
  },
  {
    id: 'info_four_hundred_pages', cat: 'info', tone: 'neu',
    when: (s) => s.day >= 20,
    text: 'Late shift. Vee, unprompted, watching the board: "The cause report will run four hundred pages and settle nothing. What we did about it — that part\'s already written."',
    choices: [
      { label: 'Let that sit', out: 'The board hums. Outside, a little more of the valley has lights than yesterday.' },
    ],
  },
];

// ---- Major decision points (days 5, 10, 15, 20, 25) ---------------------------

export const MAJORS = {
  5: {
    id: 'major_governor', title: 'DAY 5 — THE GOVERNOR CALLS',
    text: 'Not the aide. The governor. She is calm, informed, and wants one thing: a date she can say on television. Priya\'s forecast has a defensible number and an impressive one, and they are not the same number.',
    choices: [
      { label: 'Give the impressive date', out: 'She uses it within the hour. It is on every radio in the valley by dark.',
        fx: (s, log) => {
          s.score.honesty -= 1; clampTrust(s, 1);
          s.promise = { pct: 60, byDay: 12 };
          log.push('       PROMISE ON RECORD: 60% BY DAY 12.');
        } },
      { label: 'Give the defensible date', out: '"That\'s slower than I hoped." — "It\'s faster than it could be, ma\'am."',
        fx: (s, log) => {
          s.score.honesty += 1; clampTrust(s, 0.3);
          s.promise = { pct: 45, byDay: 14 };
          log.push('       PROMISE ON RECORD: 45% BY DAY 14.');
        } },
      { label: 'No date at all', out: 'She does not enjoy that answer. Neither do the people waiting on it.',
        fx: (s) => { s.score.honesty += 1; clampTrust(s, -0.5); } },
    ],
  },
  10: {
    id: 'major_neighbor', title: 'DAY 10 — THE COUNTY LINE',
    text: 'The emergency manager one county south is on the phone. They lost their only substation tech to a fall — he will recover; their restoration will not, without help. They are asking for one crew, five days. Your board still has dark sectors on it.',
    choices: [
      { label: 'Send a crew south', out: 'Boone picks the crew himself. "We\'d want the same."',
        fx: (s, log) => {
          const c = s.crews.find((x) => x.kind === 'line' && x.outDays === 0);
          if (c) c.outDays = 5;
          s.score.aided = true; clampTrust(s, 1);
          log.push('       ONE CREW SOUTH FOR FIVE DAYS. THE FAVOR IS ON THE BOOKS.');
        } },
      { label: 'Decline — the valley comes first', out: 'Defensible. Every restoration decision is, one at a time.',
        fx: (s) => clampTrust(s, -0.3) },
    ],
  },
  15: {
    id: 'major_ultimatum', title: 'DAY 15 — THE MAYOR\'S ULTIMATUM',
    text: 'Mayor Whitfield arrives in person with a camera crew idling outside. Westbrook Heights, tomorrow, or he holds a press conference about "a utility that has chosen which citizens matter." Across the desk, Diane\'s list has Lakeview Care on top, forty-one names long.',
    choices: [
      { label: 'Lakeview first. Say so publicly.', out: 'The press conference happens. So does the counter-story: forty-one names, warm.',
        fx: (s) => { clampTrust(s, -0.5); s.flags.lakeviewPriority = true; s.score.honesty += 1; } },
      { label: 'Westbrook tomorrow, as demanded', out: 'The cameras get their porch lights. Diane takes her list back without a word.',
        fx: (s) => { clampTrust(s, 0.5); s.score.equityDebt += 3; } },
      { label: 'Publish the full restoration order, with reasons', out: 'Radical transparency. The mayor finds it harder to argue with a spreadsheet than a villain.',
        fx: (s) => { s.score.honesty += 1; clampTrust(s, 0.2); } },
    ],
  },
  20: {
    id: 'major_intertie', title: 'DAY 20 — EASTLAKE\'S OFFER',
    text: 'Eastlake is stable and ready to talk about the intertie. One hundred megawatts of import — the difference between a knife-edge endgame and a finished one. Their terms arrive by fax, because of course they do.',
    choices: [
      { label: 'Accept: 3,000 gallons of diesel as consideration', out: 'Signed. The gear work at River Crossing can begin.',
        fx: (s, log) => {
          if (s.score.aided) {
            s.units.tie.deal = true;
            log.push('       EASTLAKE WAIVES THE FUEL — "FOR THE CREW YOU SENT." THE DEAL IS DONE.');
          } else if (s.fuel >= 3000) {
            s.fuel -= 3000; s.units.tie.deal = true;
            log.push('       3,000 GALLONS COMMITTED. THE DEAL IS DONE.');
          } else {
            log.push('       NOT ENOUGH FUEL TO CLOSE THE DEAL. THE OFFER STANDS, UNSIGNED.');
          }
        } },
      { label: 'Refuse — finish it with valley generation', out: 'Vee raises an eyebrow exactly one millimeter.',
        fx: () => {} },
    ],
  },
  25: {
    id: 'major_last_mile', title: 'DAY 25 — THE LAST MILE',
    text: 'What is left is the hard tail: rural co-ops, long feeders, broken poles, twenty megawatts serving the fewest people per crew-day on the whole board. Corbin observes, not incorrectly, that the percentages barely move out there. Diane observes that people live at the end of those lines.',
    choices: [
      { label: 'Throw everything east for the finish', out: 'Boone: "Long roads. Good crews. We\'ll get there."',
        fx: (s) => {
          allCrews(s, (c) => fat(c, 1));
          for (const zid of ['Z17', 'Z18']) {
            if (s.zones[zid].dmg > 0) s.zones[zid].dmg -= 1;
          }
        } },
      { label: 'Steady pace, no heroics', out: 'The board fills in at the speed of safety.',
        fx: (s) => { s.score.honesty += 1; } },
    ],
  },
};
