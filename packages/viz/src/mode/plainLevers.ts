/**
 * The four plain levers — Everyday Mode's tinker drawer, as **named views onto controls that
 * already reach the simulation** (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`
 * §11.3, §20.1; BUILD_PLAN slice 1).
 *
 * ## One model, two drawers
 *
 * The handoff's prototype shipped the defect this module exists to refuse: four plain levers that
 * reached its toy sim and thirteen cost terms that reached nothing, as two separate states. §20.1's
 * correction is adopted here structurally — **there is no lever state**. A lever reads the
 * `DispatcherSpec` / `GroupLevers` the run is already built from, and writes the same fields the
 * engineer's own controls write, so the tinker drawer and the thirteen-term drawer cannot disagree:
 * they are two renderings of one vector. Moving a lever changes `costFunctionLine`'s printed
 * expression for the same reason moving the term slider does — it is the same weight.
 *
 * ## What each lever owns, and why the mapping deviates from §20.1's table
 *
 * §20.1 assigns the lobby and spread levers to "the lobby-anchor group term" and "the spreading
 * group term". This codebase's cost function has no such terms — parking is stage 7
 * (`idle.parkingStrategy`), not a weight — and the handoff's own precedence rule says the code wins
 * anything about the existing tree. The mechanisms those two prototype terms stood for are the
 * shipped group levers, so that is what the levers own:
 *
 * | Lever | Owns | Reaches the sim as |
 * |---|---|---|
 * | How long anyone should wait | `weights.starvation` | the starvation term in the scored sum |
 * | How much room to leave in a car | `weights.loadFactor` | the load-factor term in the scored sum |
 * | Keep a car downstairs | `GroupLevers.parking` | `idle.parkingStrategy: 'lobby'` |
 * | Spread the cars out | `DispatcherFlags.zone` | `idle.parkingStrategy: 'zone-center'` + `split-demand` |
 *
 * §20.1 also has the wait lever write "the wait term's share" beside starvation. Deliberately not
 * done: every term here is normalized before weighting (CLAUDE.md, *Normalize cost terms before
 * weighting*), so the trade the lever names — the worst wait against the average — is carried
 * entirely by `starvation`'s weight *relative to* `waitTime`'s, and a lever that scaled both would
 * move the sum's magnitude while leaving the trade where it was: a control that turns without
 * steering. One term per slider keeps the two drawers' agreement checkable by identity.
 *
 * ## Where the words come from
 *
 * The lever labels, read-lines and end labels are the prototype's own copy (§11.3's table, which
 * the handoff makes canonical for copy). The `serves` clause under a weight-backed lever is the
 * term's `player.serves` from `core` — §16 rule 11's seam, the same field the term sliders print —
 * so the lever and the slider it aliases can never describe the same weight in two vocabularies.
 * `writes` names the owned field for the engineer-facing tooltip, exactly as `FlagRow.help` does
 * one block over; an Everyday-only surface would not render it, and rule 11 is about what is
 * rendered, not what the model can say to an engineer.
 *
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The mapping is local to this
 * module and checkable by identity: every lever's `serves` clause is the term's own
 * `player.serves` from `core`, so a lever and the slider it aliases cannot describe one weight in
 * two vocabularies.
 */

import { COST_TERMS_BY_ID } from '@elevator-sim/core/browser';

import type { DispatcherSpec, GroupLevers } from '../authoring/dispatcherSpec.js';

const PLAIN_LEVER_IDS = ['patience', 'lobby', 'spread', 'room'] as const;
export type PlainLeverId = (typeof PLAIN_LEVER_IDS)[number];

/** One lever as a surface draws it. `value` is `0..100` for a slider, on/off for a toggle. */
export interface PlainLeverView {
  readonly id: PlainLeverId;
  /** The prototype's label, verbatim — §11.3. */
  readonly label: string;
  /** What pulling it does, in the prototype's words. */
  readonly reads: string;
  /** The two ends, in the prototype's words. */
  readonly atZero: string;
  readonly atFull: string;
  readonly kind: 'slider' | 'toggle';
  readonly value: number | boolean;
  /**
   * The owned term's `player.serves` from `core`, for the sub-line of a weight-backed lever.
   * `undefined` for the two levers that own a group control rather than a weight.
   */
  readonly serves: string | undefined;
  /** The field the lever writes, for the engineer tooltip — the claim, checkable. */
  readonly writes: string;
}

/** The `player.serves` clause of a term, from the registry the engine scores with. */
function servesOf(termId: string): string {
  const term = COST_TERMS_BY_ID.get(termId);
  // The registry is complete for both ids this module names; an absence is a programming error
  // in this file, not a state to render.
  if (term === undefined) throw new Error(`plainLevers: no such cost term ${termId}`);
  return `serves ${term.player.serves}`;
}

/**
 * The four levers over the current spec and group levers. Pure, derived, no state of its own —
 * see the module docstring for why that absence is the design.
 */
export function plainLeversOf(
  spec: DispatcherSpec,
  levers: GroupLevers,
): readonly PlainLeverView[] {
  return [
    {
      id: 'patience',
      label: 'How long anyone should wait',
      reads: 'chases the longest wait first',
      atZero: 'let it slide',
      atFull: 'nobody waits',
      kind: 'slider',
      value: spec.weights['starvation'] ?? 0,
      serves: servesOf('starvation'),
      writes: 'weights.starvation',
    },
    {
      id: 'lobby',
      label: 'Keep a car downstairs',
      reads: 'holds a car at the lobby',
      atZero: 'never',
      atFull: 'always one',
      kind: 'toggle',
      value: levers.parking,
      serves: undefined,
      writes: 'idle.parkingStrategy: lobby',
    },
    {
      id: 'spread',
      label: 'Spread the cars out',
      reads: 'pushes cars apart across the tower',
      atZero: 'huddle',
      atFull: 'cover everything',
      kind: 'toggle',
      value: spec.flags.zone,
      serves: undefined,
      writes: 'idle.parkingStrategy: zone-center + split-demand',
    },
    {
      id: 'room',
      label: 'How much room to leave in a car',
      reads: 'stops sending pickups to a crowded car',
      atZero: 'cram them in',
      atFull: 'leave room',
      kind: 'slider',
      value: spec.weights['loadFactor'] ?? 0,
      serves: servesOf('loadFactor'),
      writes: 'weights.loadFactor',
    },
  ];
}

/**
 * The sub-line a surface draws under a lever — the read and both ends, composed once.
 *
 * Composed here rather than at each caller because two callers exist — the editor's mount and
 * the honesty sweep's adapter — and a string composed twice is two screens waiting to disagree
 * (the handoff's §1 rule 3, applied to a sentence).
 */
export function plainLeverSub(view: PlainLeverView): string {
  return `${view.reads} · ${view.atZero} → ${view.atFull}`;
}

/** The tooltip: the serves clause where there is one, and the field the claim is checkable by. */
export function plainLeverHelp(view: PlainLeverView): string {
  return view.serves === undefined
    ? `writes ${view.writes}`
    : `${view.serves} — writes ${view.writes}`;
}

/**
 * The acknowledgement a surface draws after a lever moves — `docs/19` defect 5.
 *
 * At laptop width the thirteen terms are below the fold, so moving a lever changed nothing the eye
 * could see: the mapping this module guarantees (*same number, two drawers*) was stated in prose
 * and shown nowhere. This line echoes the moved control **from the current view**, never from a
 * remembered press, so it cannot describe a value the state has since left: a slider names the
 * position it now holds and the field that holds it; a toggle names the state and the group
 * control it wrote. The editor draws it beside the levers together with `costFunctionLine`'s own
 * output — the formula is composed there and only there, this sentence deliberately does not
 * restate it.
 *
 * Composed here rather than in the mount for {@link plainLeverSub}'s stated reason: two callers
 * exist — the editor and the honesty sweep's adapter — and a string composed twice is two screens
 * waiting to disagree.
 */
export function plainLeverEchoOf(view: PlainLeverView): string {
  if (view.kind === 'toggle') {
    return `${view.label} is now ${view.value === true ? 'on' : 'off'} — that wrote ${view.writes}.`;
  }
  const position = typeof view.value === 'number' ? view.value : 0;
  return (
    `${view.label} is now ${String(position)} — that wrote ${view.writes}, ` +
    'the same number the term slider below holds.'
  );
}

/**
 * Write one lever into the model it is a view of. Returns the new spec and group levers; only
 * the owned field differs from what went in.
 *
 * A slider takes `0..100` (clamped, rounded — slider positions are integers everywhere else in
 * the editor); a toggle takes a boolean. Each lever writes **only** its owned field, and the
 * test proves that by deep-comparing everything else — a lever with a side effect would be two
 * controls wearing one label.
 */
export function applyPlainLever(
  spec: DispatcherSpec,
  levers: GroupLevers,
  id: PlainLeverId,
  value: number | boolean,
): { readonly spec: DispatcherSpec; readonly levers: GroupLevers } {
  switch (id) {
    case 'patience': {
      const position = clampPosition(value);
      return { spec: { ...spec, weights: { ...spec.weights, starvation: position } }, levers };
    }
    case 'room': {
      const position = clampPosition(value);
      return { spec: { ...spec, weights: { ...spec.weights, loadFactor: position } }, levers };
    }
    case 'lobby':
      return { spec, levers: { ...levers, parking: value === true } };
    case 'spread':
      return { spec: { ...spec, flags: { ...spec.flags, zone: value === true } }, levers };
  }
}

function clampPosition(value: number | boolean): number {
  const numeric = typeof value === 'number' ? value : value ? 100 : 0;
  return Math.round(Math.min(100, Math.max(0, numeric)));
}
