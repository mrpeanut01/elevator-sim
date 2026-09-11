/**
 * **The survivor band by ladder position, and the one reading of the survivor table against it** —
 * GitHub issue **#234**, [§ D537](../../../../DECISIONS.md).
 *
 * > *"The survivor band narrows by ladder position. Positions 1–2 may allow many survivors, because a
 * > dropdown clear is permitted there (§ D528); later positions allow few, but at least one. The band
 * > is authored in data as shares of the configurations examined, drafted for approval."* — the
 * > product owner, 2026-09-10.
 *
 * ## Why this is a test helper and not a module
 *
 * The band's only reader is the acceptance check in `survivorBands.test.ts`, on the footing `docs/33`
 * DC-4's `[1/3, 2/3]` stands on (`shift/contractCurve.sweep.test.ts#DC4_BAND`). No screen, no award
 * and no run reads it. Keeping the reader in a `*.test-helper.ts` makes that structural rather than
 * promised: a drafted figure cannot reach a shipped path through an import no bundle follows, and a
 * shipped reader, if one is ever wanted, arrives with a decision of its own.
 *
 * ## What is chosen, and what is ruled
 *
 * `data/scenario-survivor-bands.json` carries every **chosen** figure — the position boundaries and
 * the two shares on each band — with its reasoning in a `note` that opens `CHOSEN:`. What the ruling
 * fixes is enforced here instead, because a rule written as a figure is a rule a reader can edit away:
 *
 * - **At least one survivor, at every position** — {@link MIN_SURVIVORS}, § D525 clause 3's *"one
 *   survivor is the hardest a scenario may be; zero is … not a scenario"*. A share cannot say it: any
 *   positive `minShare` either admits zero at a small enough `k` or refuses one at a large enough one.
 *   A scenario that **declares a diagnosis** and has no survivor is exempt from the floor and from
 *   nothing else, which is `survivors.ts`'s own asymmetry — the zero rule is the only place a
 *   diagnosis buys anything.
 * - **The band narrows.** From one band to the next the ceiling may not rise, the floor may not rise
 *   and the width may not grow — {@link survivorBandIssues}.
 * - **No band admits the whole space.** `maxShare < 1`: DC-1 as a reading of the count, which
 *   `survivors.ts#validatePublishedSurvivors` already refuses on the table itself.
 * - **Every position has a band.** Contiguous from position one with the last band open-ended, so a
 *   scenario added to the end of the ladder is judged without an edit.
 *
 * ## The rung a scenario is judged at: its base budget
 *
 * {@link JUDGED_STEP_ID}. Three reasons, each sufficient on its own:
 *
 * 1. **A ladder position describes the scenario as a player meets it**, and every player meets it at
 *    its base budget. A bought rung is an optional purchase in chimes (§ D526), so a band judged
 *    there would describe a scenario only the players who paid have seen.
 * 2. **A purchase is meant to widen the space.** Judged at every rung, a scenario whose widened budget
 *    opened more ways through would be pushed over its own ceiling: the band would forbid the budget
 *    from buying anything, which § D525 clause 3 and § D528 clause 3 make the budget's whole job.
 * 3. **The bought rungs are separate samples.** Each rung's dial half is drawn on its own seed
 *    (`survivorSpace.ts#samplerSeedFor`), and on the table measured 2026-09-10 one scenario reads 2, 0
 *    and 1 survivors up its three rungs. Reading the rungs as a sequence reads sampling noise as a
 *    curve.
 *
 * ## What a share is a share of: survivors over the configurations **judged**
 *
 * `judged = examined − unjudged`, and a scenario's share is `survivors / judged`.
 *
 * - **Unjudged configurations leave the denominator.** `measureSurvivors.ts` counts a configuration
 *   unjudged when some goal came back `met: null` — its baseline arm did not reproduce the published
 *   count — and `judge.ts` does not clear a configuration with a `null` goal, so none is ever a
 *   survivor. It is neither a way through nor a failed attempt, and counting it as a failure would
 *   let a scenario whose bars stopped reproducing slide under its ceiling by refusing to answer. A
 *   scenario with nothing judged has no share, and reads `nothing-judged` rather than zero.
 * - **Suppressed configurations stay in it, and the table is what forces that.** `suppressed` counts
 *   configurations whose batch refused an orderable measure, and a suppressed configuration **can**
 *   survive: on the table measured 2026-09-10, two scenarios suppress every configuration examined and
 *   still have one survivor each. The table counts suppression and names survivors without saying
 *   which survivors were suppressed, so a rule that took suppressed configurations out of the share
 *   would have to take out survivors it cannot identify.
 * - **But a zero over suppressed runs is not a zero over measured ones** (#234's comment of
 *   2026-09-10). A scenario below its band on which **every** examined configuration was suppressed
 *   reads `below-over-suppressed-runs` rather than `below`. Every, not most: from counts alone the
 *   distinction is decidable only at that edge, and at that edge it says something exact — nothing
 *   tried there produced a number it would stand behind.
 *
 * ## What the band cannot see
 *
 * **Which configuration got through.** A scenario whose only survivor is a shipped profile picked from
 * the dropdown can sit inside its band at position three or later, where § D528 clause 2 says no
 * single profile may meet every bar on its own. That clause is not asserted here — the owner authored
 * this band over every configuration examined, not per tier — and `campaign/difficultyCurve.test.ts`'s
 * `DROPDOWN_CLEARS` holds its dropdown half, on `metOnTuningSeeds` rather than on this table's
 * `cleared`. Inside a band is not the same claim as rebalanced.
 */

import { fileURLToPath } from 'node:url';

import type { PublishedSurvivorScenario, PublishedSurvivorStep, PublishedSurvivors } from './survivors.js';

/** Where the band lives. One constant, so the check and anything that ever writes it cannot diverge. */
export const SURVIVOR_BANDS_PATH = fileURLToPath(
  new URL('../../../../data/scenario-survivor-bands.json', import.meta.url),
);

/** `data/campaign.json`, read for its stage order and nothing else. */
export const CAMPAIGN_PATH = fileURLToPath(
  new URL('../../../../data/campaign.json', import.meta.url),
);

/* -------------------------------------------------------------------------- *
 * The file shape
 * -------------------------------------------------------------------------- */

/** `CLAUDE.md` invariant 8 for one share: type, range, default, and `activeWhen`. */
export interface ShareSchema {
  readonly type: 'number';
  readonly unit: 'share';
  readonly min: number;
  readonly max: number;
  /** The shipped value, as it is in `data/price-schedule.json` and `data/campaign.json`. */
  readonly default: number;
  /** Always `null`: a band's share applies unconditionally. */
  readonly activeWhen: null;
}

/** One band: a run of ladder positions and the shares of the configurations judged it admits. */
export interface SurvivorBand {
  readonly fromPosition: number;
  /** `null` on the last band only, which covers every position after `fromPosition`. */
  readonly toPosition: number | null;
  /** The share floor. `0` does **not** permit zero survivors — see {@link MIN_SURVIVORS}. */
  readonly minShare: number;
  readonly maxShare: number;
  readonly schema: { readonly minShare: ShareSchema; readonly maxShare: ShareSchema };
  /** Opens `CHOSEN:`, and says why the figure reads the way it does. */
  readonly note: string;
}

export interface SurvivorBandProvenance {
  /** `'chosen'`. A constant, and its presence is the assertion — the survivor table says `'measured'`. */
  readonly kind: 'chosen';
  /** `'draft'` until the owner approves the figures. */
  readonly approval: 'draft' | 'approved';
  /** The ruling the band answers, in the owner's words. */
  readonly ruling: string;
  readonly draftedOn: string;
  /** `null` while a draft; the date of the approval once approved. */
  readonly approvedOn: string | null;
  /**
   * The survivor table's `sampleSize` the band was approved against, or `null` while a draft. A share
   * is survivors over the affordable census plus that many dial draws, so it moves with the sample.
   */
  readonly approvedAtSampleSize?: number | null;
}

export interface SurvivorBands {
  readonly version: 1;
  readonly provenance: SurvivorBandProvenance;
  readonly bands: readonly SurvivorBand[];
}

/**
 * The fewest survivors a scenario may have, at every position — § D525 clause 3.
 *
 * Ruled rather than chosen, which is why it is a constant here and not a field of the band.
 */
export const MIN_SURVIVORS = 1;

/** The budget rung a scenario is judged at: its base, `stepId: null`. See the module docstring. */
export const JUDGED_STEP_ID = null;

/** Shares are compared as counts, and this only keeps `0.15 × 20` from reading as `2.9999…`. */
const TOLERANCE = 1e-9;

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

const TOP_KEYS = ['$comment', 'version', 'provenance', 'bands'] as const;
const PROVENANCE_KEYS = ['kind', 'approval', 'ruling', 'draftedOn', 'approvedOn', 'approvedAtSampleSize'] as const;
const BAND_KEYS = ['fromPosition', 'toPosition', 'minShare', 'maxShare', 'schema', 'note'] as const;
const SCHEMA_KEYS = ['minShare', 'maxShare'] as const;
const SHARE_SCHEMA_KEYS = ['type', 'unit', 'min', 'max', 'default', 'activeWhen'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShare(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function unrecognised(
  where: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map(
      (key) =>
        `${where}: unrecognised key "${key}". The schema declares ${allowed.join(', ')} and nothing ` +
        'else, and a field it does not name is a field no check reads.',
    );
}

/**
 * Every way the band document can be wrong, as a list of sentences. Empty means sound.
 *
 * A list rather than a throw, for `survivors.ts#validatePublishedSurvivors`'s reason: the caller is a
 * test whose failure text is what a future reader sees, and `toEqual([])` prints every issue at once.
 */
export function survivorBandIssues(raw: unknown): readonly string[] {
  if (!isRecord(raw)) return ['the band document is not an object.'];
  const out: string[] = [...unrecognised('the band document', raw, TOP_KEYS)];
  const comment = raw['$comment'];
  if (typeof comment !== 'string' || comment.trim() === '') {
    out.push('the band document carries no $comment, so nothing says what it is or who chose it.');
  }
  if (raw['version'] !== 1) {
    out.push(`the band document declares version ${JSON.stringify(raw['version'])}; this reader knows version 1.`);
  }
  out.push(...provenanceIssues(raw['provenance']));

  const entries = raw['bands'];
  if (!Array.isArray(entries) || entries.length === 0) {
    out.push('the band document declares no band, so no scenario has anything to sit inside.');
    return out;
  }
  const shapes: LadderShape[] = [];
  for (const [index, entry] of entries.entries()) {
    out.push(...bandIssues(`band ${String(index + 1)}`, entry));
    const shape = ladderShapeOf(entry);
    if (shape !== undefined) shapes.push(shape);
  }
  if (shapes.length === entries.length) out.push(...ladderIssues(shapes));
  return out;
}

function provenanceIssues(raw: unknown): string[] {
  if (!isRecord(raw)) {
    return [
      'the band document carries no provenance, so nothing says whether its figures were chosen or ' +
        'measured, or whether anybody approved them.',
    ];
  }
  const out = unrecognised('provenance', raw, PROVENANCE_KEYS);
  if (raw['kind'] !== 'chosen') {
    out.push(
      `provenance: the band does not declare itself chosen (it says ${JSON.stringify(raw['kind'])}). ` +
        'Every figure in it is a judgement about pacing; data/scenario-survivors.json is where measured ' +
        'numbers live, and a band that called itself measured would invite a reader to regenerate a choice.',
    );
  }
  const approval = raw['approval'];
  if (approval !== 'draft' && approval !== 'approved') {
    out.push(
      `provenance: approval is ${JSON.stringify(approval)}. It reads "draft" until the owner approves ` +
        'the figures and "approved" after.',
    );
  }
  for (const field of ['ruling', 'draftedOn'] as const) {
    const value = raw[field];
    if (typeof value !== 'string' || value.trim() === '') out.push(`provenance: "${field}" is empty.`);
  }
  const approvedOn = raw['approvedOn'];
  if (approval === 'approved' && (typeof approvedOn !== 'string' || approvedOn.trim() === '')) {
    out.push(
      'provenance: the band says it is approved and carries no approval date, so nobody can find the ' +
        'ruling that approved it.',
    );
  }
  if (approval === 'draft' && approvedOn !== null) {
    out.push(
      'provenance: the band is a draft that carries an approval date. A draft has none; approval ' +
        'becomes "approved" on the commit that records the owner’s approval.',
    );
  }
  const sampleSize = raw['approvedAtSampleSize'];
  if (approval === 'approved' && !(Number.isSafeInteger(sampleSize) && (sampleSize as number) > 0)) {
    out.push(
      'provenance: the band says it is approved and does not record approvedAtSampleSize, the survivor ' +
        'table sample size it was approved against. A share moves with that sample, so an approval that ' +
        'does not name it approves nothing a later table can be held to.',
    );
  }
  if (approval === 'draft' && sampleSize !== undefined && sampleSize !== null) {
    out.push('provenance: the band is a draft that records approvedAtSampleSize. A draft has approved nothing.');
  }
  return out;
}

function bandIssues(where: string, raw: unknown): string[] {
  if (!isRecord(raw)) return [`${where}: is not an object.`];
  const out = unrecognised(where, raw, BAND_KEYS);

  const from = raw['fromPosition'];
  const to = raw['toPosition'];
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
    out.push(`${where}: fromPosition ${JSON.stringify(from)} is not a ladder position, which is an integer from 1.`);
  }
  if (
    to !== null &&
    (typeof to !== 'number' || !Number.isInteger(to) || (typeof from === 'number' && to < from))
  ) {
    out.push(`${where}: toPosition ${JSON.stringify(to)} is neither null nor a position at or after fromPosition.`);
  }

  const minShare = raw['minShare'];
  const maxShare = raw['maxShare'];
  for (const [field, value] of [
    ['minShare', minShare],
    ['maxShare', maxShare],
  ] as const) {
    if (!isShare(value)) {
      out.push(`${where}: ${field} ${JSON.stringify(value)} is outside [0, 1], so it is not a share of anything.`);
    }
  }
  if (isShare(minShare) && isShare(maxShare)) {
    if (minShare > maxShare) {
      out.push(
        `${where}: puts its floor above its ceiling (${String(minShare)} over ${String(maxShare)}), ` +
          'so no count is inside it.',
      );
    }
    if (maxShare >= 1) {
      out.push(
        `${where}: its ceiling of ${String(maxShare)} admits the whole space — every configuration ` +
          'judged getting through. DC-1 as a reading of the count says there must be something to ' +
          'fail, and survivors.ts refuses that table already.',
      );
    }
  }

  out.push(...schemaIssues(where, raw['schema'], raw));

  const note = raw['note'];
  if (typeof note !== 'string' || !note.startsWith('CHOSEN:')) {
    out.push(
      `${where}: its note does not open "CHOSEN:". Every figure in this file is chosen, and ` +
        'data/campaign.json’s notes draw the same line the same way.',
    );
  }
  return out;
}

function schemaIssues(where: string, raw: unknown, band: Record<string, unknown>): string[] {
  if (!isRecord(raw)) {
    return [`${where}: declares no schema. CLAUDE.md invariant 8 — every tunable declares its type, range and default.`];
  }
  const out = unrecognised(`${where}.schema`, raw, SCHEMA_KEYS);
  for (const field of SCHEMA_KEYS) {
    const at = `${where}.schema.${field}`;
    const entry = raw[field];
    if (!isRecord(entry)) {
      out.push(`${at}: is missing. CLAUDE.md invariant 8 — every tunable declares its type, range and default.`);
      continue;
    }
    out.push(...unrecognised(at, entry, SHARE_SCHEMA_KEYS));
    if (entry['type'] !== 'number' || entry['unit'] !== 'share') {
      out.push(
        `${at}: declares ${JSON.stringify(entry['type'])} in ${JSON.stringify(entry['unit'])}; a share ` +
          'is a number in the unit "share".',
      );
    }
    const low = entry['min'];
    const high = entry['max'];
    if (!isShare(low) || !isShare(high) || low > high) {
      out.push(`${at}: declares the range [${String(low)}, ${String(high)}], which is not a range inside [0, 1].`);
    }
    const value = band[field];
    if (entry['default'] !== value) {
      out.push(
        `${at}: the schema default ${JSON.stringify(entry['default'])} is not the shipped value ` +
          `${JSON.stringify(value)}. The default is the figure the file ships, as it is in ` +
          'data/price-schedule.json and data/campaign.json.',
      );
    } else if (isShare(low) && isShare(high) && typeof value === 'number' && (value < low || value > high)) {
      out.push(`${at}: the shipped value ${String(value)} is outside its own declared range.`);
    }
    if (entry['activeWhen'] !== null) {
      out.push(`${at}: activeWhen is ${JSON.stringify(entry['activeWhen'])}. A band's share applies unconditionally, so it is null.`);
    }
  }
  return out;
}

interface LadderShape {
  readonly from: number;
  readonly to: number | null;
  readonly min: number;
  readonly max: number;
}

function ladderShapeOf(raw: unknown): LadderShape | undefined {
  if (!isRecord(raw)) return undefined;
  const { fromPosition: from, toPosition: to, minShare: min, maxShare: max } = raw;
  if (typeof from !== 'number' || (to !== null && typeof to !== 'number')) return undefined;
  if (!isShare(min) || !isShare(max)) return undefined;
  return { from, to, min, max };
}

function ladderIssues(shapes: readonly LadderShape[]): string[] {
  const out: string[] = [];
  const first = shapes[0];
  if (first !== undefined && first.from !== 1) {
    out.push(
      `band 1: starts at position ${String(first.from)} and does not start at position one, so the ` +
        'first scenario a player meets has no band.',
    );
  }
  for (let index = 1; index < shapes.length; index += 1) {
    const previous = shapes[index - 1];
    const current = shapes[index];
    if (previous === undefined || current === undefined) continue;
    const where = `band ${String(index + 1)}`;
    if (previous.to === null) {
      out.push(`band ${String(index)}: is open-ended and is not the last band; only the last band may be open-ended.`);
    } else if (current.from !== previous.to + 1) {
      out.push(
        `${where}: starts at position ${String(current.from)} after a band ending at ` +
          `${String(previous.to)}, so the positions are not contiguous — a gap leaves a scenario with ` +
          'no band and an overlap gives one two.',
      );
    }
    if (current.max > previous.max + TOLERANCE) {
      out.push(
        `${where}: its ceiling rises from ${String(previous.max)} to ${String(current.max)}. The band ` +
          'narrows by ladder position (the owner, 2026-09-10): a later scenario may not allow more ' +
          'ways through than an earlier one.',
      );
    }
    if (current.min > previous.min + TOLERANCE) {
      out.push(
        `${where}: its floor rises from ${String(previous.min)} to ${String(current.min)}. The band ` +
          'narrows by ladder position: a later scenario may not be required to be easier than an ' +
          'earlier one.',
      );
    }
    const width = current.max - current.min;
    const previousWidth = previous.max - previous.min;
    if (width > previousWidth + TOLERANCE) {
      out.push(
        `${where}: is wider than the band before it (${width.toFixed(2)} against ` +
          `${previousWidth.toFixed(2)}). The band narrows by ladder position.`,
      );
    }
  }
  const last = shapes.at(-1);
  if (last !== undefined && last.to !== null) {
    out.push(
      `band ${String(shapes.length)}: ends at position ${String(last.to)} and is not open-ended, so a ` +
        'scenario added to the end of the ladder would have no band.',
    );
  }
  return out;
}

/** The band document, or a throw naming every issue. */
export function decodeSurvivorBands(raw: unknown): SurvivorBands {
  const issues = survivorBandIssues(raw);
  if (issues.length > 0) {
    throw new Error(`data/scenario-survivor-bands.json is not sound:\n- ${issues.join('\n- ')}`);
  }
  return raw as SurvivorBands;
}

/**
 * Whether the survivor table was measured at the sample size the band was approved against.
 *
 * A share is survivors over a census of the profiles a rung affords plus `provenance.sampleSize` dial
 * draws, so the same scenario reads a different share at another sample size. An approved band names
 * the sample it was approved at, and a table regenerated at another is refused until the band is
 * re-approved. A draft has approved nothing, so it holds the table to nothing.
 */
export function sampleSizeIssue(bands: SurvivorBands, table: PublishedSurvivors): string | undefined {
  const approvedAt = bands.provenance.approvedAtSampleSize;
  if (bands.provenance.approval !== 'approved' || approvedAt === undefined || approvedAt === null) return undefined;
  if (table.provenance.sampleSize === approvedAt) return undefined;
  return (
    `data/scenario-survivors.json was measured at sample size ${String(table.provenance.sampleSize)}, and the ` +
    `band was approved against ${String(approvedAt)}. A share is survivors over the affordable census plus ` +
    'that many dial draws, so every share moved without any scenario moving. Re-approve the band at the ' +
    'new sample size, or regenerate the table at the old one.'
  );
}

/** The band covering a ladder position, or `undefined` for a position no band covers. */
export function bandForPosition(bands: SurvivorBands, position: number): SurvivorBand | undefined {
  return bands.bands.find(
    (band) =>
      band.fromPosition <= position && (band.toPosition === null || position <= band.toPosition),
  );
}

/**
 * The survivor counts a band admits over `judged` configurations, both ends inclusive.
 *
 * `low` carries the one-survivor floor. `low > high` is a band narrower than the count can resolve,
 * which `survivorBands.test.ts` refuses on the shipped table.
 */
export function admittedCountsOf(
  band: SurvivorBand,
  judged: number,
): { readonly low: number; readonly high: number } {
  return {
    low: Math.max(MIN_SURVIVORS, Math.ceil(band.minShare * judged - TOLERANCE)),
    high: Math.floor(band.maxShare * judged + TOLERANCE),
  };
}

/* -------------------------------------------------------------------------- *
 * The reading
 * -------------------------------------------------------------------------- */

export type BandVerdict =
  | 'inside'
  | 'below'
  | 'below-over-suppressed-runs'
  | 'above'
  | 'nothing-judged'
  | 'diagnosis-exempt';

/** The verdicts a register may hold: every one that is not inside. */
export type OutsideVerdict = 'below' | 'below-over-suppressed-runs' | 'above' | 'nothing-judged';

export function isOutside(verdict: BandVerdict): verdict is OutsideVerdict {
  return verdict !== 'inside' && verdict !== 'diagnosis-exempt';
}

/** One scenario read against its band, with every count the verdict rests on. */
export interface BandReading {
  readonly scenarioId: string;
  readonly ladderPosition: number;
  readonly verdict: BandVerdict;
  readonly examined: number;
  readonly unjudged: number;
  readonly judged: number;
  readonly survivors: number;
  readonly suppressed: number;
  readonly band: SurvivorBand;
  /** One sentence for a failure message: the scenario, its counts, what its band admits. */
  readonly sentence: string;
}

/** Read one published scenario's base rung against the band for its ladder position. */
export function bandReadingOf(
  scenario: PublishedSurvivorScenario,
  bands: SurvivorBands,
): BandReading {
  const step = scenario.steps.find((entry) => entry.stepId === JUDGED_STEP_ID);
  if (step === undefined) {
    throw new Error(
      `scenario "${scenario.id}" publishes no base budget rung, so there is nothing to judge its ` +
        'band at. survivors.ts#validatePublishedSurvivors refuses such a table.',
    );
  }
  const band = bandForPosition(bands, scenario.ladderPosition);
  if (band === undefined) {
    throw new Error(
      `scenario "${scenario.id}" sits at ladder position ${String(scenario.ladderPosition)}, which ` +
        'no band covers.',
    );
  }
  // `unbuildable` configurations are not in `examined` (`survivors.ts#PublishedSurvivorStep`), so a
  // change core refuses to build is neither a way through nor a failure a player meets, and it leaves
  // the share without this line touching it.
  const judged = step.examined - step.unjudged;
  return {
    scenarioId: scenario.id,
    ladderPosition: scenario.ladderPosition,
    verdict: verdictOf(scenario, step, band, judged),
    examined: step.examined,
    unjudged: step.unjudged,
    judged,
    survivors: step.survivors,
    suppressed: step.suppressed,
    band,
    sentence: sentenceOf(scenario, step, band, judged, bands.provenance.approval),
  };
}

function verdictOf(
  scenario: PublishedSurvivorScenario,
  step: PublishedSurvivorStep,
  band: SurvivorBand,
  judged: number,
): BandVerdict {
  if (judged <= 0) return 'nothing-judged';
  if (step.survivors === 0 && scenario.diagnosis !== null) return 'diagnosis-exempt';
  const { low, high } = admittedCountsOf(band, judged);
  if (step.survivors < low) {
    return step.examined > 0 && step.suppressed >= step.examined ? 'below-over-suppressed-runs' : 'below';
  }
  if (step.survivors > high) return 'above';
  return 'inside';
}

function sentenceOf(
  scenario: PublishedSurvivorScenario,
  step: PublishedSurvivorStep,
  band: SurvivorBand,
  judged: number,
  approval: SurvivorBandProvenance['approval'],
): string {
  const positions =
    band.toPosition === null
      ? `positions ${String(band.fromPosition)} and after`
      : band.fromPosition === band.toPosition
        ? `position ${String(band.fromPosition)}`
        : `positions ${String(band.fromPosition)}–${String(band.toPosition)}`;
  const counts =
    `${String(step.examined)} examined, ${String(step.unjudged)} unjudged, ` +
    `${String(step.suppressed)} suppressed`;
  const read =
    judged <= 0
      ? `nothing was judged at its base rung (${counts})`
      : `${String(step.survivors)} of ${String(judged)} configurations judged at its base rung got ` +
        `through (${counts})`;
  const { low, high } = admittedCountsOf(band, Math.max(judged, 0));
  const asks =
    `its band for ${positions} asks for at least ${String(MIN_SURVIVORS)} survivor and a share from ` +
    `${String(band.minShare)} to ${String(band.maxShare)}` +
    (judged > 0 ? `, which is ${String(low)} to ${String(high)} of ${String(judged)}` : '');
  const status = approval === 'draft' ? ' The band is a draft awaiting the owner’s approval.' : '';
  return (
    `scenario "${scenario.id}" at ladder position ${String(scenario.ladderPosition)}: ${read}, and ` +
    `${asks}.${status}`
  );
}

/**
 * Where a register and a set of readings disagree, as sentences. Empty means they agree exactly.
 *
 * Both directions, and the side as well: a scenario outside and unregistered, a registered scenario
 * now inside, a registered scenario outside for a different verdict, and an entry naming a scenario
 * the table does not publish.
 */
export function registerDisagreements(
  readings: readonly BandReading[],
  register: Readonly<Record<string, OutsideVerdict>>,
): readonly string[] {
  const out: string[] = [];
  const published = new Set(readings.map((reading) => reading.scenarioId));
  for (const reading of readings) {
    const registered = register[reading.scenarioId];
    if (registered === undefined) {
      if (isOutside(reading.verdict)) {
        out.push(
          `${reading.sentence} It reads ${reading.verdict} and is not registered. A scenario newly ` +
            'outside its band is red: bring it back inside by demand or fabric, never by a bar ' +
            '(docs/33 DC-R1) — or, if the band itself moved, that is the owner’s to approve and the ' +
            'register moves with it.',
        );
      }
      continue;
    }
    if (!isOutside(reading.verdict)) {
      out.push(
        `${reading.sentence} It is registered as ${registered} and now reads ${reading.verdict}. ` +
          'Delete the entry on the commit that moved it — a register that can only grow is decoration.',
      );
    } else if (registered !== reading.verdict) {
      out.push(
        `${reading.sentence} It is registered as ${registered} and now reads ${reading.verdict}. It ` +
          'is still outside its band, on another side or over other runs, and the entry says which.',
      );
    }
  }
  for (const id of Object.keys(register)) {
    if (!published.has(id)) {
      out.push(`the register names "${id}", a scenario the survivor table does not publish.`);
    }
  }
  return out;
}
