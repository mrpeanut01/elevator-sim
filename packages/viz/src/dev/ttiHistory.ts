/**
 * The per-commit run-history store for `charter S9` **B1** — GitHub issue #408.
 *
 * `docs/31-support-matrix.md` § 3 states B1's whole obstacle: *"gates only on a rolling
 * comparison, never on a single run … a single-run wall clock on a shared VM is a coin flip"*, and
 * that needs run history this repository did not keep. This module is the store's schema and its
 * pure read/write transforms; {@link ttiGate.ts} is the comparison that reads it.
 *
 * ## Format, and why it is this one rather than `data/`'s usual single-document JSON
 *
 * One JSON object **per line** (JSON Lines), append-only. Three shapes were weighed, per the
 * issue's own comment thread:
 *
 * - **In CI artifacts.** Rejected: bounded and invisible to a reader six months later, which is the
 *   opposite of reviewable.
 * - **In the telemetry store** (`server/`, GitHub issue #340). Rejected in the issue thread itself:
 *   that store is consented player data, and a CI performance history is neither consented nor
 *   player data. Reusing it would mean a CI measurement travels through a privacy posture that was
 *   never written for it.
 * - **In the repository, as a single JSON document like `data/`'s reference files.** This is the
 *   right *convention* — plain text, diffable, schema-checked — but not the right *directory*: the
 *   files under `data/` are simulator reference data that `packages/core` loads
 *   (`elevator-specs.json`, `traffic-profiles.json`, `dispatcher-profiles.json`,
 *   `buildings/`), and `CLAUDE.md` invariant 6 keeps `core/` buildable with `viz` absent. A CI
 *   timing log for the *viz* package's shipped bundle is not simulator reference data, and filing
 *   it beside what is would blur a boundary this repository is otherwise careful about.
 *
 * So: `packages/viz/perf-history/tti-history.jsonl`, beside the package it measures, outside
 * `src/` (so it is not part of the TypeScript build or `deadCode.test.ts`'s source corpus — it is
 * data, not code). One record per line rather than one JSON array is deliberate for the append
 * case this file exists for: a new run adds exactly one line at the end, so a diff on a CI commit
 * that appends a measurement is a one-line addition rather than a rewrite of an array's closing
 * bracket and every trailing comma above it.
 *
 * ## What is authored here and what is measured — the CHOSEN/MEASURED distinction this repository
 * asks for
 *
 * Nothing in *this* file is a number pulled from a run; it is schema and transforms. The numbers
 * that matter — the window size, the budget, the margin — are declared in `ttiGate.ts`, and each is
 * labelled there as **CHOSEN** (an authored default awaiting owner sign-off) or **CITED** (quoted
 * verbatim from `charter S9`). None is claimed as **MEASURED**, because there is no real history to
 * measure a window against yet — see that file's header.
 */

import { z } from 'zod';

/** One recorded measurement of `charter S9` B1 on the built bundle. */
export const ttiRecordSchema = z
  .object({
    /** Full 40-character git SHA the measurement was taken on. Not abbreviated, so it is unique. */
    commit: z.string().regex(/^[0-9a-f]{40}$/u, 'expected a full 40-character git SHA'),
    /** The branch the commit was measured on — `'main'` is the only one the gate reads a window from. */
    branch: z.string().min(1),
    /** Wall-clock time the measurement was taken, milliseconds since the Unix epoch. */
    timestampMs: z.number().int().positive(),
    /** Time to interactive in milliseconds, per `docs/31` § 3's definition. */
    ttiMs: z.number().finite().nonnegative(),
    /** Whether this measurement was taken in CI (`true`) or by a person running the script by hand. */
    ci: z.boolean(),
  })
  .strict();

export type TtiRecord = z.infer<typeof ttiRecordSchema>;

/** Thrown by {@link parseTtiHistory} on a line that is not valid JSON or not a valid record. */
export class TtiHistoryParseError extends Error {
  constructor(
    public readonly lineNumber: number,
    public readonly line: string,
    cause: unknown,
  ) {
    super(
      `tti-history.jsonl line ${String(lineNumber)} is not a valid record: ${String(cause)}\n` +
        `  ${line}`,
    );
    this.name = 'TtiHistoryParseError';
  }
}

/**
 * Parses the store's JSONL text into records, in file order (oldest first, by convention —
 * nothing here enforces the ordering; {@link appendTtiRecord} is the only writer and it always
 * appends).
 *
 * Blank lines are skipped (a trailing newline is the normal end-of-file, not a record). Every
 * non-blank line must parse as JSON and satisfy {@link ttiRecordSchema} exactly — a malformed line
 * throws {@link TtiHistoryParseError} rather than being silently dropped, because a store that
 * quietly loses rows is a rolling window quietly missing samples, which is a wrong answer, not a
 * missing one.
 */
export function parseTtiHistory(text: string): readonly TtiRecord[] {
  const records: TtiRecord[] = [];
  const lines = text.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(line);
    } catch (cause) {
      throw new TtiHistoryParseError(index + 1, rawLine, cause);
    }
    const result = ttiRecordSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new TtiHistoryParseError(index + 1, rawLine, result.error);
    }
    records.push(result.data);
  }
  return records;
}

/**
 * Serializes one record to its on-disk line — sorted keys, so a diff between two records differs
 * only in the values, never in incidental key order.
 */
export function serializeTtiRecord(record: TtiRecord): string {
  const validated = ttiRecordSchema.parse(record);
  const sortedKeys = Object.keys(validated).sort() as (keyof TtiRecord)[];
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) sorted[key] = validated[key];
  return JSON.stringify(sorted);
}

/**
 * Appends one record to the store's text, returning the new text. Pure — the caller does the disk
 * I/O, which is what keeps this module (and its tests) hermetic.
 *
 * Handles a store that does not yet end in a newline, and a store that is empty (the state this
 * repository ships in today — see `perf-history/README.md`).
 */
export function appendTtiRecord(existingText: string, record: TtiRecord): string {
  const line = serializeTtiRecord(record);
  if (existingText.length === 0) return `${line}\n`;
  const withTrailingNewline = existingText.endsWith('\n') ? existingText : `${existingText}\n`;
  return `${withTrailingNewline}${line}\n`;
}

/** Records for one branch, in file order. What {@link ttiGate.ts}'s rolling window reads from. */
export function recordsOnBranch(
  history: readonly TtiRecord[],
  branch: string,
): readonly TtiRecord[] {
  return history.filter((record) => record.branch === branch);
}
