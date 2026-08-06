/**
 * `elevator-sim run` — one replication, one summary.
 *
 * Two things this command refuses to do, both from CLAUDE.md § Statistical discipline:
 *
 * - **A saturated run does not get a quotable AWT — or a quotable anything built on it.** The
 *   banner is loud and the number is replaced by the word SUPPRESSED, because a mean waiting
 *   time for a system whose queues grow without bound is not a measurement of anything. Time to
 *   destination goes with it: it *contains* that wait, so leaving it on screen would just move
 *   the unquotable number down four lines and put it in normal weight.
 * - **An unmeasurable achieved interval prints the word, not a constant.** Both mixed-use towers
 *   return `departureGapBasis: 'unmeasurable'`; there is no threshold that can separate a door
 *   reopen from a departure there, and `FALLBACK_DEPARTURE_GAP_S` would be a number with no
 *   referent.
 *
 * And one thing it always does: print the seed, so any interesting run replays exactly
 * (invariant 5).
 */

import {
  SimulationError,
  Simulation,
  WARNING_CODES,
  type LoadedConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';

import {
  numberFlag,
  parseArgs,
  rejectPositionals,
  requiredStringFlag,
  stringFlag,
  type FlagSpec,
  type ParsedArgs,
} from '../args.js';
import {
  loadData,
  randomSeed,
  requireBuilding,
  requireDemandTemplate,
  requireDispatcher,
  requireTrafficProfile,
  resolveDataDir,
  withTrafficProfile,
} from '../data.js';
import { EXIT_INTERNAL } from '../errors.js';
import {
  ABSENT,
  clock,
  count,
  duration,
  fractionAsPct,
  num,
  pct,
  renderAchievedInterval,
  renderAwt,
  renderLongestWait,
  renderSaturation,
  secs,
} from '../format.js';
import { BINARY, printCommandHelp, wrap, type CommandHelp } from '../help.js';
import { field, heading, type Output } from '../output.js';

export const RUN_FLAGS: readonly FlagSpec[] = [
  {
    name: 'building',
    kind: 'string',
    placeholder: '<id>',
    summary: 'which building to simulate',
    required: true,
  },
  {
    name: 'dispatcher',
    kind: 'string',
    placeholder: '<id>',
    summary: 'which dispatcher profile to run',
    required: true,
  },
  {
    name: 'traffic',
    kind: 'string',
    placeholder: '<id>',
    summary: 'override the building’s traffic profile',
    defaultText: 'the building’s own',
  },
  {
    name: 'seed',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'master seed; the run replays exactly from it',
    min: 0,
    defaultText: 'random, and printed',
  },
  {
    name: 'duration',
    kind: 'number',
    placeholder: '<s>',
    summary: 'demand horizon in simulated seconds',
    min: 1,
    defaultText: 'the demand template’s own (1800 s)',
  },
  {
    // No `choices` list, deliberately (§ D274). A static one is checked at *parse* time against
    // the ids this build compiled, and the authority is the `demandTemplates` records the run
    // loads — which `--data <dir>` can change and which, since § D273, may author their own
    // phases and answer to ids no compiled-in list contains. `requireDemandTemplate` checks the
    // value against the catalogue instead, with the same "available / did you mean" error every
    // other data-derived flag gives.
    name: 'template',
    kind: 'string',
    placeholder: '<id>',
    summary: 'demand template; `elevator-sim list` names the ones this data directory ships',
    defaultText: 'rise-and-fall',
  },
  {
    name: 'rate',
    kind: 'number',
    placeholder: '<pct>',
    summary: 'arrival rate as % of population per 5 min, overriding the profile',
    min: 0,
  },
  {
    name: 'window',
    kind: 'string',
    placeholder: '<id>',
    summary: 'window the summary is computed over',
    choices: ['peak-5min', 'full-run'],
    defaultText: 'the demand template’s own',
  },
  { name: 'data', kind: 'string', placeholder: '<dir>', summary: 'data directory to read' },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const RUN_HELP: CommandHelp = {
  name: 'run',
  usage: `${BINARY} run --building <id> --dispatcher <id> [--traffic <id>] [--seed <n>] [--duration <s>]`,
  summary: 'run one simulation and print its summary',
  description: [
    'One replication: a seed, a building, a dispatcher profile and a demand template in; AWT, ' +
      'WT95, % waiting over 60 s, TTD, achieved interval, handling capacity and load factor out.',
    'One replication is a data point, not a result. To decide whether one dispatcher is better ' +
      'than another, use `compare`, which pairs replications under common random numbers and ' +
      'reports a confidence interval.',
  ],
  flags: RUN_FLAGS,
  examples: [
    `${BINARY} run --building garden-apartments --dispatcher eta --seed 42`,
    `${BINARY} run --building midtown-office --dispatcher predictive-balanced --traffic office-prestige`,
    `${BINARY} run --building midtown-office --dispatcher eta --rate 20   # push it towards saturation`,
  ],
};

export async function runCommand(
  out: Output,
  argv: readonly string[],
  errOut: Output = out,
): Promise<number> {
  const context = `${BINARY} run`;
  const parsed = parseArgs(argv, RUN_FLAGS, context);
  rejectPositionals(parsed, context);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, RUN_HELP);
    return 0;
  }

  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  const plan = planRun(config, parsed);

  let result: SimulationResult;
  try {
    result = new Simulation(plan.simulation).run();
  } catch (error) {
    if (error instanceof SimulationError && error.result !== undefined) {
      // A diagnostic that precedes a non-zero exit belongs on stderr: `run … > results.txt`
      // should leave the reason on the screen rather than bury it in an otherwise empty file.
      errOut.line();
      errOut.line(
        errOut.palette.red(errOut.palette.bold('The simulation refused to report this run.')),
      );
      errOut.line(wrap(error.message, Math.min(errOut.columns - 2, 92), '  '));
      errOut.line();
      errOut.line(`  seed ${plan.seedText} — pass it back with --seed to reproduce exactly.`);
      errOut.line();
      return EXIT_INTERNAL;
    }
    throw error;
  }

  printRunReport(out, plan, result);
  return 0;
}

/* -------------------------------------------------------------------------- *
 * Planning
 * -------------------------------------------------------------------------- */

export interface RunPlan {
  readonly simulation: SimulationConfig;
  readonly buildingName: string;
  readonly buildingId: string;
  readonly buildingType: string;
  readonly dispatcherName: string;
  readonly dispatcherId: string;
  readonly trafficProfileId: string;
  readonly trafficProfileName: string;
  readonly seedText: string;
  readonly commandLine: string;
  /**
   * Load-time disclaimers about this building, carried from the config layer.
   *
   * **This is the non-test reader the double-deck disclaimer code did not have.**
   * `resolveBuilding` raised it, `config/doubleDeck.test.ts` asserted it in both directions, and
   * no shipped path read the code — the CLI printed the `Simulation`-side statement and never
   * looked at `ResolvedBuilding.warnings` at all. A code nothing branches on is a string with a
   * test, which is the shape of defect the standing requirement in `docs/05-roadmap.md` names.
   *
   * **The branch survived Phase 6's double-deck work and was re-pointed rather than deleted.**
   * `double-deck-not-simulated` was retired because double-deck operation *is* simulated now;
   * `missing-floor-pairs` carries the same disclaimer over the one configuration where it is
   * still true — a double-deck bank with no declared pairing, which gets a single-deck shaft.
   * `docs/09` § 6.3 required exactly this: *"Phase 6 must not remove that branch, or the code
   * becomes the eighth dead seam again."* It is now raised by **no shipped building**, which is
   * the honest state for a disclaimer: available, read, and not needed.
   *
   * Selected **by code**, so the choice of what counts as a load-time disclaimer is a machine-
   * readable decision rather than a substring match on prose.
   */
  readonly configDisclaimers: readonly string[];
}

/** Config-warning codes the CLI repeats before a run, because they qualify its numbers. */
const DISCLAIMER_CODES: readonly string[] = [WARNING_CODES.missingFloorPairs];

/**
 * The `--template` id, checked against the catalogue this run loaded. § D274.
 *
 * **This is the non-test caller of the authored-phase-list path.** § D273 made a template's phases
 * authorable as data, and `data/traffic-profiles.json` ships `office-day` — a ten-hour office day as
 * an explicit phase list. Nothing about that is reachable unless something can *name* it, and this
 * is the something: `elevator-sim run --building midtown-office --dispatcher collective --template
 * office-day` resolves the record, builds its phases and runs them. `elevator-sim list` prints it
 * beside the other five from the same file, and `watch` reaches it through this same `planRun`.
 *
 * The previous predicate asked `DEMAND_TEMPLATE_IDS.includes(value)` and, on a miss, **silently
 * dropped the flag** — a run with `--template office-day` would have quietly run `rise-and-fall`
 * and printed the flag back in its own reproduce line. That is worse than the widening it now
 * needs: a mistyped template is a different experiment reported as the one you asked for.
 */
function demandTemplateIdOf(config: LoadedConfig, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return requireDemandTemplate(config, value).id;
}

export function planRun(config: LoadedConfig, parsed: ParsedArgs): RunPlan {
  const buildingId = requiredStringFlag(parsed, 'building');
  const dispatcherId = requiredStringFlag(parsed, 'dispatcher');
  const base = requireBuilding(config, buildingId);
  const profile = requireDispatcher(config, dispatcherId, '--dispatcher');
  const trafficId = stringFlag(parsed, 'traffic') ?? base.trafficProfile;
  const traffic = requireTrafficProfile(config, trafficId);
  const building = withTrafficProfile(base, trafficId);

  const seed = numberFlag(parsed, 'seed') ?? randomSeed();
  const durationS = numberFlag(parsed, 'duration');
  const template = stringFlag(parsed, 'template');
  const templateId = demandTemplateIdOf(config, template);
  const rate = numberFlag(parsed, 'rate');
  const window = stringFlag(parsed, 'window');

  const simulation: SimulationConfig = {
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    // The file, beside the one profile taken out of it — and **this is the shipped caller the
    // weight-set selector did not have.** § D141 built the mechanism and reached it only through
    // `DispatchPolicyOptions.weightSets`, which `experiments/src/runner/experiment.ts` plumbs and
    // no CLI command does, so a study could switch weight sets mid-run and `run` / `watch` could
    // not. `patternSwitching` and the profiles its arms name are both file-level; handing over
    // the file is what lets a profile opt in through `selection.policy` as **data** rather than
    // through a code path only a study can reach (CLAUDE.md invariant 7).
    //
    // Unconditional, and there is no `--selection` flag: no shipped profile opts in, so this is
    // inert on every command line anybody types today, and it is the data file that turns it on.
    dispatcherProfiles: config.dispatcherProfiles,
    seed,
    // A run that cannot clear its demand is a measurement of saturation, not a crash. Report it
    // and let the summary's own saturation test decide what may be quoted.
    onTimeout: 'report',
    ...(durationS === undefined ? {} : { durationS }),
    ...(templateId === undefined ? {} : { demandTemplate: templateId }),
    ...(rate === undefined ? {} : { demand: { arrivalRatePctPop5min: rate } }),
    ...(window === 'full-run' || window === 'peak-5min' ? { reportWindow: window } : {}),
  };

  const parts = [
    `${BINARY} run`,
    `--building ${buildingId}`,
    `--dispatcher ${dispatcherId}`,
    ...(stringFlag(parsed, 'traffic') === undefined ? [] : [`--traffic ${trafficId}`]),
    `--seed ${seed}`,
    ...(durationS === undefined ? [] : [`--duration ${durationS}`]),
    ...(template === undefined ? [] : [`--template ${template}`]),
    ...(rate === undefined ? [] : [`--rate ${rate}`]),
    ...(window === undefined ? [] : [`--window ${window}`]),
  ];

  return {
    simulation,
    buildingId,
    buildingName: base.name,
    buildingType: base.type,
    dispatcherId,
    dispatcherName: profile.name,
    trafficProfileId: trafficId,
    trafficProfileName: traffic.name,
    seedText: String(seed),
    commandLine: parts.join(' '),
    configDisclaimers: base.warnings
      .filter((warning) => DISCLAIMER_CODES.includes(warning.code))
      .map((warning) => warning.message),
  };
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

export function printRunReport(out: Output, plan: RunPlan, result: SimulationResult): void {
  const { bold, dim, red, yellow, green, cyan } = out.palette;
  const summary = result.summary;
  const awt = renderAwt(summary);
  const interval = renderAchievedInterval(summary.achievedInterval);

  heading(out, 'Run');
  field(out, 'building', `${plan.buildingName}  ${dim(`(${plan.buildingId}, ${plan.buildingType})`)}`);
  field(out, 'dispatcher', `${plan.dispatcherName}  ${dim(`(${plan.dispatcherId})`)}`);
  field(out, 'traffic', `${plan.trafficProfileName}  ${dim(`(${plan.trafficProfileId})`)}`);
  field(
    out,
    'window',
    `${summary.window.id}  ${dim(`[${clock(summary.window.startS)} – ${clock(summary.window.endS)}), ${duration(summary.windowSeconds)}`)}`,
  );
  field(out, 'horizon', `${duration(result.demandEndedAt)} of demand, run ended ${clock(result.endedAt)}`);
  field(out, 'seed', bold(cyan(plan.seedText)));
  field(
    out,
    'status',
    result.status === 'completed'
      ? green('completed')
      : yellow(`${result.status} — ${count(result.undelivered.length)} still in the system`),
  );

  const saturation = renderSaturation(summary);
  if (saturation !== undefined) {
    out.line();
    out.line(red(bold('  ██  SATURATED — this configuration cannot clear its demand.')));
    out.line(red(`      ${saturation}`));
    out.line(
      red('      The average waiting time is SUPPRESSED and must not be quoted for this run.'),
    );
    out.line(dim('      Lower --rate, add cars, or treat this as the capacity limit it is.'));
  } else if (!awt.quotable) {
    out.line();
    out.line(yellow(bold('  !!  This run has no reportable average waiting time.')));
    out.line(yellow(`      ${awt.reason ?? ''}`));
  }

  heading(out, 'Waiting');
  field(out, 'AWT', awt.quotable ? bold(awt.text) : red(bold(awt.text)), 24);
  if (!awt.quotable && awt.reason !== undefined) {
    out.line(dim(`  ${' '.repeat(24)}${awt.reason}`));
  }
  field(
    out,
    'WT95',
    awt.quotable ? secs(summary.waiting.p95S, 2) : red('SUPPRESSED'),
    24,
  );
  field(
    out,
    'waits over 60 s',
    awt.quotable
      ? `${pct(summary.waiting.pctOverLongWait, 1)}  ${dim(`(${count(summary.waiting.overLongWaitCount)} of ${count(summary.waiting.count)} served)`)}`
      : red('SUPPRESSED'),
    24,
  );
  // Never suppressed, and read off `serviceLevel` rather than `waiting.maxS`: see
  // `format.ts` § renderLongestWait. The tail is the evidence a suppressed mean is hiding, and
  // `waiting.maxS` is blind to a passenger who never boarded at all.
  const longest = renderLongestWait(summary);
  if (longest !== undefined) {
    field(
      out,
      'longest wait',
      longest.quotable ? longest.text : red(bold(longest.text)),
      24,
    );
    if (!longest.quotable && longest.reason !== undefined) {
      out.line(red(`  ${' '.repeat(24)}${longest.reason}`));
    }
  }
  if (summary.waiting.unservedCount > 0) {
    field(
      out,
      'never served',
      yellow(
        `${count(summary.waiting.unservedCount)} of ${count(summary.waiting.arrivalCount)} arrivals in the window`,
      ),
      24,
    );
  }

  heading(out, 'Journey');
  // TTD is a waiting statistic wearing a different name. Core defines it as arrival at the first
  // landing to alighting at the final one, *including every transfer wait*, and it is averaged
  // over the journeys that completed — so under saturation it is both divergent and measured on
  // the survivors. Printing it three lines under a banner that says the waiting time must not be
  // quoted would hand the reader the only quotable-looking wait on the screen.
  //
  // A non-finite value keeps its dash: "nobody was served in this window" is a different
  // statement from "this number exists and must not be repeated", and `--rate 0` deserves the
  // first one.
  const journey = (value: number): string =>
    awt.quotable ? secs(value, 2) : Number.isFinite(value) ? red(bold('SUPPRESSED')) : ABSENT;
  field(out, 'TTD (mean)', journey(summary.timeToDestination.meanS), 24);
  field(out, 'TTD (95th pct)', journey(summary.timeToDestination.p95S), 24);
  field(out, 'in-car time (mean)', secs(summary.rideTime.meanS, 2), 24);
  // Only worth saying when something was actually withheld: on an empty window every line above
  // is already a dash, and there is nothing for the note to explain.
  if (!awt.quotable && Number.isFinite(summary.timeToDestination.meanS)) {
    out.line(
      dim(
        `  ${' '.repeat(24)}time to destination contains the suppressed wait; in-car time does not`,
      ),
    );
  }

  heading(out, 'Group');
  field(
    out,
    'achieved interval',
    interval.quotable ? interval.text : yellow(interval.text),
    24,
  );
  if (!interval.quotable && interval.reason !== undefined) {
    out.line(dim(`  ${' '.repeat(24)}${interval.reason}`));
  }
  field(
    out,
    'handling capacity',
    `${num(summary.handlingCapacity.personsPer5Min, 1)} persons / 5 min` +
      (summary.handlingCapacity.pctPopulationPer5Min === undefined
        ? ''
        : `  ${dim(`(${pct(summary.handlingCapacity.pctPopulationPer5Min, 2)} of population)`)}`),
    24,
  );
  field(
    out,
    'demand offered',
    `${num(summary.handlingCapacity.offeredPer5Min, 1)} persons / 5 min`,
    24,
  );
  field(
    out,
    'mean car load',
    `${fractionAsPct(summary.loadFactor.meanLoadFactor, 1)} of rated  ${dim(`(design ${fractionAsPct(summary.loadFactor.designLoadFactor, 0)}, peak ${fractionAsPct(summary.loadFactor.maxLoadFactor, 0)})`)}`,
    24,
  );

  heading(out, 'Passengers');
  /*
   * **The whole balance, or the reader is handed three numbers that do not add up.**
   *
   * `generated === delivered + undelivered` was the identity for the life of this line. It is now
   * `generated === delivered + undelivered + abandoned` (docs/14 § 3.1), and the two extra terms
   * are printed **only when they are non-zero** — which is every run that declares no
   * `sim.patience` and no stair, so the line is byte-identical on everything this repository has
   * published. A run where riders walked out and the line still said three numbers would be a
   * subtraction the reader would do and get wrong.
   *
   * Stairs riders are inside `delivered` — they reached their destination — and are called out
   * beside it because they reached it **without a lift**, so every per-leg figure above describes
   * a smaller population than `delivered` suggests (docs/14 § 5 criterion 4).
   */
  const { abandoned, stairsJourneys } = result.conservation;
  field(
    out,
    'whole run',
    [
      `${count(result.conservation.generated)} generated`,
      `${count(result.conservation.delivered)} delivered`,
      `${count(result.conservation.undelivered)} undelivered`,
      ...(abandoned === undefined || abandoned === 0 ? [] : [`${count(abandoned)} gave up`]),
      ...(stairsJourneys === undefined || stairsJourneys === 0
        ? []
        : [`${count(stairsJourneys)} took the stairs`]),
    ].join(' · '),
    24,
  );
  field(
    out,
    'in the window',
    `${count(summary.counts.arrivals)} arrived · ${count(summary.counts.boarded)} boarded · ${count(summary.counts.alighted)} alighted`,
    24,
  );

  /*
   * Who the interface turned away, beside the counts that would otherwise absorb them.
   *
   * **This is one of the two non-test callers `StageActivity.kioskRefusedLegs` did not have**
   * (DECISIONS.md § D137 item 2, § D149 item 2); the other is `benchmark/accessControl.ts`'s
   * coverage column. It goes *inside* the Passengers block rather than in a block of its own
   * because that is the block whose `undelivered` figure it explains: a refused leg is counted
   * there too, and without this line a reader cannot tell a passenger the building could not
   * reach from one the kiosk declined to ask about. That distinction is the whole reason the
   * counter exists — § D137 states the bare kiosk's cost as *who* rather than as a rate, which
   * is the half an unserved fraction cannot see.
   *
   * A run already raises a warning for this, and the warning is not a substitute: it is prose in
   * a list that a busy run truncates at twelve, and it names the mechanism rather than the
   * magnitude. This is the magnitude, in the table.
   *
   * Shown only when non-zero, like the door holds above. Every profile
   * `data/dispatcher-profiles.json` ships runs at `up-down-buttons` or `mobile-credential`, so a
   * shipped run prints nothing here — the line exists for the reader who authors
   * `dispatch.callType: "destination-entry"` on an access-zoned building, which is exactly the
   * configuration nothing else in the report distinguishes from ordinary overflow.
   */
  if (result.stageActivity.kioskRefusedLegs > 0) {
    field(
      out,
      'refused at the kiosk',
      `${count(result.stageActivity.kioskRefusedLegs)} leg(s) ${dim('— a destination disclosed with no credential, on an access-zoned floor')}`,
      24,
    );
  }

  /*
   * The courtesy hold, whenever the run asked for one at all.
   *
   * **This is the non-test caller `StageActivity.lateArrivalHolds*` did not have.** The counters
   * exist to separate "the profile declined every hold" from "nothing ever requests one", and
   * that distinction is worth nothing to a reader who cannot see it: `runSimulation` returns a
   * `SimulationResult`, the counters were only on the `Simulation` instance, and every non-test
   * caller in this repository goes through the function. Printing `requested` next to `granted`
   * is the whole point — a granted count alone cannot tell a switched-off knob from a
   * disconnected one, which is exactly the state this knob spent its life in.
   *
   * Shown only when a hold was requested, so a building whose landings always empty (Garden
   * Apartments) does not carry a row of zeroes.
   */
  const holds = result.stageActivity;
  if (holds.lateArrivalHoldsRequested > 0) {
    heading(out, 'Door holds');
    field(
      out,
      'late arrivals',
      `${count(holds.lateArrivalHoldsRequested)} requested · ${count(holds.lateArrivalHoldsGranted)} granted · ${count(holds.lateArrivalHoldsRefused)} refused`,
      24,
    );
    if (holds.lateArrivalHoldsGranted > 0) {
      field(
        out,
        'bought',
        `${count(holds.lateArrivalHoldsBoarded)} boarded for ${holds.lateArrivalHoldDwellS.toFixed(1)} s of held dwell`,
        24,
      );
    }
  }

  /*
   * Two lists, deliberately, and neither is truncated away.
   *
   * `result.warnings` arrives disclaimers-first because `Simulation` orders it that way rather
   * than by accident of construction order — the double-deck line used to survive this cut only
   * because it happened to be warning #1 on the one building that raises it. The cut is 12
   * rather than 6 as well, so a run that raises several stuck-call advisories does not push a
   * disclaimer off the screen even if the ordering were ever to change again.
   */
  if (plan.configDisclaimers.length > 0) {
    heading(out, 'Configuration');
    for (const disclaimer of plan.configDisclaimers) {
      out.line(yellow(`  • ${disclaimer}`));
    }
  }

  if (result.warnings.length > 0) {
    heading(out, 'Warnings');
    for (const warning of result.warnings.slice(0, 12)) {
      out.line(yellow(`  • ${warning}`));
    }
    if (result.warnings.length > 12) {
      out.line(dim(`  … and ${count(result.warnings.length - 12)} more`));
    }
  }

  out.line();
  out.line(`  ${dim('reproduce:')} ${cyan(plan.commandLine)}`);
  out.line();
}
