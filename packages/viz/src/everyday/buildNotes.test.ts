/**
 * **The build-information panel** — that it carries all six registers, and that it is the only
 * place any of them is drawn.
 *
 * GitHub issue #207 moved every register of honest absences off the six player screens that drew
 * them onto one panel reached from Settings. Two halves have to hold together, and each without
 * the other is a defect:
 *
 * 1. **The panel really carries them.** Asserting only that a screen stopped drawing its register
 *    would pass just as well if the register had been deleted, which is the outcome the issue is
 *    least interested in. So every array is asserted **by identity** into a section of the view: a
 *    copy would drift, and a re-worded duplicate is the two-wordings defect these registers exist
 *    to prevent.
 *
 * 2. **The screens really stopped.** The registers were on player screens because a dead-code
 *    audit flagged the first of them as an array no renderer touched, so the fix has a failure mode
 *    of its own — drawing them twice, satisfying the audit and the panel while leaving the front
 *    door exactly as it was. Here that is checked on the two copy tables that held a heading; the
 *    two views that held an `absences` field are checked in their own files, where the rest of each
 *    view is, and the pages in `standaloneScreens.browser.test.ts`.
 *
 * **What is deliberately not asserted here: that no entry carries internal notation.** That is
 * `honesty/properties.ts#checkInternalNotation`'s, run over every rendered string of every case in
 * both tiers, and a second copy of the rule in this file is how a rule drifts — one of the two
 * gets loosened, and it is never the one anybody is watching.
 */

import { describe, expect, it } from 'vitest';

import { CAMPAIGN_ABSENCES } from '../campaign/career.js';
import {
  BUILD_NOTES_POINTER,
  buildNotesSummaryOf,
  buildNotesViewOf,
  EVERYDAY_SHELL_ABSENCES,
} from './buildNotes.js';
import { DESIGNER_ABSENCES, DESIGNER_COPY } from './designerModel.js';
import { RUSH_ABSENCES, RUSH_SCREEN_COPY } from './rushScreenModel.js';
import { SETTINGS_ABSENCES } from './settingsView.js';
import { STAGE_ABSENCES } from './stageScreenModel.js';

/** Every register the build keeps, in one list, so the two directions below read off one place. */
const REGISTERS: readonly (readonly string[])[] = [
  EVERYDAY_SHELL_ABSENCES,
  STAGE_ABSENCES,
  RUSH_ABSENCES,
  DESIGNER_ABSENCES,
  CAMPAIGN_ABSENCES,
  SETTINGS_ABSENCES,
];

describe('the build-information panel', () => {
  it('carries all six registers, by identity rather than by copy', () => {
    const view = buildNotesViewOf();
    const drawn = view.sections.map((section) => section.entries);
    for (const register of REGISTERS) {
      expect(drawn, `a register reaches the panel: ${register[0] ?? ''}`).toContain(register);
    }
    expect(view.sections).toHaveLength(REGISTERS.length);
  });

  it('counts what it is carrying rather than being told', () => {
    const view = buildNotesViewOf();
    const total = REGISTERS.reduce((sum, register) => sum + register.length, 0);
    expect(view.entryCount).toBe(total);
    expect(buildNotesSummaryOf(view)).toContain(String(total));
    /*
     * The count is the thing the summary row exists to say — a reader deciding whether to open a
     * disclosure is deciding against a number. Derived, so it cannot be the wrong number: a total
     * typed beside a list is a total that is wrong one merge later.
     */
    expect(view.entryCount).toBeGreaterThan(20);
  });

  it('gives every section a heading and a placing line, so a heading is not the only cue', () => {
    for (const section of buildNotesViewOf().sections) {
      expect(section.heading.length).toBeGreaterThan(4);
      expect(section.note.length).toBeGreaterThan(20);
      expect(section.entries.length).toBeGreaterThan(0);
    }
  });

  /**
   * The other direction: no screen still carries a heading for one of these.
   *
   * The rush setup and the drawing board drew their registers from a module constant and headed
   * each with an eyebrow in its own copy table. Both eyebrows are gone, because the panel writes
   * its own section headings and a heading no renderer touches is the shape the dead-code audit
   * exists to find — which is the same audit that put these registers on player screens in the
   * first place, pointed the other way.
   *
   * The two views that carried an `absences` **field** are asserted where they live:
   * `settingsView.test.ts` and `campaignModel.test.ts` each check their own view no longer has one.
   * The pages are pinned in `standaloneScreens.browser.test.ts`, which asserts the block is gone
   * from the drawing board **and** that the panel really carries the board's rows — a pairing,
   * because asserting only the first half would pass just as well if the register had been deleted.
   */
  it('leaves no screen holding a heading for a register it no longer draws', () => {
    expect(RUSH_SCREEN_COPY).not.toHaveProperty('absencesEyebrow');
    expect(DESIGNER_COPY).not.toHaveProperty('absencesEyebrow');
  });

  it('leaves the front door one sentence, and it points at the panel', () => {
    expect(BUILD_NOTES_POINTER).toMatch(/Settings/);
    /*
     * The pointer is not a register and must not become one: the whole complaint was that the
     * front door sold the absences before it sold the game. One sentence.
     */
    expect(BUILD_NOTES_POINTER.split('.').filter((part) => part.trim() !== '')).toHaveLength(2);
    for (const register of REGISTERS) {
      for (const entry of register) expect(BUILD_NOTES_POINTER).not.toContain(entry);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The register is a queue — GitHub issue #279, § D370
 * -------------------------------------------------------------------------- */

/** One triaged absence: which register it is in, how to find it, and the issue that owns it. */
interface TriagedAbsence {
  readonly register: string;
  /**
   * A distinctive fragment of the entry, not the entry itself.
   *
   * **Rewording an entry past its fragment is meant to fail this file**, and that is the tradeoff
   * taken deliberately rather than a fragility to work around: an absence whose words changed is an
   * absence whose scope may have changed, and re-checking which issue owns it is exactly the moment
   * to do it. Matching whole entries would fail on a comma; matching nothing would let an entry drift
   * away from its issue in silence, which is the state this register was already in.
   */
  readonly fragment: string;
  readonly issue: number;
}

/**
 * **Every absence a player can read, and the issue that owns it** — [§ D370](../../../../DECISIONS.md).
 *
 * ## Why the mapping is here and not in the register
 *
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion bars a code identifier from a player surface,
 * and `honesty/properties.ts`'s `internal-notation` measures it on every case of every run. An issue
 * number appended to an entry is that, and it would take a gate that currently reads zero off zero.
 * So the link lives beside the registers rather than inside their words, on `screens.test.ts`'s own
 * pattern for `UNBUILT_REASONS`.
 *
 * ## What was measured before this existed
 *
 * **27** entries across six registers, **0** naming an issue. (The audit that produced § D370
 * published *26* — a count taken with a `sed` block extraction that missed `STAGE_ABSENCES`'s ghost
 * entry. This file counts the arrays at runtime, which is why it disagreed, and why the figure it
 * disagreed with was corrected rather than the file bent to match it.) The two neighbouring registers that are
 * empty — `screens.ts#UNBUILT_REASONS` and `honesty.test.ts#OUTSTANDING` — are empty because each has
 * a mechanism that made somebody empty them. § 20.12 offers *build the seam* or *do not draw the
 * row*, and only the second is free: it satisfies the rule permanently, at no cost, and nothing ever
 * returns to it.
 *
 * ## What this file can and cannot check
 *
 * It checks that the mapping is **total** and **has no stale rows** — a new absence fails on the
 * commit that adds it, and an entry deleted while the map still names it fails too, which is
 * [§ D227](../../../../DECISIONS.md)'s direction that bites a lane after it lands.
 *
 * It does **not** check that the issue is still *open*. That needs the network and this tier has
 * none; it is stated as a bound rather than left for a reader to assume. An issue closed while its
 * entry stands is caught by the human closing it, or not at all.
 */
const ABSENCE_TRIAGE: readonly TriagedAbsence[] = Object.freeze([
  /* The shell — the front door, the week strip, the boards, the report's levers. */
  { register: 'EVERYDAY_SHELL_ABSENCES', fragment: 'Replaying a past day', issue: 177 },
  { register: 'EVERYDAY_SHELL_ABSENCES', fragment: 'Racing a second dispatcher', issue: 226 },
  { register: 'EVERYDAY_SHELL_ABSENCES', fragment: 'The daily board', issue: 161 },
  { register: 'EVERYDAY_SHELL_ABSENCES', fragment: 'third piece of advice does not open the tuner', issue: 177 },
  { register: 'EVERYDAY_SHELL_ABSENCES', fragment: 'Endless rush', issue: 220 },

  /* The stage. The camera is #283's — it may be a deliberate position rather than a gap. */
  { register: 'STAGE_ABSENCES', fragment: 'no campaign dock', issue: 181 },
  { register: 'STAGE_ABSENCES', fragment: 'no camera', issue: 283 },
  { register: 'STAGE_ABSENCES', fragment: 'no decisions during a run', issue: 171 },
  /* The same missing second recording the shell's *Racing a second dispatcher* entry is about,
     said from the stage's side. One mechanism, one issue, two registers that both meet it. */
  { register: 'STAGE_ABSENCES', fragment: 'no rival lane', issue: 226 },

  /* The rush. Three of the four are one issue, because they are one missing engine. */
  { register: 'RUSH_ABSENCES', fragment: 'the climbing stream', issue: 220 },
  { register: 'RUSH_ABSENCES', fragment: 'a rush stage of its own', issue: 220 },
  { register: 'RUSH_ABSENCES', fragment: 'a result screen of its own', issue: 220 },
  { register: 'RUSH_ABSENCES', fragment: 'the standings', issue: 177 },

  /*
   * The designer. #177 § 5 names three of these five by name; the other two say the capability
   * lives on the Engineer surface, which is an ownership boundary rather than an absence — #283
   * asks whether they belong in this register at all.
   */
  { register: 'DESIGNER_ABSENCES', fragment: 'a machine class per shaft', issue: 177 },
  { register: 'DESIGNER_ABSENCES', fragment: 'the access panel and its credential dots', issue: 283 },
  { register: 'DESIGNER_ABSENCES', fragment: 'escalator rows', issue: 177 },
  { register: 'DESIGNER_ABSENCES', fragment: 'the sky-lobby starter', issue: 283 },
  { register: 'DESIGNER_ABSENCES', fragment: 'the folded-up specification', issue: 177 },

  /* The campaign. */
  { register: 'CAMPAIGN_ABSENCES', fragment: 'Incidents here are the two the building implies', issue: 169 },
  { register: 'CAMPAIGN_ABSENCES', fragment: 'nothing files on', issue: 223 },
  { register: 'CAMPAIGN_ABSENCES', fragment: 'The career is this session', issue: 224 },

  /* Settings. Two of the six are #229's remainder after its premise was refuted (§ D368). */
  { register: 'SETTINGS_ABSENCES', fragment: 'Sound —', issue: 258 },
  { register: 'SETTINGS_ABSENCES', fragment: 'Default speed', issue: 229 },
  { register: 'SETTINGS_ABSENCES', fragment: 'Units —', issue: 170 },
  { register: 'SETTINGS_ABSENCES', fragment: 'Post runs to the board', issue: 161 },
  { register: 'SETTINGS_ABSENCES', fragment: 'Sign out', issue: 221 },
  { register: 'SETTINGS_ABSENCES', fragment: 'Clear saved progress', issue: 229 },
]);

/** The registers by the name the triage table uses, so a failure names the array a reader can open. */
const NAMED_REGISTERS: readonly (readonly [string, readonly string[]])[] = Object.freeze([
  ['EVERYDAY_SHELL_ABSENCES', EVERYDAY_SHELL_ABSENCES],
  ['STAGE_ABSENCES', STAGE_ABSENCES],
  ['RUSH_ABSENCES', RUSH_ABSENCES],
  ['DESIGNER_ABSENCES', DESIGNER_ABSENCES],
  ['CAMPAIGN_ABSENCES', CAMPAIGN_ABSENCES],
  ['SETTINGS_ABSENCES', SETTINGS_ABSENCES],
]);

describe('every absence is a queue item — § D370', () => {
  it('triages every entry in every register, so a new absence fails on the commit that adds it', () => {
    const untriaged: string[] = [];
    for (const [name, register] of NAMED_REGISTERS) {
      for (const entry of register) {
        const owners = ABSENCE_TRIAGE.filter(
          (row) => row.register === name && entry.includes(row.fragment),
        );
        if (owners.length === 0) untriaged.push(`${name}: ${entry.slice(0, 70)}…`);
        else
          expect(
            owners.length,
            `${name}: "${entry.slice(0, 50)}…" matches ${String(owners.length)} triage rows — ` +
              'a fragment is ambiguous, so an entry has two owners',
          ).toBe(1);
      }
    }
    expect(
      untriaged,
      'these absences are drawn to a player and owned by no issue. § D370: the register is a ' +
        'queue. Add a row to ABSENCE_TRIAGE naming the issue that will build it — or delete the ' +
        'entry, which is a legitimate outcome when it stopped being true.',
    ).toEqual([]);
  });

  it('keeps no stale row — an entry deleted while the map still names it fails here', () => {
    const stale = ABSENCE_TRIAGE.filter((row) => {
      const register = NAMED_REGISTERS.find(([name]) => name === row.register)?.[1];
      return register === undefined || !register.some((entry) => entry.includes(row.fragment));
    }).map((row) => `${row.register}: "${row.fragment}" (#${String(row.issue)})`);

    expect(
      stale,
      'these triage rows name an absence no register carries. § D227 in the direction that bites ' +
        'after a lane lands: an entry that was built and deleted must take its row with it, or the ' +
        'map becomes decoration.',
    ).toEqual([]);
  });

  it('counts the same both ways, so neither list can quietly outgrow the other', () => {
    const entries = NAMED_REGISTERS.reduce((total, [, register]) => total + register.length, 0);
    expect(ABSENCE_TRIAGE).toHaveLength(entries);
    expect(entries, 'the registers have emptied — check this file still has something to check')
      .toBeGreaterThan(0);
  });

  it('keeps the issue numbers out of the player’s words — the M2 gate reads zero', () => {
    for (const [name, register] of NAMED_REGISTERS) {
      for (const entry of register) {
        expect(
          /#\d+/u.test(entry),
          `${name} names an issue number in copy a player reads: "${entry.slice(0, 60)}…". ` +
            'That is internal notation on a player surface, and the mapping lives in this file ' +
            'precisely so it never has to be.',
        ).toBe(false);
      }
    }
  });
});
