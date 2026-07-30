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
            ? '\u0000never'
            : '\u0000never',
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
  it('finds destination-eta separated from eta everywhere the destination carries information', async () => {
    /*
     * **This assertion used to say the opposite, and the change is the fix rather than a
     * concession.** It read *"finds `destination-eta` bit-identical to `eta` at every one of the
     * eight cells"*, and it passed: the shipped Level-0 profile differed from `eta` in two authored
     * fields, weighted `{ waitTime: 1.0 }` exactly as `eta` does, and therefore disclosed a
     * destination all the way into `estimateCost` that changed no decision anywhere in this matrix.
     * A configured, tested, shipped behaviour with no effect on any shipped path — the ninth
     * instance of docs/05-roadmap.md § *Standing requirement*, one level up from code into data.
     * The old assertion named its own successor: *"if a rideTime weight was authored into the
     * shipped profile, that is the fix and this expectation is the thing to update."* T30 authored
     * it, at 0.5, and this is that update.
     *
     * What replaces it is stricter, not looser, because it is asserted in **both** directions.
     *
     * - At seven of the eight cells the shipped profile must now separate from `eta`. A weight that
     *   did nothing would fail here exactly as the old arrangement should have.
     * - At the one named below it must still be identical, and it is named with the mechanism that
     *   makes it blind — measured rather than asserted. Listing it by name means a cell that
     *   *stops* being blind, or a second cell that starts, fails this test too.
     *
     * ## Why that one, and why it is not a weight being too small
     *
     * **`garden-down-peak` is structurally blind.** Every down trip there ends at the lobby, so the
     * destination carries nothing the direction button did not — the mechanism
     * `destinationDisclosure.ts`'s `NEGATIVE_CONTROLS` predicts in advance for the same traffic on
     * Midtown. Measured at this cell's own seed and budget, `destination-eta` is bit-identical to
     * `eta` on 0 of 51 replications at `rideTime` 0.3, at 1.0 **and** at 2.0. Raising the weight
     * fourfold does not move it, which is what tells a blind operating point from a dead seam.
     * `destination-panel` at 1.0 lands in the same class here, independently.
     *
     * **`midtown-up-peak` is on this list's other side, and it is why the shipped weight is 0.5
     * rather than 0.3.** It differs on 0 of 81 replications at `rideTime` 0.3, 5 at 0.5, 6 at 0.7
     * and 16 at 1.0 — so at the bracket's floor the shipped profile would still have been the
     * baseline under another name at a shipped operating point, which is the defect one notch
     * smaller. 0.5 is the smallest bracket point that separates here, and the reason it is not
     * higher is the tail: WT95 at the primary operating point is INDISTINGUISHABLE from the
     * baseline at 0.5 and significantly WORSE at 1.0. The full argument is in
     * `destinationDisclosure.ts` § *Why the shipped default is 0.5*.
     */
    const STILL_IDENTICAL: Readonly<Record<string, string>> = Object.freeze({
      'garden-down-peak':
        'every down trip ends at the lobby, so the destination carries nothing the direction ' +
        'button did not — identical at rideTime 0.3, 1.0 and 2.0 alike',
    });

    const separated: string[] = [];
    const identical: string[] = [];
    for (const result of await matrixOf()) {
      const together = result.identityClasses.some(
        (members) => members.includes('eta') && members.includes('destination-eta'),
      );
      (together ? identical : separated).push(result.cell.id);
    }

    expect(
      identical.sort(),
      'a cell where the shipped destination profile is still the baseline under another name, with ' +
        'no measured mechanism recorded for why. Either the weight stopped biting — the defect T30 ' +
        'closed, returning — or this cell is genuinely blind and belongs in STILL_IDENTICAL with ' +
        'the measurement that shows raising the weight does not move it',
    ).toEqual(Object.keys(STILL_IDENTICAL).sort());

    // The other direction: the exemption list may not outlive its reason, exactly as the two
    // dead-code allowlists are asserted. A cell that starts separating must leave the list.
    expect(separated.length, 'the shipped profile separates from eta at no cell at all').toBeGreaterThan(
      0,
    );
    console.log(
      `destination-eta vs eta: separated at ${separated.length} of ${
        separated.length + identical.length
      } cells (${separated.join(', ')}); still identical at ${identical.join(', ') || 'none'}`,
    );
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
  /*
   * **The 44 `vertical-city-up-peak` pins were regenerated once, deliberately, and § D150 says
   * why.** They are the only pins in this group measured after § D131 made double-deck operation
   * simulated rather than merely configured, and `vertical-city` is the only shipped building that
   * declares double-deck cars. When this check went red it reported **176 field mismatches over 44
   * keys, every one of them at that cell and none at the other seven** — and `n` moved on none of
   * them, so a budget was never fitted to a result.
   *
   * The discipline `regeneratePins.ts` states applies in full: a re-run that disagrees with the
   * file is a question. The answer here was that the *file* was stale, because the simulator
   * stopped being wrong. **A mismatch outside `vertical-city-up-peak` has no such answer waiting
   * for it** — establish which number is right before touching this table.
   */
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
