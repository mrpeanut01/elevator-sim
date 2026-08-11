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
 */

import { probabilityWordIn } from '../campaign/words.js';
import type {
  BuildingPatch,
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
  /** Floor ids per shipped building id. A building missing from the map is not shipped. */
  readonly floorIdsByBuilding: ReadonlyMap<string, readonly string[]>;
  /** Dispatcher profile ids this build's `data/` carries. */
  readonly profileIds: ReadonlySet<string>;
  /**
   * Identifiers that must not appear in player-facing copy — § 16 rule 11. The caller derives
   * this from the same loaded data (building ids, profile ids); this module never lists one.
   */
  readonly engineIds: readonly string[];
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
export const NEW_SHAFT_UNITS = 34;

/** Every authored string a player reads on this case, labelled — the copy-rule sweep reads this. */
export function playerFacingStringsOf(entry: FixitCase): readonly (readonly [string, string])[] {
  return [
    ['its name', entry.name],
    ['the as-built line', entry.asBuilt.note],
    ['the complaint', entry.complaint.text],
    ['the complainer', entry.complaint.complainer],
    ['the measure label', entry.complaint.measure.label],
    ['the symptom', entry.symptom],
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
  const decoded = decodeFile(raw, violations);
  if (decoded === undefined) throw new FixitCasesError(violations);
  const seen = new Set<string>();
  for (const entry of decoded.cases) {
    const where = `case "${entry.id}"`;
    if (seen.has(entry.id)) violations.push(`${where}: declared twice.`);
    seen.add(entry.id);
    violations.push(...checkCase(where, entry, context));
  }
  if (violations.length > 0) throw new FixitCasesError(violations);
  return decoded;
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
    if (shaft.costUnits !== NEW_SHAFT_UNITS) {
      violations.push(`${where}: the new shaft costs ${String(shaft.costUnits)} u; it is 34 in every case.`);
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

function decodeFile(raw: unknown, violations: string[]): FixitCases | undefined {
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
    const one = decodeCase(entry, `cases[${String(index)}]`, violations);
    if (one !== undefined) decoded.push(one);
  }
  return { version: num(raw['version']) ?? 0, cases: decoded };
}

function decodeCase(raw: unknown, at: string, violations: string[]): FixitCase | undefined {
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
    repairs: decodeRepairs(raw['repairs'], where, violations),
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

function decodeRepairs(raw: unknown, where: string, violations: string[]): readonly FixitRepair[] {
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
    repairs.push({
      id: str(entry['id']) ?? `repair-${String(index)}`,
      role: role as RepairRole,
      name: str(entry['name']) ?? '',
      costUnits: num(entry['costUnits']) ?? Number.NaN,
      effect: str(entry['effect']) ?? '',
      patch: decodePatch(entry['patch'], `${where}: repairs[${String(index)}]`, violations),
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
      const allowed = ['ratedSpeedDeltaMps', 'dwellCarCallS', 'dwellHallCallS'];
      for (const key of Object.keys(set)) {
        if (!allowed.includes(key)) violations.push(`${at}: a car patch may not set "${key}".`);
      }
      cars.push({
        carIds: strings(entry['carIds']),
        set: {
          ...(num(set['ratedSpeedDeltaMps']) === undefined ? {} : { ratedSpeedDeltaMps: num(set['ratedSpeedDeltaMps']) }),
          ...(num(set['dwellCarCallS']) === undefined ? {} : { dwellCarCallS: num(set['dwellCarCallS']) }),
          ...(num(set['dwellHallCallS']) === undefined ? {} : { dwellHallCallS: num(set['dwellHallCallS']) }),
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
    ...(addCars.length > 0 ? { addCars } : {}),
  };
}
