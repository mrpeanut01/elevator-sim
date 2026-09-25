/**
 * Reading `data/wrinkles.json`, and refusing the ways it can be wrong — GitHub issue **#159**.
 *
 * `pricing/parse.ts`'s precedent and its shape: authored data is validated **at load time**, every
 * violation is collected rather than the first thrown, and the rules a test would otherwise hold in
 * prose are mechanical here.
 *
 * The rules, and what each one is for:
 *
 * - **Ids are unique**, across templates and within an axis. A duplicate is two wrinkles wearing
 *   one name, and the rotation rule keys on that name.
 * - **Every id shipped code names by hand is present.** `campaign/incidents.ts` reaches
 *   `breakdown` and `coach-party`, `calendar.ts` books by id, and `eventFor` needs an `ordinary`
 *   and a `weekend` to fall back to. Opening the library to data removed the compile error that
 *   used to catch a missing one — {@link REQUIRED_TEMPLATE_IDS} is that check, moved from the type
 *   system to here rather than dropped.
 * - **Every directional split's shares sum to 1**, base and override alike. `normalizeSplit`
 *   downstream would quietly rescale a split that did not, so a typo would change the day rather
 *   than fail.
 * - **Every derate window is ordered and inside the run**, `0 <= from < to <= 1`. A window that
 *   ends before it starts removes no car and reads as if it did.
 * - **A `changesNothing` template writes nothing else**, and every other template writes
 *   something. Both directions, because a template that claims to change nothing and does is the
 *   caption defect, and one that claims a change and makes none is the dead seam.
 * - **Every `{placeholder}` in a note names an axis of that template, and every axis with a
 *   non-empty label is named in the note.** Both directions again: an unsubstituted `{window}` is
 *   a string a player can see, and an axis nothing renders is a parameter that varies the run and
 *   never says so.
 * - **`unexpressible` is non-empty.** Three of § 17's six kinds need a seam that does not exist,
 *   and the list is how that stays visible; emptying it is a claim that all six are reachable.
 * - **`campaignDay.eventSharePct` is present and inside its declared range.** GitHub issue #564:
 *   the rate a contract day meets an event at is balance rather than mechanism, so it is authored
 *   in the document and its schema is {@link CAMPAIGN_DAY_EVENT_SHARE} here.
 * - **A wrinkle that sets a mix declares where it sits on a whole day, or says why it cannot** —
 *   [§ D1057](../../../../DECISIONS.md). `wholeDay` is an episode (a clock window, a level, a note
 *   naming `{episode}`, and a reason) or `{ "refused": reason }`; a mix-setting template with
 *   neither is refused here, because on a whole day its mix would otherwise be withheld and its
 *   level would multiply ten hours. A template that sets no mix may not declare one — it would place
 *   nothing. The level is a phase intensity, so it lies in `[0, 1]` (`core`'s rule 3); a whole-day
 *   rate multiplier may only lighten the day, never raise it.
 */

import type { DirectionalSplit } from '@elevator-sim/core/browser';
import {
  WRINKLE_DAYS,
  type UnexpressibleWrinkle,
  type WholeDayOverride,
  type WholeDayPlacement,
  type WrinkleAxis,
  type WrinkleAxisValue,
  type WrinkleDays,
  type WrinkleEffect,
  type WrinkleLibrary,
  type WrinkleTemplate,
} from './types.js';

/** Raised when the document cannot be read as a library at all. */
export class WrinkleLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrinkleLibraryError';
  }
}

/**
 * Template ids that shipped code names as literals, and so may never leave the library.
 *
 * This list is the compile error that `Record<ShiftEventId, ShiftEvent>` used to give, kept as a
 * runtime check because the library is now data and a literal union cannot be derived from it.
 * Each entry names its caller so a reader can check the claim rather than trust it.
 */
export const REQUIRED_TEMPLATE_IDS: readonly string[] = Object.freeze([
  /* `shift/events.ts#eventFor` falls back to it, and `campaign/incidents.ts` returns it. */
  'ordinary',
  /* `shift/events.ts#eventFor` returns it for every non-weekday. */
  'weekend',
  /* `campaign/incidents.ts#campaignEventFor` draws it against the tower's failure odds. */
  'breakdown',
  /* `campaign/calendar.ts` books it, and `campaign/incidents.ts` returns the booking. */
  'coach-party',
  /* `shift/calendar.ts`'s `moving-week` period books it by id. */
  'move-in',
  /*
   * Named as literals by `shift/types.ts#SHIFT_EVENT_IDS`, which types every calendar booking and
   * every `SHIFT_EVENTS` lookup by hand. Neither is booked by a shipped period today — this list
   * said all three were, which was a claim a reader could have checked and would have found false.
   * They stay required because the union still names them and a library without them would make
   * `SHIFT_EVENTS[id]`'s type a lie.
   */
  'fire-drill',
  'conference',
]);

/**
 * The schema of `campaignDay.eventSharePct` — type, range and default, in one place.
 *
 * `CLAUDE.md` invariant 8's shape pointed at authored content rather than at a dispatcher
 * dimension: *every tunable declares its schema … so the space is explicit and checkable.* The
 * document carries the value; this carries what a legal value is, so a rebalance that types `200`
 * is a refusal naming the bound rather than a career that meets an event every single day.
 *
 * The range is the whole closed interval on purpose. `0` is a legal setting and means *the
 * calendar and the wear clock are the only things that happen*, which is what this repository
 * shipped before issue #564 and is therefore a state a rebalance must be able to return to;
 * `100` is legal and means *every unclaimed day draws*, which is the opposite end and is the one
 * a reviewer should argue about rather than the parser.
 */
export const CAMPAIGN_DAY_EVENT_SHARE = Object.freeze({
  type: 'number' as const,
  minPct: 0,
  maxPct: 100,
  defaultPct: 20,
});

const SPLIT_TOLERANCE = 1e-9;

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WrinkleLibraryError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new WrinkleLibraryError(`${where}: expected an array.`);
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new WrinkleLibraryError(`${where}: expected a string.`);
  return value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WrinkleLibraryError(`${where}: expected a finite number.`);
  }
  return value;
}

function splitOf(value: unknown, where: string, violations: string[]): DirectionalSplit | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, where);
  const split: DirectionalSplit = {
    incoming: num(raw['incoming'], `${where}.incoming`),
    outgoing: num(raw['outgoing'], `${where}.outgoing`),
    interfloor: num(raw['interfloor'], `${where}.interfloor`),
  };
  const sum = split.incoming + split.outgoing + split.interfloor;
  if (Math.abs(sum - 1) > SPLIT_TOLERANCE) {
    violations.push(`${where}: shares sum to ${String(sum)}, not 1.`);
  }
  return split;
}

function derateOf(
  value: unknown,
  where: string,
  violations: string[],
): WrinkleEffect['derate'] {
  if (value === null || value === undefined) return null;
  const raw = record(value, where);
  const derate = {
    cars: num(raw['cars'], `${where}.cars`),
    fromFraction: num(raw['fromFraction'], `${where}.fromFraction`),
    toFraction: num(raw['toFraction'], `${where}.toFraction`),
  };
  if (!Number.isInteger(derate.cars) || derate.cars < 1) {
    violations.push(`${where}.cars: expected a whole number of cars, at least 1.`);
  }
  if (!(derate.fromFraction >= 0 && derate.toFraction <= 1)) {
    violations.push(`${where}: the window must lie inside the run, 0 to 1.`);
  }
  if (!(derate.fromFraction < derate.toFraction)) {
    violations.push(`${where}: the window ends at or before it starts, so no car leaves.`);
  }
  return derate;
}

function effectOf(value: unknown, where: string, violations: string[]): WrinkleEffect {
  const raw = record(value, where);
  const changesNothing = raw['changesNothing'];
  if (typeof changesNothing !== 'boolean') {
    throw new WrinkleLibraryError(`${where}.changesNothing: expected a boolean.`);
  }
  const rate = raw['arrivalRateMultiplier'];
  const effect: WrinkleEffect = {
    changesNothing,
    arrivalRateMultiplier:
      rate === null || rate === undefined ? null : num(rate, `${where}.arrivalRateMultiplier`),
    directionalSplit: splitOf(raw['directionalSplit'], `${where}.directionalSplit`, violations),
    carsOutOfService: num(raw['carsOutOfService'], `${where}.carsOutOfService`),
    derate: derateOf(raw['derate'], `${where}.derate`, violations),
  };
  if (effect.arrivalRateMultiplier !== null && effect.arrivalRateMultiplier <= 0) {
    violations.push(`${where}.arrivalRateMultiplier: must be above zero.`);
  }
  if (!Number.isInteger(effect.carsOutOfService) || effect.carsOutOfService < 0) {
    violations.push(`${where}.carsOutOfService: expected a whole number, zero or more.`);
  }
  const writesSomething =
    effect.arrivalRateMultiplier !== null ||
    effect.directionalSplit !== null ||
    effect.carsOutOfService > 0 ||
    effect.derate !== null;
  if (effect.changesNothing && writesSomething) {
    violations.push(`${where}: claims to change nothing and writes a field the engine reads.`);
  }
  if (!effect.changesNothing && !writesSomething) {
    violations.push(`${where}: claims a change and writes no field the engine reads.`);
  }
  return effect;
}

/** `"HH:MM"`, `00:00`…`24:00`, as clock minutes since midnight. */
const CLOCK = /^([01][0-9]|2[0-4]):([0-5][0-9])$/u;

function clockOf(value: unknown, where: string, violations: string[]): number {
  const text = str(value, where);
  const match = CLOCK.exec(text);
  const minutes = match === null ? Number.NaN : Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(minutes) || minutes > 24 * 60) {
    violations.push(`${where}: ${JSON.stringify(text)} is not a clock time between 00:00 and 24:00.`);
    return 0;
  }
  return minutes;
}

function intensityOf(value: unknown, where: string, violations: string[]): number | 'authored' {
  if (value === 'authored') return 'authored';
  const intensity = num(value, where);
  if (intensity < 0 || intensity > 1) {
    violations.push(
      `${where}: ${String(intensity)} is outside [0, 1]. It is a phase intensity, where 1 is the ` +
        "day's own peak; a template cannot raise the building's rate (core's rule 3).",
    );
  }
  return intensity;
}

function windowIssues(fromMin: number, toMin: number, where: string, violations: string[]): void {
  if (!(fromMin < toMin)) {
    violations.push(`${where}: the window ends at or before it starts, so it places nothing.`);
  }
}

/** The parsed `wholeDay` of one template, or `null` where the document declares none. */
function wholeDayOf(
  value: unknown,
  where: string,
  violations: string[],
): WholeDayPlacement | null {
  if (value === undefined || value === null) return null;
  const raw = record(value, where);
  if ('refused' in raw) {
    const reason = str(raw['refused'], `${where}.refused`);
    if (reason.trim() === '') violations.push(`${where}.refused: a refusal says why.`);
    return { kind: 'refused', reason };
  }
  const fromMin = clockOf(raw['from'], `${where}.from`, violations);
  const toMin = clockOf(raw['to'], `${where}.to`, violations);
  windowIssues(fromMin, toMin, where, violations);
  const rate = raw['dayRateMultiplier'];
  const dayRateMultiplier =
    rate === undefined || rate === null ? null : num(rate, `${where}.dayRateMultiplier`);
  if (dayRateMultiplier !== null && !(dayRateMultiplier > 0 && dayRateMultiplier <= 1)) {
    violations.push(
      `${where}.dayRateMultiplier: ${String(dayRateMultiplier)} must lie in (0, 1]. A surge is the ` +
        'episode and never the whole day; only a lighter day may be stated across all of it.',
    );
  }
  const reason = str(raw['reason'], `${where}.reason`);
  if (reason.trim() === '') violations.push(`${where}.reason: a placement says why it is where it is.`);
  return {
    kind: 'episode',
    fromMin,
    toMin,
    intensity: intensityOf(raw['intensity'], `${where}.intensity`, violations),
    dayRateMultiplier,
    note: str(raw['note'], `${where}.note`),
    reason,
  };
}

function wholeDayOverrideOf(value: unknown, where: string, violations: string[]): WholeDayOverride {
  const raw = record(value, where);
  return {
    ...('from' in raw ? { fromMin: clockOf(raw['from'], `${where}.from`, violations) } : {}),
    ...('to' in raw ? { toMin: clockOf(raw['to'], `${where}.to`, violations) } : {}),
    ...('intensity' in raw
      ? { intensity: intensityOf(raw['intensity'], `${where}.intensity`, violations) }
      : {}),
  };
}

function axisValueOf(value: unknown, where: string, violations: string[]): WrinkleAxisValue {
  const raw = record(value, where);
  const out: WrinkleAxisValue = {
    id: str(raw['id'], `${where}.id`),
    label: str(raw['label'], `${where}.label`),
    ...('arrivalRateMultiplier' in raw
      ? {
          arrivalRateMultiplier:
            raw['arrivalRateMultiplier'] === null
              ? null
              : num(raw['arrivalRateMultiplier'], `${where}.arrivalRateMultiplier`),
        }
      : {}),
    ...('directionalSplit' in raw
      ? {
          directionalSplit: splitOf(
            raw['directionalSplit'],
            `${where}.directionalSplit`,
            violations,
          ),
        }
      : {}),
    ...('carsOutOfService' in raw
      ? { carsOutOfService: num(raw['carsOutOfService'], `${where}.carsOutOfService`) }
      : {}),
    ...('derate' in raw
      ? { derate: derateOf(raw['derate'], `${where}.derate`, violations) }
      : {}),
    ...('wholeDay' in raw
      ? { wholeDay: wholeDayOverrideOf(raw['wholeDay'], `${where}.wholeDay`, violations) }
      : {}),
  };
  return out;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_-]+)\}/g;

function templateOf(value: unknown, index: number, violations: string[]): WrinkleTemplate {
  const where = `templates[${String(index)}]`;
  const raw = record(value, where);
  const id = str(raw['id'], `${where}.id`);
  const at = `template ${id}`;
  const days = str(raw['days'], `${at}.days`) as WrinkleDays;
  if (!WRINKLE_DAYS.includes(days)) {
    violations.push(`${at}.days: ${days} is not one of ${WRINKLE_DAYS.join(', ')}.`);
  }
  const note = str(raw['note'], `${at}.note`);
  const axes: WrinkleAxis[] = array(raw['axes'], `${at}.axes`).map((axis, axisIndex) => {
    const axisWhere = `${at}.axes[${String(axisIndex)}]`;
    const rawAxis = record(axis, axisWhere);
    const axisId = str(rawAxis['id'], `${axisWhere}.id`);
    const values = array(rawAxis['values'], `${axisWhere}.values`).map((v, i) =>
      axisValueOf(v, `${at}.axes.${axisId}.values[${String(i)}]`, violations),
    );
    if (values.length === 0) {
      violations.push(`${at}.axes.${axisId}: an axis with no values varies nothing.`);
    }
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v.id)) violations.push(`${at}.axes.${axisId}: duplicate value id ${v.id}.`);
      seen.add(v.id);
    }
    return { id: axisId, values };
  });

  /* Both directions between the note's placeholders and the axes that render into them. */
  const axisIds = new Set(axes.map((axis) => axis.id));
  const named = new Set<string>();
  for (const match of note.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? '';
    named.add(name);
    if (!axisIds.has(name)) {
      violations.push(`${at}.note: {${name}} names no axis, so it would reach a player unsubstituted.`);
    }
  }
  for (const axis of axes) {
    const renders = axis.values.some((v) => v.label !== '');
    if (renders && !named.has(axis.id)) {
      violations.push(
        `${at}.note: axis ${axis.id} carries labels the note never renders, so it varies the run silently.`,
      );
    }
  }

  const effect = effectOf(raw['effect'], `${at}.effect`, violations);
  const wholeDay = wholeDayOf(raw['wholeDay'], `${at}.wholeDay`, violations);
  wholeDayIssues(at, effect, axes, wholeDay, violations);

  return {
    id,
    name: str(raw['name'], `${at}.name`),
    note,
    days,
    effect: { ...effect, wholeDay },
    axes,
  };
}

/**
 * [§ D1057](../../../../DECISIONS.md)'s load-time rules for one template's whole-day placement.
 *
 * Mix-setting means the base effect **or any axis value** sets a split, because a drawn wrinkle is
 * a template plus one value per axis and any of them can reach a whole day.
 */
function wholeDayIssues(
  at: string,
  effect: WrinkleEffect,
  axes: readonly WrinkleAxis[],
  wholeDay: WholeDayPlacement | null,
  violations: string[],
): void {
  const setsMix =
    effect.directionalSplit !== null ||
    axes.some((axis) => axis.values.some((value) => (value.directionalSplit ?? null) !== null));
  const overridden = axes.flatMap((axis) =>
    axis.values.filter((value) => value.wholeDay !== undefined).map((value) => ({ axis, value })),
  );
  if (setsMix && wholeDay === null) {
    violations.push(
      `${at}: sets a mix of trips and declares no wholeDay placement. On a whole authored day its ` +
        'mix would be withheld and any rate would multiply the whole day; place it as an episode ' +
        '(from, to, intensity, note, reason) or refuse it with a reason, and it is not drawn there.',
    );
  }
  if (!setsMix && wholeDay !== null) {
    violations.push(`${at}: declares a wholeDay placement and sets no mix, so it would place nothing.`);
  }
  if (wholeDay === null || wholeDay.kind === 'refused') {
    for (const { axis, value } of overridden) {
      violations.push(
        `${at}.axes.${axis.id}.${value.id}.wholeDay: moves a placement the template does not have.`,
      );
    }
    return;
  }
  for (const { axis, value } of overridden) {
    const from = value.wholeDay?.fromMin ?? wholeDay.fromMin;
    const to = value.wholeDay?.toMin ?? wholeDay.toMin;
    windowIssues(from, to, `${at}.axes.${axis.id}.${value.id}.wholeDay`, violations);
  }
  /* Both directions between the whole-day note's placeholders and what renders into them. */
  const episodes = [...wholeDay.note.matchAll(/\{episode\}/gu)].length;
  if (episodes !== 1) {
    violations.push(
      `${at}.wholeDay.note: names {episode} ${String(episodes)} times; it names it once, so the ` +
        'brief says when the day changes.',
    );
  }
  const axisIds = new Set(axes.map((axis) => axis.id));
  const named = new Set<string>();
  for (const match of wholeDay.note.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? '';
    if (name === 'episode') continue;
    named.add(name);
    if (!axisIds.has(name)) {
      violations.push(
        `${at}.wholeDay.note: {${name}} names no axis, so it would reach a player unsubstituted.`,
      );
    }
  }
  for (const axis of axes) {
    if (axis.values.some((v) => v.label !== '') && !named.has(axis.id)) {
      violations.push(
        `${at}.wholeDay.note: axis ${axis.id} carries labels the whole-day note never renders.`,
      );
    }
  }
}

/** Parse and validate the whole document, collecting every violation before refusing. */
export function parseWrinkleLibrary(value: unknown): WrinkleLibrary {
  const raw = record(value, 'wrinkles.json');
  const violations: string[] = [];
  const version = num(raw['version'], 'wrinkles.json.version');

  const templates = array(raw['templates'], 'wrinkles.json.templates').map((t, i) =>
    templateOf(t, i, violations),
  );
  if (templates.length === 0) {
    throw new WrinkleLibraryError('wrinkles.json.templates: the library is empty.');
  }

  const seen = new Set<string>();
  for (const template of templates) {
    if (seen.has(template.id)) violations.push(`duplicate template id ${template.id}.`);
    seen.add(template.id);
  }
  for (const required of REQUIRED_TEMPLATE_IDS) {
    if (!seen.has(required)) {
      violations.push(
        `template ${required} is named as a literal by shipped code and is not in the library.`,
      );
    }
  }

  /*
   * `breakdown` must declare a derate window, because `shift/events.ts#BREAKDOWN_AT_FRACTION` reads
   * `fromFraction` off it and `campaign/incidents.ts` schedules the car's return from that.
   *
   * Without this a `breakdown` that wrote `carsOutOfService` instead would parse cleanly, the
   * constant would fall back to a literal, and the caption would schedule a return the run does not
   * make — which is the second-source-of-truth defect that deriving the constant was meant to end,
   * reachable through the very edit this library exists to enable. Review caught the fallback; this
   * is what makes the fallback unnecessary.
   */
  const breakdown = templates.find((template) => template.id === 'breakdown');
  if (breakdown !== undefined && breakdown.effect.derate === null) {
    violations.push(
      'template breakdown declares no derate window. `shift/events.ts#BREAKDOWN_AT_FRACTION` reads ' +
        'its `fromFraction`, and `campaign/incidents.ts` tells the player when the car comes back.',
    );
  }

  const unexpressible: UnexpressibleWrinkle[] = array(
    raw['unexpressible'],
    'wrinkles.json.unexpressible',
  ).map((entry, i) => {
    const where = `unexpressible[${String(i)}]`;
    const rawEntry = record(entry, where);
    return {
      kind: str(rawEntry['kind'], `${where}.kind`),
      needs: str(rawEntry['needs'], `${where}.needs`),
    };
  });
  if (unexpressible.length === 0) {
    violations.push(
      'wrinkles.json.unexpressible: emptying this list claims every kind § 17 names is reachable ' +
        'in the four fields the engine reads. Three are not — say which, or build the seam.',
    );
  }

  /*
   * The contract day's rate — GitHub issue #564, and the block is **required** rather than
   * defaulted. A missing block would be read as `defaultPct` and the document would then disagree
   * with the run about a figure the run is balanced on, which is the second-source-of-truth defect
   * `BREAKDOWN_AT_FRACTION` above is already written about. {@link CAMPAIGN_DAY_EVENT_SHARE} is
   * what a legal value is; the document is what the value is.
   */
  const campaignRaw = record(raw['campaignDay'], 'wrinkles.json.campaignDay');
  const eventSharePct = num(campaignRaw['eventSharePct'], 'wrinkles.json.campaignDay.eventSharePct');
  if (
    eventSharePct < CAMPAIGN_DAY_EVENT_SHARE.minPct ||
    eventSharePct > CAMPAIGN_DAY_EVENT_SHARE.maxPct
  ) {
    violations.push(
      `wrinkles.json.campaignDay.eventSharePct: ${String(eventSharePct)} is outside ` +
        `${String(CAMPAIGN_DAY_EVENT_SHARE.minPct)}…${String(CAMPAIGN_DAY_EVENT_SHARE.maxPct)}.`,
    );
  }

  if (violations.length > 0) {
    throw new WrinkleLibraryError(
      `data/wrinkles.json is not a usable library:\n- ${violations.join('\n- ')}`,
    );
  }
  return { version, templates, unexpressible, campaignDay: { eventSharePct } };
}
