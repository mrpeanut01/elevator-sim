/**
 * **The page's own fault register** — GitHub issue **#242**, AC1.
 *
 * ## The defect, and why the answer is not the obvious one
 *
 * #242: *"If the deployed build throws in a player's browser, nobody finds out."* The obvious
 * implementation is a global handler that posts the error to a collector, and it is refused twice
 * over before a line of it is written:
 *
 * - **A third-party collector cannot be reached.** `packages/viz/staticwebapp.config.json` ships
 *   `connect-src 'self'`, widened at build time to exactly one origin — the API's — and
 *   `.github/workflows/deploy-viz.yml` compares that source list for **equality** against a list
 *   written in the workflow. A hosted error monitor at a third origin is blocked by the page's own
 *   policy before any code runs, and would also have to get past that step.
 * - **A first-party route could be reached and is not built here.** The transport exists —
 *   `POST /api/telemetry` is on the API and the page may call it. What does not exist is the answer
 *   to *on what basis*: `docs/26-telemetry-and-privacy.md` § 14.2 lists four options for error
 *   reports and chooses none, marked for professional review, and § 16.2's retention row for them
 *   is **DRAFTED** and blank. § 13.4's T-2 requires a horizon *before* the feature ships. Sending
 *   would mean answering a question this repository has written down as not its own to answer.
 *
 * **And the consent next door is not the answer either.** `telemetry/recorder.ts` has a transport,
 * a batcher and a consent slot, and routing error reports through them would be quiet in the worst
 * way: a player who said yes to *measurement* did not say yes to *crash reports*, and § 14.2's
 * option C exists precisely because those two are one row *"only because they share a transport,
 * not because they share a purpose"*. There is also a plain engineering reason, and it is the
 * decisive one: the recorder mints its session at shell mount and refuses to send without a
 * consent answer — so on the failure this issue is *about*, a page that died before it mounted, the
 * recorder does not exist to be called and no answer has been given. **The instrument would be
 * absent at exactly the moment it is needed.**
 *
 * ## What ships instead: the player reports it, and this is what they carry
 *
 * `everyday/support.ts` already ships a problem-report path (issue #245) whose destination is a
 * public issue in this repository, stated on the surface before the press, with a retention story
 * that is the repository's and a deletion sentence that says what the product cannot do. That path
 * satisfies § 13.4's three obligations **today**, for text a player composes on purpose. So a
 * client fault becomes one more line of that report — shown to the reader, in the same array that
 * is sent, before anything is public.
 *
 * That is a smaller claim than *client errors are reported* and it is the honest one. It closes the
 * case where a player notices; it does not close the case where nobody does. The runbook says which
 * is which.
 *
 * ## What is counted, and the four things that are not
 *
 * A count, and which half of the visit it landed in. Not the **message**, not the **stack**, not the
 * **class**, and not the page's own address. The message and the stack are the obvious losses and
 * the reason is `docs/26 P-4`'s hazard aimed at a **public** destination: a thrown message is often
 * built by interpolating what was on screen, and this report becomes an issue anybody can read.
 * `support.ts`'s own `attachNotice` promises *"Your name, your picture and your email address are
 * not attached, and nothing else about you is either"*, and that sentence has to stay true of every
 * line the attachment grows.
 *
 * **The class is left out for a different reason, and it is worth stating because it is a real
 * cost.** `TypeError` on a screen is internal notation, which `CHARTER_PROGRAMME.md` § M2's third
 * exit criterion forbids where a player reads — and `support.ts`'s arrangement is that *the reader
 * is shown the same lines that are sent*, so there is no version of this where the class travels in
 * the report and not on the screen. A maintainer therefore gets a count rather than a classification,
 * and the count still separates the two cases that matter: a page that failed while starting up, and
 * a page that failed while being played.
 *
 * `record` **takes no argument**, and that is the enforcement rather than a convention: there is no
 * parameter through which an error could reach this module, so no later caller can pass one.
 *
 * ## Pure, and where the listeners are
 *
 * No `window`, no `document`, no clock — `boundaries.test.ts` holds this file to that. The two
 * listeners are `everyday/faultWatch.ts`, which is on that file's exempt list, and the register
 * below is a module singleton because a page has one of these the way it has one document.
 */

/**
 * How many faults are counted in each half of a visit before the count stops moving.
 *
 * A fault inside a render loop or a resize handler fires every frame, so without a ceiling this is
 * an unbounded counter feeding a field a player is about to make public. Ninety-nine is chosen so
 * that the number a reader sees is a number they can act on: *one* and *a few* and *constantly* are
 * the three answers a report needs, and the difference between ninety-nine and four hundred
 * thousand is of no use to anybody.
 */
export const MAX_FAULTS_COUNTED = 99;

/** What the register hands out. Two numbers, and there is deliberately no third field. */
export interface ClientFaultTally {
  /** Faults that landed before the shell said it had mounted. */
  readonly startingUp: number;
  /** Faults that landed after it. */
  readonly playing: number;
}

/**
 * The count, and the half of the visit each fault landed in.
 *
 * A class rather than a closure so that every test gets its own and the shipped one is a single
 * named instance below, which is the shape `menu/account.ts` uses for the other piece of state this
 * product keeps in memory and never persists.
 */
export class ClientFaultRegister {
  #startingUp = 0;
  #playing = 0;
  #mounted = false;

  /**
   * One fault happened.
   *
   * Takes nothing, on purpose — see the module docstring. Never throws: it is called from an
   * `error` listener, and a fault counter that threw would be the loop it exists to report.
   */
  public record(): void {
    if (this.#mounted) {
      if (this.#playing < MAX_FAULTS_COUNTED) this.#playing += 1;
      return;
    }
    if (this.#startingUp < MAX_FAULTS_COUNTED) this.#startingUp += 1;
  }

  /**
   * The shell has mounted; every fault from here is a fault in a page the player can see.
   *
   * Idempotent, and that is the assertion rather than the convenience: a second call must not
   * reopen the start-up half, or a shell that remounted would begin filing live faults against the
   * boot — which is the one distinction this register exists to draw.
   */
  public shellMounted(): void {
    this.#mounted = true;
  }

  public tally(): ClientFaultTally {
    return { startingUp: this.#startingUp, playing: this.#playing };
  }

  public total(): number {
    return this.#startingUp + this.#playing;
  }
}

/**
 * The page's register. One per document, so one per module graph.
 *
 * Its non-test callers are `everyday/faultWatch.ts`, which fills it, and
 * `everyday/settingsScreen.ts`, which reads it into the problem report.
 */
export const CLIENT_FAULTS = new ClientFaultRegister();
