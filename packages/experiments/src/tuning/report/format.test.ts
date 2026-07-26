/**
 * The printed page — the last place a tuning result can be misread.
 *
 * These assertions are about the **text**, not about the model behind it. A report whose data model
 * refuses to rank an indistinguishable pair, and whose formatter prints the two means next to each
 * other anyway, has failed in exactly the way this project exists to avoid: the reader is not going
 * to consult the model.
 *
 * The load-bearing test is {@link describe `never a bare mean`}. It walks every logical field of a
 * rendered page — reassembling wrapped lines first, so it tests the field and not where the field
 * happened to wrap — and requires each one that names an objective to carry an interval or an
 * explicit refusal to report one. That is the property, stated over the artefact a human reads,
 * rather than over the value a human never sees.
 */

import { describe, expect, it } from 'vitest';

import { SUPPRESSED_LABEL } from '../../reports/format.js';
import { buildTuningReport } from './build.js';
import {
  NOT_COMPARABLE_LABEL,
  formatHoldout,
  formatIndistinguishable,
  formatParetoFront,
  formatSeedSets,
  formatTuningReport,
  formatWinners,
} from './format.js';
import { TUNING_OBJECTIVES, bestByObjective } from './pareto.js';
import type { CandidateEvaluation, TuningReport } from './types.js';
import { HOLDOUT_SEEDS, TUNING_SEEDS, candidate, wobble } from './fixtures.test-helper.js';

const jitter = (values: readonly number[], size: number): readonly number[] =>
  values.map((value, index) => value + (index % 2 === 0 ? size : -size));

const REF_TUNING = wobble(16, TUNING_SEEDS.length);
const REF_HOLDOUT = wobble(16.4, HOLDOUT_SEEDS.length);
const REF_ENERGY = wobble(100, TUNING_SEEDS.length, 3);

const reference = candidate({
  candidateId: 'predictive-balanced',
  tuningAwt: REF_TUNING,
  holdoutAwt: REF_HOLDOUT,
  tuningEnergy: REF_ENERGY,
  holdoutEnergy: REF_ENERGY,
});

function offset(
  candidateId: string,
  tuningOffset: number,
  holdoutOffset: number,
  energyOffset = 0,
): CandidateEvaluation {
  return candidate({
    candidateId,
    tuningAwt: jitter(REF_TUNING.map((value) => value + tuningOffset), 0.1),
    holdoutAwt: jitter(REF_HOLDOUT.map((value) => value + holdoutOffset), 0.1),
    tuningEnergy: REF_ENERGY.map((value) => value + energyOffset),
    holdoutEnergy: REF_ENERGY.map((value) => value + energyOffset),
    parameters: { 'idle.repositionThresholdS': 2, 'weights.waitTime': 1.2 },
  });
}

const REPORT: TuningReport = buildTuningReport({
  title: 'Round 4 — predictive-balanced neighbourhood, Garden Apartments',
  reference,
  candidates: [
    offset('c-honest', -2, -2),
    offset('c-overfit', -2, 0),
    offset('c-near', 0, 0),
    offset('c-green', 1, 1, -20),
  ],
});

const PAGE = formatTuningReport(REPORT);

const OBJECTIVE_LABELS = TUNING_OBJECTIVES.map((objective) => objective.label);
const flat = (text: string): string => text.replace(/\s+/g, ' ');

/**
 * The page split into logical fields.
 *
 * A field starts on a line indented by exactly two spaces and continues through every line indented
 * further. Testing a field rather than a line is what makes the assertions independent of where a
 * sentence happened to wrap — the alternative breaks on every wording change and proves nothing.
 */
function fieldsOf(page: string): readonly string[] {
  const fields: string[] = [];
  let current: string[] = [];
  for (const line of page.split('\n')) {
    if (/^ {2}\S/.test(line)) {
      if (current.length > 0) fields.push(current.join(' '));
      current = [line];
    } else if (/^ {3,}\S/.test(line) && current.length > 0) {
      current.push(line.trim());
    } else {
      if (current.length > 0) fields.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) fields.push(current.join(' '));
  return fields;
}

/* -------------------------------------------------------------------------- *
 * Never a bare mean
 * -------------------------------------------------------------------------- */

describe('never a bare mean', () => {
  it('gives every objective field an interval or an explicit refusal to report one', () => {
    const offenders = fieldsOf(PAGE)
      .filter((entry) => OBJECTIVE_LABELS.some((label) => entry.includes(label)))
      .filter(
        (entry) =>
          !entry.includes('CI [') &&
          !entry.includes(SUPPRESSED_LABEL) &&
          !entry.includes(NOT_COMPARABLE_LABEL),
      );

    expect(offenders).toEqual([]);
  });

  it('checks that the filter above actually matched something', () => {
    const objectiveFields = fieldsOf(PAGE).filter((entry) =>
      OBJECTIVE_LABELS.some((label) => entry.includes(label)),
    );
    expect(objectiveFields.length).toBeGreaterThan(20);
  });

  it('prints the bounds, the half-width, n and the quantile family on a candidate value', () => {
    expect(flat(PAGE)).toContain(
      'AWT (mean wait) 16.000 s · 95% CI [15.724, 16.276] · ±0.276 · n=12 · t(11)',
    );
  });

  it('prints the noise floor beside every difference', () => {
    const differenceFields = fieldsOf(PAGE).filter((entry) => entry.includes('· difference '));
    expect(differenceFields.length).toBeGreaterThan(0);
    for (const entry of differenceFields) expect(entry).toContain('noise floor');
  });

  it('refuses to print a number for a suppressed objective', () => {
    const saturated: CandidateEvaluation = {
      ...reference,
      candidateId: 'saturated',
      tuning: {
        ...reference.tuning,
        observations: reference.tuning.observations.map((entry, index) =>
          index === 0
            ? { ...entry, saturated: true, awtIsValid: false, awtInvalidReason: 'diverging queue' }
            : entry,
        ),
      },
    };
    const page = formatTuningReport(
      buildTuningReport({ reference, candidates: [saturated] }),
    );
    const suppressedFields = fieldsOf(page).filter(
      (entry) => entry.includes('AWT (mean wait)') && entry.includes(SUPPRESSED_LABEL),
    );

    expect(suppressedFields.length).toBeGreaterThan(0);
    for (const entry of suppressedFields) {
      expect(entry).not.toMatch(/AWT \(mean wait\)\s+−?\d+\.\d+/);
    }
    // An arm nothing could be compared against is not excluded from the front — nothing measured it
    // — so "ON FRONT" has to arrive with the reason attached, or it reads as an endorsement of a
    // configuration whose queues diverged.
    expect(flat(page)).toContain('ON FRONT saturated');
    expect(flat(page)).toContain('absence of evidence rather than evidence of absence');
  });

  it('never offers a replication count for an effect indistinguishable from exactly zero', () => {
    expect(PAGE).not.toMatch(/would need n≈\d{7,}/);
    expect(PAGE).not.toMatch(/e\+\d\d/);
    expect(flat(PAGE)).toContain('no affordable budget resolves this');
  });
});

/* -------------------------------------------------------------------------- *
 * Indistinguishability
 * -------------------------------------------------------------------------- */

describe('indistinguishable candidates are reported, not ranked', () => {
  it('has a section that names the pairs and says they are not ranked', () => {
    expect(PAGE).toContain('INDISTINGUISHABLE — reported, not ranked');
    expect(flat(PAGE)).toContain('predictive-balanced ~ c-near');
    expect(flat(PAGE)).toContain('no rank order between them is supportable');
  });

  it('prints INDISTINGUISHABLE before any number on the line', () => {
    const entry = fieldsOf(PAGE).find(
      (line) => line.includes('AWT (mean wait)') && line.includes('INDISTINGUISHABLE'),
    );
    expect(entry).toBeDefined();
    const verdictAt = (entry as string).indexOf('INDISTINGUISHABLE');
    const numberAt = (entry as string).search(/[−-]?\d+\.\d+/);
    expect(verdictAt).toBeLessThan(numberAt);
  });

  it('distinguishes a bit-identical pair from one merely inside the noise floor', () => {
    const twin = candidate({
      candidateId: 'twin',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      tuningEnergy: REF_ENERGY,
      holdoutEnergy: REF_ENERGY,
    });
    const report = buildTuningReport({ reference, candidates: [twin] });
    const text = flat(formatIndistinguishable(report.front.indistinguishablePairs));

    expect(text).toContain('IDENTICAL — bit-identical runs');
    expect(text).toContain('No replication budget resolves this');
  });

  it('says so plainly when no pair was inside the floor', () => {
    const clear = buildTuningReport({ reference, candidates: [offset('c-fast', -5, -5)] });
    expect(flat(formatIndistinguishable(clear.front.indistinguishablePairs))).toContain(
      'No pair of candidates was inside the noise floor',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The front and the winners
 * -------------------------------------------------------------------------- */

describe('the front', () => {
  it('marks every candidate ON FRONT, DOMINATED or UNPLACEABLE, and names the dominators', () => {
    const text = formatParetoFront(
      REPORT.front,
      new Map([REPORT.reference, ...REPORT.candidates].map((summary) => [summary.candidateId, summary])),
    );

    expect(text).toContain('ON FRONT');
    expect(text).toContain('DOMINATED');
    expect(flat(text)).toMatch(/DOMINATED\s+\S+\s+dominated by /);
  });

  it('names a dropped axis rather than quietly reporting a smaller front', () => {
    const noEnergy = buildTuningReport({
      reference: candidate({ candidateId: 'ref', tuningAwt: REF_TUNING, holdoutAwt: REF_HOLDOUT }),
      candidates: [
        candidate({
          candidateId: 'c',
          tuningAwt: jitter(REF_TUNING.map((value) => value - 2), 0.1),
          holdoutAwt: jitter(REF_HOLDOUT.map((value) => value - 2), 0.1),
        }),
      ],
    });
    const text = flat(formatParetoFront(noEnergy.front, new Map()));

    expect(text).toContain('axes dropped');
    expect(text).toContain('not evidence they are unaffected');
  });

  it('states that members are not ranked against each other', () => {
    expect(flat(PAGE)).toContain('are not ranked against each other');
  });
});

describe('best by objective', () => {
  it('declares NO SINGLE WINNER and names the whole leading group', () => {
    const text = flat(formatWinners(REPORT.winners));
    expect(text).toContain('NO SINGLE WINNER');
    expect(text).toContain('cannot be separated from');
  });

  it('names a winner where one candidate beats every rival', () => {
    const report = buildTuningReport({
      reference,
      candidates: [offset('c-fast', -5, -5)],
    });
    const text = flat(formatWinners(report.winners));

    expect(text).toContain('c-fast');
    expect(text).toContain('beats every other candidate');
    expect(text).not.toContain('NO SINGLE WINNER · AWT');
  });

  /*
   * The page's headline "who won" line, on the one input where the arg-min and the paired interval
   * disagree. Before the fix this rendered as `AWT (mean wait) leader · 15.000 s …` with the reason
   * "leader beats every other candidate … with a paired interval excluding zero", for a candidate a
   * rival beat by 1.0 s on every seed the two shared.
   */
  it('prints who beat the point-estimate leader instead of crowning it', () => {
    const shared = wobble(15, 12);
    const leader = candidate({ candidateId: 'leader', tuningAwt: shared });
    const rival = candidate({
      candidateId: 'rival',
      tuningAwt: [...shared.map((value) => value - 1), ...wobble(20, 12)],
      tuningSeeds: [...TUNING_SEEDS, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212],
    });
    const text = flat(formatWinners(bestByObjective({ candidates: [leader, rival] })));

    expect(text).toContain('NO SINGLE WINNER');
    expect(text).toContain('BEATEN on shared seeds by rival');
    expect(text).not.toContain('beats every other candidate');
  });
});

/* -------------------------------------------------------------------------- *
 * Holdout
 * -------------------------------------------------------------------------- */

describe('the holdout comparison', () => {
  it('prints tuning and holdout on the same line, in that order', () => {
    const entry = fieldsOf(PAGE).find(
      (line) => line.includes('c-overfit · AWT (mean wait)') && line.includes('tuning'),
    );
    expect(entry).toBeDefined();
    expect((entry as string).indexOf('tuning')).toBeLessThan((entry as string).indexOf('holdout'));
  });

  it('flags the overfitted candidate in capitals, with the shrinkage interval', () => {
    const text = flat(formatHoldout(REPORT.holdout));
    expect(text).toContain('OVERFITTED');
    expect(text).toContain('shrinkage +2.000 s · 95% CI');
    expect(text).toContain('retained 0%');
  });

  it('does not offer a retained percentage where there was no gain to retain', () => {
    const entry = fieldsOf(PAGE).find((line) => line.startsWith('  c-near · AWT (mean wait)'));
    expect(entry).toBeDefined();
    expect(entry as string).not.toContain('retained');
  });

  it('says the guard was not exercised when there is no holdout set', () => {
    const report = buildTuningReport({
      reference: candidate({ candidateId: 'ref', tuningAwt: REF_TUNING, tuningEnergy: REF_ENERGY }),
      candidates: [
        candidate({
          candidateId: 'c',
          tuningAwt: jitter(REF_TUNING.map((value) => value - 2), 0.1),
          tuningEnergy: REF_ENERGY,
        }),
      ],
    });
    const page = formatTuningReport(report);

    expect(flat(page)).toContain(
      'holdout NONE — the tuning-set numbers below are not validated against traffic the search never saw',
    );
    expect(flat(page)).toContain('NO HOLDOUT SET');
    expect(flat(page)).toContain('nothing on this page meets the Phase 7 acceptance criterion');
    expect(flat(page)).toContain('c · AWT (mean wait) UNQUOTABLE');
  });

  it('does not claim there is no holdout set on a page that carries one', () => {
    const page = flat(
      formatTuningReport(
        buildTuningReport({
          reference,
          candidates: [
            offset('c-overfit', -2, 0),
            candidate({
              candidateId: 'no-hold',
              tuningAwt: jitter(REF_TUNING.map((value) => value - 1), 0.1),
              tuningEnergy: REF_ENERGY,
            }),
          ],
        }),
      ),
    );

    // The two claims that used to appear on the same page.
    expect(page).not.toContain('NO HOLDOUT SET');
    expect(page).toContain('NO HOLDOUT REPLICATIONS FOR: no-hold');
    expect(page).toContain('hold-b · 12 replications');
    expect(page).toContain('holdout seed set');
    expect(page).toContain('UNPLACEABLE no-hold');
    expect(page).toContain('has no replications on the holdout seed set');
  });

  it('says a holdout set validated nothing when the reference never ran one', () => {
    const page = flat(
      formatTuningReport(
        buildTuningReport({
          // The reference has tuning replications only; the candidate has both. Every paired
          // holdout comparison then needs an arm that does not exist.
          reference: candidate({
            candidateId: 'ref',
            tuningAwt: REF_TUNING,
            tuningEnergy: REF_ENERGY,
          }),
          candidates: [offset('c', -2, -2)],
        }),
      ),
    );

    expect(page).toContain('no candidate could be compared against ref on it');
    expect(page).toContain('Nothing on this page meets the Phase 7 acceptance criterion');
    // Not the sentence for a page that ran no holdout set at all: it ran one, and it validated
    // nothing, and those are different findings.
    expect(page).not.toContain('No holdout set was run');
  });
});

/* -------------------------------------------------------------------------- *
 * Accounting, ordering, determinism
 * -------------------------------------------------------------------------- */

describe('the page as an artefact', () => {
  it('prints the replication count of both seed sets', () => {
    expect(flat(formatSeedSets(REPORT.seedSets))).toContain('tune-a · 12 replications');
    expect(flat(formatSeedSets(REPORT.seedSets))).toContain('hold-b · 12 replications');
    expect(flat(formatSeedSets(REPORT.seedSets))).toContain('DISJOINT');
  });

  it('prints candidates in the order supplied, on the front and off it', () => {
    const order = ['predictive-balanced', 'c-honest', 'c-overfit', 'c-near', 'c-green'];
    const positions = order.map((id) => PAGE.indexOf(`ON FRONT    ${id}`) + PAGE.indexOf(`DOMINATED   ${id}`));
    expect(positions.every((position) => position > 0)).toBe(true);

    const frontSection = PAGE.slice(PAGE.indexOf('PARETO FRONT'));
    const seen = order.filter((id) => frontSection.includes(id));
    const indices = seen.map((id) => frontSection.indexOf(`   ${id}\n`));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it('renders byte-identically twice — no clock, no locale, no environment', () => {
    expect(formatTuningReport(REPORT)).toBe(PAGE);
  });

  it('contains no scalarized score', () => {
    expect(PAGE.toLowerCase()).not.toContain('overall score');
    expect(PAGE.toLowerCase()).not.toContain('weighted total');
    expect(flat(PAGE)).toContain('never combined into a score');
    expect(flat(PAGE)).toContain('no objective weighting is applied anywhere above');
  });

  it('prints the parameter vector of each candidate, with keys sorted', () => {
    expect(flat(PAGE)).toContain(
      'parameters idle.repositionThresholdS=2, weights.waitTime=1.2',
    );
  });

  it('leads the conclusion with the held-out result, which is the acceptance criterion', () => {
    const conclusion = flat(PAGE.slice(PAGE.indexOf('CONCLUSION')));
    expect(conclusion).toContain('held-out seeds');
    expect(conclusion).toContain('c-honest');
  });
});
