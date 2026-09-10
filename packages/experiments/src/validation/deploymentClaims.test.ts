/**
 * **The static-hosting lane is armed, and every published refusal that said otherwise is marked.**
 *
 * `docs/16-static-site-deployment.md` § 0 opens by correcting its own text: it read *"No Azure
 * resource has been created by this lane… no page has ever been served from a CDN"* until
 * 2026-08-08, when `provision.sh` was run and the Static Web App `elevator-sim-viz` started serving
 * the page. That correction was made in one document and in `deploy.sh`'s header (§ D339), and it
 * was **not** made in the two other files carrying the same sentence: `README.md`'s documentation
 * table, which is the front door, and `infra/README.md` § 0.2, which is the file whose whole job is
 * to say what is deployed. Both went on refusing a live control for a month, and both were found by
 * reading rather than by any gate.
 *
 * That is `RISKS.md` **R44** — *a state claim that stayed written after the state changed* — and it
 * is explicitly not R38, which is a count drifting. `CLAUDE.md` states the rule this guard
 * mechanises, in the voice § D227 gave it: **a stale refusal is worse than a stale figure**, because
 * a figure that has drifted merely misinforms while a refusal tells the reader not to touch a
 * control that is live. § D227 pinned that rule with a run; nothing pinned the *sentences*.
 *
 * ## What this checks, and what it honestly cannot
 *
 * **It cannot reach Azure.** No test in this repository can say whether a Static Web App exists, and
 * one that claimed to would be worse than none. So this is a **consistency** guard, in the shape
 * `documentation.test.ts` already uses for the three status tables: the tree holds one account of
 * whether the lane is armed, and every document must agree with it or mark its disagreement as
 * withdrawn. The account it pins is `.github/workflows/deploy-viz.yml`'s and `docs/16` § 0's,
 * because those two are what a reader who checks will land on.
 *
 * **The carrier set is derived from disk**, for `documentation.test.ts`'s reason (§ D192): the three
 * grep terms this defect was found with — *"no Azure resource"*, *"Nothing is switched on"*,
 * *"has never been executed"* — reached `README.md` and missed `infra/README.md`, which says the
 * same thing in different words. A hand list cannot see a site nobody thought to add, and a hand
 * *vocabulary* cannot see a site that paraphrases. So the set is computed, asserted in both
 * directions, and a new carrier fails as loudly as a deleted one.
 *
 * **`DECISIONS.md` is out of scope by construction**, per § D281: a decision record preserves
 * superseded text as history, and § D257's *"`provision.sh` has never been executed"* is that
 * history working correctly. Rewriting it would be R37.
 *
 * **Two non-markdown sites carry the sentence and are excluded, and the exclusion is asserted
 * rather than assumed.** `scripts/deploy.sh`'s header quotes the withdrawn refusal under § D339's
 * correction, and `infra/azure/swa/main.bicep` refers to it in the past tense as the failure
 * `docs/16` § 9 predicted. Both are correct today. They are named and checked below so that the
 * next reader knows they were looked at rather than missed — the walk covers published prose, and
 * an exclusion nobody can see is indistinguishable from an oversight. The template's marker is a
 * past-tense narration rather than one of {@link CORRECTION_MARKERS}, and that gap is **stated
 * rather than closed**: admitting past-tense narration into the vocabulary would weaken every
 * assertion over the prose walk, where the point is that a refusal must be marked in terms.
 *
 * ## The other direction, which is the half that will matter later
 *
 * **The lane can be disarmed**, and on the day it is every assertion below inverts. The armed state
 * is therefore asserted from the tree rather than assumed, and the failure message says what to do:
 * if the lane is disarmed, this guard is deleted along with the corrections it holds, rather than
 * left standing to demand that documents keep asserting something that has stopped being true. A
 * guard that outlived its subject would be this file's own defect with a test as its subject.
 *
 * **This file deliberately does not name the disarm command.** An earlier draft called it the
 * rollback, which GitHub issue #355 refuted while this branch was open: deleting the variable skips
 * `jobs.deploy` on every future run and leaves the bytes on the site untouched, so it is the
 * opposite of a recovery. `deployVocabulary.test.ts` is the guard for that claim and derives its
 * own carrier set from disk over `.ts` among other suffixes, so naming the command here would make
 * this file a carrier and its set assertion red. The revert procedure is `docs/16` § 11.
 *
 * ## The guard is itself checked
 *
 * Six mutations at the bottom of this file, each applied to the **shipped** text rather than to a
 * fixture, and each asserting that it moved the finding set before asserting the guard caught it.
 * Four are caught and two are deliberately accepted — the narrowed cross-origin claim, which is
 * still true, and the innocent use of a generic phrase with no deployment subject near it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

/** Emphasis stripped and whitespace collapsed, so a line wrap cannot hide a match. */
const plain = (text: string): string => text.replace(/[*_`]/gu, '').replace(/\s+/gu, ' ');

/* -------------------------------------------------------------------------- *
 * The carrier set, derived from disk
 * -------------------------------------------------------------------------- */

/**
 * Every markdown file this repository publishes as prose: the repository root, `docs/`, and
 * `infra/`.
 *
 * `infra/` is in the walk because leaving it out is the exact hole this guard was written from —
 * `infra/README.md` § 0.2 carried the withdrawn refusal for a month while `documentation.test.ts`'s
 * own `proseFiles()`, which covers `CLAUDE.md` and `docs/*.md` only, could not have seen it. So
 * could `README.md`, which that helper also does not cover.
 *
 * `DECISIONS.md` is excluded by name and only by name, so that the exclusion is one grep away
 * rather than an emergent property of the walk (§ D281).
 */
const HISTORY = 'DECISIONS.md';

const proseFiles = (): readonly string[] => {
  const at = (dir: string): readonly string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => (dir === '.' ? entry.name : `${dir}/${entry.name}`))
      .sort();
  return Object.freeze([...at('.'), ...at('docs'), ...at('infra')].filter((f) => f !== HISTORY));
};

/* -------------------------------------------------------------------------- *
 * The withdrawn vocabulary
 * -------------------------------------------------------------------------- */

/**
 * Sentences that refuse the static-hosting lane outright, each unambiguous about its subject.
 *
 * Every one of these was true before 2026-08-08 and is false now. They are written as patterns
 * rather than literals because the defect this guard exists for is a paraphrase escaping a grep:
 * `README.md` said *"no Azure resource has been created by it"* and `infra/README.md` said *"no
 * Static Web App has been created"*, which is one claim in two vocabularies.
 */
const SPECIFIC_PATTERNS: readonly RegExp[] = Object.freeze([
  /no Azure resources? (?:has|have) (?:ever )?been created/giu,
  /no Static Web App (?:has (?:ever )?been created|exists)/giu,
  /provision\.sh has (?:never|not) been (?:executed|run)/giu,
  /the deploy(?:ment)? workflow is unarmed/giu,
  /no page has (?:ever )?been served (?:cross-origin|from a CDN)/giu,
  /the lane is entirely unrun/giu,
]);

/**
 * Phrases that are only *sometimes* about this lane, admitted when a deployment subject sits near
 * them.
 *
 * Both were among the three terms the defect was found with, and neither is about this lane on its
 * own: § D153's *"Nothing is switched on"* is twelve dispatcher profiles keeping `selection.policy`
 * at `off`, and § D221 writes *"the shell had never been executed"* about a boot path. Firing on
 * those would make this a gate people learn to route around, which is the cost `review-gates.mjs`
 * records for `§ D91`'s wall-clock gates — so the subject has to be present for the phrase to
 * count.
 *
 * The tense is deliberately narrow. `has`/`have never been executed` is a claim about now; *had*
 * never been executed is narration about a past state, which is how § D221 uses it and how a
 * corrected site will read. Admitting `had` would fire on exactly the sentences this guard wants
 * people to write.
 */
const GENERIC_PATTERNS: readonly RegExp[] = Object.freeze([
  /nothing is switched on/giu,
  /(?:has|have) never been executed/giu,
]);

const DEPLOYMENT_SUBJECT =
  /Azure|Static Web App|staticwebapp|provision\.sh|AZURE_SWA_NAME|CDN|cross-origin|static-hosting/giu;

/**
 * A sentence marking the refusal beside it as withdrawn, narrowed, or quoted as history.
 *
 * `to the permitted origin` earns its place: `docs/16` § 9 item 1 and `infra/README.md` § 0.2 both
 * keep *"no page has ever been served cross-origin"* in its **narrowed** form, which is still true
 * — the refusal half met a browser and the permitted half did not — and a marker set that could not
 * express *narrowed* would force a true sentence to be deleted to satisfy a guard. That is the
 * inverse of the defect and would be § D281 with a test as its author.
 */
const CORRECTION_MARKERS =
  /said the opposite|until \d{4}-\d{2}-\d{2}|now false|no longer true|stopped being true|(?:has|have) gone stale|went stale|armed since|it read|corrected|withdraw\w*|superseded|to the permitted origin/giu;

/** Characters between a refusal and its marker. `documentation.test.ts` uses the same order. */
const MARKER_WINDOW = 400;

/** Characters between a generic phrase and the deployment subject that makes it count. */
const SUBJECT_WINDOW = 200;

/** Distance from an occurrence to the nearest match of `markers`, or `Infinity`. */
function nearest(text: string, markers: RegExp, start: number, end: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const marker of text.matchAll(markers)) {
    const from = marker.index;
    const to = from + marker[0].length;
    const distance = from >= end ? from - end : to <= start ? start - to : 0;
    if (distance < best) best = distance;
  }
  return best;
}

interface Occurrence {
  readonly file: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Every refusal in one body of text: the specific patterns always, the generic ones near a subject.
 *
 * Pure over `text` rather than reading the file, so the mutation corpus at the bottom can apply its
 * edits to the **shipped** text in memory rather than to a hand-written fixture. A fixture drifts
 * away from the thing it is a mutation of, which is the trap `ciWorkflowMatrix.test.ts` records.
 */
function refusalsInText(file: string, text: string): readonly Occurrence[] {
  const found: Occurrence[] = [];
  for (const pattern of SPECIFIC_PATTERNS) {
    for (const hit of text.matchAll(pattern)) {
      found.push({ file, text: hit[0], start: hit.index, end: hit.index + hit[0].length });
    }
  }
  for (const pattern of GENERIC_PATTERNS) {
    for (const hit of text.matchAll(pattern)) {
      const start = hit.index;
      const end = start + hit[0].length;
      if (nearest(text, DEPLOYMENT_SUBJECT, start, end) <= SUBJECT_WINDOW) {
        found.push({ file, text: hit[0], start, end });
      }
    }
  }
  return found;
}

const sourceOf = (file: string): string => plain(read(...file.split('/')));

const refusalsIn = (file: string): readonly Occurrence[] => refusalsInText(file, sourceOf(file));

const allRefusals = (): readonly Occurrence[] => proseFiles().flatMap(refusalsIn);

/** The unmarked refusals in one body of text — the predicate the second describe block asserts. */
function unmarkedIn(file: string, text: string): readonly string[] {
  return refusalsInText(file, text)
    .filter((hit) => nearest(text, CORRECTION_MARKERS, hit.start, hit.end) > MARKER_WINDOW)
    .map((hit) => `${file}: "${hit.text}"`);
}

/* -------------------------------------------------------------------------- *
 * The lane is armed — asserted from the tree, not assumed
 * -------------------------------------------------------------------------- */

describe('the static-hosting lane is armed, and the tree says so in two places', () => {
  const workflow = read('.github', 'workflows', 'deploy-viz.yml');

  it('deploy-viz.yml still gates on AZURE_SWA_NAME and still says the variable is set', () => {
    expect(
      workflow,
      "deploy-viz.yml no longer guards its deploying jobs on vars.AZURE_SWA_NAME. The arming " +
        'switch this whole guard is written against has moved, so every claim below is about a ' +
        'mechanism that no longer exists. Re-derive the corrections rather than editing this test ' +
        'to pass.',
    ).toContain("vars.AZURE_SWA_NAME != ''");

    expect(
      plain(workflow),
      'deploy-viz.yml no longer states that AZURE_SWA_NAME is set. If the lane has been DISARMED, ' +
        'then the refusals this file forces to be marked have become TRUE again, and the honest ' +
        'fix is to delete this guard together with the corrections in infra/README.md, README.md ' +
        'and docs/16 § 0 — not to keep asserting a state that has stopped holding. A guard that ' +
        'outlives its subject is RISKS.md R44 with a test as its subject.',
    ).toMatch(/That variable is now set/iu);
  });

  it('the two non-markdown carriers still mark the refusal they quote', () => {
    // Both sit outside the prose walk, and both were checked by hand when this guard was written.
    // Asserting them here is what stops "excluded" from drifting into "never looked at" — it is the
    // shape documentation.test.ts uses for its estimateCost.ts exclusion, in both directions.
    const script = plain(read('scripts', 'deploy.sh'));
    expect(
      refusalsInText('scripts/deploy.sh', script).length,
      'scripts/deploy.sh no longer quotes the withdrawn refusal. If the quote was deleted rather ' +
        'than kept under its marker, that is § D281 — the correction § D339 made is the record.',
    ).toBeGreaterThan(0);
    expect(
      unmarkedIn('scripts/deploy.sh', script),
      'scripts/deploy.sh quotes the withdrawn refusal with no correction beside it. § D339 ' +
        'corrected that header once already, after it had gone on refusing a live control for ' +
        'five days.',
    ).toEqual([]);

    // The template's one occurrence is narrated in the past tense — docs/16 § 9 *listed* it as the
    // most likely first failure, and it *was* it — which is a perfectly good withdrawal in English
    // and one CORRECTION_MARKERS does not recognise. That is stated rather than fixed: widening the
    // vocabulary to admit past-tense narration would weaken every assertion above, where the whole
    // point is that a refusal must be marked explicitly. So what is pinned here is the framing.
    const template = plain(read('infra', 'azure', 'swa', 'main.bicep'));
    const hits = refusalsInText('infra/azure/swa/main.bicep', template);
    expect(hits, 'the SWA template no longer quotes the refusal at all').toHaveLength(1);
    const [only] = hits;
    if (only === undefined) throw new Error('unreachable: the length was just asserted');
    expect(
      template.slice(Math.max(0, only.start - 200), only.end + 200),
      'the SWA template quotes the withdrawn refusal outside the past-tense narration that made it ' +
        'history. As a live claim it would be false: the template has deployed, and § D308 is the ' +
        'account of what failed when it did.',
    ).toMatch(/It failed on the first real run|this was it/u);
  });

  it('docs/16 § 0 still carries the arming table it corrected itself with', () => {
    const doc = plain(read('docs', '16-static-site-deployment.md'));
    expect(doc, 'docs/16 § 0 no longer names the Static Web App it says exists').toContain(
      'elevator-sim-viz',
    );
    expect(
      doc,
      'docs/16 § 0 no longer opens by correcting its own withdrawn refusal. That paragraph is the ' +
        'model every other correction in the tree was written against; if it has gone, the ' +
        'corrections elsewhere point at nothing.',
    ).toMatch(/This section said the opposite until 2026-08-08/u);
  });
});

/* -------------------------------------------------------------------------- *
 * No published refusal stands unmarked
 * -------------------------------------------------------------------------- */

describe('the withdrawn static-hosting refusal never stands unmarked (§ D227)', () => {
  it('finds the vocabulary at all — the walk and the patterns are not vacuous', () => {
    // Without this, deleting every pattern or pointing the walk at an empty directory would make
    // the check below pass by finding nothing, which is the failure mode `ciWorkflowMatrix.test.ts`
    // records for a parser that quietly understands no file.
    expect(proseFiles().length, 'the prose walk found almost nothing — it is broken').toBeGreaterThan(
      30,
    );
    expect(proseFiles()).not.toContain(HISTORY);
    expect(
      allRefusals().length,
      'no file states the withdrawn refusal at all, not even the three that quote it under a ' +
        'correction. Either the patterns have stopped matching English this repository writes, or ' +
        'the corrections were deleted rather than marked — which is what § D281 refuses.',
    ).toBeGreaterThan(2);
  });

  it('marks every occurrence as withdrawn, narrowed, or quoted', () => {
    const unmarked = proseFiles().flatMap((file) => unmarkedIn(file, sourceOf(file)));
    const report =
      `${unmarked.join('\n')}\n\n` +
      `No correction within ${String(MARKER_WINDOW)} characters. The static-hosting lane was ` +
      'ARMED on 2026-08-08: the Static Web App elevator-sim-viz exists, the site is live, all six ' +
      'repository variables are set, and production deploys run from main under the ' +
      'viz-production branch policy (docs/16 § 0). A refusal that has gone stale is worse than a ' +
      'figure that has, because it tells the reader not to touch a control that is live (§ D227). ' +
      'Mark the sentence as withdrawn the way docs/16 § 0 marks its own — do not silently delete ' +
      'it, and do not silently refresh it.';
    expect(unmarked, unmarked.length === 0 ? '' : report).toEqual([]);
  });

  it('mechanises the carrier set — derived from disk, not transcribed', () => {
    // The other direction, and the one the three grep terms did not have. A file that APPEARS here
    // has started stating a refusal the lane withdrew and must mark it; a file that DISAPPEARS
    // deleted the record of a withdrawn refusal instead of marking it, which § D281 refuses. The
    // check above cannot see either — an unmarked-refusal scan passes when the paragraph is gone.
    const carriers = [...new Set(allRefusals().map((hit) => hit.file))].sort();
    expect(
      carriers,
      'the set of documents stating the withdrawn static-hosting refusal has changed. A NEW file ' +
        'here must mark the sentence as withdrawn (docs/16 § 0 is the model). A file that has ' +
        'GONE deleted a withdrawn refusal rather than marking it — § D281 preserves superseded ' +
        'text under its marker and never drops it.',
    ).toEqual(['README.md', 'docs/16-static-site-deployment.md', 'infra/README.md']);
  });
});

/* -------------------------------------------------------------------------- *
 * The guard rejects mutations of the shipped text — and accepts two on purpose
 * -------------------------------------------------------------------------- */

/**
 * **Every mutation below is applied to the text this repository ships, and each asserts that it
 * actually moved the finding set before asserting that the guard caught it.**
 *
 * That second assertion is not decoration, and this file learned it the expensive way. The first
 * pass at this corpus mutated `infra/README.md` with three string replacements and recorded a
 * **miss** — the guard had not fired. It had not fired because the mutation never applied: `no
 * Static Web App has been created` spans a line break in the raw file, so the literal matched
 * nothing, and only {@link plain} collapses the wrap. A mutant that does not land looks exactly
 * like a guard that does not bite. `ciWorkflowMatrix.test.ts` records the same lesson with the
 * polarity reversed — four of its mutants silently edited a header comment and were recorded as
 * catches — so the rule is the same either way: prove the mutation moved something first.
 *
 * The last two cases are **accepted** rather than caught, and they are the ones that keep this from
 * being a gate people route around.
 */
describe('the guard bites, proved by mutating the shipped text', () => {
  const README = 'README.md';

  it('catches the original defect: the README refusal restored unmarked', () => {
    const shipped = sourceOf(README);
    const start = shipped.indexOf('Armed since 2026-08-08');
    expect(start, 'README.md no longer carries the corrected clause this mutation edits').toBeGreaterThan(0);
    const end = shipped.indexOf(' |', start);
    expect(end, 'the corrected clause does not end at a table cell boundary').toBeGreaterThan(start);

    // The exact sentence README.md line 297 carried from the day the lane was armed until it was
    // corrected. Restoring it is the defect, verbatim.
    const mutated =
      `${shipped.slice(0, start)}Nothing is switched on and no Azure resource has been created ` +
      `by it${shipped.slice(end)}`;

    expect(mutated, 'the mutation changed nothing').not.toEqual(shipped);
    expect(unmarkedIn(README, shipped), 'the shipped README is unmarked before the mutation').toEqual([]);
    expect(
      unmarkedIn(README, mutated),
      'the README row went back to refusing a live control and the guard did not fail. This is ' +
        'the defect this file exists for.',
    ).not.toEqual([]);
  });

  it('catches a marker deleted while the quoted refusal stays', () => {
    const shipped = sourceOf(README);
    // Every correction marker stripped, the refusal it marks left in place. This is the shape a
    // well-meaning tidy-up takes: the quote reads like prose, so the caveat around it gets trimmed.
    const mutated = shipped.replace(CORRECTION_MARKERS, '');
    expect(mutated.length, 'no marker was stripped — the mutation did not apply').toBeLessThan(
      shipped.length,
    );
    expect(refusalsInText(README, mutated).length, 'the refusal went with the markers').toBeGreaterThan(0);
    expect(
      unmarkedIn(README, mutated),
      'the correction markers were deleted and the refusal left standing, and the guard passed.',
    ).not.toEqual([]);
  });

  it('catches a new carrier — the vocabulary is not README-specific', () => {
    // GAPS.md states no such thing today. If it ever does, the carrier-set assertion above fails
    // and this is why: the patterns are about the sentence, not about the file that holds it.
    const invented = 'No Azure resource has been created by this lane, and the lane is entirely unrun.';
    expect(
      refusalsInText('GAPS.md', invented).map((hit) => hit.text),
      'a document that started stating the withdrawn refusal would not be detected',
    ).toHaveLength(2);
    expect(unmarkedIn('GAPS.md', invented)).not.toEqual([]);
  });

  it('catches the paraphrase that the three original grep terms missed', () => {
    // `infra/README.md` said this for a month while `no Azure resource`, `Nothing is switched on`
    // and `has never been executed` all failed to find it. One claim, two vocabularies.
    const paraphrase = 'no Static Web App has been created, and no page has ever been served cross-origin';
    expect(
      refusalsInText('infra/README.md', paraphrase).map((hit) => hit.text),
      'the paraphrase this guard was written from escapes it',
    ).toHaveLength(2);
  });

  it('accepts the narrowed form, because it is still true', () => {
    // docs/16 § 9 item 1 and infra/README.md § 0.2 both keep the cross-origin refusal in its
    // narrowed form: the refusal half met a browser, the permitted half did not. A guard that could
    // not express *narrowed* would force a true sentence to be deleted to go green, which is the
    // inverse of the defect.
    const narrowed = 'No page has ever been served cross-origin to the permitted origin.';
    expect(refusalsInText('docs/16-static-site-deployment.md', narrowed)).not.toEqual([]);
    expect(
      unmarkedIn('docs/16-static-site-deployment.md', narrowed),
      'the narrowed cross-origin claim is still true and must not be forced out of the tree',
    ).toEqual([]);
  });

  it('accepts the innocent use of a generic phrase, with no deployment subject near it', () => {
    // § D153 clause 4, verbatim in substance: twelve dispatcher profiles keeping selection.policy
    // at off. Nothing to do with Azure, and firing on it would make this a gate people route
    // around — the cost review-gates.mjs records for § D91's wall-clock gates.
    const innocent =
      'Nothing is switched on. All twelve shipped profiles keep selection.policy at off, so the ' +
      'weight sets are loaded and no run consults them.';
    expect(
      refusalsInText('CLAUDE.md', innocent),
      'the generic phrase fired with no deployment subject anywhere near it',
    ).toEqual([]);

    // And the same phrase beside the subject does fire, which is what says the window is doing
    // work rather than the pattern simply being dead.
    const guilty = 'Nothing is switched on and no Static Web App exists for this lane.';
    expect(refusalsInText('CLAUDE.md', guilty).length).toBeGreaterThan(0);
  });
});
