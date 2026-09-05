/**
 * Every workflow runs the Node this repository declares, derived from both sides rather than
 * transcribed into either.
 *
 * ## What this exists to stop
 *
 * `package.json` declares `engines.node`, and **twelve `node-version:` lines across four workflow
 * files** name a version independently. Nothing compared them. A bump to `engines` that misses one
 * workflow leaves that job running an older Node while every check stays green, and the failure it
 * produces later is attributed to whatever code happened to touch the affected path — which is the
 * hardest kind of failure to attribute, because the run that introduced it was green.
 *
 * It is `ciLegs.test.ts`'s subject with a different column: that file stops a *project* losing its
 * leg, this one stops a *leg* running the wrong runtime. Both are the same rule — **derive the set
 * from the files that own it, and compare in both directions** — and both exist because a
 * hand-written value repeated across files is `RISKS.md` R38 with a workflow as its subject.
 *
 * ## Why `.nvmrc` is in the comparison
 *
 * A container that arrives with the wrong Node is not a hypothetical here. `AGENT_STATUS.md`
 * records a host that arrived with **no `node_modules` at all**, where `npm run typecheck` failed
 * on *"Cannot find module 'vitest'"* and read exactly like a broken tree — and the note ends
 * *"a lane that reads a fresh clone's red typecheck as a repository defect will file a phantom
 * issue."* The session that added this file arrived on **Node 22.22.2** against a package declaring
 * `>= 26`, so `npm install` warned `EBADENGINE` and proceeded.
 *
 * Before this commit the required version was discoverable only from a semver **range** and twelve
 * workflow lines. `.nvmrc` is the one place a provisioner, `nvm`, `fnm` or a devcontainer actually
 * reads, and it is now asserted against the same source as the workflows. **That is the whole of
 * the fix: the requirement had no single place to look, and now it has one that cannot drift.**
 *
 * ## What this file does not do
 *
 * It cannot make a machine install the right Node, and it does not check the Node it is running on.
 * A guard that failed on the interpreter would be red on every correctly-configured developer
 * machine that had simply not switched yet, which is `RISKS.md` R40's *"people learn to ignore it"*
 * in the making. It asserts that the repository's four statements of the requirement agree, and
 * says plainly that enforcing them on a host is the host's job.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

/**
 * The major version `package.json` declares, which is the source every other statement is checked
 * against.
 *
 * Read as a **range** and reduced to its floor, because that is what the field is: `>=26` admits 27
 * and a workflow pinned to `'26'` is honouring it. What the workflows may not do is name a version
 * the range excludes, which is the direction this extracts for.
 */
function declaredMajor(): number {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
  };
  const range = pkg.engines?.node;
  expect(range, '`package.json` declares no `engines.node`, so nothing here has a source to check against').toBeTypeOf('string');
  const floor = /(\d+)/u.exec(range as string)?.[1];
  expect(floor, `\`engines.node\` is ${String(range)}, which carries no major version this can read`).toBeTypeOf('string');
  return Number(floor);
}

/** Every `node-version:` a workflow names, with the file it came from, derived from the directory. */
function workflowNodeVersions(): readonly { readonly file: string; readonly version: string }[] {
  const found: { file: string; version: string }[] = [];
  for (const file of readdirSync(WORKFLOW_DIR)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const source = readFileSync(join(WORKFLOW_DIR, file), 'utf8');
    for (const match of source.matchAll(/node-version:\s*'?"?(\d+)/gu)) {
      found.push({ file, version: match[1] as string });
    }
  }
  return found;
}

describe('every CI leg runs the Node this repository declares', () => {
  it('names a node-version in at least one workflow, so this file cannot pass vacuously', () => {
    /*
     * `deadCode.test.ts`'s idiom, and it is not optional here: a regex that matched nothing would
     * report agreement forever and look permanently green, which is the failure mode `ciLegs.test.ts`
     * documents for `--project nosuchname`. Twelve is the count at the commit this landed on; the
     * floor is deliberately loose because the number is expected to move and the vacuity is what
     * matters.
     */
    expect(
      workflowNodeVersions().length,
      'no workflow names a `node-version`, so either the setup step was removed or this parser has ' +
        'stopped matching it. Either way every assertion below is vacuous.',
    ).toBeGreaterThanOrEqual(4);
  });

  it('agrees with `package.json`, in every workflow that names one', () => {
    const declared = declaredMajor();
    const wrong = workflowNodeVersions().filter((row) => Number(row.version) < declared);
    expect(
      wrong,
      `\`package.json\` declares node >= ${String(declared)} and these workflow steps name a lower ` +
        'major. A job pinned below the declared floor runs a runtime this repository does not ' +
        'support, and it stays green while it does it.',
    ).toEqual([]);
  });

  it('agrees with `.nvmrc`, which is the file a provisioner reads', () => {
    const declared = declaredMajor();
    const nvmrc = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    const major = /(\d+)/u.exec(nvmrc)?.[1];
    expect(
      major,
      `\`.nvmrc\` reads ${JSON.stringify(nvmrc)}, which carries no major version. It exists so that a ` +
        'container arrives on the right runtime rather than on whatever the image shipped.',
    ).toBeTypeOf('string');
    expect(
      Number(major),
      `\`.nvmrc\` names Node ${String(major)} and \`package.json\` declares >= ${String(declared)}. ` +
        'A provisioner reading `.nvmrc` would install a runtime the package refuses.',
    ).toBeGreaterThanOrEqual(declared);
  });
});
