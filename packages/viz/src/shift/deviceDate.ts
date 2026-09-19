/**
 * **The device's calendar clock, and the only place this package reads one** —
 * [§ D731](../../../../DECISIONS.md).
 *
 * ## Why a second clock exists at all
 *
 * `playback/clock.ts` is this package's clock and `boundaries.test.ts` rule 2 keeps it the only
 * one: *wall-clock time enters through `DisplayClock` and nowhere else*. That rule is about
 * **animation**, and `DisplayClock` says so in its own words — *"Milliseconds since some fixed
 * origin. Monotonic; the origin is not meaningful"*, preferring `performance.now()` precisely
 * because a clock that steps backwards would move a playhead. A monotonic clock with a meaningless
 * origin cannot answer *what is today's date*, so {@link dailySeedAt} cannot be fed from it, and
 * pretending otherwise would have meant one of two worse things:
 *
 * 1. **Widening the exemption to `dev/main.ts`.** That file draws every frame the Engineer shell
 *    produces. Exempting it is exempting the thing rule 2 was written to protect.
 * 2. **Spelling the read as `new Date()`.** The grep matches `Date.now(` and `performance.now(`,
 *    so a `new Date()` would have passed it. It would also have been this repository's own
 *    signature failure with the polarity reversed — not a behaviour no test reaches, but a rule
 *    no test reaches, evaded by choosing a spelling. A boundary got round by wording is worse
 *    than one that was never written.
 *
 * So the seam is **declared**: one module, one function, one line, named in
 * `boundaries.test.ts#WALL_CLOCK_EXEMPT` beside `dev/recordTti.ts` on exactly that entry's own
 * argument — *it produces no picture*. Nothing simulated or rendered reads this value back.
 *
 * ## What it does not weaken
 *
 * - **CLAUDE.md invariant 3** is about `core/`, and `core/` never learns that a calendar exists:
 *   what crosses the boundary is `SimulationConfig.seed`, a `bigint`, exactly as before. This
 *   module is in `viz`, which is the half of the split that is allowed a clock.
 * - **Replay determinism.** Invariant 5 puts the seed in the run record, and a replay replays the
 *   record's seed rather than re-deriving one — so a run recorded today still replays tomorrow.
 *   `dailySeed.test.ts` holds that by requiring every derivation in {@link dailySeedAt}'s module
 *   to be a pure function of its `nowMs` argument.
 * - **`?seed=`.** A deep link is the reader's own choice and still wins: `dev/main.ts` applies the
 *   link *over* the opening state, which is the same order `?building=` has always had.
 *
 * ## Which clock is authoritative, which is a fallback, and where that is decided
 *
 * Not here. This is the **device's** clock, and `dailySeed.ts` says in terms that the server's is
 * the one that decides a board. See that module's docstring for the whole argument — the short
 * form is that a client which gets the date wrong plays a crowd nobody else is playing and lands
 * on the personal log rather than on a board, which is a bounded failure the server already
 * handles, and that a build served with no API origin has no server answer to defer to at all.
 */

/**
 * Milliseconds since the Unix epoch, from the device.
 *
 * The one impure call in this package outside `playback/clock.ts` and `dev/recordTti.ts`. Kept in
 * a module of its own so the exemption names a file that does nothing else — a whole module the
 * rule can be suspended over is a smaller hole than a line inside one that draws.
 */
export function deviceNowMs(): number {
  return Date.now();
}
