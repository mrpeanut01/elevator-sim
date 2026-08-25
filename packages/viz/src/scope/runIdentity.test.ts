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
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import {
  CALENDAR_PERIODS,
  periodOnDays,
  type CalendarPeriod,
  type CalendarShift,
} from '../shift/calendar.js';
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

  it('asks about the three fields issue #129 is about, the four it always did, patience, and the intervention log', () => {
    // Non-vacuity for the assertion above: a `fieldsAnsweredFor` that returned nothing would agree
    // with a `CARRY_CHECKS` that was empty, and both would be catastrophically wrong.
    //
    // `patience` is the eighth and is the UI readiness audit's B4: the Parameters tab's one applied
    // schema. It arrived here on the day it landed rather than on the day somebody remembered,
    // which is what the walk over `SCOPE_OF` was built for — the field was red in four cases of
    // this file before a line of it was written.
    // `interventions` is the ninth and is Everyday Mode's slice 3: the stage's mid-run change of
    // mind, the field the contract's own replay-verification would otherwise turn into an
    // accusation. It arrived here the day the field landed, by the same walk that forced
    // `patience` in — the probe was compulsory before this list knew the name.
    // `ruleRows` is the tenth and is slice 4c: the Everyday rules, on `interventions`' exact
    // footing — the empty list carries by object identity, and a written list has no wire field.
    expect(sorted(fieldsAnsweredFor('ranked').map(({ field }) => field))).toEqual([
      'calendar',
      'commissioning',
      'interventions',
      'levers',
      'outOfServiceCarIds',
      'patience',
      'ruleRows',
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

/* -------------------------------------------------------------------------- *
 * A calendar period that names no event — GitHub issue #140
 * -------------------------------------------------------------------------- */

/**
 * **A period that names no event still changes the run, and day 1 was calling that reproducible.**
 *
 * The gate was `week.day === 1 && event.effect.changesNothing`. Four of the five shipped periods
 * change the run on day 1 while booking no event at all, so a run on **a quarter of the building**
 * was published as reproducible from a selection that carries no calendar — and `runIdentity` is
 * the derivation the leaderboard submit path and `copy run` share, so the server would have
 * replayed the shipped building and answered `422 metrics-do-not-reproduce` at an honest player.
 *
 * Every case here is decided **on the legs** rather than on the predicate's own opinion — § D177's
 * rule, applied to a refusal rather than to a slider — and both directions are asserted, because a
 * fix that refused every day 1 would close the hole and open a worse one: it would tell a player
 * their perfectly ordinary run cannot be posted.
 *
 * The sentence is asserted as well as the verdict, and that is issue #135's stated reason for
 * leaving this open rather than a nicety. Its sentence named the day number and the event, so
 * opening the gate without rewriting it would have filed a refusal giving the **wrong reason** —
 * *"day 1 … schedules “Ordinary day”"* about a run that moved because of a population factor.
 * § D227 rates a wrong refusal below the gap itself.
 */
describe('a calendar period that names no event still changes the run — issue #140', () => {
  /** Midtown Office at 1 800 s: four cars and 1 710 people, so every axis of a period bites. */
  function on(period: CalendarPeriod | null): ViewerState {
    return { ...baseState(), buildingId: 'midtown-office', shiftLengthS: 1800, calendar: period };
  }

  const whole = (id: keyof typeof CALENDAR_PERIODS): CalendarPeriod =>
    periodOnDays(CALENDAR_PERIODS[id], 1, 7);

  /** A period that applies today and asks the run for nothing at all. The false-positive control. */
  const INERT_SHIFT: CalendarShift = {
    populationFactor: 1,
    splitBias: null,
    demandTemplateId: null,
    eventId: null,
    goodsCars: 0,
    note: 'The doors open and today is today.',
  };
  const inertPeriod: CalendarPeriod = {
    ...CALENDAR_PERIODS.vacation,
    name: 'A week off from the calendar',
    shift: INERT_SHIFT,
    overrides: {},
  };

  it('refuses day 1 under every shipped period, and the legs say it had to', () => {
    /*
     * The two halves are the whole test. `legs` is the ground truth — the run under the period is
     * not the run a selection would reproduce — and `issues` is what the product says about it. A
     * period whose legs moved and whose verdict was *reproducible* is the defect; this is the
     * assertion that had it.
     */
    const plain = legsOf(on(null));
    for (const id of ['public-holiday', 'vacation', 'quarter-end', 'rota-week', 'moving-week'] as const) {
      const state = on(whole(id));
      expect(legsOf(state), `${id} moves no leg — this probe measures nothing`).not.toBe(plain);
      expect(runIdentityIssues(state, RESOURCES, 'ranked').length, id).toBeGreaterThan(0);
    }
  });

  it('names the period and what it moved, never an event it did not book', () => {
    /*
     * `public-holiday` is the sharpest case: `fromDay: 1, toDay: 1`, `eventId: null`, and a
     * `populationFactor` of 0.25 — it exists *only* on the day the gate used to open, and the only
     * thing it changes is the one thing the old sentence could not name.
     */
    const holiday = runIdentityIssues(on(whole('public-holiday')), RESOURCES, 'ranked');
    /*
     * **The key is `viewer.calendar`, and that is issue #129's half of this fix.** This assertion
     * read `['viewer.week']` when it was written, because at that point the period's clause was
     * built in the week's arm — the only arm there was. #129 gave `viewer.calendar` an arm in the
     * same wave and the clause moved into it, on the argument both lanes reached independently: a
     * refusal filed under `viewer.week` for something the calendar caused sends a reader to the
     * wrong control, which is § D227's wrong-reason failure one field over from the one #135
     * declined to commit.
     */
    expect(holiday.map((issue) => issue.key)).toEqual(['viewer.calendar']);
    expect(holiday[0]?.message).toBe(
      'the calendar’s “Public holiday” scales the building’s population to 25 %, and no selection ' +
        'or submission carries a calendar period',
    );
    // The half § D227 is about: no event is named, because the period books none.
    expect(holiday[0]?.message).not.toContain('schedules');

    // `vacation` moves two axes, and both are named. A sentence naming one would pass a weaker
    // assertion and still tell a player half of why their run is not theirs to share.
    const vacation = runIdentityIssues(on(whole('vacation')), RESOURCES, 'ranked');
    expect(vacation[0]?.message).toBe(
      'the calendar’s “Vacation week” scales the building’s population to 60 % and pulls the mix ' +
        'flatter, and no selection or submission carries a calendar period',
    );
  });

  it('keeps the period and the day’s event apart, each under its own key', () => {
    /*
     * `moving-week` books `move-in` **and** biases the mix **and** reserves a car, so this is the
     * one shipped period where all three facts are live at once. They are kept apart rather than
     * merged: a period does not necessarily book the day's event — a fire drill inside a vacation
     * week is the **week's** drill — and a single sentence reading "Moving week … and schedules X"
     * would attribute it to the calendar.
     *
     * **They are now two issues rather than two clauses of one**, which is strictly the stronger
     * form of the same claim and is what moving the period to its own arm bought. Each fact is
     * filed under the control that caused it, so a reader is sent to the calendar for the period
     * and to the week for the event. `runIdentityIssues` publishes *all* the reasons rather than
     * the first, so a caller sees both — the property its own docstring states.
     */
    const issues = runIdentityIssues(on(whole('moving-week')), RESOURCES, 'ranked');
    /*
     * Sorted, because the subject here is *which control each fact is filed under* and not the
     * order they come out in. The order is real — `viewerControls()` sorts by field name, so
     * `calendar` precedes `week` — but pinning it here would make this test go red for a change to
     * a sort that this test is not about, and the file already has assertions that are about the
     * table's shape.
     */
    expect([...issues.map((issue) => issue.key)].sort()).toEqual([
      'viewer.calendar',
      'viewer.week',
    ]);

    const week = issues.find((issue) => issue.key === 'viewer.week');
    expect(week?.message).toBe(
      'the day schedules “Move-in day”, and none of that travels with a selection',
    );
    // The week's sentence says nothing about the mix or the car: those are the calendar's asks.
    expect(week?.message).not.toContain('mix');

    const calendar = issues.find((issue) => issue.key === 'viewer.calendar');
    expect(calendar?.message).toBe(
      'the calendar’s “Moving week” pulls the mix toward floor-to-floor and reserves at least one ' +
        'car out of passenger service, and no selection or submission carries a calendar period',
    );
    // And the calendar's sentence does not claim the event, which the week booked.
    expect(calendar?.message).not.toContain('schedules');
  });

  it('leaves day 1 reproducible with no calendar at all', () => {
    // The negative control the fix would otherwise not need: without it, a change that refused
    // every day 1 would pass every assertion above.
    expect(runIdentityIssues(on(null), RESOURCES, 'ranked')).toEqual([]);
    expect(runIdentityIssues(baseState(), RESOURCES, 'ranked')).toEqual([]);
  });

  it('leaves day 1 reproducible under a period that genuinely changes nothing', () => {
    // A period **is** open, applies today, and asks the run for nothing — and the legs agree, which
    // is what makes this a measurement rather than a restatement of the predicate.
    const state = on(inertPeriod);
    expect(legsOf(state)).toBe(legsOf(on(null)));
    expect(runIdentityIssues(state, RESOURCES, 'ranked')).toEqual([]);
  });

  it('leaves day 1 reproducible on a day the period does not cover', () => {
    // A window that starts later is `calendarDayFor`'s `null`, which is the whole of *no calendar*.
    const state = on(periodOnDays(CALENDAR_PERIODS['public-holiday'], 3, 5));
    expect(legsOf(state)).toBe(legsOf(on(null)));
    expect(runIdentityIssues(state, RESOURCES, 'ranked')).toEqual([]);
  });

  it('names no ask the engine withheld', () => {
    /*
     * The other direction of the wrong-reason failure, and the reason `calendarAsks` shares
     * `calendarPatch`'s branches instead of reading the period's declaration.
     *
     * `rota-week` asks for a mix bias and the `shift-change` template and scales nothing. Under a
     * player-chosen `lunch-two-way` the calendar gets **neither**: the template is the player's
     * (§ D215) and the engine refuses a bias under a template that varies the mix. So the run is
     * byte-identical to the calendar-free one and must be posted, not refused — a predicate reading
     * the period's declaration would refuse it, and would name two axes that never moved.
     */
    const chosen = {
      ...on(whole('rota-week')),
      freePlay: { demandTemplateId: 'lunch-two-way', arrivalRatePctPop5min: null },
    } satisfies ViewerState;
    const control = { ...chosen, calendar: null } satisfies ViewerState;
    expect(legsOf(chosen)).toBe(legsOf(control));
    expect(runIdentityIssues(chosen, RESOURCES, 'ranked')).toEqual([]);

    // And the same period at a shift too short for its template keeps the bias, which does land —
    // so the refusal names the mix and stays silent about the template.
    const short = on(whole('rota-week'));
    const message = runIdentityIssues({ ...short, shiftLengthS: 900 }, RESOURCES, 'ranked')[0]?.message;
    expect(message).toContain('pulls the mix two-way');
    expect(message).not.toContain('demand template');
  });

  it('does not offer a 0 % growth as a reason, which the shipped sentence did', () => {
    // `day 1 grows the building by 0 %` was printed by the product under `moving-week`, beside a
    // disabled **Post this run**. A refusal listing a thing that did not happen is the same defect
    // as one naming the wrong thing, one degree milder.
    for (const id of ['public-holiday', 'vacation', 'moving-week', 'quarter-end', 'rota-week'] as const) {
      expect(runIdentityIssues(on(whole(id)), RESOURCES, 'ranked')[0]?.message, id).not.toContain(
        'grows the building by 0 %',
      );
    }
    // Day 2 still says it, because on day 2 it is true.
    expect(
      runIdentityIssues({ ...on(null), week: nextDay(baseState().week) }, RESOURCES, 'ranked')[0]
        ?.message,
    ).toContain('grows the building by 11 %');
  });

  it('still opens the gate for a period that names an event — #135 must not regress', () => {
    /*
     * `moving-week`'s day 1 is `move-in`, which `eventFor` alone reads as `ordinary`. The route
     * through `scheduledEventFor` is what makes it visible, and it is asserted here as well as in
     * `eventSeam.test.ts` because this arm is the one where getting it wrong publishes a run.
     *
     * Asserted over **every** issue rather than the first, and the change is not cosmetic: the
     * period and the event are now filed under different keys, so an assertion on `issues[0]` is
     * really an assertion about ordering. #135's regression would be the event going *missing*,
     * which is what this asks.
     */
    const issues = runIdentityIssues(on(whole('moving-week')), RESOURCES, 'ranked');
    expect(issues.map((issue) => issue.message).join(' | ')).toContain(
      'the day schedules “Move-in day”',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The goods car is claimed only where one was reserved — GitHub issue #264
 * -------------------------------------------------------------------------- */

/**
 * **The refusal and the caption describe the same day, and are required to agree.**
 *
 * `askClause`'s `goodsCars` arm prints *"reserves at least one car out of passenger service"*, and
 * the docstring it was written under argued that *at least one* is true of every case a shipped
 * building can produce: `reserveCars` never empties a bank, `data/buildings/` declares at least two
 * cars in every bank, and `calendar.test.ts` asserts that **from disk** so a one-car bank landing
 * tomorrow turns the assertion red rather than the paragraph stale.
 *
 * The assertion is a true statement about the wrong population. **`data/buildings/` is not the set
 * of banks a run can have**: `commissioning/choices.ts#shaftChoices` offers `max(1, current − 1)`
 * upward, so the fabric screen takes Garden Apartments' two-car bank down to **one** under any
 * constraint that admits `shafts`, and `shiftRunConfigOf` commissions the building before the
 * calendar ever sees it. On that fabric `moving-week` asks for a goods car, gets none, and says so
 * in `withheld` — *"asked to reserve 1 car(s) for the day and could reserve 0"* — while
 * `calendarLine` correctly omits the clause and this refusal went on claiming it. Two sentences
 * about one day, contradicting each other, on the surface whose own docstring says it *"must never
 * accuse somebody of something they did not do"*.
 *
 * So the shape here is an **agreement** rather than a table of expected strings, for
 * `calendar.test.ts`'s reason at the layer above: the caption is built from the patch, the refusal
 * is built from the asks, and a hand-written expectation would agree with whichever of the two it
 * was copied from. This one asks the shipped run plan what it did.
 */
describe('the goods-car refusal names a reservation that happened — issue #264', () => {
  /** Garden Apartments' main bank at `shafts`, `moving-week` over the whole week, on `day`. */
  function gardenWith(shafts: number, day: number): ViewerState {
    const authored = RESOURCES.entries.find((entry) => entry.config.id === 'garden-apartments')?.config;
    if (authored === undefined) throw new Error('garden-apartments is not loaded');
    const classes = commissionableClasses(RESOURCES.elevatorSpecs);
    const asBuilt = asBuiltChoices(authored, classes);
    const main = asBuilt[0];
    if (main === undefined) throw new Error('garden-apartments declares no bank');
    return {
      ...baseState(),
      buildingId: 'garden-apartments',
      shiftLengthS: 1800,
      week: { ...baseState().week, day, dayIdx: day - 1 },
      calendar: periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7),
      commissioning: withBankChoice(asBuilt, { ...main, shafts }),
    };
  }

  const GOODS_CLAUSE = 'reserves at least one car out of passenger service';

  it('is silent on a fabric that leaves no car free, and the run plan is the witness', () => {
    /*
     * One shaft is a fabric a player reaches from the commissioning screen — `shaftChoices(2)`
     * offers it — and it is the fabric on which the period's own `move-in` derate and its goods car
     * are asking the same two-car bank for the same one free car. The run plan is the ground truth
     * rather than a second reading of the calendar: `shiftRunConfigOf` is what the simulator is
     * handed, and its `withheld` is the product saying, in its own words, that it reserved none.
     */
    const state = gardenWith(1, 1);
    const plan = shiftRunConfigOf(RESOURCES, state);
    expect(plan.building.banks.map((bank) => bank.cars.length)).toEqual([1]);
    expect(plan.outOfServiceCarIds, 'the fixture reserved a car — it measures nothing').toEqual([]);
    expect(plan.withheld.join(' | ')).toContain('could reserve 0');
    // The caption built from the patch already omits it. The refusal is what disagreed.
    expect(plan.calendarLine).not.toContain('reserved');

    const calendar = runIdentityIssues(state, RESOURCES, 'ranked').find(
      (issue) => issue.key === 'viewer.calendar',
    );
    expect(calendar?.message ?? '').not.toContain(GOODS_CLAUSE);
  });

  it('agrees with the caption on every fabric and day the shaft control offers', () => {
    /*
     * The matrix reaches both verdicts on the axis — `shaftChoices(2)` is `1 … 6`, and Sunday is
     * the period's own override at `goodsCars: 0` — so an implementation that answered *always* or
     * *never* fails here rather than passing half of it.
     */
    const verdicts: boolean[] = [];
    for (const shafts of [1, 2, 3]) {
      for (const day of [1, 6, 7]) {
        const state = gardenWith(shafts, day);
        const plan = shiftRunConfigOf(RESOURCES, state);
        const message =
          runIdentityIssues(state, RESOURCES, 'ranked').find((issue) => issue.key === 'viewer.calendar')
            ?.message ?? '';
        const claimed = message.includes(GOODS_CLAUSE);
        expect(claimed, `${String(shafts)} shafts, day ${String(day)}`).toBe(
          plan.calendarLine.includes('reserved'),
        );
        verdicts.push(claimed);
      }
    }
    expect(verdicts, 'no cell claimed a goods car — the matrix measures one verdict').toContain(true);
    expect(verdicts, 'every cell claimed a goods car — the matrix measures one verdict').toContain(
      false,
    );
  });

  it('claims nothing on a building this build does not ship, and names that instead', () => {
    /*
     * The one state whose fabric cannot be resolved, and the branch `reservationDecision` answers
     * with an empty reservation. Silence is the honest answer rather than a conservative one: there
     * is no run for the clause to be about — `shiftRunConfigOf` throws on this state — and the
     * refusal a player gets is the building's own, by name.
     *
     * Pinned rather than argued, because a branch nothing drives is a branch that can be quietly
     * changed into a claim.
     */
    const state: ViewerState = {
      ...baseState(),
      buildingId: 'a-tower-this-build-does-not-ship',
      calendar: periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7),
    };
    const issues = runIdentityIssues(state, RESOURCES, 'ranked');
    expect(issues.map((issue) => issue.key)).toContain('viewer.buildingId');
    expect(
      issues.find((issue) => issue.key === 'viewer.calendar')?.message ?? '',
    ).not.toContain(GOODS_CLAUSE);
    // And the period is still refused on what it did move, so nothing has been let through.
    expect(issues.find((issue) => issue.key === 'viewer.calendar')?.message ?? '').toContain(
      'pulls the mix',
    );
  });
});
