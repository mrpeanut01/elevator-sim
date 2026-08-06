/**
 * The statistics vocabulary, **owned once** — issue #22, and the shape its decision comment names.
 *
 * ## Why this is one module and not six explanations
 *
 * The obvious way to close #22 is to let each surface explain its own words where they appear:
 * `batch/report.ts` says what *paired difference* means beside the paired difference,
 * `campaign/judge.ts` says it again beside the stage verdict, and the Parameters tab says it a
 * third time. That is rejected, and the reason is not tidiness — it is that this repository
 * already carries the defect twice and has measured what it costs. The band palette was held as
 * hex in four `live/` modules; `live/decisions.ts#TERM_PHRASES` duplicates by hand the
 * `terms[].measures` and `serves` prose that `data/dispatcher-profiles.json` already authors. In
 * both, nothing was wrong on the day it was written and nothing kept the copies equal afterwards.
 *
 * So a term is defined **here, once**, and every surface that uses the word attaches *this*
 * object. Not a copy of its text — the object, by reference, the way `honesty/surfaces.ts` seeds
 * `GOAL_BLOCKER` so that *"the string the sweep checks and the string a player reads are the same
 * object"*. `mode/glossary.test.ts` asserts that identity rather than trusting it, because equal
 * strings are exactly what two copies look like on the day they are written.
 *
 * ## The two rules inherited from [§ D240](../../../../DECISIONS.md), which built this pattern
 *
 * 1. **Explain the term beside the run's own words, never in place of them.** Nothing here
 *    rewrites a sentence a surface already emits. {@link GlossaryTerm.term} is the product's own
 *    word, quoted; {@link GlossaryTerm.plain} is additive, and a surface's `sentence` and `note`
 *    fields come back byte-identical to what they were before this module existed. The test
 *    asserts both halves: no `plain` text appears inside any sentence, and every `term` is a
 *    string the shipped source really prints.
 * 2. **The wording may never become a ranking.** *"A confidence interval containing zero means
 *    this run cannot tell them apart"* is plain language. *"Dispatcher A is better"* is a
 *    different claim, and no entry below may become one however much clearer it reads. Asserted
 *    over every `plain` sentence with `mode/disclosure.test.ts`'s own banned pattern.
 *
 * Two more the entries obey, from CLAUDE.md rather than from § D240:
 *
 * - **Energy is an axis, never a score** ([§ D106](../../../../DECISIONS.md)). {@link ENERGY_ID}'s
 *   entry says what drive work is and refuses to imply a grade, for the measured reason: the
 *   weakest shipped dispatcher sits on the Pareto front at six of eight matrix cells because it
 *   carries fewer people.
 * - **A suppressed mean is explained by why it is suppressed**, never replaced by a blank or by a
 *   number. `suppressed-mean` below explains the refusal; it does not stand in for one, and
 *   `mode/disclosure.ts`'s {@link SUPPRESSION_LEAD} is still what a refusal itself leads with.
 *
 * ## Why the entries live in `mode/`
 *
 * Because `docs/12` § 2.2 already put the vocabulary here — *"`mode/disclosure.ts` already holds
 * the vocabulary that has to move"* — and § D240 built the first half of it against that sentence.
 * `disclosure.ts` explains a **figure** in the Casual view of one run; this explains a **word**,
 * on any surface, in either view. They are the same layer at two granularities and they share a
 * directory rather than a table: `CASUAL_LEAD_BY_FIGURE` is deliberately unexported and keyed on
 * figure ids, and nothing here is keyed on a figure at all.
 *
 * ## How a surface knows which terms it used
 *
 * It does not declare them. {@link glossaryFor} reads the surface's **own emitted text** and
 * returns the terms that text actually contains. A hand-written list per surface would be the
 * § D152 defect one layer down — a list that looks derived only because today's sentences happen
 * to fit it — and it would go stale silently the first time a sentence was reworded. Derived, a
 * reworded sentence changes which terms attach, and a term nothing says any more is caught by the
 * reachability assertion in the test rather than living on as a ghost.
 */

/** One word a player is shown, and what it means. */
export interface GlossaryTerm {
  /** Stable id. Not shown; it is what a consumer keys off and what a violation names. */
  readonly id: string;
  /**
   * The product's own word for this, quoted rather than invented.
   *
   * Load-bearing, and it is what stops rule 2 having a hole in it: the ranking sweep runs over
   * {@link plain} and not over this field, because this field is not this module's wording — it
   * is a surface's. What keeps it honest is the reachability assertion, which requires every
   * `term` to be a string the shipped source really prints, so nothing can be smuggled in here
   * that the product does not already say.
   */
  readonly term: string;
  /**
   * The phrases whose presence in a surface's own text means this term was used.
   *
   * Matched at a leading word boundary and **not** at a trailing one, so `replication` finds
   * *replications* and `dimension` finds *dimensions* without a second entry for each plural. The
   * consequence is that one phrase must never be a prefix of another — otherwise a string would
   * attach two terms for one word — and the test asserts exactly that over the whole table.
   */
  readonly appearsAs: readonly string[];
  /**
   * The plain-language explanation. **Leads, never replaces.**
   *
   * No entry restates a figure: a plain retelling of `13.1 s` would be a second copy of a figure,
   * which is a second figure — § D240's rule 1, and the reason nothing below carries a number out
   * of a run.
   */
  readonly plain: string;
}

/**
 * Every term, defined exactly once.
 *
 * The list is derived from the surfaces rather than from the issue: #22 names six words, written
 * by somebody reading the screen, and reading the source finds the rest — *trace key*, *arm*,
 * *holdout*, *complete-case rule*, the seven kebab-case goal ids the Compare and Lab tabs print
 * with no definition anywhere, and the demand rate the report writes out longhand.
 *
 * Frozen, and the array is frozen too: a consumer holds these objects by reference and a mutable
 * entry would let one surface's edit reach every other surface's rendering of the same word,
 * which is the drift this module exists to prevent, arriving through the fix for it.
 */
export const GLOSSARY_TERMS: readonly GlossaryTerm[] = Object.freeze([
  /* ---------------------------------------------------------------- *
   * How a comparison is made
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'replication',
    term: 'replication',
    appearsAs: ['replication'],
    plain:
      'One whole run of the building, from an empty lobby to the end of the clock. Each one uses ' +
      'a different set of passengers, so no single run is the answer — the project asks for 50 to ' +
      '200 of them before it will read anything off the spread, because ten produced a 12 % error ' +
      'against the settled figure in the study this simulator is checked against.',
  }),
  Object.freeze({
    id: 'arm',
    term: 'arm',
    appearsAs: ['arm'],
    plain:
      'One of the settings being compared. A batch runs every arm over the same set of runs, so ' +
      'the arms differ in the setting and in nothing else.',
  }),
  Object.freeze({
    id: 'common-random-numbers',
    term: 'common random numbers',
    appearsAs: ['common random numbers'],
    plain:
      'Every setting is given the same passengers — the same people arriving at the same second, ' +
      'going to the same floors, carrying the same weight. It is what lets the two be compared ' +
      'run for run instead of crowd against crowd, and it is worth five to twenty times the ' +
      'number of runs.',
  }),
  Object.freeze({
    id: 'trace-key',
    term: 'trace key',
    appearsAs: ['trace key'],
    plain:
      'Everything the passengers are a function of apart from the seed — the building, the demand ' +
      'and the length of the run. Two runs sharing a trace key and a seed have the same people in ' +
      'them, which is what makes the seed enough to replay a batch somewhere else.',
  }),
  Object.freeze({
    id: 'seed',
    term: 'seed',
    appearsAs: ['seed'],
    plain:
      'The number the passengers are generated from. The same seed and the same building give the ' +
      'same people in the same order every time, so any run here can be replayed exactly.',
  }),
  Object.freeze({
    id: 'holdout',
    term: 'holdout set',
    appearsAs: ['holdout'],
    plain:
      'A second set of seeds, with no run in common with the one being tuned on. A setting fitted ' +
      'to one set of passengers can be fitted to their quirks instead of to the building, and the ' +
      'holdout is what a gain has to survive before it counts as one.',
  }),

  /* ---------------------------------------------------------------- *
   * The arithmetic
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'paired-difference',
    term: 'paired difference',
    appearsAs: ['paired difference', 'paired-t', 'paired runs'],
    plain:
      'The two settings are subtracted run by run, on runs that saw the same people, and it is ' +
      'the list of differences that gets measured. Comparing the two averages instead would throw ' +
      'away the pairing and need many times as many runs to see the same gap.',
  }),
  Object.freeze({
    id: 'confidence-interval',
    term: '95 % interval',
    appearsAs: [
      '% interval',
      'interval on the difference',
      'interval includes zero',
      'interval that excludes zero',
      'included zero',
      'containing zero',
    ],
    plain:
      'A range the difference is quoted as, rather than a single figure — because a run of a lift ' +
      'peak lands somewhere in a spread and one number would hide that. When the range has zero ' +
      'inside it, this batch cannot tell the two settings apart; that is a statement about the ' +
      'batch and not a statement that the two are the same.',
  }),
  Object.freeze({
    id: 'student-t',
    term: 'Student-t',
    appearsAs: ['student-t'],
    plain:
      'The method used to turn a handful of runs into that range. It widens the range when there ' +
      'are few runs to go on, which is why the same gap reads as a wider range at 20 runs than at ' +
      '200.',
  }),
  Object.freeze({
    id: 'degrees-of-freedom',
    term: 'degrees of freedom',
    appearsAs: ['degrees of freedom'],
    plain:
      'How much independent information the range was computed from — one less than the number of ' +
      'paired runs. It is printed so the arithmetic can be checked, and it moves with the run ' +
      'count rather than with anything about the building.',
  }),

  /* ---------------------------------------------------------------- *
   * When a number is refused
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'saturated-run',
    term: 'saturated',
    appearsAs: ['saturated'],
    plain:
      'The queues were still growing when the clock stopped, so the building never settled. An ' +
      'average wait describes a system that reached a steady state; this one did not reach one, ' +
      'and the figure would go on rising with the length of the run.',
  }),
  Object.freeze({
    id: 'suppressed-mean',
    term: 'refuses to quote a mean',
    appearsAs: ['refuses to quote a mean', 'behind an average wait'],
    plain:
      'The run declines to publish an average, and the reason is printed in its place — never a ' +
      'blank and never a zero. There are five grounds: the queues never settled, nobody finished ' +
      'waiting inside the measured stretch, too many riders were still waiting at the end, too ' +
      'many gave up and left, or somebody waited far longer than an average could admit to.',
  }),
  Object.freeze({
    id: 'abandonment-horizon',
    term: 'abandonment horizon',
    appearsAs: ['abandonment horizon'],
    plain:
      'The point at which this simulator counts a rider as having given up rather than gone on ' +
      'waiting. Riders leaving pulls the longest waits out of the sample, so an average that ' +
      'ignored them would flatter the run — which is why the count is published next to the wait ' +
      'and never folded into it.',
  }),
  Object.freeze({
    id: 'complete-case',
    term: 'complete-case rule',
    appearsAs: ['complete-case rule'],
    plain:
      'An average is reported only when every paired run stands behind one; the runs that held ' +
      'are not averaged on their own. The ones that drop out are the crowds the building coped ' +
      'with least, the two settings lose them at different rates, and averaging what is left ' +
      'would quietly answer an easier question. More runs make this more common rather than less ' +
      '— the lever is the demand.',
  }),

  /* ---------------------------------------------------------------- *
   * What is being measured
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'wt95',
    term: '95th-percentile wait',
    appearsAs: ['95th-percentile wait'],
    plain:
      'The wait that all but the unluckiest one ride in twenty came in under. It is here because ' +
      'an average hides the bad end, and the bad end is what people complain about.',
  }),
  Object.freeze({
    id: 'door-to-door',
    term: 'door-to-door time',
    appearsAs: ['door-to-door time'],
    plain:
      'The whole journey, from pressing the button to stepping out at the destination, including ' +
      'any change of lifts. It counts something different from the waits above, so the two are ' +
      'not comparable with each other.',
  }),
  Object.freeze({
    id: 'long-wait-threshold',
    term: 'long-wait threshold',
    appearsAs: ['long-wait threshold'],
    plain:
      'The line this building draws between a wait people accept and one they notice, usually a ' +
      'minute. The row counts the share of rides that crossed it rather than how far past it they ' +
      'went.',
  }),
  Object.freeze({
    id: 'energy-axis',
    term: 'drive work (proxy)',
    appearsAs: ['drive work'],
    plain:
      'An estimate of the work the motors did moving the cars, in kilojoules — worked out from ' +
      'the journeys rather than read off a meter. It is shown beside the waits and never folded ' +
      'into them: a setting that drives less has often carried fewer people, so a small figure ' +
      'here is a measurement of the driving and not an achievement.',
  }),
  Object.freeze({
    id: 'demand-rate',
    term: 'of population arriving per 5 minutes',
    appearsAs: ['of population arriving per 5 minutes'],
    plain:
      'How busy the building is, as the share of everyone in it who calls a lift in five minutes. ' +
      'It is the standard way lift traffic is quoted, and a couple of percentage points is the ' +
      'difference between a quiet morning and a queue.',
  }),
  Object.freeze({
    id: 'pareto-front',
    term: 'a move along the front',
    appearsAs: ['along the front', 'pareto front'],
    plain:
      'A change that gained on one measure and gave up ground on another. There is no single ' +
      'answer to which of those is the trade to make — it is the operator’s call — so the ' +
      'product reports both movements and declines to fold them into one verdict.',
  }),

  /* ---------------------------------------------------------------- *
   * Goals
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'pass-rate',
    term: 'pass rate',
    appearsAs: ['pass rate'],
    plain:
      'How many runs out of the batch met the goal. A goal that passes every run or fails every ' +
      'run is a fact about the building rather than something a setting can move, and the brief ' +
      'says so instead of scoring it.',
  }),
  Object.freeze({
    id: 'goal-answer-the-demand',
    term: 'answer-the-demand',
    appearsAs: ['answer-the-demand'],
    plain:
      'The lifts got at least as many people away in five minutes as turned up in them. It is the ' +
      'pair of bars on the demand row: when the second one is shorter, the building is losing ' +
      'ground.',
  }),
  Object.freeze({
    id: 'goal-no-divergence',
    term: 'no-divergence',
    appearsAs: ['no-divergence'],
    plain:
      'The queues settled instead of growing without bound. It is the same check that decides ' +
      'whether the run may publish an average wait at all.',
  }),
  Object.freeze({
    id: 'goal-deliver-everyone',
    term: 'deliver-everyone',
    appearsAs: ['deliver-everyone'],
    plain: 'Nobody was still waiting or still riding when the clock stopped.',
  }),
  Object.freeze({
    id: 'goal-nobody-abandoned',
    term: 'nobody-abandoned',
    appearsAs: ['nobody-abandoned'],
    plain:
      'Nobody waited past the point this simulator counts as giving up. One person is enough to ' +
      'fail it — it is a floor, not an average.',
  }),
  Object.freeze({
    id: 'goal-long-waits-under',
    term: 'long-waits-under',
    appearsAs: ['long-waits-under'],
    plain:
      'At most this share of rides waited longer than the building calls acceptable. The figure ' +
      'in brackets is that share of rides, not a wait in seconds.',
  }),
  Object.freeze({
    id: 'goal-everyone-can-get-there',
    term: 'everyone-can-get-there',
    appearsAs: ['everyone-can-get-there'],
    plain:
      'Whether every rider could reach the floor they wanted. A recording carries no pass or ' +
      'badge on a journey, so it cannot tell a call nobody answered from a call nobody was ' +
      'allowed to answer, and this one is reported as unjudgeable rather than guessed at.',
  }),
  Object.freeze({
    id: 'goal-beat-the-baseline',
    term: 'beat-the-baseline',
    appearsAs: ['beat-the-baseline'],
    plain:
      'Your setting is measured against the one the stage started from, on the same passengers. ' +
      'It is reached when at least one measure separates the two by a range that excludes zero, ' +
      'and none separates them the other way.',
  }),

  /* ---------------------------------------------------------------- *
   * The dispatcher's dials
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'dimension',
    term: 'dimension',
    appearsAs: ['dimension'],
    plain:
      'One dial of the dispatcher — a weight, a limit or a strategy name. The declared set is ' +
      'every dial the simulator knows about; a stage opens some of them and holds the rest still, ' +
      'so that what it measures is the change it offered.',
  }),
  Object.freeze({
    id: 'dead-gate',
    term: 'dead gate',
    appearsAs: ['dead gate'],
    /*
     * *"…silently does nothing is worse than one that says why it cannot"* is what this said
     * first, and the ranking sweep refused it. The comparison was between two designs rather than
     * between two dispatchers, so the rule was arguably not aimed at it — and exempting it was the
     * other option and is the one that erodes: `campaign/words.ts` records that *"a rule with one
     * carve-out is a rule with a place to hide"*. Reworded instead, at no cost to what it says.
     */
    plain:
      'A dial that another dial has switched off, so moving it changes nothing about the run. The ' +
      'gate that closed it is named rather than the dial being hidden, so that a control which ' +
      'cannot do anything says as much instead of quietly accepting the change.',
  }),
  Object.freeze({
    id: 'authorable',
    term: 'authorable',
    appearsAs: ['authorable'],
    plain:
      'The settings on screen add up to a dispatcher this simulator would accept as a saved ' +
      'profile — every value inside its declared range, and nothing switched on that depends on ' +
      'something switched off. It says the profile is well formed and says nothing at all about ' +
      'how it will run.',
  }),
]);

/* -------------------------------------------------------------------------- *
 * Reading a surface's own words
 * -------------------------------------------------------------------------- */

/**
 * `\bphrase` — a leading word boundary and no trailing one. See {@link GlossaryTerm.appearsAs}.
 *
 * **The boundary is conditional, and it was found by the test rather than reasoned.** `\b` matches
 * between a word character and a non-word one, so `\b%` requires a letter or digit immediately
 * before the `%` — and the string this vocabulary has to match is `95 % interval`, with a space
 * there. The unconditional form therefore matched that phrase **nowhere**, in the corpus as well
 * as in the test, and the term would have shipped explaining a word it could never attach to.
 * A phrase that opens on a non-word character gets no leading boundary; it does not need one,
 * because the character itself is the boundary.
 *
 * Built once per phrase at module load rather than per call: `glossaryFor` runs on every batch
 * report, every goal report and every stage verdict, and the honesty search drives all three on
 * every case of every campaign.
 */
const MATCHERS: ReadonlyMap<GlossaryTerm, readonly RegExp[]> = new Map(
  GLOSSARY_TERMS.map((entry) => [
    entry,
    entry.appearsAs.map((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`${/^[\p{L}\p{N}_]/u.test(phrase) ? '\\b' : ''}${escaped}`, 'i');
    }),
  ]),
);

/**
 * One term's explanation, by id — for a surface that knows exactly which word it is explaining.
 *
 * {@link glossaryFor} is the derived path and is what a report uses. This is the keyed one, and it
 * exists for `mode/disclosure.ts`: a Casual lead is attached to a **figure**, so the figure's id
 * already decides which word is being explained and deriving it from the sentence would be
 * guessing at something the caller knows.
 *
 * Throws on an unknown id rather than returning a default. A missing definition is a wiring
 * mistake, and a silent empty string would put a figure on screen with a lead that says nothing —
 * which is the shape of every dead seam in this repository.
 */
export function glossaryPlain(id: string): string {
  const found = GLOSSARY_TERMS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no glossary term "${id}"`);
  return found.plain;
}

/**
 * The terms a surface's own text uses, **as the objects {@link GLOSSARY_TERMS} holds** — never
 * copies.
 *
 * Returned in the table's order rather than in the order the phrases were met, so two surfaces
 * that used the same words show them the same way round, and so the order is a property of the
 * vocabulary rather than of a sentence someone may reword tomorrow.
 *
 * Pure. No clock, no RNG, and it reads nothing but the strings it is handed — which is what lets
 * a caller pass exactly what it is about to draw and get back exactly what that says.
 */
export function glossaryFor(texts: readonly string[]): readonly GlossaryTerm[] {
  const haystack = texts.join('\n');
  if (haystack.trim() === '') return [];
  return GLOSSARY_TERMS.filter((entry) =>
    (MATCHERS.get(entry) ?? []).some((matcher) => matcher.test(haystack)),
  );
}
