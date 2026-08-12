/**
 * **The rail's three rules, and the one thing it must not grow back** — GAMEPLAY § 3.2.
 *
 * Two of these are corrections the guide records against its own earlier drafts, which is why they
 * are asserted rather than left to the reader of `rail.ts`: a rule that was already got wrong once
 * is the one a rewrite gets wrong again.
 */

import { describe, expect, it } from 'vitest';

import { railGroups, railModel, sublineFor } from './rail.js';
import { EVERYDAY_SCREENS, type EverydayScreen, type RunContext } from './types.js';

const CONTEXTS = ['daily', 'campaign', 'rush'] as const satisfies readonly RunContext[];

const titlesOf = (ctx: RunContext, inCampaign: boolean): readonly string[] =>
  railGroups(ctx, inCampaign).map((group) => group.title);

const screensOf = (ctx: RunContext, inCampaign: boolean): readonly EverydayScreen[] =>
  railGroups(ctx, inCampaign).flatMap((group) => group.items.map((item) => item.screen));

describe('the rail offers a campaign only inside one', () => {
  it('renders CAMPAIGN in a campaign and nowhere else', () => {
    expect(titlesOf('campaign', true)).toContain('CAMPAIGN');
    for (const ctx of CONTEXTS) {
      expect(titlesOf(ctx, false), `${ctx}, not in a campaign`).not.toContain('CAMPAIGN');
    }
    /*
     * Both halves of the condition, not just the flag. `railGroups` takes the context *and* whether
     * a campaign is under way, and a reader could satisfy the case above by testing either one —
     * so the daily context with `inCampaign` true is the arm that separates them.
     */
    expect(titlesOf('daily', true)).not.toContain('CAMPAIGN');
  });

  it('always offers DESIGN and WORLD', () => {
    for (const ctx of CONTEXTS) {
      for (const inCampaign of [false, true]) {
        expect(titlesOf(ctx, inCampaign)).toEqual(expect.arrayContaining(['DESIGN', 'WORLD']));
      }
    }
  });
});

describe('the rail does not lie about how many places there are', () => {
  it('gives the two boards one entry, not two', () => {
    // The guide's own correction: two entries "made the rail lie about how many places there are".
    // They are one tabbed screen, so `board` appears once and `ladder` is not a screen at all.
    const screens = screensOf('daily', false);
    expect(screens.filter((screen) => screen === 'board')).toHaveLength(1);
    expect(EVERYDAY_SCREENS).not.toContain('ladder');
  });

  it('does not list Tune the tower — it is reached from the brief and the report', () => {
    /*
     * An absence asserted on purpose. An earlier draft of the guide listed `tuner` here and the
     * guide calls that wrong; without this case, adding it back would look like an improvement.
     */
    for (const ctx of CONTEXTS) {
      for (const inCampaign of [false, true]) {
        expect(screensOf(ctx, inCampaign)).not.toContain('tuner');
      }
    }
  });

  it('names a reason on every row that does not open', () => {
    // The handoff's definition of done: every control reaches the simulation *or says it does not*.
    // A `disabled` row with an empty string would satisfy the type and say nothing.
    for (const group of railGroups('campaign', true)) {
      for (const item of group.items) {
        if (item.unavailable === undefined) continue;
        expect(item.unavailable.trim().length, `${group.title} · ${item.label}`).toBeGreaterThan(10);
      }
    }
  });
});

describe('the subline says where the player actually is', () => {
  it('answers for all sixteen screens in all three contexts', () => {
    // `sublineFor` is a `switch` with no `default`, so a screen added to the inventory and not to
    // the switch is a compile error — this is the runtime half: none of them answers with nothing.
    for (const screen of EVERYDAY_SCREENS) {
      for (const ctx of CONTEXTS) {
        const subline = sublineFor({ screen, ctx, history: [] });
        expect(subline.trim(), `${screen} · ${ctx}`).not.toBe('');
      }
    }
  });

  it('does not say MID-DAY about a rush, or read a report during one', () => {
    /*
     * The two places the guide gives the stage and the report live detail per context. Getting them
     * the wrong way round is a false statement about the player's own position, which is the class
     * of thing this whole file exists to catch.
     */
    expect(sublineFor({ screen: 'stage', ctx: 'rush', history: [] })).toBe('IN THE RUSH');
    expect(sublineFor({ screen: 'stage', ctx: 'daily', history: [] })).toBe('MID-DAY');
    expect(sublineFor({ screen: 'report', ctx: 'rush', history: [] })).toBe('READING THE RUSH');
    expect(sublineFor({ screen: 'report', ctx: 'daily', history: [] })).toBe('READING THE REPORT');
  });

  it('says YOU ARE HERE at the root, in every context', () => {
    for (const ctx of CONTEXTS) {
      expect(sublineFor({ screen: 'menu', ctx, history: [] })).toBe('YOU ARE HERE');
    }
  });
});

describe('the whole model', () => {
  it('carries the brand, the mode and the subline of the state it was given', () => {
    const model = railModel({ screen: 'fixit', ctx: 'daily', history: ['menu'] });
    expect(model.brand).toBe('Elevator Sim');
    expect(model.mode).toBe('EVERYDAY MODE');
    expect(model.subline).toBe('FIX A BUILDING');
  });

  it('defaults to not being in a campaign', () => {
    // The default matters: it is what the shell passes today, and a default of `true` would put two
    // entries into a campaign nobody started on the front door.
    expect(railModel({ screen: 'menu', ctx: 'campaign', history: [] }).groups.map((g) => g.title))
      .not.toContain('CAMPAIGN');
  });
});
