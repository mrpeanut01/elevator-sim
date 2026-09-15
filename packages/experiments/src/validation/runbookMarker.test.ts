/**
 * **The alert rule is written against a document, so the document's literal is pinned to the code's**
 * — GitHub issue **#242**, AC3.
 *
 * ## The gap this closes
 *
 * `packages/server/src/errors/faults.ts` says of its own constant: *"It is the alert key, so it is a
 * constant here and **quoted in the runbook** rather than typed twice."* That sentence describes a
 * relationship between a `.ts` file and a `.md` file, and **nothing checked it**.
 *
 * The code side is pinned hard — `faults.test.ts` and `http/boot.test.ts` assert the line as a
 * **literal** rather than reading it back out of the constant, so renaming the constant is red. What
 * is not pinned is the direction that matters to an operator: [`docs/40-incident-runbook.md`](../../../../docs/40-incident-runbook.md)
 * § 4 is the specification somebody types into Azure, and
 * [`docs/41-launch-checklist.md`](../../../../docs/41-launch-checklist.md) § 6.5 repeats it. A wave
 * that moved the marker and updated the server's tests in the same commit would leave both documents
 * naming a string the product no longer writes — and **the failure is silent in the worst possible
 * way**: the rule stops matching, nothing goes red anywhere, and the first anyone learns of it is an
 * incident nobody was told about.
 *
 * That is `CLAUDE.md`'s *a published number goes stale the same way* rule pointed at a string rather
 * than a figure, and `docs/40` § 0's whole reason for existing — an instrument that is described as
 * armed and is not.
 *
 * ## The four checks
 *
 * 1. **The marker the runbook quotes is the marker the code writes**, derived from
 *    `faults.ts` rather than transcribed here.
 * 2. **Every `at` value the runbook lists is one the code can produce, and every one the code can
 *    produce is listed** — both directions, from the `ServerFaultAt` union. A fifth kind of fault
 *    that the runbook does not name is a class of incident an operator would read as unclassified.
 * 3. **The checklist's copy of the rule agrees with the runbook's**, because § 6.5 is where a launch
 *    operator meets it and two copies of a literal are two things that can disagree.
 * 4. **Every parse asserts it found something**, so a renamed constant or a reformatted section
 *    makes this file red rather than vacuous — `RISKS.md` R40, the clause every guard here carries.
 *
 * ## What this does not check
 *
 * **Whether the alert rule exists.** It does not: `docs/40` § 0 marks it NOT ARMED and § 4 is the
 * handover to a human with a subscription. This file makes the specification stay true; it cannot
 * make anybody read it. AC3 asks for a *verified* alert path and stays open.
 *
 * No `DECISIONS.md` entry: this docstring is the record, per [§ D405](../../../../DECISIONS.md).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const RUNBOOK = 'docs/40-incident-runbook.md';
const CHECKLIST = 'docs/41-launch-checklist.md';
const FAULTS = 'packages/server/src/errors/faults.ts';

/** The marker, read out of the module that writes it. */
const markerFromCode = (): string => {
  const source = read(FAULTS);
  const found = /const FAULT_MARKER = '([^']+)'/u.exec(source);
  expect(
    found,
    `${FAULTS} no longer declares FAULT_MARKER in a shape this file can read, so every case below ` +
      'would assert nothing. Fix the reader — the alternative is a guard that is green because it ' +
      'is blind.',
  ).not.toBeNull();
  return (found as RegExpExecArray)[1] as string;
};

/** Where a fault can happen, read out of the union rather than listed here. */
const faultKindsFromCode = (): readonly string[] => {
  const source = read(FAULTS);
  const found = /export type ServerFaultAt =([^;]+);/u.exec(source);
  expect(found, `${FAULTS} no longer declares ServerFaultAt in a readable shape`).not.toBeNull();
  const kinds = [...((found as RegExpExecArray)[1] as string).matchAll(/'([a-z-]+)'/gu)].map(
    (match) => match[1] as string,
  );
  expect(kinds.length, 'no fault kinds were parsed, so the both-directions case is vacuous').
    toBeGreaterThan(2);
  return kinds;
};

describe('the alert key the runbook publishes (GitHub issue #242)', () => {
  it('is the literal the server actually writes', () => {
    const marker = markerFromCode();
    expect(marker.length).toBeGreaterThan(8);
    expect(
      read(RUNBOOK),
      `${RUNBOOK} § 4 specifies an alert rule whose whole condition is this literal, and the ` +
        'literal it names is not the one the server writes. An operator would create a rule that ' +
        'matches nothing, and nothing anywhere would go red.',
    ).toContain(marker);
    expect(read(CHECKLIST), `${CHECKLIST} § 6.5 repeats the rule and no longer names the marker`).
      toContain(marker);
  });

  it('carries the tighter boot rule in the same words on both documents', () => {
    const bootRule = `${markerFromCode()} at=boot`;
    for (const document of [RUNBOOK, CHECKLIST]) {
      expect(
        read(document),
        `${document} no longer names the second, tighter rule. A boot fault means the revision did ` +
          'not come up, and on a deployment at minReplicas: 0 there is no process left to ask',
      ).toContain(bootRule);
    }
  });

  it('names every place a fault can happen, and names no place that cannot', () => {
    const kinds = faultKindsFromCode();
    const runbook = read(RUNBOOK);
    // Every kind the code can produce is named for an operator reading a stream.
    for (const kind of kinds) {
      expect(runbook, `${RUNBOOK} does not tell an operator what at=${kind} means`).toContain(kind);
    }
    // And the list the runbook publishes holds nothing the code cannot produce.
    const published = /- `at` is one of ([^.]+)\./u.exec(runbook);
    expect(published, `${RUNBOOK}'s at-vocabulary line is gone, so this case reads nothing`).not.
      toBeNull();
    const listed = [...((published as RegExpExecArray)[1] as string).matchAll(/`([a-z-]+)`/gu)].map(
      (match) => match[1] as string,
    );
    expect([...listed].sort()).toEqual([...kinds].sort());
  });
});
