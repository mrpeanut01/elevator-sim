/**
 * The palette, once — `docs/12-design-handoff.md` § 1.1 S6/S7.
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
