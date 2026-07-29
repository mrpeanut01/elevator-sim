/**
 * `elevator-sim list` — what is available to run.
 *
 * Everything on screen is read from the data directory, never from a table in this file.
 * Dispatchers are weight vectors in `data/dispatcher-profiles.json` (CLAUDE.md invariant 7), so
 * a new dispatcher appears here the moment it is added to that file and needs no code change.
 */

import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '@elevator-sim/core';

import { parseArgs, rejectPositionals, stringFlag, type FlagSpec } from '../args.js';
import { carCount, loadData, resolveDataDir } from '../data.js';
import { count, duration, num, secs } from '../format.js';
import { BINARY, printCommandHelp, type CommandHelp } from '../help.js';
import { heading, table, type Output } from '../output.js';

export const LIST_FLAGS: readonly FlagSpec[] = [
  {
    name: 'data',
    kind: 'string',
    placeholder: '<dir>',
    summary: 'data directory to read',
    defaultText: "the repository's data/",
  },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const LIST_HELP: CommandHelp = {
  name: 'list',
  usage: `${BINARY} list [--data <dir>]`,
  summary: 'show the buildings, dispatchers and traffic profiles you can run',
  description: [
    'Reads the data directory and prints everything it contains. This is the vocabulary every ' +
      'other command takes: the ids in the first column are what --building, --dispatcher and ' +
      '--traffic accept.',
  ],
  flags: LIST_FLAGS,
  examples: [`${BINARY} list`, `${BINARY} list --data ./my-data`],
};

export async function listCommand(out: Output, argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, LIST_FLAGS, `${BINARY} list`);
  rejectPositionals(parsed, `${BINARY} list`);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, LIST_HELP);
    return 0;
  }
  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  printList(out, config);
  return 0;
}

/** Exported so `list.test.ts` can assert on the rendering without touching argv. */
export function printList(out: Output, config: LoadedConfig): void {
  const { dim, bold, cyan, yellow } = out.palette;

  out.line();
  out.line(`${bold('elevator-sim')} ${dim(`— ${config.dataDir}`)}`);

  heading(out, `Buildings  (${count(config.buildings.length)})`);
  table(
    out,
    [
      { header: 'id' },
      { header: 'name' },
      { header: 'type' },
      { header: 'floors', align: 'right' },
      { header: 'banks', align: 'right' },
      { header: 'cars', align: 'right' },
      { header: 'people', align: 'right' },
      { header: 'traffic' },
    ],
    config.buildings.map((building) => [
      cyan(building.id),
      building.name,
      building.type,
      count(building.floors.length),
      count(building.banks.length),
      count(carCount(building)),
      count(building.totalPopulation),
      building.trafficProfile,
    ]),
  );
  for (const building of config.buildings) {
    const note = bankNote(building);
    if (note !== undefined) out.line(dim(`    ${building.id}: ${note}`));
  }

  heading(out, `Dispatcher profiles  (${count(config.dispatcherProfiles.profiles.length)})`);
  table(
    out,
    [
      { header: 'id' },
      { header: 'name' },
      { header: 'role' },
      { header: 'weight vector  (term × weight, heaviest first)' },
    ],
    config.dispatcherProfiles.profiles.map((profile) => [
      cyan(profile.id),
      profile.name,
      profile.role ?? dim('—'),
      summariseWeights(profile),
    ]),
  );
  out.line(
    dim(
      '    A dispatcher is a weight vector over one shared cost function, not a class. Add one by',
    ),
  );
  out.line(dim('    editing data/dispatcher-profiles.json — no code changes.'));

  heading(out, `Traffic profiles  (${count(config.trafficProfiles.profiles.length)})`);
  table(
    out,
    [
      { header: 'id' },
      { header: 'name' },
      { header: 'governing peak' },
      { header: '%pop/5min', align: 'right' },
      { header: 'target INT', align: 'right' },
      { header: 'target AWT', align: 'right' },
      { header: 'batches' },
    ],
    config.trafficProfiles.profiles.map((profile) => [
      cyan(profile.id),
      profile.name,
      profile.governingPeak,
      `${num(profile.arrivalRatePctPop5min.typical, 1)} %`,
      secs(profile.targetIntervalS, 0),
      secs(profile.targetAvgWaitS, 0),
      `${profile.batchSize.distribution}, mean ${num(profile.batchSize.mean, 1)}`,
    ]),
  );
  out.line(
    dim('    Each building declares one of these; --traffic overrides it for a single run.'),
  );

  heading(out, 'Demand templates');
  table(
    out,
    [
      { header: 'id' },
      { header: 'name' },
      { header: 'horizon', align: 'right' },
      { header: 'reported over' },
      { header: '' },
    ],
    config.trafficProfiles.demandTemplates.map((template) => [
      cyan(template.id),
      template.name,
      duration(template.durationMin * 60),
      template.reportWindow ?? 'full-run',
      template.recommended ? yellow('recommended') : '',
    ]),
  );

  out.line();
  out.line(bold('Try'));
  const firstBuilding = config.buildings[0]?.id ?? 'garden-apartments';
  const { a, b } = tryDispatchers(config.dispatcherProfiles.profiles);
  out.line(
    `  ${dim('$')} ${BINARY} run --building ${firstBuilding} --dispatcher ${a} --seed 42`,
  );
  out.line(
    `  ${dim('$')} ${BINARY} compare --building ${firstBuilding} --a ${a} --b ${b} --reps 100 --window full-run`,
  );
  out.line(`  ${dim('$')} ${BINARY} watch --building ${firstBuilding} --dispatcher ${a} --speed 10`);
  out.line();
}

/* -------------------------------------------------------------------------- *
 * The Try block's two dispatchers
 * -------------------------------------------------------------------------- */

/**
 * The dispatcher the Try block tells a newcomer to **run** and to **watch**.
 *
 * Before wave 9 this was `profiles[0]`, and `data/dispatcher-profiles.json` lists `nearest-car`
 * first, so `elevator-sim list` — the first command of the README's own six-command tour, and the
 * first thing anyone types — printed:
 *
 * ```text
 *   $ elevator-sim run --building garden-apartments --dispatcher nearest-car --seed 42
 *   $ elevator-sim watch --building garden-apartments --dispatcher nearest-car --speed 10
 * ```
 *
 * `docs/07-handoff.md` § 4 measures `nearest-car` as *"the **only** profile that saturates"* — its
 * first invalid replication is **287** on Midtown up-peak at `arms.ts`' seed, **174** at
 * `matrix.ts`', **12** at Midtown down-peak, and (§ D147) **26** and **6** on Vertical City, so on
 * three of the eight matrix cells there is no budget in CLAUDE.md's 50–200 band that fits under it.
 * The curated example lists — `help.ts`' *Start here*, `run.ts`, `watch.ts`, `compare.ts` — were all
 * moved off it. **This one was missed because it is derived rather than authored**, which is the
 * whole shape of the debt: a preference nobody wrote is a preference nobody reviewed.
 *
 * Same construction as the viewer's (§ D134, `viz/src/dev/defaults.ts`): a preference list with a
 * fallback to file order, so renaming a profile cannot empty the block.
 */
export const TRY_RECOMMENDED_DISPATCHERS: readonly string[] = Object.freeze(['collective', 'eta']);

/**
 * The **B** arm of the Try block's `compare`, and `nearest-car` is deliberately kept here.
 *
 * A weak arm is the wrong thing to *run* and the right thing to *compare against*: the pair has to
 * be structurally different for a first comparison to return a verdict rather than a refusal.
 * `docs/03` § Variance reduction measures `eta` against `nearest-car` at `rho = 0.6083` — the widest
 * separation any shipped pair has — and the Try block's own command, measured on this tree, returns
 * `AWT −2.27 s [−2.92, −1.62]` with **0 of 100** replications saturated on either arm. A newcomer's
 * first `compare` therefore prints a verdict with a reason, which is the point of the command.
 *
 * Pairing two near neighbours instead would print *"the interval contains zero"* — honest, and a
 * poor first lesson, because it teaches that the tool cannot tell rather than that this pair does
 * not differ.
 */
export const TRY_CONTRAST_DISPATCHERS: readonly string[] = Object.freeze([
  'nearest-car',
  'zoned-uppeak',
]);

/**
 * The Try block's `(a, b)`, preference first and `data/`'s file order as the fallback.
 *
 * `b` is never allowed to equal `a`: `compare --a X --b X` is a real and useful command (it is one
 * of `compare`'s own examples, and it must print IDENTICAL) but it is not a first thing to try.
 */
export function tryDispatchers(profiles: readonly { readonly id: string }[]): {
  readonly a: string;
  readonly b: string;
} {
  const has = (id: string): boolean => profiles.some((profile) => profile.id === id);
  const a = TRY_RECOMMENDED_DISPATCHERS.find(has) ?? profiles[0]?.id ?? 'eta';
  const b =
    TRY_CONTRAST_DISPATCHERS.find((id) => has(id) && id !== a) ??
    profiles.find((profile) => profile.id !== a)?.id ??
    a;
  return { a, b };
}

/** Bank composition, when a building has more than one bank worth mentioning. */
function bankNote(building: ResolvedBuilding): string | undefined {
  if (building.banks.length < 2) return undefined;
  return building.banks
    .map((bank) => `${bank.id} ×${bank.cars.length}`)
    .join(', ');
}

/**
 * The weight vector, heaviest term first.
 *
 * Truncated at four terms because the point is the *shape* of a strategy — what it optimises
 * for — and `predictive-balanced` carries ten. The full vector is in the JSON.
 */
export function summariseWeights(profile: DispatcherProfile, limit = 4): string {
  const entries = Object.entries(profile.weights)
    .filter(([, weight]) => weight !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) return '(no weighted terms)';
  const shown = entries
    .slice(0, limit)
    .map(([term, weight]) => `${term} ${num(weight, 2)}`)
    .join('  ');
  const rest = entries.length - limit;
  return rest > 0 ? `${shown}  +${rest} more` : shown;
}
