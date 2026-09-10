/**
 * **The report surface, against the ruling that produced it** — GitHub issue **#245**.
 *
 * Four things are load-bearing here, and they are the four a reviewer should read first.
 *
 * 1. **The public notice is in every state**, not on the happy arm. The product owner's ruling of
 *    2026-09-09 makes it *"a requirement of this ruling, not a nicety"*, and a reader who is being
 *    refused has already typed — so the state where the press is greyed is exactly the state where
 *    the notice matters, and it is the state a happy-path assertion would never visit.
 * 2. **What is shown is what is sent.** Every line of the attachment appears verbatim in the report,
 *    and the report carries no attachment line the surface did not show. A surface that showed a
 *    summary and sent something else would be the shape this repository keeps catching, on the one
 *    screen where a reader is deciding what to make public.
 * 3. **The run is replayable from the report alone** — the issue's fifth criterion. Parsed back out
 *    of the composed body rather than read off the view, because the report is what a maintainer
 *    has and the view is not.
 * 4. **The reason `runIdentityIssues`' own sentences do not cross onto this screen is measured
 *    rather than asserted.** They are run through the honesty search's own notation check, on this
 *    surface's own id, and at least one of them comes back a violation. That is the difference
 *    between a stated mechanism and a pinned one — `CLAUDE.md`'s standing lesson, applied to a
 *    sentence this file could have written instead.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PROPERTY_CHECKS } from '../honesty/properties.js';
import type { HonestyContext, RenderedText } from '../honesty/index.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { baseState, RESOURCES } from '../scope/probes.test-helper.js';
import { BUILD_VERSION, UNBUILT } from '../release/version.js';
import { MAX_FAULTS_COUNTED } from './faults.js';
import { RUN_CONTEXTS } from './types.js';
import {
  reportBodyOf,
  reportLinkOf,
  SUPPORT_BROWSER_LIMIT,
  SUPPORT_COPY,
  SUPPORT_REPORT_FORM,
  SUPPORT_TEXT_LIMIT,
  supportFactsOf,
  supportViewOf,
  type SupportInput,
  type SupportRun,
  type SupportView,
} from './support.js';

/** The surface's own id, as `honesty/surfaces.ts` registers it. */
const SURFACE_ID = 'everyday/support.ts#supportViewOf';

/**
 * The address ceiling `SUPPORT_TEXT_LIMIT` is bracketed against.
 *
 * Here rather than beside the limit it brackets, because nothing in the shipped module would read
 * it: a ceiling exported for a test to import is an export with no caller, and this repository
 * keeps a running count of those. What the number is for: a few kilobytes is where servers start
 * refusing an address outright, and 8 000 is a conservative round figure inside that.
 */
const SUPPORT_ADDRESS_BUDGET = 8_000;

const RUN: SupportRun = {
  seed: 20_260_909n,
  buildingId: 'midtown-office',
  buildingName: 'Midtown Office',
  dispatcherId: 'collective',
  dispatcherName: 'Collective control',
  day: 3,
  ctx: 'daily',
  carried: true,
};

/**
 * Every state a reader can load this block into, named.
 *
 * Iterated rather than sampled, for `honesty/surfaces.ts`' own reason: the states a form gets wrong
 * are its unhappy ones, and a suite that only visits the arm where everything works has checked the
 * arm nobody was worried about.
 */
function states(): readonly { readonly name: string; readonly input: SupportInput }[] {
  return [
    { name: 'nothing typed, no run', input: { text: '' } },
    { name: 'nothing typed, a run', input: { text: '', run: RUN } },
    { name: 'typed, no run', input: { text: 'The menu will not open.', browser: 'A browser' } },
    { name: 'typed, a run', input: { text: 'The lift skipped my floor.', run: RUN, browser: 'A browser' } },
    {
      name: 'typed, a run the settings do not carry',
      input: { text: 'The lift skipped my floor.', run: { ...RUN, carried: false }, browser: 'A browser' },
    },
    { name: 'longer than the page will take', input: { text: 'x'.repeat(SUPPORT_TEXT_LIMIT + 1), run: RUN } },
    { name: 'whitespace only', input: { text: '   \n  ' } },
    /*
     * GitHub issue #242's four fault states. Four rather than one because the line composes from
     * two independent halves and a ceiling, and because *no problems* and *no register* are
     * different claims that must not render the same. The dead-page state — faults while starting
     * up and none after — is the one this issue exists for.
     */
    {
      name: 'a page that failed while starting up',
      input: { text: 'The menu is there but nothing opens.', faults: { startingUp: 3, playing: 0 } },
    },
    {
      name: 'a page that failed while being played',
      input: {
        text: 'The lift skipped my floor.',
        run: RUN,
        browser: 'A browser',
        faults: { startingUp: 0, playing: 1 },
      },
    },
    {
      name: 'a page that failed in both halves, at the ceiling',
      input: {
        text: 'Everything is stuck.',
        run: RUN,
        faults: { startingUp: MAX_FAULTS_COUNTED, playing: 2 },
      },
    },
    {
      name: 'a page with a register and nothing in it',
      input: { text: 'A number looks wrong.', run: RUN, faults: { startingUp: 0, playing: 0 } },
    },
  ];
}

const viewsByName = (): readonly { readonly name: string; readonly view: SupportView }[] =>
  states().map(({ name, input }) => ({ name, view: supportViewOf(input) }));

/* -------------------------------------------------------------------------- *
 * 1. The ruling's requirement
 * -------------------------------------------------------------------------- */

describe('the ruling’s requirement — the words are public, said next to the box', () => {
  it('carries the public notice in every state, including the refused ones', () => {
    for (const { name, view } of viewsByName()) {
      expect(view.publicNotice, name).toBe(SUPPORT_COPY.publicNotice);
    }
  });

  it('says publicly, says anyone can read it, and says it stays', () => {
    const notice = SUPPORT_COPY.publicNotice.toLowerCase();
    expect(notice).toContain('posted publicly');
    expect(notice).toContain('anyone can read it');
    expect(notice).toContain('stays there');
  });

  it('says what is attached, and that nothing about the player is', () => {
    for (const { name, view } of viewsByName()) {
      expect(view.attachNotice, name).toBe(SUPPORT_COPY.attachNotice);
    }
    const notice = SUPPORT_COPY.attachNotice.toLowerCase();
    expect(notice).toContain('name');
    expect(notice).toContain('email address');
  });

  it('names the deletion path on the same surface, and it is not a promise', () => {
    for (const { name, view } of viewsByName()) {
      expect(view.deletionNotice, name).toBe(SUPPORT_COPY.deletionNotice);
    }
    /*
     * `docs/26` § 16.5: the product can delete a copy it holds and cannot unpublish what somebody
     * has read, and it should not imply otherwise. A surface promising deletion would be the
     * *"promise a withdrawn car cannot keep"* this repository already closed once, on a screen.
     */
    expect(SUPPORT_COPY.deletionNotice.toLowerCase()).toContain('cannot unpublish');
  });

  it('says the press opens a page and posts nothing, before the press', () => {
    for (const { name, view } of viewsByName()) {
      expect(view.handoffNotice, name).toBe(SUPPORT_COPY.handoffNotice);
    }
    expect(SUPPORT_COPY.handoffNotice.toLowerCase()).toContain('nothing is posted until you press');
  });
});

/* -------------------------------------------------------------------------- *
 * 2. What is shown is what is sent
 * -------------------------------------------------------------------------- */

describe('what the reader is shown is what travels', () => {
  it('puts every shown line in the report, verbatim', () => {
    for (const { name, input } of states()) {
      const body = reportBodyOf(input);
      for (const fact of supportViewOf(input).attached) {
        expect(body, `${name} — ${fact.label}`).toContain(`${fact.label}: ${fact.value}`);
      }
    }
  });

  it('puts no attachment line in the report that the reader was not shown', () => {
    for (const { name, input } of states()) {
      const shown = new Set(supportFactsOf(input).map((fact) => `${fact.label}: ${fact.value}`));
      /*
       * Every line of the body that reads as a labelled attachment line. The headings and the
       * closing sentence are prose and carry no colon-led label, so this picks out exactly the
       * attachment — and a line added to the composer without being shown lands here.
       */
      const carried = reportBodyOf(input)
        .split('\n')
        .filter((line) => /^[A-Z][^:]{2,40}: /u.test(line));
      for (const line of carried) expect(shown, `${name} — ${line}`).toContain(line);
      expect(carried.length, name).toBe(shown.size);
    }
  });

  it('reads the same browser string it sends, capped before it reaches either', () => {
    const long = 'b'.repeat(SUPPORT_BROWSER_LIMIT + 400);
    const view = supportViewOf({ text: 'a report', browser: long });
    const shown = view.attached.find((fact) => fact.label === SUPPORT_COPY.browserLabel)?.value ?? '';
    expect(shown.length).toBe(SUPPORT_BROWSER_LIMIT);
    expect(reportBodyOf({ text: 'a report', browser: long })).toContain(
      `${SUPPORT_COPY.browserLabel}: ${shown}`,
    );
  });

  it('says so when there is no browser to name, rather than leaving the line empty', () => {
    const view = supportViewOf({ text: 'a report' });
    expect(view.attached.find((fact) => fact.label === SUPPORT_COPY.browserLabel)?.value).toBe(
      SUPPORT_COPY.browserUnknown,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 3. The report replays the run — the issue's fifth criterion
 * -------------------------------------------------------------------------- */

describe('a maintainer can rebuild the run from the report alone', () => {
  /** What a reader of the issue has: the body, and nothing else. */
  const fieldsOf = (body: string): ReadonlyMap<string, string> => {
    const fields = new Map<string, string>();
    for (const line of body.split('\n')) {
      const at = line.indexOf(': ');
      if (at > 0) fields.set(line.slice(0, at), line.slice(at + 2));
    }
    return fields;
  };

  it('carries the crowd number, the building, the dispatcher, the day and the build', () => {
    const fields = fieldsOf(reportBodyOf({ text: 'a report', run: RUN, browser: 'A browser' }));
    expect(fields.get(SUPPORT_COPY.seedLabel)).toBe('20260909');
    expect(fields.get(SUPPORT_COPY.buildingLabel)).toBe('Midtown Office (midtown-office)');
    expect(fields.get(SUPPORT_COPY.dispatcherLabel)).toBe('Collective control (collective)');
    expect(fields.get(SUPPORT_COPY.dayLabel)).toBe('day 3');
    expect(fields.get(SUPPORT_COPY.playingLabel)).toBe('a day of the daily loop');
    expect(fields.get(SUPPORT_COPY.buildLabel)).toBe(
      BUILD_VERSION === UNBUILT ? SUPPORT_COPY.buildUnknown : BUILD_VERSION,
    );
    expect(fields.get(SUPPORT_COPY.browserLabel)).toBe('A browser');
  });

  it('carries the reader’s own words, so the report is a report', () => {
    expect(reportBodyOf({ text: '  The lift skipped my floor.  ', run: RUN })).toContain(
      'The lift skipped my floor.',
    );
  });

  it('says the first day as a phrase rather than as day 1', () => {
    const fields = fieldsOf(reportBodyOf({ text: 'a report', run: { ...RUN, day: 1 } }));
    expect(fields.get(SUPPORT_COPY.dayLabel)).toBe('the first day');
  });

  it('names every flow a run can be in, so a report never arrives blank about it', () => {
    for (const ctx of RUN_CONTEXTS) {
      const value = supportFactsOf({ text: 'a report', run: { ...RUN, ctx } }).find(
        (fact) => fact.label === SUPPORT_COPY.playingLabel,
      )?.value;
      expect(value, ctx).toBeDefined();
      expect((value ?? '').trim().length, ctx).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 4. The three states of the run, and the two refusals
 * -------------------------------------------------------------------------- */

describe('the run’s three states each say their own thing', () => {
  it('says there is nothing to point at when nothing has played', () => {
    const view = supportViewOf({ text: 'a report' });
    expect(view.stage).toBe('no-run');
    expect(view.stageNote).toBe(SUPPORT_COPY.noRun);
    /* No run means no run fields — a report that invented a crowd number would be worse than one
       that had none. */
    for (const label of [SUPPORT_COPY.seedLabel, SUPPORT_COPY.buildingLabel]) {
      expect(view.attached.map((fact) => fact.label)).not.toContain(label);
    }
  });

  it('sends the report anyway when nothing has played', () => {
    /*
     * A player whose menu will not open has never reached a run. A form that refused them would
     * refuse exactly the reports nothing else in this product can catch.
     */
    const view = supportViewOf({ text: 'The menu will not open.' });
    expect(view.actionOffered).toBe(true);
    expect(view.destination).toBeDefined();
  });

  it('says the settings rebuild the run when they do', () => {
    const view = supportViewOf({ text: 'a report', run: RUN });
    expect(view.stage).toBe('run');
    expect(view.stageNote).toBe(SUPPORT_COPY.run);
  });

  it('says the settings are not the whole of it when they are not, and asks for the rest', () => {
    const view = supportViewOf({ text: 'a report', run: { ...RUN, carried: false } });
    expect(view.stage).toBe('run-partly-carried');
    expect(view.stageNote).toBe(SUPPORT_COPY.runPartlyCarried);
    expect(view.stageNote.toLowerCase()).toContain('do not travel');
    /* Still sendable: an unreproducible report that says so is worth more than no report. */
    expect(view.actionOffered).toBe(true);
  });

  it('puts the state’s own sentence in the report, so the maintainer reads what the reader read', () => {
    for (const carried of [true, false]) {
      const input = { text: 'a report', run: { ...RUN, carried } };
      expect(reportBodyOf(input)).toContain(supportViewOf(input).stageNote);
    }
    expect(reportBodyOf({ text: 'a report' })).toContain(SUPPORT_COPY.noRun);
  });

  it('gives the three states three different sentences', () => {
    const notes = new Set([SUPPORT_COPY.noRun, SUPPORT_COPY.run, SUPPORT_COPY.runPartlyCarried]);
    expect(notes.size).toBe(3);
  });
});

describe('nothing is greyed without a sentence beside it', () => {
  it('refuses an empty box in words, and opens nothing', () => {
    for (const text of ['', '   \n  ']) {
      const view = supportViewOf({ text, run: RUN });
      expect(view.actionOffered, JSON.stringify(text)).toBe(false);
      expect(view.refusal, JSON.stringify(text)).toBe(SUPPORT_COPY.emptyRefusal);
      expect(view.destination, JSON.stringify(text)).toBeUndefined();
    }
  });

  it('refuses a report longer than the page will take, in words, and opens nothing', () => {
    const view = supportViewOf({ text: 'x'.repeat(SUPPORT_TEXT_LIMIT + 1), run: RUN });
    expect(view.actionOffered).toBe(false);
    expect(view.refusal).toBe(SUPPORT_COPY.tooLongRefusal);
    expect(view.destination).toBeUndefined();
  });

  it('offers the press at exactly the ceiling, so the refusal is a ceiling and not a fence', () => {
    const view = supportViewOf({ text: 'x'.repeat(SUPPORT_TEXT_LIMIT), run: RUN });
    expect(view.actionOffered).toBe(true);
    expect(view.refusal).toBeUndefined();
  });

  it('shows the ceiling coming rather than only announcing it on arrival', () => {
    expect(supportViewOf({ text: 'abc' }).counter).toBe(`3 of ${String(SUPPORT_TEXT_LIMIT)} characters`);
    expect(supportViewOf({ text: '' }).counter).toBe(`0 of ${String(SUPPORT_TEXT_LIMIT)} characters`);
  });

  it('never offers a destination without offering the press, or the other way round', () => {
    for (const { name, view } of viewsByName()) {
      expect(view.actionOffered, name).toBe(view.destination !== undefined);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 5. The address, and the ceiling it is bracketed against
 * -------------------------------------------------------------------------- */

describe('the address the press opens', () => {
  it('is the repository’s own report form and carries no credential', () => {
    const link = reportLinkOf({ text: 'a report', run: RUN, browser: 'A browser' });
    expect(link.startsWith(`${SUPPORT_REPORT_FORM}?`)).toBe(true);
    for (const word of ['token', 'secret', 'key=', 'password', 'authorization']) {
      expect(link.toLowerCase(), word).not.toContain(word);
    }
  });

  it('carries the whole report, decoded', () => {
    const input: SupportInput = { text: 'The lift skipped my floor.', run: RUN, browser: 'A browser' };
    const query = new URLSearchParams(reportLinkOf(input).split('?')[1] ?? '');
    expect(query.get('title')).toBe(SUPPORT_COPY.reportTitle);
    expect(query.get('body')).toBe(reportBodyOf(input));
  });

  /**
   * The character limit is bracketed rather than guessed — a full report with the longest browser
   * string this module will carry still fits inside the address budget.
   */
  it('fits inside the address budget at the ceiling, with the longest browser string', () => {
    const link = reportLinkOf({
      text: 'x'.repeat(SUPPORT_TEXT_LIMIT),
      run: RUN,
      browser: 'b'.repeat(SUPPORT_BROWSER_LIMIT),
    });
    expect(link.length).toBeLessThanOrEqual(SUPPORT_ADDRESS_BUDGET);
  });
});

/* -------------------------------------------------------------------------- *
 * 6. The privacy posture, checked against the code rather than against a promise
 * -------------------------------------------------------------------------- */

describe('the report carries no identity, and the seam says so', () => {
  const source = async (): Promise<string> =>
    readFile(fileURLToPath(new URL('./support.ts', import.meta.url)), 'utf8');

  it('reaches for no store or port that holds a name, a picture or an address', async () => {
    /*
     * Structural rather than by fixture, because the claim is *this surface cannot attach a name*
     * and a fixture only shows that one call did not. Comment text is stripped first: this module's
     * own docstring names the profile module in the sentence explaining that it does not read it.
     */
    const code = (await source()).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
    for (const forbidden of ['profile.js', 'profileStore.js', 'accountPort.js', 'account.js']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('puts no name, picture or address in the report even when the reader typed one', () => {
    /* What a reader types is theirs to publish; what the product attaches is the product's. */
    const body = reportBodyOf({ text: 'a report', run: RUN, browser: 'A browser' });
    const attached = body.slice(body.indexOf(SUPPORT_COPY.bodyRunHeading));
    for (const label of ['name', 'picture', 'avatar', 'email']) {
      expect(attached.toLowerCase(), label).not.toContain(`${label}:`);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 7. The charter's M2 gate, and the measured reason a borrowed sentence stays out
 * -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- *
 * The fault line — GitHub issue #242
 * -------------------------------------------------------------------------- */

describe('how many problems the page hit travels with the report', () => {
  const faultValue = (input: SupportInput): string | undefined =>
    supportViewOf(input).attached.find((fact) => fact.label === SUPPORT_COPY.faultsLabel)?.value;

  /*
   * The distinction the whole line turns on. Off a browser, or anywhere the register was not read,
   * there is nothing to say — and saying *none* there would be a claim made on the strength of
   * having no instrument, which is the shape this repository keeps catching.
   */
  it('is absent where there is no register, and present where there is an empty one', () => {
    expect(faultValue({ text: 'x' })).toBeUndefined();
    expect(faultValue({ text: 'x', faults: { startingUp: 0, playing: 0 } })).toBe(
      SUPPORT_COPY.faultsNone,
    );
  });

  /* The dead page. This is the report the historic boot failure would have produced. */
  it('says which half of the visit failed', () => {
    expect(faultValue({ text: 'x', faults: { startingUp: 3, playing: 0 } })).toBe(
      `3 ${SUPPORT_COPY.faultsStartingUp}`,
    );
    expect(faultValue({ text: 'x', faults: { startingUp: 0, playing: 1 } })).toBe(
      `1 ${SUPPORT_COPY.faultsPlaying}`,
    );
  });

  it('says both halves when both failed, in the order they happened', () => {
    const value = faultValue({ text: 'x', faults: { startingUp: 1, playing: 2 } }) ?? '';
    expect(value.indexOf(SUPPORT_COPY.faultsStartingUp)).toBeGreaterThan(-1);
    expect(value.indexOf(SUPPORT_COPY.faultsStartingUp)).toBeLessThan(
      value.indexOf(SUPPORT_COPY.faultsPlaying),
    );
  });

  /*
   * At the ceiling the register has stopped counting, so an exact figure would be wrong. A report
   * that stated one would be this repository's own published-number defect, on a line just added.
   */
  it('says at least, rather than an exact number it does not have', () => {
    expect(faultValue({ text: 'x', faults: { startingUp: MAX_FAULTS_COUNTED, playing: 0 } })).toBe(
      `${String(MAX_FAULTS_COUNTED)} ${SUPPORT_COPY.faultsAtLeast} ${SUPPORT_COPY.faultsStartingUp}`,
    );
    expect(
      faultValue({ text: 'x', faults: { startingUp: MAX_FAULTS_COUNTED - 1, playing: 0 } }),
    ).not.toContain(SUPPORT_COPY.faultsAtLeast);
  });

  /*
   * The load-bearing one. `SUPPORT_COPY.attachNotice` promises the reader that nothing else about
   * them is attached, and the report becomes a public issue — so this line may carry a count and
   * the words this surface authors, and nothing that came out of an error.
   */
  it('is made of a number and this surface’s own words, and nothing else', () => {
    for (const tally of [
      { startingUp: 0, playing: 0 },
      { startingUp: 4, playing: 0 },
      { startingUp: 0, playing: 7 },
      { startingUp: 1, playing: 1 },
      { startingUp: MAX_FAULTS_COUNTED, playing: MAX_FAULTS_COUNTED },
    ]) {
      const value = faultValue({ text: 'x', faults: tally }) ?? '';
      let residue = value;
      for (const word of [
        SUPPORT_COPY.faultsNone,
        SUPPORT_COPY.faultsStartingUp,
        SUPPORT_COPY.faultsPlaying,
        SUPPORT_COPY.faultsAtLeast,
      ]) {
        residue = residue.split(word).join('');
      }
      /* Whatever is left is digits, commas, the joining word and spaces. Never a borrowed string. */
      expect(residue.trim(), value).toMatch(/^[0-9,\s]*(?:then[0-9,\s]*)?$/u);
    }
  });

  /* Shown and sent from one array — the rule the whole module is arranged around. */
  it('appears in the report body exactly as the reader was shown it', () => {
    const input: SupportInput = { text: 'x', run: RUN, faults: { startingUp: 2, playing: 0 } };
    const shown = faultValue(input) ?? '';
    expect(shown).not.toBe('');
    expect(reportBodyOf(input)).toContain(`${SUPPORT_COPY.faultsLabel}: ${shown}`);
  });
});

describe('nothing a reader meets here names a file, a section or an identifier', () => {
  /**
   * The honesty search's own check, run directly.
   *
   * `checkInternalNotation` takes a context it does not read — the property is a predicate over
   * strings — so nothing is faked here that the check would consult. Running the shipped check
   * rather than re-stating its regexes is the whole point: a second copy of a rule is how a rule
   * drifts, which is the argument `campaign/words.ts` makes about its own narrower copy.
   */
  const notationIn = (strings: readonly string[]): readonly string[] =>
    PROPERTY_CHECKS['internal-notation'](
      undefined as unknown as HonestyContext,
      strings.map(
        (text, index): RenderedText => ({
          surfaceId: SURFACE_ID,
          field: `probe.${String(index)}`,
          text,
          role: 'prose',
          provenance: 'single-run',
        }),
      ),
    ).map((found) => found.text);

  it('passes the check on every string this surface authors, in every state', () => {
    const strings: string[] = Object.values(SUPPORT_COPY);
    for (const { input } of states()) {
      const view = supportViewOf(input);
      strings.push(view.stageNote, view.counter, view.refusal ?? '');
      for (const fact of view.attached) strings.push(fact.label, fact.value);
      strings.push(reportBodyOf(input));
    }
    expect(notationIn(strings.filter((text) => text !== ''))).toEqual([]);
  });

  it('negative control: the check does fire, so passing it means something', () => {
    expect(notationIn(['see everyday/support.ts for the rest']).length).toBe(1);
  });

  /**
   * The measured reason `runIdentityIssues`' sentences are not carried onto this screen.
   *
   * `everyday/host.ts#runCarriedBySelection` brings the **answer** across and leaves the words
   * behind, and this is the evidence for that being a rule rather than a preference: fed through
   * the same check, on this surface's own id, at least one of the predicate's own messages is a
   * violation. A lane that later decides to carry them will find this case red rather than find
   * the reason in a docstring.
   */
  it('measures why the identity predicate’s own sentences may not be carried here', () => {
    /*
     * A dispatcher this browser saved and the shipped library does not know. Measured rather than
     * chosen: the predicate's building arm names a directory and passes the check, and its
     * dispatcher arm names a file and does not — so the state that demonstrates the rule is a
     * particular one, and the arm that would have looked safe is the one a hand-written claim
     * would have picked.
     */
    const messages = runIdentityIssues(
      { ...baseState(), dispatcherId: 'a-dispatcher-only-this-browser-has' },
      RESOURCES,
      'ranked',
    ).map((issue) => issue.message);
    expect(messages.length).toBeGreaterThan(0);
    expect(notationIn(messages).length).toBeGreaterThan(0);
  });
});
