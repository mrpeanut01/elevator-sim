/**
 * **What the dashboard does with rows** — GitHub issue #250,
 * [`docs/26-telemetry-and-privacy.md`](../../../../docs/26-telemetry-and-privacy.md) § 20.
 *
 * `dashboardSpec.test.ts` holds the shape against the document. This file drives the arithmetic:
 * the floor, § 20.3 ground 3's complement rule, `docs/26 K4`'s unclosed window, the two panels
 * `docs/26 K2` cannot close, and the empty state that has to say *nobody has consented* rather than
 * *nothing happened*.
 *
 * ## The boundary is checked against the value the defect would really have
 *
 * A floor written `> 20` instead of `>= 20` publishes a cell of exactly twenty people. A floor read
 * off `observations` instead of `people` publishes a cell holding one person who met a refusal
 * twenty-five times. Both are checked here at the value that separates them, not at a comfortable
 * distance from it — this repository has had three guards pass their own positive controls by
 * testing 5 against a floor of 20.
 *
 * ## Which panel each case is driven on, and why that moved
 *
 * P2 and P5 used to carry the floor and complement cases, because a completion share and a
 * beat-drop partition are the two shapes those rules are written about. **Both are now refused
 * whole** while `docs/26 K2`'s chain carries a beat nothing emits, so neither can show a floor
 * decision at all: the floor cases run on **P3**, the complement cases on **P8**, and the
 * rate-with-its-count cases on **P4**. Same `applyFloor` call, same arithmetic, a panel that still
 * publishes. Said here rather than left for a reader to infer from a fixture.
 */

import { describe, expect, it } from 'vitest';

import type { TelemetryEventRow } from '../store/store.js';

import {
  DASHBOARD_PANELS,
  K2_CHAIN,
  MIN_CELL_PEOPLE,
  dashboardOf,
  type PanelView,
} from './dashboard.js';
import { renderDashboard } from './dashboardRender.js';

const MONTH_START = Date.parse('2026-04-01T00:00:00.000Z');
const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const BUILD = 'abc0123456';

let nextId = 0;

/** One row, with everything the panels do not care about held constant. */
function row(
  playerId: string,
  sessionId: string,
  name: string,
  atMs: number,
  fields: Readonly<Record<string, unknown>> = {},
  receivedAtMs: number = MONTH_START,
  buildId: string = BUILD,
): TelemetryEventRow {
  nextId += 1;
  return {
    id: `row-${String(nextId)}`,
    playerId,
    sessionId,
    buildId,
    name,
    atMs,
    fields,
    receivedAtMs,
  };
}

/** A first session that walks `docs/26 K2`'s whole chain, in order. */
function completedSession(n: number, receivedAtMs = MONTH_START): readonly TelemetryEventRow[] {
  const player = `p${String(n)}`;
  const session = `s${String(n)}`;
  return K2_CHAIN.map((name, index) =>
    row(
      player,
      session,
      name,
      index * 1000,
      name === 'session_start'
        ? { entryScreenKey: 'menu' }
        : name === 'verdict_shown'
          ? { verdictKind: 'cleared', refusalGround: null, screenKey: 'report' }
          : {},
      receivedAtMs,
    ),
  );
}

/** A first session that stops after `run_observed` — beat `change_made` never arrives. */
function stalledSession(n: number, screenKey = 'stage'): readonly TelemetryEventRow[] {
  const player = `q${String(n)}`;
  const session = `t${String(n)}`;
  return [
    row(player, session, 'session_start', 0, { entryScreenKey: 'menu' }),
    row(player, session, 'screen_entered', 500, { screenKey, fromScreenKey: 'menu' }),
    row(player, session, 'run_observed', 1000, { run: {}, reachedEndedAt: true }),
  ];
}

/** A **second** session for the player {@link completedSession} gave `n` — `docs/26 K4`'s return. */
function returnSession(n: number, receivedAtMs: number): readonly TelemetryEventRow[] {
  return [
    row(`p${String(n)}`, `r${String(n)}`, 'session_start', 0, { entryScreenKey: 'menu' }, receivedAtMs),
  ];
}

const panel = (view: ReturnType<typeof dashboardOf>, id: string): PanelView => {
  const found = view.panels.find((entry) => entry.panel.id === id);
  if (found === undefined) throw new Error(`no panel ${id}`);
  return found;
};

describe('the source note distinguishes an empty cohort from a quiet one', () => {
  it('says nobody has consented rather than nothing happened', () => {
    const view = dashboardOf([], { nowMs: NOW });
    expect(view.source.kind).toBe('empty');
    expect(view.source.sentence).toMatch(/consented/u);
    expect(view.source.sentence).toMatch(/not the same sentence as nothing happened/u);
    // And the renderer carries it, because a view nobody draws is not an empty state.
    expect(renderDashboard(view)).toMatch(/consent/iu);
  });
});

describe('docs/26 § 20.3 — the floor, and what it counts', () => {
  /*
   * **Driven on P3 rather than P2, and the move is the finding this file exists to record.** P2 and
   * P5 are refused whole while `docs/26 K2`'s chain carries a beat nothing emits, so neither can
   * show a floor decision any more. P3 is the other single-cell KPI panel and the arithmetic under
   * test is the same `applyFloor` call.
   */
  it('publishes a cell of exactly the floor and refuses one a single person short', () => {
    const atFloor = Array.from({ length: MIN_CELL_PEOPLE }, (_, index) =>
      completedSession(index),
    ).flat();
    const published = panel(dashboardOf(atFloor, { nowMs: NOW }), 'P3');
    expect(
      published.partitions[0]?.cells[0]?.kind,
      `a cell of exactly ${String(MIN_CELL_PEOPLE)} people clears the floor — § 20.3 says "under it", ` +
        'so a `>` where a `>=` belongs would refuse this one',
    ).toBe('published');

    const oneShort = Array.from({ length: MIN_CELL_PEOPLE - 1 }, (_, index) =>
      completedSession(index),
    ).flat();
    const refused = panel(dashboardOf(oneShort, { nowMs: NOW }), 'P3');
    expect(
      refused.partitions[0]?.cells[0]?.kind,
      `a cell of ${String(MIN_CELL_PEOPLE - 1)} people is under the floor and must be refused by name`,
    ).toBe('refused');
  });

  it('counts distinct players, never events — one person meeting the floor’s worth of refusals', () => {
    /*
     * § 20.3: *"A floor stated in people and applied to events would be a floor of one person twenty
     * times over, which is the disclosure it exists to prevent wearing the arithmetic of the thing
     * that prevents it."* One player, twenty-five encounters, one cell.
     */
    const events = Array.from({ length: MIN_CELL_PEOPLE + 5 }, (_, index) =>
      row('lonely', 'one-session', 'refusal_shown', index * 100, {
        refusalKind: 'withheld',
        screenKey: 'report',
      }),
    );
    const p6 = panel(dashboardOf(events, { nowMs: NOW }), 'P6');
    expect(
      p6.partitions[0]?.cells[0]?.kind,
      'twenty-five encounters by one person cleared a floor stated in people',
    ).toBe('refused');
  });

  it('puts no number on a refused cell, so a reader has nothing to un-suppress', () => {
    /*
     * § 18.2's R-1 bound: *"the minimum cell size is enforced in the route, not in the reader — a
     * dashboard that filters small cells is one query away from a dashboard that does not."* Here
     * that is structural: the refused cell object has no value, no interval and no counts on it at
     * all, so the renderer is not trusted with the number — it is never handed one.
     */
    const oneShort = Array.from({ length: 3 }, (_, index) => completedSession(index)).flat();
    const cell = panel(dashboardOf(oneShort, { nowMs: NOW }), 'P3').partitions[0]?.cells[0];
    expect(cell?.kind).toBe('refused');
    expect(
      Object.keys(cell ?? {}).sort(),
      'a refused cell grew a field. Anything numeric here is the floor moving back into the reader',
    ).toEqual(['axes', 'kind', 'reason']);
    expect(renderDashboard(dashboardOf(oneShort, { nowMs: NOW }))).not.toMatch(/n = 3 people/u);
  });
});

describe('docs/26 § 20.3 ground 3 — the complement, which a per-cell floor is blindest to', () => {
  /*
   * **Driven on P8 rather than P5**, for the reason the floor cases moved off P2: P5 is refused
   * whole while a chain beat has no emitter. P8 is the other panel whose partition holds many cells
   * — one per screen key — so it exercises the same `applyFloor` branch on the same shape, and the
   * ground-3 argument transfers intact: a screen's refused entry count is the partition's published
   * total less its published siblings.
   */
  const threeScreens = (): readonly TelemetryEventRow[] => [
    ...Array.from({ length: MIN_CELL_PEOPLE + 2 }, (_, index) => stalledSession(index, 'stage')).flat(),
    ...Array.from({ length: MIN_CELL_PEOPLE + 6 }, (_, index) =>
      stalledSession(100 + index, 'report'),
    ).flat(),
    ...Array.from({ length: 3 }, (_, index) => stalledSession(200 + index, 'settings')).flat(),
  ];

  it('refuses a second cell when one is refused, so the first is not recoverable by subtraction', () => {
    /*
     * Three cells: two over the floor on different screens, one holding three people. The floor
     * refuses one; the rule refuses two — *"no overlapping window involved, and the floor satisfied
     * at every step."*
     */
    const partition = panel(dashboardOf(threeScreens(), { nowMs: NOW }), 'P8').partitions[0];
    expect(partition?.cells.length, 'the three screens should give three cells').toBe(3);
    expect(
      partition?.cells.filter((cell) => cell.kind === 'refused').length,
      'one cell is under the floor and only one was refused, so its value is the published total ' +
        'less its published siblings — § 20.3 ground 3',
    ).toBe(2);
  });

  it('makes every refusal in a partition read identically, floor or complement', () => {
    const refusals = (panel(dashboardOf(threeScreens(), { nowMs: NOW }), 'P8').partitions[0]?.cells ?? [])
      .filter((cell) => cell.kind === 'refused')
      .map((cell) => (cell.kind === 'refused' ? cell.reason : ''));
    expect(refusals.length).toBe(2);
    expect(
      new Set(refusals).size,
      'a complement cell announced itself as one. § 20.3 ground 3: that announces it is *not* under ' +
        'the floor, and moves the bound on the cell it was suppressed to protect into a disjoint range',
    ).toBe(1);
  });

  it('publishes nothing from a partition where fewer than two cells can be refused', () => {
    const events = [
      ...Array.from({ length: MIN_CELL_PEOPLE + 4 }, (_, index) => stalledSession(index, 'stage')).flat(),
      ...Array.from({ length: 2 }, (_, index) => stalledSession(200 + index, 'settings')).flat(),
    ];
    const partition = panel(dashboardOf(events, { nowMs: NOW }), 'P8').partitions[0];
    expect(partition?.cells.every((cell) => cell.kind === 'refused')).toBe(true);
    expect(partition?.refusalNote).toMatch(/one publishable cell publishes nothing/u);
  });
});

describe('docs/26 K2 — a chain that cannot close is refused, never drawn as a flat zero', () => {
  /*
   * **The defect these cases exist against, stated plainly.** `rerun_same_crowd` is beat 4 and no
   * shipped surface emits it (`packages/viz/src/telemetry/schema.ts#UNEMITTED_EVENTS`). A chain
   * containing an unemitted event can never complete, so a completion share computed over it reads
   * **0 % on every real cell** — and P2 would draw that 0 % directly under `charter S2`'s 60 %
   * target, where it reads as a product failing its criterion rather than as an instrument with a
   * hole in it. GitHub issue #250's own thread says so before any of this was built: *"a dashboard
   * drawing K2 as a funnel would show a flat zero and look like a bug"*, and
   * `docs/22-charter.md`'s S2 cell had already been corrected to *Partly — the chain cannot close
   * today* for the same reason.
   *
   * **What is no longer observable, said out loud.** The ordered-scan cases this block replaced
   * drove `chainReachOf` through P2's published share and P5's beat axis. With both panels refused
   * there is no published figure to read them off, so the walk is exercised by nothing until the
   * emitter lands — the same status P1's share and median already have while the dwell is missing.
   * What makes that day loud rather than quiet is `dashboardSpec.test.ts`: it derives `K2_CHAIN`
   * from § 6.2 in both directions, and derives `CHAIN_BEATS_WITHOUT_EMITTER` from the register in
   * both directions, so wiring the emitter turns this file red until the refusal leaves and the
   * cases come back.
   */
  /*
   * `silence` is read through this rather than passed to `toMatch` directly. A panel that stopped
   * refusing returns `null`, and `toMatch(null)` throws a `TypeError` about argument types instead
   * of saying which panel started drawing — which is what the positive control for this block
   * actually printed the first time it was run. A guard that goes red with an unreadable message is
   * half a guard.
   */
  const refusalOf = (view: PanelView): string =>
    view.silence ?? `(${view.panel.id} published cells instead of refusing)`;

  it('refuses P2 by name rather than publishing a share that can only read zero', () => {
    const events = Array.from({ length: MIN_CELL_PEOPLE }, (_, index) => completedSession(index)).flat();
    const p2 = panel(dashboardOf(events, { nowMs: NOW }), 'P2');
    expect(refusalOf(p2), 'P2 drew a completion share over a chain that cannot close').toMatch(
      /chain cannot close/u,
    );
    expect(p2.partitions, 'a refused panel may not also publish cells').toEqual([]);
    expect(refusalOf(p2), 'the refusal must name the beat, not just the condition').toMatch(
      /rerun_same_crowd/u,
    );
    expect(refusalOf(p2), 'and the register that carries what blocks it').toMatch(
      /UNEMITTED_EVENTS/u,
    );
  });

  it('refuses P5, whose base is exactly the sessions P2 cannot count', () => {
    const events = Array.from({ length: MIN_CELL_PEOPLE + 2 }, (_, index) =>
      stalledSession(index, 'stage'),
    ).flat();
    const p5 = panel(dashboardOf(events, { nowMs: NOW }), 'P5');
    expect(
      refusalOf(p5),
      'P5 drew a beat-drop profile whose every session is attributed to a beat no player can be ' +
        'observed reaching — the largest cell would be an artefact of the missing emitter',
    ).toMatch(/chain cannot close/u);
    expect(p5.partitions).toEqual([]);
  });

  it('publishes no digit at all where the two refused panels draw', () => {
    /*
     * The boundary checked at the value the defect would really have. A refusal that leaked a
     * figure would leak `0.0 %`, and `0` is the numeral a laxer check waves through as falsy — the
     * baseline case's own argument, one panel along.
     */
    const events = Array.from({ length: MIN_CELL_PEOPLE }, (_, index) => completedSession(index)).flat();
    const text = renderDashboard(dashboardOf(events, { nowMs: NOW }));
    const p2Block = text.slice(text.indexOf('\nP2 — '), text.indexOf('\nP3 — '));
    expect(p2Block, 'the P2 block is not where this parser thinks it is').toMatch(/docs\/26 K2/u);

    /*
     * The `Target:` line is excluded rather than the check weakened, and the exclusion is the
     * point: § 20.2's target **must** be drawn on a refused KPI panel — that is #250's second
     * criterion, and a panel that hid its target while refusing would answer this case by failing
     * that one. What may not appear is a *measurement*.
     */
    const drawn = p2Block.split('\n').filter((line) => !line.trim().startsWith('Target:'));
    expect(
      drawn.filter((line) => /\d+\.\d+ %/u.test(line)),
      'P2 published a percentage over a chain that cannot close',
    ).toEqual([]);
    expect(p2Block, 'P2 published a cell count for a panel that drew no cells').not.toMatch(
      /n = \d+ people/u,
    );
    /*
     * **Derived from the panel, not restated.** This asserted `≥ 60.0 %` as a literal, which made
     * it the second statement of a number § 20.2 says belongs to the charter — and a review showed
     * what that costs: raising `charter S2` to 70 % in the charter *and* in `DASHBOARD_PANELS`
     * together left `dashboardSpec.test.ts` green, as AC4 requires, and turned **this** case red.
     * A gate that reddens on the commit raising a criterion teaches exactly one lesson, and
     * `dashboardSpec.test.ts`'s own docstring says which: *delete the gate*.
     *
     * So the relation and the criterion come off the panel's own target, and the value is compared
     * numerically rather than as rendered text. What is still asserted is #250 AC2 — a refused KPI
     * panel must **still draw its target** — which is the thing this case is for.
     */
    const p2Target = DASHBOARD_PANELS.find((panel) => panel.id === 'P2')?.target;
    expect(p2Target, 'P2 is a KPI panel and must carry a target').toBeDefined();
    const relation = p2Target?.direction === 'at-most' ? '≤' : '≥';
    expect(p2Block, 'the target must still be drawn on a refused KPI panel — #250 AC2').toContain(
      `Target: ${relation} `,
    );
    expect(p2Block, 'the target names its charter criterion').toContain(
      `(${String(p2Target?.criterion)})`,
    );
    const drawnTarget = /Target: [≤≥] (\d+\.\d+) %/u.exec(p2Block)?.[1];
    expect(Number(drawnTarget), 'the drawn target is the panel’s own declared value').toBeCloseTo(
      (p2Target?.value ?? 0) * 100,
      6,
    );
  });

  it('still names the chain § 6.2 states, and still gives diagnose no event', () => {
    /*
     * § 6.2 gives beat 2 — *diagnose* — no event, because it happens in the player's head. The
     * chain constant survives the refusal because it is the definition rather than the drawing, and
     * `dashboardSpec.test.ts` holds it against § 6.2's own blockquote in both directions.
     */
    expect([...K2_CHAIN]).not.toContain('diagnosed');
    expect(K2_CHAIN.length, 'K2 is five beats — docs/23 § 3.2, not a funnel invented here').toBe(5);
  });
});

describe('docs/26 K4 — a cohort whose window has not closed is refused, not drawn small', () => {
  it('refuses by name before D+8 and publishes after', () => {
    const dayStart = Date.parse('2026-05-20T00:00:00.000Z');
    const cohort = Array.from({ length: MIN_CELL_PEOPLE }, (_, index) =>
      completedSession(index, dayStart + index),
    ).flat();

    const early = panel(dashboardOf(cohort, { nowMs: dayStart + 3 * 24 * 60 * 60 * 1000 }), 'P4');
    const earlyCell = early.partitions[0]?.cells[0];
    expect(earlyCell?.kind).toBe('refused');
    expect(earlyCell?.kind === 'refused' ? earlyCell.reason : '').toMatch(/window has not closed/u);

    const late = panel(dashboardOf(cohort, { nowMs: dayStart + 9 * 24 * 60 * 60 * 1000 }), 'P4');
    expect(late.partitions[0]?.cells[0]?.kind).toBe('published');
  });
});

describe('every published cell carries its count and an interval (docs/26 § 6.4, § 20.2)', () => {
  /*
   * **Driven on P4**, the remaining KPI panel that publishes a *rate*. P2 was the natural home and
   * is refused whole; a count-only diagnostic would not exercise § 6.4's second bullet at all,
   * because a raw count has no sampling interval to carry.
   */
  const COHORT_DAY = Date.parse('2026-05-20T00:00:00.000Z');
  const AFTER_WINDOW = COHORT_DAY + 9 * 24 * 60 * 60 * 1000;

  /** A day-one cohort of exactly the floor, `returners` of whom come back inside the window. */
  const cohort = (returners: number): readonly TelemetryEventRow[] => [
    ...Array.from({ length: MIN_CELL_PEOPLE }, (_, index) =>
      completedSession(index, COHORT_DAY + index),
    ).flat(),
    ...Array.from({ length: returners }, (_, index) =>
      returnSession(index, COHORT_DAY + 2 * 24 * 60 * 60 * 1000),
    ).flat(),
  ];

  it('publishes no rate without the count it was computed over', () => {
    const events = cohort(MIN_CELL_PEOPLE);
    const cell = panel(dashboardOf(events, { nowMs: AFTER_WINDOW }), 'P4').partitions[0]?.cells[0];
    expect(cell?.kind).toBe('published');
    if (cell?.kind !== 'published') return;
    expect(cell.counts.people).toBe(MIN_CELL_PEOPLE);
    expect(cell.figures[0]?.interval).not.toBeNull();
    expect(renderDashboard(dashboardOf(events, { nowMs: AFTER_WINDOW }))).toMatch(
      new RegExp(`n = ${String(MIN_CELL_PEOPLE)} people`, 'u'),
    );
  });

  it('draws an interval at the floor that is as wide as § 20.3 says it is', () => {
    /*
     * § 20.3: *"a share over 20 has a 95 % half-width of up to ±0.220, so an observed 60 % is an
     * interval running from 38 % to 82 %."* Half the cohort returning gives the widest case, and
     * this is the same arithmetic the document argues with rather than a second one.
     */
    const cell = panel(dashboardOf(cohort(MIN_CELL_PEOPLE / 2), { nowMs: AFTER_WINDOW }), 'P4')
      .partitions[0]?.cells[0];
    if (cell?.kind !== 'published') throw new Error('expected a published cell');
    expect(cell.figures[0]?.value, 'the fixture no longer produces the widest case').toBeCloseTo(0.5, 6);
    const interval = cell.figures[0]?.interval;
    expect((interval?.hi ?? 0) - (interval?.lo ?? 0)).toBeCloseTo(2 * 0.2191, 3);
  });
});

describe('the route is deterministic over the same rows', () => {
  it('answers identically whatever order the rows arrive in', () => {
    /*
     * Invariant 4's spirit one package along: a report that changes between two runs over the same
     * rows is not a measurement. Session grouping walks a `Map`, and `Map` order is insertion
     * order, so a shuffled read would otherwise be able to move which session counts as a player's
     * first.
     */
    const events = [
      ...Array.from({ length: MIN_CELL_PEOPLE }, (_, index) => completedSession(index)).flat(),
      ...Array.from({ length: MIN_CELL_PEOPLE }, (_, index) => stalledSession(index)).flat(),
    ];
    const forwards = renderDashboard(dashboardOf(events, { nowMs: NOW }));
    const backwards = renderDashboard(dashboardOf([...events].reverse(), { nowMs: NOW }));
    expect(backwards).toBe(forwards);
  });
});
