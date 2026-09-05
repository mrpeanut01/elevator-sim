/**
 * **§ 15.1's words, held to the prototype and to § 20.12** — the copy is transcription, the name
 * refusals are `menu/account.ts`'s own sentences, and the roster of rows is the module's whole
 * point: one wired toggle, two statements of fact, and a drawn register for everything refused.
 */

import { describe, expect, it } from 'vitest';

import {
  SIGNED_OUT,
  displayNameIssueOf,
  linkRequested,
  MAX_DISPLAY_NAME,
  rateLimited,
  signedIn,
  updateForm,
  type AccountState,
} from '../menu/account.js';

import { AVATAR_SWATCHES } from './profile.js';
import { railFooter } from './rail.js';
import {
  NAME_NOTE,
  SETTINGS_ABSENCES,
  SIGN_IN_COPY,
  settingsScreenViewOf,
  type SettingsSignInStage,
} from './settingsView.js';
import { STAGE_SPEEDS } from './stageScreenModel.js';

const BASE = { profile: undefined, reduceMotion: false } as const;

/** A page with an account server behind it — `everyday/host.ts#accountActions()` answered. */
const live = (account: AccountState): { account: AccountState; accountServer: true } => ({
  account,
  accountServer: true,
});

/** Signed in and named. Built through the reducer, so it is a state the machine can produce. */
const named = (displayName: string): AccountState =>
  signedIn(SIGNED_OUT, 'session-token', {
    id: 'u1',
    email: 'someone@example.test',
    displayName,
    displayNameChosen: true,
  });

/** Signed in and still carrying the server's mint — `menu/account.ts#namingStage`. */
const minted = signedIn(SIGNED_OUT, 'session-token', {
  id: 'u1',
  email: 'someone@example.test',
  displayName: 'player-a1b2c3d4e5f6',
  displayNameChosen: false,
});

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

  /**
   * **The note used to be one sentence and is two** — [§ D490](../../../../DECISIONS.md).
   *
   * It read *"This is the name on the daily board, on the ladder, and on any run somebody else
   * watches"* in **both** states, which was a claim about the device-local name that nothing in
   * this tree could falsify while nothing on this side had an account — and § D490 is the ruling
   * that ends that. Measured against the tree rather than argued: the only reader of
   * `everyday/profileStore.ts`'s name is `everyday/shell.ts#drawRail`'s `PLAYING AS` card.
   */
  it('says where the name shows up, and says a different thing about each of the two names', () => {
    expect(settingsScreenViewOf(BASE).you.note).toBe(NAME_NOTE.device);
    expect(NAME_NOTE.device).toContain('this device');
    expect(NAME_NOTE.device).toContain('reaches no board');
    expect(settingsScreenViewOf({ ...BASE, ...live(named('A player')) }).you.note).toBe(
      NAME_NOTE.account,
    );
    expect(NAME_NOTE.account).toContain('account');
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
    /*
     * **`Sign out` is asserted gone, in the same direction and for the same reason** — GitHub issue
     * #332, [§ D489](../../../../DECISIONS.md). Its entry refused the button on the grounds that
     * *nothing on this surface is signed in*; the YOU section holds the session now and *Sign out*
     * is one of its presses. Asserted rather than merely dropped from the list above, because a
     * list that stopped naming it would pass just as well if somebody re-added the entry tomorrow.
     */
    expect(
      entries.filter((entry) => entry.startsWith('Sign out')),
      'the Sign out refusal outlived the control it refused',
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

/**
 * **§ 15.1's account state, and the whole of what GitHub issue #332 authors** —
 * [§ D489](../../../../DECISIONS.md).
 *
 * The six arms are the point rather than the copy: a sign-in surface is judged on its unhappy
 * states, and this file is where they are reachable without a document, a network or a server.
 */
describe('the account block — § D489’s asking half, drawn as six states', () => {
  /**
   * Every declared stage is produced by an input this file names, and the **table is exhaustive by
   * the type** — a seventh stage that nothing here drives does not compile.
   *
   * That is why `settingsView.ts` keeps its stage list module-private and exports the union: a
   * `Record` keyed by the type is a stronger check than a value-list comparison, and it needs no
   * entry in `honesty/derive.test.ts`'s register of exported id tables.
   */
  it('reaches every declared stage, so no arm is a branch nothing produces', () => {
    const inputs: Record<SettingsSignInStage, Parameters<typeof settingsScreenViewOf>[0]> = {
      booting: BASE,
      'no-server': { ...BASE, account: SIGNED_OUT, accountServer: false },
      'signed-out': { ...BASE, ...live(SIGNED_OUT) },
      'link-sent': {
        ...BASE,
        ...live(linkRequested(SIGNED_OUT, { detail: 'on its way', expiresInMs: 900_000 })),
      },
      naming: { ...BASE, ...live(minted) },
      'signed-in': { ...BASE, ...live(named('A player')) },
    };
    for (const [stage, input] of Object.entries(inputs)) {
      expect(settingsScreenViewOf(input).you.signIn.stage, stage).toBe(stage);
    }
  });

  /**
   * GitHub issue #30's own fix ordering, which is a privacy rule rather than a layout one: the
   * screen used to be indistinguishable from a working login until the button was pressed, *"at
   * which point it admitted there had never been anywhere for the address to go"*.
   */
  it('says there is nowhere to sign in before it draws a field, and draws none', () => {
    const view = settingsScreenViewOf({ ...BASE, account: SIGNED_OUT, accountServer: false });
    expect(view.you.signIn.stage).toBe('no-server');
    expect(view.you.signIn.note).toBe(SIGN_IN_COPY.noServer);
    expect(view.you.signIn.fieldLabel).toBeUndefined();
    expect(view.you.signIn.action).toBeUndefined();
  });

  it('draws the booting window as a sentence rather than a form pointed at nothing', () => {
    const view = settingsScreenViewOf(BASE).you.signIn;
    expect(view.stage).toBe('booting');
    expect(view.note).toBe(SIGN_IN_COPY.booting);
    expect(view.fieldLabel).toBeUndefined();
    expect(view.action).toBeUndefined();
  });

  it('asks for an address, and offers the press before anything has been typed', () => {
    const view = settingsScreenViewOf({ ...BASE, ...live(SIGNED_OUT) }).you.signIn;
    expect(view.stage).toBe('signed-out');
    expect(view.fieldLabel).toBe(SIGN_IN_COPY.emailLabel);
    expect(view.action).toBe(SIGN_IN_COPY.request);
    /*
     * § D488: *a reason a player cannot see is not a reason*. An empty box is a form problem and
     * `menu/account.ts#formIssues` answers it **after** the press, in words; greying the button
     * here would be a refusal with nothing beside it, which is the defect that ruling names.
     */
    expect(view.actionOffered).toBe(true);
    expect(view.notice).toBeUndefined();
  });

  /**
   * #332's third criterion, at the file where a paraphrase would be introduced.
   *
   * The four labelled failures are `link-expired`, `link-spent`, `too-many-link-requests` and —
   * since [§ D491](../../../../DECISIONS.md) — `sign-in-mail-not-sent`. Every one of them arrives
   * as `AccountState.notice`, and this asserts the screen carries it rather than writing its own.
   */
  it('carries the server’s own sentence for every refusal, byte for byte', () => {
    for (const detail of [
      'That sign-in link has expired. Ask for a new one — they are good for a few minutes.',
      'That sign-in link has already been used. Each one works once; ask for a new one.',
      'Too many sign-in links have been asked for. Try again shortly, and check your inbox meanwhile.',
      'The sign-in link could not be sent — that is a fault on our side, not with the address. Nothing is on its way, so try again in a moment.',
    ]) {
      const view = settingsScreenViewOf({
        ...BASE,
        ...live(rateLimited(SIGNED_OUT, detail, 60_000)),
      }).you.signIn;
      expect(view.notice).toBe(detail);
      /* Nothing this screen authors may be a second wording of it. */
      expect(Object.values(SIGN_IN_COPY)).not.toContain(detail);
    }
  });

  it('stops offering the press only where a sentence is already standing beside it', () => {
    const gated = settingsScreenViewOf({
      ...BASE,
      ...live(rateLimited(SIGNED_OUT, 'Too many sign-in links have been asked for.', 60_000)),
    }).you.signIn;
    expect(gated.actionOffered).toBe(false);
    expect(gated.notice).toBe('Too many sign-in links have been asked for.');
  });

  it('says a link is out in the server’s own words, and offers a way back to the box', () => {
    const detail =
      'If that address can receive mail, a sign-in link is on its way. It works once and expires in 15 minutes.';
    /*
     * The address is in the form by the time the 202 arrives — the press commits it before it asks
     * — so the state below is the one the shipped flow produces rather than a bare reducer call.
     */
    const asked = linkRequested(updateForm(SIGNED_OUT, { email: 'someone@example.test' }), {
      detail,
      expiresInMs: 900_000,
    });
    const view = settingsScreenViewOf({ ...BASE, ...live(asked) }).you.signIn;
    expect(view.stage).toBe('link-sent');
    expect(view.notice).toBe(detail);
    expect(view.action).toBe(SIGN_IN_COPY.otherAddress);
    /* The address field is gone; the reducer is what brings it back. */
    expect(view.fieldLabel).toBeUndefined();
    /*
     * *Use a different address* is `updateForm`'s own reducer and nothing else — an address that
     * changed takes back *a link is on its way*, because that sentence is no longer about the
     * address in the box. This is the press, driven at the layer that decides it.
     */
    const again = settingsScreenViewOf({ ...BASE, ...live(updateForm(asked, { email: '' })) }).you
      .signIn;
    expect(again.stage).toBe('signed-out');
    expect(again.notice).toBeUndefined();
  });

  it('offers Sign out on both signed-in arms, including the unnamed one', () => {
    expect(settingsScreenViewOf({ ...BASE, ...live(minted) }).you.signIn.signOut).toBe(
      SIGN_IN_COPY.signOut,
    );
    expect(settingsScreenViewOf({ ...BASE, ...live(named('A player')) }).you.signIn.signOut).toBe(
      SIGN_IN_COPY.signOut,
    );
  });

  /**
   * **§ D490's adoption, which is the half a screen would otherwise get backwards.**
   *
   * The server mints `player-<12 hex>` because it must return something. A player who has typed a
   * name and watched the rail draw it must not sign in and find a hex string in its place — that is
   * the sign-in costing them something, and § D456's second refusal test aimed at identity.
   */
  it('offers this device’s name rather than the server’s mint, until one is chosen', () => {
    const device = { profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' } };
    const offering = settingsScreenViewOf({ ...BASE, ...device, ...live(minted) });
    expect(offering.you.nameValue).toBe('Nadia R.');
    expect(offering.you.initial).toBe('N');
    expect(offering.you.signIn.stage).toBe('naming');
    expect(offering.you.signIn.action).toBe(SIGN_IN_COPY.saveName);
    /* An account that has chosen a name keeps it — a second device does not get to rename it. */
    const chosen = settingsScreenViewOf({ ...BASE, ...device, ...live(named('Somebody Else')) });
    expect(chosen.you.nameValue).toBe('Somebody Else');
    expect(chosen.you.initial).toBe('S');
    /* And the device-local value is kept, not overwritten: it answers again on sign-out. */
    expect(settingsScreenViewOf({ ...BASE, ...device }).you.nameValue).toBe('Nadia R.');
  });

  /**
   * § D490's pair, asserted at the two files rather than only in `honesty/agreement.ts`.
   *
   * The corpus property is what catches a *later* reader dropping the ask; this is what catches the
   * two disagreeing today, which is the state the ruling was written about.
   */
  it('publishes the same name as the rail card, signed in and signed out', () => {
    const device = { name: 'Nadia R.', avatarColor: '#4F8A5B' };
    for (const account of [undefined, SIGNED_OUT, minted, named('Somebody Else')]) {
      const settings = settingsScreenViewOf({
        ...BASE,
        profile: device,
        ...(account === undefined ? {} : live(account)),
      });
      const card = railFooter(
        { screen: 'settings', ctx: 'daily' },
        { profile: device, account },
      ).identity;
      expect(card.name, JSON.stringify(account?.user ?? null)).toBe(settings.you.nameValue);
      expect(card.initial).toBe(settings.you.initial);
    }
  });
});
