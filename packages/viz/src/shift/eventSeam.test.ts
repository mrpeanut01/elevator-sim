/**
 * **One answer to *what event is this day under?*, derived from disk rather than remembered.**
 *
 * ## The defect, and why a docstring was not enough to close it
 *
 * GitHub issue #135. `events.ts#eventFor` is the *ordinary schedule*; a calendar period may
 * overrule it, and `calendar.ts#CALENDAR_PERIODS['moving-week']` books `move-in` on six of its
 * seven days. `dev/state.ts#shiftRunConfigOf` — the code that builds the run — consulted the
 * calendar. **Four surfaces describing that run did not**, and they were written by four different
 * hands at four different times: the Day report's *Tomorrow* card, `dev/main.ts#closeShift`, the
 * left rail's event line, and `scope/runIdentity.ts`' reproducibility gate. Two separate lanes
 * found two of them independently, which is what says the shape is general — and the other two were
 * found only by asking the question this file now asks mechanically.
 *
 * A derivation written five times is not fixed by correcting five sites. It is fixed by there being
 * one, and by a check that a sixth cannot be added quietly. § D322's `BASIS_DIFFERENCES` made a new
 * phrase a **compile error**; the equivalent here is not expressible in the type system — `eventFor`
 * is a plain exported function and any module may call it — so the guard is a scan of the tree,
 * derived from disk in `packages/viz/src`, in the style `deadCode.test.ts` established.
 *
 * ## What "derived from disk" buys, and what it does not
 *
 * It buys the property that a **new file** is covered the day it is written: nothing here lists the
 * files it checks. It does not buy anything about behaviour — a caller could route through
 * `scheduledEventFor` and then discard its answer. The behavioural half is `report.test.ts`'s
 * `moving-week` cases and `calendar.test.ts`'s; this is the half that says nobody re-derived it.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** `packages/viz/src`, resolved from this file rather than from the process working directory. */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * The two files that may name `eventFor` in shipped code, and the reason each may.
 *
 * `events.ts` **declares** it. `calendar.ts` is the one composition — {@link scheduledEventFor} —
 * that puts the period in front of the schedule. Anything else is issue #135 back.
 *
 * A path list rather than a directory rule, because *"the shift layer may do what it likes"* is
 * exactly the licence that produced four callers: `report.ts`, `state.ts`, `main.ts` and
 * `leftRail.ts` are all shift-adjacent and all got it wrong.
 */
const MAY_CALL_EVENT_FOR = new Set(['shift/events.ts', 'shift/calendar.ts']);

/** Every `.ts` under `packages/viz/src`, as paths relative to it. Tests and declarations excluded. */
async function shippedSources(dir = ''): Promise<readonly string[]> {
  const entries = await readdir(new URL(`${dir}`, `file://${SRC}`), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const at = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await shippedSources(at)));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    // Tests may call either: a test asserting the *schedule* is asserting `eventFor` on purpose,
    // and `report.test.ts` drives both sides of the seam against each other by name.
    if (entry.name.includes('.test.') || entry.name.endsWith('.d.ts')) continue;
    found.push(at);
  }
  return found;
}

/**
 * A file's source with its comments removed — the thing the scan actually asks about.
 *
 * Prose is exempt on purpose and it is not a loophole. `report.ts` and `tomorrow.ts` both *explain*
 * why they no longer call `eventFor`, quoting the old expression, and a rule that forbade the word
 * would push those explanations out of the two files that most need them — § D227's own trap, which
 * is that a seam gets described somewhere the description can go stale. What is forbidden is the
 * call, so the call is what is scanned for.
 *
 * Deliberately crude — it will also take a `//` inside a string, which can only ever remove text
 * and therefore can only ever make this scan miss something. That risk is what the
 * `scheduledEventFor` case below is a control for: it runs against this same stripper, so an
 * over-eager strip turns a file red rather than quiet.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Files whose **code** matches — comments stripped first, by {@link withoutComments}. */
async function filesNaming(token: RegExp): Promise<readonly string[]> {
  const files = await shippedSources();
  const hits: string[] = [];
  for (const file of files) {
    const source = withoutComments(await readFile(new URL(file, `file://${SRC}`), 'utf8'));
    if (token.test(source)) hits.push(file);
  }
  return hits;
}

describe('the event seam has exactly one composition — issue #135', () => {
  it('scans a tree it did not hard-code', async () => {
    // The scan's own negative control. A `shippedSources` that silently returned nothing would make
    // every case below vacuously green, which is the failure mode a derived-from-disk check has.
    const files = await shippedSources();
    // 154 when this was written. The floor is loose on purpose — it is here to catch a scan that
    // returned nothing or one directory, not to pin a file count that moves every wave.
    expect(files.length).toBeGreaterThan(120);
    expect(files).toContain('shift/calendar.ts');
    expect(files).toContain('dev/main.ts');
    expect(files.every((file) => !file.includes('.test.'))).toBe(true);
  });

  it('is called from nowhere in shipped code but its declaration and the one composition', async () => {
    /*
     * A **call**, not a mention: `report.ts` and `tomorrow.ts` both discuss `eventFor` in prose
     * explaining why they no longer call it, and forbidding the word would push those explanations
     * out of the files that need them — § D227's own trap, one layer up. The pattern is therefore
     * `eventFor(`, which is the thing that produces a wrong answer.
     */
    const callers = await filesNaming(/\beventFor\s*\(/);
    expect(
      [...callers].sort(),
      'a surface is deriving the day’s event from the ordinary schedule again — route it through ' +
        'shift/calendar.ts#scheduledEventFor, which is the expression the run itself is built from',
    ).toEqual([...MAY_CALL_EVENT_FOR].sort());
  });

  it('is imported by nothing outside those two files either', async () => {
    /*
     * The import is the cheaper thing to check and the earlier warning: a file that imports
     * `eventFor` is one edit from calling it, and the four callers this issue closed all imported
     * it at the top of the file for a single expression far below.
     */
    const importers = await filesNaming(/import\s*\{[^}]*\beventFor\b[^}]*\}\s*from/);
    expect([...importers].sort()).toEqual(['shift/calendar.ts']);
  });

  it('names the four surfaces that were wrong, so the list cannot quietly shrink', async () => {
    /*
     * The four callers issue #135 closed, each asserted to go through the composition. This is the
     * weaker half of the file — a call site can be moved and this would follow it — but it is the
     * half that says *these particular surfaces* were fixed rather than that the seam is tidy.
     *
     * `dev/main.ts` covers `closeShift`; `dev/leftRail.ts` the rail's event line;
     * `scope/runIdentity.ts` the reproducibility gate; `shift/report.ts` the Tomorrow card. The
     * run's own derivation, `dev/state.ts`, is here too: it was the only one that was right, and
     * routing it through the same function is what makes *right* and *described* the same
     * expression rather than two that agree.
     */
    const users = await filesNaming(/\bscheduledEventFor\s*\(/);
    for (const file of [
      'dev/main.ts',
      'dev/leftRail.ts',
      'dev/state.ts',
      'scope/runIdentity.ts',
      'shift/report.ts',
    ]) {
      expect(users, `${file} no longer asks the calendar what event the day is under`).toContain(
        file,
      );
    }
  });
});
