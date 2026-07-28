/**
 * **`docs/01-architecture.md` § Module layout is checked against the tree on disk.**
 *
 * Review finding #15: the block was scoped "as built through Phase 3" and omitted every directory
 * Phases 5 and 7 added — `dispatch/policies`, `dispatch/predictor`, `experiments/benchmark` and the
 * whole of `experiments/tuning`. That matters more than a stale doc usually does, because
 * `docs/05-roadmap.md` § *Standing requirement* obliges a phase plan to **name an owner for every
 * file a new behaviour must be called from**, and the canonical map of what files exist cannot be
 * used that way while it is three phases behind. It is the same structural cause the roadmap blames
 * for the four Phase 5 dead seams.
 *
 * The doc's own history says this is a section maintained as normative rather than historical: it
 * already carries an inline correction about `experiments/stats/`, which was found by a human read.
 *
 * ## Both directions, deliberately
 *
 * A directory on disk that the doc does not list is the drift this finding reports. A directory the
 * doc lists that does not exist is the `experiments/stats/` error, which shipped and survived until
 * somebody noticed by eye. Asserting only the first would leave the second uncovered, so the two
 * sets are compared for equality.
 *
 * ## Why it lives here, and the coupling that had to be removed for that to be safe
 *
 * In `core/src/sim/` because it walks `packages/<pkg>/src` and `core` is the package every other one
 * depends on, so a test here cannot invert the package graph. It reads directories, not modules,
 * and imports nothing from a sibling package.
 *
 * **That was not enough, and `AGENT_STATUS.md` C28 reported why.** The doc's tree names `viz/*`
 * directories and the comparison ran in both directions over *every* label in it, so deleting
 * `packages/viz` from disk turned six of them into phantoms and reddened the **core** suite.
 * Invariant 6 is *"`core` builds and tests with `viz` absent"*, and a reviewer checking its strong
 * form by removing the package hit a documentation coupling and reasonably read it as a violation.
 *
 * The fix is to **scope**, not to weaken: {@link documentedDirectories} is filtered to the packages
 * that are actually on disk, and inside that scope both directions are compared exactly as before.
 * A directory of a present package that the doc omits still fails; a directory the doc names that a
 * present package does not have still fails — that is the `experiments/stats/` error and it stays
 * caught. What no longer fails is a doc line about a package that is not installed, which was never
 * a statement about `core`. {@link presentPackages} is asserted non-empty and asserted to contain
 * `core`, so the scoping cannot quietly become "skip everything".
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PACKAGES = join(ROOT, 'packages');
const DOC = join(ROOT, 'docs', '01-architecture.md');

/** Directories that are build output or dependency trees, never source. */
const SKIP = new Set(['dist', 'node_modules', '.vite']);

/**
 * Every directory under `packages/<pkg>/src` that holds a `.ts` file at any depth, as a path
 * relative to `packages/` with the `src` segment dropped — `core/dispatch/policies`, `viz/frame`,
 * `cli/commands`. The package root itself (`core`, `viz`, …) is included, because the doc's tree
 * lists the packages too.
 *
 * **At any depth, and tests count.** Finding #15's own wording is "directories containing a
 * non-test `.ts` file", and taken literally that rule drops two directories a reader needs: it
 * excludes `core/physics`, whose whole content is the `motion/` and `doors/` modules beneath it,
 * and `viz/replay`, which holds nothing but Phase 4's acceptance harness. A map that omits the
 * directory an acceptance criterion is asserted in is not doing its job. The looser rule is also
 * strictly harder to satisfy, so nothing is let through by it.
 */
/**
 * Every package under `packages/` that has a `src` directory on disk.
 *
 * The scope of the comparison below. A workspace member that is not installed — `viz` removed to
 * check invariant 6's strong form, a package not yet created — contributes neither directories nor
 * expectations, because the doc's lines about it are not claims about the packages that *are* here.
 */
function presentPackages(): ReadonlySet<string> {
  const present = new Set<string>();
  for (const pkg of readdirSync(PACKAGES)) {
    if (SKIP.has(pkg)) continue;
    try {
      if (statSync(join(PACKAGES, pkg, 'src')).isDirectory()) present.add(pkg);
    } catch {
      /* not a package with sources; nothing to compare either way */
    }
  }
  return present;
}

function sourceDirectories(): readonly string[] {
  const found: string[] = [];

  const walk = (dir: string, label: string): boolean => {
    let holds = readdirSync(dir).some(
      (name) => name.endsWith('.ts') && statSync(join(dir, name)).isFile(),
    );
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const child = join(dir, name);
      if (!statSync(child).isDirectory()) continue;
      if (walk(child, `${label}/${name}`)) holds = true;
    }
    if (holds) found.push(label);
    return holds;
  };

  for (const pkg of readdirSync(PACKAGES)) {
    if (SKIP.has(pkg)) continue;
    const src = join(PACKAGES, pkg, 'src');
    let isDir = false;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    walk(src, pkg);
  }

  return found.sort();
}

/**
 * The directory labels the doc's fenced module-layout block names.
 *
 * The block is an ASCII tree, so a label's depth is its indentation and its parent is the most
 * recent entry one level shallower. Only lines whose name ends in `/` are directories; the prose
 * after the name is a description and is discarded.
 */
function documentedDirectories(): readonly string[] {
  const text = readFileSync(DOC, 'utf8');
  const block = /```\n(packages\/\n[\s\S]*?)```/.exec(text)?.[1];
  expect(block, 'docs/01 has no fenced block starting with `packages/`').toBeDefined();

  const labels: string[] = [];
  const stack: { indent: number; label: string }[] = [];

  for (const line of (block as string).split('\n')) {
    const row = /^([\s│├└─]*)([A-Za-z0-9_.-]+)\/(?:\s|$)/.exec(line);
    if (row === null) continue;
    const [, lead, name] = row;
    if (name === 'packages') continue;
    // Two columns of tree drawing per level; `├──`/`└──` and `│` both occupy the same width.
    const indent = Math.floor((lead as string).length / 4);
    while (stack.length > 0 && (stack[stack.length - 1] as { indent: number }).indent >= indent) {
      stack.pop();
    }
    const parent = stack.length === 0 ? '' : `${(stack[stack.length - 1] as { label: string }).label}/`;
    const label = `${parent}${name as string}`;
    stack.push({ indent, label });
    labels.push(label);
  }

  return [...labels].sort();
}

describe('docs/01 § Module layout', () => {
  it('names every source directory on disk, and no directory that is not (review finding #15)', () => {
    const present = presentPackages();
    const onDisk = sourceDirectories();
    const documented = documentedDirectories();

    // Non-vacuity for the scoping (C28): it narrows the comparison to installed packages, and it
    // must never narrow it to nothing. `core` is the package this suite lives in, so its absence
    // would mean the walk is broken rather than that the package was removed.
    expect(present.size, 'no packages with a src/ directory — the walk is broken').toBeGreaterThan(0);
    expect(present.has('core'), 'packages/core/src is missing; the walk is broken, not the doc').toBe(
      true,
    );

    expect(onDisk.length, 'no source directories found — the walk is broken, not the doc')
      .toBeGreaterThan(10);
    expect(documented.length, 'no directories parsed out of the doc — the fence shape changed')
      .toBeGreaterThan(10);

    // Scoped to what is installed. Both directions still hold inside the scope; see the module
    // docstring for why a doc line about an absent package is not a claim about `core`.
    const inScope = documented.filter((dir) => present.has(dir.split('/')[0] as string));
    const missing = onDisk.filter((dir) => !inScope.includes(dir));
    const phantom = inScope.filter((dir) => !onDisk.includes(dir));

    expect(
      missing,
      `on disk under packages/*/src and absent from docs/01's module tree. A phase plan cannot ` +
        `name an owner for a file the map does not show. Relative to ${relative(ROOT, PACKAGES)}/.`,
    ).toEqual([]);
    expect(
      phantom,
      `named in docs/01's module tree and not on disk. This is the experiments/stats/ error, ` +
        `which shipped and was caught only by a human read.`,
    ).toEqual([]);
  });
});
