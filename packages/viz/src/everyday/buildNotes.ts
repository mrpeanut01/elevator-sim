/**
 * **The build-information panel** — every register of what this build does not do yet, in one
 * place, written for the reader who went looking for it.
 *
 * ## Why the registers moved here
 *
 * Each screen used to draw its own register under its own content, and the front door drew the
 * longest one under the four mode tiles. That put the build's absences in front of a player who
 * had not asked for them, in a vocabulary written for the team: section numbers of a design
 * document, source filenames, the names of constants. GitHub issue #207 is that complaint, and
 * this module is its answer — one panel, reached from Settings, carrying all six registers.
 *
 * **The registers themselves did not move, and that is deliberate.** Five of the six still live
 * beside the code they are about, because a register that drifts away from its subject is a
 * register that goes stale without anybody noticing — which is the defect the whole apparatus
 * exists to prevent. What moved is where they are *drawn*.
 *
 * ## Why this module imports all six rather than re-stating them
 *
 * The standing requirement in `CLAUDE.md` is *name the non-test caller*, and it is the reason
 * these registers were on player screens at all: a dead-code audit
 * (`packages/viz/src/deadCode.test.ts`) flagged the first of them as an array no renderer touched,
 * and drawing it was the fix. Moving the drawing off the screens without giving the arrays a new
 * reader would put every one of them straight back into that audit.
 *
 * So {@link buildNotesViewOf} is the non-test caller of all six, and it is called by
 * `settingsScreen.ts`. A barrel re-export would not have counted and neither would a `{@link}`.
 *
 * ## The one register that lives here
 *
 * {@link EVERYDAY_SHELL_ABSENCES} is the shell's, and it is declared in this file rather than in
 * `shell.ts` for a mechanical reason worth stating: `shell.ts` imports `screens.ts`, `screens.ts`
 * imports `settingsScreen.ts`, and `settingsScreen.ts` imports this module. Had the array stayed
 * where it was, this module would import `shell.ts` and close that ring — which is the module-init
 * `undefined` this directory has already paid for once.
 *
 * ## What the words may not contain
 *
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion applies to every entry below and to every
 * heading in this file: nothing a player reads refers to a section number, a source filename or a
 * code identifier. `honesty/properties.ts` measures it mechanically on every case of every run, so
 * this is a rule with an instrument rather than a convention. It applies here **especially**: this
 * panel is the one surface where all six registers are read at once, so a single lapse is on
 * screen beside twenty-six sentences that got it right.
 */

import { CAMPAIGN_ABSENCES } from '../campaign/career.js';
import { DESIGNER_ABSENCES } from './designerModel.js';
import { RUSH_ABSENCES } from './rushScreenModel.js';
import { SETTINGS_ABSENCES } from './settingsView.js';
import { STAGE_ABSENCES } from './stageScreenModel.js';

/**
 * What the shell does not yet do, in one place.
 *
 * The register of the front door and of the shell around it — screens it does not route to, a
 * lever that does not open what it names. It is about the *shell*, which is why it is separate
 * from the five registers each screen owns; a reader who wants to know what the whole build is
 * missing reads all six here, and nowhere else.
 *
 * **Rewritten for a player, not thinned.** Every one of these five sentences used to open with a
 * section number of the design document and two of them named a source file. What each row claims
 * is unchanged — the same absence, the same reason, the same consequence — and the vocabulary is
 * now the one the screen speaks in.
 */
export const EVERYDAY_SHELL_ABSENCES: readonly string[] = Object.freeze([
  /*
   * **Four rows left this register on the merge that brought the daily loop in beside the stage,
   * and every one of them left because its screen landed rather than because anybody tidied.**
   * Written down because a register whose deletions are invisible is a register a reader cannot
   * audit, and because two of the four were deleted by the *other* lane's work:
   *
   * - *"the front door and the brief — Today's tower opens the day directly"* — both are
   *   registered screens now and the tile routes through them (`modes.ts` says so in the tile's
   *   own comment);
   * - *"the Everyday stage — the stage shown is the Engineer surface with Casual copy"* —
   *   `everyday/stageScreen.ts` is that stage, mounted in the screen region like any other;
   * - *"the action bar is not drawn over the handed-off stage"*, with its consequence that
   *   *Close the day* had no home — the hand-off retired with the stage becoming a screen, so the
   *   bar is drawn under it and `actionBar.ts` gives that row the primary the note promises
   *   (`stageScreenModel.test.ts` pins the label);
   * - *"boards and ladder — both need a server"* — true of the daily board and never true of the
   *   ladder, which is measured on this device. It is replaced below by the half that is still an
   *   absence.
   *
   * A register that kept naming any of them would be [§ D227](../../../../DECISIONS.md)'s stale
   * refusal — the defect this register exists to prevent — reproduced by the register itself.
   */
  'Replaying a past day — the front door’s week strip says what each day did, and no control opens one again to watch it. A week here only moves forward.',
  'Racing a second dispatcher — no run in this build sends two dispatchers at the same crowd, so the brief’s *Race against* card says what that would show you instead of offering it.',
  /*
   * **A fifth row left on the very next merge, and it is the one this register existed to make
   * findable.** It read: *"the Engineer surface still boots and runs behind this shell, and nothing
   * here opens it — the rail's Switch to Engineer row is that door and it is not built"*. That row
   * is built (`shell.ts#enterEngineer`), so the entry goes on the commit that closes it — the same
   * direction `screens.ts`'s refusal table is keyed both ways to enforce one level down. A register
   * is worth the number of people who read it, and an entry naming a closed absence is how one
   * stops being read.
   */
  'The daily board — a ranking of other people’s runs needs a server to post them to and to check them, and this build has none. That tab opens on its own unavailable state, the ladder beside it is live because your rating is measured on this device, and Your week says what a board would be ranked on rather than drawing an empty one.',
  /*
   * **A sixth row left on the merge that registered the rush setup, the drawing board and the
   * tuner — and it left because that merge closed it, which is the one case this register has not
   * recorded before.**
   *
   * It read: *"Tune the tower is registered and routable, and no shipped control opens it: the
   * guide forbids a rail row (*a thing you do to a day, not a place you live*) and names its two
   * doors as the brief's *Take it to the sandbox* and the report's third lever, neither of which is
   * built"*. That was true on the lane that wrote it and false the moment it met a tree carrying
   * the brief: the first of those two doors exists here, and `briefView.ts#lockedForScore` now
   * carries the route through it. The rail-row prohibition is unchanged and still asserted
   * (`rail.test.ts`), so the screen is reached the way the guide says and by no other way.
   *
   * **What is left of it is the second door, and it is a row below rather than a deletion.** The
   * report draws four lever cards and every one of them routes to the Engineer panel that carries
   * out a fabric change; none is the sandbox lever. One door out of two is not the absence this row
   * named, so the row is rewritten to the half that is still true rather than kept for the half
   * that is not.
   *
   * **And the rush row below was rewritten on the same merge, in the other direction.** It read
   * *"Endless rush — no held time, no setup screen"*; the setup screen landed, so half of that
   * sentence became false while the other half stayed exactly as true as it was. A row that has
   * become half wrong is the most dangerous shape in a register — it reads as verified and is not —
   * so it is narrowed to what remains missing, and where the refusal moved to (the screen's own
   * primary, `rushScreenModel.ts#RUSH_PRIMARY_REFUSAL`) is named rather than left for a reader to
   * discover.
   */
  'The report’s third piece of advice does not open the tuner — two of the report’s four advice cards hand you to the simulator panel that carries the change out, and the other two are a dispatcher recommendation one day is not enough evidence to make, which each of those cards says on its own face. The tuner has two doors in the design and only the brief’s *Take it to the sandbox* is built here.',
  'Endless rush — the setup screen draws, and the climbing stream of arrivals behind it does not exist, so its start button refuses. The rush’s own stage and its own result screen are unbuilt.',
]);

/**
 * The one sentence the front door keeps, pointing at the panel.
 *
 * **Declared here rather than inline in the shell, and the reason is coverage.** `shell.ts`'s menu
 * is a DOM mount, excluded from the honesty search on the shared ground that it needs a document —
 * so a sentence authored inside `drawMenu` is swept statically and never *driven*. This one is a
 * constant the panel's own adapter renders, which puts it in the corpus on the same footing as the
 * words it points at. A pointer to a register of honest absences is not a string to leave
 * unchecked.
 */
export const BUILD_NOTES_POINTER =
  'This game is being built in the open. Settings has the list of what it does not do yet.';

/** One register, as the panel draws it: a heading a player can place, and its entries. */
export interface BuildNotesSection {
  /** Which part of the game this register is about. Plain words; never a section number. */
  readonly heading: string;
  /** One line of context, so a heading is not the only thing placing the rows. */
  readonly note: string;
  readonly entries: readonly string[];
}

/** The whole panel. Total — every register the build keeps, in the order a reader meets them. */
export interface BuildNotesView {
  readonly heading: string;
  readonly lede: string;
  readonly sections: readonly BuildNotesSection[];
  /** How many entries the panel is carrying, so the summary row can say it without counting twice. */
  readonly entryCount: number;
}

/**
 * The panel, assembled from the six registers.
 *
 * **A function rather than a constant, and the reason is the one above about the import ring.**
 * Five of these arrays are imported from modules with their own import graphs; building the view
 * lazily means nothing here is evaluated at module-init time, so a future import that does close a
 * ring degrades to a late read rather than to an `undefined` frozen into a constant.
 *
 * Nothing is filtered and nothing is re-ordered. A panel that decided which absences were worth
 * showing would be a register with an editor in front of it, which is the one thing a register may
 * not have.
 */
export function buildNotesViewOf(): BuildNotesView {
  const sections: readonly BuildNotesSection[] = [
    {
      heading: 'Across the whole build',
      note: 'Things missing from the game as a whole rather than from one screen.',
      entries: EVERYDAY_SHELL_ABSENCES,
    },
    {
      heading: 'Watching a run',
      note: 'The stage a day plays on.',
      entries: STAGE_ABSENCES,
    },
    {
      heading: 'Endless rush',
      note: 'The setup screen draws; what it would start does not exist yet.',
      entries: RUSH_ABSENCES,
    },
    {
      heading: 'The drawing board',
      note: 'Designing a building. Nothing there is scored.',
      entries: DESIGNER_ABSENCES,
    },
    {
      heading: 'Running a tower over a season',
      note: 'The campaign — contracts, months and the things that happen to you.',
      entries: CAMPAIGN_ABSENCES,
    },
    {
      heading: 'Settings',
      note: 'Rows the settings screen does not draw, and why each one is not there.',
      entries: SETTINGS_ABSENCES,
    },
  ];
  return {
    heading: 'What this build does not do yet',
    lede:
      'This game is being built in the open, and this is the list of what is missing. Every line ' +
      'here is written in the code rather than in a document, so a thing that gets built leaves ' +
      'this list on the day it works rather than whenever somebody remembers.',
    sections,
    entryCount: sections.reduce((total, section) => total + section.entries.length, 0),
  };
}

/**
 * The row on Settings that opens the panel, with its count.
 *
 * The count is derived rather than written, for the reason the whole panel is derived: a number
 * typed beside a list is a number that is wrong one merge later.
 */
export function buildNotesSummaryOf(view: BuildNotesView): string {
  return `${view.heading} — ${String(view.entryCount)} notes`;
}
