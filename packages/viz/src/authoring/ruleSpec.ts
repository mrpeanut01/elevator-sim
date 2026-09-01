/**
 * **The Everyday rules editor's editing model** — GAMEPLAY_AND_NAVIGATION.md §11.5, bound to the
 * compilation target `core/src/dispatch/selector.ts#resolveRuleArms` built for it.
 *
 * ## One representation, owned by core
 *
 * Every id, template, value list, lever badge and `moves` claim on this surface comes from
 * `RULE_CONDITION_WORDS` / `RULE_ACTION_WORDS`, declared **beside the vocabulary in
 * `config/types.ts`** — the `PlayerTermWords` ownership rule (issue #147): the words are a
 * property of the model, not of the screen, so the editor and the compiler read one table and
 * cannot drift. Nothing here authors a phrase about a condition or an action; what this module
 * authors is the *composition* — readbacks, refusals, the fallback line — and the round trip.
 *
 * ## What is deliberately not offered
 *
 * The two §11.5 actions `core` refuses by omission — *skip everything above* (service range is
 * building fabric; §11.4's own boundary sentence) and *treat up-calls as urgent* (no
 * direction-conditional cost term exists, so the label would lie) — are not rows here either,
 * because they are not in `RULE_ACTIONS`. The reworded alternative for the second (*treat every
 * call as urgent*) is a design-owner decision, flagged in `RULE_ACTIONS`' docstring, not made
 * silently by this editor. **The omission pair is § D415**; the argument lives on `RULE_ACTIONS`,
 * which is also where the derivation lives, so neither screen carries a refusal of its own.
 *
 * ## Where the rows reach a run
 *
 * `dev/state.ts#shiftRunConfigOf` applies {@link profileWithRules} **after** `profileWithSelector`
 * — the reader's most explicit statement writes last — so a non-empty row list sets
 * `selection.policy: 'rules'` over whatever the switching panel chose, and
 * `dev/selectorEditor.ts#rulesOverrideNoteOf` says so on that panel. The rows cross the worker as
 * plain JSON on the profile (the `RunInterventionConfig` structured-clone argument), so run
 * identity and replay carry them for free — which is also why a rule edit is **next-run**, never
 * mid-run: a run is `{ seed, config, interventions[] }` (ENGINE_CONTRACT § 1.4) and rules are
 * config. The only mid-run instrument remains the interventions log, which is also why a
 * `park-cars-lobby` intervention outranks a standing rule at stage 7.
 */

import {
  RULE_ACTIONS,
  RULE_ACTION_WORDS,
  RULE_CONDITIONS,
  RULE_CONDITION_WORDS,
  type DispatcherProfile,
  type RuleActionId,
  type RuleActionWords,
  type RuleConditionId,
  type RuleConditionWords,
  type RuleRowConfig,
  type RuleValueOption,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

/* -------------------------------------------------------------------------- *
 * The rows — UI state, 1:1 with the profile section
 * -------------------------------------------------------------------------- */

/**
 * One rule row as the editor holds it — exactly the profile's own `rules.rows[]` shape, so
 * {@link profileWithRules} / {@link rulesFromProfile} are trivially inverse and there is no
 * compiled-form/provenance drift to police: the profile carries the rows themselves.
 */
export interface RuleRow {
  readonly when: RuleConditionId;
  readonly whenValue?: number | string | undefined;
  readonly then: RuleActionId;
  readonly thenValue?: number | string | undefined;
}

/** A fresh row: the first condition and first action, each with its first declared value. */
export function defaultRuleRow(): RuleRow {
  return rowWithWhen(rowWithThen({ when: RULE_CONDITIONS[0], then: RULE_ACTIONS[0] }, RULE_ACTIONS[0]), RULE_CONDITIONS[0]);
}

/** The row with its condition replaced and the value snapped to that condition's list. */
export function rowWithWhen(row: RuleRow, when: RuleConditionId): RuleRow {
  const values = RULE_CONDITION_WORDS[when].values;
  return Object.freeze({
    when,
    ...(values === undefined ? {} : { whenValue: firstValueOf(values, row.whenValue) }),
    then: row.then,
    ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
  });
}

/** The row with its action replaced and the value snapped to that action's list. */
export function rowWithThen(row: RuleRow, then: RuleActionId): RuleRow {
  const values = RULE_ACTION_WORDS[then].values;
  return Object.freeze({
    when: row.when,
    ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
    then,
    ...(values === undefined ? {} : { thenValue: firstValueOf(values, row.thenValue) }),
  });
}

/** The current value when the list still offers it, else the list's first — never an invention. */
function firstValueOf(
  values: readonly RuleValueOption[],
  current: number | string | undefined,
): number | string {
  const kept = values.find((option) => option.value === current);
  return (kept ?? values[0]!).value;
}

/* -------------------------------------------------------------------------- *
 * Read and write — the profile round trip
 * -------------------------------------------------------------------------- */

/**
 * Write the rows onto a profile, or hand the profile back untouched.
 *
 * **Empty rows return the same object, by identity.** That is the byte-identity half: a viewer
 * state with no rules builds its run from exactly the profile it always did, and the fingerprint
 * tests hold it as a measurement rather than a promise. Non-empty rows write both halves at
 * once — the `rules` section and `selection.policy: 'rules'` — because a profile carrying one
 * without the other is refused by name in `resolveDispatchConfig`, and an editor that could
 * produce a refused document would be offering a configuration the simulator does not have.
 */
export function profileWithRules(
  profile: DispatcherProfile,
  rows: readonly RuleRow[],
): DispatcherProfile {
  if (rows.length === 0) return profile;
  const authored: RuleRowConfig[] = rows.map((row) =>
    Object.freeze({
      when: row.when,
      ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
      then: row.then,
      ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
    }),
  );
  return {
    ...profile,
    rules: { rows: authored },
    selection: { ...(profile.selection ?? {}), policy: 'rules' },
  };
}

/** The rows a profile carries, or `[]`. Exact — the profile's own shape is the editor's. */
export function rulesFromProfile(profile: DispatcherProfile): readonly RuleRow[] {
  return (profile.rules?.rows ?? []).map((row) =>
    Object.freeze({
      when: row.when,
      ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
      then: row.then,
      ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * Words — templates substituted, never concatenated
 * -------------------------------------------------------------------------- */

/**
 * A `{v}` template with the value's declared label substituted — **substitution, never
 * concatenation**, which is §11.5's own rule and its own example of the failure: *"otherwise you
 * get 'park a spare car at floor the lobby'"*. A template with no `{v}` is returned verbatim; a
 * value with no declared label falls back to `String(value)`, which is honest about an edited
 * document without inventing words for it.
 */
export function substituted(
  words: RuleConditionWords | RuleActionWords,
  value: number | string | undefined,
): string {
  if (!words.template.includes('{v}')) return words.template;
  const label =
    words.values?.find((option) => option.value === value)?.label ??
    (value === undefined ? '…' : String(value));
  return words.template.replace('{v}', label);
}

/** The §11.5 readback: *when the lobby queue passes 12 people, hold a car at the lobby.* */
export function readbackOf(row: RuleRow): string {
  const when = substituted(RULE_CONDITION_WORDS[row.when], row.whenValue);
  const then = substituted(RULE_ACTION_WORDS[row.then], row.thenValue);
  return `when ${when}, ${then}.`;
}

/**
 * The row's lever line — §11.5's *every row shows the lever it moves*, met from the model's own
 * `moves` claim rather than from screen prose: the claim names the owned field, so it is
 * checkable against the compiler, and the caveat is the stated limitation the compile carries.
 */
export function leverLineOf(row: RuleRow): string {
  const action = RULE_ACTION_WORDS[row.then];
  const caveat = action.caveat === undefined ? '' : ` — ${action.caveat}`;
  return `moves ${action.lever} (${action.moves})${caveat}`;
}

/** The fallback line under the list: *If no rule fits, Steady hand decides.* */
export function fallbackLineOf(styleName: string): string {
  return `If no rule fits, ${styleName} decides.`;
}

/**
 * §11.5's first-match exclusivity, said under the list because players will probe it: one row is
 * in force at a time, and two true rows do not stack.
 */
export const RULES_EXCLUSIVITY_NOTE =
  'Rules are read top to bottom and the first match wins. One row is in force at a time — a ' +
  'weight rule and a parking rule do not stack, even when both their conditions hold.';

/**
 * The stage-header words for a rule arm's provenance id (`rule-2:lobby-queue-passes:12`), or
 * `undefined` for an id this build cannot parse — the caller then draws rule 11's honest
 * fallback, exactly as `patternName` does for an unknown pattern. This is `PATTERN_NAMES`'
 * naming path extended to the rules' provenance vocabulary: the id is data written by
 * `resolveRuleArms`, and the words come from the same core table the editor renders, so the
 * header and the row can never disagree about what a rule says.
 */
export function ruleProvenanceName(patternId: string): string | undefined {
  const match = /^rule-(\d+):([a-z-]+)(?::(.+))?$/.exec(patternId);
  if (match === null) return undefined;
  const conditionId = match[2] as RuleConditionId;
  if (!Object.hasOwn(RULE_CONDITION_WORDS, conditionId)) return undefined;
  const words = RULE_CONDITION_WORDS[conditionId];
  const raw = match[3];
  const value =
    raw === undefined
      ? undefined
      : (words.values?.find((option) => String(option.value) === raw)?.value ?? raw);
  return `rule ${match[1]!} — ${substituted(words, value)}`;
}

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

/** A reason a row cannot take effect, beside the row it is about — the `SelectorIssue` shape. */
export interface RuleIssue {
  /** `rows.<index>.<half>` — the editor draws the message beside that row. */
  readonly field: string;
  readonly message: string;
}

/** What the refusals need to know beyond the rows themselves. */
export interface RuleContext {
  /** Whether the run's demand template carries a start-of-day (`startOfDayMin`). */
  readonly hasClock: boolean;
}

/** Whether this condition compiles to a time clause, and so needs the crowd to have a clock. */
export function isTimeCondition(when: RuleConditionId): boolean {
  return when === 'time-before' || when === 'time-after' || when === 'day-period';
}

/** Whether the selected template gives the run a clock. The one fact `RuleContext` carries. */
export function templateHasClock(profiles: TrafficProfiles, templateId: string): boolean {
  const template = profiles.demandTemplates.find((entry) => entry.id === templateId);
  return template?.startOfDayMin !== undefined;
}

/**
 * Everything about these rows that cannot take effect or will refuse to run — all of them, not
 * the first, for `selectorIssues`' reason. Each mirrors a `resolveRuleArms` refusal so pressing
 * Run cannot fail on anything this list did not already say, except the clock refusal, which is
 * **not** a run failure at all: core evaluates a clockless time clause as never-matching (total,
 * deterministic), so without this sentence the row would be § D227's exact defect — a control
 * that writes nothing and does not say so.
 */
export function ruleIssues(
  rows: readonly RuleRow[],
  context: RuleContext,
): readonly RuleIssue[] {
  const issues: RuleIssue[] = [];
  let pickupRows = 0;
  rows.forEach((row, index) => {
    const condition = RULE_CONDITION_WORDS[row.when];
    const action = RULE_ACTION_WORDS[row.then];

    if (condition.values !== undefined && !condition.values.some((o) => o.value === row.whenValue)) {
      issues.push({
        field: `rows.${String(index)}.when`,
        message: `"${substituted(condition, undefined)}" needs one of its listed values — the run is refused by name otherwise.`,
      });
    }
    if (action.values !== undefined && !action.values.some((o) => o.value === row.thenValue)) {
      issues.push({
        field: `rows.${String(index)}.then`,
        message: `"${substituted(action, undefined)}" needs one of its listed values — the run is refused by name otherwise.`,
      });
    }
    if (isTimeCondition(row.when) && !context.hasClock) {
      issues.push({
        field: `rows.${String(index)}.when`,
        message:
          'This crowd has no clock — its demand template names no start-of-day, so this time ' +
          'rule reads as never and the row does nothing. Pick a crowd with a clock, or a ' +
          'different condition.',
      });
    }
    if (row.then === 'no-new-pickups') {
      pickupRows += 1;
      if (row.when !== 'car-fuller-than') {
        issues.push({
          field: `rows.${String(index)}.then`,
          message:
            '"stop giving it new pickups" only pairs with "a car is fuller than" — with any ' +
            'other condition there is no car for "it" to name, and the run is refused by name.',
        });
      }
      if (pickupRows > 1) {
        issues.push({
          field: `rows.${String(index)}.then`,
          message:
            'A second "stop giving it new pickups" row — both would set the same load ceiling, ' +
            'and the run is refused by name rather than letting one row silently lose.',
        });
      }
    }
  });
  return Object.freeze(issues);
}
