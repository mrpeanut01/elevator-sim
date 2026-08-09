/**
 * The commitment is derived, and the keys the shipped panels draw from are pinned — issue #104.
 *
 * Two halves, and only the first is about this module in isolation.
 *
 * The first is that the function is **total over the table** and discriminates: every key
 * `surface.ts` declares gets an answer or a stated silence, and all four answers are reached by
 * fields that really exist. A classifier returning one value for everything would typecheck, read as
 * derived, and tell every panel the same thing — which is the wrong-note defect this fix is for.
 *
 * The second is the one a reader of issue #104 should look at first: the three cases the report
 * treats as one. `viewer.dispatcherId` under a list that runs the shift, `viewer.levers` under a
 * toggle that does not, and `viewer.dispatcherSpec` under a slider that cannot — three different
 * sentences, asserted here rather than left implicit in a ternary, so that a re-scoped field is a
 * red suite instead of a sentence that quietly stops being drawn. `scope.test.ts` is what makes the
 * table itself true — it moves each control and compares the legs — so this file inherits a pinning
 * rather than restating one.
 */

import { describe, expect, it } from 'vitest';

import { COMMITMENTS, commitmentOf, type Commitment } from './commitment.js';
import { SCOPE_OF } from './surface.js';
import type { SurfaceKey } from './types.js';

const KEYS = Object.keys(SCOPE_OF) as readonly SurfaceKey[];

describe('the classification is total over the table', () => {
  it('answers, or is silent for a reason the table states', () => {
    for (const key of KEYS) {
      const entry = SCOPE_OF[key];
      for (const wiring of ['runs-the-shift', 'writes-only'] as const) {
        const answer = commitmentOf(key, wiring);
        if (entry?.kind === 'output') {
          expect(answer, `${key} is an output and no control moves it`).toBeUndefined();
          continue;
        }
        expect(COMMITMENTS, `${key} × ${wiring} fell out of the union`).toContain(answer);
      }
    }
  });

  it('reaches all four answers from fields that really exist', () => {
    /*
     * The discrimination check, in `permits.test.ts`'s shape and for its reason: a classifier whose
     * every input lands on one answer is a constant wearing a switch. Counted rather than
     * spot-checked, so a table that lost its last `latent` row is red here and not in a panel.
     */
    const seen = new Set<Commitment>();
    for (const key of KEYS) {
      for (const wiring of ['runs-the-shift', 'writes-only'] as const) {
        const answer = commitmentOf(key, wiring);
        if (answer !== undefined) seen.add(answer);
      }
    }
    for (const answer of COMMITMENTS) {
      expect(seen.has(answer), `no field in the table is ${answer}`).toBe(true);
    }
  });

  it('lets the wiring decide only where the field left it open', () => {
    /*
     * The parameter earns its place on the `control` arm and may not reach the other two. A draft
     * whose answer moved with the wiring would let an editor claim its sliders re-run the shift by
     * passing a different word — the sentence deciding the fact instead of the other way round.
     */
    for (const key of KEYS) {
      const entry = SCOPE_OF[key];
      if (entry?.kind === 'control' && entry.scope !== 'presentation') continue;
      expect(commitmentOf(key, 'runs-the-shift'), key).toBe(commitmentOf(key, 'writes-only'));
    }
  });

  it('says nothing about a key the table does not carry', () => {
    // Not a hypothetical guard: `SurfaceKey` is a template-literal union, so any `viewer.*` string
    // typechecks here. The honest answer for one nobody declared is silence, not a default.
    expect(commitmentOf('viewer.notAFieldAnybodyDeclared', 'writes-only')).toBeUndefined();
  });
});

describe('the three behaviours the report treats as one — GitHub issue #104', () => {
  it('has the rail’s three lists discard the day on screen', () => {
    /*
     * The reporter's premise inverted. These three are what the right rail's cards write, and each
     * card calls `context.runShift()` straight after the write — so the honest note beside them is
     * *this discards the day on screen*, and **not** the *locked for this shift* the issue asks for.
     */
    expect(commitmentOf('viewer.dispatcherId', 'runs-the-shift')).toBe('re-runs-now');
    expect(commitmentOf('viewer.pattern', 'runs-the-shift')).toBe('re-runs-now');
    expect(commitmentOf('viewer.buildingId', 'runs-the-shift')).toBe('re-runs-now');
  });

  it('has the group levers and the selector apply to the next run', () => {
    /*
     * The case the report gets exactly right, and the reason its wording is drawn verbatim on these
     * two blocks. Both write a field `shiftRunConfigOf` reads and neither asks for a run, so the
     * shift on screen is genuinely unaffected until something else runs one.
     */
    expect(commitmentOf('viewer.levers', 'writes-only')).toBe('next-run');
    expect(commitmentOf('viewer.selectorSpec', 'writes-only')).toBe('next-run');
  });

  it('has all four editor working copies stay drafts', () => {
    // The control the reporter describes moving. A draft is not an inert control and the note beside
    // each editor may not say it is one — `scope/types.ts#LatentEntry` makes that distinction, and
    // `realisedBy` is what stops a draft being indistinguishable from a dead seam.
    expect(commitmentOf('viewer.dispatcherSpec', 'writes-only')).toBe('draft');
    expect(commitmentOf('viewer.patternSpec', 'writes-only')).toBe('draft');
    expect(commitmentOf('viewer.machineSpec', 'writes-only')).toBe('draft');
    expect(commitmentOf('viewer.buildingSpec', 'writes-only')).toBe('draft');
  });

  it('keeps the four editor pointers out of every note', () => {
    /*
     * The negative control. `editing*Id` sits next to `*Spec` in the table and is `presentation` —
     * issue #114's whole subject — so a panel that reached for the pointer instead of the draft
     * would draw a note about the wrong field and still be green. Here it is not.
     */
    for (const key of [
      'viewer.editingDispatcherId',
      'viewer.editingPatternId',
      'viewer.editingClassId',
      'viewer.editingBuildingId',
    ] as const) {
      expect(commitmentOf(key, 'writes-only'), key).toBe('shown-only');
    }
  });
});
