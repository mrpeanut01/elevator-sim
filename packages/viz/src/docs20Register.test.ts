/**
 * **`docs/20`'s ranked-defect register, derived rather than trusted** — GitHub issues #172 and
 * #230, [`DECISIONS.md`](../../../DECISIONS.md) § D424.
 *
 * `docs/20-everyday-playtest-audit-2.md` ranks seventeen findings from a player-walk. All
 * seventeen were fixed across three merges, **and only six of them were struck through**. So
 * defects 1–10 and 12 went on reading as live findings for three waves after they had been closed,
 * which is `DECISIONS.md` § D227's class with its polarity reversed: a stale *refusal* tells a
 * reader not to touch a control that works, and a stale *finding* tells a reader to go and fix
 * something that is already fixed. Both are a sentence that stopped describing the tree, and
 * neither is caught by anything that looks at code.
 *
 * A document at the root of this package rather than beside one module, because the seventeen
 * defects are owned by `watch/`, `shift/`, `render/`, `fixit/`, `batch/`, `dev/`, `live/` and
 * `persist/` between them, and a guard that lived in any one of those would be claiming a scope it
 * does not have.
 *
 * ## What this can check, and — more importantly — what it cannot
 *
 * It **cannot** check that a defect is fixed. There is no mechanical reading of *"Better now
 * requires a measured improvement"* that a test can evaluate against a tree; that is what the
 * merge's own tests are for, and each closed entry in the document names them.
 *
 * What it checks is the **link between the document and the tree**, in both directions:
 *
 * 1. Every ranked defect the document strikes through is **named by number** somewhere in
 *    `packages/viz/src`. That is this repository's own convention — a fix cites the finding it
 *    closes — so a strike-through with nothing in the tree that mentions the number is either a
 *    fix that left no trace or a strike-through nobody earned. Both are worth a red run.
 * 2. The number of ranked defects that are **not** struck through is a ratchet, at **zero**.
 *
 * The second is the one that catches the defect this file was written for. It is a ratchet rather
 * than an exact pin because `RISKS.md` R38's remedy is a ratchet or a derivation and never a pin —
 * though at zero the two coincide, which is the point of getting a register to its floor.
 *
 * **A citation is weaker evidence than a passing test and stronger than a reader's diligence.**
 * Said plainly rather than implied, because the failure mode of a check like this one is a reader
 * taking it for more than it is. What it buys is that the document and the tree cannot silently
 * drift apart: they now disagree loudly, in a suite, on the commit that separates them.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DOCUMENT = 'docs/20-everyday-playtest-audit-2.md';

/**
 * The ranked list's headings, as `{ number, struck }`.
 *
 * The list's own shape is `**N. SEVERITY — …**`, and a closed one wears the strike-through inside
 * the bold run: `**N. SEVERITY — ~~…~~**`. Read off the **line start** so that a reference to a
 * defect in another entry's prose — of which there are several, deliberately — cannot be mistaken
 * for a heading.
 */
function rankedDefects(): readonly { readonly number: number; readonly struck: boolean }[] {
  const text = readFileSync(join(REPO, DOCUMENT), 'utf8');
  const found: { number: number; struck: boolean }[] = [];
  for (const line of text.split('\n')) {
    const head = /^\*\*(\d+)\. (CONFUSING|POLISH|BLOCKS-PLAY) — (.*)$/u.exec(line);
    if (head === null) continue;
    found.push({ number: Number(head[1]), struck: (head[3] ?? '').startsWith('~~') });
  }
  return found;
}

/** Every defect number cited as `docs/20 defect N` or `docs/20 defects N and M` in this package. */
function citedInTree(): ReadonlySet<number> {
  const cited = new Set<number>();
  for (const file of globSync('packages/viz/src/**/*.ts', { cwd: REPO })) {
    const text = readFileSync(join(REPO, file), 'utf8');
    // The backtick around `docs/20` is optional: both spellings are in the tree, and a guard that
    // only read one would under-count in the direction that hides a missing citation.
    for (const hit of text.matchAll(/`?docs\/20`?\s+defects?\s+(\d+)(?:\s+and\s+(\d+))?/gu)) {
      for (const group of hit.slice(1)) if (group !== undefined) cited.add(Number(group));
    }
  }
  return cited;
}

describe('docs/20’s ranked-defect register agrees with the tree', () => {
  it('finds the ranked list, and finds all of it', () => {
    const defects = rankedDefects();
    // Non-vacuity, the trap `deadCode.test.ts` and `viewportGateClaims.test.ts` both guard: a
    // heading shape that stopped matching would make every case below pass over an empty list.
    expect(
      defects.length,
      `no ranked defects were parsed out of ${DOCUMENT}. Either the list's heading shape moved, ` +
        'in which case teach the regex, or the list was deleted, in which case delete this file — ' +
        'but a guard that matches nothing must not report as green.',
    ).toBeGreaterThan(0);
    // Contiguous from 1, so a heading that was renumbered or dropped is a red run rather than a
    // silently shorter list.
    expect(
      defects.map((defect) => defect.number),
      'the ranked list is numbered contiguously from 1. A gap means a heading was renumbered or ' +
        'lost, and a register with a hole in it cannot be read as a register.',
    ).toEqual(defects.map((_, index) => index + 1));
  });

  it('names in the tree every defect it strikes through', () => {
    const cited = citedInTree();
    const unevidenced = rankedDefects()
      .filter((defect) => defect.struck && !cited.has(defect.number))
      .map((defect) => defect.number);
    expect(
      unevidenced,
      `${DOCUMENT} strikes these defects through, and no file in packages/viz/src names them. ` +
        'This repository’s convention is that a fix cites the finding it closes, so a ' +
        'strike-through with no citation is either a fix that left no trace or a strike-through ' +
        'nobody earned. A citation is not proof of a fix — it is proof the tree knows the ' +
        'defect’s number, which is the most a document-to-code check can honestly assert.',
    ).toEqual([]);
  });

  it('keeps the count of findings still reading as live at its floor', () => {
    /*
     * The ratchet. It stood at **11** — defects 1–10 and 12 — for three waves after the merges
     * that fixed them, while six siblings were struck through on the same page. Lowering it is
     * the only permitted direction: a defect that genuinely re-opens gets its strike-through
     * removed *and* this number raised on the same commit, with the run that re-opened it named,
     * which is `CLAUDE.md`'s rule about raising a gate rather than weakening one, pointed at a
     * register.
     */
    const OPEN_CEILING = 0;
    const open = rankedDefects().filter((defect) => !defect.struck);
    expect(
      open.map((defect) => defect.number),
      `${DOCUMENT} has ${String(open.length)} ranked defects that are not struck through, and the ` +
        `register is meant to hold at most ${String(OPEN_CEILING)}. Close one and lower the ` +
        'ceiling; never raise it silently. If a defect really has re-opened, say so here with the ' +
        'run that re-opened it.',
    ).toHaveLength(OPEN_CEILING);
  });
});
