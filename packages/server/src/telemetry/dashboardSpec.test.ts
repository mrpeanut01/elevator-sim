/**
 * **The dashboard is derived from `docs/26`, not transcribed from it** — GitHub issue #250.
 *
 * `packages/experiments/src/validation/telemetryDashboard.test.ts` (PR #453) already holds § 20
 * against § 6 *inside the document*: a fifth KPI with no panel row is red, a panel row for a KPI
 * § 6 does not define is red. This file extends the same derivation **to the code**, which is the
 * half that was missing — a document that agrees with itself and a dashboard that agrees with
 * neither is the drift the gate exists to prevent.
 *
 * Every check here derives one set from the section that **owns** the concept and one from
 * `dashboard.ts`, then requires equality both ways. Nothing is compared against a list written in
 * this file except the two things that are deliberately pinned: the ratchet's watermarks, and the
 * axis allowlist the document's own gate already keeps.
 *
 * ## The guard on the guard
 *
 * Every parser asserts it found what it expects before asserting anything about it —
 * [`RISKS.md`](../../../../RISKS.md) R40, the row about a gate that cannot go red. The § 20.2 table
 * is sliced by column index and a missing column throws rather than coalescing to `''`, which is
 * `telemetryDashboard.test.ts`'s own argument about `?? ''`: a table that lost a column would
 * otherwise read as a blank cell and every check over it would pass.
 *
 * ## #250 AC4, and why it is a ratchet rather than a sentence
 *
 * *"A rule that a criterion is raised rather than weakened when it is met."* That rule is already
 * `CLAUDE.md`'s working agreement and `docs/22-charter.md` § 4's, so the issue asks for it to be
 * **inherited**. Inheriting it as prose would leave it exactly as enforceable as it was, which is
 * not at all. {@link TARGET_RATCHET} makes it mechanical in the one direction that binds: a target
 * may move towards being harder and may never move towards being easier, and the direction is read
 * from the criterion rather than assumed, because `charter S1` is a ceiling (90 s, and raising it
 * means a *smaller* number) while `charter S2` is a floor.
 *
 * An exact pin was refused for the reason `documentation.test.ts` gives about the decision-debt
 * ceiling: *"an exact pin would go red on every commit that settles one, which trains people to
 * edit the number rather than read it."* Here it would go red on the commit that **raises** a
 * criterion, which is the commit this whole gate exists to reward.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BASELINE_UNMEASURED,
  CHAIN_BEATS_WITHOUT_EMITTER,
  DASHBOARD_PANELS,
  K2_CHAIN,
  MIN_CELL_PEOPLE,
  VISIBLE_TROUBLE_DWELL_MS,
  dashboardOf,
  type PanelSpec,
} from './dashboard.js';
import { renderDashboard } from './dashboardRender.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const TELEMETRY_DOC = 'docs/26-telemetry-and-privacy.md';
const CHARTER = 'docs/22-charter.md';

/**
 * The body of one `##`/`###` section, **without its own heading**.
 *
 * Heading excluded on purpose. `telemetryDashboard.test.ts` round 3 found a case that could not go
 * red because the slicer returned the caller's own heading glued to the body, so asserting that
 * § 20.6 mentioned *owner* was matching the word in the heading it had been handed.
 */
function section(source: string, heading: string): string {
  const start = source.indexOf(`\n${heading}`);
  expect(start, `${heading} is no longer a heading in the document this parser reads`).toBeGreaterThan(0);
  const level = heading.slice(0, heading.indexOf(' ')).length;
  const body = source.slice(start + 1);
  const rest = body.slice(body.indexOf('\n') + 1);
  const next = new RegExp(`^#{1,${level}} `, 'mu').exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/** One § 20.2 row, split into its columns, with a missing column loud rather than blank. */
interface DocPanelRow {
  readonly id: string;
  readonly reads: string;
  readonly target: string;
  readonly baseline: string;
  readonly grain: string;
}

function docPanelRows(): readonly DocPanelRow[] {
  const panels = section(read(TELEMETRY_DOC), '### 20.2 The panels');
  const rows = [...panels.matchAll(/^\| \*\*(P\d+)\*\* \|.*\|$/gmu)].map((match) => {
    const cells = match[0].split('|').map((cell) => cell.trim());
    const at = (index: number, name: string): string => {
      const value = cells[index];
      if (value === undefined) {
        throw new Error(`§ 20.2's table lost column ${String(index)} (${name}) under this parser`);
      }
      return value;
    };
    return {
      id: match[1] ?? '',
      reads: at(2, 'reads'),
      target: at(3, 'target'),
      baseline: at(4, 'baseline'),
      grain: at(6, 'grain'),
    };
  });
  expect(rows.length, '§ 20.2 has no panel rows this parser can read — the table shape moved').toBe(8);
  return rows;
}

const panelOf = (id: string): PanelSpec | undefined =>
  DASHBOARD_PANELS.find((panel) => panel.id === id);

describe('the KPI dashboard is derived from docs/26 § 20 and § 6 (GitHub issue #250)', () => {
  it('draws exactly the panels § 20.2 grants — both directions', () => {
    const declared = docPanelRows().map((row) => row.id);
    expect(
      DASHBOARD_PANELS.map((panel) => panel.id),
      'the dashboard draws a panel set § 20.2 does not grant, or misses one it does. § 18.2 bounds ' +
        'R-1 to § 6’s four KPIs and § 6.3’s four diagnostics — a ninth needs § 18.2 to move first',
    ).toEqual(declared);
  });

  it('reads exactly the KPIs § 6.2 defines — both directions', () => {
    const doc = read(TELEMETRY_DOC);
    const defined = [...section(doc, '### 6.2 The four').matchAll(/\*\*`docs\/26 (K\d+)`/gu)].map(
      (match) => `docs/26 ${match[1] ?? ''}`,
    );
    expect(defined.length, '§ 6.2 stopped naming its KPIs in the form this parser reads').toBe(4);

    expect(
      DASHBOARD_PANELS.filter((panel) => panel.kind === 'kpi')
        .map((panel) => panel.reads)
        .sort(),
      'a KPI § 6.2 defines has no panel, or a panel reads a KPI § 6.2 does not define',
    ).toEqual([...defined].sort());
  });

  it('reads exactly the diagnostics § 6.3 names — both directions', () => {
    const doc = read(TELEMETRY_DOC);
    const named = [
      ...section(doc, '### 6.3 The diagnostics, and what they are forbidden to be').matchAll(
        /^\| \*\*(.+?)\*\* \|/gmu,
      ),
    ].map((match) => match[1] ?? '');
    expect(named.length, '§ 6.3 stopped listing its diagnostics as bolded table rows').toBe(4);

    expect(
      DASHBOARD_PANELS.filter((panel) => panel.kind === 'diagnostic')
        .map((panel) => panel.reads)
        .sort(),
      '§ 18.2 bounds R-1 to § 6.3’s diagnostics — a panel reads something § 6.3 does not name, or ' +
        'a diagnostic § 6.3 names has no panel',
    ).toEqual([...named].sort());
  });

  it('carries a target on exactly the four panels § 20.2 gives one, and none on the four it does not', () => {
    const rows = docPanelRows();
    const withTarget = rows.filter((row) => !/^none\b/u.test(row.target)).map((row) => row.id);
    const withoutTarget = rows.filter((row) => /^none\b/u.test(row.target)).map((row) => row.id);

    /*
     * **The asymmetry is asserted rather than left to look like an oversight.** § 6.1: a KPI may be
     * a gate and a diagnostic may not, so a target column on P5–P8 *"would turn four explanations
     * into four gates, which is the single most likely way this dashboard does damage"* (§ 20.2).
     * Four and four, and each side named — not merely "some panels have targets".
     */
    expect(withTarget.length, '§ 20.2 no longer gives exactly four panels a target').toBe(4);
    expect(withoutTarget.length, '§ 20.2 no longer refuses exactly four panels a target').toBe(4);

    expect(
      DASHBOARD_PANELS.filter((panel) => panel.target !== null).map((panel) => panel.id),
      'the dashboard puts a target on a panel § 20.2 gives none, or drops one it grants',
    ).toEqual(withTarget);
    expect(
      DASHBOARD_PANELS.filter((panel) => panel.target === null).map((panel) => panel.id),
      'the dashboard leaves a panel targetless that § 20.2 targets, or targets a diagnostic',
    ).toEqual(withoutTarget);

    // And the two sets are the two kinds, which is § 6.1's own line rather than a coincidence.
    expect(
      DASHBOARD_PANELS.filter((panel) => panel.target !== null).map((panel) => panel.kind),
      '§ 6.1: a diagnostic may not be a gate, so a targeted panel must be a KPI',
    ).toEqual(['kpi', 'kpi', 'kpi', 'kpi']);
  });

  it('names, for each targeted panel, the charter criterion § 20.2 names', () => {
    for (const row of docPanelRows().filter((entry) => !/^none\b/u.test(entry.target))) {
      const criterion = /`(charter S\d+)`/u.exec(row.target)?.[1];
      expect(criterion, `${row.id}: § 20.2's target cell no longer names a charter criterion`).toBeDefined();
      expect(
        panelOf(row.id)?.target?.criterion,
        `${row.id} serves a different criterion from the one § 20.2 gives it`,
      ).toBe(criterion);
    }
  });

  it('takes every target value from docs/22-charter.md § 4 rather than restating one', () => {
    /*
     * § 20.2: *"Targets are the charter's, not this document's."* So the dashboard may not hold a
     * second copy of a number the charter owns — `docs/26` P-5's rule, and the one this repository
     * has recorded going stale more often than any other. Each value is re-derived from the
     * charter's own S-row here, and a charter edit that this file does not match is red.
     */
    const criteria = section(read(CHARTER), '## 4. Success criteria S1–S10');
    const rowOf = (id: string): string => {
      const row = new RegExp(`^\\| \\*\\*${id}\\*\\* \\|.*$`, 'mu').exec(criteria)?.[0];
      expect(row, `docs/22-charter.md § 4 no longer carries a ${id} row this parser can read`).toBeDefined();
      return row ?? '';
    };
    const numberIn = (row: string, pattern: RegExp, id: string): number => {
      const found = pattern.exec(row)?.[1];
      expect(found, `${id}'s figure is no longer stated in the form this parser reads`).toBeDefined();
      return Number(found);
    };

    const charterTargets: Readonly<Record<string, number>> = {
      'charter S1': numberIn(rowOf('S1'), /\*\*within (\d+) s of first load\*\*/u, 'S1'),
      'charter S2': numberIn(rowOf('S2'), /\*\*(\d+) %\*\* of first sessions/u, 'S2') / 100,
      'charter S3': numberIn(rowOf('S3'), /is (\d+) minutes or longer/u, 'S3'),
      'charter S4': numberIn(rowOf('S4'), /\*\*(\d+) %\*\* of day-one players/u, 'S4') / 100,
    };

    for (const panel of DASHBOARD_PANELS) {
      if (panel.target === null) continue;
      expect(
        panel.target.value,
        `${panel.id} publishes a target the charter does not state for ${panel.target.criterion}`,
      ).toBeCloseTo(charterTargets[panel.target.criterion] ?? Number.NaN, 6);
    }
  });

  it('declares the grain § 20.2 declares, axis for axis', () => {
    for (const row of docPanelRows()) {
      const axes = row.grain.split('×').map((axis) => axis.trim());
      expect(
        panelOf(row.id)?.axes,
        `${row.id} is sliced by axes § 20.2's grain column does not declare. § 18.3 item 1 forbids ` +
          'a per-person one, and a new axis on a privacy-bounded reader is a decision rather than a tidy-up',
      ).toEqual(axes);
      // Every partition axis is one of the panel's own, or the complement rule groups by nothing.
      for (const axis of panelOf(row.id)?.partitionAxes ?? []) {
        expect(axes, `${row.id} partitions on "${axis}", which is not in its declared grain`).toContain(axis);
      }
    }
  });

  it('runs the floor § 20.3 declares, and not a looser one', () => {
    const floor = /minimum cell size is (?:\*\*)?(\d+)(?:\*\*)? people/u.exec(
      section(read(TELEMETRY_DOC), '### 20.3 The minimum cell size'),
    )?.[1];
    expect(floor, '§ 20.3 no longer declares the floor in the form this parser reads').toBeDefined();
    expect(
      MIN_CELL_PEOPLE,
      'the code runs a floor § 20.3 does not declare. A dashboard whose floor is looser than the ' +
        'posture is the posture undone in one integer',
    ).toBe(Number(floor));
  });

  it('walks the chain § 6.2 states, beat for beat', () => {
    const beats = [
      ...section(read(TELEMETRY_DOC), '### 6.2 The four')
        .split('\n')
        .filter((line) => line.startsWith('> `'))
        .join('')
        .matchAll(/`([a-z_]+)`/gu),
    ].map((match) => match[1] ?? '');
    expect(beats.length, '§ 6.2 no longer states K2’s chain as a blockquote of backticked events').toBe(5);
    expect(
      [...K2_CHAIN],
      'the dashboard walks a chain § 6.2 does not state. K2 is the five beats of docs/23 § 3.2, ' +
        'not a funnel invented here',
    ).toEqual(beats);
  });
});

/**
 * The most demanding value each target has ever held, and the direction that means.
 *
 * **A ratchet, not a pin** (`documentation.test.ts`'s own idiom). A target may move towards harder
 * freely; it may never move towards easier. Raising one is two edits on one commit — the charter's
 * row and this watermark — which is deliberate: #250 AC4 asks for a *rule*, and a rule that costs
 * nothing to observe and nothing to break is a sentence.
 *
 * Pinned 2026-09-10 from `docs/22-charter.md` § 4 as it then stood: S1 ≤ 90 s, S2 ≥ 60 %,
 * S3 ≥ 10 minutes, S4 ≥ 25 %.
 */
const TARGET_RATCHET: Readonly<Record<string, number>> = Object.freeze({
  'charter S1': 90,
  'charter S2': 0.6,
  'charter S3': 10,
  'charter S4': 0.25,
});

describe('#250 AC4 — a criterion is raised, never weakened', () => {
  it('refuses a target that has moved towards being easier to meet', () => {
    const seen: string[] = [];
    for (const panel of DASHBOARD_PANELS) {
      if (panel.target === null) continue;
      const watermark = TARGET_RATCHET[panel.target.criterion];
      expect(
        watermark,
        `${panel.target.criterion} has no watermark. A new target enters this ratchet on the ` +
          'commit that introduces it, or the gate is watching seven of eight',
      ).toBeDefined();
      seen.push(panel.target.criterion);
      if (panel.target.direction === 'at-most') {
        expect(
          panel.target.value,
          `${panel.target.criterion} is a ceiling: ${String(panel.target.value)} is weaker than the ` +
            `recorded ${String(watermark)}. CLAUDE.md — do not weaken an acceptance criterion to ` +
            'make a phase pass. Raise it instead',
        ).toBeLessThanOrEqual(watermark ?? Number.NaN);
      } else {
        expect(
          panel.target.value,
          `${panel.target.criterion} is a floor: ${String(panel.target.value)} is weaker than the ` +
            `recorded ${String(watermark)}. CLAUDE.md — do not weaken an acceptance criterion to ` +
            'make a phase pass. Raise it instead',
        ).toBeGreaterThanOrEqual(watermark ?? Number.NaN);
      }
    }
    /*
     * The non-vacuity guard, on the instrument rather than on the defect —
     * `documentation.test.ts`'s repair to its own ratchet. A loop that iterated nothing would pass
     * every assertion above, and this is what says it did not.
     */
    expect(seen.sort(), 'the ratchet iterated a target set that is not the charter’s four').toEqual(
      Object.keys(TARGET_RATCHET).sort(),
    );
  });

  it('states each target’s direction, because a ratchet with no direction can only pin', () => {
    /*
     * `charter S1` is *within 90 s* and `charter S2` is *60 % of first sessions*. Raising the first
     * means a smaller number and raising the second means a larger one, so a gate that asserted
     * `value <= watermark` for both would forbid raising S2 and permit weakening S1. The direction
     * is read off the criterion's own words in the charter rather than declared here.
     */
    const criteria = section(read(CHARTER), '## 4. Success criteria S1–S10');
    const ceilingWords = /exceeds|falls below|Under/u;
    for (const panel of DASHBOARD_PANELS) {
      if (panel.target === null) continue;
      const id = panel.target.criterion.replace('charter ', '');
      const row = new RegExp(`^\\| \\*\\*${id}\\*\\* \\|.*$`, 'mu').exec(criteria)?.[0] ?? '';
      const failsWhen = row.split('|')[4] ?? '';
      expect(failsWhen, `${id}: the charter’s "Fails when" column is unreadable to this parser`).not.toBe('');
      const isCeiling = /exceeds/u.test(failsWhen);
      expect(
        panel.target.direction,
        `${id} fails when "${failsWhen.trim()}", which is a ${isCeiling ? 'ceiling' : 'floor'}, and ` +
          `the dashboard calls it ${panel.target.direction}`,
      ).toBe(isCeiling ? 'at-most' : 'at-least');
      expect(ceilingWords.test(failsWhen) || /Fewer|Any|regresses/u.test(failsWhen)).toBe(true);
    }
  });
});

describe('what the dashboard refuses to become (docs/26 § 20.7, § 18.3)', () => {
  it('has no date range, and the option type is read off this file’s own source', () => {
    /*
     * § 20.3 ground 2: the floor rests on the grain being fixed and pre-declared, and § 20.7 names
     * the date picker as *"the one feature that would defeat the floor while looking like a
     * convenience"*. So the check is on the shape of what the route accepts, not on a promise:
     * `DashboardOptions` has one member, and a second one is red whatever it is called.
     */
    const source = readFileSync(fileURLToPath(new URL('./dashboard.ts', import.meta.url)), 'utf8');
    const block = /export interface DashboardOptions \{([\s\S]*?)\n\}/u.exec(source)?.[1];
    expect(block, 'DashboardOptions is no longer declared in the form this parser reads').toBeDefined();
    const members = [...(block ?? '').matchAll(/^\s*readonly (\w+)\s*[?:]/gmu)].map((m) => m[1]);
    expect(
      members,
      'the route accepts a second option. A window the caller chooses is the date picker arriving ' +
        'under another name — docs/26 § 20.3 ground 2, § 20.7 item 1',
    ).toEqual(['nowMs']);
  });

  it('cannot be reached from any player-facing screen, structurally', () => {
    /*
     * § 20.7 item 4 and § 6.4's first bullet: nothing on this dashboard is ever shown to a player.
     * That is not enforced by discipline here — `packages/viz` does not depend on this package and
     * cannot import a line of it, so no player screen can draw one of these figures.
     *
     * **Which is also why this surface is deliberately absent from the honesty corpus.**
     * `packages/viz/src/honesty/surfaces.ts` sweeps player-facing strings; a string that no player
     * can reach is not one, and seeding it there would make the corpus claim a reach it does not
     * have.
     */
    const viz = JSON.parse(read('packages/viz/package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...viz.dependencies, ...viz.devDependencies };
    expect(
      Object.keys(deps),
      'packages/viz now depends on the server package, so a player-facing screen could import the ' +
        'dashboard. docs/26 § 6.4: a KPI is never shown to a player',
    ).not.toContain('@elevator-sim/server');
  });

  it('publishes no score, no rank and no figure over the eight panels', () => {
    /*
     * § D106 — energy is an axis, never a score — and § 6.4's first bullet, which is the same
     * prohibition with a worse subject: *"the charter's non-goal 1 forbids a scalar score over a
     * run; a scalar score over a person is the same prohibition with a worse subject."*
     */
    const text = renderDashboard(dashboardOf([], { nowMs: Date.parse('2026-09-10T00:00:00Z') }));
    const headings = [...text.matchAll(/^P\d+ — /gmu)];
    expect(headings.length, 'the rendered dashboard no longer draws eight panel headings').toBe(8);
    for (const word of ['overall score', 'grade', 'ranked', 'percentile', 'streak']) {
      expect(text.toLowerCase(), `the dashboard publishes a "${word}" — § D106 and docs/26 § 6.4`).not.toContain(
        word,
      );
    }
  });

  it('names no owner, and points at the register that carries the debt', () => {
    const text = renderDashboard(dashboardOf([], { nowMs: Date.parse('2026-09-10T00:00:00Z') }));
    expect(text, 'the dashboard must say the owner is unnamed rather than leave the line blank').toMatch(
      /Owner: not named/u,
    );
    expect(text, 'and must send the reader to § 20.6 for the role').toMatch(/§ 20\.6/u);
    expect(
      section(read(TELEMETRY_DOC), '## 11. What this document does not settle'),
      '§ 11 no longer registers the unnamed owner, and the dashboard says it does',
    ).toMatch(/dashboard's owner is not named/iu);
  });

  it('cites the review rather than restating it', () => {
    /*
     * § 20.5 is the only account of the cadence and the agenda. Two accounts of one rule drift
     * apart — this document's own § 20.1 — so the dashboard names the section and does not repeat
     * the four items. The check is in both directions: the citation is present, and the agenda is
     * not copied out.
     */
    const text = renderDashboard(dashboardOf([], { nowMs: Date.parse('2026-09-10T00:00:00Z') }));
    expect(text, 'the dashboard no longer cites § 20.5 for the review').toMatch(/§ 20\.5/u);
    expect(text, 'the review is monthly and the dashboard should say so once').toMatch(/monthly/iu);
    expect(
      /taken from the `buildId`|admire the graphs|explicitly nothing/u.test(text),
      'the dashboard has started restating § 20.5’s agenda. Cite it; two accounts of one rule drift apart',
    ).toBe(false);
  });
});

describe('the stale-refusal rule, mechanised (§ D227)', () => {
  it('keeps § 11’s dwell row and the code’s missing constant in step, in both directions', () => {
    /*
     * § 6.2 requires `trouble_visible` to fire on a threshold **and** a declared dwell. § 11
     * registers the dwell as owed by M2 with the stage, and #340's emitter says the same thing: the
     * shipped alarm has a threshold on forty people standing and no wall-clock dwell.
     *
     * So P1 is refused whole today, and the two halves cannot drift: the day the dwell lands, § 11's
     * row is struck through on this repository's own idiom and this case goes red until
     * `VISIBLE_TROUBLE_DWELL_MS` stops being `null`. The day somebody sets the constant without the
     * document moving, it goes red the other way.
     */
    const registered = section(read(TELEMETRY_DOC), '## 11. What this document does not settle');
    const row = /^- .*visible-trouble threshold and dwell.*$/mu.exec(registered)?.[0];
    expect(row, '§ 11 no longer carries the visible-trouble dwell as an open item at all').toBeDefined();
    const owed = !(row ?? '').includes('~~');

    expect(
      VISIBLE_TROUBLE_DWELL_MS === null,
      owed
        ? '§ 11 still registers the visible-trouble dwell as owed, so the dashboard may not have one'
        : '§ 11 has struck the dwell row through, so the dwell exists and the dashboard must use it ' +
          'rather than refusing P1 by name (§ D227 — a stale refusal leaves on the commit that makes it false)',
    ).toBe(owed);
  });

  it('refuses P1 by name while the dwell is missing, rather than drawing a figure about it', () => {
    const view = dashboardOf([], { nowMs: Date.parse('2026-09-10T00:00:00Z') });
    const p1 = view.panels.find((panel) => panel.panel.id === 'P1');
    expect(p1?.silence, 'P1 draws without a dwell, which § 6.2 says would measure nothing').toMatch(
      /dwell does not exist yet/u,
    );
    expect(p1?.partitions, 'a refused panel may not also publish cells').toEqual([]);
  });

  it('keeps the unemitted chain beats and the client’s own register in step, in both directions', () => {
    /*
     * **The second stale-refusal pair, and the one #250 nearly shipped without.** `docs/26 K2`'s
     * chain runs through `rerun_same_crowd`, which no shipped surface emits — registered with what
     * blocks it in the client's `UNEMITTED_EVENTS`, asserted there in both directions by
     * `packages/viz/src/telemetry/schema.test.ts`. A chain carrying an unemitted event cannot close,
     * so P2's completion share can only read 0 % and P5's every cell is an artefact.
     *
     * The server may not import `packages/viz`, so the register is read as **text**. The parser has
     * its own guard: it must find the declaration before it asserts anything about the contents,
     * which is `RISKS.md` R40 on a check whose subject is expected to become empty. Once it is
     * empty this case is vacuous *and harmless* — there is no refusal left to go stale — and until
     * then a broken parser returns `[]` and goes red against a non-empty constant, which is the
     * direction that matters today.
     */
    const schema = read('packages/viz/src/telemetry/schema.ts');
    const block = /export const UNEMITTED_EVENTS[\s\S]*?\n\);/u.exec(schema)?.[0];
    expect(
      block,
      'packages/viz/src/telemetry/schema.ts no longer declares UNEMITTED_EVENTS in the form this ' +
        'parser reads, so the dashboard’s refusal is pinned to nothing',
    ).toBeDefined();

    const registered = [...(block ?? '').matchAll(/^\s+([a-z][a-z0-9_]+):/gmu)].map((m) => m[1] ?? '');

    /*
     * **The guard on the guard, and it is the half a reformat would otherwise eat.** Parsing zero
     * keys has two causes that mean opposite things: the register really is empty, or the parser
     * stopped matching it. Only the first is allowed to reach the assertion below, so an empty
     * parse must be corroborated by the object body actually being empty. Without this, a
     * reformatter that moved the indentation would make this case announce *every beat now has an
     * emitter* — the most misleading message it could possibly produce.
     */
    if (registered.length === 0) {
      expect(
        /Object\.freeze\(\s*\{\s*\},?\s*\)/u.test(block ?? ''),
        'this parser found no entries in UNEMITTED_EVENTS and the object is not empty either, so ' +
          'it has stopped reading the register rather than found it discharged',
      ).toBe(true);
    }

    const unemittedBeats = K2_CHAIN.filter((beat) => registered.includes(beat));

    expect(
      [...CHAIN_BEATS_WITHOUT_EMITTER].sort(),
      unemittedBeats.length === 0
        ? 'every beat of docs/26 K2 now has a shipped emitter, so the chain can close and P2/P5 ' +
          'must stop refusing (§ D227 — a stale refusal leaves on the commit that makes it false)'
        : 'the client registers a K2 beat as unemitted that this dashboard does not refuse for, or ' +
          'refuses for one the client says is emitted. A completion share over an unemitted beat ' +
          'can only read 0 %, and it would read it against charter S2’s target',
    ).toEqual([...unemittedBeats].sort());
  });

  it('refuses P2 and P5 by name while a beat has no emitter, and publishes no zero', () => {
    const view = dashboardOf([], { nowMs: Date.parse('2026-09-10T00:00:00Z') });
    const refused = view.panels.filter((panel) => ['P2', 'P5'].includes(panel.panel.id));
    expect(refused.length, 'P2 and P5 are no longer both on the dashboard').toBe(2);
    for (const panel of refused) {
      expect(
        // `?? ...` rather than the bare value: a panel that stopped refusing returns `null`, and
        // `toMatch(null)` throws about argument types instead of naming the panel that started drawing.
        panel.silence ?? `(${panel.panel.id} published cells instead of refusing)`,
        `${panel.panel.id} draws docs/26 K2 while its chain carries a beat nothing emits`,
      ).toMatch(/chain cannot close/u);
      expect(panel.partitions, `${panel.panel.id}: a refused panel may not also publish cells`).toEqual(
        [],
      );
    }
    // And the refusal names the beat rather than the condition, so the reader's next question is answered.
    expect(refused[0]?.silence).toContain(CHAIN_BEATS_WITHOUT_EMITTER[0] ?? '');
  });
});

describe('the baseline is refused by name and cannot degrade into a number (§ 20.4)', () => {
  it('reads `unmeasured` on every KPI panel, and § 20.2’s table says the same', () => {
    for (const row of docPanelRows()) {
      const panel = panelOf(row.id);
      if (panel?.kind !== 'kpi') continue;
      expect(
        row.baseline,
        `${row.id}: § 20.2's baseline cell no longer refuses by name, so the code and the document ` +
          'would disagree about whether a number exists',
      ).toMatch(/^`?unmeasured`?\b/u);
    }
    for (const view of dashboardOf([], { nowMs: 0 }).panels) {
      if (view.panel.kind !== 'kpi') continue;
      expect(view.baseline?.reading, `${view.panel.id}: a KPI panel with no baseline reading`).toBe(
        'unmeasured',
      );
    }
  });

  it('never publishes a numeral where the baseline goes', () => {
    /*
     * **The positive control this case exists for.** `unmeasured` degrading to `0` is not a
     * cosmetic slip: zero is a measurement and `unmeasured` is a refusal, and a dashboard that
     * confused them would publish a finding nobody made — the suppressed-mean defect
     * `CLAUDE.md` records, with a person as the subject.
     *
     * The boundary is checked against the value the defect would really have. A baseline that
     * became a number would become `0`, because that is what an unmeasured accumulator holds, and
     * `0` is the one numeral a laxer check would let through as falsy.
     */
    expect(BASELINE_UNMEASURED.reading).toBe('unmeasured');
    expect(
      /^\s*[-+]?\d/u.test(BASELINE_UNMEASURED.reading),
      'the baseline opens with a figure. § 20.4 refuses all four by name until the first complete ' +
        'window after ingest begins',
    ).toBe(false);

    const text = renderDashboard(dashboardOf([], { nowMs: 0 }));
    const baselineLines = text.split('\n').filter((line) => line.trim().startsWith('Baseline:'));
    expect(baselineLines.length, 'the rendered dashboard draws no baseline line at all').toBe(4);
    for (const line of baselineLines) {
      expect(line, 'a baseline line published a figure where § 20.4 refuses one').toMatch(
        /^\s*Baseline: unmeasured\b/u,
      );
    }
  });
});
