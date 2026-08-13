/**
 * **The Endless rush setup screen's words and figures, as pure decisions** — GAMEPLAY § 9.1 over
 * ENGINE_CONTRACT § 3.2's stream, split from the DOM for the reason the whole of `everyday/` is
 * split: the words are drivable without a document, and the honesty sweep drives them.
 *
 * ## § 9.1's bands are labels on the ramp, and this module is where that is true rather than said
 *
 * The guide draws five bands — *waves 1–4 a normal day · 5–8 a busy Monday · 9–12 above design ·
 * 13–16 unreasonable · wave 17+ absurd* — each with a proportional bar. The prototype authors those
 * bars as five literals (`w: 22, 44, 66, 84, 100`). Here every one of them is **computed from the
 * contract's own arrival expression**:
 *
 * ```
 * wave     = floor(t / 180)
 * expected = (0.34 + wave × 0.11) × 2 / 3     people per two-second bucket
 * upShare  = 0.62                             constant
 * ```
 *
 * so a band's rate is the mean of that expression over the band's waves, its bar is that rate
 * against the last band's, and *+11 % more arrivals every wave* is read off the expression rather
 * than transcribed beside it. That is the difference between a screen that describes a ramp and one
 * that draws it: change the contract's constants and every figure here moves, which is what
 * `rushScreenModel.test.ts` pins against § 3.2's stated values.
 *
 * **Wave numbering shown to a player is one-based** (`floor((t − OPEN) / 180) + 1`, § 3.2's last
 * line), while the arrival expression's `wave` is zero-based. The two are different quantities and
 * are kept apart by name — {@link waveIndexAt} is the expression's, {@link playerWaveAt} is the
 * screen's — because collapsing them is an off-by-one that would read as a plausible ramp.
 *
 * ## § 20.5's hold line, built right rather than fixed later
 *
 * The prototype ends the run when forty people are standing **at all** (`sim.standing() >= 40`),
 * under a comment that already claims the intended rule. § 20.5 requires *forty people who have
 * been standing over two minutes at once*. Nothing in `packages/` implemented either, so there was
 * no wrong line to correct here — the constants are named once ({@link RUSH_HOLD_LINE}) and the
 * two-minute half is `live/bands.ts`'s own fourth band (`fromS: 120`), which is the seam a run
 * would be measured through. The rule is stated to the player in § 9.1's own words.
 *
 * ## What is not here, and why the primary refuses
 *
 * The climbing stream itself. `recordRun` simulates a whole run and hands back a recording, and no
 * demand template in `data/` ramps forever — so a rush is a run that does not exist yet, and
 * {@link RUSH_ABSENCES} says which parts are missing rather than letting a filled primary produce
 * one. The § 3.3 primary is drawn inert with that reason, which is `fixitBarModel`'s treatment of a
 * screen with nothing to run and `modes.ts`'s rule about where a refusal belongs: the setup screen
 * is real, so the refusal is on the control that cannot act, not on the screen.
 */

import type { ActionBarModel } from './actionBar.js';

/* -------------------------------------------------------------------------- *
 * ENGINE_CONTRACT § 3.2 — the stream, as arithmetic
 * -------------------------------------------------------------------------- */

/**
 * § 3.2's constants, in one frozen record so every figure on the screen is a function of them.
 *
 * `bucketS` is the contract's *two-second buckets*: {@link expectedPerBucket} is people per bucket,
 * and any per-minute figure divides by it. `waveS` is *three minutes*, which is what makes the
 * ramp *+11 % of a normal morning's rate every three minutes*.
 */
export const RUSH_STREAM = Object.freeze({
  /** Ninety minutes. The contract's own length for the generated climb. */
  lengthS: 90 * 60,
  /** Two-second buckets. */
  bucketS: 2,
  /** `wave = floor(t / 180)`. */
  waveS: 180,
  /** The `0.34` of `(0.34 + wave × 0.11) × 2 / 3`. */
  baseRate: 0.34,
  /** The `0.11` — the per-wave climb, which is the *+11 %* the screen quotes. */
  waveStep: 0.11,
  /** The `× 2 / 3`. */
  scale: 2 / 3,
  /** Constant across the whole climb — § 3.2 says so in one word. */
  upShare: 0.62,
  /** The one seed every player's waves are generated from. */
  seed: 90_210,
} as const);

/** § 3.2's zero-based `wave = floor(t / 180)` — the arrival expression's own index. */
export function waveIndexAt(t: number): number {
  return Math.floor(Math.max(0, t) / RUSH_STREAM.waveS);
}

/**
 * § 3.2's `floor((t − OPEN) / 180) + 1` — the wave a player is told they are on.
 *
 * `t` is seconds since the rush opened, so `OPEN` has already been subtracted; the `+ 1` is what
 * makes the first three minutes *wave 1*. Kept separate from {@link waveIndexAt} on purpose — see
 * the module docstring.
 */
export function playerWaveAt(t: number): number {
  return waveIndexAt(t) + 1;
}

/** `expected = (0.34 + wave × 0.11) × 2 / 3`, people per two-second bucket, for a zero-based wave. */
export function expectedPerBucket(waveIndex: number): number {
  return (RUSH_STREAM.baseRate + waveIndex * RUSH_STREAM.waveStep) * RUSH_STREAM.scale;
}

/** The same expression read as arrivals a minute, which is the unit a player can picture. */
export function arrivalsPerMinute(waveIndex: number): number {
  return (expectedPerBucket(waveIndex) * 60) / RUSH_STREAM.bucketS;
}

/**
 * § 3.1's morning-rush phase rate — the *normal morning* § 3.2's headline is measured against.
 *
 * Here rather than in {@link RUSH_STREAM} because it is not part of the rush stream: it is the
 * daily stream's own busiest phase, quoted so {@link climbPerWavePct}'s basis can be stated rather
 * than assumed. § 3.1's table, `Morning rush · 0.95`.
 */
export const MORNING_RUSH_RATE = 0.95;

/**
 * *+11 % more arrivals every wave, forever* — the headline, computed from the contract's own
 * coefficient rather than transcribed beside it.
 *
 * § 3.2 words it *"about 11 % of a normal morning's rate every three minutes"*, and the **about**
 * is doing real work, because the two readings of that sentence give two numbers:
 *
 * - the coefficient itself, `0.11`, read in the units § 3.1's phase table uses — **11 %**;
 * - the same step against § 3.1's morning-rush rate, `0.11 / 0.95` — **11.6 %**.
 *
 * The first is what the screen prints, because it is the number the expression contains and the
 * one a reader can find in the contract. Both are named here so that neither is mistaken for the
 * other, and `rushScreenModel.test.ts` pins both — a headline whose basis is unstated is how a
 * published number goes stale.
 *
 * What it is emphatically **not** is a compounding percentage of the previous wave: that starts at
 * `0.11 / 0.34 ≈ 32 %` and falls away as the ramp climbs, which is not a constant and is not what
 * *every wave, forever* claims.
 */
export function climbPerWavePct(): number {
  return RUSH_STREAM.waveStep * 100;
}

/**
 * Where the ramp **starts**, against the same *normal morning* the climb is quoted against.
 *
 * § 9.1's first band is labelled *a normal day*, and on its own that reads as *this is a normal
 * morning*. It is not: § 3.2 opens the climb at `0.34` against § 3.1's morning-rush `0.95`, so wave
 * 1 asks for about a third of one. Saying so is what makes the band labels legible as a ramp rather
 * than as five adjectives — and it is the reason {@link MORNING_RUSH_RATE} is quoted at all, since
 * the *+11 %* headline is measured against the same denominator.
 */
export function rushOpeningLine(): string {
  const opening = (RUSH_STREAM.baseRate / MORNING_RUSH_RATE) * 100;
  return (
    `Wave 1 asks for about ${opening.toFixed(0)}% of a normal morning's rate, and every wave after ` +
    `it adds about ${climbPerWavePct().toFixed(0)}% of that same morning again.`
  );
}

/* -------------------------------------------------------------------------- *
 * § 20.5 — the hold line
 * -------------------------------------------------------------------------- */

/**
 * The line the run ends on: **forty people who have each been standing over two minutes, at once**.
 *
 * Both halves matter and § 20.5 exists because the prototype dropped the second. `overS` is
 * deliberately `live/bands.ts`'s own fourth band boundary (`fromS: 120`, *past two minutes*), which
 * is the derivation a measured run would go through — `waitBandsAt(recording, t)`'s fourth count
 * against {@link people}. Naming it here rather than importing that module keeps this half pure and
 * free of a recording; the test asserts the two numbers agree.
 *
 * `live/honesty.ts` refuses an invented `40` for its *falling behind* chip, on the ground that forty
 * is a crowd in one building and a quiet second in another. The rush is the stated exception and the
 * reason is in § 9.2: *the same line for everybody*. A rush whose ending moved with the tower would
 * not be a leaderboard.
 */
export const RUSH_HOLD_LINE = Object.freeze({
  people: 40,
  overS: 120,
} as const);

/* -------------------------------------------------------------------------- *
 * The copy — the prototype's, transcribed
 * -------------------------------------------------------------------------- */

/**
 * Every authored sentence the screen draws, from `docs/design/elevator-sim-casual.dc.html`'s
 * `isRush` block. The handoff wins every disagreement about what the screen says.
 *
 * Two lines are **not** the prototype's and say so. `holdLine` is the prototype's own wording
 * already corrected to § 20.5 (its screen copy states the two-minute rule that its code did not
 * implement, so the sentence needed no change — only the code behind it, which is why this is a
 * transcription after all). `bandsEyebrow` and `bestsEyebrow` are its eyebrows verbatim.
 */
export const RUSH_SCREEN_COPY = Object.freeze({
  eyebrow: 'ENDLESS RUSH',
  title: 'How long can it hold?',
  lede:
    'Every three minutes more people arrive than the last wave. Nothing else changes — same ' +
    'tower, same lifts. Eventually the queue stops draining, and the only question is how far ' +
    'your dispatcher got before it did.',
  bandsEyebrow: 'THE WAVES',
  holdEyebrow: 'WHEN IT ENDS',
  holdLine:
    'The run stops when forty people have been standing for over two minutes at once. That is ' +
    'the point where a real building would be getting phone calls, and it is the same line for ' +
    'everybody.',
  bestsEyebrow: 'FURTHEST ANYONE HAS HELD',
  drivingEyebrow: 'DRIVING',
  drivingNote:
    'The waves are identical for everyone, so a further run is a better dispatcher — or a luckier ' +
    'morning. The bench knows which.',
  /** The register's heading. Not the prototype's: it has no absences to register. */
  absencesEyebrow: 'WHAT THIS BUILD DOES NOT DO YET',
  /** Drawn where a figure would be if a rush had ever run here. */
  noRun: '—',
} as const);

/**
 * The hold line as a figure, beside the sentence that spells it out in words.
 *
 * {@link RUSH_SCREEN_COPY.holdLine} says *forty people … over two minutes*, which is the
 * prototype's copy and stays the prototype's copy. This is the same rule in the units the run would
 * be measured in, so the two cannot drift: change {@link RUSH_HOLD_LINE} and this line moves while
 * the prose does not, which is a mismatch a reader can see. It is also § 9.3's own figure note —
 * *the run ends at 120 s × 40 people*.
 */
export function rushHoldLineFigure(): string {
  return `${String(RUSH_HOLD_LINE.overS)} s × ${String(RUSH_HOLD_LINE.people)} people`;
}

/**
 * How far the generated climb goes, said rather than left for a player to work out.
 *
 * § 9's rush is endless in principle; the stream § 3.2 specifies is ninety minutes, and this is the
 * wave that ends on. Naming it is the difference between *forever* as a design idea and *forever*
 * as a claim about a run that stops.
 */
export function rushGeneratedRangeLine(): string {
  return `The generated climb runs ${String(Math.round(RUSH_STREAM.lengthS / 60))} minutes and reaches wave ${String(LAST_GENERATED_WAVE)}, from one seed (${String(RUSH_STREAM.seed)}). Everybody faces the same waves.`;
}

/**
 * What the rush needs and this build has not got, in the order a reader meets them.
 *
 * On screen, and read by {@link rushBarModel} for the primary's refusal, so the disabled control
 * and the register cannot say different things. Each entry names the missing seam rather than the
 * feeling of one — `docs/18`'s register style, and `shell.ts`'s.
 */
export const RUSH_ABSENCES: readonly string[] = Object.freeze([
  'the climbing stream — no demand template in data/ ramps without a ceiling, so § 3.2’s ninety minutes cannot be generated yet',
  '§ 9.2’s stage — the run a player would watch is the Engineer surface, which has no held-time clock and no wave pill',
  '§ 9.3’s result — a rush that has not run has no furthest wave, and a screen that answered anyway would be inventing one',
  'the standings — the five entries below are the handoff’s own fixtures, not runs this build measured',
]);

/** The primary's refusal, one sentence, drawn on the disabled button and in the register. */
export const RUSH_PRIMARY_REFUSAL =
  'the climbing stream is not built — this screen is the setup, and there is nothing behind it to start yet';

/* -------------------------------------------------------------------------- *
 * The bands — § 9.1, computed off the ramp
 * -------------------------------------------------------------------------- */

/** One § 9.1 band: the label pair the guide writes, and the waves it covers. */
export interface RushBandSpec {
  /** The guide's own left cell — `waves 1–4`, `wave 17+`. */
  readonly waves: string;
  /** The guide's own rate word — `a normal day`, `absurd`. */
  readonly rate: string;
  readonly note: string;
  /** First player-facing wave in the band, one-based. */
  readonly fromWave: number;
  /** Last player-facing wave, or `undefined` for the open-ended last band. */
  readonly toWave: number | undefined;
}

/**
 * § 9.1's five bands, exactly as the guide writes them, with their wave spans as numbers.
 *
 * The notes are the prototype's `rushWaves` cells. The spans are parsed from the guide's own
 * labels rather than restated — `waves 1–4` is `{ fromWave: 1, toWave: 4 }` — so a band whose label
 * and span disagreed would be a defect the test can see.
 */
export const RUSH_BANDS: readonly RushBandSpec[] = Object.freeze([
  {
    waves: 'waves 1–4',
    rate: 'a normal day',
    note: 'Comfortable. Any dispatcher looks competent here.',
    fromWave: 1,
    toWave: 4,
  },
  {
    waves: 'waves 5–8',
    rate: 'a busy Monday',
    note: 'The lobby starts holding a queue between cars.',
    fromWave: 5,
    toWave: 8,
  },
  {
    waves: 'waves 9–12',
    rate: 'above design',
    note: 'Beyond what the lifts were built for. Choices start to show.',
    fromWave: 9,
    toWave: 12,
  },
  {
    waves: 'waves 13–16',
    rate: 'unreasonable',
    note: 'Only a dispatcher that groups people well gets through here.',
    fromWave: 13,
    toWave: 16,
  },
  {
    waves: 'wave 17+',
    rate: 'absurd',
    note: 'Nobody holds this. The question is how gracefully you lose.',
    fromWave: 17,
    toWave: undefined,
  },
]);

/** A band as the screen draws it — the guide's labels, plus figures read off the ramp. */
export interface RushBandView extends RushBandSpec {
  /** Mean arrivals a minute across the band's waves, to one decimal. */
  readonly perMinute: string;
  /** What the band asks for against wave 1 — `2.6× wave 1`. */
  readonly against: string;
  /** Bar width as a percentage of the heaviest band, `0..100`. */
  readonly barPct: number;
}

/**
 * The last wave a player is shown in the generated stream — {@link playerWaveAt} at its final
 * second, so the two numberings meet in exactly one place.
 *
 * The open-ended band needs a last wave to average over, and this is it. So *absurd* is priced at
 * what the generated climb actually reaches rather than at an arbitrary distance up an infinite
 * ramp — the bar is a fact about the run, not about the idea.
 */
export const LAST_GENERATED_WAVE = playerWaveAt(RUSH_STREAM.lengthS - 1);

/** Mean arrivals a minute over a one-based, inclusive wave span. */
function meanPerMinute(fromWave: number, toWave: number): number {
  let total = 0;
  let count = 0;
  for (let wave = fromWave; wave <= toWave; wave += 1) {
    total += arrivalsPerMinute(wave - 1);
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * § 9.1's five bands with their proportional bars — the whole point of this module.
 *
 * Every figure is the ramp's: the rate is the mean of § 3.2's expression over the band's waves, the
 * multiplier is that against wave 1, and the bar is that against the heaviest band. Nothing is
 * transcribed, so the prototype's five hand-set bar widths have no counterpart here to go stale.
 */
export function rushBandViews(): readonly RushBandView[] {
  const rates = RUSH_BANDS.map((band) =>
    meanPerMinute(band.fromWave, band.toWave ?? LAST_GENERATED_WAVE),
  );
  const heaviest = Math.max(...rates);
  const first = arrivalsPerMinute(0);
  return RUSH_BANDS.map((band, index) => {
    const rate = rates[index] ?? 0;
    return {
      ...band,
      perMinute: `${rate.toFixed(1)} a minute`,
      against: `${(rate / first).toFixed(1)}× wave 1`,
      barPct: heaviest === 0 ? 0 : Math.round((rate / heaviest) * 100),
    };
  });
}

/* -------------------------------------------------------------------------- *
 * The three facts, and the standings
 * -------------------------------------------------------------------------- */

/** One of § 9.1's three facts. `value` is `—` where this build has nothing to report. */
export interface RushFactView {
  readonly value: string;
  readonly label: string;
  /** True where the value is a refusal rather than a figure, so the frame can tint it. */
  readonly withheld: boolean;
}

/**
 * § 9.1's three facts: your furthest wave and who drove it, how long that held, and the climb.
 *
 * The first two are `—` and stay `—` until a rush can run: this build has never measured a furthest
 * wave, and the prototype's *wave 14 · 42 min · with Two-lift Friday* is its fixture. The third is
 * real, because the climb is arithmetic rather than a measurement — and it is **computed**, off
 * {@link climbPerWavePct}, so the *+11 %* on screen is the contract's own coefficient.
 */
export function rushFactViews(): readonly RushFactView[] {
  return [
    {
      value: RUSH_SCREEN_COPY.noRun,
      label: 'your furthest so far — no rush has run in this build',
      withheld: true,
    },
    {
      value: RUSH_SCREEN_COPY.noRun,
      label: 'how long that held',
      withheld: true,
    },
    {
      value: `+${climbPerWavePct().toFixed(0)}%`,
      label: 'more arrivals every wave, forever — of a normal morning’s rate',
      withheld: false,
    },
  ];
}

/** One row of § 9.1's *how far anyone has held* list. */
export interface RushBestView {
  readonly name: string;
  /** Who drove it. Reference runs say so here, in the guide's own words. */
  readonly who: string;
  readonly wave: string;
  readonly held: string;
  /** True for the two the guide labels reference runs, so the frame can set them apart. */
  readonly reference: boolean;
}

/**
 * § 9.1's five standings — *five entries including two reference runs, labelled as reference runs*.
 *
 * The values are the handoff's own fixtures (`RUSH_BESTS` in the prototype) and this build has
 * measured none of them, which {@link RUSH_ABSENCES} says on the same screen. They are drawn rather
 * than withheld because the guide's five rows are what the screen *is* — a list with two labelled
 * reference runs — and a column of five dashes would say nothing about the shape it is teaching.
 * The one thing not carried over is the prototype's `you: true` row: this build has no *you* here,
 * so the row that claimed one is the player's own and reads `—`.
 */
export const RUSH_BESTS: readonly RushBestView[] = Object.freeze([
  {
    name: 'Two-lift Friday',
    who: 'you — nothing posted in this build',
    wave: RUSH_SCREEN_COPY.noRun,
    held: RUSH_SCREEN_COPY.noRun,
    reference: false,
  },
  { name: 'Havering DD', who: 'delft_vt', wave: 'wave 19', held: '57 min', reference: false },
  { name: 'Patience v7', who: 'r_okonkwo', wave: 'wave 18', held: '54 min', reference: false },
  {
    name: 'Ask where they are going',
    who: 'reference run',
    wave: 'wave 16',
    held: '48 min',
    reference: true,
  },
  { name: 'Steady hand', who: 'reference run', wave: 'wave 11', held: '33 min', reference: true },
]);

/**
 * § 9.1's *driving* block, as a **statement rather than a control**.
 *
 * The prototype puts a dispatcher `<select>` here and it is deliberately not drawn. The only thing
 * such a select could write in this build is `ViewerState.dispatcherId`, which is who drives the
 * next **daily** run — so a player who changed it on the rush setup would have altered a different
 * mode's run from a screen whose own run does not exist. That is § D219's shape with the polarity
 * reversed: not a control that writes nothing, but one that writes somewhere else. The block states
 * who is standing and says the select is absent, which is the honest half of the same widget.
 *
 * `name` is the standing dispatcher's display name, or the id when this build does not know it —
 * `buildingById`'s honest-lookup rule, one screen up.
 *
 * **The sentence used to end *"on the front door, which is not built either"*, and both halves were
 * wrong** — § D227's stale refusal, on a shipped player string. The front door is a registered
 * screen (`screens.ts`, and `UNBUILT_REASONS` is empty), and the picker was never on it: `doorView`
 * draws *DRIVING TODAY* as a fact and says *"Change it on the brief, which is the next screen."*
 * So the line now points where the control actually is.
 *
 * Its test asserted `/not built/`, which is how the drift survived: a case that pins the shape of a
 * refusal rather than its subject passes for exactly as long as the sentence is wrong. It now names
 * the screen the copy names.
 */
export function rushDrivingLine(name: string): string {
  return `${name} would drive it. Picking another is on the brief, which today's tower opens.`;
}

/* -------------------------------------------------------------------------- *
 * The § 3.3 refinement
 * -------------------------------------------------------------------------- */

/**
 * § 3.3's rush row, resolved for the setup screen — the `bar()` refinement `screens.ts` contracts.
 *
 * It edits exactly one cell: the primary is marked **inert**, which `BarPrimary.inert` exists for
 * and which the shell draws as a disabled button with the refusal as its title. The label, the
 * left button and the note are the table's own and are not touched — § 3.3's note here
 * (*Nothing to set up. It ends when it ends.*) stays true of a rush, and replacing it with the
 * refusal would put the same sentence in two places and let them drift.
 *
 * There is no timeline cell to remove: `actionBar.ts`'s rush row carries none, because *a rush has
 * no timeline at all* (§ 3.3), and a refinement that deleted one would be describing a row that
 * never had it.
 */
export function rushBarModel(base: ActionBarModel): ActionBarModel {
  return { ...base, primary: { ...base.primary, inert: true } };
}
