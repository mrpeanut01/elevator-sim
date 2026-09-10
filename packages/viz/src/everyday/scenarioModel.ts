/**
 * **The Scenario hub, as words — § D525's first tile.**
 *
 * `docs/38` § 2.1 makes Scenario *"one shape, four sources"*: the ten campaign stages, the
 * eighteen fix cases, the six Engineer challenges `E1`–`E6`, and today's scenario, all authored to
 * one schema — `data/campaign.json`'s stage record **plus a budget**.
 *
 * **That schema is GitHub issue #365 and it is not built.** So this hub is deliberately thin: it
 * lists the two sources that ship *today* and routes to the screens that already draw them. It
 * invents no content model, because inventing one now would be a second thing for #365 to
 * reconcile rather than a step toward it.
 *
 * What that buys, and it is the whole reason the hub exists rather than the tiles simply going
 * away: § D525 retires the *Today's tower* and *Fix a building* tiles, and `door` and `fixit` are
 * registered screens. A retired tile with nowhere else to reach its screen makes that screen
 * unreachable — which `screens.test.ts` fails the build over, correctly. The hub is the somewhere
 * else.
 *
 * **The two absences are drawn, not hidden.** A hub that silently listed two entries where the
 * design names four sources would be `docs/39`'s own failure mode — a surface that looks finished
 * because what is missing from it is invisible. `SCENARIO_ABSENCES` is the register, and
 * `buildNotes.ts` carries it to the Settings panel like every other.
 *
 * Pure. No DOM, no host, no `data/` read — `scenarioScreen.ts` mounts what this returns, and the
 * honesty corpus sweeps it without a document.
 */
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

export interface ScenarioHubView {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly entries: readonly ScenarioEntry[];
  /** Drawn under the entries. Empty only when every § 2.1 source is authored to the schema. */
  readonly absences: readonly string[];
  /** The sentence that makes the short list honest. Never omitted, even when `absences` empties. */
  readonly note: string;
}

export const SCENARIO_COPY = Object.freeze({
  eyebrow: 'Scenario',
  title: 'Pick a problem',
  lede: 'A building with something wrong with it. Watch it, read the letter, change what you like, and run it again.',
  note: 'Two of the four kinds of scenario are playable. The rest are authored to a schema that is not built yet, and this list grows when it is.',
});

/**
 * The two sources that ship. Frozen rather than derived: each row's `screen` is a registered key,
 * and `scenarioModel.test.ts` asserts that against the registry rather than against this comment.
 */
const ENTRIES: readonly ScenarioEntry[] = Object.freeze([
  Object.freeze({
    id: 'today',
    title: "Today's scenario",
    blurb: 'One building, one day, one seed — the same day for everybody.',
    shape: '~3 min · no losing — a day is a score, not a pass',
    screen: 'door' as const,
  }),
  Object.freeze({
    id: 'fix-a-building',
    title: 'Fix a building',
    blurb: 'A building with something wrong. Diagnose it, change it, re-run it.',
    shape: '~5 min a case · retry as often as you like',
    screen: 'fixit' as const,
  }),
]);

/**
 * What this hub does not reach yet, in the player's words.
 *
 * The first row is § 2.1's remaining unauthored source and leaves on the commit that closes #365.
 * **The second row is narrower than it was**, and the narrowing is the record: it read *"the six
 * engineering challenges, E1 to E6, are specified and unbuilt — no brief data ships"*, and since
 * GitHub issue **#227** brief data does ship — two of the six, authored to the scenario schema in
 * `data/engineering-briefs.json` and played from the Lab's own stage picker. What is still true is
 * that this list cannot reach them and that four of the six are refused at load, so the entry says
 * both rather than being deleted. § D227 in the direction that bites after a lane lands: an absence
 * that stopped being true is as wrong as one that was never recorded.
 */
export const SCENARIO_ABSENCES: readonly string[] = Object.freeze([
  'The ten campaign stages are authored to the campaign record rather than to the scenario schema, so they are reached from Career until the two are one thing.',
  'Two of the six engineering challenges ship, and they are played on the Engineer surface rather than from this list. The other four ask for something a scenario run cannot do yet, and each says which.',
]);

/** The hub, computed. Takes nothing: a thin hub has no state to be wrong about. */
export function scenarioHubViewOf(): ScenarioHubView {
  return Object.freeze({
    eyebrow: SCENARIO_COPY.eyebrow,
    title: SCENARIO_COPY.title,
    lede: SCENARIO_COPY.lede,
    entries: ENTRIES,
    absences: SCENARIO_ABSENCES,
    note: SCENARIO_COPY.note,
  });
}
