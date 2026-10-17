# Handoff: Lobby Intro (elevator cold-open and mode picker)

## Overview
The first screen of Elevator Sim. The player stands in a lobby facing closed elevator doors.
They press CALL, the car rides down to L and chimes, the doors open, and the car operating
panel inside the car is the mode picker. Each floor button is one way into the game. Closing
the doors rides the car to that floor and hands off to the matching game screen. Open, Close
and Hold behave like a real car's. A key switch selects the Engineer view.

## About the Design Files
The files in this bundle are **design references built in HTML**. They show the intended look
and behaviour; they are not production code to copy. Rebuild the design in the site's existing
environment (framework, routing, audio and settings layers) using its established patterns.
`Elevator Sim Lobby.dc.html` opens directly in a browser next to `support.js`.

## Fidelity
**High fidelity.** Colours, type, spacing, timings and copy are final. Recreate them exactly,
using the codebase's existing tokens where they match (the palette is the same one Everyday
Mode already uses).

## Where it sits in the game
- **Cold launch** opens the Lobby: doors closed, car on floor 6, CALL plate lit.
- **On arrival** the player presses *Step out →*, which routes to the floor's screen. The
  prototype navigates to `Elevator Sim Casual.dc.html#go=<screen>` and appends `&view=engineer`
  when the key is turned. In the app, route to the same screen ids instead.
- **Main menu in game** keeps going to the existing Everyday menu. Do not replay the lobby on
  every return.
- **Proposed setting**: Settings → Motion → *Skip the lobby*, which opens straight to the menu.

### Floor → screen map
| Floor | Label | Group | Screen id | Length tag |
|---|---|---|---|---|
| 8 | Today's tower | PLAY | `door` | 3 MIN |
| 7 | Campaign | PLAY | `towers` | ONGOING |
| 6 | Endless rush | PLAY | `rush` | 5 MIN |
| 5 | Fix a building | PLAY | `fixit` | 5 MIN |
| 4 | Dispatcher workshop | DESIGN | `workshop` | — |
| 3 | Test bench | DESIGN | `bench` | — |
| 2 | Design a building | DESIGN | `designer` | — |
| 1 | Your week | WORLD | `week` | — |
| L | Boards & ladder | WORLD | `board` | — |

Descriptions shown on the in-car display (verbatim):
- **Today's tower**: The same building and crowd as everyone else, once a day. Your dispatcher against the world. Status: `ready · counts on the board`
- **Campaign**: Buildings hire you a month at a time. Earn per cleared day, spend it on the tower, and grow from one building to eight as your standing rises. Status: `8 buildings` (live: `<n> buildings · standing <rep>`)
- **Endless rush**: One tower, arrivals climbing every three minutes until nothing drains. How far does your dispatcher get? Status: `your furthest · wave 14` (live value)
- **Fix a building**: A tower with one thing wrong and a tenant who has written in. Work out what, then repair it. (live: `<solved> of <total> fixed`)
- **Dispatcher workshop**: Build a dispatcher from its weights, name it, and take it into any mode.
- **Test bench**: Run two dispatchers on the same crowd and see where they part ways.
- **Design a building**: Set the floors, the cars and the crowd for a building of your own.
- **Your week**: The last seven days: what you ran, where you placed, and your streak.
- **Boards & ladder**: Today's board and the season ladder. Watch anyone's run from here.

Status lines should come from the same live values the Everyday menu cards use, so the two
surfaces never disagree.

## Screens / Views

### 1. Lobby (the whole screen)
Full viewport, `min-height:100vh`, column flex, centred, `gap:14px`, padding `22px 18px 26px`,
`overflow:hidden`.
Background: lobby stone panels, `repeating-linear-gradient(90deg,#2C2823 0 178px,#24211C 178px 180px)`.

Top to bottom:
1. **Building name.** `EVERYDAY MODE`: DM Mono 500 10px, letter-spacing .3em, `#8D8271`.
   `ELEVATOR SIM`: Familjen Grotesk 700 22px, letter-spacing .14em, `#E6DCCB`. Gap 3px.
2. **Hall position indicator.** Row, gap 16px, background `#141210`, border 2px `#4A443A`,
   radius 8px, padding `7px 18px`, `box-shadow: inset 0 2px 8px rgba(0,0,0,.6)`.
   - ▲ and ▼ glyphs: DM Mono 15px, 14px wide. Lit `#F2A63B` in the travel direction, else `#3A352E`.
   - Floor digit: DM Mono 500 34px/1, `#F2A63B`, min-width 44px, `text-shadow: 0 0 10px rgba(242,166,59,.55)`.
3. **Door row.** Flex row, gap 22px: the door frame, then the hall call plate.
4. **Hint line.** DM Mono 500 11.5px, letter-spacing .06em, `#C6B79F`, min-height 16px, centred.

### 2. Door frame and opening
- Outer frame: `width:min(76vw,820px)`, `height:min(calc(100vh - 170px),720px)`, padding
  `16px 16px 0`, radius `6px 6px 0 0`, `linear-gradient(180deg,#A89C87,#7E7465)`,
  `box-shadow: 0 20px 50px rgba(0,0,0,.45)`.
- Sill below: width = frame width + 24px, 10px tall, `linear-gradient(180deg,#C6B79F,#6E665A)`, radius 2px.
- Opening: `position:relative; overflow:hidden`, `inset 0 0 0 2px #5C554A` shadow.

**Car interior** (behind the doors), all absolutely positioned layers:
- Wall: `linear-gradient(180deg,#F1E9DA,#D8CBB4)`.
- Panel seams: `repeating-linear-gradient(90deg,transparent 0 24.6%,rgba(110,102,90,.22) 24.6% 25%)`.
- Ceiling light: left/right 8%, top 0, 9px tall, `#FFF8EA`, `box-shadow: 0 0 40px 12px rgba(255,240,210,.55)`.
- Handrail: full width at top 62%, 7px, `linear-gradient(180deg,#E8C27A,#A57A33)`, `box-shadow: 0 3px 4px rgba(0,0,0,.18)`.
- Floor: bottom 7%, `linear-gradient(180deg,#6E665A,#4C463D)`.

**Doors**: two panels, each 50% wide, full height, `z-index:2`.
- Left: `repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,rgba(0,0,0,.04) 1px 3px), linear-gradient(90deg,#A99C86,#CDC2AE 60%,#B4A893)`, `box-shadow: inset -2px 0 0 rgba(0,0,0,.3)`.
- Right: same stripes, `linear-gradient(90deg,#B4A893,#CDC2AE 40%,#A99C86)`, `box-shadow: inset 2px 0 0 rgba(255,255,255,.25)`.
- Closed: `translateX(0)`. Open: left `translateX(-100%)`, right `translateX(100%)`. The opening clips them.
- Transition: `transform 1150ms cubic-bezier(.65,0,.25,1)`.

**Fit to height.** The interior content (display + panel) sits in a box with padding
`22px 4% 40px`, flex-centred. Measure the content and scale it down
(`transform: scale(min(1, availableHeight / contentHeight))`, origin centre) so the whole panel
always fits the opening at any viewport height. Verify at 540, 800 and 1080px tall.

### 3. In-car display (left of the panel)
`flex:1 1 240px`, max-width 380px, min-height 300px, background `#1B1916`, border 7px
`#3A352E`, radius 12px, padding `22px 22px 18px`, column gap 10px,
`box-shadow: 0 10px 26px rgba(0,0,0,.28)`.
- Kicker: DM Mono 500 10px, letter-spacing .16em, `#8D8271`. `FLOOR 8 · 3 MIN`, or `WELCOME ABOARD` with nothing chosen.
- DOORS HELD badge (when held, right-aligned): DM Mono 500 9.5px, letter-spacing .14em, `#23201C` on `#F2A63B`, radius 4px, padding `3px 6px`.
- Title: Familjen Grotesk 700 30px/1.05, letter-spacing -.02em, `#F7F2E8`. Mode name, or `Choose a floor`.
- Body: Instrument Sans 14.5px/1.55, `#C6B79F`. Mode description, or `Every floor is a way to play. Pick one on the panel, then close the doors.`
- Status: DM Mono 500 11.5px, `#F2A63B`.
- Footer row (pinned to bottom, 1px `#3A352E` top rule, padding-top 12px):
  - Status line: DM Mono 500 11px, `#8D8271` (`#F2A63B` when it is a warning).
  - Countdown bar: 70×4px track `#3A352E`, radius 2px; fill `#F2A63B`, width = remaining/total, `transition: width 1s linear`. Full when held, empty otherwise.

Status line copy, in priority order:
`Choose a floor first` / `Hold works while the doors are open` (warnings, 2.2s) ·
`Doors closing` · `Going up` · `Held until you press Close or Hold` · `Doors close in <n>` ·
`Press Close to go` (auto-close off) · `Doors open`.

### 4. Car operating panel
Width 304px, radius 8px, padding `16px 18px`, column gap 9px.
Background: `repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px), linear-gradient(180deg,#38332C,#26221D)`.
`box-shadow: 0 14px 30px rgba(0,0,0,.35), inset 0 0 0 1px #4A443A`.
Four 6px screws, `#6E665A`, 7px in from each corner.

- **LCD**: `#120F0C`, radius 5px, padding `8px 12px`, `inset 0 2px 6px rgba(0,0,0,.7)`. Floor
  digit DM Mono 500 26px `#F2A63B` with glow; direction glyph 12px; right side DM Mono 500 10px
  `#C9893A`, letter-spacing .08em, ellipsis at 150px: chosen mode name in caps,
  `ENGINEER KEY`, or `SELECT FLOOR`.
- **Group headers** PLAY / DESIGN / WORLD: DM Mono 500 9px, letter-spacing .2em, `#8D8271`, 1px `#4A443A` bottom rule, padding `4px 0 3px`.
- **Floor grid**: two columns, `gap: 9px 10px`. Each cell: 36px circular button + label, gap 8px.
  - Off: border 2px `#6E665A`, `radial-gradient(circle at 50% 35%,#4A443A,#26221D)`, `box-shadow: 0 2px 0 #15130F`, numeral DM Mono 500 14px `#E6DCCB`, label `#C6B79F`.
  - Lit: border `#F2A63B`, `radial-gradient(circle at 50% 40%,#5A4426,#2A2218)`, `box-shadow: 0 0 0 3px rgba(242,166,59,.16), 0 0 16px rgba(242,166,59,.5)`, numeral `#FFC56B`, label `#F7F2E8`.
  - Label: Instrument Sans 600 12.5px/1.2. Transition `all .18s`.
- **Door controls**: 3-column grid, gap 8px, 1px `#4A443A` top rule, padding-top 12px. 44px
  circles, same off fill, border and icon `#C6B79F`; pressed/lit `#F2A63B`. Captions
  OPEN / CLOSE / HOLD, DM Mono 500 9px, letter-spacing .16em.
  - Open icon ◀|▶ (triangles pointing outward from a centre bar); Close icon ▶|◀; Hold icon two vertical bars. Hold uses the lit fill and a `0 0 16px rgba(242,166,59,.5)` glow while held.
- **Key switch**: `CASUAL` · 30px keyhole (`radial-gradient(circle,#8D8271,#4A443A)`, 4×18px slot `#1B1916`) · `ENGINEER`. Slot rotates 0° → 90°, `transition: transform .3s`. Active caption `#E6DCCB` (casual) or `#F2A63B` (engineer); inactive `#6E665A`.

### 5. Hall call plate (right of the doors)
86px wide, radius 8px, padding `16px 0 14px`, same steel gradient and shadow as the panel, column gap 10px.
- Lantern: 22×8px up-triangle, `#3A352E`, lit `#F2A63B` when the car is at L with doors open.
- CALL button: 52px circle, 2px border, up-triangle icon. Idle: `#E6DCCB` with `0 0 0 4px rgba(230,220,203,.08)` halo. Arriving: `#F2A63B` with `0 0 18px rgba(242,166,59,.55)`. Otherwise `#6E665A`.
- Caption `CALL`: DM Mono 500 9px, letter-spacing .18em, `#C6B79F`.

### 6. Arrival view
Replaces the display and panel once the car reaches the chosen floor and the doors reopen.
Centred column, gap 12px, padding `6% 8% 10%`.
- `FLOOR <n>`: DM Mono 500 11px, letter-spacing .24em, `#6E665A`.
- Name: Familjen Grotesk 700 `clamp(34px,5vw,56px)`/1, letter-spacing -.03em, `#23201C`.
- Body: 16px/1.55, `#4C463D`, max 46ch.
- **Step out →**: `#23201C` bg, `#F7F2E8` text, radius 10px, padding `12px 20px`, Familjen Grotesk 600 16px; hover `#B8462B`.
- **Back to the lobby**: transparent, 1.5px `#8D8271` border (hover `#23201C`), same type and radius, padding `11px 18px`.
- Note: DM Mono 11px `#6E665A`. `Opens in the Engineer view` when the key is on, `Stepping out…` when auto-handoff is on.

## Interactions & Behavior

### Phases
`idle → arriving → open ⇄ closing → travel → arrived → (closing → travel → open)`

| Phase | Doors | What happens |
|---|---|---|
| idle | closed | Car on 6. Hint `Press CALL`. |
| arriving | closed | Indicator steps 6→L, ▼ lit. At L: chime, lantern on, doors open after 450ms. |
| open | open | Floors selectable. Auto-close counts down once a floor is chosen. |
| closing | closing | 1150ms door travel + 150ms, then travel. OPEN or HOLD cancels. |
| travel | closed | Indicator steps to the target floor, ▲ lit. Chime on arrival. |
| arrived | open | Arrival view. |

### Controls
- **CALL**: only in idle. Also the first user gesture, so it unlocks audio.
- **Floor button**: in open or closing. Sets the selection and resets the countdown. Before CALL it warns `Call the car first`.
- **CLOSE**: in open with a selection, closes now. With none, warns `Choose a floor first`.
- **OPEN**: idle → calls the car. Closing → reopens and cancels the departure. Open → restarts the countdown.
- **HOLD**: toggles held. Stops the countdown and shows DOORS HELD. Pressing it while closing reopens the doors and holds. Outside open/closing it warns `Hold works while the doors are open`.
- **Key switch**: toggles the Engineer view for the hand-off.
- **Step out →**: routes to the floor's screen.
- **Back to the lobby**: doors close, ride to L, reopen with the selection cleared.
- Every press plays a short click and lights its control for 260ms.

### Hint line copy
`Press CALL` · `Car on its way` · `Choose a floor` · `Press Close to go now` /
`Doors held. Press Close when ready` (+ ` · engineer view` when the key is on) · `To <n> · <name>`.

### Timings
| Event | Value |
|---|---|
| Indicator floor step | 420ms |
| Chime → doors move | 450ms |
| Door travel | 1150ms, `cubic-bezier(.65,0,.25,1)` |
| Close → travel starts | door travel + 150ms |
| Auto-close | 6s default; 0 turns it off |
| Pressed-light | 260ms |
| Warning lifetime | 2.2s |
| Auto-handoff after arrival (optional) | 2.4s |

### Reduced motion
When the OS prefers reduced motion, or Settings → Motion is reduced: doors move instantly
(1ms), indicator steps take 90ms, and chime → doors takes 30ms.

### Sound (Web Audio, generated, no files)
- Chime: sine E6 1318.5Hz (peak gain .16, 1.3s decay) plus octave 2637Hz (.02, 0.4s), then
  at +0.38s sine C6 1046.5Hz (.16, 1.8s) plus 2093Hz (.02, 0.4s). Attack 12ms, exponential decay.
- Click: square 1700Hz, gain .03, 35ms.
- Respect Settings → Sound. Create or resume the AudioContext on the CALL press.

## State Management
```
phase: 'idle' | 'arriving' | 'open' | 'closing' | 'travel' | 'arrived'
car: 'L' | '1' … '8'        // indicator floor
dir: 'up' | 'down' | null
sel: floor key | null
held: boolean
count: number               // seconds left on auto-close
keyOn: boolean              // engineer view
lantern: boolean
flash: string               // transient warning
pressed: '' | 'call' | 'open' | 'close'
```
Give each close an incrementing id. A pending close timer only proceeds if its id is still
current and the phase is still `closing`. That is how OPEN and HOLD cancel a departure.
Clear every timer on unmount.

Settings the screen reads: auto-close seconds, sound on/off, reduced motion, skip-lobby
(proposed), auto-handoff on arrival (off by default).

## Design Tokens
- Ink `#23201C` · Cream `#F7F2E8` · Paper `#EDE4D5` · Sand `#E6DCCB` · Stone `#C6B79F` · Taupe `#8D8271` · Slate `#6E665A` · Warm grey `#4C463D`
- Steel dark `#38332C` → `#26221D` · Bezel `#3A352E` · Rule `#4A443A` · Screen `#1B1916` · LCD `#120F0C` / `#141210`
- Amber `#F2A63B` · Amber hot `#FFC56B` · Amber dim `#C9893A` · Rust (hover) `#B8462B`
- Brass rail `#E8C27A` → `#A57A33` · Door steel `#A99C86` / `#CDC2AE` / `#B4A893`
- Fonts: Familjen Grotesk (titles), Instrument Sans (body), DM Mono (labels, digits). Google Fonts.
- Radii: 4 (badge), 5 (LCD), 6 (frame top), 8 (panel, plates), 10 (buttons), 12 (display), 50% (round buttons).

## Assets
No images. Icons (call arrow, open, close, hold) are tiny inline SVG paths in the prototype;
use the codebase's icon set if it has equivalents. Sound is synthesised.

## Files
- `Elevator Sim Lobby.dc.html`: the prototype. Template at the top; all behaviour in the
  `class Component` script near the bottom (`FLOORS`, `call`, `close`, `openDoors`,
  `toggleHold`, `rideBack`, `renderVals`).
- `support.js`: runtime needed to open the prototype in a browser. Not for production.
- `LOBBY_INTRO.md`: short summary of the same spec, also in the Everyday Mode handoff
  (`docs/design/design_handoff_casual_mode/`).
- Hand-off hook in the existing prototype: `Elevator Sim Casual.dc.html` reads `#go=<screen>`
  in `componentDidMount`. The app should use its router for this instead.
