/**
 * **The rail's rules, and the two things it must not grow back** — GAMEPLAY § 3.2.
 *
 * Two of these are corrections the guide records against its own earlier drafts, which is why they
 * are asserted rather than left to the reader of `rail.ts`: a rule that was already got wrong once
 * is the one a rewrite gets wrong again. The availability cases are the standing requirement
 * pointed at the rail: a row's refusal and the screen registry move together, in both directions,
 * or the failure is here rather than on a player's screen.
 */

import { describe, expect, it } from 'vitest';

import { railFooter, railGroups, railModel, sublineFor } from './rail.js';
import { EVERYDAY_SCREENS_BUILT, UNBUILT_REASONS } from './screens.js';
import {
  ENGINEER_SWAP_NOTE,
  EVERYDAY_SCREENS,
  RUN_CONTEXTS,
  type EverydayScreen,
  type RunContext,
} from './types.js';

const titlesOf = (ctx: RunContext, inCampaign: boolean): readonly string[] =>
  railGroups(ctx, inCampaign).map((group) => group.title);

const screensOf = (ctx: RunContext, inCampaign: boolean, openBuilding?: string): readonly EverydayScreen[] =>
  railGroups(ctx, inCampaign, openBuilding).flatMap((group) => group.items.map((item) => item.screen));

describe('the rail offers a campaign only inside one', () => {
  it('renders CAMPAIGN in a campaign and nowhere else', () => {
    expect(titlesOf('campaign', true)).toContain('CAMPAIGN');
    for (const ctx of RUN_CONTEXTS) {
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
    for (const ctx of RUN_CONTEXTS) {
      for (const inCampaign of [false, true]) {
        expect(titlesOf(ctx, inCampaign)).toEqual(expect.arrayContaining(['DESIGN', 'WORLD']));
      }
    }
  });

  it('draws the building desk row only when a building is open, labelled with its name', () => {
    // § 3.2: the campaign group's middle row *is* the open building's name. No name, no row —
    // a desk row with an invented label would claim a building nobody opened.
    expect(screensOf('campaign', true)).not.toContain('building');
    const withBuilding = railGroups('campaign', true, 'Chancery House');
    const campaign = withBuilding.find((group) => group.title === 'CAMPAIGN');
    const desk = campaign?.items.find((item) => item.screen === 'building');
    expect(desk?.label).toBe('Chancery House');
    expect(campaign?.items.map((item) => item.screen)).toEqual(['towers', 'building', 'contract']);
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
    for (const ctx of RUN_CONTEXTS) {
      for (const inCampaign of [false, true]) {
        expect(screensOf(ctx, inCampaign, 'Chancery House')).not.toContain('tuner');
      }
    }
  });

  it('derives every row’s availability from the screen registry, both ways', () => {
    /*
     * The standing requirement, mechanised: a row refuses exactly when its screen is unbuilt, and
     * its refusal is that screen's one sentence from `screens.ts` — so a lane that registers a
     * screen opens its rail row on the same commit, and a stale refusal over a working screen
     * (§ D227) cannot ship through this rail.
     */
    for (const group of railGroups('campaign', true, 'Chancery House')) {
      for (const item of group.items) {
        const built = EVERYDAY_SCREENS_BUILT.includes(item.screen);
        if (built) expect(item.unavailable, `${group.title} · ${item.label}`).toBeUndefined();
        else expect(item.unavailable, `${group.title} · ${item.label}`).toBe(UNBUILT_REASONS[item.screen]);
      }
    }
  });

  it('names a reason on every row that does not open', () => {
    // The handoff's definition of done: every control reaches the simulation *or says it does not*.
    // A `disabled` row with an empty string would satisfy the type and say nothing.
    for (const group of railGroups('campaign', true, 'Chancery House')) {
      for (const item of group.items) {
        if (item.unavailable === undefined) continue;
        expect(item.unavailable.trim().length, `${group.title} · ${item.label}`).toBeGreaterThan(10);
      }
    }
  });
});

describe('the subline says where the player actually is', () => {
  it('answers for every screen in every context, both sets derived', () => {
    // `sublineFor` is a `switch` with no `default`, so a screen added to the inventory and not to
    // the switch is a compile error — this is the runtime half: none of them answers with nothing.
    for (const screen of EVERYDAY_SCREENS) {
      for (const ctx of RUN_CONTEXTS) {
        const subline = sublineFor({ screen, ctx });
        expect(subline.trim(), `${screen} · ${ctx}`).not.toBe('');
      }
    }
  });

  it('does not say MID-DAY about a rush, or read a report during one', () => {
    /*
     * The places the guide gives the stage and the report live detail per context. Getting them
     * the wrong way round is a false statement about the player's own position, which is the class
     * of thing this whole file exists to catch.
     */
    expect(sublineFor({ screen: 'stage', ctx: 'rush' })).toBe('IN THE RUSH');
    expect(sublineFor({ screen: 'stage', ctx: 'daily' })).toBe('MID-DAY');
    expect(sublineFor({ screen: 'report', ctx: 'rush' })).toBe('READING THE RUSH');
    expect(sublineFor({ screen: 'report', ctx: 'daily' })).toBe('READING THE REPORT');
  });

  it('says WATCHING on a watched stage and report, and only there', () => {
    /*
     * § 18's fourth context. The bare word, not `WATCHING · <who>`: this module has no spectator
     * record and inventing a name would be a figure with no source — the shell appends the name
     * when it has one, the same split as MID-DAY's clock.
     */
    expect(sublineFor({ screen: 'stage', ctx: 'watch' })).toBe('WATCHING');
    expect(sublineFor({ screen: 'report', ctx: 'watch' })).toBe('WATCHING');
    for (const screen of EVERYDAY_SCREENS) {
      if (screen === 'stage' || screen === 'report') continue;
      expect(sublineFor({ screen, ctx: 'watch' }), screen).not.toBe('WATCHING');
    }
  });

  it('says YOU ARE HERE at the root, in every context', () => {
    for (const ctx of RUN_CONTEXTS) {
      expect(sublineFor({ screen: 'menu', ctx })).toBe('YOU ARE HERE');
    }
  });
});

describe('the footer', () => {
  it('carries the PLAYING AS card, and refuses to invent a profile', () => {
    /*
     * § 20.11: a fixture presented as a player is forbidden. With no profile store, the card falls
     * back to the prototype's own `you` and a streak line that says plainly nothing is saved —
     * never the prototype's authored `4 days running · best 81%`.
     */
    const footer = railFooter({ screen: 'menu', ctx: 'daily' });
    expect(footer.identity.heading).toBe('PLAYING AS');
    expect(footer.identity.name).toBe('you');
    expect(footer.identity.initial).toBe('Y');
    expect(footer.identity.streak).toContain('no days saved');
    expect(footer.identity.streak).not.toMatch(/\d/);
  });

  it('shows a given profile instead of the fallback', () => {
    const footer = railFooter(
      { screen: 'menu', ctx: 'daily' },
      { profile: { name: 'Nadia R.', streak: '4 days running · best 81%' } },
    );
    expect(footer.identity.name).toBe('Nadia R.');
    expect(footer.identity.initial).toBe('N');
  });

  it('colours the disc from the profile, sun until the player picks — § 20.15’s one place', () => {
    expect(railFooter({ screen: 'menu', ctx: 'daily' }).identity.avatarColor).toBe('#F2A63B');
    const footer = railFooter(
      { screen: 'menu', ctx: 'daily' },
      { profile: { name: 'Nadia R.', avatarColor: '#5F7268' } },
    );
    expect(footer.identity.avatarColor).toBe('#5F7268');
    // The streak is not the profile store's to give: with none stated, the honest absence stays.
    expect(footer.identity.streak).toContain('no days saved');
  });

  it('draws Settings as a destination with the › hint, HERE on its own screen', () => {
    // § 3.2: the one rail item drawn as a bordered row with a gear icon and a ›.
    expect(railFooter({ screen: 'menu', ctx: 'daily' }).settings.hint).toBe('›');
    expect(railFooter({ screen: 'settings', ctx: 'daily' }).settings.hint).toBe('HERE');
    const settings = railFooter({ screen: 'menu', ctx: 'daily' }).settings;
    expect(settings.screen).toBe('settings');
    // Availability is the registry's decision, in both directions — same rule as the group rows.
    expect(settings.unavailable === undefined).toBe(EVERYDAY_SCREENS_BUILT.includes('settings'));
  });

  /**
   * The row that used to refuse. It read *"not built yet — Everyday Mode is the only play style in
   * this build"*, and the door is built, so what is asserted here is § D227's rule in the direction
   * that matters after a lane lands: **a control that does something may not claim it does
   * nothing.** The type has no `unavailable` arm any more, so the shape of the model is the first
   * guard and this is the second.
   */
  it('offers the Engineer swap as a live row, with a note rather than a refusal', () => {
    const swap = railFooter({ screen: 'menu', ctx: 'daily' }).engineerSwap;
    expect(swap.label).toBe('Switch to Engineer');
    expect(swap.note).toBe(ENGINEER_SWAP_NOTE);
    /*
     * The three facts the sentence exists to carry, asserted separately from the constant so that
     * rewording it cannot quietly drop one: nothing stops, and the choice lasts one visit.
     */
    expect(swap.note).toContain('nothing stops');
    expect(swap.note).toContain('this visit only');
    // The stale-refusal guard proper: no wording of "not built" may come back onto this row.
    expect(swap.note).not.toMatch(/not built/);
  });
});

describe('the whole model', () => {
  it('carries the brand, the mode, the subline and the footer of the state it was given', () => {
    const model = railModel({ screen: 'fixit', ctx: 'daily' });
    expect(model.brand).toBe('Elevator Sim');
    expect(model.mode).toBe('EVERYDAY MODE');
    expect(model.subline).toBe('FIX A BUILDING');
    expect(model.footer.identity.heading).toBe('PLAYING AS');
  });

  it('defaults to not being in a campaign', () => {
    // The default matters: it is what the shell passes today, and a default of `true` would put
    // entries into a campaign nobody started on the front door.
    expect(railModel({ screen: 'menu', ctx: 'campaign' }).groups.map((g) => g.title))
      .not.toContain('CAMPAIGN');
  });
});
