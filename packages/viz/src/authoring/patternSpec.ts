/**
 * The traffic editor's model — and the largest single deviation from the design handoff, with the
 * measurement that forced it.
 *
 * ## What the handoff asks for
 *
 * Ten sliders over an authored pattern object: `amStart`, `amHours`, `amMult`, `pmStart`,
 * `pmHours`, `pmMult`, `lunchMult`, `base`, `interfloor`, `group`, plus three peak-order chips.
 * They describe a sixteen-hour office day with a morning peak, a lunch churn and an evening peak.
 *
 * ## What the engine has
 *
 * `SimulationDemandOptions` plus a resolved demand template. The template is `rise-and-fall` (thirty
 * minutes: ramp up, hold, ramp down), `constant-iso` (two hours flat) or `lunch-two-way` (the
 * rise-and-fall intensity with the directional mix swinging across the period). The knobs are
 * `arrivalRatePctPop5min`, `directionalSplit`, `peakWindowS`, `baselineFraction`, `mixAmplitude`,
 * `entranceWeights`, `batchSharesDestination` and `interfloorWeighting`.
 *
 * These are not the same axis set and no honest bijection exists. A `pmStart` of 16:30 has nothing
 * to write itself into: the simulator does not model a sixteen-hour day, and inventing one would
 * mean generating demand the published figures were never measured under
 * (`docs/12-design-handoff.md` § 4.1).
 *
 * ## What is implemented
 *
 * The handoff's **layout, grouping, tooltip discipline, preview strip and save-as-new flow**, bound
 * to the engine's real parameters. Every row below writes a field `Simulation` reads, and the
 * tooltip names that field, so a reader can check the claim. A row that wrote nothing would be the
 * eleventh dead seam, and this repository has a standing rule about those.
 *
 * The peak-order chips survive because they mean something real: which direction the period is
 * dominated by, which is `directionalSplit` — and *two-way both ends* is the `lunch-two-way`
 * template, whose whole purpose is a mix that swings from outgoing-dominant to incoming-dominant
 * across one period.
 */

import type { DemandTemplateId, SimulationConfig, TrafficProfiles } from '@elevator-sim/core/browser';

/** Which direction the period is dominated by — the handoff's three chips, § 1.3 M9. */
export const PEAK_ORDERS = ['up-first', 'down-first', 'two-way'] as const;
export type PeakOrder = (typeof PEAK_ORDERS)[number];

export interface PeakOrderInfo {
  readonly id: PeakOrder;
  readonly label: string;
  readonly note: string;
  /** The split it writes. `two-way` writes none and picks a template instead. */
  readonly split?: { readonly incoming: number; readonly outgoing: number; readonly interfloor: number } | undefined;
  readonly template: DemandTemplateId;
}

/**
 * The three orders and what each one actually configures.
 *
 * The splits are `data/traffic-profiles.json`'s own, not invented: `up-first` is the office
 * profiles' `85/5/10`, `down-first` is the residential profile's `15/75/10`, and `two-way` hands the
 * period to `lunch-two-way`, whose cited mix is 45/45/10 averaged over a swinging arc (CIBSE Guide
 * D, carried into 2020). Using the shipped numbers rather than round ones is what lets a reader
 * compare a pattern they built against a published figure.
 */
export const PEAK_ORDER_INFO: Readonly<Record<PeakOrder, PeakOrderInfo>> = Object.freeze({
  'up-first': Object.freeze({
    id: 'up-first' as PeakOrder,
    label: 'Up-peak first',
    note: 'Office. Almost everybody is arriving, and the lobby is the only origin that matters.',
    split: Object.freeze({ incoming: 0.85, outgoing: 0.05, interfloor: 0.1 }),
    template: 'rise-and-fall' as DemandTemplateId,
  }),
  'down-first': Object.freeze({
    id: 'down-first' as PeakOrder,
    label: 'Down-peak first',
    note: 'Apartments, hotels. The building empties, so the queue forms on every floor at once instead of in one lobby.',
    split: Object.freeze({ incoming: 0.15, outgoing: 0.75, interfloor: 0.1 }),
    template: 'rise-and-fall' as DemandTemplateId,
  }),
  'two-way': Object.freeze({
    id: 'two-way' as PeakOrder,
    label: 'Two-way both ends',
    note: 'The lunch template: outgoing-dominant early, incoming-dominant late, in one period. The hardest to zone for, because a car can never be empty in the useful direction.',
    split: undefined,
    template: 'lunch-two-way' as DemandTemplateId,
  }),
});

/** The editor's whole state. Flat, total, slider-shaped. */
export interface PatternSpec {
  readonly name: string;
  readonly order: PeakOrder;
  /** Percent of population per five minutes at the peak. The headline demand number. */
  readonly ratePctPop5min: number;
  /** Seconds the demand holds at peak. `rise-and-fall` and `lunch-two-way` only. */
  readonly peakWindowS: number;
  /** Intensity at both ends of the period as a fraction of peak, `0..1`. */
  readonly baselineFraction: number;
  /** Share of trips that never touch an entrance floor, `0..1`. Overrides the order's split. */
  readonly interfloorShare: number;
  /** Mean batch size. People travel together, and this changes loading more than the rate does. */
  readonly batchMean: number;
  /** Whether a batch shares one destination. A family does; a lift-load of strangers does not. */
  readonly batchSharesDestination: boolean;
  /** How much of the authored mix arc to keep, `0..1`. `two-way` only; `0` is § D162's control. */
  readonly mixAmplitude: number;
}

/** One row of the editor, and the field it writes. */
export interface PatternRow {
  readonly key: keyof PatternSpec & string;
  readonly label: string;
  readonly group: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  /** Named after the field it writes, so the claim is checkable. */
  readonly help: string;
  /** When present, the row only applies under these orders. */
  readonly onlyFor?: readonly PeakOrder[] | undefined;
}

/**
 * The rows, grouped as the handoff groups them — three headings, ten controls.
 *
 * Every `help` names the `SimulationDemandOptions` field or the template knob the row writes. That
 * is a deliberate reversal of the handoff's tooltips, which explain the *phenomenon*; a reader of
 * this implementation needs both, and the phenomenon without the field is what lets a slider drift
 * into decoration.
 */
export const PATTERN_ROWS: readonly PatternRow[] = Object.freeze([
  {
    key: 'ratePctPop5min',
    label: 'Peak demand',
    group: 'INTENSITY',
    min: 1,
    max: 25,
    step: 0.5,
    unit: ' %pop/5 min',
    help: 'Arrivals at the peak, as a percentage of the building’s population every five minutes — `demand.arrivalRatePctPop5min`. Lift engineers size buildings on this number: 12% is a standard office up-peak and 16% is a prestige one. Above about 18% most groups on most buildings saturate, which is a legitimate thing to build and watch.',
  },
  {
    key: 'baselineFraction',
    label: 'Off-peak level',
    group: 'INTENSITY',
    min: 0,
    max: 1,
    step: 0.05,
    unit: ' × peak',
    help: 'Intensity at both ends of the period as a fraction of the peak — `demand.baselineFraction`. Zero starts the period from an empty building; a high value leaves no ramp at all and turns the template into a flat load.',
  },
  {
    key: 'peakWindowS',
    label: 'How long the peak holds',
    group: 'THE SHAPE OF THE PERIOD',
    min: 60,
    max: 1800,
    step: 30,
    unit: ' s',
    help: 'Seconds the demand stays at peak before ramping down — `demand.peakWindowS`, which is also the reporting window under `rise-and-fall`. The same number of people crammed into five minutes instead of twenty is a completely different problem, and this is the control that says which one you are running.',
  },
  {
    key: 'mixAmplitude',
    label: 'How far the mix swings',
    group: 'THE SHAPE OF THE PERIOD',
    min: 0,
    max: 1,
    step: 0.05,
    unit: ' × authored',
    help: 'How much of the lunch template’s directional arc to keep — `demand.mixAmplitude`. 1 is the arc as authored; **0 holds the mix flat at the period’s own mean with total demand unchanged**, which is the negative control DECISIONS.md § D162 requires beside any result measured under a varying mix.',
    onlyFor: ['two-way'],
  },
  {
    key: 'interfloorShare',
    label: 'Interfloor share',
    group: 'DIRECTION',
    min: 0,
    max: 0.7,
    step: 0.05,
    unit: '',
    help: 'Share of trips that never touch an entrance floor — the `interfloor` component of `demand.directionalSplit`. High interfloor traffic defeats zoning and lobby parking, because there is no single origin to park against.',
  },
  {
    key: 'batchMean',
    label: 'Mean group size',
    group: 'DIRECTION',
    min: 1,
    max: 4,
    step: 0.1,
    unit: ' people',
    help: 'How many people arrive together — a couple, a meeting turning out, a lift-load off one bus. Writes `traffic-profiles.json`’s `batchSize.mean`, by widening the traffic file this run resolves against and leaving the profile’s own distribution shape alone. Group size changes loading and stopping far more than the arrival rate does; it is the parameter most simulators get wrong by assuming passengers arrive one at a time.',
  },
  {
    key: 'batchSharesDestination',
    label: 'A group travels together',
    group: 'DIRECTION',
    min: 0,
    max: 1,
    step: 1,
    unit: '',
    help: 'Whether everyone in a batch is going to the same floor — `demand.batchSharesDestination`. A family does; a lift-load of strangers arriving at the same revolving door does not, and the difference is one stop or four.',
  },
]);

export const DEFAULT_PATTERN: PatternSpec = Object.freeze({
  name: 'Standard office up-peak',
  order: 'up-first' as PeakOrder,
  ratePctPop5min: 12,
  peakWindowS: 300,
  baselineFraction: 0,
  interfloorShare: 0.1,
  batchMean: 1.4,
  batchSharesDestination: false,
  mixAmplitude: 1,
});

/** The rows that apply to a given order — a control that cannot act is not drawn as if it could. */
export function rowsFor(spec: PatternSpec): readonly PatternRow[] {
  return PATTERN_ROWS.filter((row) => row.onlyFor === undefined || row.onlyFor.includes(spec.order));
}

/**
 * The demand block this spec configures.
 *
 * Returns the two fields `SimulationConfig` needs — `demandTemplate` and `demand` — rather than a
 * whole config, so a caller can apply an event's effect on top (`shift/events.ts`) without this
 * module knowing events exist.
 */
export function demandFromSpec(spec: PatternSpec): {
  readonly demandTemplate: DemandTemplateId;
  readonly demand: NonNullable<SimulationConfig['demand']>;
} {
  const info = PEAK_ORDER_INFO[spec.order];
  const demand: Record<string, unknown> = {
    arrivalRatePctPop5min: spec.ratePctPop5min,
    peakWindowS: spec.peakWindowS,
    baselineFraction: spec.baselineFraction,
    batchSharesDestination: spec.batchSharesDestination,
  };
  if (info.split !== undefined) {
    demand['directionalSplit'] = rebalanced(info.split, spec.interfloorShare);
  }
  if (spec.order === 'two-way') demand['mixAmplitude'] = spec.mixAmplitude;
  return {
    demandTemplate: info.template,
    demand: demand as NonNullable<SimulationConfig['demand']>,
  };
}

/**
 * Move the interfloor share and put the difference back into the other two, in proportion.
 *
 * A `directionalSplit` must sum to one, so raising interfloor has to take from somewhere. Taking it
 * proportionally is the choice that leaves the *ratio* of incoming to outgoing — which is what the
 * peak order means — unchanged. Taking it from one side would silently turn an up-peak into a
 * two-way period as the reader dragged.
 */
function rebalanced(
  split: { readonly incoming: number; readonly outgoing: number; readonly interfloor: number },
  interfloor: number,
): { readonly incoming: number; readonly outgoing: number; readonly interfloor: number } {
  const clamped = Math.min(0.95, Math.max(0, interfloor));
  const directional = split.incoming + split.outgoing;
  if (directional <= 0) return { incoming: 0, outgoing: 1 - clamped, interfloor: clamped };
  const scale = (1 - clamped) / directional;
  return {
    incoming: round4(split.incoming * scale),
    outgoing: round4(split.outgoing * scale),
    interfloor: round4(clamped),
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * The spec a shipped traffic profile amounts to, so the editor opens on the building's own demand
 * rather than on a default nobody chose.
 *
 * `governingPeak` decides the order — the profile's own word for the same idea — and the
 * `arrivalRatePctPop5min.typical`, `batchSize.mean` and `directionalSplit.interfloor` come straight
 * off the record.
 */
export function specFromTrafficProfile(
  profiles: TrafficProfiles,
  profileId: string | undefined,
): PatternSpec {
  const profile = profiles.profiles.find((candidate) => candidate.id === profileId);
  if (profile === undefined) return DEFAULT_PATTERN;
  const order: PeakOrder =
    profile.governingPeak === 'two-way'
      ? 'two-way'
      : profile.governingPeak.startsWith('down')
        ? 'down-first'
        : 'up-first';
  return {
    ...DEFAULT_PATTERN,
    name: profile.name,
    order,
    ratePctPop5min: profile.arrivalRatePctPop5min.typical,
    interfloorShare: profile.directionalSplit.interfloor,
    batchMean: profile.batchSize.mean,
  };
}

export function patternIsDirty(spec: PatternSpec, source: PatternSpec): boolean {
  return (
    spec.order !== source.order ||
    spec.ratePctPop5min !== source.ratePctPop5min ||
    spec.peakWindowS !== source.peakWindowS ||
    spec.baselineFraction !== source.baselineFraction ||
    spec.interfloorShare !== source.interfloorShare ||
    spec.batchMean !== source.batchMean ||
    spec.batchSharesDestination !== source.batchSharesDestination ||
    spec.mixAmplitude !== source.mixAmplitude
  );
}

/**
 * The traffic file this pattern asks the run to resolve against.
 *
 * ## Why this exists, and why it is not an option on `demand`
 *
 * **Corrected in wave 13:** `SimulationDemandOptions` *now has* a `batchSize` field, added by
 * `docs/14` § 2.2 along with the group-size curve. This docstring said it had none, and that was
 * true when it was written and false the moment step 3 landed — so the sentence is retracted here
 * rather than left to be discovered. The **workaround below still works**, and is left standing
 * because replacing it is a behaviour change this repair is not making: widening the file is not
 * equivalent to writing an override, since the file reaches every source and the override is a
 * run-level curve.
 *
 * **That decision is now made rather than deferred** (issue #66's repair). The two are not
 * interchangeable and the file is the right one *for this control*: `demand.batchSize` is a whole
 * {@link BatchSizeCurve} — `distribution`, `weights` **and** `mean` — so writing one from a single
 * slider would silently replace the profile's authored distribution shape with whatever default the
 * override carried. Widening moves the one number the slider is named after and leaves the curve
 * the reference data declares. An editor that offered the *shape* as well would want the override;
 * this one offers a mean, so it writes a mean.
 *
 * What remains true, and is the reason the row exists at all: mean group size lives on the
 * **traffic profile** — `data/traffic-profiles.json`'s `batchSize.mean` — and the generator reads
 * it from the file `SimulationConfig.trafficProfiles` supplies. It is the most consequential
 * slider on the panel:
 * `CLAUDE.md` says in as many words that **passengers arrive in batches, not one at a time**, and
 * `data/traffic-profiles.json`'s own comment says batch size *"materially changes loading and stop
 * patterns"*.
 *
 * The row was drawn as a refusal for exactly one lane's duration. This makes it live, by the same
 * move `machineSpec.ts`'s `specsWithClass` makes for a machine class: **widen the file the run
 * resolves against**, leaving every other profile in it untouched, so the reference data and the
 * run cannot drift and nothing that did not ask for an override gets one.
 *
 * Returns the file unchanged when the spec's batch mean already equals the profile's, so the
 * common case is byte-identical and a run under *the building's own demand* is the run every
 * published figure was measured under.
 */
export function trafficProfilesWithPattern(
  profiles: TrafficProfiles,
  profileId: string,
  spec: PatternSpec,
): TrafficProfiles {
  const target = profiles.profiles.find((profile) => profile.id === profileId);
  if (target === undefined) return profiles;
  if (target.batchSize.mean === spec.batchMean) return profiles;
  return {
    ...profiles,
    profiles: profiles.profiles.map((profile) =>
      profile.id === profileId
        ? { ...profile, batchSize: { ...profile.batchSize, mean: spec.batchMean } }
        : profile,
    ),
  };
}

/** The handoff's one-line running summary, § 1.3 M9. */
export function patternSummary(spec: PatternSpec): string {
  const info = PEAK_ORDER_INFO[spec.order];
  return (
    `${info.label.toLowerCase()} · ${spec.ratePctPop5min.toFixed(1)} %pop/5 min held for ` +
    `${String(Math.round(spec.peakWindowS))} s · groups of ${spec.batchMean.toFixed(1)} · ` +
    `${String(Math.round(spec.interfloorShare * 100))}% interfloor`
  );
}
