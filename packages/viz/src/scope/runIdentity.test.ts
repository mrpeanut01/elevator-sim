/**
 * One derivation of *"can this run be reproduced elsewhere?"*, and the hand-written copy it replaces
 * — S5.
 *
 * The load-bearing test is the last one: `runIdentityIssues(state, resources, 'ranked')` must refuse
 * **exactly** the states `dev/main.ts#provenanceLineOf` refuses. Not a superset and not a subset,
 * over a matrix of states rather than at one point.
 *
 * Both directions are failures with a victim:
 *
 * - **Stricter than provenance** and the submit path refuses a run a CLI line would have reproduced,
 *   so an honest player is told their run cannot be posted and never finds out why.
 * - **Looser than provenance** and the client posts a run the server cannot reproduce. The server
 *   rejects it as a forgery — which is the one place this product accuses somebody of cheating, and
 *   it would be accusing them of a client bug.
 *
 * ## What GitHub issue #129 added, and why the file more than doubled
 *
 * The matrix below is a **list**, and a list is the thing this repository has now had to widen by
 * hand six times (§ D213). It caught nothing when `viewer.commissioning`, `viewer.calendar` and
 * `viewer.selectorSpec` landed, because a state nobody added is a state nobody checks — and
 * `runIdentity.ts`'s own docstring claimed the gap was already mechanised: *"A field the table
 * declares a control and this function does not know is a **red test**, not a silent pass —
 * `runIdentity.test.ts` asserts the two agree."* **No such assertion existed.** Nothing in this
 * package referred to `carriesState` at all, and three fields reached a shipped submit button
 * unasked about, where the server answered `metrics-do-not-reproduce` — this product's one
 * accusation, aimed at a player who used a shipped feature.
 *
 * So three things are asserted below that were not:
 *
 * 1. **Exhaustiveness, both ways** — `CARRY_CHECKS`' key set against `fieldsAnsweredFor('ranked')`,
 *    the mode every shipped caller passes. A field with no answer is red; an answer for a field
 *    nobody asks about is red. The other seven modes get the weaker statement they can support —
 *    every field they ask about and nothing answers must be one the artefacts *do* carry — which is
 *    the same property with the reason attached rather than a gap left unsaid.
 * 2. **Every control, driven, both arms** — `probes.test-helper.ts`'s own pair per field, which
 *    `surface.test.ts` already requires to exist and `scope.test.ts` already proves moves the legs.
 *    Arm one must be accepted and arm two must be refused **naming that key**. A field added
 *    tomorrow is red the day it lands, because its probe is compulsory and its answer is now too.
 * 3. **The legs, not the parameter string** — the artefact is driven round the loop and the runs are
 *    compared on `legs`. That is the standing requirement, and it is the clause that separates *this
 *    refusal is correct* from *this refusal exists*: a test asserting a field is absent from a query
 *    string would pass against a field nothing reads.
 *
 * ## The server half, and why it is a source-text read rather than an import
 *
 * § D215 § 3: **`viz` may not depend on `server`.** `menu/client.test.ts` reads the server's source
 * for its password bounds for exactly this reason, and the same method is used here — the client's
 * *"which fields can travel"* is asserted against `packages/server/src/leaderboard/submission.ts`'s
 * own text, so the refusal is pinned by the wire's real shape rather than by a sentence about it
 * (§ D227). The day `RunSubmission` grows a field for one of these, that assertion goes red and
 * tells whoever grew it to come back and delete the refusal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
import { commissionableClasses } from '../commissioning/types.js';
import {
  deepLinkDefaultsOf,
  deepLinkSearchOf,
  deepLinkStateOf,
  provenanceLineOf,
  shareLinkOf,
} from '../dev/main.js';
import type { ViewerState } from '../dev/state.js';
import { CALENDAR_PERIODS, periodOnDays } from '../shift/calendar.js';
import { nextDay } from '../shift/week.js';

import { PROBES, baseState, legsOf, RESOURCES } from './probes.test-helper.js';
import {
  CARRY_CHECKS,
  EXPRESSIBLE_IN_A_SELECTION,
  fieldsAnsweredFor,
  runIdentityIssues,
} from './runIdentity.js';
import { SCOPE_OF } from './surface.js';
import { PLAY_MODES, type SurfaceKey } from './types.js';

/**
 * The states the two implementations are compared over.
 *
 * One per refusal `provenanceLineOf` can produce, plus the clean case and two that must **not** be
 * refused — a moved seed and a different shipped dispatcher — because a predicate that refused
 * everything would agree with a predicate that refused everything.
 */
function matrix(): readonly { readonly name: string; readonly state: ViewerState }[] {
  const base = baseState();
  return [
    { name: 'clean, day 1, shipped everything', state: base },
    { name: 'a different shipped dispatcher', state: { ...base, dispatcherId: 'nearest-car' } },
    { name: 'a moved seed', state: { ...base, seed: 987654321n } },
    { name: 'a longer shift', state: { ...base, shiftLengthS: 1800 } },
    { name: 'a building only this browser has', state: { ...base, buildingId: 'my-tower' } },
    { name: 'a dispatcher only this browser has', state: { ...base, dispatcherId: 'my-profile' } },
    { name: 'a saved arrival pattern', state: { ...base, pattern: 'my-pattern' } },
    { name: 'day 2 — the building has grown', state: { ...base, week: nextDay(base.week) } },
    { name: 'a car held out of service', state: { ...base, outOfServiceCarIds: ['main-b'] } },
    {
      name: 'a group lever moved off its default',
      state: { ...base, levers: { ...DEFAULT_LEVERS, express: true } },
    },
    /* Issue #129's three, so the provenance agreement below covers them too. */
    { name: 'a commissioned fabric', state: commissionedState() },
    { name: 'a calendar period in effect today', state: calendaredState() },
    { name: 'the weight-set selector switched on', state: selectorState() },
  ];
}

/* -------------------------------------------------------------------------- *
 * Issue #129's three states, built the way the shipped screens build them
 * -------------------------------------------------------------------------- */

/**
 * Midtown's main bank with one more shaft than it ships.
 *
 * The building is `midtown-office` rather than the base state's Garden Apartments for the measured
 * reason `probes.test-helper.ts` gives at this control's own probe: two hydraulic cars answer
 * everything Garden Apartments produces at 900 s, so a third is never assigned and the legs would be
 * identical — the probe would report a live control dead, and the legs comparison below would be
 * measuring the building rather than the fabric.
 */
function commissionedState(): ViewerState {
  const base = { ...baseState(), buildingId: 'midtown-office', shiftLengthS: 1800 };
  const authored = RESOURCES.entries.find((entry) => entry.config.id === 'midtown-office')?.config;
  if (authored === undefined) throw new Error('midtown-office is not loaded');
  const classes = commissionableClasses(RESOURCES.elevatorSpecs);
  const asBuilt = asBuiltChoices(authored, classes);
  const main = asBuilt[0];
  if (main === undefined) throw new Error('midtown-office declares no bank');
  return { ...base, commissioning: withBankChoice(asBuilt, { ...main, shafts: main.shafts + 1 }) };
}

/** `quarter-end` over the whole week, which puts it in effect on day 1 — the probe's own arm. */
function calendaredState(): ViewerState {
  return {
    ...baseState(),
    buildingId: 'midtown-office',
    shiftLengthS: 1800,
    calendar: periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7),
  };
}

/** The selector switched from what every shipped profile declares (`off`) to `fuzzy`. */
function selectorState(): ViewerState {
  const base = { ...baseState(), buildingId: 'midtown-office' };
  return { ...base, selectorSpec: { ...base.selectorSpec, policy: 'fuzzy' } };
}

describe('the predicate answers the question it claims to', () => {
  it('accepts a day-1 run on shipped data', () => {
    expect(runIdentityIssues(baseState(), RESOURCES)).toEqual([]);
    expect(runIdentityIssues(baseState(), RESOURCES).length === 0).toBe(true);
  });

  it('accepts the axes a selection actually carries', () => {
    // The negative control that makes every refusal below mean something. All four are
    // `between-games`, which `ranked` permits, and all four travel with a submission.
    const base = baseState();
    for (const state of [
      { ...base, dispatcherId: 'nearest-car' },
      { ...base, seed: 987654321n },
      { ...base, shiftLengthS: 1800 },
      { ...base, buildingId: 'midtown-office' },
    ]) {
      expect(runIdentityIssues(state, RESOURCES), JSON.stringify(state.buildingId)).toEqual([]);
    }
  });

  it('lets a run that is one part of a longer day be posted, now the submission carries which part', () => {
    /*
     * The inverse of what this case used to assert, and the inversion is the point.
     *
     * § D288 refused a windowed run outright: `RunSubmission` was six fields, the window was in
     * none of them, and the board **re-simulates** rather than trusting the client — so posting a
     * lunch peak would have had the server replay the seed over the whole ten hours and answer a
     * different question, correctly. The refusal named its own fix, and all three parts of it have
     * landed: the field is on the wire, `configHashOf` digests it so a morning and a lunch are
     * ranked apart, and `configFor` passes it to the replay as `windowStartS`/`windowEndS`.
     *
     * Still asserted against the whole-period control in the same case, for the reason the refusal
     * gave: both arms are thirty minutes, so nothing here turns on the length.
     */
    const base = { ...baseState(), shiftLengthS: 1800 };
    expect(runIdentityIssues({ ...base, windowStartS: null }, RESOURCES)).toEqual([]);
    expect(runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES)).toEqual([]);
    // Under `shift-week`, which permits every scope, for symmetry with the refusal this replaced.
    expect(
      runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES, 'shift-week'),
    ).toEqual([]);
    // Non-vacuity: this function still refuses things, so an empty array above is a decision about
    // the window rather than a function that stopped working.
    expect(
      runIdentityIssues({ ...base, windowStartS: 30 * 60, buildingId: 'not-a-building' }, RESOURCES)
        .length,
    ).toBeGreaterThan(0);
  });

  it('reports every reason rather than the first', () => {
    const base = baseState();
    const bad: ViewerState = {
      ...base,
      week: nextDay(base.week),
      outOfServiceCarIds: ['main-b'],
      levers: { ...DEFAULT_LEVERS, express: true },
    };
    // A reader who fixes one and is then told about the next has been made to guess how many there
    // are — `freePlayIssues`' rule, applied to the same kind of gate.
    expect(runIdentityIssues(bad, RESOURCES).length).toBe(3);
  });

  it('names the field each refusal is about', () => {
    for (const { name, state } of matrix()) {
      for (const issue of runIdentityIssues(state, RESOURCES)) {
        expect(issue.key, name).toMatch(/^viewer\./u);
        expect(issue.message.length, `${name} — ${issue.key}`).toBeGreaterThan(30);
      }
    }
  });

  it('refuses nothing in a mode that permits everything', () => {
    const base = baseState();
    const busy: ViewerState = { ...base, week: nextDay(base.week), outOfServiceCarIds: ['main-b'] };
    // `shift-week` permits every scope, so the only refusals left are the three value questions —
    // and this state raises none of them.
    expect(runIdentityIssues(busy, RESOURCES, 'shift-week')).toEqual([]);
  });
});

describe('one derivation, two consumers', () => {
  it('agrees with provenanceLineOf on every state in the matrix', () => {
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      const issues = runIdentityIssues(state, RESOURCES, 'ranked');
      expect(
        issues.length === 0,
        `${name}: provenance ${provenance.ok ? 'accepts' : 'refuses'} and runIdentity ${
          issues.length === 0 ? 'accepts' : `refuses (${issues.map((issue) => issue.key).join(', ')})`
        }`,
      ).toBe(provenance.ok);
    }
  });

  it('gives the same number of reasons', () => {
    // Not just the same verdict. A predicate that collapsed three refusals into one would agree on
    // every boolean above and still tell a player less than the control beside it does.
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      if (provenance.ok) continue;
      expect(runIdentityIssues(state, RESOURCES, 'ranked').length, name).toBe(provenance.reasons.length);
    }
  });

  it('is exercised by a matrix that reaches both verdicts', () => {
    // Without this the two assertions above would pass over ten states that all refuse.
    const verdicts = matrix().map(({ state }) => runIdentityIssues(state, RESOURCES).length === 0);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});

/* -------------------------------------------------------------------------- *
 * Issue #129 — the mechanism the docstring claimed and did not have
 * -------------------------------------------------------------------------- */

const sorted = (fields: Iterable<string>): readonly string[] =>
  [...fields].sort((a, b) => a.localeCompare(b));

describe('every field the module is asked about has an answer, and no answer is spare', () => {
  it('covers exactly the fields the ranked walk visits, in both directions', () => {
    /*
     * The assertion `runIdentity.ts` said existed. Both directions, because they fail differently:
     * a **missing** answer is the #129 defect — the walk visits the field, finds nothing, and the
     * run posts — and a **spare** answer is dead weight that reads like a working gate, which is
     * the shape `probes.test-helper.ts#SINK_MISSING` exists to keep honest.
     *
     * `ranked` because it is the mode every shipped caller passes: `provenanceLineOf`,
     * `shareLinkOf`, `submitScore` and `menuHost.runState` all name it, and it is the mode in which
     * a wrong answer is spent on an accusation. The other seven are held by the case below.
     */
    expect(sorted(Object.keys(CARRY_CHECKS))).toEqual(
      sorted(fieldsAnsweredFor('ranked').map(({ field }) => field)),
    );
  });

  it('asks about the three fields issue #129 is about, and about the four it always did', () => {
    // Non-vacuity for the assertion above: a `fieldsAnsweredFor` that returned nothing would agree
    // with a `CARRY_CHECKS` that was empty, and both would be catastrophically wrong.
    expect(sorted(fieldsAnsweredFor('ranked').map(({ field }) => field))).toEqual([
      'calendar',
      'commissioning',
      'levers',
      'outOfServiceCarIds',
      'savedClasses',
      'selectorSpec',
      'week',
    ]);
  });

  it('and in every other mode, the only unanswered field is one the artefacts do carry', () => {
    /*
     * The other seven modes, and the gap in them stated rather than left to be discovered — which
     * is the failure this whole file is about, one layer up.
     *
     * A mode narrower than `ranked` forbids scopes `ranked` permits: `stage-campaign` fixes the
     * building and the traffic, so it asks about `buildingId`. That field has no `CARRY_CHECKS`
     * answer and does not need one *for reproducibility* — a submission carries it — so the walk
     * finds nothing and accepts, which is correct here and would be the #129 defect anywhere else.
     *
     * The distinction is not a comfort, it is the assertion: **every unanswered field must be one
     * `EXPRESSIBLE_IN_A_SELECTION` names.** A field that is neither carried nor answered is the
     * defect, in whichever mode it appears, and this case is what says so before somebody points a
     * fourth caller at a narrower mode.
     */
    for (const mode of PLAY_MODES) {
      const unanswered = fieldsAnsweredFor(mode)
        .map(({ field }) => field)
        .filter((field) => CARRY_CHECKS[field] === undefined);
      for (const field of unanswered) {
        expect(
          EXPRESSIBLE_IN_A_SELECTION[field],
          `${mode} asks about “${field}”, nothing answers, and no artefact carries it`,
        ).toBeDefined();
      }
    }
  });

  it('asks about a between-games field the artefacts cannot carry, and not about the ones they can', () => {
    /*
     * The clause issue #129 added, isolated. Under `ranked`, `permits` says yes to every
     * `between-games` field — so before #129 this list was empty and the two below were unasked.
     */
    const ranked = fieldsAnsweredFor('ranked').map(({ key }) => key);
    expect(ranked).toContain('viewer.commissioning');
    expect(ranked).toContain('viewer.calendar');
    for (const carried of [
      'viewer.buildingId',
      'viewer.dispatcherId',
      'viewer.pattern',
      'viewer.freePlay',
      'viewer.shiftLengthS',
      'viewer.windowStartS',
      'viewer.seed',
    ] as const) {
      expect(ranked, carried).not.toContain(carried);
    }
    /*
     * And `commissioningConstraintId` is **not** asked about, which is issue #129's own scope note
     * and `surface.ts:162`'s argument: a constraint decides what the screen offers and moves no leg
     * by itself. `scope.test.ts` proves that half by requiring its two arms to leave the legs
     * byte-identical; this is the half that says the refusal must therefore not fire.
     */
    expect(ranked).not.toContain('viewer.commissioningConstraintId');
  });
});

describe('every control is driven, both arms, and the refusal names the field', () => {
  /**
   * The control rows this module answers for, with the probe pair `surface.test.ts` already
   * requires each of them to have.
   *
   * A **derived** list rather than a written one, which is the whole point: a control added
   * tomorrow arrives here without anybody remembering, because `surface.test.ts` forces its probe
   * to exist and `fieldsAnsweredFor` forces it into this walk.
   */
  function drivable(): readonly { readonly key: SurfaceKey; readonly field: string }[] {
    return fieldsAnsweredFor('ranked').filter(({ key }) => PROBES[key]?.states !== undefined);
  }

  it('has a probe for every field it answers for', () => {
    // Otherwise the loop below could silently cover none of them.
    expect(drivable().map(({ key }) => key).sort()).toEqual(
      fieldsAnsweredFor('ranked')
        .map(({ key }) => key)
        .sort(),
    );
  });

  it('accepts the reproducible arm and refuses the moved arm, naming the key', () => {
    for (const { key, field } of drivable()) {
      const states = PROBES[key]?.states;
      if (states === undefined) continue;
      const [reproducible, moved] = states;

      /*
       * Arm one is the value a selection can express — `[]` for the choices, `null` for the
       * calendar, the profile's own selector, the defaults for the levers. It must be **accepted**,
       * and this half is what stops the fix being "refuse everything": a predicate that refused
       * both arms would satisfy every other assertion in this file.
       */
      const clean = runIdentityIssues(reproducible(baseState()), RESOURCES, 'ranked');
      expect(
        clean.filter((issue) => issue.key === key),
        `${key}: the reproducible arm must post — ${clean.map((i) => i.message).join('; ')}`,
      ).toEqual([]);

      /* Arm two moves the field. It must be refused, by a reason that names this key. */
      const refusals = runIdentityIssues(moved(baseState()), RESOURCES, 'ranked');
      const mine = refusals.filter((issue) => issue.key === key);
      expect(mine.length, `${key}: the moved arm must be refused`).toBe(1);
      expect(mine[0]?.scope, key).toBe(
        SCOPE_OF[key]?.kind === 'control' ? SCOPE_OF[key]?.scope : undefined,
      );
      // Named, not merely refused — issue #129's acceptance for this shape, and § D227's rule that
      // a refusal a reader cannot act on is worse than the gap it covers.
      expect(mine[0]?.message.length, `${key}: the refusal must say something`).toBeGreaterThan(40);
      expect(field.length).toBeGreaterThan(0);
    }
  });
});

describe('the refusal is pinned by a run — the artefact reproduces different legs', () => {
  /**
   * The run a `copy run` link actually reopens, as legs.
   *
   * The **whole** round trip: `deepLinkSearchOf` writes the address, `deepLinkStateOf` reads it back
   * onto a fresh page, and `legsOf` simulates what that page would run. Comparing the two parameter
   * strings — or asserting a field is absent from one — would pass against a field nothing reads,
   * which is the acceptance clause this test exists for.
   */
  function reopenedLegs(state: ViewerState): string {
    const search = deepLinkSearchOf(state, deepLinkDefaultsOf(RESOURCES));
    return legsOf(deepLinkStateOf(baseState(), RESOURCES, new URLSearchParams(search)));
  }

  for (const [name, build] of [
    ['a commissioned fabric', commissionedState],
    ['a calendar period', calendaredState],
    ['the weight-set selector', selectorState],
  ] as const) {
    it(`${name}: the link reproduces a different run, and the artefact refuses`, () => {
      const state = build();

      /*
       * First, the **behaviour**: the address cannot carry this, so reopening it runs something
       * else. This is the fact the refusal is about, and measuring it is what stops the refusal
       * outliving the field — if somebody made commissioning inert tomorrow, these legs would match
       * and this test would demand the refusal be re-examined rather than quietly kept.
       */
      expect(legsOf(state), `${name}: the artefact must reproduce a different run`).not.toEqual(
        reopenedLegs(state),
      );

      /* Then the refusal, on both artefacts, through the one predicate. */
      const link = shareLinkOf(state, RESOURCES, deepLinkDefaultsOf(RESOURCES), 'https://x.invalid/');
      expect(link.ok, `${name}: copy run must refuse`).toBe(false);
      expect(provenanceLineOf(state, RESOURCES).ok, `${name}: the CLI line must refuse`).toBe(false);
    });
  }

  it('and a run the address *can* carry round-trips to the same legs and is not refused', () => {
    /*
     * The negative control, and the assertion above means nothing without it: a `deepLinkStateOf`
     * that ignored every parameter would make all three cases above pass. `nearest-car` is the
     * widest dispatcher change the library has and the address carries it, so the legs must come
     * back **identical** and nothing must object.
     */
    const carried: ViewerState = { ...baseState(), dispatcherId: 'nearest-car', seed: 4242n };
    expect(legsOf(carried)).toEqual(reopenedLegs(carried));
    expect(runIdentityIssues(carried, RESOURCES, 'ranked')).toEqual([]);
    expect(shareLinkOf(carried, RESOURCES, deepLinkDefaultsOf(RESOURCES), 'https://x.invalid/').ok).toBe(
      true,
    );
  });
});

describe('one derivation, both consumers — the client’s answer is the server’s shape', () => {
  /**
   * `packages/server/src/leaderboard/submission.ts`, read as text.
   *
   * § D215 § 3 — **`viz` may not depend on `server`** — so this is the method `menu/client.test.ts`
   * already uses for the password bounds, and for the same reason it gives: the two halves have to
   * agree, and the only way to assert that across a boundary neither side may cross is to read the
   * other side's source.
   */
  const SERVER_SUBMISSION = readFileSync(
    fileURLToPath(new URL('../../../server/src/leaderboard/submission.ts', import.meta.url)),
    'utf8',
  );

  /** The field names `SubmittedRun` declares — the whole of what a run may say about itself. */
  function submittedRunFields(): readonly string[] {
    const block = /export interface SubmittedRun \{([\s\S]*?)\n\}/u.exec(SERVER_SUBMISSION)?.[1];
    if (block === undefined) throw new Error('SubmittedRun is not declared the way this test reads it');
    return [...block.matchAll(/^\s*readonly (\w+)[?:]/gmu)].map((match) => match[1] as string);
  }

  it('reads a SubmittedRun that still looks like a SubmittedRun', () => {
    // The read above is a regex over somebody else's file, so it says out loud what it found. A
    // silent zero-length match would make every assertion below vacuously true.
    expect(submittedRunFields()).toEqual([
      'buildingId',
      'dispatcherProfileId',
      'demandTemplateId',
      'arrivalRatePctPop5min',
      'durationS',
      'windowStartS',
      'seed',
    ]);
  });

  it('carries no field for anything the client refuses, which is why the client refuses it', () => {
    /*
     * The pin, in § D227's sense: the refusal is justified by the wire's real shape rather than by
     * a sentence about it. The day somebody adds `commissioning` to `SubmittedRun`, this goes red
     * and sends them here to delete the refusal — which is the two-answer state the issue is about,
     * caught on the commit that would create it rather than by a player being called a cheat.
     */
    const fields = submittedRunFields().join(' ').toLowerCase();
    for (const absent of ['commissioning', 'calendar', 'selector', 'fabric', 'shaft']) {
      expect(fields, `RunSubmission must not carry ${absent} while the client refuses it`).not.toContain(
        absent,
      );
    }
  });

  it('and the board identity does not digest them either', () => {
    /*
     * Issue #129's acceptance for the *other* shape — *"`configHashOf` must change, or two
     * genuinely different runs land on one board"* — asserted as its contrapositive. Nothing here
     * travels, so nothing here may be hashed: a digest over a field the wire does not carry would
     * be a board partition nobody could reproduce.
     */
    const digest = /export function configHashOf\([\s\S]*?\n\}/u.exec(SERVER_SUBMISSION)?.[0] ?? '';
    expect(digest.length).toBeGreaterThan(100);
    for (const absent of ['commissioning', 'calendar', 'selector']) {
      expect(digest.toLowerCase(), `configHashOf must not digest ${absent}`).not.toContain(absent);
    }
  });
});
