/**
 * **The revert rehearsal's pure half, and the promise its documents may not make** — GitHub issue
 * **#355**, AC4.
 *
 * ## What this file is for
 *
 * `scripts/rehearse-revert.mjs` runs the part of `docs/16-static-site-deployment.md` § 11.2 that can
 * be run with no credential and no live resource: the git half, in a throwaway clone. It is the
 * answer to *a procedure nobody has run is a draft* for the steps a checkout can reach, and it is
 * **not** an answer for the steps it cannot — the upload, the branch policy, the propagation time,
 * the API half and the save-clearing in a browser.
 *
 * Two things therefore need a guard, and they are different in kind.
 *
 * 1. **The script's decisions**, which are pure functions over text and are driven here against
 *    fixtures with no git, no clone and no network — the split `validation/deadPage.test.ts` uses
 *    for the same reason: the useful half of an operator's tool is a decision, and a decision can be
 *    tested without the thing it is about.
 * 2. **The claim its documents make about it.** This is the part worth reading. A harness that runs
 *    half a procedure is one careless edit away from a document saying the procedure is rehearsed,
 *    and `CLAUDE.md`'s *stated refusal goes stale* rule has its worst polarity here: a **stale
 *    promise** tells a reader in an incident that they hold a recovery they have not checked. So
 *    § 11.5 is required to carry both halves — the harness that runs, and the sentence saying the
 *    production half has not been run — and deleting the second makes this file red.
 *
 * ## The one derivation that is not a fixture
 *
 * {@link artifactPathspecsOf} reads `.github/workflows/deploy-viz.yml`'s own `paths:` list, so the
 * tree comparison in § 11.2 step 2 cannot fall out of step with the workflow that decides what the
 * artifact is built from. It is asserted here **in both directions** against the workflow on disk —
 * every pathspec comes from a workflow path, and every workflow path outside `.github/` yields a
 * pathspec — because a derivation checked in one direction is a derivation that can silently shrink.
 *
 * No `DECISIONS.md` entry for the guard itself: this docstring is the record, per
 * [§ D405](../../../../DECISIONS.md). The rehearsal split it holds in place is
 * [§ D587](../../../../DECISIONS.md).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  NOT_REHEARSED,
  artifactPathspecsOf,
  buildVersionOf,
  crossesSaveSchema,
  issuesOf,
  schemaBumpsOf,
  summaryOf,
  type Observation,
} from '../../../../scripts/rehearse-revert.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const WORKFLOW = '.github/workflows/deploy-viz.yml';

/** A held observation, so a case can break exactly one thing. */
const HELD: Observation = {
  id: 'tree-matches-target',
  claim: 'the reverted tree equals the target over the artifact paths',
  observed: 'the comparison prints nothing, which is what step 2 requires',
  ok: true,
};

describe('the artifact pathspecs are derived from the workflow (GitHub issue #355)', () => {
  it('takes every push path outside `.github/` and nothing else', () => {
    const specs = artifactPathspecsOf(read(WORKFLOW));
    expect(specs).toEqual(['packages', 'data', 'package.json', 'package-lock.json', 'tsconfig*.json']);
  });

  it('matches the workflow in both directions, so the comparison cannot silently shrink', () => {
    const workflow = read(WORKFLOW);
    const declared = /on:\n\s+push:\n(?:.*\n)*?\s+paths:\n((?:\s+- '.*'\n)+)/u.exec(workflow);
    expect(
      declared,
      `${WORKFLOW} no longer declares on.push.paths in a shape this case can read, so the ` +
        'both-directions check below asserts nothing. Fix the reader rather than deleting the case.',
    ).not.toBeNull();
    const block = (declared as RegExpExecArray)[1] ?? '';
    const fromWorkflow = [...block.matchAll(/- '(.*)'/gu)].map((m) => m[1] ?? '');
    expect(fromWorkflow.length).toBeGreaterThan(4);

    const specs = artifactPathspecsOf(workflow);
    // Every pathspec came from a workflow path.
    for (const spec of specs) {
      expect(fromWorkflow.some((path) => path === spec || path === `${spec}/**`)).toBe(true);
    }
    // Every workflow path outside `.github/` produced a pathspec.
    for (const path of fromWorkflow) {
      if (path.startsWith('.github/')) continue;
      expect(specs.some((spec) => spec === path || `${spec}/**` === path)).toBe(true);
    }
    // And the workflow file itself is deliberately not compared: it triggers the run, it is not in
    // the artifact.
    expect(specs.some((spec) => spec.startsWith('.github'))).toBe(false);
  });

  it('refuses a workflow whose paths it cannot find rather than comparing nothing', () => {
    expect(() => artifactPathspecsOf('on:\n  push:\n    branches: [main]\n')).toThrow(/blind/u);
    expect(() =>
      artifactPathspecsOf("on:\n  push:\n    paths:\n      - 'packages/**'\n      - 'data/**'\n"),
    ).toThrow(/looking at almost nothing/u);
  });
});

describe('the save-schema crossing (docs/16 § 11.3)', () => {
  it('reads a real bump out of a diff of `persist/types.ts`', () => {
    const diff = [
      'diff --git a/packages/viz/src/persist/types.ts b/packages/viz/src/persist/types.ts',
      '@@ -288,7 +288,7 @@',
      '-export const SESSION_SCHEMA_VERSION = 8;',
      '+export const SESSION_SCHEMA_VERSION = 9;',
      ' export const SESSION_SCHEMA_VERSIONS_READ = [7, 8, 9];',
    ].join('\n');
    expect(schemaBumpsOf(diff)).toEqual([{ from: 8, to: 9 }]);
  });

  it('finds no crossing in a diff that moves something else in the same file', () => {
    const diff = [
      'diff --git a/packages/viz/src/persist/types.ts b/packages/viz/src/persist/types.ts',
      '-/** The slot the week is written to. Bumping SESSION_SCHEMA_VERSION is the other half. */',
      '+/** The slot the week is written to, and what a stale one costs. */',
    ].join('\n');
    expect(schemaBumpsOf(diff)).toEqual([]);
  });

  it('calls a crossing only when both sides are there', () => {
    // The whole cost of a false positive here is an operator learning to pass --accept-save-loss
    // without reading the line, so the one case that must not fire is the constant arriving or
    // leaving: neither can clear anybody's slot.
    expect(crossesSaveSchema([{ from: 8, to: 9 }])).toBe(true);
    expect(crossesSaveSchema([{ from: undefined, to: 9 }])).toBe(false);
    expect(crossesSaveSchema([{ from: 8, to: undefined }])).toBe(false);
    expect(crossesSaveSchema([])).toBe(false);
    // And a revert *forward* over a range whose tip writes the older version is not a crossing
    // either — the direction is what costs the week.
    expect(crossesSaveSchema([{ from: 9, to: 8 }])).toBe(false);
  });

  it('is empty on an empty diff, which is why the script checks the file exists first', () => {
    // A path that is not in the tree produces no diff at all, which is indistinguishable here from
    // a clean range. `rehearse-revert.mjs` establishes existence with `git cat-file -e` before it
    // trusts this function's silence, and reports *blind* rather than *clean* when it cannot.
    expect(schemaBumpsOf('')).toEqual([]);
  });
});

describe('the build version the page will show (docs/16 § 11.3, row 1)', () => {
  it('is the first ten characters, as `vite.config.ts#buildVersion` takes them', () => {
    expect(buildVersionOf('79a69a4957c6a3ee27c6a3ee27c6a3ee27c6a3ee')).toBe('79a69a4957');
    expect(buildVersionOf('79a69a4957')).toBe('79a69a4957');
  });
});

describe('what the run reports', () => {
  it('turns every failing observation into an issue and a clean set into none', () => {
    expect(issuesOf([HELD, { ...HELD, id: 'revert-applies' }])).toEqual([]);
    const issues = issuesOf([
      HELD,
      { id: 'range-is-linear', claim: 'no merge commit', observed: '1 merge commit', ok: false },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('range-is-linear');
    expect(issues[0]).toContain('1 merge commit');
  });

  it('names everything it did not rehearse, on a clean run as loudly as on a failing one', () => {
    const clean = summaryOf([HELD], []);
    expect(clean).toContain('The git half of the procedure holds');
    for (const item of NOT_REHEARSED) expect(clean).toContain(item);
    expect(NOT_REHEARSED.length).toBeGreaterThan(4);
  });
});

describe('the promise the documents may not make (CLAUDE.md’s stale-refusal rule)', () => {
  const section = (document: string, heading: string): string => {
    const start = document.indexOf(heading);
    expect(start, `the section ${heading} is gone, so this case reads nothing`).toBeGreaterThan(-1);
    const after = document.indexOf('\n## ', start);
    return document.slice(start, after === -1 ? undefined : after);
  };

  it('has docs/16 § 11.5 carry both halves — the harness that runs, and the half that has not', () => {
    const eleven5 = section(read('docs/16-static-site-deployment.md'), '### 11.5');
    expect(eleven5).toContain('scripts/rehearse-revert.mjs');
    expect(
      eleven5,
      '§ 11.5 no longer says that the production half has not been run. A rehearsal of the git ' +
        'half is not a rehearsal of the procedure, and a document that reads as though it were is ' +
        'the stale promise this whole issue is about.',
    ).toContain('has not been run against production');
  });

  it('has the runbook and the checklist point at the same split rather than restating it', () => {
    for (const document of ['docs/40-incident-runbook.md', 'docs/41-launch-checklist.md']) {
      const text = read(document);
      expect(text, `${document} does not name the rehearsal harness`).toContain(
        'scripts/rehearse-revert.mjs',
      );
      expect(text, `${document} no longer records that the production half is unrehearsed`).toMatch(
        /production half|against production/u,
      );
    }
  });
});
