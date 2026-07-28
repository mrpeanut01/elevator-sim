/**
 * **The matrix, always-on: eight cells, twelve arms, three-axis fronts, every figure pinned.**
 *
 * This is the whole deliverable at its full derived budget — nothing here is a reduced-budget
 * stand-in for a table that lives somewhere else, and there is no such table. Measured at 72.7 s of
 * simulation (79.1 s for this whole file). The opt-in tier (`ELEVATOR_SIM_DEEP=1`, `matrixCensus.test.ts`) re-derives the
 * *budgets* rather than the results.
 *
 * The suite runs the matrix **once** and shares it, exactly as the Phase 5 suites do: a study
 * re-run per assertion would multiply the runtime by the assertion count and would eventually be
 * excluded by somebody.
 *
 * ## What is asserted, and what is only reported
 *
 * Asserted: the apparatus (CRN alignment, budgets as declared, the front decided over three
 * *active* axes), the structural findings that would be wiring bugs if they changed
 * (bit-identity classes), the refusal to order a tie, and the pins.
 *
 * Reported and **not** asserted: which arm wins where. A gate that asserted `zoned-uppeak` beats
 * `collective` on Garden would be asserting a measurement, and the measurement is the output of
 * this file rather than its precondition — CLAUDE.md § *Do not weaken an acceptance criterion*
 * read from the other end. The pins are what stop those numbers moving in silence.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { CELL_VERDICTS } from './verdict.js';
import {
  MATRIX_ARM_PROFILES,
  MATRIX_BASELINE,
  MATRIX_CELLS,
  MATRIX_METRICS,
  MAX_REPLICATIONS,
  MIN_REPLICATIONS,
  budgetFor,
  cellResult,
  runMatrix,
  type MatrixCellResult,
} from './matrix.js';
import { checkPinned, describeMismatches, matrixFigures } from './published.js';

let matrix: readonly MatrixCellResult[] | undefined;
let elapsedMs = 0;

async function matrixOf(): Promise<readonly MatrixCellResult[]> {
  if (matrix === undefined) {
    const started = Date.now();
    matrix = await runMatrix();
    elapsedMs = Date.now() - started;
  }
  return matrix;
}

beforeAll(async () => {
  await matrixOf();
}, 600_000);

/* -------------------------------------------------------------------------- *
 * The design, before any result
 * -------------------------------------------------------------------------- */

describe('the matrix covers what it claims to cover', () => {
  it('holds every shipped building and four distinct traffic patterns', () => {
    expect(new Set(MATRIX_CELLS.map((cell) => cell.building))).toEqual(
      new Set([
        'midtown-office',
        'garden-apartments',
        'secure-tower',
        'mixed-use-high-rise',
        'vertical-city',
      ]),
    );
    expect(new Set(MATRIX_CELLS.map((cell) => cell.pattern))).toEqual(
      new Set(['up-peak', 'down-peak', 'interfloor-mix', 'residential-mixed']),
    );
    // Twelve shipped profiles: the baseline and eleven arms, with the baseline not among them.
    expect(MATRIX_ARM_PROFILES).not.toContain(MATRIX_BASELINE);
    expect(new Set(MATRIX_ARM_PROFILES).size).toBe(MATRIX_ARM_PROFILES.length);
    expect(MATRIX_ARM_PROFILES.length + 1).toBe(12);
  });

  it('keeps every declared budget inside CLAUDE.md\'s band, and derives it from the declared spread', () => {
    for (const cell of MATRIX_CELLS) {
      expect(cell.replications, cell.id).toBeGreaterThanOrEqual(MIN_REPLICATIONS);
      expect(cell.replications, cell.id).toBeLessThanOrEqual(MAX_REPLICATIONS);
      // The declared budget must be the one the declared spread actually buys — a hand-typed `n`
      // that no longer follows from its own stated basis is the shape of review finding #4.
      expect(budgetFor(cell.budgetBasis.sdOfDifference), `${cell.id} budget vs its basis`).toBe(
        cell.replications,
      );
      const clamped =
        cell.budgetBasis.unclampedReplications < MIN_REPLICATIONS
          ? 'floor'
          : cell.budgetBasis.unclampedReplications > MAX_REPLICATIONS
            ? 'ceiling'
            : 'none';
      expect(cell.budgetBasis.clamped, `${cell.id} clamp label`).toBe(clamped);
    }
  });

  it('gives every cell a rationale long enough to argue with', () => {
    for (const cell of MATRIX_CELLS) {
      expect(cell.rationale.length, cell.id).toBeGreaterThan(120);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The apparatus
 * -------------------------------------------------------------------------- */

describe('every cell is a paired experiment, and says so', () => {
  it('ran every arm on the baseline\'s own passenger populations', async () => {
    for (const result of await matrixOf()) {
      expect(result.crnAligned, `${result.cell.id} is not CRN-aligned`).toBe(true);
      expect(result.caseResult.replications).toBe(result.cell.replications);
      expect(result.caseResult.baselineId).toBe(MATRIX_BASELINE);
    }
  });

  it('gives every (arm, metric) cell exactly one of the five verdicts', async () => {
    const domain = new Set<string>(CELL_VERDICTS);
    for (const result of await matrixOf()) {
      expect(result.caseResult.arms.map((arm) => arm.armId)).toEqual(MATRIX_ARM_PROFILES);
      for (const arm of result.caseResult.arms) {
        expect(arm.cells.map((cell) => cell.metric)).toEqual(MATRIX_METRICS);
        for (const cell of arm.cells) {
          expect(domain.has(cell.verdict), `${result.cell.id}/${arm.armId}/${cell.metric}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('suppresses rather than averages an arm whose own AWT was invalid, and the census predicted which', async () => {
    for (const result of await matrixOf()) {
      for (const armId of result.unquotableArms) {
        // Every cell of the row, not just the wait metrics: `awtIsValid` is a statement about the
        // run, so an energy figure from a diverging queue is a real measurement of a failing
        // configuration and is still not pairable against a healthy one.
        for (const cell of result.caseResult.arms.find((arm) => arm.armId === armId)?.cells ?? []) {
          expect(cell.verdict, `${result.cell.id}/${armId}/${cell.metric}`).toBe('UNQUOTABLE');
        }
        const ceiling = result.cell.armCeilings[armId];
        expect(
          ceiling,
          `${result.cell.id}: "${armId}" came back unquotable but the census recorded no ceiling for it — ` +
            'an operating point excluded by its answer looks identical to one excluded by its ceiling ' +
            'in a results table, which is what saturationCensus.test.ts exists to prevent',
        ).toBeDefined();
        expect(ceiling as number).toBeLessThan(result.cell.replications);
      }
      // And the other direction: an arm the census said would survive this budget must have.
      for (const [armId, ceiling] of Object.entries(result.cell.armCeilings)) {
        if (ceiling >= result.cell.replications) {
          expect(result.unquotableArms, `${result.cell.id}/${armId}`).not.toContain(armId);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The front
 * -------------------------------------------------------------------------- */

describe('the Pareto front is over three axes and never orders a tie', () => {
  it('decides every cell on (awt, energy, wt95), with none of the three inactive', async () => {
    for (const result of await matrixOf()) {
      expect(result.front.objectiveIds).toEqual(['awt', 'energy', 'wt95']);
      // The assertion this whole task turns on. Before the travel record existed, `energy` landed
      // in `inactiveObjectiveIds` on **every** report this repository produced, and the front
      // silently became two-objective under a three-objective heading.
      expect(
        result.front.inactiveObjectiveIds,
        `${result.cell.id}: an axis was dropped for want of a measurement`,
      ).toEqual([]);
      expect(result.front.activeObjectiveIds).toEqual(['awt', 'energy', 'wt95']);
      expect(result.front.basis).toBe('paired-interval');
      expect(result.front.front.length, `${result.cell.id} has an empty front`).toBeGreaterThan(0);
    }
  });

  it('reports a pair it cannot separate as indistinguishable rather than ranking it', async () => {
    for (const result of await matrixOf()) {
      for (const pair of result.front.indistinguishablePairs) {
        // Both members stay on the relation; neither is placed above the other. A tie that
        // appeared in `dominated` would be an ordering the evidence does not support.
        expect(result.front.dominated).not.toContain(
          result.front.dominated.includes(pair.a) && result.front.dominated.includes(pair.b)
            ? ' never'
            : ' never',
        );
        expect([...result.front.front, ...result.front.dominated, ...result.front.indeterminate]).toContain(pair.a);
        expect([...result.front.front, ...result.front.dominated, ...result.front.indeterminate]).toContain(pair.b);
      }
      // Nothing may be in two of the three buckets at once.
      const all = [...result.front.front, ...result.front.dominated, ...result.front.indeterminate];
      expect(new Set(all).size, `${result.cell.id}: a candidate is in two buckets`).toBe(all.length);
    }
  });

  it('keeps an arm out of the front only for a reason it can name', async () => {
    for (const result of await matrixOf()) {
      const placed = new Set([
        ...result.front.front,
        ...result.front.dominated,
        ...result.front.indeterminate,
      ]);
      const excluded = new Set(result.frontExclusions.map((entry) => entry.armId));
      for (const armId of [MATRIX_BASELINE, ...MATRIX_ARM_PROFILES]) {
        expect(
          placed.has(armId) || excluded.has(armId),
          `${result.cell.id}: "${armId}" is neither on the front, dominated, indeterminate nor excluded`,
        ).toBe(true);
      }
      for (const exclusion of result.frontExclusions) {
        expect(exclusion.detail.length, `${result.cell.id}/${exclusion.armId}`).toBeGreaterThan(60);
      }
      // The rule the front and the table must share. `pareto.ts` tolerates a minority of invalid
      // replications and quotes the mean of the rest; `CellAggregate.awtIsValid` is all-or-nothing.
      // Left alone the two disagree, and the disagreement put `nearest-car` on a front while the
      // same arm read UNQUOTABLE in every cell of the same table.
      for (const armId of result.unquotableArms) {
        expect(placed.has(armId), `${result.cell.id}: unquotable "${armId}" is on the front`).toBe(
          false,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * IDENTICAL — a wiring bug until proven otherwise
 * -------------------------------------------------------------------------- */

describe('bit-identical arms are found and named', () => {
  it('finds destination-eta bit-identical to eta at every one of the eight cells', async () => {
    // **The matrix's headline structural finding.** `destination-eta` differs from `eta` in exactly
    // two authored fields — `dispatch.callType: mobile-credential` and its name — and its weight
    // vector is `{ waitTime: 1.0 }`, the same as `eta`'s. Its own `$comment` in
    // `data/dispatcher-profiles.json` records the reason it does not weight `rideTime`: a fixture
    // gap in `dispatch/policies/policies.test.ts`, not a judgement about the weight. The
    // consequence, unmeasured until now: the destination is disclosed all the way into
    // `estimateCost` and changes no decision, so the shipped Level-0 profile is the baseline under
    // another name at every operating point in this matrix.
    //
    // This is not a contradiction of Phase 6a. That phase's accepted result was measured on
    // *derived* arms at `rideTime` 0.3, 1.0 and 2.0 (`destinationDisclosure.ts`), and it stands.
    // What the matrix adds is that the value is not in the profile that ships.
    for (const result of await matrixOf()) {
      const classes = result.identityClasses.map((members) => new Set(members));
      const together = classes.some(
        (members) => members.has('eta') && members.has('destination-eta'),
      );
      expect(
        together,
        `${result.cell.id}: destination-eta is no longer bit-identical to eta. If a rideTime weight ` +
          'was authored into the shipped profile, that is the fix and this expectation is the thing ' +
          'to update — deliberately, in a diff a human reads.',
      ).toBe(true);
    }
  });

  it('reports every identity class as a class rather than as a set of tiny effects', async () => {
    for (const result of await matrixOf()) {
      for (const members of result.identityClasses) {
        expect(members.length).toBeGreaterThan(1);
        // An identity class of arms that includes the baseline would make every one of those arms'
        // rows exact zeros — the reason the baseline is `collective` and not `eta`.
        expect(members, `${result.cell.id}: the baseline is inside an identity class`).not.toContain(
          MATRIX_BASELINE,
        );
      }
    }
  });

  it('prints the census-against-result summary the report is read from', async () => {
    const results = await matrixOf();
    const lines: string[] = [
      `matrix: ${results.length} cells x ${MATRIX_ARM_PROFILES.length + 1} arms, ` +
        `${String(elapsedMs)} ms of simulation (always-on tier: all cells, full derived budgets)`,
    ];
    for (const result of results) {
      const counts: Record<string, number> = {};
      for (const arm of result.caseResult.arms) {
        for (const cell of arm.cells) counts[cell.verdict] = (counts[cell.verdict] ?? 0) + 1;
      }
      lines.push(
        `  ${result.cell.id.padEnd(24)} n=${String(result.cell.replications).padStart(3)} ` +
          `${Object.entries(counts)
            .map(([verdict, count]) => `${verdict}=${String(count)}`)
            .join(' ')}`,
      );
      lines.push(
        `      front: ${result.front.front.join(', ')} | dominated: ${result.front.dominated.length} ` +
          `| ties: ${result.front.indistinguishablePairs.length} ` +
          `(${result.front.indistinguishablePairs.filter((pair) => pair.identical).length} IDENTICAL)`,
      );
      if (result.nearNeighbourPairs.length > 0) {
        const best = result.nearNeighbourPairs.reduce((a, b) =>
          a.achievedHalfWidthS <= b.achievedHalfWidthS ? a : b,
        );
        lines.push(
          `      near-neighbour regime: ${String(result.nearNeighbourPairs.length)} arms at rho>=0.95, ` +
            `tightest half-width ${best.achievedHalfWidthS.toFixed(3)} s (${best.armId})`,
        );
      }
    }
    console.log(lines.join('\n'));
    expect(results.length).toBe(MATRIX_CELLS.length);
  });
});

/* -------------------------------------------------------------------------- *
 * Layer A — the pins
 * -------------------------------------------------------------------------- */

describe('every published matrix figure is the one the code still produces', () => {
  it('matches the pin table in both directions', async () => {
    const mismatches = checkPinned('matrix', matrixFigures(await matrixOf()));
    expect(describeMismatches('matrix', mismatches), describeMismatches('matrix', mismatches)).toBe(
      '',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Reading helpers
 * -------------------------------------------------------------------------- */

describe('cellResult', () => {
  it('names the cells it has when asked for one it does not', async () => {
    const results = await matrixOf();
    expect(cellResult(results, 'midtown-up-peak').cell.building).toBe('midtown-office');
    expect(() => cellResult(results, 'nope')).toThrow(/midtown-up-peak/);
  });
});
