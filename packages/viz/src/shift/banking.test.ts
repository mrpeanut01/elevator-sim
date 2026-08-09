/**
 * **A run read off disk does not close a day — GitHub issue #136, driven rather than argued.**
 *
 * ## What the issue asks for, and why the obvious test would have passed against the bug
 *
 * The acceptance is a recording built from a **different building**, loaded, and required to behave
 * the chosen way. It also names the trap: *asserting on shell state would pass against the bug,
 * because the bug is that shell state is what gets used.* A case that loaded a recording and then
 * checked `state.week` against what the shell thought the day was would have agreed with the defect
 * exactly — the defect is that agreement.
 *
 * So the decision is a pure function over the **run**, and this file hands it two real recordings on
 * two shipped buildings, one of them round-tripped through the shipped document format rather than
 * constructed: `writeRecordingDocument` → `readRecordingDocument` is the exact path
 * `dev/main.ts#loadRecordingFile` takes, so what is refused here is the artefact a player actually
 * produces with **Save recording** and **Load recording**.
 *
 * ## The half this file cannot reach, said rather than implied
 *
 * That the *shell* asks, and asks before it writes. `closeShift` lives inside `boot()`, which no
 * Node test can call — it needs a document, a canvas and a click. `main.progression.test.ts` reads
 * that wiring off `main.ts` as text, in the pattern its own docstring argues for: weak evidence
 * about behaviour, strong evidence about a line having been deleted. The guard for this decision
 * lives there, beside § D232's and § D311's.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { readRecordingDocument, writeRecordingDocument } from '../record/document.js';
import { recordRun } from '../record/recordRun.js';

import { LOADED_RUN_CANNOT_BANK, bankingRefusalFor } from './banking.js';

let config: LoadedConfig;

/** One real run on a shipped building, short enough to stay in the millisecond tier. */
function runOn(buildingId: string, seed: bigint): VizRecording {
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId,
    durationS: 600,
    onTimeout: 'report',
  });
  return recordRun({ ...base, seed }, { recordDecisions: false }).recording;
}

/** The shipped load path, end to end: written to a document and read back off it. */
function throughAFile(recording: VizRecording): VizRecording {
  const loaded = readRecordingDocument(writeRecordingDocument(recording));
  if (!loaded.ok) throw new Error(`the document did not read back: ${loaded.failure.message}`);
  return loaded.recording;
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

describe('a recording loaded from disk cannot bank a day — issue #136', () => {
  it('refuses a run built from a different building, read back through the document format', () => {
    // What the shell simulated: a day on Midtown Office. What the player then loaded: a run on
    // Chancery House, a different tower with a different population, core and car count.
    const simulated = runOn('midtown-office', 424_242n);
    const loaded = throughAFile(runOn('chancery-house', 20_260_809n));

    // The two are genuinely different runs on genuinely different buildings — asserted rather than
    // assumed, because a fixture that quietly resolved both to one building would make the refusal
    // below true for the wrong reason.
    expect(loaded.buildingId).not.toBe(simulated.buildingId);

    expect(bankingRefusalFor(loaded, simulated)).toBe(LOADED_RUN_CANNOT_BANK);
  });

  it('refuses a run on the **same** building just as flatly, because sameness is not the ground', () => {
    /*
     * The case that separates this decision from the issue's option (c) — *allow when the
     * configuration matches*. A second run on the same building matches on the one axis a reader
     * would think to check and is still not this shell's day: the week's day number, its contract,
     * its calendar period, its event and all three of `ShiftPlan`'s axes are absent from both
     * files. A gate that let this one through would be reporting a match it had not made.
     */
    const simulated = runOn('midtown-office', 424_242n);
    const loaded = throughAFile(runOn('midtown-office', 999_001n));
    expect(loaded.buildingId).toBe(simulated.buildingId);
    expect(bankingRefusalFor(loaded, simulated)).toBe(LOADED_RUN_CANNOT_BANK);
  });

  it('refuses a byte-identical reload of the run on screen, and that is the point rather than an edge', () => {
    /*
     * **The case that found the defect in the first draft of this decision.**
     *
     * `runId` looks like a per-run identity. It is `` `${building}-${dispatcher}-${seed}` `` by
     * default and `viz`'s own fixture hard-codes it, so a first draft comparing ids let a Chancery
     * House file bank a Midtown Office day — option (c) arriving by accident, on three axes, under
     * a unique identifier's name. `shift/banking.ts` records it.
     *
     * The replacement is object identity, and this case is what pins it: the *same run*, written to
     * a document and read straight back, is refused. Nothing about the file distinguishes it from
     * the run on screen — same building, same seed, same `runId`, same legs — and it is still not
     * the object this shell's simulator produced. A comparison of contents could not tell these
     * apart and would therefore have to let every file through or none.
     */
    const simulated = runOn('midtown-office', 424_242n);
    const reloaded = throughAFile(simulated);
    expect(reloaded.runId).toBe(simulated.runId);
    expect(reloaded.legs.length).toBe(simulated.legs.length);
    expect(bankingRefusalFor(reloaded, simulated)).toBe(LOADED_RUN_CANNOT_BANK);
  });

  it('lets the run this shell simulated through, which is the control that makes the rest mean something', () => {
    // Without this, `bankingRefusalFor` returning the refusal unconditionally would pass every case
    // above and break the product.
    const simulated = runOn('midtown-office', 424_242n);
    expect(bankingRefusalFor(simulated, simulated)).toBeNull();
  });

  it('refuses before this shell has simulated anything, rather than treating absence as consent', () => {
    const loaded = throughAFile(runOn('chancery-house', 20_260_809n));
    expect(bankingRefusalFor(loaded, undefined)).toBe(LOADED_RUN_CANNOT_BANK);
  });

  it('has nothing to say about no run at all', () => {
    // `undefined` on screen is not a refusal — there is no run to refuse. The shell's own first
    // line returns for it, and a sentence here would put a refusal on a screen with nothing on it.
    expect(bankingRefusalFor(undefined, undefined)).toBeNull();
  });
});

describe('the refusal is a sentence a player can act on', () => {
  it('names what a loaded run is for and what to do instead', () => {
    expect(LOADED_RUN_CANNOT_BANK).toContain('loaded from a file');
    expect(LOADED_RUN_CANNOT_BANK).toContain('nothing is banked');
    expect(LOADED_RUN_CANNOT_BANK).toContain('run the shift here');
  });

  it('names no difference, because naming one would offer the option this decision refused', () => {
    /*
     * Deliberate, and asserted so a later edit cannot make the sentence "more helpful" into
     * option (c) by implication. *"…because it is a different building"* would tell a reader that a
     * matching building banks — which is exactly the check `shift/banking.ts` argues cannot be made
     * from a file's contents.
     */
    for (const word of ['building', 'seed', 'dispatcher', 'matches', 'different']) {
      expect(LOADED_RUN_CANNOT_BANK, word).not.toContain(word);
    }
  });

  it('carries no figure, so a refusal cannot be read as a reading', () => {
    // The honesty corpus judges this string with everything else on the surface; this is the one
    // property worth failing fast on rather than discovering in a sweep.
    expect(LOADED_RUN_CANNOT_BANK).not.toMatch(/\d/);
  });
});
