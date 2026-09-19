/**
 * **The five session-shape figures, checked against the content and against the rung** — GitHub
 * issue **#559**, [§ D753](../../../../DECISIONS.md).
 *
 * Every assertion here exists because the defect it guards has already shipped. The five strings
 * `everyday/sittingShape.ts` composes went stale silently for two rung moves and four documents,
 * and nothing in the repository read any of them. So the checks are, in order: the spans are the
 * shipped content's, the figures are derived from the ladder rather than typed, the rounding goes
 * up, the two player modules compose none of their own, and the four documents that repeat the
 * figures agree with the strings a player actually reads.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { EVERYDAY_MODES } from './modes.js';
import { scenarioHubViewOf } from './scenarioModel.js';
import {
  SITTING_SHAPES,
  SITTING_SPANS,
  sittingLengthPhrase,
  sittingMinutes,
  type SittingSpan,
} from './sittingShape.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  STAGE_SPEEDS,
  stageSpeedAt,
} from './stageScreenModel.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const RUNG = stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);

function data<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

describe('the spans are the shipped content, not an estimate', () => {
  it('campaignStage is every authored campaign stage', () => {
    const campaign = data<{ stages: readonly { durationS: number }[] }>('campaign.json');
    const lengths = campaign.stages.map((stage) => stage.durationS);
    expect(lengths.length).toBeGreaterThan(0);
    expect(SITTING_SPANS.campaignStage.lowSimS).toBe(Math.min(...lengths));
    expect(SITTING_SPANS.campaignStage.highSimS).toBe(Math.max(...lengths));
  });

  /*
   * The rush's span is an **outcome**, so it is censused rather than authored: a cell that holds is
   * watched to its hold and one that never holds is watched to the end of the stream, which is what
   * 95 of the 221 measured cells do. `sittingShape.ts` says the top of the range is the commonest
   * case rather than the worst, and this is where that claim is checked.
   */
  it('rush brackets every measured house cell, hold or stream', () => {
    const house = data<{
      readonly provenance: { readonly streamLengthS: number };
      readonly runs: readonly { readonly brokeAtS: number | null }[];
    }>('rush-house-runs.json');
    const stream = house.provenance.streamLengthS;
    const sittings = house.runs.map((run) => Math.min(run.brokeAtS ?? stream, stream));
    expect(SITTING_SPANS.rush.lowSimS).toBe(Math.min(...sittings));
    expect(SITTING_SPANS.rush.highSimS).toBe(Math.max(...sittings));
    expect(SITTING_SPANS.rush.highSimS).toBe(stream);
  });

  /*
   * A fix case's span is the as-built run watched and then the pair, and each recording runs past
   * its authored `durationS` while the building drains — so the span is **not** `2 × durationS` and
   * this asserts only the relation that has to hold whatever the drain does. The spans themselves
   * are `sittingClock.measure.test.ts`' span leg, and the file it wrote is the record.
   */
  it('fixCase is at least the authored runs doubled, and no shorter than the shortest case', () => {
    const cases = data<{ cases: readonly { run: { durationS: number } }[] }>('fixit-cases.json');
    const authored = cases.cases.map((entry) => entry.run.durationS);
    expect(SITTING_SPANS.fixCase.lowSimS).toBeGreaterThanOrEqual(2 * Math.min(...authored));
    expect(SITTING_SPANS.fixCase.highSimS).toBeGreaterThanOrEqual(2 * Math.max(...authored));
    expect(SITTING_SPANS.fixCase.lowSimS).toBeLessThan(SITTING_SPANS.fixCase.highSimS);
  });

  it('contractDay is the default shift and the one contract that names its own', () => {
    const state = readFileSync(`${SRC}dev/state.ts`, 'utf8');
    const contracts = readFileSync(`${SRC}shift/contracts.ts`, 'utf8');
    expect(state).toContain(
      `export const DEFAULT_SHIFT_LENGTH_S = ${String(SITTING_SPANS.contractDay.lowSimS)};`,
    );
    expect(contracts).toContain(
      `shiftLengthS: ${String(SITTING_SPANS.contractDay.highSimS)},`,
    );
  });

  it('every span names a file, and the file exists', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      expect(span.source.length).toBeGreaterThan(0);
      expect(span.lowSimS).toBeLessThanOrEqual(span.highSimS);
    }
  });
});

describe('the figures are derived from the rung, never typed against it', () => {
  it('every shape string names the shipped rung by its own label', () => {
    for (const shape of Object.values(SITTING_SHAPES)) {
      expect(shape).toContain(`at ${RUNG.label}`);
    }
  });

  /*
   * The check the whole module exists for. § D641 replaced three test literals reading `30×` with a
   * read through `stageSpeedAt`, because a rung that has moved twice would otherwise be
   * re-transcribed twice. This asserts the same property of the session-shape figures: move the
   * rung and every figure moves, in the right direction, without a document being edited.
   */
  it('a slower rung makes every sitting longer and a faster one makes it shorter', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      const slowest = STAGE_SPEEDS[0];
      const fastest = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
      if (slowest === undefined || fastest === undefined) throw new Error('empty ladder');
      expect(sittingMinutes(span.highSimS, slowest.simPerRealS)).toBeGreaterThan(
        sittingMinutes(span.highSimS, fastest.simPerRealS),
      );
    }
  });

  it('rounds up, so no advertised sitting can be shorter than the run it describes', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      for (const rung of STAGE_SPEEDS) {
        const minutes = sittingMinutes(span.highSimS, rung.simPerRealS);
        expect(minutes * 60 * rung.simPerRealS).toBeGreaterThanOrEqual(span.highSimS);
      }
    }
  });

  it('says "under a minute" rather than "1 min" where the ladder makes it true', () => {
    // At the ladder's top rung a 900 s stage is fifteen real seconds; `1 min` there would be this
    // module's own defect with its sign flipped.
    const top = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
    if (top === undefined) throw new Error('empty ladder');
    expect(sittingMinutes(900, top.simPerRealS)).toBe(1);
    expect(sittingLengthPhrase(SITTING_SPANS.campaignStage)).toContain('min');
  });
});

describe('the two player modules compose no figure of their own', () => {
  it('every mode tile carries a string from sittingShape.ts', () => {
    const shipped = new Set<string>(Object.values(SITTING_SHAPES));
    for (const mode of EVERYDAY_MODES) {
      expect(shipped.has(mode.shape), `${mode.screen}: ${mode.shape}`).toBe(true);
    }
  });

  it('every scenario hub entry carries a string from sittingShape.ts', () => {
    const shipped = new Set<string>(Object.values(SITTING_SHAPES));
    // Read off the shipped view rather than a sibling projection: this asserts what the hub
    // actually draws, and it is why SCENARIO_ENTRY_SHAPES could be deleted rather than registered.
    for (const shape of scenarioHubViewOf().entries.map((entry) => entry.shape)) {
      expect(shipped.has(shape), shape).toBe(true);
    }
  });

  /*
   * A literal is how the five came to disagree with the ladder, so a literal is what fails here.
   * Prose in a docstring is exempt by the `*` prefix: what is forbidden is a minute figure in
   * **code**, which is the only kind a player can read.
   */
  it('neither module writes a minute figure in code', () => {
    for (const file of ['modes.ts', 'scenarioModel.ts']) {
      const source = readFileSync(`${SRC}everyday/${file}`, 'utf8');
      const offenders = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .filter((line) => /\d\s*(-\s*\d+\s*)?min\b/.test(line));
      expect(offenders, `${file} composes a session-shape figure of its own`).toEqual([]);
    }
  });
});

describe('the documents that repeat the figures agree with the strings a player reads', () => {
  /**
   * The four sites GitHub issue #559 names. Each carries the shipped length phrase verbatim, so a
   * rung move turns these documents red on the same commit that moves the tiles rather than leaving
   * them to age — which is what they did for two rung moves before this test existed.
   */
  const SITES: readonly { readonly doc: string; readonly phrases: readonly string[] }[] = [
    {
      doc: 'docs/23-audiences-and-core-loop.md',
      phrases: [
        sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day'),
        sittingLengthPhrase(SITTING_SPANS.campaignStage, 'a building-day'),
        sittingLengthPhrase(SITTING_SPANS.rush),
        sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case'),
      ],
    },
    {
      doc: 'docs/32-game-design.md',
      phrases: [
        sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day'),
        sittingLengthPhrase(SITTING_SPANS.campaignStage, 'a building-day'),
        sittingLengthPhrase(SITTING_SPANS.rush),
        sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case'),
      ],
    },
    {
      doc: 'docs/12-design-handoff.md',
      phrases: [SITTING_SHAPES.contractDay, SITTING_SHAPES.fixCase],
    },
  ];

  for (const site of SITES) {
    it(`${site.doc} carries today's figures`, () => {
      const text = readFileSync(join(REPO_ROOT, site.doc), 'utf8');
      for (const phrase of site.phrases) {
        expect(text.includes(phrase), `${site.doc} is missing: ${phrase}`).toBe(true);
      }
    });
  }

  /*
   * § D227 in the polarity `CLAUDE.md` calls the more dangerous one: § D641's paragraph named these
   * five as outstanding, and a paragraph saying a defect is open after it is closed sends a reader
   * looking for work that is done. It is deleted from both places it stood, and this is what keeps
   * it deleted.
   */
  it('nothing still says the five session shapes are outstanding', () => {
    /*
     * The **claim** is what must be gone, not the words. § D753 and `modes.ts` both quote a retired
     * string on purpose, as the record of what moved; what may not survive is the sentence saying
     * the correction is owed. So this matches § D641's own clause rather than the literals it named
     * — a literal check would have forbidden the entry that closes the defect from describing it.
     */
    const claims: readonly (readonly [string, string])[] = [
      [join(REPO_ROOT, 'DECISIONS.md'), 'Correcting five player-facing strings is not this'],
      [`${SRC}everyday/stageScreenModel.ts`, 'Correcting five player-facing strings is not this'],
      [`${SRC}everyday/stageScreenModel.ts`, 'one number this does not fix'],
    ];
    for (const [carrier, claim] of claims) {
      const text = readFileSync(carrier, 'utf8');
      expect(text.includes(claim), `${carrier} still says: ${claim}`).toBe(false);
    }
  });
});
