/**
 * **§ 15.1's words, held to the prototype and to § 20.12** — the copy is transcription, the name
 * refusals are `menu/account.ts`'s own sentences, and the roster of rows is the module's whole
 * point: one wired toggle, two statements of fact, and a drawn register for everything refused.
 */

import { describe, expect, it } from 'vitest';

import { displayNameIssueOf, MAX_DISPLAY_NAME } from '../menu/account.js';

import { AVATAR_SWATCHES } from './profile.js';
import { railFooter } from './rail.js';
import { SETTINGS_ABSENCES, settingsScreenViewOf } from './settingsView.js';
import { STAGE_SPEEDS } from './stageScreenModel.js';

const BASE = { profile: undefined, reduceMotion: false } as const;

describe('the § 15.1 header', () => {
  it('carries the prototype’s eyebrow, title and lede, verbatim', () => {
    const view = settingsScreenViewOf(BASE);
    expect(view.eyebrow).toBe('ELEVATOR SIM · EVERYDAY MODE');
    expect(view.title).toBe('Settings');
    expect(view.lede).toBe(
      'Your name and picture travel with every run you post, so somebody watching your Friday ' +
        'sees them. Everything else here only changes how the game looks and sounds to you.',
    );
  });
});

describe('You — the name, the disc and the six swatches', () => {
  it('falls back to the prototype’s `you` on sun, never an invented player', () => {
    const view = settingsScreenViewOf(BASE);
    expect(view.you.nameValue).toBe('you');
    expect(view.you.initial).toBe('Y');
    expect(view.you.avatarColor).toBe('#F2A63B');
    expect(view.you.nameIssue).toBeUndefined();
  });

  it('offers exactly the curated six, with the stored colour selected', () => {
    const view = settingsScreenViewOf({
      ...BASE,
      profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' },
    });
    expect(view.you.swatches.map((swatch) => swatch.color)).toEqual(
      AVATAR_SWATCHES.map((swatch) => swatch.color),
    );
    expect(view.you.swatches.filter((swatch) => swatch.selected).map((s) => s.id)).toEqual([
      'moss',
    ]);
  });

  it('refuses a draft in account.ts’s own sentence, beside the field, and leaves the disc alone', () => {
    const draft = 'x'.repeat(MAX_DISPLAY_NAME + 1);
    const view = settingsScreenViewOf({
      ...BASE,
      profile: { name: 'Nadia R.', avatarColor: '#B8462B' },
      draftName: draft,
    });
    // The same rule, the same words — asserted through the function so the two cannot drift.
    expect(view.you.nameIssue).toBe(displayNameIssueOf(draft));
    expect(view.you.nameIssue).toContain(String(MAX_DISPLAY_NAME));
    // The field shows the draft; the disc shows the committed identity. A refused keystroke
    // must not move the letter the rail is also showing.
    expect(view.you.nameValue).toBe(draft);
    expect(view.you.initial).toBe('N');
  });

  it('says where the name shows up, in the prototype’s words', () => {
    expect(settingsScreenViewOf(BASE).you.note).toBe(
      'This is the name on the daily board, on the ladder, and on any run somebody else watches.',
    );
  });

  it('owns up when a write did not survive the tab, and only then', () => {
    expect(settingsScreenViewOf(BASE).you.saveNotice).toBeUndefined();
    expect(settingsScreenViewOf({ ...BASE, durable: true }).you.saveNotice).toBeUndefined();
    expect(settingsScreenViewOf({ ...BASE, durable: false }).you.saveNotice).toContain(
      'until this tab closes',
    );
  });
});

describe('Playing — two wired rows, never a dead toggle (§ 20.12)', () => {
  it('draws Motion from the Engineer switch, in the prototype’s two faces', () => {
    const full = settingsScreenViewOf({ ...BASE, reduceMotion: false });
    expect(full.playing.rows[0]).toEqual({
      id: 'motion',
      label: 'Motion',
      note: 'cars and figures animate',
      value: 'full',
      on: true,
    });
    const reduced = settingsScreenViewOf({ ...BASE, reduceMotion: true });
    expect(reduced.playing.rows[0]).toMatchObject({ value: 'reduced', on: false });
  });

  /**
   * **Units, in both faces, and it is the row that closed GitHub issue #170's second half.**
   *
   * `value` is what the pill says, and § 18's prototype state calls this preference `imperial`, so
   * the two words are the prototype's own. `on` is the *filled* face rather than a claim about
   * which unit is correct: filled means the player chose it, and metres is § 13's default.
   *
   * What this case cannot see is whether the preference reaches a figure — that is
   * `units.test.ts`'s and `designerModel.test.ts`'s, where a converted number can be compared
   * against an unconverted one. A row that said *feet* over a screen still drawing metres would
   * pass here and fail there, which is why both exist. See [§ D448](../../../../DECISIONS.md).
   */
  it('draws Units in both faces, filled on the preference a player chose', () => {
    const metres = settingsScreenViewOf({ ...BASE, units: 'metric' });
    expect(metres.playing.rows.find((row) => row.id === 'units')).toEqual({
      id: 'units',
      label: 'Units',
      note: 'machine specifications read in metres or feet',
      value: 'metres',
      on: false,
    });
    const feet = settingsScreenViewOf({ ...BASE, units: 'imperial' });
    expect(feet.playing.rows.find((row) => row.id === 'units')).toMatchObject({
      value: 'feet',
      on: true,
    });
    // § 13's default, for a caller that has nothing stored to pass.
    expect(settingsScreenViewOf(BASE).playing.rows.find((row) => row.id === 'units')).toMatchObject(
      { value: 'metres' },
    );
  });

  it('draws the Motion row’s absence — not the row — while the Engineer surface is booting', () => {
    const view = settingsScreenViewOf({ profile: undefined, reduceMotion: undefined });
    expect(view.playing.rows.map((row) => row.id)).toEqual(['units']);
    expect(view.playing.absentNote).toContain('still loading');
    // And never both: a sentence about a missing switch beside the switch would be a contradiction.
    expect(settingsScreenViewOf(BASE).playing.absentNote).toBeUndefined();
    /*
     * **Units does not share that window, and the asymmetry is the claim.** Motion holds no value
     * of its own — it reads the Engineer's — so before the bridge arrives a press would land
     * nowhere. Units holds this device's own preference, so it is drawable from the first paint,
     * and hiding it while an unrelated surface booted would be a control withheld for no reason a
     * player could act on.
     */
  });

  it('offers no Sound, Default speed or posting toggle — those seams do not exist', () => {
    /*
     * The roster rule, asserted as a negative — and **Units has left this list**, which is the half
     * worth reading. The evidence for the three that remain is the module docstring's greps: no
     * audio machinery, no Everyday `run.speed`, no `settings.noPost` flag in this tree
     * (`honesty/generate.ts` says so outright). Units was here on exactly that footing until
     * `everyday/units.ts` became the reader its refusal said did not exist.
     */
    const ids = settingsScreenViewOf(BASE).playing.rows.map((row) => row.id);
    expect(ids).toEqual(['motion', 'units']);
  });
});

describe('This device — statements of fact, and the register of refusals beside them', () => {
  it('states where progress lives and that replay verification is always on', () => {
    const facts = settingsScreenViewOf(BASE).device.facts;
    expect(facts.map((fact) => fact.label)).toEqual([
      'Where your progress lives',
      'Replay verification',
    ]);
    expect(facts[0]?.value).toBe('this device');
    expect(facts[1]?.value).toBe('always on');
    expect(facts[1]?.note).toContain('re-simulated by the server');
  });

  /**
   * The register is not on this view any more, and the case follows it rather than being deleted.
   *
   * GitHub issue #207 moved all six registers onto one build-information panel, so
   * `settingsScreenViewOf` no longer carries them — `everyday/buildNotes.ts` draws them, reached
   * from this screen. What is asserted is unchanged: every refused row, named, with its reason in
   * one clause. The half that went away is the *placement*, and the case that pins the placement is
   * `buildNotes.test.ts`'s, which asserts this array reaches the panel.
   */
  it('names every refused row with its reason, one clause each', () => {
    const entries = SETTINGS_ABSENCES;
    expect(settingsScreenViewOf(BASE)).not.toHaveProperty('absences');
    for (const label of [
      'Sound',
      'Default speed',
      'Post runs to the board',
      'Sign out',
      'Clear saved progress',
      /*
       * `Switch to Engineer` was the seventh and is deliberately absent — the rail's § 3.2 row
       * opens the Engineer surface now, so a register still refusing it would be § D227's stale
       * refusal. The case below asserts that absence rather than this list merely not mentioning it.
       */
    ]) {
      expect(entries.some((entry) => entry.startsWith(label)), label).toBe(true);
    }
    /*
     * **`Units` is asserted gone, in the same direction and for the same reason** — GitHub issue
     * #170, [§ D448](../../../../DECISIONS.md). Its consumer is built and the row is drawn, so a
     * register still carrying it would be § D227's stale refusal: a sentence telling a player there
     * is nothing behind a control they can press. Asserted rather than merely dropped from the list
     * above, because a list that stopped naming it would pass just as well if somebody re-added the
     * entry tomorrow.
     */
    expect(
      entries.filter((entry) => entry.startsWith('Units')),
      'the Units refusal outlived its consumer',
    ).toEqual([]);
    // § 20.12's own sentence rides with the Sound entry.
    expect(entries.find((entry) => entry.startsWith('Sound'))).toContain(
      'a toggle that toggles nothing is a lie',
    );
  });

  /**
   * **The `Default speed` entry counts the ladder; it does not state a number** — GitHub issue
   * #286, `RISKS.md` R38.
   *
   * It said *five* for two waves after [§ D354](../../../../DECISIONS.md) made the ladder seven,
   * on a string a player reads, and nothing went red — the sentence was in the honesty corpus the
   * whole time (`surfaces.ts#EVERYDAY_BUILD_NOTES` seeds this array) and **no property compares a
   * written count against the structure it counts**. So this case is the instrument, and it is
   * written to survive the next ladder change rather than to pin today's seven: it asserts the
   * shipped sentence carries `STAGE_SPEEDS.length`, whatever that becomes.
   *
   * The second half is what makes it a guard rather than a tautology. A count restated **in words**
   * beside the derived one would read as authoritative and drift on its own, so a spelled number
   * anywhere in the entry is a failure — which is exactly the shape the old string had.
   *
   * The row itself belongs to GitHub issue **#229**; only its count belongs here.
   */
  it('counts the stage’s speeds from `STAGE_SPEEDS` rather than writing the number down', () => {
    const entry = SETTINGS_ABSENCES.find((one) => one.startsWith('Default speed'));
    expect(
      entry,
      'the `Default speed` entry has gone. #229 owns whether the row is refused at all; if the ' +
        'refusal was withdrawn, delete this case with it rather than leaving a guard over nothing.',
    ).toBeDefined();
    expect(
      entry,
      'the count in this sentence is not the ladder’s. Interpolate `STAGE_SPEEDS.length`; a ' +
        'corrected literal is the same defect with a fresher number.',
    ).toContain(`its own ${String(STAGE_SPEEDS.length)} speeds`);
    for (const word of ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']) {
      expect(
        entry,
        `“${word}” is a count written in words where one is already derived — two counts in one ` +
          'sentence is the drift this case exists to stop.',
      ).not.toContain(word);
    }
  });

  /**
   * The inverse of the case this replaces, and the inversion is the point.
   *
   * It used to read *"refuses the Engineer swap in the rail's words, so two surfaces refuse once"*
   * and pinned `Switch to Engineer — not built yet …` in this register against the same sentence on
   * the rail's row. The rail's row opens the Engineer surface now, so the register may not mention
   * it at all: an entry in a list of *rows this screen does not draw* naming a control that works
   * two centimetres to the left is § D227's stale refusal, and the whole reason this register is
   * swept rather than left in a docstring.
   *
   * The rail is asserted here as well as in `rail.test.ts`, deliberately — the claim under test is
   * about the **pair**, exactly as the deleted case's was, and a register checked only against
   * itself is what let the last defect through.
   */
  it('does not name the Engineer swap at all, because the rail’s row opens it', () => {
    expect(SETTINGS_ABSENCES.find((entry) => entry.startsWith('Switch to Engineer'))).toBeUndefined();
    /*
     * The row's name anywhere, not only as a prefix — a re-worded entry would move it off the front
     * of the string and past the check above. The bare word `Engineer` is deliberately *not* what is
     * asserted: the Default speed entry names the Engineer stage, correctly, and banning the word
     * would make this case fail for a sentence that is true.
     */
    for (const entry of SETTINGS_ABSENCES) expect(entry).not.toContain('Switch to Engineer');
    // The other half of the pair: the row this register used to refuse about is live and noted.
    const swap = railFooter({ screen: 'settings', ctx: 'daily' }).engineerSwap;
    expect(swap.label).toBe('Switch to Engineer');
    expect(swap.note).not.toMatch(/not built/);
  });
});
