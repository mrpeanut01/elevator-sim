/**
 * **How a mid-run dispatcher switch travels to the board** — GitHub issue #338,
 * [§ D486](../../../../DECISIONS.md).
 *
 * `core`'s `switch-dispatcher` arm carries the whole `DispatcherProfile` inline, for the reason its
 * docstring gives: the viewer's driving profile is routinely a derived object no id resolves, and a
 * record must replay without this device's shelf. `submission.ts`'s founding rule is the opposite —
 * *ids rather than inline objects* — and for two waves the arm was refused on the wire as
 * *structural* on exactly that tension.
 *
 * § D486 overturned the refusal, and the argument is one sentence: **every clause of it is equally
 * true of the run's base profile, and the base profile posts.** What travels for the base is a
 * shipped id and the player's rule rows, and the server re-derives the vector through
 * `profileWithRules`. A switch travels the same way — `{ toProfileId, ruleRows? }` — and what stays
 * refused is narrower and consistent: a target expressible **neither** as a shipped id **nor** as an
 * id plus rows, which is a hand-tuned vector off the workshop shelf, exactly the bound the base
 * profile already lives under.
 *
 * ## What "expressible" means, mechanically
 *
 * A target is expressible when some shipped profile, with the target's own rule rows written onto
 * it the way both ends write them (`rules.rows` and `selection.policy: 'rules'`), is the **same
 * profile** as the target in every field that reaches a run. Identity fields — `id`, `name`,
 * `description`, `$comment` — are not compared, because a saved dispatcher legitimately has its
 * own; nothing the kernel reads is skipped. That is the test the server will apply by replaying,
 * done here first so the player is told before they post rather than accused after.
 */

import type { DispatcherProfile, RuleRowConfig, RunInterventionConfig } from '@elevator-sim/core/browser';

/** The switch arm as the wire carries it — `submission.ts`'s `SubmittedSwitch`, restated. */
export interface SwitchOnTheWire {
  readonly toProfileId: string;
  readonly ruleRows?: readonly RuleRowConfig[] | undefined;
}

/** The fields a profile carries for people rather than for the kernel. Not compared. */
const IDENTITY_FIELDS: readonly string[] = ['id', 'name', 'description', '$comment'];

/** Canonical text of a profile's run-reaching fields, keys sorted so two writers agree. */
function runFieldsOf(profile: DispatcherProfile): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .filter((key) => record[key] !== undefined)
          .sort()
          .map((key) => [key, canonical(record[key])]),
      );
    }
    return value;
  };
  const record = { ...(profile as unknown as Record<string, unknown>) };
  for (const field of IDENTITY_FIELDS) delete record[field];
  return JSON.stringify(canonical(record));
}

/** The two writes both ends make for a rule list — `authoring/ruleSpec.ts#profileWithRules`'s. */
function withRows(profile: DispatcherProfile, rows: readonly RuleRowConfig[]): DispatcherProfile {
  if (rows.length === 0) return profile;
  return {
    ...profile,
    rules: { rows: [...rows] },
    selection: { ...(profile.selection ?? {}), policy: 'rules' },
  };
}

/**
 * The wire form of a handover to `target`, or `undefined` when no shipped profile plus the target's
 * own rows is that vector — the one case that stays refused.
 *
 * The target's own id is tried first, because the common case is a shipped style handed over
 * unchanged and that costs one comparison; every other shipped profile is tried after, because a
 * saved dispatcher's id resolves to nothing on the server while its vector may be a shipped one
 * with rules on it.
 */
export function switchWireOf(
  target: DispatcherProfile,
  shipped: readonly DispatcherProfile[],
): SwitchOnTheWire | undefined {
  const rows = target.rules?.rows ?? [];
  const wanted = runFieldsOf(target);
  const candidates = [
    ...shipped.filter((profile) => profile.id === target.id),
    ...shipped.filter((profile) => profile.id !== target.id),
  ];
  for (const profile of candidates) {
    if (runFieldsOf(withRows(profile, rows)) === wanted) {
      return rows.length === 0 ? { toProfileId: profile.id } : { toProfileId: profile.id, ruleRows: rows };
    }
  }
  return undefined;
}

/**
 * Why a handover to `target` could not be posted, in the player's words, or `undefined` when it
 * could — the sentence the stage draws **before** the press (§ D486's fourth criterion: a player
 * who hands a day over learns it is unpostable before they finish playing it, not at the moment
 * they try to post). Names the dispatcher by its display name, never its id.
 */
export function switchUnpostableReasonOf(
  target: DispatcherProfile,
  shipped: readonly DispatcherProfile[],
): string | undefined {
  if (switchWireOf(target, shipped) !== undefined) return undefined;
  return (
    `A day handed to ${target.name} cannot be posted to a board: it is a hand-tuned dispatcher, ` +
    'and a posted run can only hand over to one the board ships, or to one of those with your ' +
    'rules on it. The day still runs; it just stays on this device.'
  );
}

/**
 * The wire's switch, back as the profile `core`'s arm carries — the server's `verify.ts#interventionsFor`
 * done on this end, for a board row a spectator is about to replay (GitHub issue #337). The same
 * two writes `profileWithRules` makes on both ends, over this build's shipped profile; `undefined`
 * for an id this build does not ship, which is the row's `unreadable-record` refusal.
 */
export function switchTargetFromWire(
  wire: SwitchOnTheWire,
  shipped: readonly DispatcherProfile[],
): DispatcherProfile | undefined {
  const base = shipped.find((profile) => profile.id === wire.toProfileId);
  if (base === undefined) return undefined;
  return withRows(base, wire.ruleRows ?? []);
}

/** One entry of the log as the wire carries it — `menu/client.ts#SubmittedIntervention`'s shape. */
export type WireIntervention =
  | { readonly atS: number; readonly change: { readonly kind: 'park-cars-lobby' } }
  | { readonly atS: number; readonly change: { readonly kind: 'spread-cars' } }
  | {
      readonly atS: number;
      readonly change: { readonly kind: 'switch-dispatcher' } & SwitchOnTheWire;
    };

/**
 * The whole log, translated for the wire. Throws on an entry the wire cannot carry, because
 * `runIdentity.ts` has already refused any such state before a submission is assembled and reaching
 * here with one is a defect in the ordering rather than a state a player can be in.
 */
export function wireInterventionsOf(
  log: readonly RunInterventionConfig[],
  shipped: readonly DispatcherProfile[],
): readonly WireIntervention[] {
  return log.map((entry): WireIntervention => {
    const change = entry.change;
    if (change.kind === 'park-cars-lobby') return { atS: entry.atS, change: { kind: 'park-cars-lobby' } };
    if (change.kind === 'spread-cars') return { atS: entry.atS, change: { kind: 'spread-cars' } };
    if (change.kind === 'switch-dispatcher') {
      const wire = switchWireOf(change.profile, shipped);
      if (wire === undefined) {
        throw new Error(
          `a handover to “${change.profile.name}” reached the wire, and runIdentityIssues should have refused it first`,
        );
      }
      return { atS: entry.atS, change: { kind: 'switch-dispatcher', ...wire } };
    }
    throw new Error(`an intervention of kind “${change.kind}” reached the wire, which does not carry it`);
  });
}
