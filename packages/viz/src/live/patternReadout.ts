/**
 * The stage header's pattern readout — what the weight-set selector is doing, at the playhead.
 *
 * ## The gap this closes, and the shape of the fix
 *
 * `docs/18` § Slice 4: the detector exists in `core`, is configurable from the selector editor,
 * and reaches the run — and the one genuinely missing piece is that the pattern in force was
 * never surfaced to a player *during* a run. The recording now carries it
 * (`VizRecording.patternSwitches`, schema 9), and this module is the pure half of the readout:
 * a function of `(recording, simTimeS)` and nothing else, so the header line is derivable in
 * Node with no browser — the same property every other sampler in this package keeps — and a
 * scrubbing playhead crossing a switch re-derives the words from the same source the run wrote.
 *
 * ## The words are the model's, never a bare id — Everyday handoff §16 rule 11
 *
 * Pattern ids are data ids (`up-peak`, `two-way`). What a player reads is
 * `authoring/selectorSpec.ts#PATTERN_NAMES` — the authored table already guarded both ways
 * against the shipped detector's `patterns` — and a pattern this build has no name for renders
 * the honest fallback, a plain phrase *plus* its id, which rule 11 classifies as a content bug
 * rather than a screen bug: `a pattern this build cannot name (rush-hour)`.
 *
 * ## Absence is honest in both directions
 *
 * A recording with no `patternSwitches` field never built the detector, and the readout is
 * {@link PatternReadout.kind} `'no-detector'` with an **empty** label: the header hides the pill
 * rather than drawing a placeholder that reads as a pattern. A recording whose field is present
 * but whose banks all stand on the profile's own weights at the playhead reads `'no-pattern'` —
 * *no clear pattern* — because a live detector that abstains is a fact worth one phrase and
 * no more. And when two banks genuinely disagree at the playhead the readout says so instead of
 * picking one; per-bank truth folded into one pill by silently dropping a bank would be a
 * caption that does not describe the picture.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import { ruleProvenanceName } from '../authoring/ruleSpec.js';
import { patternLine, patternName } from '../authoring/selectorSpec.js';
import type { VizRecording } from '../contract/types.js';

/** What the header should say about the selector, at one instant. */
export interface PatternReadout {
  /**
   * `no-detector` — the run never built one; the label is `''` and the pill is hidden.
   * `no-pattern` — a detector watched and no declared regime fits at this playhead.
   * `pattern` — one pattern is in force across every selecting bank.
   * `mixed` — selecting banks disagree at this playhead; the label names every pattern in force.
   */
  readonly kind: 'no-detector' | 'no-pattern' | 'pattern' | 'mixed';
  /** The pill's text. `''` exactly when {@link kind} is `no-detector`. */
  readonly label: string;
  /**
   * A longer sentence for the pill's `title` — the pattern's own {@link patternLine} when one
   * pattern is in force and this build has a sentence for it, `''` otherwise. Never invented.
   */
  readonly title: string;
  /** The pattern ids in force across banks, sorted, `null`s dropped. Data ids, for tests. */
  readonly patternIds: readonly string[];
}

/** The abstention phrase. A state, not a placeholder: the detector is live and undecided. */
const NO_PATTERN_LABEL = 'no clear pattern';

/**
 * Rule 11's honest fallback: a plain phrase plus the id, never the id alone.
 *
 * Two naming paths, one precedence: the detector's patterns through `PATTERN_NAMES`, and the
 * Everyday rules' provenance ids (`rule-2:lobby-queue-passes:12`) through `ruleProvenanceName`,
 * which composes the header's words from the same core table the rules editor renders — so the
 * pill says *rule 2 — the lobby queue passes 12 people*, never the raw id. An id neither path
 * can name gets the fallback, which rule 11 classifies as a content bug rather than a screen bug.
 */
function nameOf(patternId: string): string {
  return (
    patternName(patternId) ??
    ruleProvenanceName(patternId) ??
    `a pattern this build cannot name (${patternId})`
  );
}

/**
 * The pattern readout at a playhead — a pure function of the recording, like `frameAt`.
 *
 * Right-continuous, matching every other sampler in this package: a switch at `t` is in force
 * *at* `t`. The value per bank is that bank's last switch at or before the clamped playhead —
 * the recording's entries are ascending, so a linear scan from the front keeps the last match —
 * and `null` (the profile's own weights) before a bank's first entry, which is also what an
 * entry with `patternId: null` restores. Banks that never selected are not in the list at all
 * and therefore do not vote: a single-bank selector on a multi-bank building speaks for itself
 * rather than being outvoted by banks with nothing to say.
 */
export function patternReadoutAt(recording: VizRecording, simTimeS: SimTime): PatternReadout {
  const switches = recording.patternSwitches;
  if (switches === undefined) {
    return { kind: 'no-detector', label: '', title: '', patternIds: [] };
  }

  const t = Math.min(Math.max(simTimeS, recording.startedAt), recording.endedAt);
  const inForce = new Map<string, string | null>();
  for (const entry of switches) {
    if (entry.atS > t) break;
    inForce.set(entry.bankId, entry.patternId);
  }

  const patterns = [...new Set([...inForce.values()].filter((id): id is string => id !== null))];
  patterns.sort((a, b) => a.localeCompare(b));

  if (patterns.length === 0) {
    return { kind: 'no-pattern', label: NO_PATTERN_LABEL, title: '', patternIds: [] };
  }
  if (patterns.length === 1) {
    const patternId = patterns[0] ?? '';
    return {
      kind: 'pattern',
      label: nameOf(patternId),
      title: patternLine(patternId) ?? '',
      patternIds: patterns,
    };
  }
  return {
    kind: 'mixed',
    // Every pattern in force, named — the banks read different traffic and the header says so.
    label: `banks split: ${patterns.map(nameOf).join(' / ')}`,
    title: '',
    patternIds: patterns,
  };
}
