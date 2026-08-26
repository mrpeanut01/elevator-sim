/**
 * **No tracked source file declares itself scratch, and none names a path from another machine.**
 *
 * ## The file this exists for
 *
 * `measure-tmp.mjs` sat at the repository root for a fortnight. Its first line read
 * `/* Verify docs/19 defect 11 in a real browser. Scratch file; not committed. *​/` — the sentence
 * and the fact had disagreed since `8d6d811` — and it bound
 * `const vizRoot = '/home/user/elevator-sim/.claude/worktrees/agent-a273b1ada6cb47286/packages/viz'`,
 * a worktree path on a machine nobody here has. It could not run anywhere, nothing imported it, and
 * no check in this repository had an opinion about it.
 *
 * It arrived the way `RISKS.md` **R25** describes: `git add -A` stages the whole repository
 * regardless of who owns what, so a harness written beside the work is committed with it.
 *
 * ## Why a test and not only a `.gitignore` rule
 *
 * `.gitignore` gained patterns for the common shapes in the same commit as this file, and they are
 * worth having — they stop the usual case at `git add`. **They are not a guard.** A pattern is
 * silent by construction: it fails nothing, `git add -f` walks straight past it, and it has no
 * effect at all on a file that is already tracked. Every one of those three is a way `measure-tmp`
 * could have arrived anyway.
 *
 * This reads the **tracked set** and goes red, which is the difference between a convention and a
 * check — the distinction this repository keeps paying for when it settles for the first.
 *
 * ## The two markers, and why the second is the stronger
 *
 * **A self-declared scratch header** is the honest author's own words, and catching it costs
 * nothing. It is weak on its own: a harness that says nothing about itself passes.
 *
 * **A hardcoded absolute path into somebody's home directory** is objective and does not rely on
 * the author having been candid. A committed file that binds `/home/…` or `/Users/…` cannot run for
 * anybody else, so it is either scratch or a defect — and either way it is worth a red run. That is
 * the clause that would have caught `measure-tmp.mjs` even with its header removed.
 *
 * ## Scope, and the two exclusions that are deliberate
 *
 * Executable source only. **Markdown is excluded**: prose legitimately quotes both shapes, and this
 * file is itself the proof — the paragraphs above name `/home/user/...` and *"not committed"* on
 * purpose. **`docs/design/` is excluded** as vendored: it is a byte-faithful third-party handoff and
 * this repository does not get to have opinions about its contents.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * This file, which is the one source file that must be allowed to quote both markers.
 *
 * Not a convenience exclusion — it is load-bearing, and it was **found by the guard rather than
 * anticipated**: the first run of this test failed on itself, because the docstring above names
 * `measure-tmp.mjs`'s header and its `/home/user/…` binding in order to explain what it is looking
 * for. A guard for scratch files cannot describe one without containing one.
 *
 * Derived from `import.meta.url` rather than matched by name, so renaming this file cannot silently
 * widen the exclusion — `dev/browserTier.test.ts`'s `SELF` is the same idiom for the same reason.
 */
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

/** Executable source, where a scratch harness can actually live. */
const SOURCE = /\.(mjs|cjs|js|ts|tsx)$/u;

/** Vendored, and not this repository's to police. */
const VENDORED = 'docs/design/';

/**
 * The tracked set, from git rather than from a directory walk.
 *
 * *Tracked* is precisely the property in question — a file present on disk and ignored is exactly
 * what the convention wants, and a walk could not tell the two apart.
 */
function trackedSourceFiles(): readonly string[] {
  const listed = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return listed
    .split('\n')
    .filter(
      (path) => path !== '' && SOURCE.test(path) && !path.startsWith(VENDORED) && path !== SELF,
    );
}

/** A file's own claim that it was never meant to be here. */
const DECLARES_SCRATCH = /scratch file|not committed|do not commit|temporary file/iu;

/**
 * An absolute path into a home directory, in a string literal.
 *
 * Quoted deliberately: a path in a comment is usually a reference to somebody else's report, while
 * a path in a literal is one the code will try to open.
 */
const FOREIGN_HOME_PATH = /['"`](\/home\/[a-z][\w.-]*|\/Users\/[A-Za-z][\w.-]*)\//u;

describe('no tracked source file is a scratch harness — RISKS.md R25', () => {
  it('finds source to check at all, or every clause here is vacuous', () => {
    expect(trackedSourceFiles().length).toBeGreaterThan(100);
  });

  it('declares itself scratch nowhere', () => {
    const offenders = trackedSourceFiles().filter((path) =>
      // The header, not the whole file: a test *about* scratch files says these words in its body.
      DECLARES_SCRATCH.test(readFileSync(join(ROOT, path), 'utf8').split('\n').slice(0, 12).join('\n')),
    );
    expect(
      offenders,
      'a tracked file says in its own opening lines that it was not meant to be committed. ' +
        'Delete it, or delete the sentence — `measure-tmp.mjs` carried that header for a ' +
        'fortnight and RISKS.md R25 is how it arrived.',
    ).toEqual([]);
  });

  it('binds no absolute path into somebody else’s home directory', () => {
    const offenders = trackedSourceFiles().filter((path) =>
      FOREIGN_HOME_PATH.test(readFileSync(join(ROOT, path), 'utf8')),
    );
    expect(
      offenders,
      'a tracked file binds an absolute path under /home or /Users in a string literal, so it ' +
        'cannot run for anybody but its author. That is either a scratch harness or a defect.',
    ).toEqual([]);
  });
});
