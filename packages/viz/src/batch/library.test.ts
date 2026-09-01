/**
 * **The player's dispatcher reaching `estimateCost`, proved on the legs** — issues #167 and #228,
 * [§ D443](../../../../DECISIONS.md).
 *
 * The standing requirement is *move the control and require the run to change, compared on the
 * legs*, and this file is that rule pointed at the seam the two issues are about. The control is
 * the workshop's weight slider; the run is a batch replication; the legs are
 * `[passengerId, carId, boardedAt]` per rider, which is `scope/probes.test-helper.ts#legsOf`'s own
 * projection and is the thing a window statistic cannot stand in for (§ D177: *a mean can be
 * unchanged for a run that is entirely different*).
 *
 * Every config here comes from `runBatch`'s exported `armConfigOf` rather than from a second
 * assembly written in this file. That is the trap `scope/probes.test-helper.ts` names — *"an
 * instrument that does not reproduce the shipped call path measures the instrument"* — and the
 * batch path has three places to get it wrong (the arm's profile, the demand block, the report
 * window), so a hand-built config here could pass while the product was broken.
 *
 * The negative half is the one worth reading. **A batch that carries a saved dispatcher must not
 * be able to move the arm it is compared against**, or every comparison a player runs would be
 * against a baseline nobody else sees. That is asserted on the legs too, and it is why
 * `batchLibraryOf` returns the loaded file's own profile objects for the shipped half rather than
 * a round trip of them through the parser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { replicationSeed } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { batchLibraryOf } from './library.js';
import { armConfigOf, runBatch } from './runBatch.js';
import type { BatchArmRequest, BatchRequest, BatchResources } from './types.js';
import { profileFromSpec, specFromProfile } from '../authoring/dispatcherSpec.js';
import { recordRun } from '../record/recordRun.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';

/** The seed the rest of `batch/` measures at, so a leg here is a leg there. */
const SEED = '20260729';

/**
 * **Midtown Office at its own declared demand, 900 s — and the cell is a measurement, not a taste.**
 *
 * A leg-level test needs a cell where the dispatcher *decides* something, and most do not. This one
 * was chosen by sweeping all seven shipped buildings at four demand settings and two horizons and
 * counting how many legs are answered by a **different car** when the weight vector moves from
 * `waitTime` to `distanceTravelled`:
 *
 * | cell | legs | legs whose car changes |
 * |---|---|---|
 * | `garden-apartments`, own profile, 900 s | **6** | **0** |
 * | `garden-apartments`, own profile, 1 800 s | 18 | 2 |
 * | `chancery-house`, own profile, 900 s | 222 | 137 |
 * | **`midtown-office`, own profile, 900 s** | **448** | **360** |
 * | `vertical-city`, own profile, 900 s | 1 851 | 1 525 |
 *
 * The first row is why this note exists. `garden-apartments`/900 s is the cell `runBatch.test.ts`
 * and `suite.test.ts` use and it was this file's first choice — **six riders in fifteen minutes**,
 * so there is essentially never more than one call outstanding and every dispatcher answers it with
 * the same car. Two arms of a completely different dispatcher produce byte-identical legs there.
 * A test written at that cell would have gone green on a seam that carried nothing, which is the
 * exact failure this lane exists to prevent, arriving in the test rather than in the product.
 *
 * `midtown-office` is also the building `docs/10` § 11 **W3**'s own acceptance clause names and the
 * one § D158 measured the 0-of-50 suppression result on, so a reader who wants a second opinion
 * about this cell has one.
 */
const BUILDING = 'midtown-office';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

/** The workshop's own save path: a spec read off a shipped profile, edited, written back. */
function savedProfile(
  baseId: string,
  id: string,
  name: string,
  weights: Readonly<Record<string, number>>,
) {
  const base = requireDispatcher(config, baseId);
  const spec = specFromProfile(base, name);
  return profileFromSpec({ ...spec, weights }, { id, base });
}

function resourcesWith(saved: readonly ReturnType<typeof savedProfile>[]): BatchResources {
  const library = batchLibraryOf(config.dispatcherProfiles, saved);
  if (!library.ok) throw new Error(`the library refused this fixture: ${library.reason}`);
  return {
    building: requireBuilding(config, BUILDING),
    dispatcherProfiles: library.library,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

function requestWith(arms: readonly BatchArmRequest[]): BatchRequest {
  return {
    buildingId: BUILDING,
    seed: SEED,
    durationS: 900,
    replications: 1,
    arms,
    arrivalRatePctPop5min: null,
  };
}

/**
 * The legs one arm actually runs, as a comparable string.
 *
 * The seed derivation is `replicationSeed(request.seed, 0)` because that is the line `runBatch`'s
 * own loop draws — *"one seed per index, drawn once, shared by every arm"* — so two arms compared
 * here are compared under common random numbers exactly as the product compares them.
 */
function legsOfArm(request: BatchRequest, resources: BatchResources, arm: BatchArmRequest): string {
  const base = armConfigOf(request, resources, arm);
  const { recording } = recordRun({
    ...base,
    seed: replicationSeed(request.seed, 0),
    replication: 0,
  });
  return JSON.stringify(
    recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('a saved dispatcher reaches the batch', () => {
  it('is refused before this lane existed — the wire, named', () => {
    /*
     * The positive control for every assertion below. Without the merge, the id resolves to
     * nothing and the batch cannot start; this is the sentence issues #167 and #228 are about, and
     * asserting it here is what stops the tests below passing for the wrong reason (a `find` that
     * matched a shipped profile, say).
     */
    const shippedOnly: BatchResources = {
      building: requireBuilding(config, BUILDING),
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
    const request = requestWith([
      { armId: 'baseline', dispatcherProfileId: 'collective' },
      { armId: 'candidate', dispatcherProfileId: 'yours-1' },
    ]);
    expect(() => runBatch(request, shippedOnly)).toThrow(/is not in this build's data\//);
  });

  it('changes the legs when the weight vector moves — the standing requirement, both directions', () => {
    /*
     * **Both directions, because only the pair is evidence.** `collective` is `{waitTime: 1.0}` plus
     * `noDirectionReversal`, so a spec read off it and saved *unchanged* is `collective` — and the
     * first assertion requires exactly that, byte for byte on the legs. Without it, "the legs
     * differ" could be a save path that mangles a profile rather than a slider that reaches
     * `estimateCost`; with it, the only thing left that can explain the second assertion is the
     * weight.
     *
     * The moved control is what the cost function is made of: `distanceTravelled` alone is *answer
     * whoever is nearest*, against `waitTime`'s *answer whoever has waited longest*. Both are
     * declared terms read under `up-down-buttons`, so neither is § D112's defect (a weight the
     * engine will not read) wearing a slider.
     *
     * This assertion is also how the *third* refusal drafted for `batchLibraryOf` was found to be
     * unfireable: the first draft of this test wrote `travelDistance`, the library refused it, and
     * the refusal came from `parseDispatcherProfiles` rather than from the `resolveWeights` call
     * written to catch it.
     */
    const unchanged = savedProfile('collective', 'yours-1', 'Unchanged', { waitTime: 100 });
    const moved = savedProfile('collective', 'yours-2', 'Nearest', { distanceTravelled: 100 });
    const resources = resourcesWith([unchanged, moved]);
    const request = requestWith([
      { armId: 'shipped', dispatcherProfileId: 'collective' },
      { armId: 'unchanged', dispatcherProfileId: 'yours-1' },
      { armId: 'moved', dispatcherProfileId: 'yours-2' },
    ]);

    const shipped = legsOfArm(request, resources, request.arms[0] as BatchArmRequest);
    const saved = legsOfArm(request, resources, request.arms[1] as BatchArmRequest);
    const edited = legsOfArm(request, resources, request.arms[2] as BatchArmRequest);

    // Non-empty first: two empty runs are also "identical", and that is the failure this guards.
    expect(shipped.length).toBeGreaterThan(100);
    expect(saved).toBe(shipped);
    expect(edited).not.toBe(shipped);
  });

  it('carries a flag as well as a weight — the editor\u2019s other control reaches the run too', () => {
    /*
     * The weight test above moves a number. This one moves a *switch*: `DispatcherFlags.bypass`
     * writes `answer.bypassLoadThreshold`, which is a different field in a different stage, so a
     * merge that carried `weights` and dropped the rest would pass the test above and fail here.
     * `profileFromSpec` always writes the field (on or off), which is why the contrast is against
     * the saved profile rather than against `collective`.
     *
     * **This control needs the cell more than the weights do, and the sweep says so.** At
     * `midtown-office` on the building's own profile it moves 266 of 448 legs; at the *same
     * building* with demand typed down to 3 %pop/5 min it moves **none**, and at `chancery-house`
     * and `crown-hotel` it moves none at any of the four settings under 900 s. That is not the
     * switch being broken — a load threshold cannot bite until a car fills, which is the same shape
     * CLAUDE.md records for the Level-1 panel's over-subscription defect. It is the reason a
     * leg-level test has to name its cell and say why the cell can show the change.
     */
    const base = requireDispatcher(config, 'collective');
    const spec = specFromProfile(base, 'Bypass');
    const off = profileFromSpec({ ...spec, flags: { ...spec.flags, bypass: false } }, { id: 'yours-1', base });
    const on = profileFromSpec({ ...spec, flags: { ...spec.flags, bypass: true } }, { id: 'yours-2', base });
    const resources = resourcesWith([off, on]);
    const request = requestWith([
      { armId: 'off', dispatcherProfileId: 'yours-1' },
      { armId: 'on', dispatcherProfileId: 'yours-2' },
    ]);

    expect(legsOfArm(request, resources, request.arms[1] as BatchArmRequest)).not.toBe(
      legsOfArm(request, resources, request.arms[0] as BatchArmRequest),
    );
  });

  it('leaves the arm it is compared against byte-identical', () => {
    /*
     * The negative pin, and the reason `batchLibraryOf` keeps the loaded file's own profile objects
     * for the shipped half. A player who saves a dispatcher must not thereby move the baseline
     * every published figure in this project was measured against — otherwise *"better than
     * collective"* would mean something different on their machine.
     */
    const request = requestWith([{ armId: 'baseline', dispatcherProfileId: 'collective' }]);
    const bare = resourcesWith([]);
    const carrying = resourcesWith([savedProfile('collective', 'yours-1', 'Mine', { waitTime: 100 })]);

    expect(legsOfArm(request, carrying, request.arms[0] as BatchArmRequest)).toBe(
      legsOfArm(request, bare, request.arms[0] as BatchArmRequest),
    );
  });

  it('names the arm by the display name the player gave it', () => {
    /*
     * `docs/21` § 3.1 (4)'s acceptance clause: *"verdict names it by display name"*. `runBatch`
     * reads the name off the **resolved** profile, so this passing is the merge having happened
     * rather than the request echoing itself back.
     */
    const resources = resourcesWith([savedProfile('collective', 'yours-1', 'Rush-hour special', { waitTime: 100 })]);
    const result = runBatch(
      requestWith([
        { armId: 'baseline', dispatcherProfileId: 'collective' },
        { armId: 'candidate', dispatcherProfileId: 'yours-1' },
      ]),
      resources,
    );
    expect(result.arms[1]?.dispatcherProfileName).toBe('Rush-hour special');
    expect(result.arms[1]?.dispatcherProfileId).toBe('yours-1');
  });

  it('holds common random numbers between a saved arm and a shipped one', () => {
    /*
     * CLAUDE.md § Statistical discipline. A paired interval between a player's dispatcher and a
     * shipped one is arithmetic on unrelated populations unless both arms saw the same passengers,
     * and the dispatcher is the one field the trace is not a function of — which stays true of a
     * dispatcher that arrived on a `postMessage` rather than out of `data/`.
     */
    const resources = resourcesWith([savedProfile('collective', 'yours-1', 'Mine', { waitTime: 100 })]);
    const result = runBatch(
      requestWith([
        { armId: 'baseline', dispatcherProfileId: 'collective' },
        { armId: 'candidate', dispatcherProfileId: 'yours-1' },
      ]),
      resources,
    );
    expect(result.crn.aligned).toBe(true);
    expect(result.crn.checkedComparisons).toBe(1);
    expect(result.crn.mismatches).toEqual([]);
  });
});

describe('batchLibraryOf', () => {
  it('returns the loaded file by identity when nothing is carried', () => {
    /*
     * § D153's criterion, restated for this seam: closing it must cost nothing while nothing opts
     * in. `toBe`, not `toEqual` — a copy that happens to be equal is not the promise.
     */
    const outcome = batchLibraryOf(config.dispatcherProfiles, []);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.library).toBe(config.dispatcherProfiles);
  });

  it('refuses a saved dispatcher whose id a shipped one already has, by the reader’s name for it', () => {
    /*
     * **The player's name, not the id, and that is the fix rather than the flavour.** A reader who
     * has to act on this sentence knows their dispatcher as *Sneaky*; `eta` is a slug that appears
     * on no screen they have opened. It also names the move that clears it, because a refusal that
     * says only *no* leaves a player with nothing to do — `everyday/benchScreen.ts` draws this on a
     * Casual screen, which is what the first draft of this sentence had not accounted for.
     */
    const shadow = savedProfile('collective', 'eta', 'Sneaky', { waitTime: 100 });
    const outcome = batchLibraryOf(config.dispatcherProfiles, [shadow]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain('Sneaky');
      expect(outcome.reason).toContain('already ships');
      expect(outcome.reason, 'the refusal says no and not what to do about it').toContain('new name');
      // The slug is deliberately absent: it is this file's word for the thing, not the reader's.
      expect(outcome.reason).not.toContain('data/');
    }
  });

  it('refuses two saved dispatchers under one id', () => {
    const a = savedProfile('collective', 'yours-1', 'One', { waitTime: 100 });
    const b = savedProfile('collective', 'yours-1', 'Two', { distanceTravelled: 100 });
    const outcome = batchLibraryOf(config.dispatcherProfiles, [a, b]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain('share one id');
      expect(outcome.reason).toContain('new name');
    }
  });

  it("refuses a weight on a term the library does not declare, in the parser's own words", () => {
    /*
     * `weights` is `z.record(identifier, z.number())`, so `waitTimeeee` is a perfectly good
     * identifier and the *shape* is fine. It is refused anyway, and by the **parse** —
     * `dispatcherProfilesSchema` cross-checks each weight against the file's own `terms`. That is
     * the finding recorded in `library.ts`'s docstring: the `resolveWeights` call written as a
     * third refusal could never fire, because `core`'s `policy.test.ts` asserts `DECLARED_TERM_IDS`
     * equals that same array. The message asserted here is therefore the one a reader would
     * actually be shown, and it is better than the one that was going to be written for them.
     */
    const typo = {
      ...savedProfile('collective', 'yours-1', 'Typo', {}),
      weights: { waitTimeeee: 1 },
    };
    const outcome = batchLibraryOf(config.dispatcherProfiles, [typo]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain('unknown cost term "waitTimeeee"');
      expect(outcome.reason).toContain('Declared terms:');
      /*
       * **This one keeps the loader's notation and says so**, where the two refusals above drop it.
       * The distinction is `editedProfile.ts`'s rule rather than a taste: *"whatever `core`
       * refuses, this refuses, with `core`'s own message."* A friendlier paraphrase of a schema
       * error is a second answer to *why not*, and this repository has a rule about those. What is
       * owed instead is attribution, so a reader knows the notation is not this screen's voice.
       */
      expect(outcome.reason).toContain("the loader's own");
    }
  });

  it("refuses a document core's own parser will not have", () => {
    const mangled = { ...savedProfile('collective', 'yours-1', 'Mangled', { waitTime: 100 }), name: '' };
    const outcome = batchLibraryOf(config.dispatcherProfiles, [mangled]);
    expect(outcome.ok).toBe(false);
  });

  it('leaves the shipped profiles object-identical when something is carried', () => {
    /*
     * The mechanical half of the leg-level negative pin above. Parsing the merged document is a
     * *gate*; the profiles that go into the run are the loaded file's own, so a batch carrying a
     * player's dispatcher cannot round-trip the shipped ones through zod on its way to a run.
     */
    const outcome = batchLibraryOf(config.dispatcherProfiles, [
      savedProfile('collective', 'yours-1', 'Mine', { waitTime: 100 }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const [index, shipped] of config.dispatcherProfiles.profiles.entries()) {
      expect(outcome.library.profiles[index]).toBe(shipped);
    }
    expect(outcome.library.profiles).toHaveLength(config.dispatcherProfiles.profiles.length + 1);
  });
});

/* -------------------------------------------------------------------------- *
 * Every surface that posts a batch sends the shelf — derived, never listed
 * -------------------------------------------------------------------------- */

/**
 * **The guard that stops a sixth batch surface forgetting** — issues #167 and #228.
 *
 * Five places in this package start a `dev/batchWorker.ts` and post a `BatchWorkerRequest`: the
 * Compare bench, the suite, the Lab, the Everyday bench and the gauntlet. Each of them had to be
 * edited by hand to carry `savedProfiles`, and a sixth added next year will not be — which is the
 * precise shape of the defect this lane is fixing, arriving from the fix for it. The Everyday bench
 * is the proof that this is not hypothetical: it *offered* saved dispatchers in its field from the
 * day it was written, because it read `host.dispatchers()`, and it could not run one, because
 * nobody thought about the other end of a `postMessage`.
 *
 * So the post sites are **found on disk** rather than named here — `src/index.test.ts`'s own
 * discipline, where a guard iterates *"the entry-point set derived from the directory rather than
 * five hand-written names."* A file that starts a batch and does not send the shelf fails this,
 * and a file that is added fails it without anybody remembering this test exists.
 *
 * The check is textual and it is bounded to the call it is about: a `postMessage(` whose argument
 * list contains `kind: 'run'` must also contain `savedProfiles`. It cannot tell whether the value
 * is the *right* shelf — `library.test.ts`'s leg-level cases and
 * `dev/savedDispatcher.browser.test.ts`'s journey own that — and it does not need to. It answers
 * one question no other check in this repository can: *did somebody wire a new surface and stop
 * halfway?*
 *
 * ## `kind: 'run'` is two protocols, and the first draft of this guard accused the wrong one
 *
 * `dev/shiftRunner.ts` posts a **`ShiftWorkerRequest`** with the same tag, and the scan reported it
 * as a batch surface that had forgotten the shelf. It has not: a shift request carries
 * `config: job.config` — a whole `SimulationConfig`, dispatcher profile **object** included, put
 * there by `dev/state.ts#drivingProfileOf` — so the single-run path has always run a saved
 * dispatcher and needs nothing from this module. That asymmetry is the entire subject of
 * `batch/library.ts`'s docstring, and finding it again from the other end is a reasonable way to
 * be sure it is true.
 *
 * So a site counts when its **file speaks the batch worker's protocol** — names
 * `BatchWorkerRequest` — rather than when its call happens to use the tag. That is a discriminator
 * about the contract rather than about the spelling of one field, and it is the reason this is not
 * keyed on the presence of a `request:` key: two protocols may share a field name tomorrow as they
 * share a tag today.
 */
describe('every batch a surface starts carries the reader’s shelf', () => {
  /** One `postMessage(...)` call found in a shipped source file. */
  interface PostSite {
    readonly file: string;
    readonly call: string;
  }

  function postSitesIn(source: string, file: string): readonly PostSite[] {
    const sites: PostSite[] = [];
    /*
     * Balanced-paren scan rather than a regex, because every one of these calls spans lines and
     * contains nested object literals — a `.*?\)` would stop at the first inner `)` and a greedy
     * one would swallow the rest of the file. Depth counting is the smallest thing that is right.
     */
    let index = source.indexOf('postMessage(');
    while (index !== -1) {
      let depth = 0;
      let end = index + 'postMessage'.length;
      do {
        const character = source[end];
        if (character === '(') depth += 1;
        else if (character === ')') depth -= 1;
        end += 1;
      } while (depth > 0 && end < source.length);
      sites.push({ file, call: source.slice(index, end) });
      index = source.indexOf('postMessage(', end);
    }
    return sites;
  }

  const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

  function shippedSources(directory: string): readonly string[] {
    const out: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        out.push(...shippedSources(full));
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.includes('.test.') &&
        !entry.name.endsWith('.test-helper.ts')
      ) {
        out.push(full);
      }
    }
    return out;
  }

  const runPosts = shippedSources(VIZ_SRC)
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      // The protocol discriminator — see the docstring on `kind: 'run'` belonging to two of them.
      if (!source.includes('BatchWorkerRequest')) return [];
      return postSitesIn(source, relative(VIZ_SRC, file));
    })
    .filter((site) => site.call.includes("kind: 'run'"));

  it('finds the five surfaces, so the assertion below is not vacuous', () => {
    /*
     * The floor is five and not `> 0`: this scan going quiet — a renamed method, a helper that
     * wraps the post — would otherwise report *"every surface carries it"* about no surfaces at
     * all, which is `browserTier.test.ts`'s own non-vacuity argument. It is a floor rather than an
     * equality so that adding a sixth surface fails on the clause below, where the message names
     * the file, rather than here on an arithmetic mismatch.
     */
    expect(runPosts.length, 'the batch post sites could not be found on disk').toBeGreaterThanOrEqual(5);
  });

  it('sends `savedProfiles` from every one of them', () => {
    const forgetful = runPosts.filter((site) => !site.call.includes('savedProfiles'));
    expect(
      forgetful.map((site) => site.file),
      'these files start a batch without the reader’s saved dispatchers, so an arm naming one ' +
        'cannot resolve — see batch/library.ts',
    ).toEqual([]);
  });
});
