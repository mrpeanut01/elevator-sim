/**
 * **Phase 8 § Determinism regression** — golden runs replay byte-identically from stored seeds.
 *
 * ## What already existed, so that this is additive and the claim is checkable
 *
 * | Suite | Covers | Does not cover |
 * |---|---|---|
 * | `core/sim/determinism.test.ts` | same seed, same process, twenty replications of one building; CRN across every shipped profile; streams left where trace generation left them | anything on disk — no record is serialized, so a stored configuration cannot be shown complete |
 * | `validation/storedRunReplay.test.ts` | one building, one profile, five replications: NDJSON round trip and re-execution, plus a **seed-only** negative control | the other fourteen stored fields; the other four buildings; the second demand template; a run that timed out; the persistence contract itself |
 * | `fuzz/determinism.test.ts` | replay and CRN on *generated* buildings | anything committed — every case is synthesised at test time from a fuzz seed |
 * | `benchmark/published.ts` | full-precision published figures with a drift guard | replay: it pins what the answer *is*, not that it can be reproduced from what was stored |
 *
 * The gap this file closes is the committed one. Everything above is generated inside the test
 * process; nothing in the repository says "these exact inputs must keep producing a run that can
 * be reproduced from its own record". That sentence is what a *golden* is for.
 *
 * ## The design constraint, answered
 *
 * A golden that has to be regenerated on every legitimate behaviour change becomes noise, and
 * noise gets regenerated without thought. `golden/manifest.json` therefore stores **no simulator
 * output**: inputs, and the *names* of the keys the envelope carries. Both are invariant under
 * any change to how elevators behave — including the destination-dispatch work landing in
 * parallel with this — and the only diff the file can legitimately need is a key name appearing
 * or disappearing, which is a change to the persistence contract and is precisely what a human
 * should be made to look at. See `golden.ts` for the long version.
 *
 * ## Always-on versus opt-in
 *
 * Always-on: three goldens (Garden Apartments, Midtown Office, Secure Tower), covering the
 * minimal envelope, the full demand bag with two weighted entrances and a >2^53 seed, and four
 * sim knobs including a door-obstruction draw and a run that timed out. Under
 * `ELEVATOR_SIM_DEEP=1` two more join them — the multi-bank transfer building and the
 * constant-ISO template on the largest building — and the cross-process check runs.
 */

import { runSimulation } from '@elevator-sim/core';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appendRunToFile,
  canonicalJson,
  createStoredRun,
  parseStoredRun,
  readRunSetFile,
  runRecordFingerprint,
  serializeStoredRun,
  storedRunFingerprint,
  summaryFingerprint,
} from '../reports/persistence.js';
import { reanalyzeStoredRun, verifySummaryFingerprint } from '../reports/reanalyze.js';
import {
  replaySimulationConfig,
  replaySourcesFrom,
  replayStoredRun,
  type ReplaySources,
} from '../reports/replay.js';
import type { StoredRunConfig, StoredRunRecord } from '../reports/types.js';
import {
  FIELD_PERTURBATIONS,
  UNPERTURBED,
  deepRequested,
  envelopeKeyPaths,
  goldenSimulationConfig,
  goldensFor,
  schemaVersionLine,
  type GoldenSpec,
} from './golden.js';
import { loadResources } from './harness.js';

let sources: ReplaySources;
let scratch: string | undefined;

const TIER = deepRequested() ? 'deep' : 'always-on';
const GOLDENS = goldensFor(TIER);

beforeAll(async () => {
  sources = replaySourcesFrom(await loadResources());
}, 120_000);

afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
});

/**
 * Run a golden and envelope it, exactly as a sweep would.
 *
 * The `SimulationResult` is returned alongside the envelope because `RunRecord` has no `status`
 * field — deliberately, since status is not part of the dataset — and one assertion below is
 * about the timeout *policy*, which only a run that hit its deadline can exercise.
 */
function runGolden(spec: GoldenSpec): { stored: StoredRunRecord; status: string } {
  const config = goldenSimulationConfig(spec, sources);
  const result = runSimulation(config);
  return {
    stored: createStoredRun({
      experimentId: 'phase8/golden',
      experimentSeed: spec.seed,
      replication: 0,
      config,
      result,
    }),
    status: result.status,
  };
}

function store(spec: GoldenSpec): StoredRunRecord {
  return runGolden(spec).stored;
}

describe(`golden runs (${TIER} tier: ${GOLDENS.length} of ${goldensFor('deep').length})`, () => {
  it('reports which goldens are in scope, and at which schema versions', () => {
    console.log(
      `\n[golden] ${schemaVersionLine()}\n[golden] tier ${TIER}: ${GOLDENS.map((g) => g.id).join(', ')}`,
    );
    expect(GOLDENS.length).toBeGreaterThan(0);
    /* Ids are the manifest's primary key; two goldens sharing one would silently halve coverage. */
    expect(new Set(goldensFor('deep').map((g) => g.id)).size).toBe(goldensFor('deep').length);
  });

  /* ------------------------------------------------------------------ *
   * 1. The run reproduces itself, and the record survives a disk round trip
   * ------------------------------------------------------------------ */

  it.each(GOLDENS.map((g) => [g.id, g] as const))(
    '%s replays byte-identically from its stored seed, through NDJSON and back',
    async (_id, spec) => {
      const stored = store(spec);

      /* (a) determinism: the same envelope, re-executed in place. */
      const again = runSimulation(goldenSimulationConfig(spec, sources));
      expect(runRecordFingerprint(again.record)).toBe(runRecordFingerprint(stored.record));

      /* (b) completeness: everything from the writing side is thrown away except the file. */
      scratch ??= await mkdtemp(join(tmpdir(), 'phase8-golden-'));
      const path = join(scratch, `${spec.id}.ndjson`);
      await appendRunToFile(path, stored);
      const reloaded = await readRunSetFile(path);
      expect(reloaded).toHaveLength(1);
      const fromDisk = reloaded[0] as StoredRunRecord;

      const outcome = replayStoredRun(fromDisk, sources);
      if (!outcome.identical) {
        throw new Error(
          `Golden "${spec.id}" did not replay identically from seed ${fromDisk.config.seed}.\n${outcome.differences.join('\n')}`,
        );
      }
      expect(outcome.summaryMatches).toBe(true);
      expect(storedRunFingerprint(fromDisk)).toBe(
        storedRunFingerprint({ ...fromDisk, record: outcome.result.record }),
      );
      /* And re-analysis without re-simulating reaches the same headline numbers. */
      expect(verifySummaryFingerprint(fromDisk)).toBe(true);
      expect(summaryFingerprint(reanalyzeStoredRun(fromDisk))).toBe(fromDisk.summaryFingerprint);

      console.log(
        `[golden] ${spec.id}: seed ${fromDisk.config.seed}, ${String(fromDisk.record.passengers.length)} legs, status ${outcome.result.status} — record ${outcome.storedFingerprint} reproduced`,
      );
    },
    180_000,
  );

  /* ------------------------------------------------------------------ *
   * 2. The persistence contract — the only thing that can legitimately
   *    move this manifest
   * ------------------------------------------------------------------ */

  it.each(GOLDENS.map((g) => [g.id, g] as const))(
    '%s produces exactly the envelope keys the manifest names',
    (_id, spec) => {
      const observed = envelopeKeyPaths(store(spec).config);
      if (canonicalJson(observed) !== canonicalJson(spec.envelopeKeys)) {
        const added = observed.filter((key) => !spec.envelopeKeys.includes(key));
        const removed = spec.envelopeKeys.filter((key) => !observed.includes(key));
        throw new Error(
          `The persisted envelope for golden "${spec.id}" no longer matches golden/manifest.json.\n` +
            `  added:   ${added.join(', ') || '(none)'}\n` +
            `  removed: ${removed.join(', ') || '(none)'}\n` +
            'This is a change to the *persistence contract*, not to elevator behaviour — a replay ' +
            'knob started or stopped being recorded. Nothing about a dispatcher, a weight vector ' +
            'or the physics can produce this failure. Decide whether the new field is replay-' +
            'relevant, add it to FIELD_PERTURBATIONS or to UNPERTURBED with a reason, then update ' +
            'the manifest. Do not update the manifest first.',
        );
      }
      expect(observed).toEqual(spec.envelopeKeys);
    },
    120_000,
  );

  it('serializes and re-parses to the identical envelope', () => {
    for (const spec of GOLDENS) {
      const stored = store(spec);
      const reparsed = parseStoredRun(serializeStoredRun(stored));
      expect(canonicalJson(reparsed.config)).toBe(canonicalJson(stored.config));
      expect(runRecordFingerprint(reparsed.record)).toBe(runRecordFingerprint(stored.record));
    }
  }, 180_000);

  /* ------------------------------------------------------------------ *
   * 3. The negative control, per field
   * ------------------------------------------------------------------ */

  describe('the negative control: every stored field is load-bearing', () => {
    /**
     * Phase 3's control increments the seed and requires the replay to differ. That proves the
     * seed is not decorative and says nothing about the other fourteen fields — a record with the
     * right seed and a dropped `durationS` passes it. So each field is moved on its own, and each
     * is required to be visible in the replayed record or in its summary.
     *
     * "Or in its summary" is not a weakening. `summarize.*` legitimately does not enter the
     * record — it is the *derivation* — so demanding a record change would be demanding the wrong
     * thing. The pair `(recordFingerprint, summaryFingerprint)` is what a reader of a stored
     * result actually consumes, and a field that moves neither is a field nothing reads.
     *
     * ## The claim is over the set, and that is not a hedge
     *
     * A per-golden "every field must move" is a *false* assertion, and asserting it would have
     * meant tuning a golden until it happened to be true. `sim.dispatchRetryS` is the
     * counterexample the first draft found: `simulation.ts` deliberately does **not** re-offer a
     * call every car refused for a structural reason — retrying it on a timer is noise — so the
     * retry cadence is genuinely inert on any run whose refusals are all structural, and is live
     * only where a car declines for a soft reason, which means congestion. That is correct
     * behaviour, and a field being inert *in one configuration* is not evidence of anything.
     *
     * A field inert in **every** configuration is. So the matrix below is reported per golden and
     * asserted across the set: every stored key must be shown load-bearing somewhere, and the
     * `midtown-congested-retry` golden exists specifically to be the somewhere for that one.
     */
    const matrix = new Map<string, Set<string>>();

    it.each(GOLDENS.map((g) => [g.id, g] as const))(
      '%s: reports which stored fields move the replay, one perturbation at a time',
      (_id, spec) => {
        const stored = store(spec);
        const baseRecord = runRecordFingerprint(stored.record);
        expect(stored.summaryFingerprint).toBeDefined();
        const lines: string[] = [];
        let exercised = 0;

        for (const perturbation of FIELD_PERTURBATIONS) {
          const config = perturbation.apply(stored.config);
          if (config === undefined) continue;
          exercised += 1;

          const tampered: StoredRunRecord = { ...stored, config };
          /* A perturbation that makes the run *refuse to finish* is the strongest possible
             evidence that the field is read — `sim.maxEvents` is the case: exhausting the event
             budget is fatal whatever `onTimeout` says, because it means a handler stopped making
             progress rather than that a building saturated. Counting the throw as "moved" is not
             a loosening; swallowing it and reporting "same" would be the loosening. */
          let verdict: string;
          let moved: boolean;
          try {
            const outcome = replayStoredRun(tampered, sources);
            const movedRecord = runRecordFingerprint(outcome.result.record) !== baseRecord;
            const movedSummary = outcome.summaryMatches === false;
            moved = movedRecord || movedSummary;
            verdict = `record ${movedRecord ? 'moved' : 'same '}  summary ${movedSummary ? 'moved' : 'same '}`;
          } catch (error) {
            moved = true;
            verdict = `refused to replay: ${(error as Error).message.slice(0, 60)}…`;
          }
          if (moved) {
            const seen = matrix.get(perturbation.path) ?? new Set<string>();
            seen.add(spec.id);
            matrix.set(perturbation.path, seen);
          }

          lines.push(`    ${perturbation.path.padEnd(34)} ${verdict}`);
        }

        console.log(
          `[golden] ${spec.id} negative control, ${String(exercised)} fields:\n${lines.join('\n')}`,
        );
        expect(exercised).toBeGreaterThan(0);
        /* The seed must be load-bearing on every single golden. That one is invariant 5, and it
           is the assertion Phase 3 made; nothing here relaxes it. */
        expect(matrix.get('seed')?.has(spec.id)).toBe(true);
      },
      300_000,
    );

    it('every stored key is load-bearing on at least one golden, or excused by name', () => {
      const excused = new Set(Object.keys(UNPERTURBED));
      const stored = [...new Set(GOLDENS.flatMap((spec) => spec.envelopeKeys))].sort();
      const inert: string[] = [];
      const uncovered: string[] = [];

      for (const key of stored) {
        if (excused.has(key)) continue;
        /* A stored leaf is covered by a perturbation at that path or at any ancestor of it:
           `demand.directionalSplit` is moved as a unit and `demand.directionalSplit.incoming`
           is one of its leaves. */
        const owners = FIELD_PERTURBATIONS.filter(
          (p) => p.path === key || key.startsWith(`${p.path}.`),
        );
        if (owners.length === 0) {
          uncovered.push(key);
          continue;
        }
        if (!owners.some((p) => (matrix.get(p.path)?.size ?? 0) > 0)) inert.push(key);
      }

      console.log(
        `[golden] load-bearing matrix over ${String(GOLDENS.length)} goldens:\n` +
          [...matrix.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([path, ids]) => `    ${path.padEnd(34)} ${[...ids].join(', ')}`)
            .join('\n'),
      );

      if (uncovered.length > 0) {
        throw new Error(
          `Stored envelope keys with neither a perturbation nor a documented exclusion: ${uncovered.join(', ')}. ` +
            'A field written to every record and never shown to matter is a field a replay cannot ' +
            'vouch for. Add it to FIELD_PERTURBATIONS, or to UNPERTURBED with the reason.',
        );
      }
      if (inert.length > 0) {
        throw new Error(
          `Stored envelope keys that moved nothing on any golden in this tier: ${inert.join(', ')}. ` +
            'Either the field is recorded and never read — a record carrying the wrong value for it ' +
            'would replay "identically", and the identity would mean less than it looks — or the ' +
            'replay path drops it, or no golden reaches the regime where it is live. Add a golden ' +
            'that does rather than removing the check.',
        );
      }
      expect([...uncovered, ...inert]).toEqual([]);

      /* And the exclusion list must not rot: every name in it must still be a stored key. */
      const everything = new Set(goldensFor('deep').flatMap((spec) => spec.envelopeKeys));
      expect([...excused].filter((key) => !everything.has(key))).toEqual([]);
    });

    it('substitutes the two id fields the perturbation table leaves to the suite', () => {
      const spec = GOLDENS[0] as GoldenSpec;
      const stored = store(spec);
      const base = runRecordFingerprint(stored.record);

      /* dispatcherProfileId: a different real profile on the same building and seed. */
      const otherProfile = [...sources.dispatcherProfilesById.keys()].find(
        (id) => id !== spec.dispatcherProfileId,
      );
      expect(otherProfile).toBeDefined();
      const swapped: StoredRunRecord = {
        ...stored,
        config: { ...stored.config, dispatcherProfileId: otherProfile as string },
      };
      const swappedOutcome = replayStoredRun(swapped, sources);
      expect(runRecordFingerprint(swappedOutcome.result.record)).not.toBe(base);

      /* buildingId: a different real building. The stored trafficProfileId then disagrees with
         the substituted building, and the replay must *refuse* rather than run — which is the
         guard the perturbation table defers to this suite for. */
      const otherBuilding = [...sources.buildingsById.keys()].find((id) => id !== spec.buildingId);
      expect(otherBuilding).toBeDefined();
      expect(() =>
        replayStoredRun(
          { ...stored, config: { ...stored.config, buildingId: otherBuilding as string } },
          sources,
        ),
      ).toThrow(/traffic profile/i);

      /* usesElevatorSpecs: the complementary assertion named in UNPERTURBED. */
      expect(() =>
        replaySimulationConfig(stored, {
          buildingsById: sources.buildingsById,
          dispatcherProfilesById: sources.dispatcherProfilesById,
          trafficProfiles: sources.trafficProfiles,
        }),
      ).toThrow(/elevator-specs/i);
    }, 180_000);

    it('honours the stored timeout policy, which is what sim.onTimeout governs', () => {
      const timedOut = GOLDENS.map(runGolden).find((run) => run.status === 'timed-out')?.stored;
      expect(timedOut, 'no golden in this tier timed out; the policy check has nothing to bite on')
        .toBeDefined();
      if (timedOut === undefined) return;

      /* Under the stored policy it replays. Under `throw` the same record must not. */
      expect(replayStoredRun(timedOut, sources).identical).toBe(true);
      const strict: StoredRunConfig = {
        ...timedOut.config,
        sim: { ...(timedOut.config.sim ?? {}), onTimeout: 'throw' },
      };
      expect(() => replayStoredRun({ ...timedOut, config: strict }, sources)).toThrow();
    }, 180_000);
  });

  /* ------------------------------------------------------------------ *
   * 4. Cross-process — opt-in, because it needs a built dist
   * ------------------------------------------------------------------ */

  describe.skipIf(!deepRequested())('across a fresh process', () => {
    /**
     * Everything above runs in the process that produced the record, so it cannot see a
     * dependence on process history, module evaluation order, or anything the host environment
     * supplies once. This spawns a bare `node` on the compiled child and compares fingerprints.
     *
     * Opt-in rather than always-on for one honest reason: it needs `npx tsc -b` to have run,
     * because a child `node` cannot resolve `@elevator-sim/core` to TypeScript sources the way
     * vitest's alias does. Making it always-on would make `vitest run` red on an unbuilt tree.
     */
    it('reproduces the record from a bare node process with no vitest in it', async () => {
      const child = fileURLToPath(new URL('../../dist/validation/goldenChild.js', import.meta.url));
      if (!existsSync(child)) {
        throw new Error(
          `ELEVATOR_SIM_DEEP=1 requires a built tree: ${child} does not exist. Run \`npx tsc -b\` first.`,
        );
      }
      scratch ??= await mkdtemp(join(tmpdir(), 'phase8-golden-'));

      for (const spec of GOLDENS) {
        const stored = store(spec);
        const path = join(scratch, `xproc-${spec.id}.ndjson`);
        await appendRunToFile(path, stored);
        const output = execFileSync(process.execPath, [child, path], {
          encoding: 'utf8',
          env: { PATH: process.env['PATH'] ?? '' },
        }).trim();
        console.log(`[golden] cross-process ${spec.id}: ${output}`);
        expect(output).toBe(`${spec.id} ${runRecordFingerprint(stored.record)} identical`);
      }
    }, 600_000);
  });
});
