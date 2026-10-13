# Lobby intro — the elevator that opens the game

Prototype: `Elevator Sim Lobby.dc.html`. It is the cold-open screen and the mode picker. It
replaces nothing; the in-game Main menu stays as the quick way back between sessions.

## Where it sits

- **Cold launch** → Lobby. Doors closed, car on 6, CALL lit.
- **Floor chosen, doors closed, car arrives** → hands off to the game with `#go=<screen>`
  (and `&view=engineer` when the key is turned). The prototype reads the hash in
  `componentDidMount`; the real app routes the same value.
- **Main menu button in game** → stays on the existing menu. The lobby is not replayed every
  return. Settings → Motion → *Skip the lobby* (proposed) opens straight to the menu.

## Floor map

| Floor | Name | Screen |
|---|---|---|
| 8 | Today's tower | `door` |
| 7 | Campaign | `towers` |
| 6 | Endless rush | `rush` |
| 5 | Fix a building | `fixit` |
| 4 | Dispatcher workshop | `workshop` |
| 3 | Test bench | `bench` |
| 2 | Design a building | `designer` |
| 1 | Your week | `week` |
| L | Boards & ladder | `board` |

Play floors at the top, design in the middle, world at the lobby. The panel labels the three
groups PLAY / DESIGN / WORLD, matching the left rail.

## Controls

- **CALL** (hall plate, right of the doors). The first gesture; also unlocks audio. The car rides
  6 → L, chimes, doors open.
- **Floor button.** Lights the button and fills the in-car display with the mode's name, length,
  description and status line. Pressing another floor replaces the choice. Starts the auto-close
  countdown.
- **CLOSE.** Closes now and departs. With no floor chosen it does nothing and says *Choose a
  floor first*.
- **OPEN.** While closing, reopens and cancels the departure, as a real car does. While open,
  restarts the countdown. Before the car is called, it calls it.
- **HOLD.** Keeps the doors open indefinitely so the player can read. The countdown stops, a
  DOORS HELD badge shows on the display, and the bar stays full. Press again or press CLOSE.
  Pressing HOLD while doors are closing reopens them.
- **Key switch** (CASUAL / ENGINEER). The panel's version of *Switch to Engineer*. Turned on,
  every floor opens in the Engineer view.
- **Back to the lobby** (on arrival). Rides back to L with the choice cleared.

## Timings

| Event | Duration |
|---|---|
| Floor step on the indicator | 420 ms |
| Chime → doors start | 450 ms |
| Door travel | 1150 ms, `cubic-bezier(.65,0,.25,1)` |
| Auto-close | 6 s default, 0 = never |

Reduced motion (OS setting or Settings → Motion): door travel is instant, floor steps 90 ms.
Sound is a two-note chime (E6 → C6) and a short click per press, generated in-browser; off with
Settings → Sound.
