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
 * {@link boardConfigurationOf} already refuses to name a configuration when the page's rows
 * disagree, so the surface goes **quiet** rather than printing a dispatcher that ran some of the
 * rows — which is the correct behaviour and was already the mechanical check keeping this paragraph
 * honest. What it is not is a *finished* answer: a daily board's reveal should name the axes the
 * rows agree on and put the dispatcher on each row, and that is a screen change this module cannot
 * make on its own. Until it lands the panel is silent on a mixed board, which is a gap stated here
 * rather than discovered by a reader wondering why the box is empty.
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
 * What a board ran, as the axes that name it — the *"How did they do it"* half of #93.
 *
 * ## Why it takes the whole page rather than one row
 *
 * Because the claim it produces is about the **board**, and a claim about a board taken from one row
 * is a claim that could be wrong without anything noticing. Every row on a board shares the
 * configuration by construction (see the module docstring), so this checks it: if any two rows
 * disagree on any of the six digested fields, {@link BoardConfiguration.agreed} is `false` and the
 * caller must not print a configuration sentence. On a daily board that is the ordinary case rather
 * than an anomaly — the dispatcher is what the board compares — and the silence is correct either
 * way: the alternative is naming a dispatcher that ran some of the rows.
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
  /** Whether every row on the page named the same configuration. `false` on an empty page. */
  readonly agreed: boolean;
  readonly axes: readonly ResolvedAxis[];
  /** The axes this build cannot name. Empty when everything resolved. */
  readonly unresolved: readonly ResolvedAxis[];
}

/**
 * The six fields `boardKey.ts#runDataHashOf` digests, as one comparable string. Never shown.
 *
 * The same six it has always been. What moved is what a difference between two of them *means*: it
 * used to mean the two rows could not be on one board, and now it means they were measured against
 * different things while sitting on the same one.
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
    return Object.freeze({ agreed: false, axes: Object.freeze([]), unresolved: Object.freeze([]) });
  }
  const key = configKeyOf(first);
  const agreed = runs.every((run) => configKeyOf(run) === key);

  const nameIn = (entries: readonly { readonly id: string; readonly name: string }[], id: string): string | undefined =>
    entries.find((entry) => entry.id === id)?.name;

  const partId = partIdOf(first.windowStartS, first.durationS);
  const axes: ResolvedAxis[] = [
    { axis: 'Building', id: first.buildingId, name: nameIn(catalogue.buildings, first.buildingId) },
    {
      axis: 'Dispatcher',
      id: first.dispatcherProfileId,
      name: nameIn(catalogue.dispatchers, first.dispatcherProfileId),
    },
    {
      axis: 'Traffic shape',
      id: first.demandTemplateId,
      name: nameIn(catalogue.demandTemplates, first.demandTemplateId),
    },
    {
      /*
       * The rate is not an id and cannot fail to resolve — it is a number or the absence of one, and
       * `null` is a real selection rather than a missing one (`FreePlaySelection`'s own rule). It is
       * carried as an axis anyway so the sentence names every field the board hashed: a
       * configuration line that listed five of the six would read as complete and be wrong.
       */
      axis: 'Arrival rate',
      id: first.arrivalRatePctPop5min === null ? 'building' : `${String(first.arrivalRatePctPop5min)} %`,
      name:
        first.arrivalRatePctPop5min === null
          ? 'the building’s own rate'
          : `${String(first.arrivalRatePctPop5min)} % of population per 5 min`,
    },
    {
      axis: 'Part of the day',
      id: partId,
      // `partsFor` answers `[]` for a template this build does not carry, so an unresolved template
      // makes this unresolved too — which is correct and is not double-counting: a reader told the
      // template is unknown still needs telling that the part cannot be named either.
      name: partsFor(catalogue, first.demandTemplateId).find((part) => part.id === partId)?.label,
    },
  ];

  return Object.freeze({
    agreed,
    axes: Object.freeze(axes),
    unresolved: Object.freeze(axes.filter((axis) => axis.name === undefined)),
  });
}

/**
 * The configuration sentence, or `undefined` when there is nothing honest to say.
 *
 * Two clauses, and the second is the one that keeps this from being a claim: the ids came off rows
 * the server replayed, and the names beside them are this build's.
 */
export function boardRevealOf(configuration: BoardConfiguration): string | undefined {
  if (!configuration.agreed) return undefined;
  const named = configuration.axes
    .map((axis) => `${axis.axis}: ${axis.name ?? `${axis.id} — not in this build`}`)
    .join(' · ');
  return (
    `What every row on this board ran — ${named}. ` +
    'The server replayed each row from those ids before it accepted its figures, so the dispatcher ' +
    'named here is the one that produced them. The names beside the ids are this build’s own: the ' +
    'board’s identity pins the profile the server loaded, and this browser does not compute that ' +
    'digest.'
  );
}

/**
 * Why this build cannot name part of what ran, or `undefined`.
 *
 * Separate from {@link boardRevealOf} because it is a **refusal** and refusals are shown even when
 * the sentence beside them is fine: a reader looking at a configuration line with `predictive-x —
 * not in this build` in the middle of it deserves to be told what that means rather than left to
 * infer it from a dash.
 */
export function boardRevealRefusalOf(configuration: BoardConfiguration): string | undefined {
  if (!configuration.agreed) {
    return (
      'The rows on this board do not all name the same configuration, so there is nothing this ' +
      'screen can say about what they ran. A board is one configuration across seeds; rows that ' +
      'disagree mean this build and the server no longer agree about what a board is, and naming a ' +
      'dispatcher from the first row would be a guess about the rest.'
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

/* -------------------------------------------------------------------------- *
 * Taking a row on
 * -------------------------------------------------------------------------- */

/**
 * The label on the control #93 asked to call *"Beat this score"*, and it does not.
 *
 * #93 § 1 asks for *"a button that pre-loads the exact building, seed, and shift length"* under that
 * name. The first half is built and this is it. The name is refused, and the reason is arithmetic
 * rather than taste: the board fixes the configuration and the row carries the seed, so a press that
 * loads both and runs it reproduces the row's four figures **exactly** — the same seed brings the
 * same passengers, which is invariant 5 and the reason the server can verify a score at all. A
 * control labelled *Beat this score* would therefore promise, in the one place a player is most
 * motivated to believe it, something its own press cannot do.
 *
 * What the press is worth is what it *makes available*: the row's own passengers, so anything the
 * player changes afterwards is answered under common random numbers rather than against a different
 * crowd. That is this project's own comparison discipline, reachable from a leaderboard row.
 */
export const BEAT_LABEL = 'Run this row’s configuration';

/**
 * The line under {@link BEAT_LABEL} for one row.
 *
 * Names the seed, because the seed is the only thing that differs between rows on a board and it is
 * what makes the row checkable (invariant 5). Says the reproduction outright rather than letting a
 * player discover it by pressing — a surprise that costs a run is a surprise the screen could have
 * saved.
 */
export function beatDetailOf(run: RunSubmission): string {
  return (
    `Loads this board’s configuration with this row’s own seed — ${run.seed} — and runs it. ` +
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
 * confusion is real and has a real cause: on a configuration board the dispatcher is in the key, so
 * the only axis a player has left is **which seed they post**, and nothing on the screen said so.
 * A leaderboard that invites competition and leaves seed luck as the only lever is the sentence
 * `docs/10` § 5.5 is about, arriving by omission.
 *
 * ## It deliberately does not restate the premise it stands on
 *
 * `screens.ts#LEADERBOARD_NOTE` already says *"a different dispatcher is a different board rather
 * than a better score"*, and it is printed above this. Saying it twice on one screen would make it
 * read as the thing being argued rather than the thing being built on — the objection
 * `screens.ts#COMMISSIONING_BRIEF` records against restating the capital rule. This adds only the
 * consequence, which nothing said.
 *
 * It is emitted only where {@link boardRevealOf} is, and for that function's reason: *every row here
 * is the same dispatcher* is a claim about the page, and a page whose rows disagree is one where it
 * is false.
 */
export const BEATING_NOTE =
  'So what is left to differ between the rows above is the seed: every one of them is that same ' +
  'dispatcher answering a different set of passengers, which is luck rather than skill. This ' +
  'week’s challenge is the surface built for the other question — it fixes the seed set for ' +
  'everybody and leaves the dispatcher free.';
