/**
 * The claim the leaderboard rests on: **a forged score does not survive replay, and an honest one
 * does.**
 *
 * Run against the real `data/` and the real kernel, not a fixture. A verifier tested against a stub
 * simulation would prove that the stub agrees with itself — the whole point is that the *shipped*
 * engine is deterministic enough to catch a lie, and that is only testable by catching one.
 */

import { describe, expect, it, beforeAll } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';

import { runDataHashOf } from './boardKey.js';
import { digestOf, submissionIssues, type Submission, type SubmittedRun } from './submission.js';
import {
  METRIC_EPSILON,
  configFor,
  metricsAgree,
  metricsOf,
  verifySubmission,
  type VerificationResources,
} from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;

let config: LoadedConfig;
let resources: VerificationResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
}, 60_000);

/** A run small enough to replay quickly and busy enough to have a wait worth claiming. */
const RUN = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  windowStartS: null,
  seed: '20260804',
});

/**
 * The truth, measured the way the server measures it.
 *
 * Replayed through `configFor` + `runSimulation` — the verifier's own path — rather than through a
 * second hand-built config. Two places that both decide what a submission means is exactly the
 * drift the design cannot survive: the client and the server have to agree, and a test that built
 * its own config would be testing agreement with the test.
 */
function honest(): Submission {
  const config = configFor(RUN, resources);
  if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
  return { run: RUN, claimed: metricsOf(runSimulation(config).summary) };
}

/* -------------------------------------------------------------------------- *
 * The Everyday run: a written dispatcher and a played day
 * -------------------------------------------------------------------------- */

/**
 * The two rows a player would write in § 11.5's editor, in first-match order.
 *
 * Values from the vocabulary's own `values` lists, because anything else is refused by
 * `submissionIssues` before a simulation starts and by `resolveDispatchConfig` after it.
 */
const RULES = Object.freeze([
  Object.freeze({ when: 'lobby-queue-passes' as const, whenValue: 12, then: 'hold-at-lobby' as const }),
  Object.freeze({ when: 'call-waited' as const, whenValue: 60, then: 'jump-queue' as const }),
]);

/** One press of § 7.6's parking control, a quarter of the way into the run. */
const LOG = Object.freeze([Object.freeze({ atS: 225, change: Object.freeze({ kind: 'park-cars-lobby' as const }) })]);

/**
 * The cell these cases run on, and **it is not {@link RUN}** — which is a finding rather than a
 * convenience.
 *
 * Driven on `garden-apartments` at 6 % over 900 s, both fields move the run by **exactly nothing**:
 * `awtS` is 17.404761904761926 with the rules, with the log, and with neither. Sparse traffic over
 * two hydraulic cars never puts twelve people in the lobby, never leaves a call waiting sixty
 * seconds, and gives stage 7 nothing to reposition — so the rules never fire and the parking
 * instruction changes no decision. Every case below would have passed on that cell and proved
 * nothing at all, which is the shape of a wire that carries a field the kernel ignores.
 *
 * `midtown-office` at 3 % over 900 s is § D129's own probe cell, `awtIsValid` there is `true`, and
 * both fields bite: `23.0038` plain, `26.1676` ruled, `26.2945` with the log, at seed 20260804. The
 * direction is *worse*, which is exactly right and worth saying — a rule a player wrote is not
 * required to help them, and a wire that only carried improvements would be a scoreboard rather than
 * a simulator.
 */
const EVERYDAY_RUN = Object.freeze({
  ...RUN,
  buildingId: 'midtown-office',
  arrivalRatePctPop5min: 3,
});

/**
 * The configuration a **client** builds for a run carrying rules and a log — written out here term
 * for term rather than obtained from `configFor`.
 *
 * The duplication is the test. `configFor` is the thing under test, so a claim computed through it
 * would be the verifier agreeing with itself; what has to be true is that a config assembled the way
 * `packages/viz`'s `dev/state.ts#shiftRunConfigOf` assembles one reaches the same figures. So the
 * two writes the viewer makes are made here — `authoring/ruleSpec.ts#profileWithRules` puts
 * `rules.rows` and `selection.policy: 'rules'` on the profile, and `shiftRunConfigOf` spreads
 * `interventions` only when the log is non-empty — and the metrics that come out are submitted as
 * the *claim*. If `configFor` differed from the viewer in any term, `metricsAgree` would fail and
 * this test would go red, which is exactly the failure an honest player would otherwise meet as a
 * 422 they could do nothing about.
 *
 * `viz` is not imported and cannot be: it is a browser bundle and this package opens a socket and a
 * database, so the rule `menu/challenge.ts` states — *`viz` must build and test with
 * `packages/server` absent* — runs in this direction too. `scope/runIdentity.test.ts` holds the
 * other end by reading this package's source text, which is `menu/client.test.ts`'s own method.
 */
function asTheClientBuildsIt(run: SubmittedRun): SimulationConfig {
  const building = config.buildingsById.get(run.buildingId);
  const profile = config.dispatcherProfilesById.get(run.dispatcherProfileId);
  if (building === undefined || profile === undefined) throw new Error('fixture does not resolve');
  const rows = run.ruleRows ?? [];
  const reportWindow = clientReportWindowFor(run.buildingId);
  return {
    building,
    dispatcherProfile:
      rows.length === 0
        ? profile
        : { ...profile, rules: { rows: [...rows] }, selection: { ...(profile.selection ?? {}), policy: 'rules' } },
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed: BigInt(run.seed),
    demandTemplate: run.demandTemplateId as SimulationConfig['demandTemplate'],
    onTimeout: 'report',
    ...(run.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: run.arrivalRatePctPop5min } }),
    ...(run.windowStartS === null
      ? { durationS: run.durationS }
      : { windowStartS: run.windowStartS, windowEndS: run.windowStartS + run.durationS }),
    ...(reportWindow === undefined ? {} : { reportWindow }),
    ...((run.interventions ?? []).length === 0 ? {} : { interventions: run.interventions }),
  } as SimulationConfig;
}

/**
 * The window the **viewer** would report this building's run over — GitHub issue #315.
 *
 * Written out from `MATRIX_CELLS` rather than obtained from `reportWindowForBuilding`, for the
 * reason the docstring above gives about every other term here: the shared function is what
 * `configFor` calls, so asking it would be the verifier agreeing with itself. What has to be true is
 * that the server reaches the same window `viz`'s `shift/reportWindow.ts#shiftReportWindowFor`
 * reaches, and that function's rule is *every* matrix cell on this building declares `full-run` —
 * `every` rather than `some`, which is the clause Midtown Office settles and the clause this
 * transcription would get wrong if the shared rule quietly changed under it.
 *
 * A building the matrix does not measure returns `undefined`: **leave the demand template's own
 * band alone**, which is not the same selection as `'peak-5min'`.
 */
function clientReportWindowFor(buildingId: string): 'full-run' | undefined {
  const cells = MATRIX_CELLS.filter((cell) => cell.building === buildingId);
  if (cells.length === 0) return undefined;
  return cells.every((cell) => cell.traffic.reportWindow === 'full-run') ? 'full-run' : undefined;
}

/** What a client that ran `run` would claim, measured its own way. */
function claimedByTheClient(run: SubmittedRun): Submission {
  return { run, claimed: metricsOf(runSimulation(asTheClientBuildsIt(run)).summary) };
}

/* -------------------------------------------------------------------------- *
 * The window both sides have to choose the same way — GitHub issue #315
 * -------------------------------------------------------------------------- */

/**
 * The run the issue reports, verbatim: a whole hour of Garden Apartments on its own traffic profile.
 *
 * Not {@link RUN}, which is 900 s at 6 %. The length matters to nothing here — the defect is the
 * window and not the horizon — but a case that reproduces the filed numbers is checkable against the
 * issue by a reader who has only the issue.
 */
const WINDOW_RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: null,
  durationS: 3600,
  windowStartS: null,
  seed: '20260901',
});

/**
 * Buildings this server ships, split by the answer the matrix gives about their reporting window.
 *
 * **Derived, and that is the acceptance clause rather than a nicety.** The suite drove
 * `midtown-office` and `garden-apartments` before this issue and still missed the defect, because
 * every case that compared a *client-built* config against `configFor` used Midtown — the one
 * building whose answer is *leave the template's band alone*, where an absent `reportWindow` and a
 * correct one are the same run. So the cases below take one building from **each** side of the rule,
 * chosen by the rule, and a matrix edit that emptied either side fails the premise rather than
 * quietly making the pair vacuous.
 */
const buildingsBy = (window: 'full-run' | undefined): readonly string[] =>
  [...config.buildingsById.keys()].filter((id) => clientReportWindowFor(id) === window);

describe('the report window is derived on both sides, and never submitted', () => {
  it('has a building on each side of the rule, so the pair below is not vacuous', () => {
    // The premise. `garden-apartments` and `midtown-office` are named as well as derived: a matrix
    // edit that moved either across the rule would change what these cases are testing, and it
    // should say so here rather than in a passing test about a different building.
    expect(buildingsBy('full-run')).toContain('garden-apartments');
    expect(buildingsBy(undefined)).toContain('midtown-office');
    expect(buildingsBy('full-run').length).toBeGreaterThan(0);
    expect(buildingsBy(undefined).length).toBeGreaterThan(0);
  });

  it('replays a full-run building to the client’s own metrics', () => {
    /*
     * The defect, as a run. `viz`'s `shiftRunConfigOf` has set `reportWindow: 'full-run'` on this
     * building since `docs/20` defect 5; `configFor` set none, so the server measured the same legs
     * over `rise-and-fall`'s five-minute band and refused every honest Garden submission as
     * `metrics-do-not-reproduce` — this product's one accusation, spent on a player who did nothing
     * wrong.
     */
    for (const buildingId of buildingsBy('full-run')) {
      const submission = claimedByTheClient({ ...WINDOW_RUN, buildingId });
      const verification = verifySubmission(submission, resources);
      expect(verification.ok, `${buildingId}: ${JSON.stringify(verification)}`).toBe(true);
    }
  }, 300_000);

  it('leaves a building the matrix does not move exactly where it was', () => {
    /*
     * The other side, and the reason a fix here could not be *"always full-run"*. A building whose
     * cells are not unanimous keeps the demand template's declared band, and the client and the
     * server agree by both leaving it alone. Driven at 3 % rather than on its own profile because
     * Midtown at its authored rate saturates over an hour and would be refused as `awt-not-quotable`
     * before the comparison this case exists for.
     */
    let checked = 0;
    for (const buildingId of buildingsBy(undefined)) {
      const run = { ...WINDOW_RUN, buildingId, arrivalRatePctPop5min: 3, durationS: 900 };
      const submission = claimedByTheClient(run);
      // A run whose own mean is not quotable is refused by `awt-not-quotable` before the comparison
      // this case is about, and says nothing either way. Skipped, and counted, because a loop that
      // skipped every building would otherwise pass by testing nothing.
      if (!submission.claimed.awtIsValid) continue;
      const verification = verifySubmission(submission, resources);
      expect(verification.ok, `${buildingId}: ${JSON.stringify(verification)}`).toBe(true);
      checked += 1;
    }
    expect(checked, 'every band-window building was skipped; this case asserted nothing').toBeGreaterThan(0);
  }, 300_000);

  it('changes the figures on the building it moves, so the agreement is not a no-op', () => {
    /*
     * `CLAUDE.md`'s standing requirement pointed at a config term instead of a slider: **move the
     * control and require the run to change**. Two configs that differ only in the window, on the
     * same seed and the same legs — if the term were inert, every case above would pass on the tree
     * that shipped the defect.
     *
     * The numbers are the issue's own, named rather than only compared: `garden-apartments` /
     * `collective` / `rise-and-fall`, window null, 3 600 s, seed 20260901. A cell edited to one
     * where the window goes quiet turns this red rather than vacuous.
     */
    const withWindow = configFor(WINDOW_RUN, resources);
    if (typeof withWindow === 'string') throw new Error(`fixture does not resolve: ${withWindow}`);
    const asItWas = { ...withWindow, reportWindow: undefined } as SimulationConfig;

    const server = metricsOf(runSimulation(asItWas).summary);
    const client = metricsOf(runSimulation(withWindow).summary);

    expect(server.awtS).toBeCloseTo(18.233, 3);
    expect(server.wt95S).toBeCloseTo(29.31, 3);
    expect(server.ttdMeanS).toBeCloseTo(50.829, 3);
    expect(client.awtS).toBeCloseTo(13.462, 3);
    expect(client.wt95S).toBeCloseTo(28.119, 3);
    expect(client.ttdMeanS).toBeCloseTo(40.348, 3);
    expect(metricsAgree(server, client)).toBe(false);
  }, 300_000);

  it('refuses a window on the wire, because a chosen window is a chosen average', () => {
    /*
     * The half that keeps the fix from becoming a cheat. `ENGINE_CONTRACT.md` § 12.1 — *"No
     * player-settable parameter may enter a board key"* — and the window is the divisor of every
     * mean on the sheet, so a player who picked their own window would pick their own average.
     *
     * Asserted structurally rather than by a rejection code: a `SubmittedRun` has no field for it,
     * so the wire cannot carry one at all. `submissionIssues` would never see it and `configFor`
     * would never read it. Read off the shape a client actually builds, so a field added later
     * fails here.
     */
    expect(Object.keys(WINDOW_RUN)).not.toContain('reportWindow');
    const smuggled = { ...WINDOW_RUN, reportWindow: 'peak-5min' } as SubmittedRun;
    const built = configFor(smuggled, resources);
    if (typeof built === 'string') throw new Error(`fixture does not resolve: ${built}`);
    // The window is the one the building's own id earns, not the one the submission carried.
    expect(built.reportWindow).toBe('full-run');
  });
});

describe('an Everyday run is submittable, and the server reaches the same figures', () => {
  it('replays a written rule list to the client’s own metrics', () => {
    /*
     * The refusal this replaces said *"no selection or submission carries a rule list — a replay
     * without them is a different run"*, and every clause of it was true. The consequence was that a
     * player who wrote one row could never appear on any board and the whole of § 11's workshop
     * produced dispatchers that were unpostable by construction.
     *
     * What makes it safe to lift is this case rather than the field: the server rebuilds the
     * dispatcher from **its own** `data/` and writes the player's rows onto it, and the figures agree
     * with the client's to `METRIC_EPSILON`.
     */
    const ruled: SubmittedRun = { ...EVERYDAY_RUN, ruleRows: RULES };
    const verification = verifySubmission(claimedByTheClient(ruled), resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
  });

  it('replays an intervention log to the client’s own metrics', () => {
    // ENGINE_CONTRACT § 1.4 clause 2, which the product could not keep until the log was on the
    // wire: *"The server re-simulates the record, log included, and refuses a submission whose
    // metrics do not reproduce."*
    const played: SubmittedRun = { ...EVERYDAY_RUN, interventions: LOG };
    const verification = verifySubmission(claimedByTheClient(played), resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
  });

  it('replays both together, because a player who writes rules also plays the day', () => {
    const both: SubmittedRun = { ...EVERYDAY_RUN, ruleRows: RULES, interventions: LOG };
    const verification = verifySubmission(claimedByTheClient(both), resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
  });

  it('makes a difference to the run, so accepting it is not accepting a no-op', () => {
    /*
     * **The half that decides whether any of the above means anything.** A field the kernel ignored
     * would pass every case above trivially — the claim and the replay would agree because neither
     * saw it — and the wire would be the *twelfth* dead seam: carried, validated, and changing
     * nothing. So the legs are compared, which is `CLAUDE.md`'s standing requirement pointed at a
     * wire instead of at a slider: move the control and require the run to change.
     */
    const plain = metricsOf(runSimulation(asTheClientBuildsIt(EVERYDAY_RUN)).summary);
    const ruled = metricsOf(runSimulation(asTheClientBuildsIt({ ...EVERYDAY_RUN, ruleRows: RULES })).summary);
    const played = metricsOf(runSimulation(asTheClientBuildsIt({ ...EVERYDAY_RUN, interventions: LOG })).summary);
    expect(ruled).not.toEqual(plain);
    expect(played).not.toEqual(plain);
    // Named rather than only compared, so the cell's own numbers are in the file that depends on
    // them and a cell edited to one where the fields go quiet is red here rather than vacuous.
    expect(plain.awtS).toBeCloseTo(23.0038, 3);
    expect(ruled.awtS).toBeCloseTo(26.1676, 3);
    expect(played.awtS).toBeCloseTo(26.2945, 3);
  });

  it('is byte-identical to the run before the fields existed when both are empty', () => {
    // The other direction, and the reason `[]` may not be written as a key. Every score posted
    // before these fields must still re-verify, and it does because an empty list carries nothing.
    const empty = metricsOf(
      runSimulation(asTheClientBuildsIt({ ...EVERYDAY_RUN, ruleRows: [], interventions: [] })).summary,
    );
    expect(empty).toEqual(metricsOf(runSimulation(asTheClientBuildsIt(EVERYDAY_RUN)).summary));
    expect(
      verifySubmission(claimedByTheClient({ ...EVERYDAY_RUN, ruleRows: [], interventions: [] }), resources).ok,
    ).toBe(true);
  });

  it('refuses a submission whose stored rules cannot reproduce its metrics', () => {
    /*
     * **The mutation that says the widening is a wire and not a hole.** The claim is what the run
     * with `RULES` produced; the submission stores a *different* rule list. If `configFor` ignored
     * `ruleRows` — or applied them to something other than the run — this would board. It does not:
     * the server replays what was stored, gets other legs, and refuses.
     *
     * A rejection is still not an accusation, and the wording is asserted for the same reason it is
     * two hundred lines above: the player who lands here most often is one on an older build.
     */
    const honestClaim = claimedByTheClient({ ...EVERYDAY_RUN, ruleRows: RULES });
    const swapped: Submission = {
      run: { ...EVERYDAY_RUN, ruleRows: [{ when: 'car-fuller-than', whenValue: 0.5, then: 'no-new-pickups' }] },
      claimed: honestClaim.claimed,
    };
    const verification = verifySubmission(swapped, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
  });

  it('refuses a submission whose stored log cannot reproduce its metrics', () => {
    // The same mutation one field over: the metrics of a day somebody intervened in, stored as a day
    // nobody touched. A server that dropped the log would board this.
    const honestClaim = claimedByTheClient({ ...EVERYDAY_RUN, interventions: LOG });
    const stripped: Submission = { run: EVERYDAY_RUN, claimed: honestClaim.claimed };
    const verification = verifySubmission(stripped, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
  });
});

/* -------------------------------------------------------------------------- *
 * What the wire still will not carry
 * -------------------------------------------------------------------------- */

describe('the two intervention kinds a submission may not carry', () => {
  it('refuses a mid-run dispatcher switch, because it carries a weight vector inline', () => {
    /*
     * `submission.ts`'s founding rule — *ids rather than inline objects* — with the object being a
     * whole `DispatcherProfile` instead of a two-floor tower with sixteen cars. A switch could only
     * travel as a shipped profile **id** resolved against this server's `data/`, and that is a
     * different field from the one the viewer needs locally, where the driving profile is routinely
     * a derived object no id resolves.
     *
     * Refused by the **cheap** gate, before anything simulates: a submission that could smuggle a
     * vector must not be able to command a replay on the way to being refused.
     */
    const profile = config.dispatcherProfilesById.get('eta');
    const issues = submissionIssues({
      run: {
        ...RUN,
        interventions: [{ atS: 300, change: { kind: 'switch-dispatcher', profile: profile! } }],
      },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    });
    expect(issues.join(' ')).toMatch(/switch-dispatcher.*may not carry/u);
  });

  it('refuses an incident answer, because the incident it answers is not on the wire', () => {
    /*
     * Not a missing field: a missing **cause**. `viz`'s `shift/incidents.ts` writes the day's
     * incident onto the building as `serviceEvents`, decided from the week's day and the calendar,
     * and neither travels. A replay built from ids alone has no incident, so the answer's own
     * service events would be the only mode changes in the run — a different day, accepted as this
     * one. Carrying the answer without its cause would be worse than refusing it.
     */
    const issues = submissionIssues({
      run: {
        ...RUN,
        interventions: [{ atS: 300, change: { kind: 'answer-incident', option: 'Send it back', serviceEvents: [] } }],
      },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    });
    expect(issues.join(' ')).toMatch(/answer-incident.*may not carry/u);
  });

  it('refuses a rule outside the shipped vocabulary before it can command a simulation', () => {
    // The bound that makes a rule list unlike a building: nine conditions, eight actions, and a
    // declared value list for each. Everything else is refused by name.
    const issues = submissionIssues({
      run: { ...RUN, ruleRows: [{ when: 'invent-a-condition' as never, then: 'nearest-car' }] },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    });
    expect(issues.join(' ')).toMatch(/not a declared rule condition/u);
  });

  it('refuses a value the vocabulary does not declare, which is where a smuggled number would go', () => {
    // `whenValue` is the only place in a rule row a *number* travels, so it is the only place a
    // player could put one the editor never offered. `core` refuses it at resolve; this refuses it
    // before the replay.
    const issues = submissionIssues({
      run: { ...RUN, ruleRows: [{ when: 'call-waited', whenValue: 1, then: 'jump-queue' }] },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    });
    expect(issues.join(' ')).toMatch(/whenValue is not one of the values/u);
  });
});

describe('a submission is accepted only if it replays', () => {
  it('accepts the truth, and stores the server’s figures rather than the claim', () => {
    const submission = honest();
    const verification = verifySubmission(submission, resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
    if (!verification.ok) return;
    // What gets persisted is what the server measured. The claim is a challenge, not a record.
    expect(verification.measured.awtS).toBeCloseTo(submission.claimed.awtS, 9);
    expect(verification.measured.awtIsValid).toBe(true);
  });

  it('returns the count behind the mean, from its own replay', () => {
    const submission = honest();
    const verification = verifySubmission(submission, resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
    if (!verification.ok) return;
    /*
     * `legs` is why a board row may print `21.4 s` at all — R13 clause one, which
     * `honesty/properties.ts` puts as *"`n = 5` is not a caveat on `11.3 s`; it is part of what
     * `11.3 s` means"*. Asserted as a real count over this fixture rather than against a constant,
     * because the number that matters is *the one this run produced*, and a fixture whose window
     * served nobody would make the row's denominator a lie in the other direction.
     */
    expect(verification.legs).toBeGreaterThan(0);
    expect(Number.isInteger(verification.legs)).toBe(true);
  });

  it('takes the count from the replay and not from anything a client can send', () => {
    /*
     * There is nowhere in a `Submission` to put a leg count, and this is the test that keeps it so.
     * A denominator is the one number a cheat would most want to choose — halve it and a mean over
     * the easy half of a run looks like a mean over the run — which is why it sits beside
     * `ClaimedMetrics` rather than inside it: never claimed, never compared, never refused on.
     */
    const submission = honest();
    const withJunk = {
      ...submission,
      legs: 1,
      claimed: { ...submission.claimed, legs: 1 },
    } as unknown as Submission;
    const claimedIt = verifySubmission(withJunk, resources);
    const plain = verifySubmission(submission, resources);
    expect(claimedIt.ok && plain.ok).toBe(true);
    if (!claimedIt.ok || !plain.ok) return;
    expect(claimedIt.legs).toBe(plain.legs);
    expect(claimedIt.legs).not.toBe(1);
  });

  it('rejects a better wait than the run produced — the whole point', () => {
    const submission = honest();
    const forged: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS - 5 },
    };
    const verification = verifySubmission(forged, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
    // The wording matters: a rejection is not an accusation, because an honest player on an older
    // build lands here too.
    expect(verification.detail).toMatch(/different build|reference data/u);
  });

  it('rejects a forgery far below the epsilon that would let a real one through', () => {
    // The epsilon exists for a JSON round trip, not as a budget for a cheat. A difference ten times
    // it is still nine orders of magnitude below anything that could move a ranking, and is still
    // caught.
    const submission = honest();
    const nudged: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS - METRIC_EPSILON * 10 },
    };
    expect(verifySubmission(nudged, resources).ok).toBe(false);
  });

  it('accepts a claim that differs by less than the epsilon, which a round trip can produce', () => {
    const submission = honest();
    const jittered: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS + METRIC_EPSILON / 4 },
    };
    expect(verifySubmission(jittered, resources).ok).toBe(true);
  });

  it('refuses a run whose mean the project would not report, whatever was claimed', () => {
    /*
     * `garden-apartments` at 60 % of population per five minutes is far past anything two hydraulic
     * cars can clear. Claiming `awtIsValid: true` cannot buy a ranking, because the flag is checked
     * against the SERVER's run.
     *
     * **The rate is 60 % and used to be 40 %, and the reason is a finding rather than a tuning.**
     * This case's premise was *this run saturates*, and it was true of the window the server used to
     * read — `rise-and-fall`'s five-minute band, which at 40 % reports a queue rising 23.7 persons
     * and refuses the mean. It was never true of the window the **product** reports this building
     * over: under `full-run`, which `viz` has sent since `docs/20` defect 5 and which GitHub issue
     * #315 makes the server agree with, 40 % is quotable at a mean of 76.07 s. So this case was
     * passing on a run the client would have called quotable and the server would have refused —
     * which is the *same* client/server disagreement #315 is about, wearing the other code.
     *
     * 60 % saturates under the window the product actually uses: the trend test sees the queue rise
     * **107.6 persons (5.62/min, 9.5× its own scatter)** over the 1 149 s full-run window, against
     * thresholds of 8 persons and 0.5/min. The assertion below is unchanged and the demand is
     * higher, so nothing here is weakened — the fixture is measured against the window it is now
     * read over instead of one nothing ships.
     */
    const saturating: Submission = {
      run: { ...RUN, arrivalRatePctPop5min: 60 },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    };
    const verification = verifySubmission(saturating, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    // Refused for the right reason: told their queue diverged, not told their arithmetic is wrong.
    expect(verification.code).toBe('awt-not-quotable');
  });

  it('cannot be run against a building the server does not ship', () => {
    const invented: Submission = {
      run: { ...RUN, buildingId: 'two-floors-sixteen-cars' },
      claimed: { awtS: 0.1, wt95S: 0.1, ttdMeanS: 0.1, pctOverLongWait: 0, awtIsValid: true },
    };
    const verification = verifySubmission(invented, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    // A submission carries IDS, never a building. This is what stops a player authoring the tower
    // their score would look best on.
    expect(verification.code).toBe('unknown-building');
  });
});

describe('the cheap gate runs before the expensive one', () => {
  it('rejects a malformed submission on shape, without simulating', () => {
    const bad: Submission = {
      run: { ...RUN, seed: 'not-a-seed', durationS: 7 },
      claimed: { awtS: -1, wt95S: 0, ttdMeanS: 0, pctOverLongWait: 0, awtIsValid: true },
    };
    const issues = submissionIssues(bad);
    // All of them, not the first: an unauthenticated shape error must not be able to command server
    // CPU, and a caller fixing one at a time learns nothing about how many there are.
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.join(' ')).toMatch(/seed/u);
    expect(issues.join(' ')).toMatch(/durationS/u);
  });

  it('passes a well-formed one', () => {
    expect(
      submissionIssues({
        run: RUN,
        claimed: { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true },
      }),
    ).toEqual([]);
  });

  it('refuses a window that could not be a time of day, or that runs off the end of one', () => {
    const claimed = { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true };
    const issuesFor = (windowStartS: number | null): string =>
      submissionIssues({ run: { ...RUN, windowStartS }, claimed }).join(' ');

    expect(issuesFor(-1)).toMatch(/windowStartS/u);
    expect(issuesFor(86_400)).toMatch(/windowStartS/u);
    expect(issuesFor(Number.NaN)).toMatch(/windowStartS/u);
    // `RUN` is 900 s, so a start 300 s before midnight runs past the end of the day.
    expect(issuesFor(86_400 - 300)).toMatch(/past the end of a day/u);

    // And the ones that must pass: a real window, the first instant of the day, and no window.
    expect(issuesFor(255 * 60)).toBe('');
    expect(issuesFor(0)).toBe('');
    expect(issuesFor(null)).toBe('');
  });

  /*
   * GitHub issue #267 — the half of § D286 that lived on the client.
   *
   * § D286 closed this same mismatch by deleting the client's *offer* of a ten-hour run; § D356 then
   * made the same length reachable again without an offer, because the Everyday day is **derived
   * from the record the building's profile matches** rather than picked from a list. A bound on what
   * is offered cannot see a derivation, so the two packages drifted apart a second time and a player
   * who finished a whole day could not post it.
   *
   * Asserted as a window, because that is the only shape a whole day can travel in: `core` refuses a
   * `templateOverrides.durationS` refit on a phase-list record by name (§ D285), so a day named
   * without a window throws rather than runs.
   */
  it('accepts a whole authored day, which is derived rather than offered', () => {
    const claimed = { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true };
    const wholeDay = { ...RUN, durationS: 36_000, windowStartS: 0 };
    expect(submissionIssues({ run: wholeDay, claimed })).toEqual([]);
  });

  it('still refuses a length nobody can reach, so the gate is a gate', () => {
    // The mutation guard on the case above. Widening `ACCEPTED_DURATIONS_S` to *anything* would make
    // that test pass for the wrong reason, and a bound that admits every number is not a bound —
    // `MIN_SUBMIT_INTERVAL_MS` is sized against the longest run this list allows.
    const claimed = { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true };
    for (const durationS of [7, 36_001, 35_999, 86_400]) {
      expect(
        submissionIssues({ run: { ...RUN, durationS, windowStartS: 0 }, claimed }).join(' '),
        String(durationS),
      ).toMatch(/durationS must be one of/u);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * A run that is one part of a day — § D285, and the refusal it replaced
 * -------------------------------------------------------------------------- */

describe('a windowed run can be posted, and is replayed over the part it names', () => {
  /**
   * A lunch peak cut out of the shipped ten-hour day.
   *
   * `office-day` rather than an hour record, because the window only means something on a template
   * long enough to have parts — and because `office-day` is the case that used to fail *loudly*:
   * replayed without a window it reaches `core` as `templateOverrides.durationS` on an authored
   * phase list and is refused by name (§ D275).
   */
  const LATER_START_S = 150 * 60;
  const EARLIER_START_S = 30 * 60;

  const WINDOWED = Object.freeze({
    ...RUN,
    demandTemplateId: 'office-day',
    arrivalRatePctPop5min: null,
    durationS: 1800,
    windowStartS: LATER_START_S,
  });

  /**
   * Both parts are quotable, which is why these two and not a busier pair.
   *
   * A lunch peak on `midtown-office` was the obvious fixture and it is **not usable here**: it
   * saturates, so `verifySubmission` refuses it `awt-not-quotable` before the window has any
   * bearing on the outcome, and a test that accepted that refusal would be asserting nothing about
   * windows. These two measured `awtIsValid` at the shipped rate — AWT 9.20 s and 11.92 s — so the
   * accept below is a real accept and the refusal after it is caused by the window rather than by
   * a mean the board would decline either way.
   */
  const config = (windowStartS: number): SimulationConfig => {
    const built = configFor({ ...WINDOWED, windowStartS }, resources);
    if (typeof built === 'string') throw new Error(`fixture does not resolve: ${built}`);
    return built;
  };

  it('replays the window the player ran, not the whole day', () => {
    // The half that makes the field mean anything. A submission that carried the window and a
    // replay that ignored it would be *worse* than not carrying it: boards would separate by
    // window and then verify every entry against the whole period, so an honest lunch peak would
    // come back as `metrics-do-not-reproduce` — this product's one accusation, spent on a field
    // the server declined to read.
    const built = config(LATER_START_S) as unknown as Record<string, unknown>;
    expect(built['windowStartS']).toBe(LATER_START_S);
    // Derived, never submitted: the far end is `windowStartS + durationS`, so a second number on
    // the wire could disagree with the first.
    expect(built['windowEndS']).toBe(LATER_START_S + 1800);
    // And `durationS` is *not* also passed. Both would throw on this template (§ D275) — measured,
    // not reasoned: the first version of `configFor` passed both and `office-day` refused it.
    expect('durationS' in built).toBe(false);
  });

  it('accepts an honest windowed submission end to end', () => {
    // The whole point, driven through the verifier rather than asserted about the config: this is
    // the run § D288 refused outright in the client, and it now posts.
    const claimed = metricsOf(runSimulation(config(LATER_START_S)).summary);
    expect(claimed.awtIsValid, 'fixture must be quotable or the accept proves nothing').toBe(true);
    const verification = verifySubmission({ run: WINDOWED, claimed }, resources);
    expect(verification.ok, JSON.stringify(verification.ok ? {} : verification)).toBe(true);
  });

  it('refuses the same claim replayed against a different part of the day', () => {
    // Non-vacuity for the two above, and the sharpest form of it. If the window were ignored, a
    // claim from one part would verify against a replay of another and this would pass — the two
    // runs would *be* the same run. It fails because they are not.
    const laterClaim = metricsOf(runSimulation(config(LATER_START_S)).summary);
    const earlierClaim = metricsOf(runSimulation(config(EARLIER_START_S)).summary);
    // The premise, asserted rather than assumed: the two parts really do measure differently.
    expect(laterClaim.awtS).not.toBeCloseTo(earlierClaim.awtS, 3);

    const verification = verifySubmission(
      { run: { ...WINDOWED, windowStartS: EARLIER_START_S }, claimed: laterClaim },
      resources,
    );
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
  });

  it('leaves a run with no window reaching the kernel with no window key at all', () => {
    // `'windowStartS' in config` rather than `=== undefined`, because a key present and undefined
    // is a different object from a key absent, and `core`'s own identity guards read the first —
    // `windowIdentity.test.ts` asserts exactly that about the template it produces.
    const config = configFor(RUN, resources);
    if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
    expect('windowStartS' in (config as object)).toBe(false);
    expect('windowEndS' in (config as object)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * What a row was measured against
 * -------------------------------------------------------------------------- */

/*
 * These cases used to be titled *a board is keyed by what it measures*, and the digest they exercise
 * used to be the board key. `ENGINE_CONTRACT.md` § 12.1 forbids that key in as many words, so the
 * value kept its bytes and lost its second job: it now says **what data a stored row was measured
 * against**, and `boardKey.test.ts` decides which board the row is on.
 *
 * The cases survive the rename because every claim they made was a true claim about the digest and a
 * false one only about the word *board*. The last of them is the load-bearing one: the digest is
 * asserted against a literal hex string, so the split is proved to have moved no byte.
 */
describe('an entry names the data it was measured against', () => {
  const facts = {
    buildingDigest: 'aaa',
    dispatcherDigest: 'bbb',
    templateDigest: 'ccc',
    trafficModel: 'v1',
  };

  it('measures two runs of one configuration against the same data, whatever the seed', () => {
    // The seed is the run, not the data. Hashing it here would make the digest an identity for the
    // replication rather than for what the replication was measured against.
    // (`boardKey.ts#isDailyFixtureRun` is where the seed does matter, and says why.)
    expect(runDataHashOf({ ...RUN, seed: '1' }, facts)).toBe(runDataHashOf({ ...RUN, seed: '999' }, facts));
  });

  it('changes when the data it measured changes', () => {
    // The § D205 / § D213 lesson with money on it: a building edited under a live board would leave
    // every stored score describing a run that no longer exists — and failing to re-verify, so
    // honest old entries would start looking like forgeries. The digest is what makes that visible.
    const moved = runDataHashOf(RUN, { ...facts, buildingDigest: 'aaa2' });
    expect(moved).not.toBe(runDataHashOf(RUN, facts));
  });

  it('separates runs that differ in any input that could move the result', () => {
    const base = runDataHashOf(RUN, facts);
    expect(runDataHashOf({ ...RUN, durationS: 1800 }, facts)).not.toBe(base);
    expect(runDataHashOf({ ...RUN, arrivalRatePctPop5min: 8 }, facts)).not.toBe(base);
    expect(runDataHashOf({ ...RUN, dispatcherProfileId: 'eta' }, facts)).not.toBe(base);
    // `null` — the building's own profile — is a distinct selection, not the absence of one.
    expect(runDataHashOf({ ...RUN, arrivalRatePctPop5min: null }, facts)).not.toBe(base);
    // ...and the engine's own model version, because a v1 score and a v2 score are not comparable
    // however identical the rest is.
    expect(runDataHashOf(RUN, { ...facts, trafficModel: 'v2' })).not.toBe(base);
  });

  it('tells two parts of one day apart, because they are different runs', () => {
    // § D285. A morning window and a lunch window over the same seed measure different traffic, so
    // a row that recorded one under the other's digest would name data it was never measured
    // against. The whole-period run is a third thing again.
    const base = runDataHashOf(RUN, facts);
    const morning = runDataHashOf({ ...RUN, windowStartS: 30 * 60 }, facts);
    const lunch = runDataHashOf({ ...RUN, windowStartS: 255 * 60 }, facts);
    expect(new Set([base, morning, lunch]).size).toBe(3);
  });

  /*
   * GitHub issue #267's safety property, and the reason widening `ACCEPTED_DURATIONS_S` is not a
   * ranking bug: **a ten-hour run never competes against a thirty-minute one.**
   *
   * Verified by construction rather than assumed — `runDataHashOf` puts `durationS` in the canonical
   * string it digests, so every accepted length has its own digest. The case above already proves
   * the general rule at 1 800 s; this one names the whole day, because that is the length the issue
   * is about and a general rule nobody instantiated is how a specific regression hides.
   *
   * **The empty board this used to create is gone**, and it is worth saying which half of #267
   * survived. The property that a ten-hour run is not confused with a thirty-minute one is this
   * digest's and stands. The *cost* — `RISKS.md` R32's board of one, minted by a length nobody else
   * picked — was the board key being this digest, and a run that is not the day's fixture now lands
   * in its player's own log instead.
   */
  it('gives a whole authored day its own digest, so it is never confused with a slice', () => {
    const wholeDay = runDataHashOf({ ...RUN, durationS: 36_000, windowStartS: 0 }, facts);
    const twoHours = runDataHashOf({ ...RUN, durationS: 7_200, windowStartS: 0 }, facts);
    const halfHour = runDataHashOf({ ...RUN, durationS: 1_800, windowStartS: 0 }, facts);
    expect(new Set([wholeDay, twoHours, halfHour]).size).toBe(3);
  });

  it('treats a window starting at zero as a selection, not as its absence', () => {
    // `0` is *the run starts at the top of the day*, `null` is *there is no window*. They are two
    // different statements and `?? undefined` is what keeps them apart — `|| undefined` would fold
    // the first into the second and record a windowed run under the whole-period run's digest.
    expect(runDataHashOf({ ...RUN, windowStartS: 0 }, facts)).not.toBe(runDataHashOf(RUN, facts));
  });

  it('leaves every entry that already exists naming exactly the data it always named', () => {
    /*
     * **This is the assertion that says the split moved no byte**, and it is the same assertion it
     * was before the split — which is the point of leaving the literal alone.
     *
     * Three fields have now been added to `SubmittedRun` without moving this hex: `windowStartS`,
     * and this wave's `ruleRows` and `interventions`. Each is written into the canonical string as
     * `undefined` when the run did not use it, and `canonicalJson` drops `undefined` entries, so a
     * whole-period run with no rules and no log digests to **exactly** the string it digested when
     * none of the three existed. Adding a key unconditionally would have re-digested every honest
     * entry ever stored, for selections their players never made.
     *
     * Asserted against the literal digest rather than against a recomputation, because a
     * recomputation would change with the code and prove nothing.
     */
    expect(runDataHashOf(RUN, facts)).toBe('d77c9681da72ea7aea293a204a1b55ff');
    // Explicitly, rather than only by RUN's shape: the two new fields at their empty values are the
    // same string as their absence.
    expect(runDataHashOf({ ...RUN, ruleRows: [], interventions: [] }, facts)).toBe(
      'd77c9681da72ea7aea293a204a1b55ff',
    );
  });

  it('does move when a run actually carries rules or a log, because those moved the result', () => {
    // The other half of the field's contract. An empty list must not fork the digest and a written
    // one must: a row that recorded a ruled run under the plain run's digest would name data the
    // run was not measured against.
    const base = runDataHashOf(RUN, facts);
    const ruled = runDataHashOf(
      { ...RUN, ruleRows: [{ when: 'call-waited', whenValue: 60, then: 'jump-queue' }] },
      facts,
    );
    const logged = runDataHashOf(
      { ...RUN, interventions: [{ atS: 300, change: { kind: 'park-cars-lobby' } }] },
      facts,
    );
    expect(new Set([base, ruled, logged]).size).toBe(3);
  });

  it('does not fork a board over key order in a record', () => {
    // Digests are over canonical JSON with sorted keys, so a field reordered in `data/` does not
    // silently split a board in two.
    expect(digestOf({ a: 1, b: [2, 3] })).toBe(digestOf({ b: [2, 3], a: 1 }));
    // ...but an array's order IS data, and must still separate.
    expect(digestOf({ b: [3, 2] })).not.toBe(digestOf({ b: [2, 3] }));
  });
});
