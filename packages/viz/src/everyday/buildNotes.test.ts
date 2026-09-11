/**
 * **The build-information panel** — that it carries all seven registers, and that it is the only
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

import { BUILD_VERSION, buildVersionLineOf } from '../release/version.js';

import { CAMPAIGN_ABSENCES } from '../campaign/career.js';
import {
  BUILD_NOTES_POINTER,
  buildNotesSummaryOf,
  REGISTER_EMPTY_LINE,
  buildNotesViewOf,
  EVERYDAY_SHELL_ABSENCES,
} from './buildNotes.js';
import { DESIGNER_ABSENCES, DESIGNER_COPY } from './designerModel.js';
import { RUSH_ABSENCES, RUSH_SCREEN_COPY } from './rushScreenModel.js';
import { SCENARIO_ABSENCES } from './scenarioModel.js';
import { SETTINGS_ABSENCES } from './settingsView.js';
import { STAGE_ABSENCES } from './stageScreenModel.js';
import { TUTORIAL_ABSENCES } from './tutorialModel.js';

/** Every register the build keeps, in one list, so the two directions below read off one place. */
const REGISTERS: readonly (readonly string[])[] = [
  EVERYDAY_SHELL_ABSENCES,
  STAGE_ABSENCES,
  RUSH_ABSENCES,
  SCENARIO_ABSENCES,
  TUTORIAL_ABSENCES,
  DESIGNER_ABSENCES,
  CAMPAIGN_ABSENCES,
  SETTINGS_ABSENCES,
];

describe('the build-information panel', () => {
  it('carries all eight registers, by identity rather than by copy', () => {
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
    // A floor rather than a pin, and it moved 20 → 15 when GitHub issue #229 built two of the
    // settings rows the register used to refuse, and 15 → 12 when GitHub issue #171 emptied the
    // stage's register and #169 item 1 took the campaign's incidents entry (§ D507): a register
    // whose entries only ever fall is what § D370's queue reading predicts, so the floor follows it
    // down rather than standing over it — and 12 → 9 when GitHub issue #220 built the rush's
    // engine (§ D515) and three of the rush register's four entries left with it — and 9 → 8 when
    // GitHub issue #177 item 1 handed a past day back over a replay week (§ D517), and 8 → 6 when
    // item 5 wrote the designer's escalator rows and folded its document (§ D518) — and 6 → 5 when
    // GitHub issue #375 persisted the career and deleted the session-only entry that said it did
    // not (§ D227, § D525) — and 5 → 4 when GitHub issue #258 built the sound the settings
    // register had been refusing since the screen shipped (§ D344).
    expect(view.entryCount).toBeGreaterThan(4);
  });

  it('says which build it is, in a sentence the corpus sweeps — GitHub issue #246', () => {
    const view = buildNotesViewOf();
    expect(view.build).toBe(buildVersionLineOf(BUILD_VERSION));
    expect(view.build.length).toBeGreaterThan(20);
  });

  it('gives every section a heading and a placing line, so a heading is not the only cue', () => {
    for (const section of buildNotesViewOf().sections) {
      expect(section.heading.length).toBeGreaterThan(4);
      expect(section.note.length).toBeGreaterThan(20);
      /* Rows, or the sentence that says there are none — never a heading over nothing. */
      if (section.entries.length === 0) expect(section.empty).toBe(REGISTER_EMPTY_LINE);
      else expect(section.empty).toBeUndefined();
    }
  });

  it('draws the stage’s register as rows again, now that it has one — GitHub issues #171, #370', () => {
    /*
     * This case pinned *the register is empty, and the panel says so* while GitHub issue #171 had
     * emptied it. #370 put an entry back, so what it pins now is the other arm of the same rule:
     * a register with rows draws the rows and **no** empty line. Both arms are shipped states and
     * the general case above (*a heading is never over nothing*) holds either way; this one exists
     * to keep the stage's own section honest as the queue drains and refills.
     */
    const stage = buildNotesViewOf().sections.find((section) => section.entries === STAGE_ABSENCES);
    expect(stage?.entries).toEqual([...STAGE_ABSENCES]);
    expect(stage?.entries.length).toBe(1);
    expect(stage?.empty).toBeUndefined();
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
  /*
   * **This row's fragment and its owner both moved, and neither moved on its own.** It read
   * `'The daily board'` against #161 — the umbrella issue for everything that needed a server,
   * whose own text says *"split them when the blocker clears"*. The blocker cleared and GitHub
   * issue #221's read half landed, so the register entry narrowed from *there is no board* to
   * *you cannot post to the one there is*, and the row follows it to the issue that will build
   * that: #332, the Everyday sign-in surface posting waits on. A row left pointing at #161 would
   * have kept an owner for an absence that no longer exists.
   *
   * **And it moved a second time, for the same reason one step later.** #332 landed
   * ([§ D489](../../../../DECISIONS.md)), the register entry narrowed again — the sign-in half of
   * its sentence is gone and only *nothing posts* is left — so the owner follows the remaining
   * absence to **#221**, the issue that builds the press. A triage row still naming a closed issue
   * is the same defect as a register naming a closed absence, one level up.
   *
   * **And then it left, with its entry, on the commit that built the press.** #221's post block
   * sits on the report screen and reaches the server through `EverydayHost.postRun`. The entry is
   * gone from `EVERYDAY_SHELL_ABSENCES` and this row went with it in the same edit — which is what
   * the second assertion below is for, and it is the direction that bites after a lane lands.
   */

  /*
   * The stage. The camera was #283's, held there while it was open whether the whole-building
   * cutaway is a deliberate read rather than a gap. § 7.3 of the design handoff lists the camera
   * among what a player can touch, so it is a gap, and #324 is the issue that will build it or
   * record the decision not to.
   */
  /*
   * `STAGE_ABSENCES`' two rows — *no campaign dock* (#181) and *no answer to a live incident*
   * (#171) — left this table on the commit that built the dock and the incident it answers
   * (GitHub issue #171, § D507). The register was empty and is not any more.
   *
   * **A row arrived, which is this table working in the direction it is usually not tested in.**
   * GitHub issue **#370** put the two bought intervention kinds on the run record and priced them
   * off the schedule; what a player still cannot do is buy one *while the day plays*, because
   * `scenario/budget.ts`'s ladder is validated at load and nothing reads it at play time. The
   * absence is the **rung**, not the control, so the owner is the issue that makes a budget reach a
   * playing day: **#367**, the survivor count per budget step, which is the first thing that has to
   * know what rung a scenario is on.
   */
  { register: 'STAGE_ABSENCES', fragment: 'no works to buy while the day plays', issue: 367 },
  /*
   * **Two rows left together here, and that they were a pair is the whole reason to say so.**
   * `STAGE_ABSENCES`' *no rival lane* and `EVERYDAY_SHELL_ABSENCES`' *Racing a second dispatcher*
   * were one missing mechanism said from two sides — this table's own comment called them *"one
   * mechanism, one issue, two registers that both meet it"* — and GitHub issue **#226**
   * ([§ D482](../../../../DECISIONS.md)) built it. Both entries and both rows went on that commit.
   *
   * Retiring one and leaving the other would have been the product saying two things about one
   * mechanism, which is the incoherence `honesty/properties.ts` cannot see: each of those sentences
   * was internally honest, and only the pair was wrong.
   */

  /*
   * The rush. Three of its four entries were one issue, because they were one missing engine, and
   * GitHub issue #220 built it (§ D515): the climbing stream, the held-time stage and the result
   * screen left the register on that commit. The fourth, *the standings*, was #177's and then
   * #418's, and it left with its row when #418 replaced the handoff's fixtures with the house's
   * measured runs (§ D547). The register is empty, so the panel draws its `empty` line.
   */

  /*
   * The designer. All three were #177 § 5's, and there used to be five: the other two said the
   * capability lives on the Engineer surface, which is an ownership boundary rather than an
   * absence. #283 asked whether they belonged in this register and the answer was no — they are
   * hints beside the controls they qualify now, and this table was shorter by two rather than
   * pointing at two more issues.
   *
   * **The last of the three left on the commit that built it** — GitHub issue **#420**, split from
   * #177 as an issue of its own. Its row read
   * `{ register: 'DESIGNER_ABSENCES', fragment: 'a machine class per shaft', issue: 177 }`, and the
   * entry it owned refused the control on the grounds that five pickers would write one field.
   * `BuildingSpec.machineByCar` is that field per shaft; the picker writes it, and the run changes
   * on the legs (`authoring/authoring.test.ts`). Register entry and triage row went in one edit,
   * which is exactly what this table's second assertion refuses to let happen separately — and the
   * register is now empty, so the panel draws its `empty` line.
   */

  /*
   * The campaign. The incidents row — *"Incidents here are the two the building implies"*, issue
   * #169 — left this table on the commit that built the breakdown draw and the contract calendar
   * (GitHub issues #171 and #169 item 1, § D507), and this test's own rule is what took it out: an
   * entry deleted while the map still names it fails here.
   */
  { register: 'CAMPAIGN_ABSENCES', fragment: 'nothing files on', issue: 223 },

  /* Settings. Two of the six are #229's remainder after its premise was refuted (§ D368). */
  /*
   * `Sound` left this table on the commit that built it — GitHub issue #258, § D344. The row it
   * owned is drawn on the settings screen now and the sound behind it is `everyday/audio.ts`'s, so
   * a triage row still pointing at a deleted entry is what this table's second assertion exists to
   * refuse.
   */
  /*
   * `Default speed` and `Clear saved progress` left this table on the commit that built both —
   * GitHub issue #229. The rows they owned are drawn on the settings screen now, and a triage row
   * still pointing at a deleted entry is what this table's second assertion exists to refuse.
   */
  /*
   * `Units` left this table on the commit that built its consumer — GitHub issue #170, § D448.
   * The row it owned is drawn on the settings screen now, so a triage row still pointing at the
   * absence would be the stale half this file's second case exists to catch. #170's other half,
   * `Sound`, was never this row's: it is #258's above, and the two were separated by § D344's
   * ruling and § D447's correction rather than by this deletion.
   */
  { register: 'SETTINGS_ABSENCES', fragment: 'Post runs to the board', issue: 161 },
  /*
   * The tutorial — § D529, which built the two screens and deliberately did **not** settle which
   * building the first session uses: *"What this does not decide. Which building the tutorial
   * uses, which is #270's."* The lane picked a shipped fix case and argued the choice in
   * `tutorialModel.ts`; the row is here because an argued choice is still an open question until
   * the issue that owns it closes.
   */
  { register: 'TUTORIAL_ABSENCES', fragment: 'Which building the first session should use', issue: 270 },
  /*
   * **`Sign out` left this table on the commit that built the control** — GitHub issue #332,
   * [§ D489](../../../../DECISIONS.md). Its entry refused a button on the grounds that *nothing on
   * this surface is signed in*; § 15.1's YOU section holds the session now and *Sign out* is one of
   * its presses, so both the entry and this row go together. It is `Units`' case exactly (§ D448),
   * and the assertion below is the one that makes the pairing checkable rather than remembered.
   *
   * **`Post runs to the board` above deliberately did not go with it.** It refuses a *switch* over
   * a capability that still does not exist; sign-in does not make it false, posting does, and
   * § D460 corrected that confusion once already.
   */
]);

/** The registers by the name the triage table uses, so a failure names the array a reader can open. */
const NAMED_REGISTERS: readonly (readonly [string, readonly string[]])[] = Object.freeze([
  ['EVERYDAY_SHELL_ABSENCES', EVERYDAY_SHELL_ABSENCES],
  ['STAGE_ABSENCES', STAGE_ABSENCES],
  ['RUSH_ABSENCES', RUSH_ABSENCES],
  ['DESIGNER_ABSENCES', DESIGNER_ABSENCES],
  ['CAMPAIGN_ABSENCES', CAMPAIGN_ABSENCES],
  ['SETTINGS_ABSENCES', SETTINGS_ABSENCES],
  /*
   * § D529's tutorial (GitHub issue #380). Named here on the commit that adds the register, which
   * is the direction this file's first case checks: an absence drawn to a player and owned by no
   * issue fails on the commit that adds it, not on the one somebody notices it.
   */
  ['TUTORIAL_ABSENCES', TUTORIAL_ABSENCES],
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
