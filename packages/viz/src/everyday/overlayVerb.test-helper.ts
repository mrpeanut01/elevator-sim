/**
 * **Which § 3.3 primaries share a verb with the stage overlay's button** — GitHub issue #573,
 * [§ D1309](../../../../DECISIONS.md).
 *
 * The player met *two starts for one intention*: the brief's `Start the day`, then the stage's centred
 * `Start`. The criterion the issue asks for is **no stage-reaching primary shares a verb with the
 * overlay**, checked over `actionBar.ts`'s own table rather than over a transcription of the nine
 * routes the issue counted, so a tenth route cannot escape by not being on a list.
 *
 * So the candidates are **derived**: every primary variant in {@link ACTION_BAR_ROWS} whose verb is
 * the overlay's. What is written down is the other half, {@link NEVER_OPENS_THE_STAGE}: the rows
 * whose press is known to go somewhere else, each with the code that sends it there. A row that
 * shares the verb and is not in the register is red until somebody classifies it, and a register row
 * that has stopped sharing the verb is red as stale; both directions are asserted by
 * `actionBar.test.ts`, and `firstTwoMinutes.browser.test.ts` reads the overlay's verb off the drawn
 * page rather than off the constant.
 *
 * Shared by the unit and the browser tier, which is why it is a helper rather than a block in one of
 * them.
 */

import { ACTION_BAR_ROWS } from './actionBar.js';

/** The verb of a label: its first word, lowercased, with any leading glyph (`▶`, `⤺`) stripped. */
export function verbOf(label: string): string {
  return (label.replace(/^[^\p{L}]+/u, '').split(/\s+/u)[0] ?? '').toLowerCase();
}

/** One primary variant of one row, keyed `screen` or `screen·ctx` as `actionBar.test.ts` keys rows. */
export interface RowVariant {
  readonly key: string;
  readonly variant: string;
}

/** Every primary variant in the shipped table whose verb is `verb`. */
export function primariesSharingVerb(verb: string): readonly RowVariant[] {
  return ACTION_BAR_ROWS.flatMap((row) =>
    row.primary.variants
      .filter((variant) => verbOf(variant) === verb)
      .map((variant) => ({ key: row.ctx === undefined ? row.screen : `${row.screen}·${row.ctx}`, variant })),
  );
}

/**
 * The rows whose primary **never opens the stage**, and where each sends the player instead.
 *
 * Every entry is a press that lands short of the day, on a screen from which the day is still a
 * press away: the door, the brief, the week, the towers or the rush setup. Each names the handler,
 * so a reader can check the claim where it is made.
 */
export const NEVER_OPENS_THE_STAGE: Readonly<Record<string, string>> = Object.freeze({
  menu: 'the picked mode’s own screen, the towers or the rush setup (`everyday/shell.ts`, `go(picked.screen)`)',
  scenario: 'the hub’s first row, which is the door (`everyday/scenarioScreen.ts`, `context.go(first.screen)`)',
  week: 'the door, or on a closed week the brief of the next one (`everyday/weekScreen.ts`, `context.go(\'brief\')`)',
  board: 'the door (`everyday/boardScreen.ts`, `context.go(\'door\')`)',
  'stage·watch': 'the brief for the watched crowd (`everyday/stageScreen.ts`, `context.go(\'brief\')`)',
  'report·watch': 'the week: a watched day files no report, and the report’s primary falls through to `context.go(\'week\')` (`everyday/reportScreen.ts`)',
});
