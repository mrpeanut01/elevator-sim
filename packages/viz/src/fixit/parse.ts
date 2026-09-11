/**
 * Reading `data/fixit-cases.json`, and refusing the ways it can be wrong.
 *
 * The precedent is `campaign/parse.ts`: authored data is validated **at load time**, every
 * violation is collected rather than the first thrown, and the rules a test would otherwise hold
 * in prose are mechanical here:
 *
 * - **§ 10.6 rule 2/3** — exactly one repair per role; the diagnosed fix costs 0–9 units; the new
 *   shaft costs 34 and is never affordable inside the case's own budget.
 * - **§ 10.2** — the budget is 10–16 units.
 * - **R10** — no probability word in any player-facing string (`campaign/words.ts` owns the list).
 * - **GAMEPLAY § 16 rule 11** — no engine identifier in any player-facing string. The forbidden
 *   set is *derived* by the caller (building ids, dispatcher profile ids), never listed here.
 * - The building is shipped, and every floor the measure names is one that building has — a
 *   complaint measured over floors that do not exist would be a measure of nothing.
 * - **§ 10.4's basis, made a rule — and the rule is narrower than the one that was asked for**
 *   (GitHub issue #349, `docs/35` PM-FB3, [§ D497](../../../../DECISIONS.md)). The brief said no
 *   shipped repair touched `floorPopulations` and asked for a blanket refusal. **Three do**, and
 *   each is the case's diagnosed repair and its whole lesson: `one-start-time` staggers tenancy
 *   starts, `every-letter-says-nine` reprints half the appointment letters, and
 *   `let-faster-than-the-lifts` invokes a staggered-starts clause — *"this is the case where the
 *   crowd, not the kit, is wrong."* Refusing those would make demand-side diagnosis unauthorable.
 *   So the refusal binds the three **fabric** roles — a costly fix, a cheap fix and a new shaft
 *   are purchases, and a purchase cannot move a person out of the peak — and the diagnosed repair
 *   may change the crowd **provided the pair says so**: `engine.ts#DEMAND_BASIS_LINE` replaces the
 *   same-crowd basis, chosen from the legs rather than the patch, and `run.ts#assertPairMatchesRepairs`
 *   holds the patch and the legs to each other in both directions. The **as-built** patch is
 *   exempt either way: it is applied to both runs, so it shapes the crowd both arms meet.
 * - **A `symptom` names a sight, not a figure** (GitHub issue #351, `docs/35` PM-FB2). The
 *   symptom is printed on the failing band of the schematic so the problem arrives as something
 *   the player can *see* on the stage rather than a statistic they are asked to take on trust.
 *   A symptom carrying a numeral, or a statistic's name, is a figure — see
 *   {@link symptomFigureIn} for the exact rule and the two shipped cases that failed it.
 * - **A case that runs outside its profile's declared arrival-rate band declares it on its own
 *   face** — [§ D478](../../../../DECISIONS.md)'s obligation, and the declaration is **derived
 *   here rather than authored in the file**. See {@link demandDisclosureOf} for why: the brief
 *   that asked for this expected two authored sentences, and fourteen of the eighteen shipped
 *   cases run outside their band, thirteen of them *below* it. An authored key is refused, because
 *   a sentence beside a number goes stale the first time the number moves and the sentence does
 *   not (§ D227's class, aimed at the one parameter the ruling makes load-bearing).
 */

import { probabilityWordIn } from '../campaign/words.js';
import { priceOf, purchaseUnits } from '../pricing/parse.js';
import { repairPriceUnits, unpricedPathsIn } from '../pricing/repairPrice.js';
import type { PriceSchedule } from '../pricing/types.js';
import type {
  BuildingPatch,
  BankEquipmentPatch,
  CarPatch,
  ComplaintMeasure,
  ComplaintScope,
  FigureSpec,
  FixitCase,
  FixitCases,
  FixitPatch,
  FixitRepair,
  RepairRole,
} from './types.js';

/**
 * A traffic profile's declared arrival-rate band, `% of population per 5 minutes` — the two bounds
 * of `core`'s `DemandBand`, without its `typical`, because § D478 is about the edges.
 */
export interface DemandBand {
  readonly min: number;
  readonly max: number;
}

/** Raised when `data/fixit-cases.json` cannot be read as a case file at all. */
export class FixitCasesError extends Error {
  override readonly name = 'FixitCasesError';
  readonly violations: readonly string[];
  constructor(violations: readonly string[]) {
    super(`the fix-a-building cases are not valid:\n  ${violations.join('\n  ')}`);
    this.violations = violations;
  }
}

/** What the file is validated against. Derived by the caller from the loaded `data/`. */
export interface FixitContext {
  /**
   * `data/price-schedule.json`, parsed — GitHub issue **#366**.
   *
   * Every repair's price is read off this rather than authored beside the repair. The case file
   * carries no `costUnits` at all now; see `pricing/repairPrice.ts` for why, and for what moved.
   * Injected rather than imported, on this file's own standing rule: the caller derives it from
   * the same loaded `data/` that everything else here is checked against.
   */
  readonly schedule: PriceSchedule;
  /** Floor ids per shipped building id. A building missing from the map is not shipped. */
  readonly floorIdsByBuilding: ReadonlyMap<string, readonly string[]>;
  /** Dispatcher profile ids this build's `data/` carries. */
  readonly profileIds: ReadonlySet<string>;
  /**
   * Each shipped building's declared arrival-rate band — its `trafficProfile`'s
   * `arrivalRatePctPop5min` range, `% of population per 5 minutes`. The caller derives it from the
   * same loaded `data/`; this module reads it to derive {@link FixitCase.demandDisclosure} and
   * never lists a band itself. A building absent from the map is unshipped, and is refused above.
   */
  readonly bandByBuilding: ReadonlyMap<string, DemandBand>;
  /**
   * Identifiers that must not appear in player-facing copy — § 16 rule 11. The caller derives
   * this from the same loaded data (building ids, profile ids); this module never lists one.
   */
  readonly engineIds: readonly string[];
}

/**
 * The context, derived from loaded `data/` — **one derivation with four callers** (the browser
 * loader, the run suite, the surface-run measurement and the honesty tier's fixtures), so the
 * forbidden-identifier set and the band map cannot be built four slightly different ways. Takes
 * the structural minimum rather than `BrowserResources`, because this module is also validated
 * from Node without the browser loader.
 */
export function fixitContextOf(input: {
  readonly schedule: PriceSchedule;
  readonly buildings: readonly {
    readonly id: string;
    readonly trafficProfile: string;
    readonly floors: readonly { readonly id: string }[];
  }[];
  readonly trafficProfiles: { readonly profiles: readonly { readonly id: string; readonly arrivalRatePctPop5min: DemandBand }[] };
  readonly dispatcherProfiles: { readonly profiles: readonly { readonly id: string }[] };
}): FixitContext {
  const bands = new Map(input.trafficProfiles.profiles.map((profile) => [profile.id, profile.arrivalRatePctPop5min]));
  const bandByBuilding = new Map<string, DemandBand>();
  for (const building of input.buildings) {
    const band = bands.get(building.trafficProfile);
    if (band !== undefined) bandByBuilding.set(building.id, band);
  }
  return {
    schedule: input.schedule,
    floorIdsByBuilding: new Map(input.buildings.map((building) => [building.id, building.floors.map((floor) => floor.id)])),
    profileIds: new Set(input.dispatcherProfiles.profiles.map((profile) => profile.id)),
    bandByBuilding,
    engineIds: [
      ...input.buildings.map((building) => building.id),
      ...input.dispatcherProfiles.profiles.map((profile) => profile.id),
    ],
  };
}

const ROLES: readonly RepairRole[] = ['diagnosed', 'costly-fix', 'cheap-fix', 'new-shaft'];
const MEASURE_KINDS = ['long-waits', 'mean-wait'] as const;
const SCOPE_MODES = ['origin', 'touches', 'origin-to-destination'] as const;
const FIGURE_KINDS = ['complaint', 'scope-long-waits', 'scope-mean-wait', 'scope-worst-wait', 'rest-away-pct'] as const;
const READINGS = ['bad', 'mid', 'healthy'] as const;

/** § 10.2's band, and § 10.6 rule 2's two prices. */
export const BUDGET_MIN_UNITS = 10;
export const BUDGET_MAX_UNITS = 16;
export const DIAGNOSED_MAX_UNITS = 9;
/**
 * **The new shaft's price, read off the schedule** — GitHub issue **#366**.
 *
 * This was a bare `34` here, and it was one of *four* places that independently said 34: every one
 * of the eighteen cases' new-shaft repair, `fixit/engine.ts#EDITOR_PRICING.shaftUnits`, and the
 * campaign shop's first Shafts tier. That unanimity is why the figure did not have to be drafted —
 * it was already agreed and is only being moved. Nothing here may hold a second copy of it.
 */
export function newShaftUnits(schedule: PriceSchedule): number {
  return purchaseUnits(priceOf(schedule, 'new-car'));
}

/**
 * What makes a `symptom` a **figure** rather than a **sight** — GitHub issue #351, PM-FB2.
 *
 * Two clauses, and both are deliberately blunt:
 *
 * - **a numeral.** `a 341 s mean wait to board` and `a 322 s worst wait beside an empty
 *   hoistway` — the two shipped symptoms this rule was written against — are both caught here,
 *   and so is any future `12 %` or `95th`. A number written in words (*doors held eleven seconds
 *   at every stop*) passes, because it reads as a description of what the doors did rather than
 *   as a reading off a dial, and because the shipped case that says it is a sight: a player can
 *   watch the doors stand open.
 * - **a statistic's name.** `mean`, `average`, `median`, `percentile` — a symptom naming one of
 *   these is quoting the figure grid below it, whatever number it carries.
 *
 * Returns the offending token, or `null`. Exported so the sweep's own test can drive the rule in
 * both directions without going through a whole case.
 */
export function symptomFigureIn(symptom: string): string | null {
  const numeral = /\d+(?:[.,]\d+)?\s*(?:s|%|min)?\b/u.exec(symptom);
  if (numeral !== null) return numeral[0].trim();
  const statistic = /\b(mean|average|median|percentile)\b/iu.exec(symptom);
  return statistic === null ? null : statistic[0];
}

/**
 * § D478's declaration, **derived** ([§ D499](../../../../DECISIONS.md)) — the sentence a case outside its profile's declared band
 * carries on its own face, or `undefined` for a case inside it or one running the building's own
 * profile (`arrivalRatePctPop5min: null`, which cannot be outside a band it does not override).
 *
 * ## Why derived, when the ruling says "an authored case … says so on its own face"
 *
 * The brief (GitHub issue #351) named two subjects — `gym-on-the-top-floor` at 9.5 against
 * residential's `max: 7`, and `three-cars-one-cars-work` at exactly 7 — and expected two authored
 * declarations from a content lane. Measured against the shipped file, **fourteen of the eighteen
 * cases run outside their band**, and thirteen of them run *below* it: an office at 2 % against
 * `11–15`, a hotel at 7.8 against `10–15`. § D478's reason applies in both directions — *a figure
 * taken from an out-of-band run is not representative of the building type, and a reader who
 * takes it as such has been misled by a number that was correct* — and a quiet day is exactly as
 * unrepresentative of a design peak as a busy one. Fourteen authored sentences beside fourteen
 * authored rates is fourteen places for the sentence to stay put while the rate moves.
 *
 * So the declaration is a function of the rate and the band, the two facts it is about, and an
 * authored `demandDisclosure` key in the file is a parse violation. That is the same discipline the
 * complaint's measure already obeys — *computed from the runs and never authored* — pointed at the
 * one parameter § D478 made load-bearing. `three-cars-one-cars-work` at exactly 7 is **inside** an
 * inclusive band and carries nothing: a band's edge is part of the band.
 *
 * The figures are printed as the file authors them (`9.5 %`, `11–15 %`), never rounded, so the
 * sentence and the case's `run` block cannot disagree.
 */
export function demandDisclosureOf(rate: number | null, band: DemandBand | undefined): string | undefined {
  if (rate === null || band === undefined) return undefined;
  if (rate >= band.min && rate <= band.max) return undefined;
  const direction = rate > band.max ? 'Busier' : 'Quieter';
  return (
    `${direction} than a building like this is sized for: ${String(rate)} % of its people arrive ` +
    `in any five minutes, against the ${String(band.min)}–${String(band.max)} % its design is ` +
    'drawn around. The figures here are about this day, not about the building type.'
  );
}

/** Every authored string a player reads on this case, labelled — the copy-rule sweep reads this. */
export function playerFacingStringsOf(entry: FixitCase): readonly (readonly [string, string])[] {
  return [
    ['its name', entry.name],
    ['the as-built line', entry.asBuilt.note],
    ['the complaint', entry.complaint.text],
    ['the complainer', entry.complaint.complainer],
    ['the measure label', entry.complaint.measure.label],
    ['the symptom', entry.symptom],
    ...(entry.demandDisclosure === undefined ? [] : [['the demand disclosure', entry.demandDisclosure] as const]),
    ['the diagnosis', entry.diagnosis.text],
    ['its reasoning', entry.diagnosis.reasoning],
    ['the result head', entry.result.head],
    ['the result body', entry.result.body],
    ...entry.figures.map((figure, index) => [`figure ${String(index + 1)}`, figure.label] as const),
    ...entry.repairs.flatMap((repair) => [
      [`repair "${repair.id}" name`, repair.name] as const,
      [`repair "${repair.id}" effect`, repair.effect] as const,
    ]),
  ];
}

/**
 * Parse and validate the whole file.
 *
 * @throws FixitCasesError carrying every violation found.
 */
export function parseFixitCases(raw: unknown, context: FixitContext): FixitCases {
  const violations: string[] = [];
  const decoded = decodeFile(raw, violations, context.schedule);
  if (decoded === undefined) throw new FixitCasesError(violations);
  const seen = new Set<string>();
  const cases: FixitCase[] = [];
  for (const decodedCase of decoded.cases) {
    const where = `case "${decodedCase.id}"`;
    if (seen.has(decodedCase.id)) violations.push(`${where}: declared twice.`);
    seen.add(decodedCase.id);
    // § D478's declaration is attached here, where the band is known, and before the copy sweep
    // so that the sentence it composes is swept like every other string a player reads.
    const disclosure = demandDisclosureOf(
      decodedCase.run.arrivalRatePctPop5min,
      context.bandByBuilding.get(decodedCase.buildingId),
    );
    const entry: FixitCase = disclosure === undefined ? decodedCase : { ...decodedCase, demandDisclosure: disclosure };
    violations.push(...checkCase(where, entry, context));
    cases.push(entry);
  }
  if (violations.length > 0) throw new FixitCasesError(violations);
  return { version: decoded.version, cases, schedule: context.schedule };
}

function checkCase(where: string, entry: FixitCase, context: FixitContext): readonly string[] {
  const violations: string[] = [];
  const floors = context.floorIdsByBuilding.get(entry.buildingId);
  if (floors === undefined) {
    violations.push(`${where}: building "${entry.buildingId}" is not in this build's data/.`);
  }
  if (!context.profileIds.has(entry.dispatcherProfileId)) {
    violations.push(`${where}: dispatcher profile "${entry.dispatcherProfileId}" is not in this build's data/.`);
  }
  if (!/^\d{1,20}$/.test(entry.run.seed)) {
    violations.push(`${where}: the seed "${entry.run.seed}" is not 1–20 decimal digits.`);
  }
  if (!(entry.run.durationS > 0)) violations.push(`${where}: the run has no duration.`);

  if (entry.budgetUnits < BUDGET_MIN_UNITS || entry.budgetUnits > BUDGET_MAX_UNITS) {
    violations.push(
      `${where}: the budget is ${String(entry.budgetUnits)} u; § 10.2 gives a case 10–16.`,
    );
  }

  // The four roles, exactly once each.
  for (const role of ROLES) {
    const count = entry.repairs.filter((repair) => repair.role === role).length;
    if (count !== 1) {
      violations.push(`${where}: has ${String(count)} "${role}" repairs; § 10.6 rule 3 asks for exactly one.`);
    }
  }
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed !== undefined && (diagnosed.costUnits < 0 || diagnosed.costUnits > DIAGNOSED_MAX_UNITS)) {
    violations.push(
      `${where}: the diagnosed fix costs ${String(diagnosed.costUnits)} u; § 10.6 rule 2 prices it 0–9.`,
    );
  }
  const shaft = entry.repairs.find((repair) => repair.role === 'new-shaft');
  if (shaft !== undefined) {
    const shaftUnits = newShaftUnits(context.schedule);
    if (shaft.costUnits !== shaftUnits) {
      violations.push(
        `${where}: the new shaft costs ${String(shaft.costUnits)} u; data/price-schedule.json ` +
          `prices it ${String(shaftUnits)} in every case.`,
      );
    }
    if (shaft.costUnits <= entry.budgetUnits) {
      violations.push(
        `${where}: the new shaft is affordable inside the ${String(entry.budgetUnits)} u budget, ` +
          'and it must be visible and unaffordable — that is the lesson (§ 10.2).',
      );
    }
  }
  const repairIds = new Set<string>();
  for (const repair of entry.repairs) {
    if (repairIds.has(repair.id)) violations.push(`${where}: repair "${repair.id}" declared twice.`);
    repairIds.add(repair.id);
    if (repair.costUnits < 0) violations.push(`${where}: repair "${repair.id}" has a negative cost.`);
    if (repair.effect.trim() === '') {
      violations.push(`${where}: repair "${repair.id}" has no effect line; § 10.6 rule 4 requires one.`);
    }
    if (isEmptyPatch(repair.patch)) {
      violations.push(
        `${where}: repair "${repair.id}" changes nothing. A repair carries a config patch; a ` +
          "purchase that fixes nothing is a standing extra, and those are the engine's.",
      );
    }
    if (repair.role !== 'diagnosed' && (repair.patch.building?.floorPopulations ?? []).length > 0) {
      violations.push(
        `${where}: repair "${repair.id}" (${repair.role}) patches floorPopulations. A purchase ` +
          'cannot change who arrives: § 10.6 prices machinery, doors and a shaft, and none of them ' +
          'moves a person out of the peak. Only the diagnosed repair may change the crowd, and when ' +
          'it does the outcome says so on its basis line rather than claiming the same crowd twice.',
      );
    }
  }

  // The symptom is a sight, not a figure (PM-FB2).
  const figure = symptomFigureIn(entry.symptom);
  if (figure !== null) {
    violations.push(
      `${where}: the symptom "${entry.symptom}" states a figure ("${figure}"). A symptom names ` +
        'something the player can see on the stage — cars standing together, doors held, a crowd ' +
        'on a landing — so the problem arrives as a sight rather than as a statistic they are ' +
        'asked to take on trust. The figures have their own grid (PM-FB2).',
    );
  }

  // The figures: four of them, exactly one bad, at least one healthy (§ 10.1 item 3).
  if (entry.figures.length !== 4) {
    violations.push(`${where}: shows ${String(entry.figures.length)} figures; § 10.1 shows four.`);
  }
  const bad = entry.figures.filter((figure) => figure.reading === 'bad').length;
  const healthy = entry.figures.filter((figure) => figure.reading === 'healthy').length;
  if (bad !== 1) violations.push(`${where}: has ${String(bad)} figures read as bad; exactly one thing is wrong (rule 1).`);
  if (healthy < 1) violations.push(`${where}: has no healthy figure, so nothing can be seen to be fine (rule 1).`);

  // The measure's floors must exist on the shipped building.
  if (floors !== undefined) {
    const known = new Set(floors);
    const scope = entry.complaint.measure.scope;
    for (const floorId of [...scope.floorIds, ...(scope.destinationFloorIds ?? [])]) {
      if (!known.has(floorId)) {
        violations.push(`${where}: the measure names floor "${floorId}", which "${entry.buildingId}" does not have.`);
      }
    }
  }
  if (entry.complaint.measure.scope.mode === 'origin-to-destination' && (entry.complaint.measure.scope.destinationFloorIds ?? []).length === 0) {
    violations.push(`${where}: an origin-to-destination measure with no destinations measures nothing.`);
  }

  // Copy rules, over every player-facing string.
  for (const [label, text] of playerFacingStringsOf(entry)) {
    if (text.trim() === '') {
      violations.push(`${where}: ${label} is empty.`);
      continue;
    }
    const word = probabilityWordIn(text);
    if (word !== null) {
      violations.push(
        `${where}: ${label} says "${word}". R10 — a measured result is never translated into a ` +
          'probability word.',
      );
    }
    for (const id of context.engineIds) {
      if (text.toLowerCase().includes(id.toLowerCase())) {
        violations.push(
          `${where}: ${label} contains the engine identifier "${id}". § 16 rule 11 — no engine ` +
            'identifier ever reaches this surface.',
        );
      }
    }
  }
  return violations;
}

function isEmptyPatch(patch: FixitPatch): boolean {
  const dispatcher = patch.dispatcher;
  const building = patch.building;
  const dispatcherEmpty =
    dispatcher === undefined ||
    (dispatcher.idle === undefined && dispatcher.dispatch === undefined && dispatcher.answer === undefined);
  const buildingEmpty =
    building === undefined ||
    ((building.floorPopulations ?? []).length === 0 &&
      building.banks === undefined &&
      (building.cars ?? []).length === 0 &&
      (building.bankEquipment ?? []).length === 0 &&
      (building.addCars ?? []).length === 0);
  return dispatcherEmpty && buildingEmpty;
}

/* -------------------------------------------------------------------------- *
 * Decoding
 * -------------------------------------------------------------------------- */

type Record_ = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function decodeFile(raw: unknown, violations: string[], schedule: PriceSchedule): FixitCases | undefined {
  if (!isRecord(raw)) {
    violations.push('the file is not a JSON object.');
    return undefined;
  }
  const cases = raw['cases'];
  if (!Array.isArray(cases)) {
    violations.push('the file has no "cases" array.');
    return undefined;
  }
  const decoded: FixitCase[] = [];
  for (const [index, entry] of cases.entries()) {
    const one = decodeCase(entry, `cases[${String(index)}]`, violations, schedule);
    if (one !== undefined) decoded.push(one);
  }
  return { version: num(raw['version']) ?? 0, cases: decoded, schedule };
}

function decodeCase(raw: unknown, at: string, violations: string[], schedule: PriceSchedule): FixitCase | undefined {
  if (!isRecord(raw)) {
    violations.push(`${at}: is not an object.`);
    return undefined;
  }
  const id = str(raw['id']);
  if (id === undefined) {
    violations.push(`${at}: has no "id".`);
    return undefined;
  }
  const where = `case "${id}"`;
  const run = isRecord(raw['run']) ? raw['run'] : undefined;
  const asBuilt = isRecord(raw['asBuilt']) ? raw['asBuilt'] : undefined;
  const complaint = isRecord(raw['complaint']) ? raw['complaint'] : undefined;
  const diagnosis = isRecord(raw['diagnosis']) ? raw['diagnosis'] : undefined;
  const result = isRecord(raw['result']) ? raw['result'] : undefined;
  const measure = complaint !== undefined && isRecord(complaint['measure'])
    ? decodeMeasure(complaint['measure'], where, violations)
    : undefined;
  if (run === undefined) violations.push(`${where}: has no "run" object.`);
  if (asBuilt === undefined) violations.push(`${where}: has no "asBuilt" object.`);
  if (complaint === undefined) violations.push(`${where}: has no "complaint" object.`);
  if (diagnosis === undefined) violations.push(`${where}: has no "diagnosis" object.`);
  if (result === undefined) violations.push(`${where}: has no "result" object.`);
  if (run === undefined || asBuilt === undefined || complaint === undefined) return undefined;
  if (diagnosis === undefined || result === undefined || measure === undefined) return undefined;

  const rate = run['arrivalRatePctPop5min'];
  if (raw['demandDisclosure'] !== undefined) {
    violations.push(
      `${where}: authors a "demandDisclosure". The declaration a case outside its profile's band ` +
        'carries is derived from the rate and the band at load time (§ D478), never authored — an ' +
        'authored sentence beside an authored rate goes stale the first time one moves without the ' +
        'other. Delete the key; the case will say what its rate implies.',
    );
  }
  return {
    id,
    name: str(raw['name']) ?? '',
    buildingId: str(raw['buildingId']) ?? '',
    dispatcherProfileId: str(raw['dispatcherProfileId']) ?? '',
    run: {
      seed: str(run['seed']) ?? '',
      durationS: num(run['durationS']) ?? Number.NaN,
      arrivalRatePctPop5min: typeof rate === 'number' ? rate : null,
    },
    asBuilt: {
      note: str(asBuilt['note']) ?? '',
      patch: decodePatch(asBuilt['patch'], `${where}: asBuilt`, violations),
    },
    complaint: {
      text: str(complaint['text']) ?? '',
      complainer: str(complaint['complainer']) ?? '',
      measure,
    },
    symptom: str(raw['symptom']) ?? '',
    figures: decodeFigures(raw['figures'], where, violations),
    diagnosis: { text: str(diagnosis['text']) ?? '', reasoning: str(diagnosis['reasoning']) ?? '' },
    budgetUnits: num(raw['budgetUnits']) ?? Number.NaN,
    repairs: decodeRepairs(raw['repairs'], where, violations, schedule),
    result: { head: str(result['head']) ?? '', body: str(result['body']) ?? '' },
  };
}

function decodeMeasure(raw: Record_, where: string, violations: string[]): ComplaintMeasure | undefined {
  const kind = str(raw['kind']);
  if (kind === undefined || !(MEASURE_KINDS as readonly string[]).includes(kind)) {
    violations.push(`${where}: measure kind ${JSON.stringify(raw['kind'])} is not one this build knows.`);
    return undefined;
  }
  const scope = decodeScope(raw['scope'], where, violations);
  if (scope === undefined) return undefined;
  return {
    kind: kind as ComplaintMeasure['kind'],
    label: str(raw['label']) ?? '',
    thresholdS: num(raw['thresholdS']) ?? 60,
    scope,
  };
}

function decodeScope(raw: unknown, where: string, violations: string[]): ComplaintScope | undefined {
  if (!isRecord(raw)) {
    violations.push(`${where}: the measure has no "scope" object.`);
    return undefined;
  }
  const mode = str(raw['mode']);
  if (mode === undefined || !(SCOPE_MODES as readonly string[]).includes(mode)) {
    violations.push(`${where}: scope mode ${JSON.stringify(raw['mode'])} is not one this build knows.`);
    return undefined;
  }
  const floorIds = strings(raw['floorIds']);
  if (floorIds.length === 0) {
    violations.push(`${where}: the scope names no floors, so the complaint is measured over nothing.`);
    return undefined;
  }
  const destinations = strings(raw['destinationFloorIds']);
  return {
    mode: mode as ComplaintScope['mode'],
    floorIds,
    ...(destinations.length > 0 ? { destinationFloorIds: destinations } : {}),
  };
}

function decodeFigures(raw: unknown, where: string, violations: string[]): readonly FigureSpec[] {
  if (!Array.isArray(raw)) {
    violations.push(`${where}: has no "figures" array.`);
    return [];
  }
  const figures: FigureSpec[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      violations.push(`${where}: figures[${String(index)}] is not an object.`);
      continue;
    }
    const kind = str(entry['kind']);
    const reading = str(entry['reading']);
    if (kind === undefined || !(FIGURE_KINDS as readonly string[]).includes(kind)) {
      violations.push(`${where}: figures[${String(index)}] kind ${JSON.stringify(entry['kind'])} is not one this build knows.`);
      continue;
    }
    if (reading === undefined || !(READINGS as readonly string[]).includes(reading)) {
      violations.push(`${where}: figures[${String(index)}] reading ${JSON.stringify(entry['reading'])} is not bad/mid/healthy.`);
      continue;
    }
    figures.push({
      kind: kind as FigureSpec['kind'],
      label: str(entry['label']) ?? '',
      reading: reading as FigureSpec['reading'],
    });
  }
  return figures;
}

function decodeRepairs(
  raw: unknown,
  where: string,
  violations: string[],
  schedule: PriceSchedule,
): readonly FixitRepair[] {
  if (!Array.isArray(raw)) {
    violations.push(`${where}: has no "repairs" array.`);
    return [];
  }
  const repairs: FixitRepair[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      violations.push(`${where}: repairs[${String(index)}] is not an object.`);
      continue;
    }
    const role = str(entry['role']);
    if (role === undefined || !(ROLES as readonly string[]).includes(role)) {
      violations.push(`${where}: repairs[${String(index)}] role ${JSON.stringify(entry['role'])} is not one this build knows.`);
      continue;
    }
    const patch = decodePatch(entry['patch'], `${where}: repairs[${String(index)}]`, violations);
    /*
     * **The price is read off the schedule, and an authored one is refused** — GitHub issue #366.
     *
     * A `costUnits` in the case file would be the second price for a change the schedule already
     * prices, which is the whole of what this issue is about. Refused rather than ignored: silently
     * dropping it would let an author keep writing a number that no longer does anything, which is
     * the stale-refusal shape one level down.
     */
    if (entry['costUnits'] !== undefined) {
      violations.push(
        `${where}: repairs[${String(index)}] carries a costUnits. Prices live in ` +
          'data/price-schedule.json now, one per change (GitHub issue #366) — delete the field.',
      );
    }
    for (const path of unpricedPathsIn(schedule, patch)) {
      violations.push(
        `${where}: repairs[${String(index)}] changes "${path}", which data/price-schedule.json ` +
          'prices nothing for. A repair nobody can be charged for is a repair nobody can buy.',
      );
    }
    repairs.push({
      id: str(entry['id']) ?? `repair-${String(index)}`,
      role: role as RepairRole,
      name: str(entry['name']) ?? '',
      costUnits: repairPriceUnits(schedule, patch),
      effect: str(entry['effect']) ?? '',
      patch,
    });
  }
  return repairs;
}

function decodePatch(raw: unknown, at: string, violations: string[]): FixitPatch {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) {
    violations.push(`${at}: the patch is not an object.`);
    return {};
  }
  const dispatcher = isRecord(raw['dispatcher']) ? raw['dispatcher'] : undefined;
  const building = isRecord(raw['building']) ? raw['building'] : undefined;
  return {
    ...(dispatcher === undefined
      ? {}
      : {
          dispatcher: {
            ...(isRecord(dispatcher['idle']) ? { idle: dispatcher['idle'] } : {}),
            ...(isRecord(dispatcher['dispatch']) ? { dispatch: dispatcher['dispatch'] } : {}),
            ...(isRecord(dispatcher['answer']) ? { answer: dispatcher['answer'] } : {}),
          },
        }),
    ...(building === undefined ? {} : { building: decodeBuildingPatch(building, at, violations) }),
  };
}

function decodeBuildingPatch(raw: Record_, at: string, violations: string[]): BuildingPatch {
  const populations: { floorIds: readonly string[]; population: number }[] = [];
  if (Array.isArray(raw['floorPopulations'])) {
    for (const entry of raw['floorPopulations']) {
      if (!isRecord(entry)) continue;
      const floorIds = strings(entry['floorIds']);
      const population = num(entry['population']);
      if (floorIds.length === 0 || population === undefined) {
        violations.push(`${at}: a floorPopulations entry needs floorIds and a population.`);
        continue;
      }
      populations.push({ floorIds, population });
    }
  }
  const cars: CarPatch[] = [];
  if (Array.isArray(raw['cars'])) {
    for (const entry of raw['cars']) {
      if (!isRecord(entry) || !isRecord(entry['set'])) {
        violations.push(`${at}: a cars entry needs carIds and a set.`);
        continue;
      }
      const set = entry['set'];
      const allowed = ['ratedSpeedDeltaMps', 'cabinPressurised', 'dwellCarCallS', 'dwellHallCallS'];
      for (const key of Object.keys(set)) {
        if (!allowed.includes(key)) violations.push(`${at}: a car patch may not set "${key}".`);
      }
      cars.push({
        carIds: strings(entry['carIds']),
        set: {
          ...(num(set['ratedSpeedDeltaMps']) === undefined ? {} : { ratedSpeedDeltaMps: num(set['ratedSpeedDeltaMps']) }),
          ...(typeof set['cabinPressurised'] === 'boolean' ? { cabinPressurised: set['cabinPressurised'] } : {}),
          ...(num(set['dwellCarCallS']) === undefined ? {} : { dwellCarCallS: num(set['dwellCarCallS']) }),
          ...(num(set['dwellHallCallS']) === undefined ? {} : { dwellHallCallS: num(set['dwellHallCallS']) }),
        },
      });
    }
  }
  /*
   * **Per-bank equipment** — GitHub issue #431, `DECISIONS.md` § D539. Decoded exactly as a car patch
   * is, and refused the same way when it names a key the table does not have. The ratio's range is
   * the loader's to enforce, where every other bank field's is, so a case that sets 0.3 is refused by
   * `parseBuilding` when the run is planned rather than twice with two messages.
   */
  const bankEquipment: BankEquipmentPatch[] = [];
  if (Array.isArray(raw['bankEquipment'])) {
    for (const entry of raw['bankEquipment']) {
      if (!isRecord(entry) || !isRecord(entry['set'])) {
        violations.push(`${at}: a bankEquipment entry needs bankIds and a set.`);
        continue;
      }
      const set = entry['set'];
      const allowed = ['counterweightBalanceRatio', 'regenerativeDrive'];
      for (const key of Object.keys(set)) {
        if (!allowed.includes(key)) violations.push(`${at}: a bank equipment patch may not set "${key}".`);
      }
      bankEquipment.push({
        bankIds: strings(entry['bankIds']),
        set: {
          ...(num(set['counterweightBalanceRatio']) === undefined ? {} : { counterweightBalanceRatio: num(set['counterweightBalanceRatio']) }),
          ...(typeof set['regenerativeDrive'] === 'boolean' ? { regenerativeDrive: set['regenerativeDrive'] } : {}),
        },
      });
    }
  }
  const addCars: { bankId: string; copyCarId: string; id: string }[] = [];
  if (Array.isArray(raw['addCars'])) {
    for (const entry of raw['addCars']) {
      if (!isRecord(entry)) continue;
      const bankId = str(entry['bankId']);
      const copyCarId = str(entry['copyCarId']);
      const id = str(entry['id']);
      if (bankId === undefined || copyCarId === undefined || id === undefined) {
        violations.push(`${at}: an addCars entry needs bankId, copyCarId and id.`);
        continue;
      }
      addCars.push({ bankId, copyCarId, id });
    }
  }
  return {
    ...(populations.length > 0 ? { floorPopulations: populations } : {}),
    ...(raw['banks'] === undefined ? {} : { banks: raw['banks'] }),
    ...(cars.length > 0 ? { cars } : {}),
    ...(bankEquipment.length > 0 ? { bankEquipment } : {}),
    ...(addCars.length > 0 ? { addCars } : {}),
  };
}
