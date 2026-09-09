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
 */

import type { DirectionalSplit } from '@elevator-sim/core/browser';
import {
  WRINKLE_DAYS,
  type UnexpressibleWrinkle,
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

  return {
    id,
    name: str(raw['name'], `${at}.name`),
    note,
    days,
    effect: effectOf(raw['effect'], `${at}.effect`, violations),
    axes,
  };
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

  if (violations.length > 0) {
    throw new WrinkleLibraryError(
      `data/wrinkles.json is not a usable library:\n- ${violations.join('\n- ')}`,
    );
  }
  return { version, templates, unexpressible };
}
