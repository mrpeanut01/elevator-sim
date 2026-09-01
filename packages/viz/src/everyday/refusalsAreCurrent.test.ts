/**
 * **No refusal a player can read may say a screen is unbuilt while the registry says it is built**
 * — GitHub issue #230's second acceptance criterion, *"a check is added that fails when a refusal
 * string names a feature that now exists, since this is the second time that shape has occurred"*.
 *
 * The two occurrences the criterion counts:
 *
 * 1. [§ D227](../../../../DECISIONS.md) — the traffic editor's *mean group size* row drew a refusal
 *    saying *"no field of `SimulationDemandOptions` carries it … moving it would change this
 *    summary line and no passenger"* for every wave after `trafficProfilesWithPattern` made the
 *    control live. A refusal a player can read, about a control that worked.
 * 2. [§ D350](../../../../DECISIONS.md) / GitHub issue #217 — `modes.ts`' Fix-a-building row read
 *    *"the three cases run, but their Everyday screen is not built yet"* after eighteen cases and
 *    the screen had both shipped.
 *
 * ## What this checks, and it is narrower than the criterion's sentence
 *
 * Over the whole refusal corpus this package registers — the six `*_ABSENCES` lists, the keyed
 * `UNBUILT_REASONS` table, and `modes.ts`' `unlessBuilt` literals, which are read as **source**
 * because every tile is playable and no literal is ever evaluated — no entry may pair an
 * **is-not-built phrase** with the **name of a screen the registry reports as built**.
 *
 * That is a hard fact on both sides: `EVERYDAY_SCREENS_BUILT` is derived from the module table
 * rather than declared, and `SCREEN_NAMES` is § 4's own name column. So neither half of the
 * comparison is a sentence, which is what [§ D227](../../../../DECISIONS.md) requires — *a refusal
 * is pinned by a run, never by another sentence*.
 *
 * ### The corpus splits in two, and the two halves are checked differently on purpose
 *
 * A **keyed** refusal — `UNBUILT_REASONS[key]`, or `unlessBuilt(sentence, ...keys)` — is gated on
 * named screens and is therefore *entitled* to call those screens unbuilt: withdrawing the sentence
 * when they land is exactly what the gate does. What it may not do is name a screen **outside its
 * own gate**, because no gate will ever withdraw that clause. So the keyed half compares the
 * sentence against `SCREEN_NAMES` minus the gate, which is two hard facts and no judgement.
 *
 * An **unkeyed** entry — the six `*_ABSENCES` lists — has no gate at all: it is prose a player
 * reads, withdrawn only by somebody deleting it. There the only handle is the name, and the match
 * is **case-sensitive** against § 4's authored title case. That is not fastidiousness. Matched
 * case-insensitively, `SCREEN_NAMES.stage` — *The day* — hits the ordinary phrase *the day* in any
 * sentence about a run, and the first draft of this file duly went red on `modes.ts`'
 * *"the day runs, but its Everyday screens are not built yet"*, which names no screen at all. A
 * guard that fires on correct copy is a guard whose rule gets relaxed by the next person to meet
 * it, so the looser match was refused rather than allowlisted around.
 *
 * ## What it cannot check, said rather than implied
 *
 * **It cannot decide, in general, whether a refusal names a feature that now exists.** *Feature*
 * has no registry; only screens do. A row reading *"Racing a second dispatcher — no run in this
 * build sends two dispatchers at the same crowd"* becomes false the day such a run ships, and
 * nothing here would notice. That entry is triaged to an issue in `buildNotes.test.ts`, which is
 * the honest instrument for that half: a person closes the issue and deletes the row.
 *
 * **And the § D227 shape itself is now covered elsewhere, which is why this file does not chase
 * it.** Its refusal named a *field* — `SimulationDemandOptions` — on a player surface, and
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion bars a code identifier from a player surface
 * outright, measured by `honesty/properties.ts`' `internal-notation` on every case of every run. A
 * second check for the same string would be a gate reading zero off zero. What this file adds is
 * the *other* occurrence's shape, which no property covers: a refusal that is about the product's
 * own inventory.
 *
 * The vocabulary is deliberately small and listed rather than inferred. A phrasing this file does
 * not know is a phrasing it does not check, and pretending otherwise — by reaching for a looser
 * pattern that also matched *"the daily board … needs a server"* — would trade a real check for a
 * suite that goes red on correct copy and gets its rule relaxed by the next person to meet it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CAMPAIGN_ABSENCES } from '../campaign/career.js';
import { EVERYDAY_SHELL_ABSENCES } from './buildNotes.js';
import { DESIGNER_ABSENCES } from './designerModel.js';
import { RUSH_ABSENCES } from './rushScreenModel.js';
import { EVERYDAY_SCREENS_BUILT, SCREEN_NAMES, UNBUILT_REASONS } from './screens.js';
import { SETTINGS_ABSENCES } from './settingsView.js';
import { STAGE_ABSENCES } from './stageScreenModel.js';
import type { EverydayScreen } from './types.js';

const MODES_SOURCE = readFileSync(fileURLToPath(new URL('./modes.ts', import.meta.url)), 'utf8');

/**
 * A refusal, with the screen keys it is **gated on** where it has any.
 *
 * `gate` is what makes the keyed half of this file a comparison between two hard facts rather than
 * between a sentence and a substring: a refusal gated on `['door', 'brief', 'stage', 'report',
 * 'week']` is *entitled* to say those five are unbuilt, and saying so is what it is for. What it
 * may not do is name a **sixth** screen — one outside its own gate — as unbuilt, because nothing
 * would ever withdraw that clause.
 */
interface Refusal {
  readonly where: string;
  readonly text: string;
  /** `undefined` where the register has no key — see the header's note on the six lists. */
  readonly gate: readonly EverydayScreen[] | undefined;
}

/** The six `*_ABSENCES` lists: player-readable prose with no key attached. */
function unkeyedRegisters(): readonly Refusal[] {
  const registers: readonly (readonly [string, readonly string[]])[] = [
    ['campaign/career.ts#CAMPAIGN_ABSENCES', CAMPAIGN_ABSENCES],
    ['everyday/buildNotes.ts#EVERYDAY_SHELL_ABSENCES', EVERYDAY_SHELL_ABSENCES],
    ['everyday/designerModel.ts#DESIGNER_ABSENCES', DESIGNER_ABSENCES],
    ['everyday/rushScreenModel.ts#RUSH_ABSENCES', RUSH_ABSENCES],
    ['everyday/settingsView.ts#SETTINGS_ABSENCES', SETTINGS_ABSENCES],
    ['everyday/stageScreenModel.ts#STAGE_ABSENCES', STAGE_ABSENCES],
  ];
  return registers.flatMap(([where, register]) =>
    register.map((text) => ({ where, text, gate: undefined })),
  );
}

/** `UNBUILT_REASONS` and `modes.ts`' `unlessBuilt` literals — the refusals that carry their keys. */
function keyedRefusals(): readonly Refusal[] {
  const entries: Refusal[] = [];
  for (const [key, text] of Object.entries(UNBUILT_REASONS)) {
    if (text === undefined) continue;
    entries.push({
      where: `everyday/screens.ts#UNBUILT_REASONS.${key}`,
      text,
      gate: [key as EverydayScreen],
    });
  }
  /*
   * Source, not exports. Every tile is playable, so `unlessBuilt` returns `undefined` on all four
   * rows and no literal is ever evaluated — a string on a branch that does not run cannot be
   * reached through the module's exports, which is the blindness issue #217 was found inside. The
   * call's *arguments* are read for the same reason: the gate is data the runtime discards.
   */
  for (const hit of MODES_SOURCE.matchAll(/unlessBuilt\(\s*'([^']*)',([^)]*)\)/gu)) {
    const keys = [...(hit[2] ?? '').matchAll(/'([a-z]+)'/gu)].map(
      (key) => (key[1] ?? '') as EverydayScreen,
    );
    entries.push({ where: 'everyday/modes.ts#unlessBuilt', text: hit[1] ?? '', gate: keys });
  }
  return entries;
}

/** Everything, for the non-vacuity case. */
function refusalCorpus(): readonly Refusal[] {
  return [...unkeyedRegisters(), ...keyedRefusals()];
}

/** The phrasings that assert a thing has not been built. Listed, never inferred — see the header. */
const NOT_BUILT = /\b(?:is|are|was|were)\s+not\s+built\b|\bnot\s+built\s+yet\b|\bis\s+not\s+drawn\b/iu;

describe('no registered refusal says a built screen is unbuilt (GitHub issue #230)', () => {
  it('has a corpus to check, and a registry to check it against', () => {
    // Non-vacuity on both sides. A register renamed out from under an import, or a registry that
    // stopped deriving, would leave every case below passing over nothing — the trap
    // `deadCode.test.ts` and `viewportGateClaims.test.ts` are both built around.
    expect(
      refusalCorpus().length,
      'no refusal strings were collected, so this suite is watching nothing. A register was ' +
        'renamed or emptied: retarget the imports, or delete this file — but a guard that reads ' +
        'an empty corpus must not report as green.',
    ).toBeGreaterThan(10);
    expect(
      EVERYDAY_SCREENS_BUILT.length,
      'the screen registry reports nothing built, which cannot be true of a shipping shell and ' +
        'would make the comparison below vacuous in the direction that hides a stale refusal.',
    ).toBeGreaterThan(0);
  });

  it('knows the phrasing it is looking for, on strings that carry it', () => {
    /*
     * A positive control for the pattern itself. The two sentences below are the historical
     * defects' own words; a regex that stopped matching them would make the real case pass
     * silently, which is the failure mode of every prose guard in this repository.
     */
    expect(NOT_BUILT.test('the cases run, but their Everyday screen is not built yet')).toBe(true);
    expect(NOT_BUILT.test('the Switch to Engineer row is that door and it is not built')).toBe(true);
    // …and a negative control, because a pattern that matched everything would be worse than none.
    expect(NOT_BUILT.test('a ranking of other people’s runs needs a server to post them to')).toBe(
      false,
    );
  });

  it('lets no keyed refusal call a screen outside its own gate unbuilt', () => {
    const built = new Set<EverydayScreen>(EVERYDAY_SCREENS_BUILT);
    const stale: string[] = [];
    for (const { where, text, gate } of keyedRefusals()) {
      if (gate === undefined || !NOT_BUILT.test(text)) continue;
      for (const [key, name] of Object.entries(SCREEN_NAMES)) {
        const screen = key as EverydayScreen;
        // A refusal is entitled to say the screens it gates on are unbuilt — that is its job.
        if (gate.includes(screen) || !built.has(screen)) continue;
        if (!text.toLowerCase().includes(name.toLowerCase())) continue;
        stale.push(`${where}: "${text}" calls ${name} unbuilt; it is registered and is not in the gate`);
      }
    }
    expect(
      stale,
      'a refusal says a screen is not built, that screen is registered, and it is not one of the ' +
        'keys the refusal is gated on — so nothing will ever withdraw the clause. This is ' +
        '§ D227’s class and the second time it has occurred: a refusal a player can read tells ' +
        'them not to touch a thing that works, and one on a dead branch misleads a reader of the ' +
        'file about whether a screen exists, which is the one question this package is the ' +
        'authority on.',
    ).toEqual([]);
  });

  it('lets no unkeyed register call a built screen unbuilt', () => {
    const built = new Set<EverydayScreen>(EVERYDAY_SCREENS_BUILT);
    const stale: string[] = [];
    for (const { where, text } of unkeyedRegisters()) {
      if (!NOT_BUILT.test(text)) continue;
      for (const [key, name] of Object.entries(SCREEN_NAMES)) {
        if (!built.has(key as EverydayScreen)) continue;
        /*
         * **Case-sensitive, and that is the whole reason this half is a separate case.** These
         * registers carry no key, so the only handle is § 4's name column — and matched
         * case-insensitively, `SCREEN_NAMES.stage` (*The day*) hits the ordinary phrase *the day*
         * in any sentence about a run. Measured: the first draft of this file went red on
         * `modes.ts`' *"the day runs, but its Everyday screens are not built yet"*, which names no
         * screen at all. § 4's names are authored in title case, so requiring the authored casing
         * is what separates a reference to the screen from a reference to a day.
         */
        if (!text.includes(name)) continue;
        stale.push(`${where}: "${text}" names ${name}, which is registered`);
      }
    }
    expect(
      stale,
      'an absence register says a built screen is not built. These six lists are prose a player ' +
        'reads with no gate behind them, so nothing withdraws an entry but somebody deleting it — ' +
        'which is why `buildNotes.test.ts` triages each one to an issue and why this is the ' +
        'clause worth failing loudly.',
    ).toEqual([]);
  });
});
