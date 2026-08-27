/**
 * **The browser tier's file count, derived rather than transcribed** — GitHub issue #292's second
 * half, and a node file on purpose.
 *
 * It sits beside `viewportGates.browser.test.ts` because it guards the same two documents' claims
 * about the same subject, and it is **not** a `*.browser.test.ts` file because it needs no browser:
 * `dev/browserTier.test.ts` requires every suite in that tier to be `describe.skipIf(!HAS_BROWSER)`,
 * for the good reason that a tier suite which is not would go red on every machine without one — and
 * a count read off disk that skipped whenever Chromium was missing would be a guard reporting as
 * *ran*, which is the shape both this file and that rule exist to prevent.
 *
 * **Two documents publish how many files this tier has, they disagreed with each other, and both
 * were wrong.**
 *
 * `M2_MEASUREMENT.md` § 3 published *"26 of 26"* and `docs/31-support-matrix.md` § 1 published
 * *"25 files"* — of the same set, in the same tree. On `55f2bca` the answer is **28**, by both of
 * § 3's own commands. `docs/31-support-matrix.md` § 7 item 7 had already named this exact figure as
 * one that *"will drift silently … Re-derive them, do not copy them forward"*, and it drifted
 * anyway, because naming a risk is not a check.
 *
 * The argument for deriving it rather than typing 28 is that **the commit that closed the issue
 * moved it**: `viewportGates.browser.test.ts` is the twenty-ninth, so a hand-written 28 would have
 * been stale before it was pushed. That is the whole class in one line — a published count with no
 * derivation is stale as of the next commit that adds a file, and the only stable thing to publish
 * is the command.
 *
 * The count is deliberately taken **two ways**, matching § 3's two commands, so that a file which
 * joins the tier without launching Chromium is a red line here rather than a silent change to what
 * *"single-engine by construction"* means.
 *
 * ## One consequence, met immediately and worth stating rather than patching around
 *
 * This repository keeps superseded figures standing with the correction beside them, so a corrected
 * document contains the **old** number on purpose — and the first run of this guard went red on
 * exactly that: the sentence in `docs/31-support-matrix.md` § 7 recording what the figure *used to*
 * say. The rule that resolves it is that **the machine-read shape belongs to the live claim only**:
 * a superseded figure is written struck through (`~~*25*~~`), outside the shapes above, which is
 * how that document already marks history elsewhere. Teaching the guard to recognise supersession
 * markers instead would put the distinction in a regex, where the next person cannot see it; kept
 * this way, a figure that is still in a shape is still being asserted.
 *
 * **No `DECISIONS.md` entry is claimed for this, and that is deliberate rather than an oversight.**
 * The wave that produced it forbade taking a number, and `documentation.test.ts`'s ratchet on
 * owed-decision sites stands at its ceiling — a lane may not raise a ratchet, and settling one
 * belongs to whoever writes the entry. So the argument lives here and in the two documents this
 * file is cited from, which is what `CLAUDE.md`'s working agreement asks for; GitHub issue #292 is
 * the pointer for anyone filing it later.
 */
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('the browser-tier file count both documents publish is derived, not transcribed', () => {
  const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
  const DOCUMENTS: readonly string[] = Object.freeze(['M2_MEASUREMENT.md', 'docs/31-support-matrix.md']);

  /** `find packages -name "*.browser.test.ts"`, and `dist/` excluded as `find` would not see it. */
  const tierFiles = (): readonly string[] =>
    globSync('packages/**/src/**/*.browser.test.ts', { cwd: REPO }).sort((a, b) => a.localeCompare(b));

  it('finds a tier to count, and every file of it launches Chromium', () => {
    const files = tierFiles();
    expect(files.length, 'no browser-tier files were found, so this guard is watching nothing').toBeGreaterThan(0);
    const withoutChromium = files.filter(
      (path) => !readFileSync(join(REPO, path), 'utf8').includes('chromium.launch'),
    );
    expect(
      withoutChromium,
      'a browser-tier file does not call `chromium.launch()`. Both documents describe this tier as ' +
        '*single-engine by construction* and count these two ways to say so; a file that launches ' +
        'something else makes that sentence false rather than merely imprecise.',
    ).toEqual([]);
  });

  it('publishes the count each document carries as the one on disk', () => {
    const found = tierFiles().length;
    /*
     * The four shapes the two documents write the figure in: the prose count in each, and the two
     * commands § 3 shows with their answers beside them. All four are read, so neither document
     * and neither command can drift alone — which is what happened, in both directions at once.
     */
    const SHAPES: readonly RegExp[] = Object.freeze([
      /\*\*(\d+) of (\d+)\*\* browser-tier files/gu,
      /(\d+)[*_]*\s+`\*\.browser\.test\.ts` files/gu,
      /grep -rl "chromium\.launch"[^\n]*?→\s*(\d+)/gu,
      /find packages -name "\*\.browser\.test\.ts" \| wc -l[^\n]*?→\s*(\d+)/gu,
    ]);
    /* A set, because `**N of N**` carries the same figure twice and one wrong sentence should be
       one line in the diff rather than two. */
    const wrong = new Set<string>();
    let matched = 0;
    for (const document of DOCUMENTS) {
      const text = readFileSync(join(REPO, document), 'utf8');
      for (const shape of SHAPES) {
        for (const hit of text.matchAll(shape)) {
          for (const group of hit.slice(1)) {
            if (group === undefined) continue;
            matched += 1;
            if (Number(group) !== found) wrong.add(`${document}: "${hit[0].trim()}"`);
          }
        }
      }
    }
    expect(
      matched,
      'neither document states the tier file count in a shape this guard reads. Either the ' +
        'sentence moved, in which case teach the regex, or the claim was deleted, in which case ' +
        'delete this case — but a guard that matches nothing must not report as green.',
    ).toBeGreaterThan(0);
    expect(
      [...wrong],
      `the tier holds ${String(found)} \`*.browser.test.ts\` files. A count published in prose is ` +
        'stale as of the next commit that adds one — which is how one of these documents came to ' +
        'carry 25 and the other 26 for the same set. Re-derive, do not copy forward.',
    ).toEqual([]);
  });
});
