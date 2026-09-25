/**
 * Loading `data/` in a browser.
 *
 * `core`'s `loadConfig` reads a directory with `node:fs`, which a browser cannot do — and that
 * is by design: `config/loader.ts` is the only file in the config module that imports `node:`
 * anything, precisely so a browser build can use the pure `parseBuilding`/`resolveBuilding`
 * path instead. This file is that path, and it is the reason invariant 6's "the core must build
 * with `viz` absent" has a matching property in the other direction: `viz` uses `core` through
 * its published, fs-free surface.
 *
 * The three top-level JSON files are fetched by name. The buildings cannot be, because listing
 * a directory over HTTP is not a thing, so the Vite dev server serves a manifest at
 * `/__buildings.json` — see `vite.config.ts`. That plugin is dev-only tooling and never ships.
 */

import {
  crossCheckDispatcherProfiles,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type BuildingConfig,
  type DispatcherProfiles,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';

import { restrictedFloorIds } from '../access/zoning.js';
import { mixedFleetBanks } from '../commissioning/choices.js';
import { scenarioHorizonFor } from '../shift/dayLength.js';
import { CONTRACT_LADDER, contractLadderIssues } from '../shift/ladder.js';
import { parseEngineeringBriefs, type EngineeringBriefs } from '../briefs/parse.js';
import { parseCampaign } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { parsePriceSchedule } from '../pricing/parse.js';
import type { PriceSchedule } from '../pricing/types.js';
import type { FixitCases } from '../fixit/types.js';
import { parseProofCases, type ProofCaseSet } from '../gauntlet/proofCases.js';
import { validatePublishedGoalRates, type PublishedGoalRates } from '../scenario/published.js';
import {
  isContentFinding,
  validatePublishedSurvivors,
  type PublishedSurvivors,
} from '../scenario/survivors.js';
import { parseReferenceRuns } from '../watch/reference.js';
import type { WatchableRun } from '../watch/types.js';

/**
 * A building as both the runner and the editor need it.
 *
 * The runner needs the {@link ResolvedBuilding}; the editor needs the **authored** document,
 * because `ResolvedBuilding` is a one-way projection — floor ranges are already expanded, cars
 * already carry their class's defaults, and re-serialising one would produce a file that is a
 * legal building but not the file anybody wrote. `ED-T9` asks for a round trip through the same
 * JSON `loadConfig` reads, and that is what {@link BuildingEntry.config} is.
 */
export interface BuildingEntry {
  readonly file: string;
  readonly config: BuildingConfig;
  readonly resolved: ResolvedBuilding;
}

export interface BrowserResources {
  /**
   * `data/price-schedule.json` — what every purchasable change costs, GitHub issue **#366**.
   *
   * Here rather than behind its own loader, unlike the fix cases and the proof cases, and the test
   * is the one those two state: *does everything that loads resources have a use for it?* It does.
   * The campaign shop, the fix-a-building editor and the fixit case parser all price from it, so a
   * second fetch per surface would be three chances for two surfaces to disagree about what a car
   * costs — which is the defect this document was authored to end. It is about seven kilobytes.
   */
  readonly priceSchedule: PriceSchedule;
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  /**
   * The whole of `data/dispatcher-profiles.json`, **not** its `profiles` array.
   *
   * It was the array until T75, and the difference is the file-level `patternSwitching` block:
   * `SimulationConfig.dispatcherProfiles` is what `Simulation` turns into a weight-set library
   * through `weightSetSourceFrom`, and an array cannot satisfy it. So a profile could author
   * `"selection": {"policy": "fuzzy"}`, `parseDispatcherProfiles` would accept it here, and
   * pressing **Run** would refuse it **by name** — the safe failure, and still the thirteenth
   * instance of a behaviour that is configurable, validated and unreachable from the surface that
   * needs it (`DECISIONS.md` § D153's own known-limitations paragraph).
   *
   * Named for its file, as {@link BrowserResources.trafficProfiles} and
   * {@link BrowserResources.elevatorSpecs} already are; § D153 decision 1 argues the naming, and
   * the array was the odd one out. Readers that want the list say `.profiles`.
   */
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly buildings: readonly ResolvedBuilding[];
  /** The same buildings, with the document each was parsed from. */
  readonly entries: readonly BuildingEntry[];
  /** Declared traffic-profile ids, so the editor cross-checks `trafficProfile` as the loader does. */
  readonly trafficProfileIds: ReadonlySet<string>;
  readonly warnings: readonly string[];
}

/**
 * Fetch and parse one JSON file, **naming the path in every failure mode** — `UX.md` `RV-17`.
 *
 * Only the `!response.ok` branch used to name it, and driving `RV-17` for the first time found
 * that on this dev server that branch is the one a missing file does *not* take. Vite's HTML
 * fallback answers any request whose `Accept` includes `* / *` — which is what `fetch()` sends —
 * with `index.html` and a **200**, so deleting `data/elevator-specs.json` produced
 *
 * ```text
 * could not load data/: Unexpected token '<', "<!doctype "... is not valid JSON
 * ```
 *
 * — a true sentence about a file it declined to name, for a 404 it declined to call a 404. A
 * network failure (`TypeError: Failed to fetch`) named no path either. All three paths now do,
 * and the HTML-for-JSON case says what it means, because a reader who has just seen this needs to
 * know a file is missing rather than malformed.
 */
async function fetchJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    /*
     * `cache: 'no-cache'` — always revalidate, never serve a stored copy unchecked.
     *
     * These six paths are fixed: the name does not change when the bytes do, so a stored copy is
     * never superseded by a new one arriving under a new URL the way a hashed asset is. The
     * server now says `no-cache` for exactly that reason — but **a header fixes only the clients
     * that have not been poisoned yet**, and it is the wrong half of the repair on its own.
     *
     * It shipped poisoned. `server/http/static.ts` classified `traffic-profiles.json` as
     * content-hashed on its name — `-profiles.json` is a hyphen and eight characters of
     * `[A-Za-z0-9_-]`, which is Vite's shape — and served it `max-age=31536000, immutable`. Every
     * browser that loaded the viewer holds that file for a year and *will not revalidate it*,
     * which is what `immutable` means; a reload re-reads the cache and only a hard refresh
     * escapes. So the deploy carrying `credentialGap` and `office-day` reached returning players
     * as a new bundle reading a year-old payload, `parseTrafficProfiles` refused it for a missing
     * block, and the viewer showed "could not load data/" with no run available at all.
     *
     * Measured on the live origin, one URL in one browser: the default mode answered with six
     * demand templates and no `credentialGap`, this one answered with seven and the block
     * present. That is the recovery, and it is why this is a request option rather than only a
     * response header — the poisoned entries are already out there and cannot be recalled.
     *
     * Not `'reload'`, which would skip the cache entirely and re-download on every load. This
     * revalidates, so a server that offers `ETag` or `Last-Modified` can answer 304 with no body;
     * ours does not yet, which is a cost of about 210 kB per cold load and worth revisiting.
     */
    response = await fetch(path, { cache: 'no-cache' });
  } catch (cause) {
    throw new Error(`could not fetch ${path}: ${describe(cause)}`, { cause });
  }
  if (!response.ok) {
    throw new Error(`could not fetch ${path}: ${String(response.status)} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') ?? 'no content-type';
  try {
    return await response.json();
  } catch (cause) {
    const html = contentType.includes('text/html');
    throw new Error(
      `${path} did not parse as JSON: ${describe(cause)} (the server answered ${String(response.status)} ${contentType}` +
        `${html ? ', which is what this dev server sends when the file is missing from data/' : ''})`,
      { cause },
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Everything a run needs, fetched and validated. Throws `ConfigError` on invalid data. */
export async function loadBrowserResources(): Promise<BrowserResources> {
  const [specsRaw, trafficRaw, dispatchersRaw, manifestRaw, scheduleRaw] = await Promise.all([
    fetchJson('/elevator-specs.json'),
    fetchJson('/traffic-profiles.json'),
    fetchJson('/dispatcher-profiles.json'),
    fetchJson('/__buildings.json'),
    fetchJson('/price-schedule.json'),
  ]);
  const priceSchedule = parsePriceSchedule(scheduleRaw);

  const elevatorSpecs = parseElevatorSpecs(specsRaw);
  const trafficProfiles = parseTrafficProfiles(trafficRaw);
  const dispatchers = parseDispatcherProfiles(dispatchersRaw);
  const warnings = crossCheckDispatcherProfiles(dispatchers, 'dispatcher-profiles.json').map(
    (warning) => warning.message,
  );

  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));

  const manifest = manifestRaw as { readonly files: readonly { name: string; data: unknown }[] };
  const entries: BuildingEntry[] = manifest.files.map((entry) => {
    const config = parseBuilding(entry.data, entry.name);
    return {
      file: entry.name,
      config,
      resolved: resolveBuilding(config, elevatorSpecs, { file: entry.name, trafficProfileIds }),
    };
  });
  const buildings = entries.map((entry) => entry.resolved);

  /*
   * The contract ladder, cross-checked against the documents that decide whether a rung is legal —
   * GitHub issue #382, `shift/ladder.ts`. It is validated **here** rather than at its own import
   * because every rule it has to obey lives in a document this function has just fetched: DC-R1's
   * *a rate stays inside its profile's declared range* needs `traffic-profiles.json`, a bank choice
   * needs the building and `elevator-specs.json`, and the mixed-fleet refusal needs the building's
   * authored cars. `pricing/parse.ts`'s split, and its reason.
   *
   * Reported as **warnings** rather than thrown, on the same footing as a building's own
   * cross-validation two lines below: a rung that asks for a rate its profile does not declare is a
   * content defect the reader should be told about, and refusing to boot the viewer over it would
   * make one bad figure in `data/` cost the whole product. `shift/ladder.test.ts` is where it is a
   * failure, and that is the gate content lands through.
   */
  const ladderIssues = contractLadderIssues(CONTRACT_LADDER, {
    rateRangeFor: (buildingId) => {
      const building = buildings.find((candidate) => candidate.id === buildingId);
      const profile = trafficProfiles.profiles.find(
        (candidate) => candidate.id === building?.trafficProfile,
      );
      if (profile === undefined) return undefined;
      return { min: profile.arrivalRatePctPop5min.min, max: profile.arrivalRatePctPop5min.max };
    },
    bankIdsFor: (buildingId) =>
      buildings.find((candidate) => candidate.id === buildingId)?.banks.map((bank) => bank.id),
    carIdsFor: (buildingId, bankId) =>
      buildings
        .find((candidate) => candidate.id === buildingId)
        ?.banks.find((bank) => bank.id === bankId)
        ?.cars.map((car) => car.id),
    mixedBankIdsFor: (buildingId) => {
      const entry = entries.find((candidate) => candidate.config.id === buildingId);
      return entry === undefined ? undefined : mixedFleetBanks(entry.config);
    },
    speedBandFor: (machineClassId) => {
      const entry = elevatorSpecs.classes.find((candidate) => candidate.id === machineClassId);
      if (entry === undefined) return undefined;
      return { min: entry.ratedSpeedMps.min, max: entry.ratedSpeedMps.max };
    },
    /* Every shipped profile id, for a rung's pinned press day to name — § D914. */
    dispatcherIds: () => dispatchers.profiles.map((profile) => profile.id),
    /* The horizon the Scenario press runs each tower on, for a pinned day to match — § D974. */
    horizonFor: (buildingId) =>
      scenarioHorizonFor(
        trafficProfiles,
        entries.find((candidate) => candidate.config.id === buildingId)?.config,
      ),
    floorProfilesFor: (buildingId) => {
      const entry = entries.find((candidate) => candidate.config.id === buildingId);
      if (entry === undefined) return undefined;
      const declared = new Set<string>();
      for (const range of entry.config.floorRanges ?? []) {
        if (range.trafficProfile !== undefined) declared.add(range.trafficProfile);
      }
      for (const floor of entry.config.floors ?? []) {
        if (floor.trafficProfile !== undefined) declared.add(floor.trafficProfile);
      }
      return [...declared];
    },
  }).map((issue) => `contract-ladder.json: ${issue}`);

  return {
    priceSchedule,
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: dispatchers,
    buildings,
    entries,
    trafficProfileIds,
    warnings: [
      ...warnings,
      ...ladderIssues,
      ...buildings.flatMap((b) => b.warnings.map((w) => w.message)),
    ],
  };
}

/* -------------------------------------------------------------------------- *
 * The campaign — docs/10 § 5, W5
 * -------------------------------------------------------------------------- */

/**
 * `data/campaign.json`, `data/scenario-goals.json` and `data/engineering-briefs.json`, fetched,
 * cross-checked and parsed.
 *
 * **Deliberately not part of {@link loadBrowserResources}.** That function is what
 * `dev/batchWorker.ts` calls on every worker start, and a batch worker has no use for a campaign;
 * folding two more fetches into it would make every batch pay for a surface it does not touch.
 * The Campaign panel is the only caller, and it calls this once.
 *
 * The published goal table is validated **before** the campaign is parsed against it, because a
 * campaign checked against a malformed table would be checked against nothing.
 */
export async function loadCampaign(resources: BrowserResources): Promise<LoadedCampaign> {
  const [campaignRaw, publishedRaw, briefsRaw, survivorsRaw] = await Promise.all([
    fetchJson('/campaign.json'),
    fetchJson('/scenario-goals.json'),
    fetchJson('/engineering-briefs.json'),
    /*
     * The measured survivor counts — GitHub issue #367, [§ D649](../../../../DECISIONS.md).
     *
     * Fetched **here** rather than in a loader of its own, on this function's own stated ground:
     * the table is keyed by `data/campaign.json`'s stages and means nothing without them, so a
     * loader that could return one and not the other would let a caller hold half a scenario.
     * It is validated below before anything reads it, exactly as the goal table is.
     */
    fetchJson('/scenario-survivors.json'),
  ]);

  const published = publishedRaw as PublishedGoalRates;
  const tableViolations = validatePublishedGoalRates(published);
  if (tableViolations.length > 0) {
    throw new Error(
      `data/scenario-goals.json is not a valid goal table, so no campaign can be checked ` +
        `against it:\n  ${tableViolations.join('\n  ')}`,
    );
  }

  const space = collectSearchSpace();
  const dimensionHelp = new Map<string, string>();
  for (const parameter of space.parameters) {
    if (parameter.description !== undefined) dimensionHelp.set(parameter.id, parameter.description);
  }

  const context = {
    published,
    // The one statement anywhere about what a dimension may be, and it is derived here.
    dimensionIds: space.ids,
    profileIds: new Set(resources.dispatcherProfiles.profiles.map((profile) => profile.id)),
    restrictedFloorIdsByBuilding: new Map(
      resources.buildings.map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
    /* One document, loaded once with the rest — see `BrowserResources.priceSchedule`. */
    schedule: resources.priceSchedule,
  };
  const campaign = parseCampaign(campaignRaw, context);
  /*
   * The six engineering briefs — GitHub issue **#227**, `docs/21` § 4, and § D525 clause 1's
   * *"one shape, four sources"*.
   *
   * Loaded here rather than in a loader of their own because a brief **is** a scenario: it is
   * checked against the same published goal table, by the same validator, with the same context
   * object. Two contexts assembled two ways would be two answers to *"what is a dimension?"*, which
   * is the defect `campaign/parse.ts`'s own docstring exists to prevent one level down.
   */
  const briefs = parseEngineeringBriefs(briefsRaw, context);

  /*
   * The survivor table, checked against the campaign it is keyed by — § D649.
   *
   * After `parseCampaign`, because `validatePublishedSurvivors` takes the stages as its context:
   * a table checked against no campaign is a table checked against nothing, which is the ordering
   * the goal table above is loaded in for the same reason. A malformed table **refuses the
   * campaign load** rather than returning an unchecked one, because the only thing downstream does
   * with it is publish a difficulty figure to a player, and `docs/38` § 2.1 makes an unpinned one
   * worse than none.
   */
  const survivors = survivorsRaw as PublishedSurvivors;
  const survivorViolations = validatePublishedSurvivors(survivors, {
    stages: campaign.stages,
    schedule: resources.priceSchedule,
  });
  /*
   * **Only a malformed table refuses the load, and #381's first-hour floor is not one.**
   *
   * The first shape of this check threw on every violation, and the shipped table carries the
   * floor's finding for `stage-1-first-call` — so `loadCampaign` threw on a well-formed table,
   * `#campaign-profile` rendered with zero options, and the Lab's campaign tab was dead for every
   * player. `savedDispatcher.browser.test.ts` caught it against a select that resolved empty, and
   * the browser leg was green at the base commit, so it was this wave's to fix.
   *
   * The distinction is `scenario/survivors.ts#isContentFinding`, and it is the reason the
   * predicate lives there rather than here: a finding that the *content* is too narrow is a true
   * thing a working table reported, while a missing provenance field or a step keyed to no stage
   * means no figure on the table can be trusted. The second is worth denying a screen over; the
   * first is a measurement doing its job, and it is registered in
   * `scenario/survivors.test.ts#FIRST_HOUR_SINGLE_SURVIVOR` where a reader can act on it.
   */
  const malformed = survivorViolations.filter((line) => !isContentFinding(line));
  if (malformed.length > 0) {
    throw new Error(
      `data/scenario-survivors.json is not a valid survivor table, so no scenario can publish a ` +
        `count from it:\n  ${malformed.join('\n  ')}`,
    );
  }

  return { campaign, briefs, published, space, dimensionHelp, survivors };
}

export interface LoadedCampaign {
  readonly campaign: Campaign;
  /** `data/engineering-briefs.json`, parsed and validated against the same table. */
  readonly briefs: EngineeringBriefs;
  readonly published: PublishedGoalRates;
  readonly space: SearchSpace;
  readonly dimensionHelp: ReadonlyMap<string, string>;
  /**
   * `data/scenario-survivors.json`, validated against {@link campaign} — GitHub issue #367,
   * [§ D649](../../../../DECISIONS.md).
   *
   * What `scenario/ladder.ts` joins to the stages so the Scenario hub can draw each one's measured
   * count on its own face. Held here rather than fetched by the hub because `everyday/` may not
   * import this module — see `everyday/scenarioLadderPort.ts` for the direction the dependency
   * points instead.
   */
  readonly survivors: PublishedSurvivors;
}

/**
 * `data/fixit-cases.json`, fetched and parsed — the Fix-a-building catalogue.
 *
 * Not part of {@link loadBrowserResources}, for {@link loadCampaign}'s stated reason: that
 * function runs on every batch-worker start, and a worker has no use for a tenant's letter. The
 * Fix-a-building panel is the only caller, and it calls this once, on first open.
 *
 * The forbidden-identifier list — GAMEPLAY § 16 rule 11 — is **derived** from the same loaded
 * data the cases are checked against: every shipped building id and dispatcher profile id. A list
 * written down in `fixit/parse.ts` would go stale the day a building lands.
 */
/**
 * `data/reference-runs.json`, fetched and parsed — the shipped reference runs a spectator can
 * watch (GAMEPLAY § 14.1, § 20.11).
 *
 * Not part of {@link loadBrowserResources}, on {@link loadFixitCases}' stated ground: it is fetched
 * once, on the watch picker's first open, and a batch worker has no use for a fixture.
 *
 * The building **name** is resolved from the record's own id rather than authored in the file —
 * `watch/reference.ts` argues why — and `buildingNameOf` is passed **in** rather than reached for:
 * it lives on `dev/state.ts`, which imports this module's `BrowserResources`, and a value import
 * back the other way would close a cycle for one string lookup. The caller already holds the
 * answer the rest of the shell reads.
 */
export async function loadReferenceRuns(
  buildingNameOf: (buildingId: string) => string,
): Promise<readonly WatchableRun[]> {
  const raw = await fetchJson('/reference-runs.json');
  return parseReferenceRuns(raw, buildingNameOf);
}

export async function loadFixitCases(resources: BrowserResources): Promise<FixitCases> {
  const raw = await fetchJson('/fixit-cases.json');
  return parseFixitCases(
    raw,
    fixitContextOf({
      /* One document, loaded once with the rest — see `BrowserResources.priceSchedule`. */
      schedule: resources.priceSchedule,
      buildings: resources.buildings,
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
      /* For the shaft-area price band, and only that — GitHub issue #429 stage 2, § D631. */
      elevatorSpecs: resources.elevatorSpecs,
    }),
  );
}

/**
 * Resolve a building the editor produced, against the same specs and profile ids the loader used.
 *
 * A thin wrapper on purpose. `resolveBuilding` is the only thing in the project allowed to decide
 * what a building means, and an edited building must go through exactly the same door as a
 * shipped one — otherwise "Run this building" would be running something the loader would have
 * rejected, which is the one outcome `ED-T8` exists to rule out.
 */
export function resolveEdited(
  resources: BrowserResources,
  building: BuildingConfig,
): ResolvedBuilding {
  return resolveBuilding(building, resources.elevatorSpecs, {
    file: `${building.id}.json`,
    trafficProfileIds: resources.trafficProfileIds,
  });
}

/**
 * `data/proof-cases.json`, fetched and parsed — `ENGINE_CONTRACT.md` § 12.3's forty proof cases.
 *
 * Not part of {@link loadBrowserResources}, on {@link loadFixitCases}' stated ground: that function
 * runs on every batch-worker start, and a worker running one case has no use for the list of forty.
 * The board screen is the only caller, and it calls this once, on first open.
 *
 * The building ids the parse checks against are **derived** from the loaded resources rather than
 * written down beside the parser, for `loadFixitCases`' reason one level up: a hand-written list
 * would go stale the day a building lands, and the failure it would produce — a proof case silently
 * refused — is a rating quietly taken over thirty-five.
 */
export async function loadProofCases(resources: BrowserResources): Promise<ProofCaseSet> {
  const raw = await fetchJson('/proof-cases.json');
  return parseProofCases(raw, {
    buildingIds: new Set(resources.buildings.map((building) => building.id)),
  });
}
