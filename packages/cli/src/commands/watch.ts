/**
 * `elevator-sim watch` — the building, live, in ASCII.
 *
 * The run is simulated first (it takes milliseconds) and then *played back* against the wall
 * clock at `--speed` simulated seconds per real second. Car height comes from
 * `timeline.heightAt`, which evaluates the same S-curve the kernel timed each move with, so the
 * motion is smooth and analytically exact rather than a car teleporting from stop to stop —
 * the interface docs/01-architecture.md designed `Car.positionAt` for.
 *
 * Everything else on screen is read from the finished `RunRecord`: occupancy from the load
 * samples, landing queues and the running mean wait from the passenger records. Those are the
 * same numbers the summary is computed from, so the picture and the statistics cannot disagree.
 *
 * Degradation is deliberate, in three steps: a full frame on a TTY that is big enough, a
 * narrower frame with fewer shafts when it is not, and plain scrolling lines when the output is
 * a pipe or the terminal is too short to hold the building.
 */

import {
  DEMAND_TEMPLATE_IDS,
  Simulation,
  SimulationError,
  type PassengerModel,
  type ResolvedBuilding,
  type RunSummary,
  type SimulationResult,
} from '@elevator-sim/core';

import {
  CLEAR_LINE,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_HOME,
  CURSOR_SHOW,
  padEnd,
  padStart,
} from '../ansi.js';
import {
  numberFlag,
  parseArgs,
  rejectPositionals,
  stringFlag,
  type FlagSpec,
} from '../args.js';
import { loadData, resolveDataDir } from '../data.js';
import { EXIT_INTERNAL, UsageError, didYouMean } from '../errors.js';
import { bar, clock, count, num, renderRunningMean } from '../format.js';
import { BINARY, printCommandHelp, type CommandHelp } from '../help.js';
import type { Output } from '../output.js';
import { planRun, printRunReport, type RunPlan } from './run.js';
import {
  QueueClock,
  buildLoadTracks,
  captureTimeline,
  directionAt,
  doorPhaseAt,
  floorIdAt,
  heightAt,
  loadAt,
  type CarTrack,
  type CarTracks,
} from '../timeline.js';

export const WATCH_FLAGS: readonly FlagSpec[] = [
  {
    name: 'building',
    kind: 'string',
    placeholder: '<id>',
    summary: 'which building to watch',
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
    name: 'speed',
    kind: 'number',
    placeholder: '<x>',
    summary: 'simulated seconds per real second',
    min: 0.1,
    max: 1000,
    defaultValue: 10,
  },
  {
    name: 'bank',
    kind: 'string',
    placeholder: '<id>',
    summary: 'show only this bank’s shafts',
    defaultText: 'all banks',
  },
  {
    name: 'traffic',
    kind: 'string',
    placeholder: '<id>',
    summary: 'override the building’s traffic profile',
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
  },
  {
    name: 'rate',
    kind: 'number',
    placeholder: '<pct>',
    summary: 'arrival rate as % of population per 5 min',
    min: 0,
  },
  {
    name: 'template',
    kind: 'string',
    placeholder: '<id>',
    summary: 'demand template',
    choices: [...DEMAND_TEMPLATE_IDS],
  },
  { name: 'plain', kind: 'boolean', summary: 'force line output instead of a live frame' },
  { name: 'data', kind: 'string', placeholder: '<dir>', summary: 'data directory to read' },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const WATCH_HELP: CommandHelp = {
  name: 'watch',
  usage: `${BINARY} watch --building <id> --dispatcher <id> [--speed 10] [--bank <id>] [--seed <n>]`,
  summary: 'watch the cars move in real time, then get the summary',
  description: [
    'Floors are rows, shafts are columns. Each car sits at its interpolated height with its door ' +
      'state and load; each landing shows who is waiting and which way they want to go.',
    'The run is simulated up front and played back at --speed simulated seconds per real second, ' +
      'so the motion between stops is the real jerk-limited S-curve rather than a jump. Ctrl-C ' +
      'stops the playback and prints the full summary for the part of the run you watched.',
  ],
  flags: WATCH_FLAGS,
  examples: [
    `${BINARY} watch --building garden-apartments --dispatcher eta --speed 10`,
    `${BINARY} watch --building midtown-office --dispatcher predictive-balanced --speed 30`,
    `${BINARY} watch --building vertical-city --dispatcher eta --bank shuttle --speed 60`,
  ],
};

export async function watchCommand(
  out: Output,
  argv: readonly string[],
  errOut: Output = out,
): Promise<number> {
  const context = `${BINARY} watch`;
  const parsed = parseArgs(argv, WATCH_FLAGS, context);
  rejectPositionals(parsed, context);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, WATCH_HELP);
    return 0;
  }

  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  const plan = planRun(config, parsed);
  const building = plan.simulation.building;

  // Validated before anything is simulated: a mistyped bank should cost a millisecond, not a
  // whole run.
  const bankId = stringFlag(parsed, 'bank');
  requireBank(building, bankId);

  const simulation = new Simulation(plan.simulation);
  const tracks = captureTimeline(simulation.building, building);

  let result: SimulationResult;
  try {
    result = simulation.run();
  } catch (error) {
    if (error instanceof SimulationError) {
      // Precedes a non-zero exit, so it is a diagnostic and belongs on stderr.
      errOut.line();
      errOut.line(
        errOut.palette.red(`  the simulation refused to report this run: ${error.message}`),
      );
      errOut.line(`  seed ${plan.seedText}`);
      return EXIT_INTERNAL;
    }
    throw error;
  }

  const shafts = selectShafts(building, tracks, bankId);
  const speed = numberFlag(parsed, 'speed') ?? 10;
  const forcePlain = parsed.values['plain'] === true;

  await play(out, plan, building, result, shafts, speed, forcePlain);

  out.line();
  out.line(out.palette.dim('  playback finished — the whole run, summarised:'));
  printRunReport(out, plan, result);
  return 0;
}

/* -------------------------------------------------------------------------- *
 * Shaft selection
 * -------------------------------------------------------------------------- */

interface Shaft {
  readonly track: CarTrack;
  readonly label: string;
}

/** @throws UsageError naming the banks this building does have. */
function requireBank(building: ResolvedBuilding, bankId: string | undefined): void {
  const known = building.banks.map((bank) => bank.id);
  if (bankId === undefined || known.includes(bankId)) return;
  const suggestion = didYouMean(bankId, known);
  throw new UsageError(`building "${building.id}" has no bank "${bankId}".`, [
    `banks: ${known.join(', ')}`,
    ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
  ]);
}

function selectShafts(
  building: ResolvedBuilding,
  tracks: CarTracks,
  bankId: string | undefined,
): readonly Shaft[] {
  const order = new Map(building.banks.map((bank, index) => [bank.id, index]));
  const chosen = [...tracks.values()].filter(
    (track) => bankId === undefined || track.bankId === bankId,
  );
  chosen.sort(
    (a, b) =>
      (order.get(a.bankId) ?? 0) - (order.get(b.bankId) ?? 0) || a.carId.localeCompare(b.carId),
  );
  const banksShown = new Set(chosen.map((track) => track.bankId)).size;
  return chosen.map((track) => ({
    track,
    label: banksShown === 1 ? track.label : `${track.bankId}/${track.label}`,
  }));
}

/* -------------------------------------------------------------------------- *
 * Playback
 * -------------------------------------------------------------------------- */

const FRAME_MS = 60;
const CELL_WIDTH = 5;
const FLOOR_LABEL_WIDTH = 12;
const WAITING_WIDTH = 12;

async function play(
  out: Output,
  plan: RunPlan,
  building: ResolvedBuilding,
  result: SimulationResult,
  shafts: readonly Shaft[],
  speed: number,
  forcePlain: boolean,
): Promise<void> {
  const floors = [...building.floors].sort((a, b) => a.heightM - b.heightM);
  const loads = buildLoadTracks(result.record);
  const queues = new QueueClock(result.record);
  const endS = result.endedAt;

  const frame = layoutFor(out, floors.length, shafts.length);
  if (forcePlain || !out.isTTY || frame === undefined) {
    playPlain(out, plan, building, result, shafts, loads, queues, endS, frame === undefined && out.isTTY);
    return;
  }

  const visibleShafts = shafts.slice(0, frame.shafts);
  let stopped = false;
  const onSigint = (): void => {
    stopped = true;
  };
  process.on('SIGINT', onSigint);
  out.raw(CURSOR_HIDE);
  out.raw(CLEAR_SCREEN);

  const startedWall = Date.now();
  try {
    for (;;) {
      const t = Math.min(endS, ((Date.now() - startedWall) / 1000) * speed);
      queues.advanceTo(t);
      out.raw(CURSOR_HOME);
      for (const line of renderFrame(out, plan, building, floors, visibleShafts, shafts.length, loads, queues, t, endS, speed, frame.rowsPerFloor, passengerModelOfRun(result), result.summary)) {
        out.raw(`${line}${CLEAR_LINE}\n`);
      }
      if (stopped || t >= endS) break;
      await sleep(FRAME_MS);
    }
  } finally {
    process.off('SIGINT', onSigint);
    out.raw(CURSOR_SHOW);
    out.raw('\n');
  }

  if (stopped) {
    out.line(out.palette.dim('  stopped at your request.'));
  }
}

interface FrameLayout {
  readonly rowsPerFloor: number;
  readonly shafts: number;
}

/**
 * Decide how much detail fits, or `undefined` when even one row per floor will not.
 *
 * Two rows per floor doubles the vertical resolution of the motion, which is what makes a car
 * crossing a 3 m pitch read as movement rather than as a blink.
 */
export function layoutFor(
  out: Output,
  floorCount: number,
  shaftCount: number,
): FrameLayout | undefined {
  const chrome = 12; // header, legend, per-car status, blank lines
  const widthForShafts = out.columns - FLOOR_LABEL_WIDTH - WAITING_WIDTH - 4;
  const shafts = Math.max(1, Math.min(shaftCount, Math.floor(widthForShafts / (CELL_WIDTH + 1))));
  if (widthForShafts < CELL_WIDTH + 1) return undefined;

  for (const rowsPerFloor of [2, 1]) {
    const height = (floorCount - 1) * rowsPerFloor + 1 + chrome;
    if (height <= out.rows) return { rowsPerFloor, shafts };
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* -------------------------------------------------------------------------- *
 * The frame
 * -------------------------------------------------------------------------- */

function renderFrame(
  out: Output,
  plan: RunPlan,
  building: ResolvedBuilding,
  floors: readonly { readonly id: string; readonly heightM: number; readonly label?: string | undefined }[],
  shafts: readonly Shaft[],
  totalShafts: number,
  loads: ReturnType<typeof buildLoadTracks>,
  queues: QueueClock,
  t: number,
  endS: number,
  speed: number,
  rowsPerFloor: number,
  model: PassengerModel,
  summary: RunSummary,
): readonly string[] {
  const { bold, dim, cyan, green, yellow, red, magenta } = out.palette;
  const lines: string[] = [];

  lines.push(
    ` ${bold(building.name)} ${dim('·')} ${cyan(plan.dispatcherId)} ${dim('·')} ${plan.trafficProfileId}` +
      `   ${dim('seed')} ${cyan(plan.seedText)} ${dim(`· ×${num(speed, 0)} speed`)}`,
  );
  /*
   * `T29`/`D1`: the running mean is suppressed on the grounds the summary already decided, and
   * the reason leads the frame rather than waiting for `printRunReport` at the end of playback.
   *
   * This screen used to print `mean wait so far 41.5 s` for the whole of a run that the report
   * two seconds later called `AWT  SUPPRESSED` — the same defect the web viewer's canvas header
   * had, on the other surface, found by checking rather than trusting that the viewer was the
   * only one.
   */
  const mean = renderRunningMean(summary, queues.runningMeanWaitS);
  lines.push(
    ` ${bold(clock(t))} ${dim(`/ ${clock(endS)}`)}   ` +
      `${dim('waiting')} ${bold(String(queues.totalWaiting))}   ` +
      `${dim('served')} ${String(queues.served)}   ` +
      `${dim('mean wait so far')} ${mean.quotable ? bold(mean.text) : red(mean.text)}`,
  );
  if (!mean.quotable && mean.reason !== undefined) {
    lines.push(` ${red(`AWT suppressed — ${mean.reason}`)}`);
  } else {
    lines.push('');
  }

  const header =
    ` ${padEnd(dim('floor'), FLOOR_LABEL_WIDTH)}` +
    shafts.map((shaft) => ` ${dim(centre(shaft.label, CELL_WIDTH))}`).join('') +
    `   ${dim('waiting')}`;
  lines.push(header);

  const totalRows = (floors.length - 1) * rowsPerFloor + 1;
  const rowContent: string[] = new Array<string>(totalRows).fill('');
  const rowLabel: string[] = new Array<string>(totalRows).fill('');
  const rowWaiting: string[] = new Array<string>(totalRows).fill('');
  const rowCells: string[][] = Array.from({ length: totalRows }, () =>
    shafts.map(() => `  ${dim('│')}  `),
  );

  // Floor labels and landing queues sit on the floor's own row.
  for (const [index, floor] of floors.entries()) {
    const row = (floors.length - 1 - index) * rowsPerFloor;
    rowLabel[row] = `${padStart(floor.id, 4)} ${dim(`${num(floor.heightM, 1)} m`)}`;
    const up = queues.waitingUp(floor.id);
    const down = queues.waitingDown(floor.id);
    const parts: string[] = [];
    if (up > 0) parts.push(green(`▲${up}`));
    if (down > 0) parts.push(magenta(`▼${down}`));
    rowWaiting[row] = parts.length === 0 ? dim('·') : parts.join(' ');
    for (const [shaftIndex, shaft] of shafts.entries()) {
      if (!shaft.track.servedFloorIds.has(floor.id)) {
        const cells = rowCells[row];
        if (cells !== undefined) cells[shaftIndex] = '     ';
      }
    }
  }

  // Cars, at their exact interpolated height.
  for (const [shaftIndex, shaft] of shafts.entries()) {
    const height = heightAt(shaft.track, t);
    const row = rowFor(floors, height, rowsPerFloor);
    const cells = rowCells[row];
    if (cells === undefined) continue;
    const reading = loadAt(loads.get(shaft.track.carId), t);
    const glyph = bar(reading.loadFactor, 3);
    const tint = reading.loadFactor >= 0.8 ? red : reading.loadFactor >= 0.5 ? yellow : green;
    const [left, right] = doorBrackets(doorPhaseAt(shaft.track, t));
    cells[shaftIndex] = `${dim(left)}${tint(glyph)}${dim(right)}`;
  }

  for (let row = 0; row < totalRows; row += 1) {
    rowContent[row] =
      ` ${padEnd(rowLabel[row] ?? '', FLOOR_LABEL_WIDTH)}` +
      (rowCells[row] ?? []).map((cell) => ` ${cell}`).join('') +
      `   ${rowWaiting[row] ?? ''}`;
  }
  lines.push(...rowContent);

  lines.push('');
  for (const shaft of shafts.slice(0, 8)) {
    const reading = loadAt(loads.get(shaft.track.carId), t);
    const direction = directionAt(shaft.track, t);
    const arrow = direction === 1 ? green('▲') : direction === -1 ? magenta('▼') : dim('·');
    const where =
      direction === 0
        ? `at ${padEnd(floorIdAt(shaft.track, t), 4)}`
        : `near ${padEnd(nearestFloorId(floors, heightAt(shaft.track, t)), 4)}`;
    lines.push(
      ` ${cyan(padEnd(shaft.label, 10))} ${arrow} ${dim(padEnd(where, 9))}` +
        ` ${padStart(String(reading.occupants), 2)} aboard  ${padStart(num(reading.loadFactor * 100, 0), 3)} % load` +
        `  ${dim(`doors ${doorPhaseAt(shaft.track, t)}`)}`,
    );
  }
  if (totalShafts > shafts.length) {
    lines.push(
      dim(
        ` showing ${shafts.length} of ${totalShafts} cars — widen the terminal, or use --bank <id>`,
      ),
    );
  }
  lines.push('');
  lines.push(dim(` ${landingLegend(model)}`));
  lines.push(
    dim(
      ` ${green('▲')} waiting up   ${magenta('▼')} waiting down   ` +
        'doors: [███] shut  (███) moving  ]███[ open   bar = car load   Ctrl-C to stop',
    ),
  );
  return lines;
}

/**
 * The passenger model this run used, off the record the run produced.
 *
 * `RunRecord.passengerModel` is written only for a destination-dispatch run — `Simulation` omits
 * it otherwise so a version-1 record still parses — so its absence *is* `conventional`.
 */
export function passengerModelOfRun(result: SimulationResult): PassengerModel {
  return result.record.passengerModel ?? 'conventional';
}

/**
 * What the `waiting` column means, which is not the same thing under the two passenger models.
 *
 * Under `conventional` the column is a hall call: `▲8` is eight people who pressed one button
 * and will take whichever car opens. Under `destination-dispatch` there is no direction button —
 * each of those eight registered a *destination* at a panel and was told which car to walk to,
 * possibly eight different cars (measured on Midtown Office: 92 origin-destination calls and 132
 * distinct promises behind 28 direction buckets). The count is still true; what it counts is
 * not, and a viewer that says nothing lets a reader carry the conventional reading across.
 *
 * The full disclaimer — the nine metrics that stop being comparable — is in `result.warnings`
 * and `printRunReport` prints it when playback ends. This is the one-line version, on screen
 * while the reader is actually looking at the column.
 */
export function landingLegend(model: PassengerModel): string {
  return model === 'destination-dispatch'
    ? 'destination dispatch: the waiting column is a direction bucket, but each person there was already assigned one car at the panel'
    : 'waiting: people at the landing who pressed a direction button; any car that opens may take them';
}

/** Doors as brackets: shut points in, open points out, moving is round. */
function doorBrackets(phase: ReturnType<typeof doorPhaseAt>): readonly [string, string] {
  if (phase === 'open') return [']', '['];
  if (phase === 'closed') return ['[', ']'];
  return ['(', ')'];
}

/** Centre `text` in `width`, for a column header sitting over a 5-character car cell. */
function centre(text: string, width: number): string {
  const trimmed = text.length > width ? text.slice(0, width) : text;
  const left = Math.floor((width - trimmed.length) / 2);
  return ' '.repeat(left) + trimmed + ' '.repeat(width - trimmed.length - left);
}

/** The floor whose height is closest to `heightM`. What a moving car is passing. */
export function nearestFloorId(
  floors: readonly { readonly id: string; readonly heightM: number }[],
  heightM: number,
): string {
  let best = floors[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const floor of floors) {
    const distance = Math.abs(floor.heightM - heightM);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = floor;
    }
  }
  return best?.id ?? '?';
}

/**
 * The display row for a height, at sub-floor resolution.
 *
 * Interpolates between the two bracketing floors so a car halfway up a pitch lands on the row
 * between them when there is one.
 */
export function rowFor(
  floors: readonly { readonly heightM: number }[],
  heightM: number,
  rowsPerFloor: number,
): number {
  const last = floors.length - 1;
  if (last <= 0) return 0;
  const lowest = floors[0]?.heightM ?? 0;
  const highest = floors[last]?.heightM ?? 0;
  if (heightM <= lowest) return last * rowsPerFloor;
  if (heightM >= highest) return 0;

  let ordinal = 0;
  for (let index = 0; index < last; index += 1) {
    const low = floors[index]?.heightM ?? 0;
    const high = floors[index + 1]?.heightM ?? low;
    if (heightM >= low && heightM <= high) {
      const span = high - low;
      ordinal = index + (span === 0 ? 0 : (heightM - low) / span);
      break;
    }
  }
  const row = Math.round((last - ordinal) * rowsPerFloor);
  return Math.max(0, Math.min(last * rowsPerFloor, row));
}

/* -------------------------------------------------------------------------- *
 * The fallback
 * -------------------------------------------------------------------------- */

/**
 * Line output: one row per slice of simulated time, no cursor control, no waiting.
 *
 * Used when stdout is not a TTY, when the terminal is too small to hold the building, or when
 * `--plain` asks for it. A pipe should get text, not escape codes; a 24-row terminal asked to
 * show a 60-floor tower should get something useful rather than a crash.
 */
function playPlain(
  out: Output,
  plan: RunPlan,
  building: ResolvedBuilding,
  result: SimulationResult,
  shafts: readonly Shaft[],
  loads: ReturnType<typeof buildLoadTracks>,
  queues: QueueClock,
  endS: number,
  tooSmall: boolean,
): void {
  const { dim, bold, cyan } = out.palette;
  out.line();
  if (tooSmall) {
    out.line(
      dim(
        `  this terminal is ${out.columns}×${out.rows}; ${building.floors.length} floors and ${shafts.length} shafts do not fit. Falling back to lines.`,
      ),
    );
  }
  out.line(
    `  ${bold(building.name)} ${dim('·')} ${cyan(plan.dispatcherId)} ${dim('·')} seed ${cyan(plan.seedText)}`,
  );
  out.line(dim(`  ${landingLegend(passengerModelOfRun(result))}`));
  // `T29`/`D1`: said once, above the table, rather than left to `printRunReport` after the last
  // row — a column of `SUPPRESSED` with no reason beside it explains nothing.
  if (!result.summary.awtIsValid) {
    out.line(
      out.palette.red(
        `  AWT suppressed — ${result.summary.awtInvalidReason ?? 'this run’s average waiting time is not reportable'}`,
      ),
    );
  }
  out.line();
  const labels = shafts.slice(0, 8);
  out.line(
    dim(
      `  ${padEnd('time', 8)}${padStart('waiting', 8)}${padStart('served', 8)}${padStart('mean wait', 11)}   ${labels.map((shaft) => padEnd(shaft.label, 9)).join('')}`,
    ),
  );

  const step = Math.max(15, Math.round(endS / 60));
  for (let t = 0; t <= endS; t += step) {
    queues.advanceTo(t);
    const cars = labels
      .map((shaft) => {
        const reading = loadAt(loads.get(shaft.track.carId), t);
        const direction = directionAt(shaft.track, t);
        const arrow = direction === 1 ? '^' : direction === -1 ? 'v' : '-';
        return padEnd(`${floorIdAt(shaft.track, t)}${arrow}${reading.occupants}`, 9);
      })
      .join('');
    // `T29`/`D1`, the second of this command's two render paths.
    const mean = renderRunningMean(result.summary, queues.runningMeanWaitS, { unit: false });
    out.line(
      `  ${padEnd(clock(t), 8)}${padStart(String(queues.totalWaiting), 8)}${padStart(String(queues.served), 8)}` +
        `${padStart(mean.text, 11)}   ${cars}`,
    );
  }
  queues.advanceTo(endS);
  out.line();
  out.line(
    dim(
      `  ${count(result.conservation.generated)} passengers generated, ${count(result.conservation.delivered)} delivered.`,
    ),
  );
}
