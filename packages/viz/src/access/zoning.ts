/**
 * Access zoning, as a picture can draw it — `docs/10-experience-layer-contract.md` § 10.1.
 *
 * ## The three kinds of zoning stay three kinds
 *
 * `CLAUDE.md` forbids collapsing service (physical), access (credential) and operational
 * (dispatcher strategy) zoning into one field, and the editor already keeps them apart in the
 * *form*. § 10.1's complaint is that prose is the weakest form of that separation: a reader
 * skims it. So the lens below makes the distinction visible in the **picture**, where a floor
 * no shaft reaches and a floor this credential does not open are drawn with different glyphs,
 * labelled with different words, and explained by different sentences.
 *
 * The two failure states are therefore never merged. {@link CredentialLensRow} carries
 * {@link CredentialLensRow.served} and {@link CredentialLensRow.permitted} as **separate**
 * booleans, and {@link CredentialLensRow.state} is a derived summary of them rather than the
 * only thing recorded — because the fixes are different (build a shaft; grant a credential) and
 * a renderer that only had the summary could not say which one applies when both do.
 *
 * Operational zoning is absent from the lens **by construction**, and {@link LENS_LEGEND}'s
 * closing note says so out loud: it is a dispatcher weight vector, not a property of the
 * building, so there is no floor state it could produce.
 *
 * ## Why this is not `core`'s `permittedGroupsByFloor`
 *
 * `core`'s `traffic/generator.ts` has a private function of that name and it is not exported;
 * `Building` builds the same index internally and exposes only `isAccessPermitted`, which needs
 * a resolved building. The lens runs on the document the reader is **still typing** — the same
 * requirement `editorPreview.ts` was written for — so it takes the authored `accessZones` array
 * and never throws. The semantics are copied deliberately and asserted against `Building`'s own
 * answer in `zoning.test.ts`, so the two cannot drift.
 */

import type { AccessZone } from '@elevator-sim/core/browser';

import type { VizFloor } from '../contract/types.js';
import type { ShaftGeometry } from '../render/layout.js';

/**
 * The three states § 10.1 names, and no fourth.
 *
 * Ordered from best to worst so a legend and a test can iterate them without a hand-written
 * list, and so {@link LENS_LEGEND} is derived from this rather than parallel to it.
 */
export const CREDENTIAL_STATES = ['reachable', 'not-served', 'not-permitted'] as const;

export type CredentialState = (typeof CREDENTIAL_STATES)[number];

/**
 * A glyph per state, so the lens is readable with the colour removed — the rule `D18` set for
 * door phase and overload, applied to zoning.
 *
 * `⊘` keeps the meaning it already has on the label gutter of both the run canvas
 * (`render/canvas.ts`) and the editor preview (`render/preview.ts`): *no shaft reaches this
 * floor*. Reusing it is the point — the lens must not invent a second spelling for a fact the
 * viewer already draws.
 *
 * `▩` is deliberately a **different shape**, not a different circle. `⊗` was the first choice
 * and was rejected: at 12 px it is a slashed circle with the slash rotated, which is exactly the
 * confusion the three-glyph rule exists to prevent. A hatched block reads as a barrier and
 * cannot be mistaken for a ring at any size.
 */
export const STATE_GLYPHS: Readonly<Record<CredentialState, string>> = Object.freeze({
  reachable: '●',
  'not-served': '⊘',
  'not-permitted': '▩',
});

/**
 * The word for each state — the half of the signal that survives a font without `▩` in it.
 *
 * Held beside the glyph rather than derived from the state id, because *"not-served"* is an
 * identifier and *"not served"* is English, and the screen shows the second.
 */
export const STATE_WORDS: Readonly<Record<CredentialState, string>> = Object.freeze({
  reachable: 'reachable',
  'not-served': 'not served',
  'not-permitted': 'not permitted',
});

/** One legend row: § 10.1's *"three states, three glyphs, three legend rows, one sentence each."* */
export interface LensLegendRow {
  readonly state: CredentialState;
  readonly glyph: string;
  readonly word: string;
  /** Which kind of zoning produced this state, named. */
  readonly zoning: string;
  readonly sentence: string;
}

export const LENS_LEGEND: readonly LensLegendRow[] = Object.freeze(
  CREDENTIAL_STATES.map((state) =>
    Object.freeze({
      state,
      glyph: STATE_GLYPHS[state],
      word: STATE_WORDS[state],
      zoning:
        state === 'not-served' ? 'service zoning' : state === 'not-permitted' ? 'access zoning' : 'both',
      sentence:
        state === 'reachable'
          ? 'a shaft physically reaches this floor and this credential opens it.'
          : state === 'not-served'
            ? 'no shaft physically reaches this floor. Service zoning — the fix is a bank that serves it.'
            : 'a shaft reaches this floor and this credential does not open it. Access zoning — the fix is a credential group on the zone, or a different credential.',
    }),
  ),
);

/**
 * The sentence the lens carries about the zoning it deliberately cannot show.
 *
 * § 10.1: *"Operational zoning is absent from the lens by construction and the lens says so: it
 * is not a property of the building."*
 */
export const LENS_OPERATIONAL_NOTE =
  'Operational zoning is not shown: it is a dispatcher strategy, not a property of the building, ' +
  'so it produces no floor state. Which dispatcher can *read* a credential is a separate ' +
  'question — see the dispatcher compatibility note.';

/* -------------------------------------------------------------------------- *
 * The access-zone index
 * -------------------------------------------------------------------------- */

/**
 * Floor id to the credential groups permitted there, in declared order.
 *
 * A floor **absent** from the map is unrestricted, which is `Building.isAccessPermitted`'s own
 * semantics and `secure-tower`'s stated design: *"only the lobby is unrestricted."* An empty
 * array is not the same thing and cannot occur — the schema requires a zone to name at least one
 * group — but a caller must not read absence as "permits nobody".
 */
export function permittedGroupsByFloor(
  accessZones: readonly AccessZone[] | undefined,
): ReadonlyMap<string, readonly string[]> {
  const byFloor = new Map<string, string[]>();
  for (const zone of accessZones ?? []) {
    for (const floorId of zone.floors) {
      const groups = byFloor.get(floorId) ?? [];
      for (const group of zone.credentialGroups) if (!groups.includes(group)) groups.push(group);
      byFloor.set(floorId, groups);
    }
  }
  return byFloor;
}

/**
 * Floors that sit inside at least one access zone, **in the order the floors are given**.
 *
 * Building order, not zone order and not `Set` order: the pre-run warning names these floors to
 * a reader, and `11, 12, 16, 2, 20` is every id correct and the sentence useless — the same
 * defect `dev/main.ts`'s `unansweredCallFloors` records having had.
 */
export function restrictedFloorIds(
  floorIds: readonly string[],
  accessZones: readonly AccessZone[] | undefined,
): readonly string[] {
  const permitted = permittedGroupsByFloor(accessZones);
  return floorIds.filter((id) => permitted.has(id));
}

/**
 * A floor-id list as **runs**, using the building's own order — `2, 3, … 30` becomes `2–30`.
 *
 * Written for § 10.3's message, and it is a legibility fix rather than a length one: on Secure
 * Tower the warning named 29 floors as 29 comma-separated ids, which no reader parses, and which
 * took five lines of the viewer's column away from the canvas underneath it. The count is stated
 * separately and is never replaced by this, so nothing is hidden — a reader still learns that 29
 * floors are affected, and now also learns that they are contiguous.
 *
 * Runs are consecutive **positions in `orderedIds`**, never arithmetic on the id. Floor ids are
 * strings — `G`, `Zone 5 hotel`, `B2` — and `expandFloors` guarantees nothing about them being
 * numbers. `2–8, 16–22` on a building whose zones are not contiguous is exactly right, and would
 * be wrong under any numeric reading of `G`.
 *
 * A run of two is written out in full (`2, 3`), because `2–3` is longer to read than what it
 * replaces and says less.
 */
export function floorRunsOf(
  orderedIds: readonly string[],
  selected: readonly string[],
): string {
  const chosen = new Set(selected);
  const runs: string[][] = [];
  let current: string[] = [];
  for (const id of orderedIds) {
    if (chosen.has(id)) current.push(id);
    else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs
    .map((run) =>
      run.length > 2 ? `${String(run[0])}–${String(run[run.length - 1])}` : run.join(', '),
    )
    .join(', ');
}

/**
 * Every credential group this building mentions, in declared zone order then declared group
 * order, de-duplicated.
 *
 * § 10.2 asks the editor's credential field to autocomplete *"over groups already used in this
 * building, with free entry retained. No fixed vocabulary — `core` has none and inventing one
 * would be a second source of truth."* This is that list, and it is also what the lens's own
 * picker offers.
 */
export function credentialGroupsIn(
  accessZones: readonly AccessZone[] | undefined,
): readonly string[] {
  const groups: string[] = [];
  for (const zone of accessZones ?? []) {
    for (const group of zone.credentialGroups) if (!groups.includes(group)) groups.push(group);
  }
  return groups;
}

/* -------------------------------------------------------------------------- *
 * The lens
 * -------------------------------------------------------------------------- */

/** One floor, under one credential. */
export interface CredentialLensRow {
  readonly floorId: string;
  /** Service zoning: some shaft physically reaches this floor. */
  readonly served: boolean;
  /** Access zoning: this credential opens this floor. Unrestricted floors are open to everybody. */
  readonly permitted: boolean;
  /**
   * The state a glyph draws.
   *
   * `not-served` wins when both barriers apply, because it is the physical one: no credential
   * makes a shaft exist. The two booleans above are still both recorded, and
   * {@link CredentialLensRow.alsoNotPermitted} is what a renderer reads to say the second half
   * out loud rather than hiding it behind the first.
   */
  readonly state: CredentialState;
  /** `true` when the floor is *both* unserved and closed to this credential. */
  readonly alsoNotPermitted: boolean;
  /** Groups permitted here, in declared order. Empty means unrestricted. */
  readonly permittedGroups: readonly string[];
}

export interface CredentialLens {
  /** The credential the lens is looking through. */
  readonly credentialGroup: string;
  /** One row per floor, in the order the floors were given. */
  readonly rows: readonly CredentialLensRow[];
  readonly counts: Readonly<Record<CredentialState, number>>;
}

export interface CredentialLensInput {
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
  readonly accessZones: readonly AccessZone[] | undefined;
  readonly credentialGroup: string;
}

/**
 * The three states, per floor, for one credential. Pure, and it never throws — it runs on the
 * document the reader is still typing, exactly as `previewGeometry` does.
 */
export function credentialLensFor(input: CredentialLensInput): CredentialLens {
  const served = new Set(input.shafts.flatMap((shaft) => shaft.servedFloorIds));
  const permittedBy = permittedGroupsByFloor(input.accessZones);

  const counts: Record<CredentialState, number> = {
    reachable: 0,
    'not-served': 0,
    'not-permitted': 0,
  };

  const rows = input.floors.map((floor): CredentialLensRow => {
    const groups = permittedBy.get(floor.id);
    const isServed = served.has(floor.id);
    const isPermitted = groups === undefined || groups.includes(input.credentialGroup);
    const state: CredentialState = !isServed ? 'not-served' : isPermitted ? 'reachable' : 'not-permitted';
    counts[state] += 1;
    return {
      floorId: floor.id,
      served: isServed,
      permitted: isPermitted,
      state,
      alsoNotPermitted: !isServed && !isPermitted,
      permittedGroups: groups ?? [],
    };
  });

  return { credentialGroup: input.credentialGroup, rows, counts };
}

/**
 * The lens's text alternative — `KB-13` applied to the credential lens.
 *
 * Every fact the picture carries is here in words: the counts, both failure lists **named
 * separately**, and the overlap when a floor fails both ways. A reader who cannot see the glyphs
 * still learns the distinction the lens exists to teach, which is the whole acceptance condition
 * in § 10.1.
 */
export function describeCredentialLens(lens: CredentialLens): string {
  const parts = [
    `Credential lens for ${lens.credentialGroup}: ` +
      `${String(lens.counts.reachable)} reachable, ` +
      `${String(lens.counts['not-served'])} not served, ` +
      `${String(lens.counts['not-permitted'])} not permitted.`,
  ];
  const notServed = lens.rows.filter((row) => row.state === 'not-served');
  const notPermitted = lens.rows.filter((row) => row.state === 'not-permitted');
  if (notServed.length > 0) {
    parts.push(
      `No shaft reaches ${notServed.map((row) => row.floorId).join(', ')} — service zoning.`,
    );
  }
  if (notPermitted.length > 0) {
    parts.push(
      `A shaft reaches ${notPermitted.map((row) => row.floorId).join(', ')}, and ${lens.credentialGroup} ` +
        'does not open them — access zoning.',
    );
  }
  const both = lens.rows.filter((row) => row.alsoNotPermitted);
  if (both.length > 0) {
    parts.push(
      `${both.map((row) => row.floorId).join(', ')} fail both ways: no shaft reaches them and ` +
        `${lens.credentialGroup} would not open them either.`,
    );
  }
  if (notServed.length === 0 && notPermitted.length === 0) {
    parts.push(`Every floor is reachable with ${lens.credentialGroup}.`);
  }
  parts.push(LENS_OPERATIONAL_NOTE);
  return parts.join(' ');
}
