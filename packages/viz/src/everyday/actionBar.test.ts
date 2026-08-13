/**
 * **§ 3.3, transcribed twice and compared** — the action bar table, and § 3.4's strips.
 *
 * `actionBar.ts` holds one transcription of the guide's *"Complete bar table — build from this,
 * not from memory"*; {@link GUIDE_TABLE} below is a second, made independently from
 * `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` lines 164–188. The suite
 * compares them cell by cell, so a drift in either direction — a row edited in the data, or a row
 * misremembered in this test — fails loudly instead of shipping a bar that quietly disagrees with
 * the design it cites.
 *
 * The structural § 3.3/§ 3.4 rules (one primary, the left button names what is abandoned, a rush
 * has no timeline, a watched run never warns, the timelines' lengths) are asserted from the data
 * rather than from literals, so they hold over rows this table gains later.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTION_BAR_ROWS,
  actionBarFor,
  confirmStripFor,
  TIMELINE_STEPS,
  type TimelineFlow,
} from './actionBar.js';
import { EVERYDAY_SCREENS, RUN_CONTEXTS, type EverydayScreen, type RunContext } from './types.js';

/** One § 3.3 row as the guide prints it. `null` transcribes the table's `—`. */
interface GuideRow {
  readonly screen: EverydayScreen;
  readonly ctx?: RunContext;
  readonly leave: string;
  readonly leaveInert?: boolean;
  readonly back: { readonly label: string; readonly screen: EverydayScreen } | null;
  readonly timeline: { readonly flow: TimelineFlow; readonly step: number } | null;
  readonly primary: readonly string[];
  readonly danger?: readonly string[];
  /** A string per state the guide's cell names, or `null` for `—`. */
  readonly notes: readonly string[] | null;
  readonly inverted: boolean;
  readonly wayOut?: string;
}

/** GAMEPLAY § 3.3's table, lines 168–188, row for row and in the guide's order. */
const GUIDE_TABLE: readonly GuideRow[] = [
  {
    screen: 'menu',
    leave: '⌂ Modes',
    leaveInert: true,
    back: null,
    timeline: null,
    primary: ["Play today's tower", 'Play the campaign', 'Play the rush', 'Play a broken building'],
    notes: ['Pick a mode above, then play it.'],
    inverted: false,
  },
  {
    screen: 'door',
    leave: "⤺ Leave today's tower",
    back: null,
    timeline: { flow: 'daily', step: 1 },
    primary: ['Set up today', 'Set up the replay'],
    notes: ['Pick who drives, then run it.'],
    inverted: false,
  },
  {
    screen: 'brief',
    leave: "⤺ Leave today's tower",
    back: { label: 'Front door', screen: 'door' },
    timeline: { flow: 'daily', step: 2 },
    primary: ['Start the day'],
    notes: ['Running the lifts: ⟨style⟩'],
    inverted: false,
  },
  {
    screen: 'stage',
    ctx: 'daily',
    leave: "⤺ Leave today's tower",
    back: { label: 'Brief', screen: 'brief' },
    timeline: { flow: 'daily', step: 3 },
    primary: ['Close the day'],
    notes: ['Stops the clock and writes the report.'],
    inverted: false,
  },
  {
    screen: 'stage',
    ctx: 'campaign',
    leave: '⤺ Leave the campaign',
    back: { label: '⟨building⟩', screen: 'building' },
    timeline: { flow: 'campaign', step: 4 },
    primary: ['Close the day'],
    notes: ['Stops the clock and writes the report.'],
    inverted: false,
  },
  {
    screen: 'stage',
    ctx: 'rush',
    leave: '⤺ Leave the rush',
    back: { label: 'Endless rush', screen: 'rush' },
    timeline: null,
    primary: ['End the rush'],
    notes: ['Stops the climb and counts the waves.'],
    inverted: false,
  },
  {
    screen: 'report',
    ctx: 'daily',
    leave: "⤺ Leave today's tower",
    back: { label: 'The day', screen: 'stage' },
    timeline: { flow: 'daily', step: 4 },
    primary: ['Your week'],
    notes: ['Seven days, and where the world landed.'],
    inverted: true,
    wayOut: '⌂ Return to Main Menu',
  },
  {
    screen: 'report',
    ctx: 'campaign',
    leave: '⤺ Leave the campaign',
    back: { label: 'The day', screen: 'stage' },
    timeline: { flow: 'campaign', step: 5 },
    primary: ['Back to ⟨building⟩'],
    notes: null,
    inverted: true,
    wayOut: '⤺ All buildings',
  },
  {
    screen: 'report',
    ctx: 'rush',
    leave: '⤺ Leave the rush',
    back: { label: 'The day', screen: 'stage' },
    timeline: null,
    primary: ['Run the rush again'],
    notes: ['Waves are identical for everyone.'],
    inverted: true,
    wayOut: '⤺ Leave the rush',
  },
  {
    screen: 'towers',
    leave: '⤺ Leave the campaign',
    back: null,
    timeline: { flow: 'campaign', step: 1 },
    primary: ['Open ⟨building⟩'],
    notes: ['⟨N⟩ buildings want a decision.'],
    inverted: false,
  },
  {
    screen: 'building',
    leave: '⤺ Leave the campaign',
    back: { label: 'All buildings', screen: 'towers' },
    timeline: { flow: 'campaign', step: 2 },
    primary: [
      'Run the day and decide as it goes',
      'Run the day with that',
      'Send your answer',
      'Choose an option first',
      'Watch a day here',
    ],
    notes: [
      "⟨the picked option's effect⟩",
      'The options travel with you — you can answer while the day plays.',
    ],
    inverted: false,
  },
  {
    screen: 'contract',
    leave: '⤺ Leave the campaign',
    back: { label: 'All buildings', screen: 'towers' },
    timeline: { flow: 'campaign', step: 3 },
    primary: ['Lock it in and run day ⟨N⟩', 'Start the month again'],
    danger: ['Start the month again'],
    notes: ['⟨nights of works ahead⟩', '⟨the month-over sentence⟩'],
    inverted: false,
  },
  {
    screen: 'rush',
    leave: '⤺ Leave the rush',
    back: null,
    timeline: null,
    primary: ['Start the rush'],
    notes: ['Nothing to set up. It ends when it ends.'],
    inverted: false,
  },
  {
    screen: 'fixit',
    leave: '⤺ Leave this building',
    back: null,
    timeline: null,
    primary: ['Run the day', 'Run it again', 'Next building'],
    notes: ['⟨what the run will measure⟩'],
    inverted: false,
    wayOut: '⌂ Return to Main Menu',
  },
  {
    screen: 'workshop',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ['Run a day with this'],
    notes: ['Unsaved changes travel with the run.', 'Nothing changed yet.'],
    inverted: false,
  },
  {
    screen: 'bench',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ['Run the suite', 'Run the suite again'],
    notes: ['Matched crowds for every dispatcher in the field.'],
    inverted: false,
  },
  {
    screen: 'tuner',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ['Run it and watch'],
    notes: ['Sandbox — this run will not be scored.', 'Scored day — three things are fixed.'],
    inverted: false,
  },
  {
    screen: 'designer',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ['Run a day in it'],
    notes: ['Nothing here is scored. It is a drawing board.'],
    inverted: false,
  },
  /* § 3.3 writes `week · board` as one row over one tabbed screen pair — two keys, same cells. */
  {
    screen: 'week',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ["Play today's tower", "Replay today's tower"],
    notes: null,
    inverted: false,
  },
  {
    screen: 'board',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ["Play today's tower", "Replay today's tower"],
    notes: null,
    inverted: false,
  },
  {
    screen: 'settings',
    leave: '⌂ Modes',
    back: null,
    timeline: null,
    primary: ['Back to the modes'],
    notes: null,
    inverted: false,
  },
  {
    screen: 'stage',
    ctx: 'watch',
    leave: '⤺ Stop watching',
    back: null,
    timeline: null,
    primary: ['Play this crowd yourself'],
    notes: ['Their record, replayed. Nothing here is scored, and your own day is untouched.'],
    inverted: false,
  },
];

const keyOf = (screen: EverydayScreen, ctx?: RunContext): string =>
  ctx === undefined ? screen : `${screen}·${ctx}`;

describe('the table matches the guide, cell for cell', () => {
  it('carries exactly the guide’s rows, plus the one marked as not the guide’s', () => {
    const guideKeys = GUIDE_TABLE.map((row) => keyOf(row.screen, row.ctx)).sort();
    const dataKeys = ACTION_BAR_ROWS.filter((row) => row.guide)
      .map((row) => keyOf(row.screen, row.ctx))
      .sort();
    expect(dataKeys).toEqual(guideKeys);
    // The defensive row is the only non-guide one, and it is the watched report — see the module
    // docstring in actionBar.ts for why it exists and why it is not a transcription.
    const extras = ACTION_BAR_ROWS.filter((row) => !row.guide);
    expect(extras.map((row) => keyOf(row.screen, row.ctx))).toEqual(['report·watch']);
  });

  for (const guide of GUIDE_TABLE) {
    it(`row ${keyOf(guide.screen, guide.ctx)}`, () => {
      const data = ACTION_BAR_ROWS.find(
        (row) => row.screen === guide.screen && row.ctx === guide.ctx,
      );
      expect(data).toBeDefined();
      if (data === undefined) return;
      expect(data.leave.label, 'left button').toBe(guide.leave);
      expect(data.leave.inert, 'inert').toBe(guide.leaveInert ?? false);
      if (guide.back === null) expect(data.back, 'back').toBeUndefined();
      else expect(data.back, 'back').toEqual(guide.back);
      if (guide.timeline === null) expect(data.timeline, 'timeline').toBeUndefined();
      else expect(data.timeline, 'timeline').toEqual(guide.timeline);
      expect(data.primary.variants, 'primary variants').toEqual(guide.primary);
      expect(data.primary.dangerVariants ?? [], 'danger variants').toEqual(guide.danger ?? []);
      const notes = [
        ...(data.note === undefined ? [] : [data.note]),
        ...(data.noteVariants ?? []),
      ];
      if (guide.notes === null) expect(notes, 'note').toEqual([]);
      else expect(notes, 'note').toEqual(guide.notes);
      expect(data.inverted, 'inversion').toBe(guide.inverted);
      expect(data.wayOut, 'way out').toBe(guide.wayOut);
    });
  }
});

describe('the § 3.3 rules, held over the data rather than the literals', () => {
  it('answers for every screen in every context, and never with an empty primary', () => {
    for (const screen of EVERYDAY_SCREENS) {
      for (const ctx of RUN_CONTEXTS) {
        const model = actionBarFor({ screen, ctx });
        expect(model.screen, `${screen} · ${ctx}`).toBe(screen);
        expect(model.primary.label.trim(), `${screen} · ${ctx}`).not.toBe('');
        expect(model.primary.variants, `${screen} · ${ctx}`).toContain(model.primary.label);
      }
    }
  });

  it('names what is abandoned on every left button — never "Back", never "Exit"', () => {
    for (const row of ACTION_BAR_ROWS) {
      expect(row.leave.label, keyOf(row.screen, row.ctx)).toMatch(/^(?:⤺ (?:Leave|Stop)|⌂ Modes)/u);
    }
  });

  it('gives the daily flow four steps and the campaign five, counted rather than remembered', () => {
    // "Daily: Front door › Brief › The day › How it went. Campaign: All buildings › <building> ›
    // Contract › The day › How it went." — asserted by transcription, then used as the bound on
    // every row's step.
    expect(TIMELINE_STEPS.daily.map((stop) => stop.label)).toEqual([
      'Front door',
      'Brief',
      'The day',
      'How it went',
    ]);
    expect(TIMELINE_STEPS.campaign.map((stop) => stop.label)).toEqual([
      'All buildings',
      '⟨building⟩',
      'Contract',
      'The day',
      'How it went',
    ]);
    for (const row of ACTION_BAR_ROWS) {
      if (row.timeline === undefined) continue;
      const steps = TIMELINE_STEPS[row.timeline.flow];
      expect(row.timeline.step, keyOf(row.screen, row.ctx)).toBeGreaterThanOrEqual(1);
      expect(row.timeline.step, keyOf(row.screen, row.ctx)).toBeLessThanOrEqual(steps.length);
    }
  });

  it('gives a rush no timeline at all, and a watched run none either', () => {
    for (const row of ACTION_BAR_ROWS) {
      if (row.ctx === 'rush' || row.ctx === 'watch' || row.screen === 'rush') {
        expect(row.timeline, keyOf(row.screen, row.ctx)).toBeUndefined();
      }
    }
  });

  it('inverts emphasis on every report and nowhere else in the shipped rows', () => {
    // § 3.3: the report and the *solved* fix case invert. Solved is the fix screen's own state,
    // so the fixit row ships uninverted and carries its way out for the refinement to use.
    for (const row of ACTION_BAR_ROWS) {
      expect(row.inverted, keyOf(row.screen, row.ctx)).toBe(
        row.screen === 'report' && row.ctx !== 'watch',
      );
      if (row.inverted) expect(row.wayOut, keyOf(row.screen, row.ctx)).toBeDefined();
    }
    expect(ACTION_BAR_ROWS.find((row) => row.screen === 'fixit')?.wayOut).toBe(
      '⌂ Return to Main Menu',
    );
  });

  it('follows the selected card on the menu, defaulting to today', () => {
    expect(actionBarFor({ screen: 'menu', ctx: 'daily' }).primary.label).toBe("Play today's tower");
    expect(actionBarFor({ screen: 'menu', ctx: 'daily', modePick: 'campaign' }).primary.label).toBe(
      'Play the campaign',
    );
    expect(actionBarFor({ screen: 'menu', ctx: 'daily', modePick: 'rush' }).primary.label).toBe(
      'Play the rush',
    );
    expect(actionBarFor({ screen: 'menu', ctx: 'daily', modePick: 'fixit' }).primary.label).toBe(
      'Play a broken building',
    );
  });

  it('confines the ⟨…⟩ placeholders to the cells the guide leaves state-dependent', () => {
    /*
     * The convention's whole worth is that a placeholder can never be mistaken for copy. Every
     * marker in the data must sit in a cell the guide transcription also marks — a `⟨` appearing
     * anywhere else is authored copy pretending to be state, or state shipped as copy.
     */
    const marked = (text: string | undefined): boolean =>
      text !== undefined && text.includes('⟨');
    for (const guide of GUIDE_TABLE) {
      const data = ACTION_BAR_ROWS.find(
        (row) => row.screen === guide.screen && row.ctx === guide.ctx,
      );
      if (data === undefined) continue;
      expect(marked(data.leave.label), keyOf(guide.screen, guide.ctx)).toBe(false);
      expect(marked(data.back?.label)).toBe(marked(guide.back?.label ?? ''));
      for (const [index, variant] of data.primary.variants.entries()) {
        expect(marked(variant)).toBe(marked(guide.primary[index] ?? ''));
      }
    }
  });
});

describe('§ 3.4 — leaving a mode has friction, and a watched run never warns', () => {
  it('warns about an unfinished day in the day’s words, and a rush in the rush’s', () => {
    for (const ctx of ['daily', 'campaign'] as const) {
      const strip = confirmStripFor(ctx);
      expect(strip?.question).toBe('Leave the day unfinished?');
      expect(strip?.consequence).toBe(
        "Today's run will not be scored, and the board keeps whatever you posted before.",
      );
    }
    const rush = confirmStripFor('rush');
    expect(rush?.question).toBe('Leave the rush?');
    expect(rush?.consequence).toBe(
      'The climb is not saved, and a stopped rush has no wave to post.',
    );
  });

  it('offers Leave it / Stay, in those words', () => {
    for (const ctx of RUN_CONTEXTS) {
      const strip = confirmStripFor(ctx);
      if (strip === undefined) continue;
      expect(strip.leaveLabel).toBe('Leave it');
      expect(strip.stayLabel).toBe('Stay');
    }
  });

  it('never warns a spectator — there is nothing of theirs to lose', () => {
    expect(confirmStripFor('watch')).toBeUndefined();
  });
});
