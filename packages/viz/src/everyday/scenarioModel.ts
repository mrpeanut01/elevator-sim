/**
 * **The Scenario hub, as words — § D525's first tile.**
 *
 * `docs/38` § 2.1 makes Scenario *"one shape, four sources"*: the ten campaign stages, the
 * eighteen fix cases, the six Engineer challenges `E1`–`E6`, and today's scenario, all authored to
 * one schema — `data/campaign.json`'s stage record **plus a budget**.
 *
 * **Three of those four sources are on this list.** This docstring read *"That schema is GitHub
 * issue #365 and it is not built"*, and that stopped being true when #365 landed (PR #465):
 * `campaign/types.ts#CampaignStage` carries `budget: ScenarioBudget` as a **required** field,
 * refused rather than defaulted when absent, and `data/campaign.json` authors it on all ten
 * stages. The record plus a budget *is* the scenario schema, and has been since 2026-09-10. What
 * was missing was not a schema but a reader: nothing a player could open had ever joined the
 * stages to `data/scenario-survivors.json`'s measured counts, so the largest block of authored,
 * priced, measured content in the repository was invisible from the front door. `scenario/ladder.ts`
 * is that join and {@link ScenarioHubView.path} is where it is drawn — [§ D649](../../../../DECISIONS.md),
 * GitHub issue #364's missing half.
 *
 * What the hub still buys, and it is the reason it exists rather than the tiles simply going away:
 * § D525 retires the *Today's tower* and *Fix a building* tiles, and `door` and `fixit` are
 * registered screens. A retired tile with nowhere else to reach its screen makes that screen
 * unreachable — which `screens.test.ts` fails the build over, correctly. The hub is the somewhere
 * else.
 *
 * ## A listed scenario is not always an offered one, and that is the load-bearing distinction
 *
 * `docs/38` § 2.1: *"**Zero is not a scenario** unless it declares itself a diagnosis."* Measured,
 * seven of the ten stages have no way through at the budget they open on and none of them declares
 * one. So they are **listed with their measured count and not offered to play** — a row with a
 * reason, never a dead control (GAMEPLAY § 20.12). Hiding them was the other option and is worse:
 * the ten stages *are* the ordered path, and a player who cannot see positions 2 and 4 cannot see
 * that there is one.
 *
 * The decision is `scenario/ladder.ts`'s and is **derived from the measurement**, so a rebalance
 * that opens a held stage opens it here with no edit in this file. Nothing in this module knows
 * which stages those are, and that is deliberate: a list of ids here would be a second authority
 * on a number `data/scenario-survivors.json` owns.
 *
 * ## The two absences are drawn, not hidden
 *
 * A hub that silently listed what it has where the design names four sources would be `docs/39`'s
 * own failure mode — a surface that looks finished because what is missing from it is invisible.
 * {@link SCENARIO_ABSENCES} is the register, and `buildNotes.ts` carries it to the Settings panel
 * like every other.
 *
 * Pure. No DOM, no host, no `data/` read — `scenarioScreen.ts` mounts what this returns and reads
 * the path off `scenarioLadderPort.ts`, and the honesty corpus sweeps it without a document.
 */
import { ladderOfferCounts, SCENARIO_LADDER_COPY, type ScenarioLadderRung } from '../scenario/ladder.js';
import { SITTING_SHAPES } from './sittingShape.js';
import type { EverydayScreen } from './types.js';

/** One thing a player can start from the hub. */
export interface ScenarioEntry {
  /** Stable id — the corpus and the tests address rows by this, never by their position. */
  readonly id: string;
  readonly title: string;
  /** What the player is taking on, in their words rather than the schema's. */
  readonly blurb: string;
  /** § 5's session shape, the same currency the mode tiles are picked by. */
  readonly shape: string;
  /** Where pressing it goes. Every one of these is a registered screen. */
  readonly screen: EverydayScreen;
}

/**
 * One row of the ordered path, drawn.
 *
 * It is a **different shape** from {@link ScenarioEntry} rather than a variant of it, and the
 * difference is the point: an entry is a press and names a screen, and a path row may be a press
 * or a refusal. Folding the two would have given the hub one list in which some rows' `screen`
 * meant nothing, which is how a held scenario gets drawn as a dead button by the next person to
 * touch the mount.
 */
export interface ScenarioPathRow {
  readonly id: string;
  /** 1-based position on the path. Drawn, because the ordering is the thing the list is for. */
  readonly position: number;
  readonly title: string;
  /** § 5.4's one concept, in the stage's own words — `docs/38` § 2.1's *"each with its `teaches` line"*. */
  readonly teaches: string;
  /** The stage's own opening sentence. Authored in `data/campaign.json`, never derived. */
  readonly openingLine: string;
  /** How long a run is and how many stand behind the verdict. */
  readonly shape: string;
  /** What the budget opens on and what chimes can buy, with the rung the count is taken at. */
  readonly budgetLine: string;
  /** The measured count, in `scenario/survivors.ts`'s own words. Never paraphrased here. */
  readonly waysThrough: string;
  /** `true` where the row is a press. `false` where it is a row with a reason. */
  readonly playable: boolean;
  /** Present exactly when {@link playable} — what pressing it does, and what the clear banks. */
  readonly note: string | undefined;
  /** Present exactly when it is not — why it is listed and not offered. */
  readonly refusal: string | undefined;
}

/** The ordered path, drawn over the entries, or its absence. */
export interface ScenarioPathView {
  readonly heading: string;
  readonly lede: string;
  readonly rows: readonly ScenarioPathRow[];
  /** How many of the listed rows are a press, in counts. Drawn so the list's shape is legible. */
  readonly offerLine: string;
}

export interface ScenarioHubView {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly entries: readonly ScenarioEntry[];
  /**
   * The ordered path, or `undefined` while nothing has provided it.
   *
   * `undefined` is a real state and is drawn as one — `scenarioLadderPort.ts`'s docstring has the
   * window it opens in. The register carries the absence; the screen draws no empty list.
   */
  readonly path: ScenarioPathView | undefined;
  /** Drawn under the entries. Empty only when every § 2.1 source is authored to the schema. */
  readonly absences: readonly string[];
  /** The sentence that makes the list honest. Never omitted, even when `absences` empties. */
  readonly note: string;
}

export const SCENARIO_COPY = Object.freeze({
  eyebrow: 'Scenario',
  title: 'Pick a problem',
  lede: 'A building with something wrong with it. Watch it, read the letter, change what you like, and run it again.',
  /*
   * The note carries **no count of sources**, deliberately. It said *"Two of the four kinds of
   * scenario are playable"* and was wrong within a wave of being written, because a literal about
   * how much of a design has shipped is a literal somebody has to remember to move. What is always
   * true, and is what a reader needs, is that each row says its own state — so that is what it
   * says, and `SCENARIO_ABSENCES` carries what is missing.
   */
  note: 'Every row here says what it is and, where it is held back, why. What this list cannot reach yet is written under it.',
  /** Drawn where nothing has provided the path — never an empty list, never a spinner. */
  pathAbsent:
    'The ten stages on the path are read from the campaign’s own file, and this page has not been handed it. Reload if it does not appear.',
});

/**
 * The two sources that ship as a single press. Frozen rather than derived: each row's `screen` is a
 * registered key, and `scenarioModel.test.ts` asserts that against the registry rather than against
 * this comment.
 *
 * The ten campaign stages are **not** here, and the split is the one the shapes above argue for:
 * these two are a press and nothing else, and a stage may be a press or a refusal depending on a
 * measurement. See {@link ScenarioPathRow}.
 */
const ENTRIES: readonly ScenarioEntry[] = Object.freeze([
  Object.freeze({
    id: 'today',
    title: "Today's scenario",
    blurb: 'One building, one day, one seed — the same day for everybody.',
    /*
     * Composed in `everyday/sittingShape.ts` from the contract day's own length and the rung the
     * stage opens on, never typed here — GitHub issue #559, which measured *"~3 min"* against a
     * clock and found it out by a factor of four. **No figure is repeated in this comment**: a
     * number written beside a number that is computed is the defect § D753 exists to close, and it
     * would go stale on the next rung move exactly as the five strings did.
     */
    shape: SITTING_SHAPES.contractDay,
    screen: 'door' as const,
  }),
  Object.freeze({
    id: 'fix-a-building',
    title: 'Fix a building',
    blurb: 'A building with something wrong. Diagnose it, change it, re-run it.',
    shape: SITTING_SHAPES.fixCase,
    screen: 'fixit' as const,
  }),
]);

/**
 * Every session shape this hub draws, for `sittingShape.test.ts` to check against the one module
 * allowed to compose one. Exported rather than re-derived in the test, because a test that rebuilt
 * the list would go on passing when a row was added carrying a figure of its own.
 */
export const SCENARIO_ENTRY_SHAPES: readonly string[] = Object.freeze(
  ENTRIES.map((entry) => entry.shape),
);

/**
 * What this hub does not reach yet, in the player's words.
 *
 * **The first row lost a clause that had stopped being true, and the deletion is a correction
 * rather than a move.** It read *"The ten campaign stages are authored to the campaign record
 * rather than to the scenario schema, so this list cannot reach them until the two are one
 * thing."* They have been one thing since GitHub issue #365 landed — `CampaignStage.budget` is a
 * required field, refused rather than defaulted — so that sentence told a player the wiring was
 * blocked on a schema that had already shipped. § D227 in the polarity `CLAUDE.md` calls worse
 * than a dead seam: a dead seam does nothing, and a stale refusal tells the reader not to touch a
 * thing that works. What survives is the half that is still true, narrowed to say only that.
 *
 * **The second row is narrower than it was**, and the narrowing is the record: it read *"the six
 * engineering challenges, E1 to E6, are specified and unbuilt — no brief data ships"*, and since
 * GitHub issue **#227** brief data does ship — two of the six, authored to the scenario schema in
 * `data/engineering-briefs.json` and played from the Lab's own stage picker. What is still true is
 * that this list cannot reach them and that four of the six are refused at load, so the entry says
 * both rather than being deleted.
 *
 * **Two more rows are drawn and are deliberately not in this constant** — § D649,
 * {@link scenarioHubViewOf}. One names the stages listed with a measured count of zero, because a
 * register that carried the listing without the reason would be the hub looking finished again;
 * the other is the path's own absence on a boot that has not handed one over. Both are **derived
 * on every read** — the first counts the held rows, and writing *"seven of ten"* here would put a
 * figure from `data/scenario-survivors.json` into TypeScript, where a regeneration cannot reach
 * it, which is the defect `CLAUDE.md` records three published numbers committing.
 *
 * That is why this constant holds only the two **unconditional** rows: it is what
 * `everyday/buildNotes.ts` carries to the Settings panel and what
 * `everyday/refusalsAreCurrent.test.ts` sweeps for a screen wrongly called unbuilt, and neither
 * of those can read a state. A derived row is checked where it is derived —
 * `scenarioModel.test.ts` asserts the count it states against the rows it counted, and that it is
 * **absent entirely** when nothing is held, which is what makes it a register row rather than
 * decoration.
 */
export const SCENARIO_ABSENCES: readonly string[] = Object.freeze([
  'The ten stages on the path are played on the Engineer surface. A stage cleared there banks no chimes and does not reach a career; that will count once a stage can be played from this list.',
  'Two of the six engineering challenges ship, and they are played on the Engineer surface rather than from this list. The other four ask for something a scenario run cannot do yet, and each says which.',
]);

/**
 * The register sentence for the stages that are listed and not offered, derived from the path.
 *
 * **A sentence rather than a constant, because the count in it is a measurement.** Writing *"seven
 * of ten"* into {@link SCENARIO_ABSENCES} would put a figure from `data/scenario-survivors.json`
 * into TypeScript, where a regeneration cannot reach it — which is the defect `CLAUDE.md` records
 * three times over under *a published number goes stale the same way*. So the count is counted
 * every time the hub is built, and the row is absent entirely when nothing is held.
 */
function heldRegisterLine(rows: readonly ScenarioPathRow[]): string | undefined {
  const held = rows.filter((row) => !row.playable).length;
  if (held === 0) return undefined;
  return (
    `${String(held)} of the ${String(rows.length)} stages on the path are listed with their ` +
    'counts and are not offered to play: nothing that was tried on them got through. That is a ' +
    'measurement of the content rather than of you, and the ways-in that were tried by name were ' +
    'all tried, while the ones drawn from the dials were a sample — so it is none found rather ' +
    'than none there.'
  );
}

/** One path row, worded. The figures are the ladder's; this chooses only which of them are drawn. */
function pathRowOf(rung: ScenarioLadderRung): ScenarioPathRow {
  const playable = rung.offer === 'offered';
  return Object.freeze({
    id: rung.id,
    position: rung.position,
    title: rung.name,
    teaches: rung.teaches,
    openingLine: rung.openingLine,
    shape: rung.shape,
    budgetLine: rung.budgetLine,
    waysThrough: rung.waysThrough,
    playable,
    note: playable ? rung.openNote : undefined,
    refusal: playable ? undefined : rung.heldReason,
  });
}

/** The path, worded — or `undefined` where none was provided. */
function pathViewOf(rungs: readonly ScenarioLadderRung[]): ScenarioPathView {
  const rows = rungs.map((rung) => pathRowOf(rung));
  const counts = ladderOfferCounts(rungs);
  return Object.freeze({
    heading: SCENARIO_LADDER_COPY.heading,
    lede: SCENARIO_LADDER_COPY.lede,
    rows: Object.freeze(rows),
    /*
     * Counts, never a share — `scenario/published.ts`'s rule, and the denominator arrives first so
     * a reader meets *how many there are* before *how many open*, which is R13's shape one level
     * up from the survivor sentence itself.
     */
    offerLine:
      `${String(counts.listed)} stages on the path, ${String(counts.offered)} of them open to ` +
      'play from here today.',
  });
}

/**
 * The hub, computed.
 *
 * Takes the path rather than reading it: this module is pure and the documents behind the path are
 * fetched. `undefined` is the honest answer while nothing has provided one — see
 * `scenarioLadderPort.ts` for the window that opens in, and {@link SCENARIO_COPY.pathAbsent} for
 * what is drawn instead.
 */
export function scenarioHubViewOf(path?: readonly ScenarioLadderRung[]): ScenarioHubView {
  const view = path === undefined ? undefined : pathViewOf(path);
  const held = view === undefined ? undefined : heldRegisterLine(view.rows);
  return Object.freeze({
    eyebrow: SCENARIO_COPY.eyebrow,
    title: SCENARIO_COPY.title,
    lede: SCENARIO_COPY.lede,
    entries: ENTRIES,
    path: view,
    absences: Object.freeze([
      ...SCENARIO_ABSENCES,
      ...(held === undefined ? [] : [held]),
      ...(view === undefined ? [SCENARIO_COPY.pathAbsent] : []),
    ]),
    note: SCENARIO_COPY.note,
  });
}
