/**
 * What a board row *is*, and what a player may do with one — GitHub issue #93.
 *
 * The board has been verified and inert since § D214: a table of four figures and a seed, ranked by
 * a server that re-simulated every row. #93's complaint is that nothing on it can be *acted on* —
 * *"a leaderboard without social context is just a number table"* — and names three things: press a
 * row and get its configuration, see the dispatcher behind it, and know which row is yours.
 *
 * This module is the decision half of the first two. It is here rather than in `dev/menuPanel.ts`
 * for § D214 § 2's founding reason — a decision made inside a click handler needs a document, a
 * canvas and a click to reach, so it cannot be tested and it drifts — and it is separate from
 * `screens.ts` because it is the one part of the leaderboard that has to *resolve ids against the
 * loaded configuration*, which is a different question from *what does this screen offer*.
 *
 * ## Two facts about a board that decide the whole design, and neither is obvious
 *
 * **1. The dispatcher was a property of the board and is now a property of the row — and the check
 * below is what caught it rather than a reader.** This paragraph used to read *"the dispatcher is a
 * property of the board, not of the row"*, because `packages/server`'s `configHashOf` digested
 * `buildingId`, `dispatcherProfileId`, `demandTemplateId`, `arrivalRatePctPop5min`, `durationS` and
 * `windowStartS`, and a board *was* that digest. `ENGINE_CONTRACT.md` § 12.1 forbids that key —
 * every axis in it is a parameter a player sets — so the digest kept its job of naming *what a row
 * was measured against* and stopped deciding which board a row is on. A board is now the **date**,
 * or a player's own log.
 *
 * The consequence for this module is exact: **on the daily board every row shares everything except
 * the dispatcher, which is the axis being compared, and in a personal log the rows may share
 * nothing.** So #93's *"a per-row secret that is already a per-board fact"* has stopped being true,
 * and the honest reveal is no longer one sentence above the table.
 *
 * ### What that cost, and what it now buys — GitHub issue #316
 *
 * {@link boardConfigurationOf}'s own check refused to name a configuration when the page's rows
 * disagreed, so the surface went **quiet** rather than printing a dispatcher that ran some of the
 * rows. That refusal was right and it was not an answer: the player was shown a blank where the
 * interesting fact was, on the board the product ships as its front page.
 *
 * The rule that replaced the blank is one line long, and it is the board key's own shape read back
 * as a screen: **an axis is named once above the table when every row agrees on it, and on each row
 * when they do not.** A daily board therefore reads as the comparison it is — building, traffic
 * shape, arrival rate and part of the day once, the dispatcher on every row — and a personal log
 * whose rows share nothing gets no board-level sentence at all.
 *
 * Two things did **not** change, and both are the point. The check is still there: an axis the rows
 * disagree on is never named as though they agreed, and {@link BoardConfiguration} now carries no
 * value for such an axis at all, so it cannot be printed by a careless later edit. And *agreement*
 * itself got stricter rather than looser — it is measured per axis now, on the fields each axis is
 * rather than on a label, so two rows sharing a part-of-day label but not a length are told apart.
 *
 * **The argument lives here rather than in `DECISIONS.md`** (§ D405): the change binds this module
 * and the screen that renders it, § D439 already recorded the key split that made it necessary and
 * named this screen change as its unfinished half, and this lane holds no allocated block to file
 * under. An integrator who wants a heading should carry this section and the two below it.
 *
 * **2. A row cannot be beaten by running it.** The configuration is fixed by the board and the seed
 * is on the row, so loading both and pressing go reproduces the row's figures **exactly** —
 * invariant 5, and the whole reason the server can verify a score at all. That is why
 * {@link BEAT_LABEL} does not read *Beat this score*: a control whose press cannot do what its label
 * says is this repository's most-repeated defect wearing the friendliest possible face. What the
 * press is actually *for* is the comparison it makes available — the row's own passengers, under
 * common random numbers, which is this project's own discipline arriving as a game mechanic.
 *
 * ## What the reveal may claim, and the one thing it may not
 *
 * `leaderboard/verify.ts#configFor` resolves the dispatcher **by id from the server's own `data/`**
 * and answers `unknown-dispatcher` when it cannot, and `verifySubmission` accepts a score only when
 * the replay reproduces it. So *"the dispatcher behind this row is `X`"* is a **server-verified
 * fact** and may be stated flatly.
 *
 * What may not be stated flatly is anything this browser reads out of its *own* `data/` for that id.
 * The viewer is served from a CDN and the API from a separate container (§ D308), so the two
 * deployments can carry different reference data; the board's identity pins the profile digest the
 * server loaded, and nothing in this package computes that digest. A name is therefore labelled as
 * this build's name for the id, and the **weight vector is not printed at all** — see
 * {@link boardConfigurationOf}.
 *
 * ## A `DECISIONS.md` section is owed for this, and is deliberately not written here
 *
 * Three of the choices above are decisions rather than implementation, and each is a thing a later
 * reader would otherwise have to reconstruct from a diff: that the dispatcher reveal is a **board**
 * fact and not a row one; that the control is not called *Beat this score*, with the arithmetic
 * behind the refusal; and that the reveal stops at the id and the name and will not print weights.
 * The argument for all three is written out above, in the module that performs them, so it cannot
 * drift from the code the way a sentence in a separate file can. **The section number is owed and
 * unclaimed** — whoever files it should carry these three and the scope note in the pull request,
 * not paraphrase them.
 */

import type { RunSubmission } from './client.js';
import { partsFor } from './menu.js';
import { partIdOf } from './partsOfDay.js';
import type { FreePlaySelection, MenuCatalogue } from './types.js';

/* -------------------------------------------------------------------------- *
 * A row, as something Free Play can start
 * -------------------------------------------------------------------------- */

/**
 * The selection a submitted run *is*.
 *
 * {@link RunSubmission} and {@link FreePlaySelection} carry the same seven fields, and that is not a
 * coincidence to be exploited with a cast: `client.ts` says the submission is *"the same fields Free
 * Play selects, by construction"*, and this function is where the construction is written down. A
 * cast would compile for as long as the two shapes happened to agree and would silently start
 * dropping a field the day either grew one — which is the class of defect § D288 spent a whole
 * section on, where the window was in `FreePlaySelection` and not in `RunSubmission` and nothing
 * anywhere said so.
 *
 * It deliberately **validates nothing**. `freePlayIssues` is the one answer to *can this selection
 * start*, and a second predicate here would be the two-answer state `scope/runIdentity.ts` argues is
 * the single disagreement a replay-verified board cannot survive. {@link beatRefusalOf} asks that
 * one predicate rather than inventing another.
 */
export function selectionFromRun(run: RunSubmission): FreePlaySelection {
  return Object.freeze({
    buildingId: run.buildingId,
    dispatcherProfileId: run.dispatcherProfileId,
    demandTemplateId: run.demandTemplateId,
    arrivalRatePctPop5min: run.arrivalRatePctPop5min,
    durationS: run.durationS,
    windowStartS: run.windowStartS,
    seed: run.seed,
  });
}

/* -------------------------------------------------------------------------- *
 * Naming what ran
 * -------------------------------------------------------------------------- */

/** One axis of a board's configuration, resolved against the loaded catalogue — or not. */
export interface ResolvedAxis {
  /** `Building`, `Dispatcher`, `Traffic shape`, `Part of the day`. */
  readonly axis: string;
  /** The id the submission carried. Always printed, because it is the checkable half. */
  readonly id: string;
  /** This build's name for that id, or `undefined` when this build does not carry it. */
  readonly name: string | undefined;
}

/**
 * One axis, as the fields that decide it and the way to read it — the table the reveal is computed
 * from, and the thing that had to exist before a mixed board could be described at all.
 *
 * When a board *was* a digest over six fields, one comparison answered everything: the rows agreed
 * or they did not, and resolving `runs[0]` was describing all of them. A daily board is keyed by the
 * date alone ([§ D439](../../../../DECISIONS.md)), so **agreement is a property of each axis rather
 * than of the page**, and the answer has to be computed per axis or it cannot honestly be given.
 *
 * `keyOf` is what agreement is measured on and is **never shown**; `valueOf` is what a reader is
 * told. Keeping them apart is load-bearing rather than tidy: *Part of the day* is drawn from
 * `windowStartS` **and** `durationS`, so two rows can carry the same part label and still be two
 * different runs — a label compared against a label would report them as agreeing, which is the one
 * mistake this whole module exists to refuse.
 */
interface Axis {
  readonly axis: string;
  /** The submitted fields this axis is, as one comparable string. Never shown. */
  readonly keyOf: (run: RunSubmission) => string;
  readonly valueOf: (
    run: RunSubmission,
    catalogue: MenuCatalogue,
  ) => { readonly id: string; readonly name: string | undefined };
}

/** This build's name for an id, or `undefined` when this build does not carry it. */
function nameIn(
  entries: readonly { readonly id: string; readonly name: string }[],
  id: string,
): string | undefined {
  return entries.find((entry) => entry.id === id)?.name;
}

/**
 * The five axes a submission names, over the six fields `boardKey.ts#runDataHashOf` digests.
 *
 * Five rather than six because the window and the length are one choice a player makes — § D286's
 * *part of the day* — and {@link partIdOf} is a lossless encoding of the pair, so comparing part ids
 * is exactly comparing `(windowStartS, durationS)`. That is why this table can key on the part and
 * still be the digest's own six fields: {@link boardConfigurationOf} pins the two definitions
 * against each other, and `boardRun.test.ts` asserts they cannot drift apart.
 */
const AXES: readonly Axis[] = Object.freeze([
  {
    axis: 'Building',
    keyOf: (run) => run.buildingId,
    valueOf: (run, catalogue) => ({
      id: run.buildingId,
      name: nameIn(catalogue.buildings, run.buildingId),
    }),
  },
  {
    axis: 'Dispatcher',
    keyOf: (run) => run.dispatcherProfileId,
    valueOf: (run, catalogue) => ({
      id: run.dispatcherProfileId,
      name: nameIn(catalogue.dispatchers, run.dispatcherProfileId),
    }),
  },
  {
    axis: 'Traffic shape',
    keyOf: (run) => run.demandTemplateId,
    valueOf: (run, catalogue) => ({
      id: run.demandTemplateId,
      name: nameIn(catalogue.demandTemplates, run.demandTemplateId),
    }),
  },
  {
    /*
     * The rate is not an id and cannot fail to resolve — it is a number or the absence of one, and
     * `null` is a real selection rather than a missing one (`FreePlaySelection`'s own rule). It is
     * carried as an axis anyway so the sentence names every field the board hashed: a configuration
     * line that listed four of the five would read as complete and be wrong.
     */
    axis: 'Arrival rate',
    keyOf: (run) => String(run.arrivalRatePctPop5min),
    valueOf: (run) => ({
      id: run.arrivalRatePctPop5min === null ? 'building' : `${String(run.arrivalRatePctPop5min)} %`,
      name:
        run.arrivalRatePctPop5min === null
          ? 'the building’s own rate'
          : `${String(run.arrivalRatePctPop5min)} % of population per 5 min`,
    }),
  },
  {
    axis: 'Part of the day',
    keyOf: (run) => partIdOf(run.windowStartS, run.durationS),
    valueOf: (run, catalogue) => ({
      id: partIdOf(run.windowStartS, run.durationS),
      // `partsFor` answers `[]` for a template this build does not carry, so an unresolved template
      // makes this unresolved too — which is correct and is not double-counting: a reader told the
      // template is unknown still needs telling that the part cannot be named either.
      name: partsFor(catalogue, run.demandTemplateId).find(
        (part) => part.id === partIdOf(run.windowStartS, run.durationS),
      )?.label,
    }),
  },
]);

/** One axis of one row, resolved. */
function resolvedAxisOf(axis: Axis, run: RunSubmission, catalogue: MenuCatalogue): ResolvedAxis {
  const { id, name } = axis.valueOf(run, catalogue);
  return Object.freeze({ axis: axis.axis, id, name });
}

/**
 * What a board ran, as the axes that name it — the *"How did they do it"* half of #93.
 *
 * ## Why it takes the whole page rather than one row
 *
 * Because the claim it produces is about the **board**, and a claim about a board taken from one row
 * is a claim that could be wrong without anything noticing. It used to be able to assume the answer
 * — every row on one board shared the configuration by construction — and it checked anyway. That
 * check is what caught the premise going false when the board key was split (§ D439), rather than a
 * reader noticing.
 *
 * ## An axis is named once, or on each row, and nothing in between
 *
 * That is the whole rule, and it mirrors the key it is describing. {@link BoardConfiguration.shared}
 * holds the axes **every** row agrees on, which are the ones a sentence above the table may name.
 * {@link BoardConfiguration.varying} holds the axes they do not, as names with **no value
 * attached** — because there is no single value to attach, and a shape that carried `runs[0]`'s
 * would be one careless `.map` away from printing a dispatcher that ran two of five rows. Those are
 * named on each row instead, by {@link rowVariationOf}.
 *
 * So a daily board — keyed by the date, dispatcher free — reads as the comparison it is: four axes
 * once, the dispatcher on every row. And a personal log whose rows share nothing gets no sentence at
 * all, which is {@link boardRevealRefusalOf}'s remaining job.
 *
 * ## What is deliberately not in here
 *
 * **The weight vector.** `data/dispatcher-profiles.json` is the dispatcher — invariant 7 — so
 * printing `waitTime 1.0` would be the most direct possible answer to #93's *"what are they doing
 * that I am not"*. It is refused because it is the one part of the answer this browser cannot
 * support: the board's identity pins the `dispatcherDigest` the **server** loaded, this package
 * computes no digest, and a CDN-served viewer can be a deployment behind the API it is reading
 * (§ D308). A weight vector printed under *"how did they do it"* would be this build's copy
 * presented as the run's, which is a stated mechanism with nothing measuring it. The id is verified
 * and is printed; the name is this build's and is labelled as such; the weights are neither, so they
 * are absent. A player who wants them presses the row — {@link BEAT_LABEL} loads the profile into
 * the editor, where they are this browser's own by construction and say so.
 */
export interface BoardConfiguration {
  /**
   * Whether every row on the page named the same configuration. `false` on an empty page.
   *
   * Unchanged in meaning and still measured on {@link configKeyOf}'s six fields. It is no longer
   * what decides whether the screen speaks — that is per axis now — and it is still what decides
   * whether the *whole board* may be spoken of as one run, which is the premise `BEATING_NOTE`
   * stands on.
   */
  readonly agreed: boolean;
  /** The axes every row agrees on, resolved. Safe to name above the table. Empty on an empty page. */
  readonly shared: readonly ResolvedAxis[];
  /** The axes the rows disagree on, by name and **without a value**: there is no single one. */
  readonly varying: readonly string[];
  /** The shared axes this build cannot name. Empty when everything shared resolved. */
  readonly unresolved: readonly ResolvedAxis[];
}

/**
 * The six fields `boardKey.ts#runDataHashOf` digests, as one comparable string. Never shown.
 *
 * The same six it has always been. What moved is what a difference between two of them *means*: it
 * used to mean the two rows could not be on one board, and now it means they were measured against
 * different things while sitting on the same one.
 *
 * It is kept as {@link BoardConfiguration.agreed}'s own definition rather than folded into
 * {@link AXES}, so the board-wide question has one answer that does not move when the axis table is
 * edited. `boardRun.test.ts` holds the two together in both directions — every axis shared iff this
 * key agrees — which is what would catch an axis added here and forgotten there.
 */
function configKeyOf(run: RunSubmission): string {
  return [
    run.buildingId,
    run.dispatcherProfileId,
    run.demandTemplateId,
    String(run.arrivalRatePctPop5min),
    String(run.durationS),
    String(run.windowStartS),
  ].join('|');
}

/** See {@link BoardConfiguration}. */
export function boardConfigurationOf(
  runs: readonly RunSubmission[],
  catalogue: MenuCatalogue,
): BoardConfiguration {
  const first = runs[0];
  if (first === undefined) {
    return Object.freeze({
      agreed: false,
      shared: Object.freeze([]),
      varying: Object.freeze([]),
      unresolved: Object.freeze([]),
    });
  }
  const key = configKeyOf(first);
  const agreed = runs.every((run) => configKeyOf(run) === key);

  const shared: ResolvedAxis[] = [];
  const varying: string[] = [];
  for (const axis of AXES) {
    const axisKey = axis.keyOf(first);
    if (runs.every((run) => axis.keyOf(run) === axisKey)) {
      shared.push(resolvedAxisOf(axis, first, catalogue));
    } else {
      varying.push(axis.axis);
    }
  }

  return Object.freeze({
    agreed,
    shared: Object.freeze(shared),
    varying: Object.freeze(varying),
    unresolved: Object.freeze(shared.filter((axis) => axis.name === undefined)),
  });
}

/** `the dispatcher`, `the dispatcher and the arrival rate`. */
function joinedAxisNames(names: readonly string[]): string {
  const lowered = names.map((name) => `the ${name.toLowerCase()}`);
  if (lowered.length <= 1) return lowered[0] ?? '';
  return `${lowered.slice(0, -1).join(', ')} and ${lowered.at(-1) ?? ''}`;
}

/** What an axis says, with the id standing in where this build has no name for it. */
function namedValueOf(axis: ResolvedAxis): string {
  return axis.name ?? `${axis.id} — not in this build`;
}

/**
 * The clause that keeps the reveal from being a claim about this browser's own `data/`. Both arms
 * carry it, because both arms print a name this build resolved.
 */
const NAMES_ARE_THIS_BUILDS =
  'The names beside the ids are this build’s own: the board’s identity pins the profile the server ' +
  'loaded, and this browser does not compute that digest.';

/**
 * The configuration sentence, or `undefined` when there is nothing honest to say.
 *
 * Two arms, and the difference between them is the only thing on this screen a mixed board changed.
 * A board whose rows agree is described as it always was — *what every row ran*, dispatcher
 * included. A board whose rows do not agree names **what they share**, says which axis they differ
 * on, and says where that axis is named instead. Neither arm ever prints a value for an axis in
 * {@link BoardConfiguration.varying}, and it cannot: {@link BoardConfiguration} carries no value for
 * one.
 *
 * **The second arm's promise is kept by `screens.ts`, not by this sentence.** *That is named on each
 * row* is a claim about the screen, so `boardRun.test.ts` drives `screenOf` and requires the naming
 * to actually be on the rows — a sentence promising a disclosure that a later edit removed would be
 * § D227's stale refusal wearing the friendly half of the pair.
 *
 * The clause about the ids stays in both arms and stays first-hand: the ids came off rows the server
 * replayed, and the names beside them are this build's.
 */
export function boardRevealOf(configuration: BoardConfiguration): string | undefined {
  if (configuration.shared.length === 0) return undefined;
  const named = configuration.shared
    .map((axis) => `${axis.axis}: ${namedValueOf(axis)}`)
    .join(' · ');
  if (configuration.agreed) {
    return (
      `What every row on this board ran — ${named}. ` +
      'The server replayed each row from those ids before it accepted its figures, so the dispatcher ' +
      `named here is the one that produced them. ${NAMES_ARE_THIS_BUILDS}`
    );
  }
  return (
    `What every row on this board shares — ${named}. ` +
    `The rows differ on ${joinedAxisNames(configuration.varying)}. That is named on each row rather ` +
    'than here, because one value named for the whole board would be a claim about the rows that ' +
    'did not run it. The server replayed every row from its own ids before it accepted its figures, ' +
    `so what is named — here and on the rows — is what produced the figures beside it. ${NAMES_ARE_THIS_BUILDS}`
  );
}

/**
 * Why this build cannot name part of what ran, or `undefined`.
 *
 * Separate from {@link boardRevealOf} because it is a **refusal** and refusals are shown even when
 * the sentence beside them is fine: a reader looking at a configuration line with `predictive-x —
 * not in this build` in the middle of it deserves to be told what that means rather than left to
 * infer it from a dash.
 *
 * ## Two refusals it no longer makes, and neither was dropped to make a screen quieter
 *
 * It used to answer *"the rows on this board do not all name the same configuration … this build and
 * the server no longer agree about what a board is"* for **every** page that was not unanimous. That
 * was a correct reading of a board that was a configuration and is a **false diagnosis** of one
 * keyed by a date (§ D439): a daily board's rows are *supposed* to carry different dispatchers, and
 * a screen telling a player the client and the server have fallen out over it would be reporting a
 * fault where the product is working. The information did not go anywhere — {@link boardRevealOf}'s
 * second arm says which axis differs and where it is named — and the *check* got stronger rather
 * than weaker on the way, because it is per axis now instead of per page.
 *
 * It also answered that same sentence for a page with **no rows at all**, which was a claim about
 * rows that do not exist. An empty board says nothing here; `dev/menuPanel.ts` already tells a
 * reader that nothing has been posted to it.
 *
 * What it still refuses is a page whose rows share **nothing**, which a personal log can be: there
 * is no board-level sentence to write, so it says so rather than naming the first row's for all of
 * them.
 */
export function boardRevealRefusalOf(configuration: BoardConfiguration): string | undefined {
  if (configuration.shared.length === 0) {
    // Nothing shared and nothing differing is an empty page: no rows, so no disagreement to report.
    if (configuration.varying.length === 0) return undefined;
    return (
      'The rows on this board share no part of what they ran, so there is nothing this screen can ' +
      'say about the board as a whole. Each row names its own configuration instead — one row’s ' +
      'named for all of them would describe runs it was never true of.'
    );
  }
  if (configuration.unresolved.length === 0) return undefined;
  return (
    `This build does not carry ${configuration.unresolved
      .map((axis) => `${axis.axis.toLowerCase()} “${axis.id}”`)
      .join(', ')}. The rows are real — the server replayed every one of them — but this browser ` +
    'cannot say what those ids are, and it will not invent a name for them.'
  );
}

/** What one row ran that the board does not agree on. */
export interface RowVariation {
  /** The values alone, for the row's own label — `Conventional collective`. */
  readonly named: string;
  /** The same values under their axis names, for the line beneath it. */
  readonly detail: string;
}

/**
 * What this row ran that the board does not agree on — `undefined` when the rows agree on everything.
 *
 * The other half of *an axis is named once, or on each row*. It resolves the **row's own** ids
 * against this build, for exactly the axes {@link boardConfigurationOf} found the page disagreeing
 * on, so what a row says and what the sentence above the table says can never be two answers to one
 * question: an axis is in one place or the other, never both and never neither.
 *
 * It resolves every varying axis rather than the dispatcher alone, and that is not generality for
 * its own sake. `boardRevealOf`'s second arm promises that *what the rows differ on is named on each
 * row*, and a version that named only the dispatcher would make that sentence false the first time a
 * personal log put two run lengths side by side — which is the shape of stale claim this module has
 * already been caught by once.
 *
 * An id this build cannot name is printed as an id and marked, on {@link boardRevealOf}'s rule: a
 * row is a real run the server replayed, and this browser will not invent a name for it.
 */
export function rowVariationOf(
  run: RunSubmission,
  configuration: BoardConfiguration,
  catalogue: MenuCatalogue,
): RowVariation | undefined {
  const varying = AXES.filter((axis) => configuration.varying.includes(axis.axis));
  if (varying.length === 0) return undefined;
  const resolved = varying.map((axis) => resolvedAxisOf(axis, run, catalogue));
  return Object.freeze({
    named: resolved.map((axis) => namedValueOf(axis)).join(' · '),
    detail: resolved.map((axis) => `${axis.axis}: ${namedValueOf(axis)}`).join(' · '),
  });
}

/* -------------------------------------------------------------------------- *
 * Taking a row on
 * -------------------------------------------------------------------------- */

/**
 * The label on the control #93 asked to call *"Beat this score"*, and it does not.
 *
 * #93 § 1 asks for *"a button that pre-loads the exact building, seed, and shift length"* under that
 * name. The first half is built and this is it. The name is refused, and the reason is arithmetic
 * rather than taste: the row carries every axis of its own configuration and its own seed, so a
 * press that loads them and runs it reproduces the row's four figures **exactly** — the same seed
 * brings the same passengers, which is invariant 5 and the reason the server can verify a score at
 * all. (It used to be the *board* that fixed the configuration. § D439 moved that to the row, and
 * the arithmetic is unchanged because a submission carried all six fields either way.) A
 * control labelled *Beat this score* would therefore promise, in the one place a player is most
 * motivated to believe it, something its own press cannot do.
 *
 * What the press is worth is what it *makes available*: the row's own passengers, so anything the
 * player changes afterwards is answered under common random numbers rather than against a different
 * crowd. That is this project's own comparison discipline, reachable from a leaderboard row.
 */
export const BEAT_LABEL = 'Run this row’s configuration';

/**
 * The line under {@link BEAT_LABEL} for one row, with what that row ran that the board does not
 * agree on in front of it.
 *
 * Names the seed, because the seed is what makes a row checkable (invariant 5) and it is what the
 * press is actually loading. Says the reproduction outright rather than letting a player discover it
 * by pressing — a surprise that costs a run is a surprise the screen could have saved.
 *
 * ## Two corrections a split board key forced, and the first is the one to read
 *
 * It said *"loads this board's configuration with this row's own seed"*, and on a board keyed by a
 * date that is **false**: {@link selectionFromRun} takes every field from the row, so the press has
 * always loaded the row's configuration — the two were the same sentence only while a board was a
 * configuration (§ D439). A control describing a press by the wrong subject is § D227's defect in
 * the place a player is most likely to act on it, so the subject is corrected rather than softened.
 *
 * The second is {@link variation}: on a mixed board the row's own dispatcher is the interesting
 * fact, and it is stated here rather than left to be inferred from a name in a list. It is
 * `undefined` on a board whose rows agree, and then this line is exactly what it always was —
 * because on such a board the dispatcher **is** named once above the table, and saying it twice
 * would make the agreement read as something being argued.
 */
export function beatDetailOf(run: RunSubmission, variation?: RowVariation | undefined): string {
  return (
    `${variation === undefined ? '' : `${variation.detail}. `}` +
    `Loads this row’s own configuration with its own seed — ${run.seed} — and runs it. ` +
    'Left alone it reproduces these four figures exactly, because the same seed brings the same ' +
    'passengers; changed, it answers with the same people, which is what makes the comparison a ' +
    'real one rather than an approximate one.'
  );
}

/**
 * Why this row cannot be run here, or `undefined`.
 *
 * Asks `freePlayIssues` through {@link issuesFor} rather than deciding anything itself: *can this
 * selection start* has exactly one answer in this package and a second one here would be the
 * two-answer state `scope/runIdentity.ts` names as the one disagreement a replay-verified board
 * cannot survive. The sentences it returns are that predicate's own, which is why a reader who
 * cannot run a row is told the same thing they would be told on the Free play screen.
 */
export function beatRefusalOf(
  run: RunSubmission,
  catalogue: MenuCatalogue,
  issuesFor: (selection: FreePlaySelection) => readonly { readonly message: string }[],
): string | undefined {
  const issues = issuesFor(selectionFromRun(run));
  if (issues.length === 0) return undefined;
  return `${issues.map((issue) => issue.message).join(' ')} A row this build cannot resolve is still a real run — the server replayed it — and this browser simply cannot reproduce it.`;
}

/**
 * Where beating a row actually lives, said on the screen that cannot offer it.
 *
 * This is the half of #93 that its own § 4 half-saw. *"'This week's challenge' and the leaderboard
 * … describe the same concept"* is wrong — they describe two deliberately different ones (§ D218,
 * and `http/api.ts`'s *"Two boards, and they answer different questions"*) — but the reader's
 * confusion is real and has a real cause: when every row on a board shares a dispatcher, the only
 * axis a player has left is **which seed they post**, and nothing on the screen said so. A
 * leaderboard that invites competition and leaves seed luck as the only lever is the sentence
 * `docs/10` § 5.5 is about, arriving by omission.
 *
 * ## Which board it is true of, and the gate that had to be narrowed
 *
 * *Every one of them is that same dispatcher* is a claim about the page, so it may only be printed
 * on a page where it holds — {@link BoardConfiguration.agreed}, and nothing weaker. It used to be
 * gated on {@link boardRevealOf} answering at all, which was the same gate while the reveal was
 * silent on every mixed board. It is not any more: the reveal now speaks on a board whose rows share
 * four axes and differ on the dispatcher, and that is precisely the board this sentence is false of.
 * So the gate moved to the premise itself, which is where it should have been written in the first
 * place — `screens.ts` holds it, and `boardRun.test.ts` drives a mixed board and requires this note
 * to be absent from it.
 *
 * It does not restate the premise printed above it: `screens.ts#LEADERBOARD_NOTE` already describes
 * what a board is, and saying it twice on one screen would make it read as the thing being argued
 * rather than the thing being built on — the objection `screens.ts#COMMISSIONING_BRIEF` records
 * against restating the capital rule. This adds only the consequence, which nothing said.
 */
export const BEATING_NOTE =
  'So what is left to differ between the rows above is the seed: every one of them is that same ' +
  'dispatcher answering a different set of passengers, which is luck rather than skill. This ' +
  'week’s challenge is the surface built for the other question — it fixes the seed set for ' +
  'everybody and leaves the dispatcher free.';
