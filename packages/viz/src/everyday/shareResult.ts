/**
 * **The result artefact — what a player may show somebody else about a finished run.**
 *
 * `docs/38` § 2.1 ships a daily shared seed: *"Today's scenario. One seed, the same for everybody,
 * once a day."* That is the cheapest social shape a game of this kind has, and until this module
 * the player-facing product could not use it: every clipboard write and every picture export in
 * the tree is on the Engineer surface (`dev/main.ts#copyArtefact`, and the report's own PNG), and
 * a search for `clipboard` across `everyday/` returned nothing at all. A player who ran a day had
 * no way to show anybody what happened to the people in it.
 *
 * It is also the only social mechanism that works **below** the twenty-player floor.
 * `packages/server`'s `distribution.ts#MIN_LADDER_N` withholds every quantile ladder until twenty
 * runs are on a board, and that floor is right and is not relaxed here. A board with four rows on
 * it says almost nothing; one player handing another a seed does not need a population at all.
 *
 * ## What this artefact does **not** say, and the measurement that decided it
 *
 * It does not say *everybody is playing this today*, and that was going to be its closing line.
 *
 * **This paragraph described the tree it was written on, and that tree changed the same day.** It
 * is kept as the dated record rather than rewritten, because only the before and the after together
 * say what moved — and what moved is the reason this control's closing line is what it is.
 *
 * **As written, 2026-09-19:** the seed a run carried was not a shared daily one. `dev/main.ts`'s
 * `boot` opened with `initialState(resources, randomSeed())` and `randomSeed` is
 * `crypto.getRandomValues`, so the session seed was fresh on every load;
 * `dev/state.ts#withFirstSession` drew the opening contract from it through
 * `shift/firstSession.ts#firstSessionContractFor`, so six cold loads gave six different towers. Two
 * player surfaces stated the opposite as fact — `everyday/doorView.ts`'s stepper rule and
 * `everyday/today.ts`'s seed line. An artefact whose closing line invited a recipient to *play the
 * same day* would have been a second false claim built on the first.
 *
 * **The daily seed was never missing, and that was the half worth acting on.**
 * `packages/server`'s `leaderboard/boardKey.ts#dailySeedFor` is the date's own digits,
 * `dailyFixtureAt` returns `{ date, seed, config }`, `GET /api/boards` already served it, and
 * `menu/client.ts` already validated it field by field onto `BoardsPage.today`. Then
 * `everyday/host.ts#dailyBoardOf` read `today.date` to build the board key and **dropped
 * `today.seed` and `today.config`**, which nothing in `packages/viz/` read. A value authored,
 * served, schema-checked on the client, carried into a typed structure, and consulted by nothing is
 * this repository's signature defect — the one `CLAUDE.md` has recorded eleven times in code — and
 * it was one field access from being closed.
 *
 * **Closed by [§ D729](../../../../DECISIONS.md) to [§ D733](../../../../DECISIONS.md), later the
 * same day.** The day's crowd is derived from the date, the two surfaces above are conditional and
 * true, and `TodayRecord.crowdIsToday` is the live writer this paragraph said did not exist. So the
 * arm it named as owed — *this run is today's crowd* — now has one, and adding it here is ordinary
 * work rather than the twelfth dead seam.
 *
 * **What has not changed is the closing line.** It states the spoiler rule and stops. The artefact
 * still makes no *everybody is playing this today* claim, because the run a player shares is the
 * run they played and need not be the day's; the condition is drawable now, and drawing it is a
 * decision about this control rather than a fact the tree hands over. `today.seed` also remains
 * unread — it is the **authoritative** copy, and `boardKey.ts` says in terms that *which day is it*
 * has one answer and it is the server's, so the one thing that copy is still owed is telling a
 * player whose clock disagrees.
 *
 * ## What may leave, and what may not — [§ D685](../../../../DECISIONS.md)
 *
 * **The artefact carries outcomes and the run's identity. It carries no input.**
 *
 * - An **outcome** is what happened to the people: the wait band strip, the counts, and the mean or
 *   the refusal that stands where it would be. An outcome is a fact about *the run the sharer
 *   played*, not about what the building needs, so publishing one hands over no answer — a
 *   different configuration on the same seed produces a different strip.
 * - An **input** is anything the player chose or bought — the dispatcher, its weights and rules,
 *   any lever, any equipment setting, any fabric change, any modifier — and anything the product
 *   *derived about* those choices: the report's lede, its verdict, its diagnosis, its levers card
 *   and its goal readings. None of it travels. The recipient is meant to play the seed, and a
 *   message naming the dispatcher that worked is the answer with the puzzle attached.
 * - **Identity** is the two things a recipient needs to meet the same crowd: the building and the
 *   seed.
 *
 * That rule is mechanised rather than promised, in two places and neither is a comment.
 * {@link ShareRunFacts} **has no field an input could travel in**, so {@link shareArtefactOf}
 * could not print one if it wanted to; and {@link shareFactsOf} is the only projection from a
 * recording, so the narrowing happens once. `shareResult.test.ts` renders a recording whose
 * dispatcher is named and requires the name and the id to be absent from every line — the guard
 * that would fail if somebody widened the facts type later.
 *
 * ## Nothing here reaches the network, and that is the point rather than an implementation note
 *
 * `docs/26` § 10 non-goal 2 forbids a third-party tracker outright and non-goal 8 makes § 7's
 * table the whole allowlist; `docs/38` § 2.4 puts no telemetry supporting a purchase or a
 * conversion on the play side. A share control is exactly where such a thing would arrive, so:
 * this module imports nothing from `telemetry/`, makes no request of any kind, and the artefact
 * **carries no URL**. The last one is a decision rather than an oversight and it is the one worth
 * writing down — there is no address the bundle could honestly name (the deployment's host is a
 * repository variable, not a constant in the source), a fabricated one is worse than none, and a
 * link is precisely where a campaign parameter would later be bolted on. What travels is text a
 * player pastes wherever they choose, which is `docs/26` § 10 non-goal 6's own distinction: the
 * player is publishing their own words, the product is not sharing anything.
 *
 * ## Every figure is somebody else's answer
 *
 * The mean is `shift/report.ts#averageWaitFigure`'s, whole — its value, its count and its
 * suppression ground — so the artefact and the Day report cannot disagree about one run. That
 * matters more here than anywhere: the sheet's gate is `meanIsPublishable`, which is
 * `awtIsValid && !saturated` and not `awtIsValid` alone, and a share path that re-derived the
 * gate would publish a mean the sheet withholds on exactly the runs worth sharing. The refusal's
 * wording is `mode/disclosure.ts#suppressionBannerFor` — the Casual one-line projection of the
 * single per-ground table — rather than the run's own statistics prose, which is Engineer
 * register and would arrive on a player surface as internal notation. The bands are
 * `live/bands.ts#WAIT_BANDS` and their classification is `bandIndexOf`.
 *
 * The one quantity this module folds itself is **which slice of the shift a leg's wait belongs
 * to**, because no shipped function answers that: `waitBandsAt` bands a whole run *up to* an
 * instant, which is non-decreasing and therefore flat after the first bad minute. The wait itself
 * is still not this module's opinion — it ends at `boardedAt ?? refusedAt`, censored at the run's
 * end, which is `live/bands.ts`' own rule and `live/observations.ts`' — and the test asserts that
 * the strip's tally agrees with `waitBandsAt(recording, endedAt, 'whole-run')` over the whole run,
 * so the duplication is checked rather than trusted.
 *
 * ## Nothing here is a score
 *
 * `docs/22` § 5 non-goal 1 forbids a scalar score, grade or rating over a run, and this is the
 * most tempting surface in the product to put one on: a share grid wants a number at the top.
 * There is none, and none is derivable from what leaves — there is no total, no percentage of
 * anything, no streak, no rank and no letter. The strip is twelve observations in a row.
 */

import { bandIndexOf, WAIT_BANDS } from '../live/bands.js';
import { suppressionBannerFor } from '../mode/disclosure.js';
import { averageWaitFigure } from '../shift/report.js';
import type { VizRecording } from '../contract/types.js';

import { countFigure } from './figures.js';

/**
 * How many slices the shift is cut into.
 *
 * Fixed rather than derived from the run's length, so the strip is the same width whatever was
 * played — which is the whole of what makes a shared grid recognisable at a glance, and is the one
 * thing the comparators in this shape agree on. The cost is that a slice's duration varies between
 * runs, so {@link SHARE_COPY.stripCaption} says *twelve equal slices* and never a number of
 * minutes: a slice length rounded to the nearest minute would be a figure the run did not produce.
 */
export const SHARE_SLICES = 12;

/**
 * The glyph for a slice nobody called in. Never a band's face — see {@link ShareSlice.band}.
 *
 * Deliberately not one of the four, and deliberately not the separator this artefact's own legend
 * uses: a quiet slice drawn as the calmest band would report a good five minutes about a five
 * minutes that did not happen, and a quiet face that is also the separator reads as a stutter in
 * the legend rather than as a rung of it.
 */
export const SHARE_QUIET_FACE = '\u25CB';

/**
 * The artefact's own words. Everything else in it is a figure or a face.
 *
 * Frozen and iterated by the honesty sweep, on `BOARD_SCREEN_COPY`'s precedent.
 */
export const SHARE_COPY = Object.freeze({
  /*
   * The product's name, as a literal, for the reason `index.html` carries one: nothing derives a
   * brand, and the four places that say it say it the same way. A shared message that does not name
   * the game is a shared message nobody can act on.
   */
  brand: 'Elevator Sim',
  /* The control, on the daily tab. */
  eyebrow: 'SHOW SOMEBODY',
  button: 'Copy the result',
  /*
   * The confirmation, and it is a **line** rather than a face on the button.
   *
   * It was the button's label for one commit, restored after 1 400 ms by a `setTimeout` — and
   * `boundaries.test.ts`'s *schedules no timers anywhere, so tests never wait* is right to refuse
   * that: a timer in a screen module is what makes a suite wait, and the rule confines them to the
   * dev entry point where the Engineer copy control lives. Removing it rather than widening the
   * exemption made the control better in two ways, which is the argument for reading a refusal
   * before arguing with it. The button never stops saying what pressing it does, so the question
   * *what would happen if I pressed that again* always has the same answer; and a `role="status"`
   * line is **announced**, where a silently swapped button label is not.
   */
  copied: 'Copied — the result is on your clipboard.',
  /*
   * The standing note under the button, before any press. Three claims, because a player who did
   * not know them would read the press as something else: what goes (observations and the seed),
   * what does not (how they did it), and that nothing is sent anywhere.
   *
   * **It said a fourth thing and it was false** — *"so whoever you send it to can play the same
   * crowd"* — which is the claim this module's docstring measures and the artefact's own closing
   * line was corrected to drop. A sentence taken off the artefact and left on the control beside
   * it is the same false claim wearing a different hat, and it is worse here: this one is read
   * **before** the press, by the player deciding whether the button does what they want. The
   * general rule the miss is worth stating for: when a claim comes off one surface it comes off
   * every surface in the same commit, and *the copy table* is a surface.
   */
  note:
    'Copies what happened to the people, the building and the seed — as text, to your clipboard. ' +
    'How you ran it does not travel. Nothing is sent anywhere by this button.',
  /*
   * The clipboard refused. § D227 both ways: a control that cannot write must say so, and it must
   * say what to do instead. A browser denies the clipboard for reasons the player did not cause
   * and cannot see, so the line does not apologise and does not blame — it points at the text,
   * which the screen puts on the page on the same press.
   */
  refused:
    'This browser would not let the page write to the clipboard. The result is below instead — ' +
    'select it and copy it by hand.',
  /** No run has landed on this device yet, so there is nothing to copy. Said, never greyed silently. */
  noRun:
    'Nothing to copy yet. Play a day and this copies what happened in it.',
  /* The strip's caption and legend. */
  stripCaption: 'the shift in twelve equal slices · the worst wait anybody had in each',
  quietLegend: 'nobody called',
  /*
   * The censoring note. A leg that never boarded has a wait the run cut short, so its band is the
   * least it could have been and the strip says which slices that is true of. Omitted at zero.
   */
  censoredNote: 'slices end on somebody who never boarded — their wait is at least the band shown',
  /*
   * The closing line, and it is addressed to the recipient rather than to the sharer. It states the
   * spoiler rule on the face of the artefact, because a recipient who does not know the dispatcher
   * was withheld will assume it was simply not mentioned and go looking for it.
   *
   * **It claims nothing about anybody else's day**, for the reason the module docstring measures:
   * the seed a run carries on this tree is a fresh one per load, so *the same crowd as everybody
   * else* would be false, and *play the same day* would be an invitation to something the player
   * surface cannot hand over. What is true of every run is what it says — this is one run, and
   * the way it was run is not in the message.
   */
  promise: 'One run, on this building and this seed. How it was run is not in this message.',
});

/** What one line of the artefact is, for a renderer and for the sweep. */
export type ShareLineRole = 'label' | 'observation' | 'estimate' | 'suppressed' | 'prose';

export interface ShareLine {
  /** Stable, so a seed and a violation name the same thing. */
  readonly field: string;
  readonly role: ShareLineRole;
  readonly text: string;
  /**
   * The sample this line's figure was taken over, where it has one — R13's `n`, structured, so a
   * consumer that carries the line somewhere else can still find it. `undefined` on a line with no
   * figure in it, which is not the same fact as a count of nothing.
   */
  readonly count?: number | undefined;
}

/** One slice of the shift. */
export interface ShareSlice {
  /**
   * Index into `live/bands.ts#WAIT_BANDS` for the worst wait realised by anybody who called in this
   * slice, or `undefined` when nobody called. `undefined` draws {@link SHARE_QUIET_FACE} and never
   * the calmest band's face: a slice with nobody in it did not go well, it did not happen.
   */
  readonly band: number | undefined;
  /** Whether the wait that set {@link band} belongs to a leg that never boarded — so it is a floor. */
  readonly censored: boolean;
  /** Calls that began in this slice. */
  readonly calls: number;
}

/** The mean, as the Day report decided it — never re-gated here. */
export type ShareMean =
  | { readonly kind: 'published'; readonly value: string; readonly count: number }
  | { readonly kind: 'refused'; readonly line: string };

/**
 * Everything the artefact is allowed to know.
 *
 * **The absence is the specification.** There is no dispatcher, no profile, no weight, no rule, no
 * lever, no modifier and no verdict on this type, and there is no field one could be smuggled
 * through: every member is either the run's identity or a count of what happened to people. A
 * change that adds one is the change this module exists to make visible.
 */
export interface ShareRunFacts {
  readonly buildingName: string;
  /** The master seed as the recording spells it — a decimal string, invariant 5. */
  readonly seed: string;
  readonly slices: readonly ShareSlice[];
  /** Calls the strip was folded over — the strip's own `n`. */
  readonly stripCalls: number;
  /**
   * Journeys that got where they were going, and journeys that arrived — the run's own two counts,
   * **on the same cohort**.
   *
   * There is no third number beside them and that is deliberate rather than an omission.
   * `core`'s conservation audit balances `delivered + undelivered + turned away` against
   * `generated`, so *the ones who did not make it* is two buckets rather than one, and
   * `unservedCount` — the obvious candidate — is folded over the **reporting window** where these
   * two are folded over the run. A line pairing them would be two cohorts in one sentence, which
   * is the accounting complaint `docs/19` raised and `live/bands.ts`' fourth band records. The
   * subtraction a reader can do for themselves is exact; a number this module wrote would not be.
   */
  readonly delivered: number;
  readonly generated: number;
  readonly mean: ShareMean;
}

export interface ShareArtefact {
  readonly lines: readonly ShareLine[];
  /** The lines joined, which is what goes on the clipboard. */
  readonly text: string;
}

/**
 * The wait a leg realised by the time the run stopped, and whether the run cut it short.
 *
 * `boardedAt ?? refusedAt` is the ending rule `live/bands.ts#realisedWaitsBy` and
 * `live/observations.ts` both apply, and this is that rule with the run's end as the instant. It is
 * spelled here because neither of those is exported and neither answers the per-slice question;
 * `shareResult.test.ts` asserts the resulting tally against `waitBandsAt(recording, endedAt,
 * 'whole-run')`, so the two cannot drift without something going red.
 */
function realisedWait(
  leg: VizRecording['legs'][number],
  endedAt: number,
): { readonly waitedS: number; readonly censored: boolean } {
  const resolvedAt = leg.boardedAt ?? leg.refusedAt;
  const resolved = resolvedAt !== undefined && resolvedAt <= endedAt;
  return {
    waitedS: Math.max(0, (resolved ? (resolvedAt as number) : endedAt) - leg.arrivedAt),
    censored: !resolved,
  };
}

/**
 * The shift cut into {@link SHARE_SLICES}, each slice holding the worst wait anybody who called in
 * it realised.
 *
 * A leg belongs to the slice its **call** began in, which is the question a reader of a shared
 * strip is asking — *if I had turned up at ten past nine, how bad was it?* — and is the only
 * membership key that does not move when the dispatcher does.
 *
 * The window is the run's own reporting window, so the strip spans exactly what every figure beside
 * it was computed over. A window of no length yields no slices rather than twelve empty ones.
 */
export function shareSlicesOf(recording: VizRecording): readonly ShareSlice[] {
  const { startS, endS } = recording.summary.reportWindow;
  const span = endS - startS;
  if (!(span > 0)) return [];
  const width = span / SHARE_SLICES;

  const worst: (number | undefined)[] = Array.from({ length: SHARE_SLICES }, () => undefined);
  const censored: boolean[] = Array.from({ length: SHARE_SLICES }, () => false);
  const calls: number[] = Array.from({ length: SHARE_SLICES }, () => 0);

  for (const leg of recording.legs) {
    if (leg.arrivedAt < startS || leg.arrivedAt >= endS) continue;
    // The last instant of the window belongs to the last slice rather than to a thirteenth.
    const index = Math.min(SHARE_SLICES - 1, Math.floor((leg.arrivedAt - startS) / width));
    const { waitedS, censored: cut } = realisedWait(leg, recording.endedAt);
    calls[index] = (calls[index] ?? 0) + 1;
    const previous = worst[index];
    // Strict `>`, so the slice's band belongs to the **first** leg to reach the maximum in record
    // order — `waitBandsAt`'s own tie rule, kept, so the flag does not depend on iteration order.
    if (previous === undefined || waitedS > previous) {
      worst[index] = waitedS;
      censored[index] = cut;
    }
  }

  return worst.map((waitedS, index) => ({
    band: waitedS === undefined ? undefined : bandIndexOf(waitedS),
    censored: censored[index] ?? false,
    calls: calls[index] ?? 0,
  }));
}

/**
 * The only projection from a run to what may leave it — the spoiler rule, as code.
 *
 * Reads `summary`, `legs`, `buildingName` and `seed`, and nothing else. `dispatcherProfileId` is on
 * the recording, one property access away, and is deliberately not read.
 */
export function shareFactsOf(recording: VizRecording): ShareRunFacts {
  const { summary } = recording;
  const slices = shareSlicesOf(recording);
  const figure = averageWaitFigure(summary);
  return {
    buildingName: recording.buildingName,
    seed: recording.seed,
    slices,
    stripCalls: slices.reduce((total, slice) => total + slice.calls, 0),
    delivered: summary.delivered,
    generated: summary.generated,
    mean:
      figure.count === undefined
        ? { kind: 'refused', line: suppressionBannerFor(figure.suppressionGround) }
        : { kind: 'published', value: figure.value, count: figure.count },
  };
}

/** The strip, as faces. */
function stripOf(slices: readonly ShareSlice[]): string {
  return slices
    .map((slice) => (slice.band === undefined ? SHARE_QUIET_FACE : (WAIT_BANDS[slice.band]?.face ?? SHARE_QUIET_FACE)))
    .join('');
}

/** The legend, derived from the bands rather than written beside them. */
function legendOf(): string {
  const rungs = WAIT_BANDS.map((band) => `${band.face} ${band.legendLabel}`);
  return [...rungs, `${SHARE_QUIET_FACE} ${SHARE_COPY.quietLegend}`].join(' · ');
}

/**
 * The artefact, from the facts and nothing else.
 *
 * Pure, so *this text is this run* is testable without a clipboard — which is
 * `dev/main.ts#provenanceLineOf`'s reason for being pure, one artefact over.
 */
export function shareArtefactOf(facts: ShareRunFacts): ShareArtefact {
  const lines: ShareLine[] = [
    { field: 'title', role: 'label', text: `${SHARE_COPY.brand} · ${facts.buildingName}` },
    { field: 'seed', role: 'label', text: `seed ${facts.seed}` },
  ];

  if (facts.slices.length > 0) {
    lines.push({ field: 'strip', role: 'label', text: stripOf(facts.slices) });
    lines.push({
      field: 'strip.caption',
      role: 'observation',
      text: `${SHARE_COPY.stripCaption} · ${countFigure(facts.stripCalls)} calls`,
      count: facts.stripCalls,
    });
    lines.push({ field: 'strip.legend', role: 'label', text: legendOf() });
    const cut = facts.slices.filter((slice) => slice.censored).length;
    if (cut > 0) {
      lines.push({
        field: 'strip.censored',
        role: 'observation',
        text: `${countFigure(cut)} ${SHARE_COPY.censoredNote}`,
        count: cut,
      });
    }
  }

  lines.push({
    field: 'delivered',
    role: 'observation',
    /*
     * Two counts and nothing else — never a percentage and never a share, because a share of a run
     * is one number standing for a day, which is the shape `docs/22` § 5 non-goal 1 refuses. The
     * denominator is in the sentence rather than in a footnote, which is R13 said the short way.
     */
    text: `${countFigure(facts.delivered)} of ${countFigure(facts.generated)} delivered`,
    count: facts.generated,
  });

  lines.push(
    facts.mean.kind === 'published'
      ? {
          field: 'mean',
          role: 'estimate',
          text: `average wait ${facts.mean.value} over ${countFigure(facts.mean.count)} waits`,
          count: facts.mean.count,
        }
      : {
          /*
           * A refusal, and it is neither softened nor omitted — `docs/22` § 5 non-goal 3. It carries
           * no count, for `averageWaitFigure`'s stated reason: there is no mean on this branch, so
           * there is no sample one was taken over, and a denominator beside a refusal reads as a
           * figure with a caveat.
           */
          field: 'mean',
          role: 'suppressed',
          text: facts.mean.line,
        },
  );

  lines.push({ field: 'promise', role: 'prose', text: SHARE_COPY.promise });

  return { lines, text: lines.map((line) => line.text).join('\n') };
}
