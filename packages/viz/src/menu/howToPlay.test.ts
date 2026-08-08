/**
 * The how-to-play guide, held against the product it describes — GitHub issue #13.
 *
 * ## What this file is for, stated before the assertions
 *
 * Onboarding copy is the one kind of prose that goes wrong **silently and expensively**: it is
 * read exactly once per player, by the person least able to tell that it is out of date, and no
 * other test in this repository would notice a sentence describing a control that was renamed two
 * waves ago. This repository has already shipped a hand-written list that stopped tracking `data/`
 * five separate times ([§ D213](../../../../DECISIONS.md)) and three published figures that no
 * longer reproduced from the code that made them. A guide is both of those hazards at once.
 *
 * So almost nothing below is a comparison against a literal. The dispatchers the guide names are
 * derived from the loaded configuration; the axes it explains are derived from the free-play
 * screen's own affordances; the modes it introduces are derived from the root screen's own rows;
 * and every number it quotes — the goal ceilings, the wake-up threshold, the run lengths, the
 * count of suppression grounds, the replication budget — is asserted against the constant that
 * produces it. A control that lands, a control that leaves and a bar that moves are each red here.
 *
 * ## The two rules that bind the copy, and how each is checked
 *
 * **No dispatcher is ranked.** CLAUDE.md forbids declaring one dispatcher better than another
 * without a paired-t interval excluding zero, and a game that taught a player otherwise would have
 * taught them something false. A blanket ban on the vocabulary is the wrong instrument — the
 * guide's most important paragraph is the one that says a single run *cannot* say it, and it needs
 * the word — so the check is `documentation.test.ts`'s shape: a ranking verb is permitted only
 * within {@link REFUSAL_WINDOW} characters of a refusal, and the checker is shown to refuse.
 *
 * **No probability word.** R10, through `campaign/words.ts#probabilityWordIn` rather than through a
 * second copy of its list — `words.ts` says in as many words that quietly adding a third copy is
 * how a guard's meaning erodes.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AWT_INVALID_GROUNDS,
  DEFAULT_MAX_ABANDONMENT_FRACTION,
  loadConfig,
} from '@elevator-sim/core';

import { MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { probabilityWordIn } from '../campaign/words.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { GOAL_BARS, goalsForDay } from '../shift/goals.js';
import { WAKE_UP_ARRIVALS } from '../shift/types.js';

import { catalogueOf, type CatalogueSource } from './catalogue.js';
import { canStart, initialMenuState, navigate, partsFor } from './menu.js';
import { screenOf, type MenuGuide, type MenuViewInput } from './screens.js';
import { MENU_SCREENS, type MenuCatalogue } from './types.js';

/* -------------------------------------------------------------------------- *
 * The real configuration, loaded once
 * -------------------------------------------------------------------------- */

/**
 * The **real** `data/`, not a fixture.
 *
 * `menu.test.ts` uses a three-line fixture for the reducer and the real load for the catalogue,
 * and gives the reason: the catalogue's whole purpose is to track `data/`, so a fixture would
 * prove only that it tracks a fixture. The guide describes what `data/` ships, so the same
 * argument applies to every assertion here.
 */
async function catalogue(): Promise<MenuCatalogue> {
  return catalogueOf((await loadConfig(DATA_DIR)) as unknown as CatalogueSource);
}

function viewAt(screen: (typeof MENU_SCREENS)[number], loaded: MenuCatalogue) {
  const input: MenuViewInput = {
    state: navigate(initialMenuState(loaded), screen),
    catalogue: loaded,
    canPost: false,
    hasRun: false,
  };
  return screenOf(input);
}

async function guide(): Promise<MenuGuide> {
  const found = viewAt('main', await catalogue()).guide;
  expect(found, 'the root screen no longer offers the guide at all').toBeDefined();
  return found as MenuGuide;
}

/** Every sentence the guide can put on a screen, as one string. */
const proseOf = (page: MenuGuide): string =>
  [page.title, page.summary, ...page.sections.flatMap((section) => [section.heading, ...section.body])].join(
    '\n',
  );

/** Every paragraph, headings excluded — what a check about a *sentence* should look at. */
const paragraphsOf = (page: MenuGuide): readonly string[] =>
  page.sections.flatMap((section) => section.body);

/**
 * A small count as the guide spells it.
 *
 * Deliberately narrow, and it **throws** outside its range rather than falling back to digits: a
 * count the guide spells and this table cannot is a sentence nobody can check any more, and a
 * silent fallback would report that as a pass.
 */
function wordFor(count: number): string {
  const words: Readonly<Record<number, string>> = {
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
    7: 'seven',
    8: 'eight',
  };
  const word = words[count];
  if (word === undefined) throw new Error(`no spelled form for ${String(count)} — widen the table`);
  return word;
}

/* -------------------------------------------------------------------------- *
 * The entry exists, and it is on the one screen a lost player is standing on
 * -------------------------------------------------------------------------- */

describe('the menu offers a how-to-play entry', () => {
  it('carries it on the root screen and on no other', async () => {
    const loaded = await catalogue();
    const withGuide = MENU_SCREENS.filter((screen) => viewAt(screen, loaded).guide !== undefined);
    // Derived from the union rather than listed, so a screen added later is classified here rather
    // than quietly acquiring — or quietly missing — the guide.
    expect(withGuide).toEqual(['main']);
  });

  it('names itself and says what it is before anything is opened', async () => {
    const page = await guide();
    expect(page.title).toBe('How to play');
    // The closed entry has to answer *should I press this*. A label alone does not.
    expect(page.summary.length).toBeGreaterThan(40);
    expect(page.sections.length).toBeGreaterThanOrEqual(5);
  });

  it('gives every section a heading and something under it', async () => {
    for (const section of (await guide()).sections) {
      expect(section.heading.length, JSON.stringify(section.heading)).toBeGreaterThan(3);
      expect(section.body.length, section.heading).toBeGreaterThan(0);
      for (const paragraph of section.body) {
        // A paragraph short enough to be a label is a heading that lost its section.
        expect(paragraph.length, `${section.heading}: ${paragraph}`).toBeGreaterThan(60);
      }
    }
  });

  it('is reached from the panel rather than only from this test', () => {
    /*
     * The standing requirement — *name the non-test caller* — asked mechanically rather than in a
     * docstring, which is the distinction `docs/05`'s rule turns on: a barrel re-export and a
     * `{@link}` tag look exactly like a caller and are not one. `renderMenu` is DOM-bound and this
     * package has no jsdom, so the caller is asserted from the panel's source.
     */
    const panel = readFileSync(new URL('../dev/menuPanel.ts', import.meta.url), 'utf8');
    expect(panel, 'dev/menuPanel.ts no longer reads the guide off the view').toContain('view.guide');
    /*
     * The call, not the write beside it. This read `list.append(guideEntry(` until GitHub issue
     * #106 stopped the menu list being rebuilt on every draw — the entry is now collected with the
     * six rows and reconciled in with them, which is the same caller through a different verb. The
     * *entry sits in the list* half is `menuPanel.test.ts`'s, driven rather than matched.
     */
    expect(panel).toMatch(/guideEntry\(draw, view\.guide\)/);
  });
});

/* -------------------------------------------------------------------------- *
 * It describes the product that exists — every list derived, never written down
 * -------------------------------------------------------------------------- */

describe('the guide describes the shipped product, in both directions', () => {
  it('introduces every destination the root menu offers', async () => {
    const loaded = await catalogue();
    const text = proseOf(await guide());
    const labels = viewAt('main', loaded)
      .rows.filter((row) => row.intent.kind === 'navigate')
      .map((row) => row.label);

    expect(labels.length, 'the root menu offers nothing to introduce').toBeGreaterThanOrEqual(6);
    const unexplained = labels.filter((label) => !text.includes(label));
    expect(
      unexplained,
      'on the root menu and never mentioned by the guide. A destination a player can press and ' +
        'the guide has never heard of is the gap issue #13 is about, one screen further in.',
    ).toEqual([]);
  });

  it('explains every axis Free play actually offers, and invents none', async () => {
    const loaded = await catalogue();
    const page = await guide();
    // The axes, from the screen itself: a `set-free-play` row *is* an axis, and nothing else is.
    const axes = viewAt('free-play', loaded)
      .rows.filter((row) => row.intent.kind === 'set-free-play')
      .map((row) => row.label);
    expect(axes.length).toBe(6);

    const explanations = page.sections
      .flatMap((section) => section.body)
      .filter((paragraph) => axes.some((axis) => paragraph.startsWith(`${axis} — `)));

    for (const axis of axes) {
      expect(
        explanations.some((paragraph) => paragraph.startsWith(`${axis} — `)),
        `Free play offers "${axis}" and the guide never explains it`,
      ).toBe(true);
    }
    // The other direction: an explanation whose axis is gone would survive the loop above.
    expect(
      explanations.length,
      'the guide explains a control Free play does not offer, or explains one of them twice',
    ).toBe(axes.length);
  });

  it('names every dispatcher the configuration ships', async () => {
    const loaded = await catalogue();
    const text = proseOf(await guide());
    expect(loaded.dispatchers.length).toBeGreaterThanOrEqual(12);

    const unnamed = loaded.dispatchers
      .filter((entry) => !text.includes(entry.name))
      .map((entry) => `${entry.id} ("${entry.name}")`);
    expect(
      unnamed,
      'shipped, offered in the menu, and absent from the guide. The guide describes what each ' +
        'dispatcher does; a dispatcher it has never heard of is the one a new player will pick ' +
        'blind.',
    ).toEqual([]);
  });

  it('names every demand template the configuration ships', async () => {
    const loaded = await catalogue();
    const text = proseOf(await guide()).toLowerCase();
    expect(loaded.demandTemplates.length).toBeGreaterThanOrEqual(5);

    // Word-wise from the id rather than from the display name: the names are citations
    // (*CIBSE rise-and-fall template*) and the guide is written in a player's words, so the id's
    // own words are what both forms share.
    const missing = loaded.demandTemplates
      .filter((entry) => !entry.id.split('-').every((word) => text.includes(word)))
      .map((entry) => entry.id);
    expect(missing, 'a shipped traffic shape the guide does not name').toEqual([]);
  });

  it('counts the axes and the baselines as the configuration counts them', async () => {
    const loaded = await catalogue();
    const page = await guide();
    const axes = viewAt('free-play', loaded).rows.filter((row) => row.intent.kind === 'set-free-play');
    const baselines = loaded.dispatchers.filter((entry) => entry.detail === 'baseline');

    // Spelled counts are the shape of number that goes stale in silence, because no reader checks
    // one against a list. Both are derived here rather than trusted.
    expect(
      page.sections.map((section) => section.heading),
      `Free play offers ${String(axes.length)} axes and no heading says so`,
    ).toContain(`The ${wordFor(axes.length)} things Free play lets you set`);
    expect(proseOf(page), 'the number of profiles marked baseline moved').toContain(
      `${wordFor(baselines.length)[0]?.toUpperCase() ?? ''}${wordFor(baselines.length).slice(1)} carry the role baseline`,
    );
  });

  it('recommends a first run the menu would actually let you start', async () => {
    const loaded = await catalogue();
    const page = await guide();
    // The worked example only. Every dispatcher is named somewhere in the guide, so a search over
    // the whole of it would resolve to whichever ships first rather than to the one recommended.
    const section = page.sections.find((entry) => /first run/i.test(entry.heading));
    expect(section, 'the guide no longer works an example through').toBeDefined();
    const text = (section?.body ?? []).join('\n');

    /*
     * A guide whose worked example is refused at Start is worse than no worked example: the first
     * thing it teaches is that the product is broken. The named building and dispatcher are
     * resolved against the catalogue, and the named length is required to be the shortest offered
     * one the default traffic shape accepts — so a template whose period grows moves this sentence
     * rather than leaving it stranded.
     */
    const building = loaded.buildings.find((entry) => text.includes(entry.name));
    const dispatcher = loaded.dispatchers.find((entry) => text.includes(entry.name));
    expect(building, 'the worked example names no shipped building').toBeDefined();
    expect(dispatcher, 'the worked example names no shipped dispatcher').toBeDefined();

    const base = {
      ...initialMenuState(loaded).freePlay,
      buildingId: building?.id ?? '',
      dispatcherProfileId: dispatcher?.id ?? '',
      arrivalRatePctPop5min: null,
    };
    // The parts the default traffic shape actually offers, shortest first — § D286 replaced the
    // ladder with them, so the worked example is pinned to a part rather than to a rung.
    const offered = [...partsFor(loaded, base.demandTemplateId)].sort(
      (left, right) => left.durationS - right.durationS,
    );
    const shortest = offered.find((part) =>
      canStart({ ...base, durationS: part.durationS, windowStartS: part.windowStartS }, loaded),
    );
    expect(shortest, 'no offered part starts the worked example at all').toBeDefined();
    expect(
      text,
      'the worked example names a run length the menu refuses for the default traffic shape',
    ).toContain(`${String(Math.round((shortest?.durationS ?? 0) / 60))} minutes`);
  });

  it('is not vacuous — the same checks refuse a name that ships nothing', async () => {
    // Without this, every assertion above passes on a guide that contains the whole dictionary.
    const text = proseOf(await guide());
    for (const invented of ['Genetic swarm dispatch', 'Fuzzy heuristic controller']) {
      expect(text.includes(invented), invented).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Every number is pinned to the code that produces it
 * -------------------------------------------------------------------------- */

describe('the figures the guide quotes are the figures the code computes', () => {
  it('quotes the goal ceilings the shift layer actually applies', async () => {
    const text = proseOf(await guide());
    expect(text, 'the away-inside-a-minute ceiling moved').toContain(
      `${String(GOAL_BARS.minuteMax)} %`,
    );
    expect(text, 'the carried ceiling moved').toContain(`${String(GOAL_BARS.carryMax)} %`);
    expect(text, 'the queue floor moved').toContain(`${String(GOAL_BARS.queueMin)} people`);
  });

  it('quotes the wake-up threshold, and the horizon the goal itself names', async () => {
    const text = proseOf(await guide());
    expect(text).toContain(`under ${String(WAKE_UP_ARRIVALS)} arrivals`);
    // The odd-day goal's own label, so the guide and the bar cannot drift apart.
    const horizon = goalsForDay(1).find((goal) => goal.id === 'stairs');
    expect(horizon, 'the abandonment goal is no longer offered on odd days').toBeDefined();
    expect(horizon?.label).toContain('15-minute');
    expect(text).toContain('15-minute');
  });

  it('describes the part-of-day control the menu actually offers, and does not predict the end', async () => {
    /*
     * This case guarded the *Run length* sentence against `FREE_PLAY_DURATIONS_S` — a ladder and a
     * sentence that could drift, which is the § D213 shape the whole file is written against. § D286
     * removed the ladder, so what is guarded is the two claims that replaced it, both of which a
     * later edit could quietly undo.
     */
    const loaded = await catalogue();
    const text = proseOf(await guide());

    // 1 — the control is named for what it chooses, and by the same name in both modes.
    expect(text, 'the guide still calls the control a run length').toContain('Part of the day');
    expect(text).toContain('the same control the campaign uses');

    // 2 — the drain is named and not predicted. Issue #80's fix is that no end time is quoted, so a
    // guide that started printing one would be making the promise the old labels broke.
    expect(text).toContain('until the building has cleared');
    expect(text, 'the guide predicts an end time the run decides').toContain(
      'outcome rather than a prediction',
    );

    // 3 — and the day really does offer more than one part, or the sentence above describes nothing.
    const day = loaded.demandTemplates.find((entry) => (entry.parts?.length ?? 0) > 1);
    expect(day, 'no shipped template offers a part of a day, so the sentence is about nothing').toBeDefined();
  });

  it('quotes the seed bound the validator enforces', async () => {
    const loaded = await catalogue();
    const text = proseOf(await guide());
    expect(text).toContain('1 to 20 digits');

    /*
     * Asserted through the validator rather than against its regex, so the sentence is pinned to
     * the behaviour a player meets rather than to a pattern that could be rewritten around it.
     * The opening selection is used so that no part-of-day mismatch can contribute a second issue
     * and make the seed's own count unreadable.
     */
    const base = initialMenuState(loaded).freePlay;
    const issuesFor = (seed: string): number => freePlayIssueCount(loaded, { ...base, seed });
    expect(issuesFor('1'), 'a one-digit seed is refused').toBe(0);
    expect(issuesFor('1'.repeat(20)), 'a twenty-digit seed is refused').toBe(0);
    expect(issuesFor('1'.repeat(21)), 'a twenty-one-digit seed is accepted').toBeGreaterThan(0);
  });

  it('quotes the suppression grounds the metrics layer declares', async () => {
    const text = proseOf(await guide());
    // Five is the count `AWT_INVALID_GROUNDS` derives from its own table, and the whole point of
    // that table is that a sixth ground enters the enumeration by existing. If it ever does, this
    // sentence is wrong and says so here.
    expect(AWT_INVALID_GROUNDS.length).toBe(5);
    expect(text, 'the guide names a different number of suppression grounds').toContain(
      'five grounds',
    );
    expect(text).toContain(`${String(Math.round(DEFAULT_MAX_ABANDONMENT_FRACTION * 100))} %`);
  });

  it('quotes the replication budget the batch layer requires', async () => {
    const text = proseOf(await guide());
    expect(text).toContain(`${String(MIN_REPLICATION_BUDGET)} to 200 times`);
  });
});

/** `freePlayIssues` through the screen, so the count is the one a player would be shown. */
function freePlayIssueCount(
  loaded: MenuCatalogue,
  selection: MenuViewInput['state']['freePlay'],
): number {
  const state = { ...navigate(initialMenuState(loaded), 'free-play'), freePlay: selection };
  return screenOf({ state, catalogue: loaded, canPost: false, hasRun: false }).issues.length;
}

/* -------------------------------------------------------------------------- *
 * The two rules the copy is not allowed to break
 * -------------------------------------------------------------------------- */

/** Words that turn a description of a dispatcher into a verdict on it. */
const RANKING_WORDS =
  /\b(?:beats?|better|best|worse|worst|outperform\w*|superior|inferior|optimal|wins?|won|strongest|weakest|fastest|slowest)\b/gi;

/**
 * Prose that makes a ranking word part of a **refusal** rather than of a claim.
 *
 * The guide's most important paragraph is the one saying a single run cannot tell you that one
 * dispatcher beat another, and it cannot be written without the verb. So the rule is the shape
 * `packages/experiments/src/validation/documentation.test.ts` uses for the refuted access-control
 * mechanism: the word is permitted near a refusal and nowhere else.
 */
const REFUSAL_WORDS = /\b(?:not|never|cannot|can’t|without|needs|requires|no)\b/gi;

/** Characters either side of a ranking word in which a refusal must appear. */
const REFUSAL_WINDOW = 160;

/** Distance from an occurrence to the nearest refusal, or `Infinity`. */
function nearestRefusal(text: string, start: number, end: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const marker of text.matchAll(REFUSAL_WORDS)) {
    const from = marker.index;
    const to = from + marker[0].length;
    const distance = from >= end ? from - end : to <= start ? start - to : 0;
    if (distance < best) best = distance;
  }
  return best;
}

function unrefutedRankings(text: string): readonly string[] {
  const found: string[] = [];
  for (const claim of text.matchAll(RANKING_WORDS)) {
    const start = claim.index;
    if (nearestRefusal(text, start, start + claim[0].length) > REFUSAL_WINDOW) {
      found.push(`"${claim[0]}" in: ${text.slice(Math.max(0, start - 90), start + 90)}`);
    }
  }
  return found;
}

describe('the guide never ranks a dispatcher', () => {
  it('states no comparative claim without a refusal beside it', async () => {
    const offences = paragraphsOf(await guide()).flatMap((paragraph) => unrefutedRankings(paragraph));
    expect(
      offences.join('\n'),
      'CLAUDE.md: never declare one dispatcher better than another without a paired-t interval ' +
        'excluding zero. A game that says it anyway has taught a player something false, and the ' +
        'player carries it out of the game.',
    ).toBe('');
  });

  it('still says, in terms, what a single run cannot establish', async () => {
    // The other direction, and the one that matters: passing the check above by deleting the
    // paragraph would leave the guide silent about the one thing it most needs to say.
    const text = proseOf(await guide());
    expect(text).toMatch(/one dispatcher beat another/i);
    expect(text).toMatch(/paired interval that excludes zero/i);
    expect(text).toContain('Compare');
  });

  it('is not vacuous — an unrefuted comparative would be caught', () => {
    expect(
      unrefutedRankings('Predictive balanced is the best dispatcher for a busy office building.'),
    ).not.toEqual([]);
    // …and the guide's own refusing sentence is genuinely permitted rather than merely absent.
    expect(
      unrefutedRankings('Saying that one dispatcher beat another needs a paired interval.'),
    ).toEqual([]);
  });
});

describe('the guide never translates an interval into a feeling — R10', () => {
  it('contains no probability word', async () => {
    const page = await guide();
    const offenders = [page.title, page.summary, ...page.sections.flatMap((s) => [s.heading, ...s.body])]
      .map((text) => ({ text, word: probabilityWordIn(text) }))
      .filter((entry) => entry.word !== null)
      .map((entry) => `${entry.word ?? ''}: ${entry.text.slice(0, 120)}`);
    expect(offenders).toEqual([]);
  });

  it('is not vacuous — the shared list still refuses one', () => {
    expect(probabilityWordIn('a dispatcher that is likely to help')).toBe('likely');
  });
});

/* -------------------------------------------------------------------------- *
 * Energy is an axis, never a score — § D106
 * -------------------------------------------------------------------------- */

describe('the guide keeps energy an axis', () => {
  it('says energy sits beside the wait figures rather than inside them', async () => {
    const text = proseOf(await guide());
    expect(text).toMatch(/energy sits beside the wait figures/i);
    expect(text).toMatch(/never folded into/i);
    // The consequence § D106 turns on, said rather than implied: spending less by carrying fewer
    // people is not a saving, which is why the per-served-leg figure travels with the raw one.
    expect(text).toMatch(/work per served leg/i);
  });

  it('describes the day report as three states, and names them as the panel does', async () => {
    /*
     * § D223 made this three states the day before the guide landed — *nothing filed*, *still
     * running*, and the filed sheet — and a guide that said two would have been stale on arrival.
     * Both titles are read out of the panel's own source rather than restated here, so a fourth
     * state or a re-worded one is red in this file rather than discovered by a reader.
     */
    const text = proseOf(await guide());
    expect(text).toMatch(/nothing has been filed/i);
    expect(text).toMatch(/the day is still running/i);
    expect(text).toMatch(/the left rail/i);

    const panel = readFileSync(new URL('../dev/reportPanel.ts', import.meta.url), 'utf8');
    expect(panel, 'the empty report state was renamed').toContain("title: 'Nothing filed yet'");
    expect(panel, 'the running report state was renamed').toContain(
      "title: 'The day is still running'",
    );
  });

  it('describes a withheld mean as a refusal rather than as a penalty', async () => {
    const text = proseOf(await guide());
    expect(text).toMatch(/withheld rather than printed/i);
    expect(text).toMatch(/not a fault, and not a low score/i);
  });
});
