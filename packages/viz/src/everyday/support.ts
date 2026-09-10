/**
 * **Reporting a problem, as words** — GitHub issue **#245**, the product owner's ruling of
 * 2026-09-09. Pure, for `settingsView.ts`'s reason: the copy and the refusals are testable without
 * a document, and the honesty sweep drives every word here.
 *
 * Recorded here rather than in `DECISIONS.md`, under [§ D405](../../../../DECISIONS.md): the
 * ruling itself is the product owner's and is already quoted in
 * [`docs/26`](../../../../docs/26-telemetry-and-privacy.md) § 12.1, and what this module decides on
 * top of it — the transport, the wording, and which sentences may not cross onto this screen —
 * binds this file, its mount and its adapter, all of which cite it. The one thing that reaches
 * further is `docs/26`'s own S13 row, and that document carries the change in its own words.
 *
 * ## What the ruling settled, and what it therefore requires of this file
 *
 * > *"Build it, and reports go to GitHub issues. … **Destination: issues in this repository.** That
 * > needs no new service and the foreman loop can triage what arrives. It has one consequence that
 * > must be built for rather than discovered: **the reports are public.** Players will paste things
 * > they would not paste publicly if they had thought about it. So the surface has to say, plainly
 * > and next to the box, that what they write will be publicly visible. That is a requirement of
 * > this ruling, not a nicety."*
 *
 * {@link SUPPORT_COPY.publicNotice} is that sentence, {@link SupportView.publicNotice} is its one
 * slot, and `support.test.ts` asserts it is present in **every** state this view can be in —
 * including the ones where the press is refused, because a reader who is being refused is still a
 * reader who has typed. `docs/26-telemetry-and-privacy.md` § 13.4 states the obligation set that
 * attaches to any typed string and § 15.4 drafts the two lines; both are honoured here, and the
 * third obligation — a deletion path named on the same surface — is
 * {@link SUPPORT_COPY.deletionNotice}, which says the product cannot do it rather than promising
 * it can.
 *
 * ## The transport is a link the player follows, and that is the deployment's decision
 *
 * The deployed page is served under a content security policy whose `connect-src` is `'self'` and
 * whose `form-action` is `'none'` (`packages/viz/staticwebapp.config.json`, asserted for equality
 * on every deploy by `.github/workflows/deploy-viz.yml`). So this page cannot post anywhere but its
 * own API, and cannot submit a form at all. Widening either would put a second origin in a header
 * the deploy lane compares for equality, which is a change to how the site is served in order to
 * add a button.
 *
 * The remaining route is the honest one anyway: {@link reportLinkOf} composes an address that opens
 * the repository's own new-issue form with the title and the whole body already written, and the
 * **player** presses the button on that page. Three consequences worth stating, because two of them
 * are improvements rather than costs:
 *
 * 1. **Nothing is posted by this product.** The press here opens a page; the post is the reader's,
 *    on a page that is unmistakably the public repository. {@link SUPPORT_COPY.handoffNotice} says
 *    exactly that, before the press.
 * 2. **The reader sees the exact payload before anything is public** — `docs/26` § 19 item 10 asks
 *    whether that is required, and this shape supplies it whichever way the answer goes.
 * 3. **No credential exists anywhere in this product**, because no request is made from it. A route
 *    through this project's own API would have needed a token, a third ingest route `docs/26` § 8
 *    forbids, and a service to own it.
 *
 * ## What is attached, and why the run pointer is a pointer rather than a description
 *
 * `CLAUDE.md` invariant 5: every persisted run carries its seed, so a run replays exactly. That is
 * what makes a report from this game worth more than an ordinary bug report, and it is
 * `docs/26 P-2` from the other end — *name the run; do not describe it*. So the attachment is the
 * crowd number, the building, the dispatcher, the day and what the player was playing, plus the
 * build and the browser. It is **not** a bag of derived figures, and it carries no name, no picture
 * and no address: `everyday/profile.ts` holds all three and none of them is read here.
 *
 * **The reader is shown the same lines that are sent**, in the same order, which is why
 * {@link SupportView.attached} and {@link reportBodyOf} are built from one array rather than two.
 * A surface that showed a summary and sent something else would be the shape this repository keeps
 * catching, aimed at the one screen where the reader is deciding what to make public.
 *
 * ## The run that cannot be replayed from its own selection says so
 *
 * `scope/runIdentity.ts#runIdentityIssues` is the shipped predicate for *can this run be rebuilt
 * from a selection* — the leaderboard's submit gate, the share link's gate and the command line's.
 * `everyday/host.ts#runCarriedBySelection` asks it, and {@link SupportRun.carried} is that answer,
 * carried in rather than recomputed. A report about a run that cannot be replayed says so instead of
 * arriving unreproducible.
 *
 * **Its sentences are deliberately not carried onto this screen**, which is a departure from the
 * account block next door and needs its reason on the record. They are written for the Engineer
 * surface and they name files — *"the building … is saved on this device alone and data/buildings/
 * does not ship it"* — and `CHARTER_PROGRAMME.md` § M2's third exit criterion forbids a source
 * filename where a player reads. That is measured rather than asserted: `support.test.ts` runs the
 * predicate's own messages through the same expression the honesty property uses and shows that at
 * least one of them would be a violation on this surface. So what crosses over is the **answer**,
 * and the sentence a player reads is this surface's own.
 */

import type { RunContext } from './types.js';
import { BUILD_VERSION, UNBUILT } from '../release/version.js';

/**
 * Where a report goes — the ruling's *"issues in this repository"*, written once.
 *
 * A constant rather than a value read from somewhere, because there is nowhere to read it from: the
 * page is served as a static bundle and knows no repository. It carries no credential and needs
 * none — the address opens a form, and the reader posts.
 */
export const SUPPORT_REPORT_FORM = 'https://github.com/mrpeanut01/elevator-sim/issues/new';

/**
 * How much a reader may type, in characters.
 *
 * The whole report travels in an address, and an address has a practical ceiling — a few kilobytes
 * before a server refuses one. 4 000 characters is roughly a page and a half of prose, leaves the
 * attachment and the form's own parameters a wide margin inside that ceiling, and is bounded
 * rather than guessed: `support.test.ts` composes a report at exactly this limit with the longest
 * browser string this module will carry and asserts the whole address stays inside its own stated
 * budget.
 *
 * **That budget is the test's and is deliberately not a constant here**, because nothing in this
 * module would read it. A ceiling exported for a test to import is an export with no caller, which
 * is the shape the standing requirement in `docs/05-roadmap.md` counts instances of — and the
 * bracket it holds is a property of the check rather than of the product.
 */
export const SUPPORT_TEXT_LIMIT = 4_000;

/**
 * How much of the browser's own string travels, in characters.
 *
 * Browsers author these and nothing bounds them. It is capped **before** the value reaches the
 * view, never between the view and the address, so the line the reader is shown is the line that
 * is sent — which is the rule the whole of this module is arranged around.
 */
export const SUPPORT_BROWSER_LIMIT = 300;

/** One line of the attachment: shown to the reader, and sent, from one array. */
export interface SupportFactView {
  readonly label: string;
  readonly value: string;
}

/**
 * What this report can point at.
 *
 * - `no-run` — nothing has been played on this page yet, so the report carries the build and the
 *   browser and no run. Still sendable: a player whose menu is broken has never reached a run, and
 *   a report form that refused them would refuse exactly the reports nothing else can catch.
 * - `run` — a run, and its settings rebuild it.
 * - `run-partly-carried` — a run, and its settings do **not** rebuild it, because something was
 *   changed while it was playing. The reader is told, and asked for the part the settings cannot
 *   carry.
 */
export type SupportStage = 'no-run' | 'run' | 'run-partly-carried';

/** The run a report points at, as the settings that rebuild it. */
export interface SupportRun {
  /** `everyday/host.ts#seed` — the number two players compare, and the one that replays a day. */
  readonly seed: bigint;
  readonly buildingId: string;
  /** The building's own name, so the line reads before it identifies. */
  readonly buildingName: string;
  readonly dispatcherId: string;
  readonly dispatcherName: string;
  /** Which day of the week the run is on — the building grows with it, so a replay needs it. */
  readonly day: number;
  /** Which flow the run was in. */
  readonly ctx: RunContext;
  /**
   * Whether the settings above rebuild the run — `everyday/host.ts#runCarriedBySelection`, which
   * is `scope/runIdentity.ts#runIdentityIssues`' answer and never a second opinion.
   */
  readonly carried: boolean;
}

/** Everything this surface needs, and nothing about who is playing. */
export interface SupportInput {
  /** What the reader has typed. */
  readonly text: string;
  /** The run on the page, or `undefined` when none has been played. */
  readonly run?: SupportRun | undefined;
  /**
   * The browser's own string, as the mount read it — `undefined` off a browser.
   *
   * Handed in rather than read here for the pure/DOM split `boundaries.test.ts` enforces by name:
   * the words are pure and the document is not.
   */
  readonly browser?: string | undefined;
}

/** The whole block, as data. Total: every sentence a reader can meet starts here. */
export interface SupportView {
  readonly heading: string;
  readonly lede: string;
  /** The ruling's requirement, and it is drawn next to the box in every state. */
  readonly publicNotice: string;
  /** What is attached, said before the press — `docs/26` § 15.4's second line. */
  readonly attachNotice: string;
  /** That the press opens a page and posts nothing — see the module docstring's point 1. */
  readonly handoffNotice: string;
  /** What this product can and cannot do about a report once it is public — § 13.4's T-3. */
  readonly deletionNotice: string;
  readonly fieldLabel: string;
  readonly stage: SupportStage;
  /** This state's own sentence about the run — never a refusal, always a statement. */
  readonly stageNote: string;
  /** The attachment, in the order it is sent. */
  readonly attached: readonly SupportFactView[];
  readonly action: string;
  /** Whether pressing it will do anything. `false` is always accompanied by {@link refusal}. */
  readonly actionOffered: boolean;
  /** Why the press is not offered, in words, or `undefined`. Never greyed without one. */
  readonly refusal: string | undefined;
  /** How much room is left, so the ceiling is met before it refuses rather than after. */
  readonly counter: string;
  /**
   * The address the press opens, or `undefined` while it is refused.
   *
   * Not a sentence, and deliberately not swept: it is a machine address, and the words inside it
   * are the reader's own and this surface's, both of which are swept where they are authored.
   */
  readonly destination: string | undefined;
}

/**
 * Every word this block authors, in one table.
 *
 * A table rather than literals inside {@link supportViewOf}, for `menu/client.ts#CLIENT_FAILURES`'
 * reason, which `settingsView.ts#SIGN_IN_COPY` restates: *"a sentence buried in a `catch` is a
 * sentence no property ever looks at"*. It is swept through this module's own surface in the
 * honesty corpus, in every stage and both refusals.
 */
export const SUPPORT_COPY = Object.freeze({
  heading: 'REPORT A PROBLEM',
  lede:
    'Something broken, or a number that does not look right? Tell us here and we will try to ' +
    'put ourselves back in your run.',
  /*
   * **The ruling's requirement.** Two sentences and no hedging: what happens to the words, who can
   * read them, and how long they last. The third clause is the one that earns its place — players
   * paste things they would not paste publicly if they had thought about it, and this is the
   * thinking-about-it, put where they are typing rather than in a notice they could go and read.
   */
  publicNotice:
    'What you write here is posted publicly, as an issue in this game’s public code repository. ' +
    'Anyone can read it, and it stays there. Do not put anything about yourself or anyone else in ' +
    'the box that you would not put on a public page.',
  /*
   * `docs/26` § 15.4's second line. It is an obligation rather than a courtesy: a report that
   * silently carried a run pointer would be collection the reader did not compose.
   */
  attachNotice:
    'The lines below travel with your words, so we can replay the run you were on. Your name, ' +
    'your picture and your email address are not attached, and nothing else about you is either.',
  handoffNotice:
    'The button opens the report page with all of this already written into it. Nothing is posted ' +
    'until you press the button on that page, and you can read the whole report there first.',
  /*
   * § 13.4's T-3, and the argument for wording it this way is § 16.5's: a promise this product
   * cannot keep is worse than the honest sentence. It cannot unpublish what somebody has read.
   */
  deletionNotice:
    'Once it is posted we cannot unpublish it. Taking a report down is something you would ask a ' +
    'person who looks after the repository to do — it is not a button this game has.',
  fieldLabel: 'WHAT WENT WRONG',
  action: 'Open the report page',

  /* ---- the three stages' statements about the run ---- */
  noRun:
    'No run has played on this page yet, so there is no crowd to point at. Say what you were ' +
    'doing and what you expected instead, and we will work from that.',
  run:
    'These are the settings your run was built from. The crowd number is the part that makes it ' +
    'repeatable — the same number gives the same morning, so we can watch what you watched.',
  runPartlyCarried:
    'These are the settings your run was built from, and they are not the whole of it: things you ' +
    'changed while the day was playing do not travel with settings. Say what you changed and we ' +
    'will start from there.',

  /* ---- the two refusals ---- */
  emptyRefusal:
    'Nothing is typed yet. Say what went wrong first — a report with no words in it is one nobody ' +
    'can act on.',
  tooLongRefusal:
    'That is longer than the report page will take in one go. Trim it, or put the short version ' +
    'here and add the rest once the page is open.',

  /* ---- the attachment's labels, and the two values this module authors ---- */
  seedLabel: 'Crowd number',
  buildingLabel: 'Building',
  dispatcherLabel: 'Dispatcher',
  dayLabel: 'Day of the week',
  playingLabel: 'What you were playing',
  buildLabel: 'This build',
  browserLabel: 'Your browser',
  buildUnknown: 'not built for release',
  browserUnknown: 'not known',

  /* ---- the report itself, as it arrives ---- */
  reportTitle: 'Problem report from the game',
  bodyProblemHeading: 'What went wrong',
  bodyRunHeading: 'The run, so it can be replayed',
  bodyFooter:
    'Sent from the report page inside the game. The person who wrote it was shown, before they ' +
    'pressed anything, that this issue is public and cannot be unpublished.',
} as const);

/**
 * What the reader was playing, in the words they would use.
 *
 * A `Record` over {@link RunContext} rather than a `switch` with a default, on
 * `settingsView.test.ts`'s own precedent for the account stages: a sixth flow fails to **compile**
 * here rather than arriving in a report as a blank. `rail.ts`'s subline is not reused because it
 * answers a different question — it is *where you are on the rail* in the rail's shouted voice
 * (`MID-DAY`, `WATCHING`), and *what you were playing* is a phrase in a sentence.
 */
const RUN_CONTEXT_LABELS: Readonly<Record<RunContext, string>> = Object.freeze({
  daily: 'a day of the daily loop',
  campaign: 'a day of a career',
  rush: 'a rush',
  watch: 'watching somebody else’s run',
  replay: 'a past day played again',
});

/**
 * How the day reads — *Day 3*, or the first day said as one.
 *
 * A helper rather than an interpolation so the one place a day becomes words is one place. Day 1
 * is worth its own arm: *Day 1* is correct and *the first day* is what a reader would write.
 */
function dayValueOf(day: number): string {
  return day <= 1 ? 'the first day' : `day ${String(day)}`;
}

/** What this build is, for the attachment — the bare commit, or the honest absence. */
function buildValueOf(): string {
  return BUILD_VERSION === UNBUILT ? SUPPORT_COPY.buildUnknown : BUILD_VERSION;
}

/**
 * The attachment, in the order it is shown and sent.
 *
 * Exported so the mount and the body composer read the **same** array — see the module docstring on
 * why there is one and not two.
 */
export function supportFactsOf(input: SupportInput): readonly SupportFactView[] {
  const facts: SupportFactView[] = [];
  const run = input.run;
  if (run !== undefined) {
    facts.push({ label: SUPPORT_COPY.seedLabel, value: run.seed.toString() });
    facts.push({
      label: SUPPORT_COPY.buildingLabel,
      value: `${run.buildingName} (${run.buildingId})`,
    });
    facts.push({
      label: SUPPORT_COPY.dispatcherLabel,
      value: `${run.dispatcherName} (${run.dispatcherId})`,
    });
    facts.push({ label: SUPPORT_COPY.dayLabel, value: dayValueOf(run.day) });
    facts.push({ label: SUPPORT_COPY.playingLabel, value: RUN_CONTEXT_LABELS[run.ctx] });
  }
  facts.push({ label: SUPPORT_COPY.buildLabel, value: buildValueOf() });
  facts.push({
    label: SUPPORT_COPY.browserLabel,
    value:
      input.browser === undefined || input.browser.trim() === ''
        ? SUPPORT_COPY.browserUnknown
        : input.browser.slice(0, SUPPORT_BROWSER_LIMIT),
  });
  return facts;
}

/** Which of the three states the run is in. */
function stageOf(run: SupportRun | undefined): SupportStage {
  if (run === undefined) return 'no-run';
  return run.carried ? 'run' : 'run-partly-carried';
}

/** The stage's own statement — exhaustive, so a fourth stage is a compile error rather than a gap. */
function stageNoteOf(stage: SupportStage): string {
  switch (stage) {
    case 'no-run':
      return SUPPORT_COPY.noRun;
    case 'run':
      return SUPPORT_COPY.run;
    case 'run-partly-carried':
      return SUPPORT_COPY.runPartlyCarried;
  }
}

/**
 * The body of the report, as it arrives in the repository.
 *
 * Plain words throughout, and that is not only manners: this string is drawn on a player surface
 * before it is sent, so `CHARTER_PROGRAMME.md` § M2's third exit criterion reaches it — no section
 * number, no source filename, no code identifier. The building and dispatcher ids are in it because
 * they are what makes the run rebuildable, and an id in ordinary parentheses is none of the three
 * things that criterion names.
 */
export function reportBodyOf(input: SupportInput): string {
  const lines: string[] = [
    SUPPORT_COPY.bodyProblemHeading,
    '',
    input.text.trim(),
    '',
    SUPPORT_COPY.bodyRunHeading,
    '',
  ];
  for (const fact of supportFactsOf(input)) lines.push(`${fact.label}: ${fact.value}`);
  lines.push('', stageNoteOf(stageOf(input.run)), '', SUPPORT_COPY.bodyFooter);
  return lines.join('\n');
}

/**
 * The address the press opens — the repository's own new-issue form, already written.
 *
 * `undefined` where there is nothing to open, so a caller cannot compose an address for a state the
 * view refuses. The two are decided together in {@link supportViewOf}, which is the only reason
 * this can be a total function over the states that have one.
 */
export function reportLinkOf(input: SupportInput): string {
  const query = new URLSearchParams({
    title: SUPPORT_COPY.reportTitle,
    body: reportBodyOf(input),
  });
  return `${SUPPORT_REPORT_FORM}?${query.toString()}`;
}

/**
 * The block for this state. Total — every sentence a reader can meet is decided here.
 *
 * The four notices are unconditional on purpose. A refused press is still a reader who has typed
 * into the box, and the ruling's requirement is about the box rather than about the press.
 */
export function supportViewOf(input: SupportInput): SupportView {
  const typed = input.text.trim();
  const stage = stageOf(input.run);
  const refusal =
    typed === ''
      ? SUPPORT_COPY.emptyRefusal
      : input.text.length > SUPPORT_TEXT_LIMIT
        ? SUPPORT_COPY.tooLongRefusal
        : undefined;
  return {
    heading: SUPPORT_COPY.heading,
    lede: SUPPORT_COPY.lede,
    publicNotice: SUPPORT_COPY.publicNotice,
    attachNotice: SUPPORT_COPY.attachNotice,
    handoffNotice: SUPPORT_COPY.handoffNotice,
    deletionNotice: SUPPORT_COPY.deletionNotice,
    fieldLabel: SUPPORT_COPY.fieldLabel,
    stage,
    stageNote: stageNoteOf(stage),
    attached: supportFactsOf(input),
    action: SUPPORT_COPY.action,
    actionOffered: refusal === undefined,
    refusal,
    counter: `${String(input.text.length)} of ${String(SUPPORT_TEXT_LIMIT)} characters`,
    destination: refusal === undefined ? reportLinkOf(input) : undefined,
  };
}
