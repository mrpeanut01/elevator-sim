/**
 * **The disarm command is not a rollback, and four places said it was** — GitHub issue #355.
 *
 * `.github/workflows/deploy-viz.yml` (its header, and its arm/disarm pair) and
 * `docs/16-static-site-deployment.md` (§ 0 and § 7) all called `gh variable delete AZURE_SWA_NAME`
 * *the rollback*. It is not one. Deleting that variable skips `jobs.deploy` on every future run;
 * the bytes currently being served are untouched by it and stay untouched. Worse, it is the
 * *opposite* of a recovery — with the variable gone the only job that can write to the live site
 * never runs, so a bad page stays up and the mechanism that could replace it has been switched off.
 *
 * This is `CLAUDE.md`'s *"a stated refusal goes stale the same way"* with the polarity that matters
 * most: a stale refusal tells a reader not to touch a live control, and a **stale promise** tells a
 * reader in an incident that they hold a recovery they do not hold. Three acceptance criteria
 * (#241 AC2, #242 AC4, #243 AC4) ask for a *rehearsed* rollback, and a rehearsal whose subject is
 * the disarm command would record a recovery that recovers nothing.
 *
 * The real procedure is `docs/16-static-site-deployment.md` § 11. This file is the mechanical half:
 * prose is the only artefact in this repository that nothing executes, and four sites drifted the
 * same way at the same time because nothing read them.
 *
 * ## Four checks, and the third is the one a hand-written list cannot do
 *
 * 1. **No carrier states the equation.** {@link ROLLBACK_CLAIM} is a set of affirmative grammars,
 *    deliberately narrow — see below.
 * 2. **The correction is still there**, in both files that carried the claim. Without this, deleting
 *    the whole paragraph passes check 1 by having nothing left to match, and the repository quietly
 *    forgets it ever measured the difference.
 * 3. **The carrier set is derived from disk**, so a *new* file naming the disarm command fails as
 *    loudly as a deleted one. `documentation.test.ts`'s § D192 reason: a hand list cannot see a
 *    site nobody thought to add to it.
 * 4. **The properties § 11 reasons from are asserted against the workflow itself.** § 11's whole
 *    argument is *a revert is a run on `main` whose build job makes the artifact you want* — which
 *    is true only while `workflow_dispatch` is a trigger, `viz-production` is the environment for
 *    non-pull-request events, the deploy step's action is `upload`, and the build stamps
 *    `github.sha`. Any of those moving turns § 11 from a procedure into a wrong procedure, and
 *    nothing else in the tree would notice.
 *
 * ## Why {@link ROLLBACK_CLAIM} is grammars rather than the word
 *
 * Because the corrected text says *rollback* constantly — *"disarming is not a rollback"*, *"a
 * rollback puts an earlier build back"*, *"the rollback is § 11"* — and a proximity check between
 * the word and the command would go red on the correction itself. This is exactly the trap
 * `documentation.test.ts`'s `WITHDRAWAL_MARKERS` records one step along: there, accepting `refut\w*`
 * would have passed six sites that carried the word while asserting the thing. So the patterns match
 * the **claim** — a copula or an appositive binding *rollback* to the subject — and were checked
 * against the four sentences that shipped:
 *
 * | site | the sentence, before | matched by |
 * |---|---|---|
 * | `deploy-viz.yml` header | *"…is a complete rollback rather than half of one"* | copula |
 * | `deploy-viz.yml` disarm line | *"(instant, and this is the rollback)"* | appositive |
 * | `docs/16` § 0 | *"…and that is still the rollback"* | copula |
 * | `docs/16` § 7 | *"# instant, and the rollback on its own"* | appositive |
 *
 * All four match; the corrected text of both files matches none; and `provision.sh` and
 * `serve.ts` — which name the command and never claimed it was a rollback — match none either. That
 * is a measurement rather than an argument, and {@link ROLLBACK_CLAIM_FIXTURES} keeps it runnable so
 * a future edit to the patterns cannot quietly stop catching what they were written for.
 *
 * ## What this file deliberately does not check, and the gap that is left open
 *
 * **It cannot tell you whether the procedure works.** No step of § 11 has been run — against
 * production or against anything — and § 9's *not verified* list says so as item 5. A guard over
 * prose is not a rehearsal, and #241 AC2, #242 AC4 and #243 AC4 stay open until someone with the
 * Static Web App, its federated identity and the Container App runs it and writes down what they
 * saw. § 11.5 lists the six things that rehearsal has to observe.
 *
 * No `DECISIONS.md` entry: this record is the docstring, per [§ D405](../../../../DECISIONS.md) —
 * the decision is a vocabulary correction and the guard that holds it, and the argument for both is
 * here and in `docs/16-static-site-deployment.md` § 11.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseYaml, type YamlValue } from '../../../../infra/checks/miniYaml.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

const WORKFLOW = '.github/workflows/deploy-viz.yml';
const RUNBOOK = 'docs/16-static-site-deployment.md';

/* -------------------------------------------------------------------------- *
 * Reading prose out of four different comment syntaxes
 * -------------------------------------------------------------------------- */

/**
 * Line-comment leaders removed, markdown emphasis removed, whitespace collapsed.
 *
 * The carriers are a YAML file, a markdown file, a shell script and a TypeScript docstring, and the
 * command is line-wrapped across a `*` continuation in the last of them. A search that did not do
 * this would silently miss `serve.ts` and report a smaller carrier set than the tree holds — which
 * is the failure mode check 3 exists to prevent, arriving through the reader instead of the list.
 *
 * Underscores are **kept**, unlike `documentation.test.ts`'s `plain`: `AZURE_SWA_NAME` is the
 * subject here, and stripping `_` would turn it into a different token.
 */
const flatten = (source: string): string =>
  source
    .replace(/^[ \t]*(?:\/\/+|\*+|#+)[ \t]?/gmu, ' ')
    .replaceAll('*', '')
    .replace(/\s+/gu, ' ');

/** The command itself, tolerant of the wrapping every carrier syntax imposes on it. */
const DISARM_COMMAND = /gh variable delete AZURE_SWA_NAME/giu;

/**
 * Affirmative statements that the disarm command *is* a rollback.
 *
 * Two grammars, because the four shipped sentences used two: a copula (*"is a complete rollback"*,
 * *"is still the rollback"*) and an appositive (*"and this is the rollback"*, *"and the rollback on
 * its own"*). The copula arm refuses `not`/`never`/`no` immediately after the verb, so the
 * correction — *"disarming is not a rollback"* — is not a violation of itself.
 */
const ROLLBACK_CLAIM = new RegExp(
  [
    String.raw`\b(?:is|are|was|were|remains?|stays?)\s+(?!not\b|never\b|no\b)(?:still\s+|also\s+|simply\s+|just\s+|now\s+|therefore\s+)?(?:an?|the)\s+(?:complete\s+|full\s+|whole\s+|real\s+|only\s+)?roll ?backs?\b`,
    String.raw`\band\s+(?:this\s+is\s+|that\s+is\s+)?the\s+roll ?backs?\b`,
    String.raw`\broll ?backs?\s+(?:on its own|rather than half)`,
  ].join('|'),
  'giu',
);

/**
 * The four sentences that shipped, verbatim, so the patterns cannot rot into matching nothing.
 *
 * A regex guard that has stopped matching passes every file in the tree and reports success, which
 * is `RISKS.md` R40 with a documentation gate as its subject. These are the exact strings this
 * commit deleted.
 */
const ROLLBACK_CLAIM_FIXTURES: readonly string[] = Object.freeze([
  '`gh variable delete AZURE_SWA_NAME` is a complete rollback rather than half of one.',
  'Disarm it: gh variable delete AZURE_SWA_NAME       (instant, and this is the rollback)',
  'disarming is `gh variable delete AZURE_SWA_NAME`, and that is still the rollback',
  'gh variable delete AZURE_SWA_NAME          # instant, and the rollback on its own',
]);

/**
 * The sentence that says the equation is false, narrow on purpose.
 *
 * Anything looser — the bare word, or *disarm* — would be satisfied by prose that happens to use the
 * vocabulary while asserting nothing, and the whole point of check 2 is that the correction cannot
 * be deleted without this going red.
 */
const CORRECTION = /\b(?:is|was)\s+not\s+(?:an?|the)\s+roll ?back\b/giu;

/* -------------------------------------------------------------------------- *
 * The carrier set, derived from disk
 * -------------------------------------------------------------------------- */

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.foreman', '.claude']);
const SCANNED_SUFFIXES = ['.md', '.ts', '.yml', '.yaml', '.sh', '.mjs', '.bicep'];

/** Every text file the repository owns, as repository-relative paths. */
function scannedFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (at: string, rel: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const here = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(at, entry.name), here);
      else if (SCANNED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) found.push(here);
    }
  };
  walk(ROOT, '');
  return found.sort();
}

/**
 * Excluded from the carrier set, and each for a stated reason.
 *
 * `DECISIONS.md` is out **by construction**, on `documentation.test.ts`'s own precedent (§ D281): a
 * decision record preserves superseded text as history, so a correction there would be a rewrite of
 * the record rather than a fix.
 *
 * This file is out because it quotes all four deleted sentences in
 * {@link ROLLBACK_CLAIM_FIXTURES} — a guard that failed on its own fixtures could not exist. The
 * exclusion is asserted in both directions below, so it cannot quietly come to protect nothing.
 */
const EXCLUDED: readonly string[] = Object.freeze([
  'DECISIONS.md',
  'packages/experiments/src/validation/deployVocabulary.test.ts',
]);

/**
 * Every file that names the disarm command, as of GitHub issue #355.
 *
 * Two of them state a rollback (corrected on this commit), and two name the command without ever
 * claiming it recovers anything — `provision.sh` prints it under *"Turn it off"*, and `serve.ts`
 * cites it as an example of a change that is revoked by redeploying. Both readings are correct and
 * neither needed touching, which is what makes them useful members of this set: they show the
 * patterns discriminate.
 */
const DISARM_CARRIERS: readonly string[] = Object.freeze([
  '.github/workflows/deploy-viz.yml',
  'docs/16-static-site-deployment.md',
  'infra/azure/swa/provision.sh',
  'packages/server/src/http/serve.ts',
]);

/** The two that carried the claim, and must therefore carry the correction. */
const CORRECTED_SITES: readonly string[] = Object.freeze([WORKFLOW, RUNBOOK]);

const carriers = (): readonly string[] =>
  scannedFiles().filter(
    (file) =>
      !EXCLUDED.includes(file) &&
      [...flatten(readFileSync(join(ROOT, file), 'utf8')).matchAll(DISARM_COMMAND)].length > 0,
  );

describe('the disarm command is never called a rollback (GitHub issue #355)', () => {
  it('matches every sentence that shipped — the patterns have not rotted', () => {
    for (const fixture of ROLLBACK_CLAIM_FIXTURES) {
      expect(
        [...flatten(fixture).matchAll(ROLLBACK_CLAIM)].length,
        `this sentence shipped in the tree and the patterns no longer see it: ${fixture}`,
      ).toBeGreaterThan(0);
    }
  });

  it('does not match the correction that replaced them', () => {
    // The trap `documentation.test.ts`'s WITHDRAWAL_MARKERS records: the corrected prose uses the
    // word constantly, and a guard that fired on the word would be red on the fix.
    for (const honest of [
      'Disarming is not a rollback, and this paragraph called it one until § 11 was written.',
      'This section is not the rollback and said it was until § 11 was written.',
      'a rollback puts an earlier build back on a site that stays',
      'Three acceptance criteria ask for a rehearsed rollback',
      'Disarm it: gh variable delete AZURE_SWA_NAME       (instant; the live page is untouched)',
    ]) {
      expect(
        [...flatten(honest).matchAll(ROLLBACK_CLAIM)].map((match) => match[0]),
        `the guard fires on honest prose: ${honest}`,
      ).toEqual([]);
    }
  });

  it('no file in the tree states that the disarm command is a rollback', () => {
    const stated: string[] = [];
    for (const file of carriers()) {
      for (const claim of flatten(read(file)).matchAll(ROLLBACK_CLAIM)) {
        stated.push(`${file}: "${claim[0]}"`);
      }
    }
    expect(
      stated.join('\n'),
      `${stated.join('\n')}\n\n` +
        '`gh variable delete AZURE_SWA_NAME` disarms future deploys. It does not put a previous ' +
        'build back on the live site, and it cannot: with that variable unset, deploy-viz.yml\'s ' +
        '`deploy` job is skipped, so the only thing that can write to the site never runs. The ' +
        'revert is docs/16-static-site-deployment.md § 11.',
    ).toBe('');
  });

  it('still carries the correction in both files that stated it — it cannot be silently deleted', () => {
    const missing = CORRECTED_SITES.filter(
      (file) => [...flatten(read(file)).matchAll(CORRECTION)].length === 0,
    );
    expect(
      missing,
      'named by GitHub issue #355 as having called the disarm command a rollback, and no longer ' +
        'saying that it is not one. Deleting the paragraph passes the check above by leaving ' +
        'nothing to match, and the next reader meets the same trap the issue was filed about.',
    ).toEqual([]);
  });

  it('mechanises the count — the carrier set is derived from disk, not transcribed', () => {
    const found = carriers();
    expect(
      found.length,
      'the walk found no file naming the disarm command, so this whole file is asserting nothing',
    ).toBeGreaterThan(0);
    expect(
      found,
      'the set of files naming `gh variable delete AZURE_SWA_NAME` has changed. A file that ' +
        'appeared here must not call that command a rollback (docs/16 § 11 is the rollback); a ' +
        'file that disappeared removed the command, so check whether the arm/disarm pair it was ' +
        'part of is still documented anywhere.',
    ).toEqual(DISARM_CARRIERS);
  });

  it('excludes its own fixtures, and the exclusion is asserted in both directions', () => {
    const self = 'packages/experiments/src/validation/deployVocabulary.test.ts';
    const text = flatten(read(self));
    expect(
      [...text.matchAll(DISARM_COMMAND)].length,
      `${self} no longer names the disarm command, so excluding it protects nothing and the ` +
        'exclusion should be deleted rather than left standing.',
    ).toBeGreaterThan(0);
    expect(
      [...text.matchAll(ROLLBACK_CLAIM)].length,
      'this file no longer quotes the sentences it exists to refuse, which is the only reason it ' +
        'is excluded from its own scan.',
    ).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The properties § 11 reasons from
 * -------------------------------------------------------------------------- */

const workflow = (): Record<string, YamlValue> => parseYaml(read(WORKFLOW));

/** One level of a parsed mapping, or a failed assertion naming what was expected. */
function mapping(value: YamlValue | undefined, where: string): Record<string, YamlValue> {
  expect(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${where} did not parse as a mapping — the reader is broken, not the workflow`,
  ).toBe(true);
  return value as Record<string, YamlValue>;
}

describe('docs/16 § 11 still describes this workflow (GitHub issue #355)', () => {
  it('the parse found the workflow, so the assertions below are about something', () => {
    const parsed = workflow();
    expect(Object.keys(mapping(parsed['jobs'], 'jobs')).sort()).toEqual([
      'build',
      'close-preview',
      'deploy',
    ]);
  });

  it('workflow_dispatch is a trigger — § 11 step 3 is the revert that always fires', () => {
    // The `push` trigger carries a `paths:` filter, so a revert touching none of those paths starts
    // no run at all. § 11 leans on `workflow_dispatch` precisely because it carries no such filter,
    // and an operator following step 3 against a workflow that had lost this trigger would get
    // "workflow does not have `workflow_dispatch` trigger" and no page.
    const on = mapping(workflow()['on'], 'on');
    expect(
      Object.keys(on),
      'docs/16 § 11 step 3 dispatches this workflow by hand. Without workflow_dispatch there is no ' +
        'trigger that ignores the paths filter, and the procedure has no reliable step 3.',
    ).toContain('workflow_dispatch');
  });

  it("§ 11 quotes the push paths filter, and quotes this workflow's", () => {
    const push = mapping(mapping(workflow()['on'], 'on')['push'], 'on.push');
    const paths = push['paths'];
    expect(Array.isArray(paths), 'on.push.paths did not parse as a list').toBe(true);
    const listed = paths as readonly YamlValue[];
    expect(listed.length, 'on.push.paths is empty, so the quoted list below means nothing').
      toBeGreaterThan(0);

    // Raw text, not `flatten`: the entries carry `*`, and stripping emphasis would turn
    // `packages/**` into `packages/` and `tsconfig*.json` into `tsconfig.json`.
    const runbook = read(RUNBOOK);
    const unquoted = listed.filter((entry) => !runbook.includes(String(entry)));
    expect(
      unquoted,
      'docs/16 § 11 step 2 tells the operator which paths a revert must touch for the push to ' +
        'deploy, and quotes them. These entries are in the workflow and not in the document, so ' +
        'the quoted list has gone stale and the procedure now understates when a push is silent.',
    ).toEqual([]);
  });

  it('the deploy job is gated on AZURE_SWA_NAME — disarming makes a revert impossible', () => {
    const deploy = mapping(mapping(workflow()['jobs'], 'jobs')['deploy'], 'jobs.deploy');
    expect(
      String(deploy['if']),
      'the whole reason the disarm command is not a rollback is that deleting the variable skips ' +
        'this job. If the gate has moved, docs/16 § 0, § 7 and § 11 all argue from something that ' +
        'is no longer true.',
    ).toContain("vars.AZURE_SWA_NAME != ''");
  });

  it('production is viz-production, and only a pull request goes elsewhere', () => {
    const deploy = mapping(mapping(workflow()['jobs'], 'jobs')['deploy'], 'jobs.deploy');
    const environment = mapping(deploy['environment'], 'jobs.deploy.environment');
    const name = String(environment['name']);
    // § 11.1's second property, and § 11.3's first failure mode: the branch policy lives on this
    // environment, so a dispatch on any ref but `main` is refused before the job authenticates.
    expect(name).toContain('viz-production');
    expect(name).toContain("github.event_name == 'pull_request'");
  });

  it('the only write to the live site is an upload of the artifact this run built', () => {
    const deploy = mapping(mapping(workflow()['jobs'], 'jobs')['deploy'], 'jobs.deploy');
    const steps = deploy['steps'];
    expect(Array.isArray(steps), 'jobs.deploy.steps did not parse as a list').toBe(true);
    const uploads = (steps as readonly YamlValue[])
      .map((step) => mapping(step, 'a step of jobs.deploy'))
      .filter((step) => String(step['uses'] ?? '').startsWith('Azure/static-web-apps-deploy'));
    expect(uploads.length, 'no Static Web Apps deploy step found').toBe(1);

    const options = mapping(uploads[0]?.['with'], 'the deploy step\'s `with`');
    expect(
      options['action'],
      'docs/16 § 11.1 says the served bytes change only by another upload, and that there is no ' +
        'promote, slot swap or deployment-history call anywhere. A different action here means a ' +
        'shorter revert may now exist and § 11 should be rewritten around it.',
    ).toBe('upload');
    expect(
      options['skip_app_build'],
      '§ 11 step 2 tells the operator to compare the built tree against the target commit. That ' +
        'is only meaningful while the artifact that ships is the artifact the build job made.',
    ).toBe(true);
    expect(options['app_location']).toBe('dist-web');
  });

  it('the bundle names the commit it was built from — § 11 step 0 reads it back', () => {
    const build = mapping(mapping(workflow()['jobs'], 'jobs')['build'], 'jobs.build');
    const steps = build['steps'];
    expect(Array.isArray(steps), 'jobs.build.steps did not parse as a list').toBe(true);
    const stamped = (steps as readonly YamlValue[])
      .map((step) => mapping(step, 'a step of jobs.build'))
      .flatMap((step) =>
        step['env'] === undefined
          ? []
          : [mapping(step['env'], 'a step env')['ELEVATOR_SIM_BUILD_VERSION']],
      )
      .filter((value) => value !== undefined);
    expect(
      stamped,
      'GitHub issue #246 is what lets § 11 step 0 name the live build and step 2 explain why the ' +
        'deployed build line will read the revert commit rather than the target. Without this the ' +
        'procedure has no way to say which build is on the site.',
    ).toEqual(['${{ github.sha }}']);
  });

  it('the runbook still has a § 11, and the workflow points at it', () => {
    expect(
      read(RUNBOOK),
      'docs/16 § 11 is the revert procedure. Four places used to call the disarm command the ' +
        'rollback; they now point here, so deleting the section leaves those pointers dangling.',
    ).toContain('## 11. Putting a previous build back on the live site');
    expect(
      read(WORKFLOW),
      'deploy-viz.yml sends the reader to the revert procedure instead of to the disarm command.',
    ).toContain('docs/16-static-site-deployment.md § 11');
  });
});
