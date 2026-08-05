/**
 * The palette, twice — `docs/12-design-handoff.md` § 1.1 S6/S7, and the light mode beside it.
 *
 * ## Why this file exists
 *
 * The handoff's § 2.2 counts the copies: `index.html`'s custom properties, `render/canvas.ts`'s
 * `DEFAULT_THEME`, and the design artefact itself. *"Three copies of a palette is the same defect
 * class this repository has closed ten times: one source, derived everywhere."* This is that
 * source. `render/canvas.ts` builds `DEFAULT_THEME` out of these names and the stylesheet lane
 * imports the same names; neither is allowed a literal of its own.
 *
 * Nothing here is exported anywhere else. `src/index.ts` deliberately does not re-export it: a
 * palette is an implementation detail of the two surfaces that draw, and a third consumer would
 * be a fourth copy waiting to happen.
 *
 * ## Two modes, and where each one lives
 *
 * The loose `export const`s below **are** the dark palette — § S6/S7's own values, and the ones
 * `index.html`'s `:root` is pinned to by `dev/tokens.test.ts`. {@link LIGHT_PALETTE} is the second
 * mode, authored here, and {@link Palette} is the shape both satisfy: one field per token, named
 * as the camelCase of the constant, so the two modes cannot drift apart in *coverage* even where
 * they differ in every value.
 *
 * The **dark** `Palette` record is assembled in `render/canvas.ts` (`DARK_PALETTE`) rather than
 * here, and the reason is mechanical rather than aesthetic: `deadCode.test.ts`'s *"carries the
 * palette on the namespace rule"* pin reads `tokens.PAGE` **in `canvas.ts`**, and the fifth audit's
 * scanner keeps all fifty-seven constants below alive through exactly that namespace read.
 * Assembling the dark record here instead would move them onto the weaker self-use rule inside
 * their own file and make that pin false. So: the colours live here, in both modes; the *claims*
 * — and the dark assembly that feeds them — live in `canvas.ts`. `render/theme.test.ts` asserts
 * that every string-valued export of this file appears in that record, in both directions, so the
 * split cannot hide a token from either mode.
 *
 * ## Two groups, and the difference matters
 *
 * The **shell** tokens are the handoff's own S6/S7 values, verbatim. They are what a reviewer
 * diffs `docs/design/elevator-sim-reimagined.dc.html` against, so a value that disagrees with the
 * artefact is a bug in this file rather than a preference.
 *
 * The **stage** tokens are the ones the artefact only ever writes inline inside its `draw()`
 * method (`:1988–2163`) — the shaft recess, the slab wash, the lit-window tints, the sky ramps.
 * They are named here for the same reason the shell ones are: the alternative is a hex literal
 * in a drawing function, which is where the previous three copies came from.
 *
 * ## Where a design value was *not* taken, and why
 *
 * Three of the handoff's values collide with each other on this canvas. That is tolerable in a
 * prototype and is not tolerable here, because `render/`'s tests identify a mark **by its fill**:
 * `canvas.test.ts` counts *"the rider glyphs drawn in the settling band's colour"*, and if the
 * up-direction badge shares that string the count is wrong and the test is measuring the wrong
 * thing. Each divergence is named at the constant that carries it. The rule this file keeps is
 * the one `DEFAULT_THEME` has kept since wave 2: **two different claims never share a colour**,
 * and where the design would make them, the *narrower* claim moves and the band palette does not.
 */

/* -------------------------------------------------------------------------- *
 * Shell — § 1.1 S6, verbatim from the artefact
 * -------------------------------------------------------------------------- */

/** The page ground. Everything else sits on it. */
export const PAGE = '#0b0e14';
/** The two rails, and the stage's own recessed ground. */
export const RAIL = '#0e131b';
/** A card. */
export const CARD = '#10151e';
/** A card that has to read as *above* another card — a plate inside a card. */
export const CARD_RAISED = '#131924';
/** Every hairline border and every rule. */
export const EDGE = '#212a36';
/** Body text and every figure. */
export const TEXT = '#e8edf4';
/** An eyebrow, a caption, a label that is not the subject. */
export const TEXT_DIM = '#6d7b8d';
/** Secondary prose — dimmer than {@link TEXT}, brighter than {@link TEXT_DIM}. */
export const TEXT_MUTED = '#8b98a9';
/** Focus, selection, and the mid-load car. */
export const ACCENT = '#4f9ee8';

/* -------------------------------------------------------------------------- *
 * Shell — the ten `index.html` alone used to declare
 * -------------------------------------------------------------------------- *
 *
 * These are shell tokens with no name in § S6's sentence and a value in the artefact all the
 * same: the second edge, the hint underline, the fifth surface, the two accent relatives. They
 * lived as literals in `render/theme.ts`'s dark record until the light mode needed the same ten,
 * at which point keeping them there would have meant *two* files each holding half a palette in
 * two modes — the § 2.2 defect with an extra dimension. Their values are `index.html`'s, and
 * `dev/tokens.test.ts` pins every one of them to it.
 */

/** A plate that has to read above a {@link CARD_RAISED} — the fifth and last surface. */
export const RAISED = '#16212f';
/** The handoff's *second* edge: a range track, a scrollbar thumb, a pill's border. */
export const EDGE_MID = '#26303d';
/** A control's border, and the strongest line the shell draws. */
export const EDGE_STRONG = '#2f3a49';
/** The lightest rule there is — a grid gap between two cards. */
export const HAIRLINE = '#1a212c';
/** The dotted rule under a term that carries a tooltip. Lighter than a control's border. */
export const HINT_UNDERLINE = '#3f4b5c';
/** Ink below {@link FLOOR_LABEL}: present, and never carrying a word that matters. */
export const TEXT_FAINTER = '#3d4956';
/** A link, and the accent where it has to survive being read as prose. */
export const ACCENT_SOFT = '#7fb6f0';
/** Text drawn *on* an accent fill, so it inverts with the accent rather than with the page. */
export const ACCENT_INK = '#08131f';
/** Over capacity — the shell's own red, one step off {@link BAND_ABANDONED}. */
export const OVER = '#e0563a';
/** A figure that was measured rather than asserted — `docs/12` § 4.2. */
export const MEASURED = '#9fc48a';

/* -------------------------------------------------------------------------- *
 * The wait-age bands — § 1.1 S7
 * -------------------------------------------------------------------------- */

/**
 * The four wait-age colours, in ladder order, used for **every** wait-age claim on every surface.
 *
 * These are the handoff's own four and they do not move. Where another token would have collided
 * with one of them, the other token moved — see {@link WAITING_UP} and {@link FLOOR_LABEL}.
 *
 * They are never the only signal: `render/riderQueue.ts`'s `BAND_GLYPH` gives each band a
 * distinct **shape**, and `render/landingMarks.test.ts` proves the four survive the colour being
 * taken away entirely. `UX.md` KB-15.
 */
export const BAND_SETTLING = '#3fb27f';
export const BAND_WAITING = '#e0b040';
export const BAND_LONG = '#e0773a';
export const BAND_ABANDONED = '#e0473a';

/* -------------------------------------------------------------------------- *
 * Stage — the artefact's `draw()`, named
 * -------------------------------------------------------------------------- */

/**
 * The four sky ramps, keyed by the band of the day — design `:2000–2005`.
 *
 * A vertical two-stop ramp per band. `render/sky.ts` chooses the band from the hour and paints
 * the ramp; the hour comes from the frame, never from a clock (`CLAUDE.md` invariant 3).
 */
export const SKY_DAWN = ['#171d2b', '#2a2233'] as const;
export const SKY_DAY = ['#16202e', '#101722'] as const;
export const SKY_DUSK = ['#22202e', '#2d2320'] as const;
export const SKY_NIGHT = ['#0c1018', '#141a26'] as const;

/** The translucent mass of the building, behind the plot — design `:2019`. */
export const STAGE_MASS = 'rgba(14,19,27,0.86)';
/** One floor's slab. A wash rather than a line, so it reads as structure — design `:2027`. */
export const STAGE_SLAB = 'rgba(255,255,255,0.045)';
/** The dark recess a shaft is cut into — design `:2054`. */
export const STAGE_SHAFT_RECESS = 'rgba(4,7,12,0.55)';
/** The hairline around that recess — design `:2056`. */
export const STAGE_SHAFT_HAIRLINE = 'rgba(255,255,255,0.05)';
/** The travelling cable, from the shaft head to the car — design `:2060`. */
export const STAGE_CABLE = 'rgba(255,255,255,0.06)';
/** The line the entrance floor stands on — design `:2160`. */
export const STAGE_GROUND = 'rgba(255,255,255,0.14)';
/** A lit window after dark: warm, and the same amber as the second wait band on purpose. */
export const STAGE_WINDOW_NIGHT = 'rgba(224,176,64,0.13)';
/** A lit window in daylight: cold, and barely there. */
export const STAGE_WINDOW_DAY = 'rgba(180,205,235,0.05)';

/** The gap the doors open into, drawn *as* the gap rather than as two leaves — design `:2078`. */
export const DOOR_GAP = 'rgba(5,8,13,0.92)';

/* -------------------------------------------------------------------------- *
 * Floor labels — design `:2041`
 * -------------------------------------------------------------------------- */

/**
 * A floor with nothing special about it.
 *
 * **Not {@link TEXT_DIM}, and that is the design's own distinction rather than ours**: the label
 * gutter is scenery and an eyebrow is content, and the artefact draws them two different greys.
 * It also happens to close a collision this file would otherwise have had — a test that
 * identified a floor label by its fill matched every dimmed caption on the canvas.
 */
export const FLOOR_LABEL = '#4d5a6b';
/** The entrance floor, `⌂`. */
export const FLOOR_LABEL_ENTRANCE = '#6f8fd6';
/** A transfer floor / sky lobby, `⇄`. */
export const FLOOR_LABEL_TRANSFER = '#c69ad8';
/** A floor no shaft in this building reaches, `⊘` — `UX.md` RV-08. */
export const FLOOR_LABEL_RESTRICTED = '#c9a56a';

/* -------------------------------------------------------------------------- *
 * Cars
 * -------------------------------------------------------------------------- */

/** A car with room in it. The handoff's `#3fb27f`; shares its value with {@link BAND_SETTLING}. */
export const CAR_LIGHT = BAND_SETTLING;
/** A car carrying a useful load. */
export const CAR_MID = ACCENT;
/** A car at or past the 80 % fill rule — `CLAUDE.md` § Modeling rules. */
export const CAR_HEAVY = '#e0a03a';
/** A car past the overload alarm. Never drawn without the `!` glyph — `KB-15b`, `UX.md` RV-14. */
export const CAR_OVERLOAD = BAND_ABANDONED;
/** A car travelling down. The handoff's violet; nothing else on the stage is this colour. */
export const CAR_DOWN = '#c07ad8';
/** The occupant count printed inside a car — design `:2081`. Dark, because the car is not. */
export const CAR_OCCUPANT_TEXT = 'rgba(8,19,31,0.85)';

/**
 * A landing with people waiting to go **up**.
 *
 * ## Moved off the design's `#3fb27f`, deliberately
 *
 * The artefact paints *up* and *the freshest wait band* the same green (`:2091` and `:1371`).
 * They are two different claims about two different subjects — which way a queue wants to go, and
 * how long it has stood — and this renderer draws them **on the same row**. `canvas.test.ts`
 * identifies a settling rider by its fill and counts them; with one string for both claims that
 * count also picks up the `▲3` badge two cells to its left, and the test silently measures
 * something else.
 *
 * The *band* palette is the one § S7 calls canonical *"for every wait-age claim on every
 * surface"*, so the band keeps the design's value and the direction pair moves. This is a
 * teal-shifted green: adjacent to the band at a glance, a different string to a test, and still
 * unmistakably the *go up* colour beside {@link CAR_DOWN}'s violet.
 */
export const WAITING_UP = '#57c7a6';
/** A landing with people waiting to go **down**. The handoff's violet, unchanged. */
export const WAITING_DOWN = CAR_DOWN;

/* -------------------------------------------------------------------------- *
 * The out-of-service badge — design `:2094–2110`, and `docs/12` § 1.5 B7
 * -------------------------------------------------------------------------- */

/** A car held out of service: a filled red pill, `OOS`. */
export const OOS_ON = 'rgba(224,86,58,0.9)';
/** Text on that pill. Dark, because the pill is not. */
export const OOS_ON_TEXT = '#160b08';
/** A car in service: an unfilled pill, `⏻`. */
export const OOS_OFF = 'rgba(255,255,255,0.07)';
/** Text on that pill. */
export const OOS_OFF_TEXT = TEXT_DIM;

/* -------------------------------------------------------------------------- *
 * Alarms and relief
 * -------------------------------------------------------------------------- */

/** A landing that has stacked past `ALARM_STACK_DEPTH` people — see `render/riderFigures.ts`. */
export const ALARM = BAND_ABANDONED;

/**
 * A boarding that just happened.
 *
 * Distinct from {@link BAND_SETTLING} and {@link WAITING_UP}, which are the two other greens on
 * this canvas. The comment `DEFAULT_THEME` has carried since wave 2 stands: a test that
 * identified the relief mark by its fill also matched every up-call badge and every lightly
 * loaded car, and it did.
 */
export const RELIEF = '#7fd6b0';

/** The mark a reader has selected — `UX.md` RV-T3. Brighter than {@link TEXT}, on purpose. */
export const HIGHLIGHT = '#f2f6fa';
/** A warning sentence. Shares the second band's amber; nothing distinguishes the two by fill. */
export const WARNING = BAND_WAITING;
/** A floor line in the editor preview, which draws lines where the stage draws slabs. */
export const PREVIEW_FLOOR_LINE = '#1b2431';

/* -------------------------------------------------------------------------- *
 * The shape both modes satisfy
 * -------------------------------------------------------------------------- */

/** A two-stop vertical sky ramp: the colour at the top of the stage and the one at the bottom. */
export type PaletteRamp = readonly [top: string, bottom: string];

/**
 * One mode's colours — **one field per constant in this file, named as its camelCase.**
 *
 * That rule is the whole design of this type. A palette written as a free-form record would let a
 * mode carry a colour the other mode has never heard of, which is how a light theme ends up
 * repainting eleven of twenty-seven tokens and leaving the rest; a palette whose fields are
 * *claims* rather than *colours* would duplicate `render/canvas.ts`'s `Theme`, which is the claim
 * vocabulary and is derived from this one. So this is the design's vocabulary, twice over, and the
 * projection to claims happens once in `canvas.ts#themeFromPalette`.
 *
 * The fields are grouped exactly as the constants above are grouped: shell, bands, stage, floor
 * labels, cars, badges, alarms. Each is documented at its constant and not restated here.
 */
export interface Palette {
  /* Shell — § 1.1 S6, and the ten `index.html` declares. */
  readonly page: string;
  readonly rail: string;
  readonly card: string;
  readonly cardRaised: string;
  readonly raised: string;
  readonly edge: string;
  readonly edgeMid: string;
  readonly edgeStrong: string;
  readonly hairline: string;
  readonly hintUnderline: string;
  readonly text: string;
  readonly textDim: string;
  readonly textMuted: string;
  readonly fainter: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentInk: string;
  readonly over: string;
  readonly measured: string;

  /* The wait-age bands — § 1.1 S7. */
  readonly bandSettling: string;
  readonly bandWaiting: string;
  readonly bandLong: string;
  readonly bandAbandoned: string;

  /* Stage — the artefact's `draw()`. */
  readonly skyDawn: PaletteRamp;
  readonly skyDay: PaletteRamp;
  readonly skyDusk: PaletteRamp;
  readonly skyNight: PaletteRamp;
  readonly stageMass: string;
  readonly stageSlab: string;
  readonly stageShaftRecess: string;
  readonly stageShaftHairline: string;
  readonly stageCable: string;
  readonly stageGround: string;
  readonly stageWindowNight: string;
  readonly stageWindowDay: string;
  readonly doorGap: string;

  /* Floor labels. */
  readonly floorLabel: string;
  readonly floorLabelEntrance: string;
  readonly floorLabelTransfer: string;
  readonly floorLabelRestricted: string;

  /* Cars, and the two directions. */
  readonly carLight: string;
  readonly carMid: string;
  readonly carHeavy: string;
  readonly carOverload: string;
  readonly carDown: string;
  readonly carOccupantText: string;
  readonly waitingUp: string;
  readonly waitingDown: string;

  /* The out-of-service badge. */
  readonly oosOn: string;
  readonly oosOnText: string;
  readonly oosOff: string;
  readonly oosOffText: string;

  /* Alarms, relief, and the two odds and ends. */
  readonly alarm: string;
  readonly relief: string;
  readonly highlight: string;
  readonly warning: string;
  readonly previewFloorLine: string;
}

/* -------------------------------------------------------------------------- *
 * The light mode
 * -------------------------------------------------------------------------- */

/**
 * The second palette — **authored here, and never seen in a browser.**
 *
 * ## What it is, and what it is not
 *
 * It is not the dark palette inverted. A channel-inverted `#0b0e14` is a lilac, an inverted amber
 * is a blue, and an inverted *night sky* is a white one — which would take the one mark on this
 * canvas that says what time it is and delete the information. So the light mode is built by
 * asking, token by token, **what claim this colour makes and what carries that claim on a page
 * that is already bright**. Most answers are the same hue at a darker value. The handful that are
 * not are argued at the constant, because a light palette full of unexplained sign flips is a
 * palette nobody can maintain.
 *
 * ## The evidence tier, stated plainly
 *
 * `docs/16` S9: `static sweep < model walk < document recorder < browser`, and this repository has
 * none (`docs/05`: *"no Playwright, no Puppeteer, no jsdom"*). **Nothing below is a claim that the
 * light stage looks right, and no such claim may be made anywhere from it.** What is checked is
 * arithmetic and structure: `render/theme.test.ts` asserts that this palette differs from the dark
 * one at every field, that it repeats the dark palette's *collisions* exactly — the property
 * `render/`'s fill-identified tests depend on — and that its twenty-seven shell tokens clear a
 * contrast floor against the surface they are drawn on.
 *
 * ## Alphas
 *
 * A translucent token's alpha is carried across **unchanged** wherever the mark keeps both its
 * role and its ground: the building mass, the floor slab, the door-gap and the two pills are the
 * dark mode's own numbers with the colour behind them flipped.
 *
 * Four are not: the shaft recess, its hairline, the travelling cable and the ground line. Every
 * one of them is drawn *inside or on top of* something whose own alpha moved — the recess is 0.10
 * deep here against 0.55 there — so the dark mode's figure carries no information about what this
 * one should be, and the new number is a **judgement**. Said here once rather than dressed up as a
 * derivation at four constants: how any of it *reads* is exactly the claim the paragraph above
 * refuses to make, and an unverifiable ratio is worse than an admitted guess.
 */
export const LIGHT_PALETTE: Palette = Object.freeze({
  /* -- Shell. The surfaces run ground → raised, so they lighten in both modes: a light mode's
     "raised" plate that was darker than its card would read as a hole. The lines run the other
     way from the dark mode's, away from the surface in both — lighter than the card there, darker
     than it here. The ink loses contrast from `text` down, and `textMuted` is deliberately the
     *higher*-contrast secondary, which is the order the dark palette already uses. */
  page: '#e7ebf2',
  rail: '#eef1f6',
  card: '#f5f7fa',
  cardRaised: '#fbfcfe',
  raised: '#ffffff',
  hairline: '#e0e5ee',
  edge: '#ccd4e0',
  edgeMid: '#bac4d3',
  edgeStrong: '#9aa7b9',
  hintUnderline: '#8593a7',
  text: '#101720',
  textMuted: '#4a5666',
  textDim: '#64707f',
  fainter: '#99a3b0',
  accent: '#1c6fc4',
  // The link colour. *Darker* than the accent here and lighter than it in dark — in both modes
  // the direction that separates a link from the page it is written on.
  accentSoft: '#15528f',
  // Drawn on the accent fill, so it inverts with the accent and not with the page.
  accentInk: '#f2f8ff',
  over: '#bc3a20',
  measured: '#3d7a2e',

  /* -- The four bands, in ladder order and in their own hues. § S7's four are a *dark-mode*
     specification: `#3fb27f` on `#f5f7fa` is 2.3:1 and the wait ladder is the one thing on this
     canvas three surfaces must agree about, so the light mode takes the same four hues at the
     value they need to be legible ink on a pale card. The ladder's *order* — green, amber,
     orange, red — is what carries the claim, and it is unchanged. */
  bandSettling: '#1c7a55',
  bandWaiting: '#8a6212',
  bandLong: '#b04a14',
  bandAbandoned: '#bf2a1c',

  /* -- The sky. THE DECISION THAT IS NOT AN ANALOGUE, AND THE LARGEST ONE.
     The dark stage is a night-lit tower: its four ramps live between `#0c1018` and `#2d2320`, no
     stop above 18 % lightness. Mirroring that arithmetic gives four near-white skies
     separated by nothing, and the hour — the only thing on this canvas that says *when* the
     building is being watched without a clock — stops being readable at all.
     So the light mode keeps the *ordering* and moves the *range*: day is the palest, dawn and
     dusk sit below it with their warm horizons intact, and night is the deepest of the four — a
     dusk-blue-grey, not a black. A black night sky in a light theme would restore, inside the
     plot, precisely the half-repainted page this palette exists to close, and would do it for a
     third of every simulated day.
     Second, smaller flip: every ramp here runs *deeper at the top, lighter at the horizon*, which
     is what a sky does in daylight and what three of the four dark ramps already do at night (a
     city's glow is at the horizon). Only the dark `day` ramp runs the other way, and it is the one
     the light mode does not follow.
     Six-digit hex is mandatory here rather than stylistic: `render/sky.ts#mixHex` interpolates the
     twenty-four strips and degrades an unparsable stop to a flat wash. */
  skyDawn: ['#b9c3dd', '#f3ddd0'] as const,
  skyDay: ['#c3d8ef', '#eef3f8'] as const,
  skyDusk: ['#b7b3cd', '#f0cfba'] as const,
  skyNight: ['#8e9ab4', '#c3cbd9'] as const,

  /* -- The building. The mass is the rail at the dark mode's own 0.86, so the tower reads as one
     body against whichever sky is behind it; the slab is the same 0.045 wash with its sign
     flipped, dark on a pale mass instead of light on a dark one. */
  stageMass: 'rgba(238,241,246,0.86)',
  stageSlab: 'rgba(16,24,36,0.045)',

  /* -- The shaft recess. NOT AN ANALOGUE: A HOLE IS DARK IN BOTH MODES, BUT NOT THIS DARK.
     The claim is *this is cut into the facade*, and a recess reads as a recess by being darker
     than what surrounds it — in both modes. So the sign does **not** flip. What changes is the
     depth: 0.55 of near-black over a near-white facade is a black slot, and a stage whose only
     dark marks are its shafts is the half-repainted picture in miniature. 0.10, and the hairline
     that delimits it goes to 0.16 — still a *darker* line than the recess, which is the same
     relationship the dark mode gets from a lighter one. */
  stageShaftRecess: 'rgba(38,54,74,0.10)',
  stageShaftHairline: 'rgba(20,32,48,0.16)',

  /* -- The travelling cable, and the ground line. Both are judgements — the header says why: the
     cable is drawn inside a recess that is five and a half times shallower here, and the ground
     line over a mass whose own colour moved from `#0e131b` to `#eef1f6`, so neither dark alpha
     transfers. Both are set well above their dark counterparts (0.06 → 0.14, 0.14 → 0.28) on the
     reasoning that a *dark* mark's whole visible range on this stage sits between the mass and
     black, and these two are the thinnest marks the stage draws. Unverified, and flagged. */
  stageCable: 'rgba(24,36,54,0.14)',
  stageGround: 'rgba(16,24,36,0.28)',

  /* -- The windows. NOT AN ANALOGUE: THE DAY WINDOW FLIPS SIGN AND THE NIGHT WINDOW DOES NOT.
     At night a lit window is *warmer and stronger* than the facade in both modes — the claim is
     "somebody is in there" — so it keeps the tie the dark token names: it is the second wait
     band's own amber, `#8a6212` here as `#e0b040` there, at the alpha a tint needs over near-white.
     In daylight the dark mode paints a window *lighter* than its facade, because the facade is
     darker than the glass. Here the facade is the palest thing on the stage and nothing can be
     lighter than it, so the same claim — "there is a window here and nobody has the light on" —
     is carried by a cool, *darker* pane. Same claim, opposite sign, and it is the clearest case in
     this palette of why inverting hexes would have produced a picture that says the wrong thing. */
  stageWindowNight: 'rgba(138,98,18,0.30)',
  stageWindowDay: 'rgba(96,124,158,0.18)',

  // The gap the doors open into. An aperture, on the recess's argument: dark in both modes,
  // shallower here, because it is cut into a pale car rather than into a dark one.
  doorGap: 'rgba(22,32,46,0.55)',

  /* -- Floor labels. The gutter is scenery and stays a step below the ink; the three special
     floors keep their hues (blue entrance, violet transfer, tan restricted) at reading value. */
  floorLabel: '#7e8998',
  floorLabelEntrance: '#37599f',
  floorLabelTransfer: '#7b3f96',
  floorLabelRestricted: '#86612a',

  /* -- Cars. NOT AN ANALOGUE: THE OCCUPANT TEXT INVERTS.
     The four load colours are chosen at a **matched value** — 0.128, 0.148, 0.156 and 0.168
     relative luminance, a spread of four hundredths — so that one label colour reads on all four.
     In the dark mode that label is near-black because every car is brighter than the page; here
     every car is darker than the sky it is drawn on, so the label is near-white. It inverts with
     the *car*, exactly as `accentInk` inverts with the accent, and for the same reason: it is text
     on a fill, not text on the page. `theme.test.ts` composites the label over each of the four
     and holds the result to a floor, in both modes — which is the one thing about this block that
     is checked rather than asserted. */
  carLight: '#1c7a55',
  carMid: '#1c6fc4',
  carHeavy: '#a5620a',
  carOverload: '#bf2a1c',
  carDown: '#8438b0',
  carOccupantText: 'rgba(247,250,253,0.92)',

  /* -- The two directions. `waitingUp` is teal-shifted off `bandSettling` here for the reason it
     is there and not one inch less: the two are drawn on the same row, `canvas.test.ts` counts
     riders *by their fill*, and one string for both claims makes that count measure something
     else. The band keeps § S7's ladder value and the direction pair moves — in both modes. */
  waitingUp: '#0f7a72',
  waitingDown: '#8438b0',

  /* -- The out-of-service badge. The filled pill is `over` at 0.9, as it is in dark, so its text
     inverts with the pill. The unfilled pill is the same 0.07 wash with its sign flipped. */
  oosOn: 'rgba(188,58,32,0.9)',
  oosOnText: '#fdf2ef',
  oosOff: 'rgba(16,24,36,0.07)',
  oosOffText: '#64707f',

  /* -- Alarms and relief. `relief` is the third green and must stay clear of the other two for
     the reason `RELIEF` gives; here it is the *deepest*, where in dark it is the brightest. */
  alarm: '#bf2a1c',
  relief: '#0d5c3e',
  // The selection mark. `HIGHLIGHT` is brighter than `TEXT` in dark; the rule underneath is
  // *further from the surface than the ink is*, which on a light page means darker.
  highlight: '#04080e',
  warning: '#8a6212',
  previewFloorLine: '#dbe2ec',
});
