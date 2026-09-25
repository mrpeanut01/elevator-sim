/**
 * **The ordered path, provided to the Everyday shell** — the seam that lets the Scenario hub list
 * the ten campaign stages without `everyday/` learning how to fetch a document.
 *
 * ## Why a provided port rather than an import
 *
 * `scenario/ladder.ts` is pure and takes both documents as arguments; somebody has to read them.
 * The only reader that exists is `dev/data.ts#loadCampaign`, which fetches `campaign.json`,
 * `scenario-goals.json` and `engineering-briefs.json` and is called once by `dev/main.ts` before
 * the Campaign panel mounts. An Everyday module importing `dev/main.js` for that would be
 * importing a module whose side effect is *the whole application* — and `everyday/boot.ts` already
 * imports `dev/main.ts`, so the cycle is the one this directory's last module-init `undefined`
 * came out of. So the dependency points the way it already points for `EVERYDAY_ROOT_CLASS` and
 * for {@link ../everyday/engineerBridge.js}: `dev/main.ts` **provides** the ladder when its boot
 * has it, and the hub consumes whatever has been provided.
 *
 * ## The window where nothing is provided, said rather than hidden
 *
 * `dev/main.ts` boots asynchronously and the Everyday shell mounts immediately, so a player can
 * open Scenario before the documents land — and `loadCampaign` can fail outright, which
 * `dev/main.ts` already treats as *one surface reports it and the other nine come up*.
 * {@link scenarioLadder} answers `undefined` in both cases, the hub draws the path's **absence**
 * in its register rather than an empty list or a spinner, and {@link onScenarioLadderProvided} is
 * how a mounted screen hears the port arrive and redraws. Same shape `everyday/boot.ts` uses for
 * the Engineer menu's late arrival, one seam over.
 *
 * **It carries the reading, never the documents.** A port handing over a `Campaign` would put the
 * decision of what a stage's face says on whichever screen happened to ask, which is the second
 * authority `scenario/ladder.ts` exists to prevent. What travels is the finished ordered path.
 *
 * The decision this module took is recorded in [§ D649](../../../../DECISIONS.md), which is owed
 * because it reaches past `everyday/` — it changes a shipped refusal register, adds a served
 * `data/` document and rules on how a measured zero is presented.
 */

import { scenarioLadderOf, type LadderStage, type ScenarioLadderRung } from '../scenario/ladder.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';

let provided: readonly ScenarioLadderRung[] | undefined;

const listeners = new Set<() => void>();

/**
 * `dev/main.ts` is the one intended caller: once with the path when `loadCampaign` resolves.
 *
 * Calling it again replaces the path and re-notifies, which is what a screen mounted across a
 * re-provide would want. `undefined` withdraws it — a reload that could not read the documents
 * must put the hub back to drawing the absence rather than leaving a stale ladder standing.
 */
export function provideScenarioLadder(rungs: readonly ScenarioLadderRung[] | undefined): void {
  provided = rungs;
  for (const listener of [...listeners]) listener();
}

/** The ordered path, or `undefined` while nothing has provided one. Never a partial list. */
export function scenarioLadder(): readonly ScenarioLadderRung[] | undefined {
  return provided;
}

/** Hear the path arrive. Returns the unsubscribe, as every listener seam in this directory does. */
export function onScenarioLadderProvided(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Read the path off the two documents and provide it, in one call.
 *
 * Here rather than in `dev/main.ts` so that the boot's line is a hand-off and not a composition:
 * the module that reads `data/` should not also be deciding what a stage's face says, which is the
 * second authority `scenario/ladder.ts` exists to prevent. `dev/main.ts` holds one import and one
 * statement, which is also what keeps this seam mergeable when two lanes are in that file.
 */
export function provideScenarioLadderFrom(
  stages: readonly LadderStage[],
  survivors: PublishedSurvivors,
  refusalOf?: (stageId: string, routeName: string) => string | undefined,
): void {
  provideScenarioLadder(scenarioLadderOf({ stages, survivors, refusalOf }));
}
