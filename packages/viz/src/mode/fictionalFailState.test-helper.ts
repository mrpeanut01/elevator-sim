/**
 * A fail state the product does not ship, and a recording it did not produce.
 *
 * ## Why a fictional case rather than a shipped one
 *
 * [`DECISIONS.md` § D134](../../../../DECISIONS.md) established the technique and § D152 applied
 * it a second time: *"a list that looks derived only because the shipped schema happens to fit it
 * is not derived."* The same sentence holds one surface up. A parity check asserted over the four
 * shipped fail states and the four shipped suppression grounds cannot distinguish *"the check is
 * generic"* from *"the check names those eight"*, and § D163 makes that distinction the phase gate.
 *
 * So the members here are ones no `FAIL_STATES` entry, no `awtIsValid` ground and no warning code
 * matches:
 *
 * - **`flooded`** — a fifth fail state, with its own frequency, sentence, diagnosis and lever.
 * - **A suppression reason no `core` branch emits**, so a check that pattern-matched `core`'s
 *   prose would not recognise it.
 * - **A warning code `core` never raises.**
 *
 * Not a `*.test.ts` file, so vitest's `include` does not collect it as a suite of its own — the
 * same convention `src/fixtures.test-helper.ts` and `controls/fictionalSchema.test-helper.ts` use.
 */

import type { FailStateDisclosure, GroundedSummary } from './disclosure.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type VizRecording, type VizSummary } from '../contract/types.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';

/** The state id, exported so an assertion can name what it expects the check to name. */
export const FICTIONAL_FAIL_STATE = 'flooded';

/** A suppression reason no branch of `metrics/summarize.ts` produces. */
export const FICTIONAL_SUPPRESSION_REASON =
  'The lobby fountain overflowed into the pit at 412 s, so every wait recorded after that instant ' +
  'is a wait for a lift that was not running. There is no mean here.';

/** A warning code `core` does not raise. */
export const FICTIONAL_WARNING = 'fountain-overflow-not-simulated';

/**
 * A suppression **ground code** no entry of `core`'s `AWT_INVALID_GROUND_SPECS` produces.
 *
 * The same technique as the three above, pointed at the field `core` gained when the four grounds
 * acquired machine-readable codes. It exists so *"a consumer handed a ground it has no wording for
 * falls back and still shows the reason"* is a **measured** claim: with only the shipped four, every
 * code has a sentence and the fallback branch could never run.
 */
export const FICTIONAL_SUPPRESSION_GROUND = 'flooded-pit';

/**
 * A fifth fail state, complete.
 *
 * Every field is filled with text unique to this fixture, so an assertion that a string survived
 * into Basic is an assertion about *that* string and not about a word the shipped prose also uses.
 */
export function fictionalFailStateReport(
  overrides: Partial<FailStateDisclosure> = {},
): FailStateDisclosure {
  return {
    state: FICTIONAL_FAIL_STATE,
    occurredInDemonstration: true,
    frequency: 'in 50 runs, 37 ended this way.',
    sentence:
      'Flooded means the pit took on water and the shafts below the lobby stopped being usable ' +
      'part-way through the run.',
    diagnosis: 'Run 1, seed 20260729: the water reached B2 at 412 s and shaft main-C stopped there.',
    lever:
      'One dial this stage opens is idle.parkingStrategy — where a free car waits. It is a place ' +
      'to look, never the answer.',
    ...overrides,
  };
}

/**
 * A recording with a suppressed mean whose reason is the fictional one.
 *
 * @param ground the suppression **ground code** to carry beside the reason, or `undefined` for a
 *   recording that carries none — which is every recording this build's `record/recordRun.ts`
 *   produces, because `VizSummary` does not declare the field yet. Both cases are shipped shapes and
 *   both are asserted in `mode/disclosure.test.ts`, so the default is the one that is real today.
 */
export function fictionalRecording(
  overrides: Partial<VizRecording> = {},
  ground?: string | undefined,
): VizRecording {
  const base: VizSummary = fixtureSummary({
    saturated: true,
    awtIsValid: false,
    awtInvalidReason: FICTIONAL_SUPPRESSION_REASON,
    undelivered: 7,
  });
  /*
   * The widening is on the consumer — see `GroundedSummary` in `mode/disclosure.ts`. Written as a
   * spread onto the fixture rather than as an override of it, because `fixtureSummary` takes
   * `Partial<VizSummary>` and the whole point of this parameter is a field `VizSummary` does not
   * have.
   */
  const summary: GroundedSummary =
    ground === undefined ? base : { ...base, awtInvalidGround: ground };
  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: 'fictional',
    seed: '90210111213',
    buildingId: 'fictional-tower',
    buildingName: 'Fictional Tower',
    dispatcherProfileId: 'collective',
    passengerModel: 'destination-dispatch',
    status: 'timed-out',
    startedAt: 0,
    endedAt: 600,
    floors: [
      { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    ],
    shafts: [
      {
        carId: 'main-A',
        bankId: 'main',
        label: 'A',
        startFloorId: 'G',
        startHeightM: 0,
        servedFloorIds: ['G'],
        capacityPersons: 13,
        doorConfig: FIXTURE_DOOR_CONFIG,
        motions: [],
        doorMarks: [],
        occupants: constantSeries(0),
        loadFactor: constantSeries(0),
      },
    ],
    landings: [],
    legs: [],
    progress: {
      waiting: constantSeries(0),
      boardedLegs: constantSeries(0),
      meanWaitS: constantSeries(0),
    },
    summary,
    // Version 7. Empty is the legal value for a fixture that exercises none of the three:
    // the timeline draws one unlabelled band, the decision log draws its empty state, and
    // no shaft is dark. See `contract/types.ts`.
    demandPhases: [],
    decisions: [],
    outOfServiceCarIds: [],
    warnings: [FICTIONAL_WARNING],
    ...overrides,
  };
}
