/**
 * **Phase 4 acceptance criterion** — "a stored run replays visually identically".
 *
 * ## What counts as evidence here
 *
 * Not "the frames equal themselves". This mirrors what Phase 3 built for run replay
 * (`packages/experiments/src/validation/storedRunReplay.test.ts`) rather than inventing a
 * weaker check, so the recording is **written to disk as JSON**, the process reads it back,
 * `loadConfig` re-reads `data/` from scratch, the `SimulationConfig` is rebuilt from the stored
 * **seed alone**, and the whole simulation is re-executed. Only then are the two frame
 * sequences compared. So a failure would say which of two independent things broke: the
 * simulator's determinism, or whether a recording is *complete* enough to be replayed without
 * the objects that produced it.
 *
 * ## The negative control, and why asserting on the whole sequence was not enough
 *
 * A replay test that cannot fail proves nothing. Phase 3's control increments the stored seed
 * by one and requires the run *not* to reproduce; this does the same and requires the **frame
 * sequence** not to reproduce. Everything else about the two configurations is equal — same
 * building, same dispatcher, same duration, and a `runId` pinned to a constant so the two
 * recordings cannot differ merely by their identity. CLAUDE.md invariant 5 says every persisted
 * record carries its seed; this is what checks that the seed is load-bearing rather than
 * decorative all the way through to the picture.
 *
 * That was originally asserted as `serializeFrames(b) !== serializeFrames(a)` — inequality of
 * the *whole* serialised sequence — and a reviewer showed what that buys: with all seven car
 * fields of `frameCar` replaced by constants, the control still passed, because the landing
 * counts alone differed and one differing field satisfies inequality of the whole. A viewer
 * that drew no car motion at all passed the negative control of Phase 4's acceptance test.
 *
 * So the control is now **per field**. Each of the seven car fields is digested across the whole
 * sequence separately, and each digest must differ between the two seeds. Crippling any single
 * field pins its digest and fails that field's assertion by name, which is also what makes the
 * failure legible: the message says which part of the picture stopped depending on the run.
 *
 * ## Why frames and not pixels
 *
 * The renderer is a pure function of a frame (`render/canvas.test.ts` asserts that directly, by
 * recording the draw calls). So identical frame sequences imply identical pictures, and the
 * criterion reduces to a comparison that needs no browser, no canvas and no image diff.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { afterAll, describe, expect, it } from 'vitest';

import { DATA_DIR, FIXTURE_SEED, fixtureConfig } from '../fixtures.test-helper.js';
import { VIZ_SCHEMA_VERSION, type Frame, type FrameCar, type VizRecording } from '../contract/types.js';
import { frameSequence, serializeFrames } from '../frame/sequence.js';
import { recordRun } from '../record/recordRun.js';

/** 30 Hz at ×10 over a 600 s run: about 1800 frames, which is a real replay, not a spot check. */
const PLAYBACK = { fps: 30, speed: 10 } as const;

/** Every field of {@link FrameCar} that a run can change. Identity fields cannot and are not here. */
const CAR_FIELDS = [
  'heightM',
  'floorId',
  'direction',
  'doorFraction',
  'doorPhase',
  'occupants',
  'loadFactor',
] as const satisfies readonly (keyof FrameCar)[];

/** One field of one car, across a whole sequence. Differs between seeds iff that field is live. */
function carFieldDigest(frames: readonly Frame[], field: (typeof CAR_FIELDS)[number]): string {
  return frames.map((frame) => frame.cars.map((car) => String(car[field])).join(',')).join('|');
}

let scratch: string | undefined;

afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
});

describe('Phase 4 acceptance — a stored run replays visually identically', () => {
  it('round-trips through JSON on disk and re-simulates from the stored seed alone', async () => {
    /* Record. */
    const original = recordRun(fixtureConfig(await loadConfig(DATA_DIR))).recording;
    expect(original.schemaVersion).toBe(VIZ_SCHEMA_VERSION);
    expect(original.seed).toBe(FIXTURE_SEED.toString());

    /* Persist. Nothing from the producing side survives except this file. */
    scratch = await mkdtemp(join(tmpdir(), 'phase4-viz-replay-'));
    const path = join(scratch, 'recording.json');
    await writeFile(path, JSON.stringify(original), 'utf8');

    /* Reload, and sample the reloaded artefact. */
    const reloaded = JSON.parse(await readFile(path, 'utf8')) as VizRecording;
    const fromDisk = serializeFrames(frameSequence(reloaded, PLAYBACK));
    const fromMemory = serializeFrames(frameSequence(original, PLAYBACK));
    expect(fromDisk).toBe(fromMemory);

    /* Re-simulate. `data/` is re-read from scratch and the config is rebuilt from the stored
       seed, so this exercises determinism *and* completeness, not just serialisation. */
    const freshResources: LoadedConfig = await loadConfig(DATA_DIR);
    const replayed = recordRun(
      fixtureConfig(freshResources, { seed: BigInt(reloaded.seed) }),
    ).recording;
    const fromReplay = serializeFrames(frameSequence(replayed, PLAYBACK));

    const frameCount = frameSequence(original, PLAYBACK).length;
    console.log(
      `[phase 4] ${original.runId} seed ${original.seed}: ${String(frameCount)} frames, ` +
        `${String(fromMemory.length)} bytes; disk=${String(fromDisk === fromMemory)}, ` +
        `re-simulated=${String(fromReplay === fromMemory)}`,
    );
    expect(fromReplay).toBe(fromMemory);

    /* And the recording itself, so a field only the producer knew about would be caught too. */
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
    expect(frameCount).toBeGreaterThan(1000);
  }, 600_000);

  it('does not replay identically when the stored seed is altered — negative control', async () => {
    const resources = await loadConfig(DATA_DIR);
    const a = recordRun(fixtureConfig(resources, { seed: FIXTURE_SEED })).recording;
    const b = recordRun(fixtureConfig(resources, { seed: FIXTURE_SEED + 1n })).recording;

    /* Everything but the seed is equal, so a difference below can only come from the seed. */
    expect(b.runId).toBe(a.runId);
    expect(b.buildingId).toBe(a.buildingId);
    expect(b.dispatcherProfileId).toBe(a.dispatcherProfileId);
    expect(b.endedAt).not.toBeNaN();
    expect(a.endedAt).not.toBeNaN();
    expect(b.seed).not.toBe(a.seed);

    const sequenceA = frameSequence(a, PLAYBACK);
    const sequenceB = frameSequence(b, PLAYBACK);
    const framesA = serializeFrames(sequenceA);
    const framesB = serializeFrames(sequenceB);

    /* Field by field, because inequality of the whole is satisfied by any one differing field —
       and it was: with all seven car fields pinned to constants, this test still passed on the
       landing counts alone. Each entry below is a separate, separately-named claim that this
       part of the picture depends on the run. */
    const pinned = CAR_FIELDS.filter(
      (field) => carFieldDigest(sequenceA, field) === carFieldDigest(sequenceB, field),
    );
    console.log(
      `[phase 4] negative control, seed ${a.seed} → ${b.seed}: identical=${String(framesA === framesB)}, ` +
        `car fields pinned across seeds=${pinned.length === 0 ? 'none' : pinned.join(',')}`,
    );
    expect(pinned).toEqual([]);

    /* The counters too, for the same reason. */
    const counter = (frames: readonly typeof sequenceA[number][], read: (f: Frame) => unknown): string =>
      frames.map((frame) => String(read(frame))).join(',');
    expect(counter(sequenceB, (f) => f.totalWaiting)).not.toBe(
      counter(sequenceA, (f) => f.totalWaiting),
    );
    expect(counter(sequenceB, (f) => f.boardedLegs)).not.toBe(
      counter(sequenceA, (f) => f.boardedLegs),
    );

    expect(framesB).not.toBe(framesA);
  }, 600_000);

  it('is not fooled by a recording that merely looks the same at a coarse sample rate', async () => {
    // A one-frame-per-minute comparison would very likely match by accident, because both runs
    // park their cars at a terminal floor between peaks. The criterion is asserted at a real
    // playback rate for that reason; this records the failure mode explicitly so nobody
    // "optimises" the sample rate later and reports a false green.
    const resources = await loadConfig(DATA_DIR);
    const a = recordRun(fixtureConfig(resources, { seed: FIXTURE_SEED })).recording;
    const b = recordRun(fixtureConfig(resources, { seed: FIXTURE_SEED + 1n })).recording;

    const coarse = { fps: 1, speed: 60 } as const;
    const coarseFrames = frameSequence(a, coarse).length;
    const fineFrames = frameSequence(a, PLAYBACK).length;
    expect(coarseFrames).toBeLessThan(fineFrames / 10);
    // At the real rate the two runs must differ. (Whether they also differ at the coarse rate
    // is not asserted — that is exactly the coin-flip this test exists to warn about.)
    expect(serializeFrames(frameSequence(b, PLAYBACK))).not.toBe(
      serializeFrames(frameSequence(a, PLAYBACK)),
    );
  }, 600_000);
});
