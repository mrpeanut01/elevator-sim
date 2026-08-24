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
