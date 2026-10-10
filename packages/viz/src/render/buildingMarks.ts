/**
 * **The two standing facts the stage could not draw** — GitHub issue #544, `DECISIONS.md` § D1307.
 *
 * #544 inventoried what a player can read off the building while a day plays. Sky lobbies were
 * drawn (`⇄`, RV-07) and express banks gained a mark in § D624. Two facts were left with nothing to
 * draw from, because the recording never carried them: **where a credential decides who may ride**,
 * and **where floors are joined by an escalator or a stair** instead of a lift. Recording version 17
 * carries both ({@link VizRecording.accessZones}, {@link VizRecording.transportModes}), and this
 * module is the one place their marks are decided, so the Engineer schematic
 * (`render/canvas.ts#drawFloors`) and the § 7 stage (`everyday/cutaway.ts`) cannot spell one fact
 * two ways.
 *
 * ## The marks, and the three access marks that must stay three
 *
 * | mark | fact | where it comes from |
 * |---|---|---|
 * | `⊘` | no shaft reaches this floor (service zoning) | the shafts' served floors |
 * | `⚿` | a credential decides who may ride to this floor (access zoning, the building's) | {@link VizRecording.accessZones} |
 * | `▩` | a call here went unserved because of a credential, in this run (access zoning, an outcome) | `access/lockedOut.ts` |
 * | `⇅` | an escalator serves this landing | {@link VizRecording.transportModes} |
 * | `⋰` | a stair serves this landing | {@link VizRecording.transportModes} |
 *
 * `⚿` is the design handoff's own badge for a secure floor (`docs/design/elevator-sim-reimagined.dc.html`
 * `:2042`). The stage lane refused it in wave 10 (`WAVE10_PLAN.md` § 6) because the only way to feed
 * it then was a `secure` flag on the floor, which would collapse access zoning into the floor's
 * geometry. That ground is kept, and it is why the mark is fed by the zone list rather than by a
 * floor field: `VizFloor` still has no such flag, and `▩` keeps meaning the outcome. `⇅` is the
 * casual handoff's escalator mark (`docs/design/elevator-sim-casual.dc.html:5897`, *"an escalator
 * serves this landing"*). The handoff draws no stair, so `⋰` is this module's, and `docs/12` § 4.19
 * registers both.
 *
 * ## Why the words are not here
 *
 * The sentence a reader without the picture gets is `render/describeFrame.ts`'s, built from the same
 * two fields. A glyph says *where*; only the sentence can say *which credentials*, which is the
 * content `docs/10` § 10.4 asks the stage to carry.
 */

import type { TransportModeKind } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

/** A floor inside at least one access zone. */
export const ACCESS_ZONE_GLYPH = '⚿';

/** A landing an escalator or a stair serves, by what it is. */
export const TRANSPORT_MODE_GLYPHS: Readonly<Record<TransportModeKind, string>> = Object.freeze({
  escalator: '⇅',
  stairs: '⋰',
});

/**
 * Each marked floor's suffix for the label gutter — `' ⇅'`, `' ⚿'`, `' ⇅⚿'` — keyed by floor id.
 *
 * A floor with no mark is absent, so a building that declares neither block gets an empty map and
 * its gutter draws exactly what it drew at version 16. The transport mark comes first and the zone
 * mark second on a floor carrying both, and an escalator and a stair on one landing draw one glyph
 * each, in {@link TRANSPORT_MODE_GLYPHS}' order.
 */
export function floorMarksOf(
  recording: Pick<VizRecording, 'accessZones' | 'transportModes'>,
): ReadonlyMap<string, string> {
  const kindsByFloor = new Map<string, Set<TransportModeKind>>();
  for (const mode of recording.transportModes ?? []) {
    for (const floorId of mode.floorIds) {
      const kinds = kindsByFloor.get(floorId) ?? new Set<TransportModeKind>();
      kinds.add(mode.kind);
      kindsByFloor.set(floorId, kinds);
    }
  }
  const zoned = new Set((recording.accessZones ?? []).flatMap((zone) => zone.floorIds));
  const marks = new Map<string, string>();
  for (const floorId of new Set([...kindsByFloor.keys(), ...zoned])) {
    const kinds = kindsByFloor.get(floorId);
    const transport = (Object.keys(TRANSPORT_MODE_GLYPHS) as TransportModeKind[])
      .filter((kind) => kinds?.has(kind) === true)
      .map((kind) => TRANSPORT_MODE_GLYPHS[kind])
      .join('');
    /*
     * Joined rather than templated: a template's substitutions read as prose to the honesty
     * deriver's scanner, and this function composes glyphs, never words.
     */
    marks.set(floorId, [' ', transport, zoned.has(floorId) ? ACCESS_ZONE_GLYPH : ''].join(''));
  }
  return marks;
}

/**
 * Which banks skip at least one floor between the lowest and highest they serve — an express or
 * shuttle bank's shape, read off the geometry a shaft already carries rather than from an authored
 * field. GitHub issue #544, [§ D624](../../../../DECISIONS.md): `docs/12` § 4.5 already establishes
 * that a bank's shuttle-vs-local role is *"derived from the bank structure rather than assigned"* —
 * there is no `kind` on `BankConfig` to read, and this is that derivation, reaching the render layer
 * rather than staying a fact only the config layer knows.
 *
 * A local bank's `servedFloorIds` are contiguous once mapped onto {@link VizFloor.index} — every
 * floor between the lowest it stops at and the highest is one it also stops at. A shuttle or express
 * bank skips floors on the way to a sky lobby or an observatory deck, so its served set has a gap.
 * One car with the gap is enough to mark the whole bank, matching how a bank is one unit everywhere
 * else this renderer treats it (RV-06's grouping, `#stageCameraWindowOf`'s bank filter).
 *
 * **Here rather than in `render/canvas.ts` since § D1307**, so the § 7 stage (`everyday/cutaway.ts`)
 * draws the same mark from the same answer; until then only the Engineer schematic drew it, and
 * #544's ask was the stage a day is played on.
 */
export function expressBankIdsOf(recording: VizRecording): ReadonlySet<string> {
  const indexById = new Map(recording.floors.map((floor) => [floor.id, floor.index]));
  const servedIndicesByBank = new Map<string, Set<number>>();
  for (const shaft of recording.shafts) {
    const indices = servedIndicesByBank.get(shaft.bankId) ?? new Set<number>();
    for (const floorId of shaft.servedFloorIds) {
      const index = indexById.get(floorId);
      if (index !== undefined) indices.add(index);
    }
    servedIndicesByBank.set(shaft.bankId, indices);
  }
  const express = new Set<string>();
  for (const [bankId, indices] of servedIndicesByBank) {
    if (indices.size < 2) continue;
    const min = Math.min(...indices);
    const max = Math.max(...indices);
    if (max - min + 1 > indices.size) express.add(bankId);
  }
  return express;
}
