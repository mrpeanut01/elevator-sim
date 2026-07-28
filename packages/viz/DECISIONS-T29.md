# T29 — decisions

Correctness defects in the **shipped viewer**. Not Phase 9, not gamification: the owner deferred
that until the app is solid, and this is part of making it solid.

Scope written to: `packages/viz/**` and `packages/cli/**`. The CLI was in scope and it needed it —
see **T29-7**, which is `D1` again, on the other surface, found by checking the brief's claim that
no other render site leaks instead of trusting it.

---

## T29-1 — the suppression gate has one home, not three

`saturated || !awtIsValid` was written out three times: in `overlayAt`, in `dev/main.ts`'s
`statusLine`, and in `render/canvas.ts`'s `drawHeader`. Two of them were right. The third was the
defect (`D1`).

It now lives once, as `meansAreSuppressed(recording)` in `frame/overlay.ts`, and all three call it.

**Why `frame/overlay.ts` and not `render/canvas.ts`.** The question *may this run's estimates be
shown* is a fact about the recording, not about drawing, and `frame/` is where the package already
keeps pure `(recording, …) → fact` producers. Putting it in `render/` would have made the metrics
module depend on the renderer, which is the wrong direction; putting it in `contract/types.ts`
would have put behaviour in a file that is types. The barrel's caller table names all three
non-test callers, so this is not another export whose only caller is its own test.

**What it is deliberately *not* sensitive to.** A `timed-out` status, and undelivered passengers.
Those are `RV-16`'s banner. A run can end with people still in the system and still have a mean the
statistics module stands behind — `awtIsValid` is the summary's own verdict and already accounts
for censoring, on four grounds per `CLAUDE.md`. Making the header suppress on *status* instead
would have replaced a false positive with a false negative and looked just as fixed.

## T29-2 — a suppressed run gets a word, not an em dash

The header now reads `mean wait suppressed` where it used to read `mean wait so far 87.7 s`.

The obvious alternative was `mean wait so far —`, reusing the existing placeholder. Rejected: `—`
already means *nobody has been served yet*, which is a different fact and one the reader can act on
(wait, or scrub forward). Collapsing "no data yet" into "this figure is not admissible" would have
been a smaller lie in place of a larger one. The banner two lines above carries the reason in full,
and the metrics panel and the `aria-label` carry it at length.

The string also no longer contains `mean wait so far` at all on a suppressed run, which is what
lets `canvas.test.ts` assert `not.toContain('mean wait so far')` rather than something weaker.

## T29-3 — `D10`: the unanswered-call marker got a surface that is not the landing selector

`describeSelection`'s *"unassigned — no car answered this call in this run"* was reachable only by
picking a landing out of `#landing-select`. That control is `.wide-only` — dropped below 1280 px —
and the Phase 9 design sends it to Advanced mode while listing locked-out calls among the facts
Basic mode may **never** hide. A fact with one optional surface is a fact that is usually not shown.

It is now three surfaces, none of which need the selector:

- a `✗` on the landing itself, in `theme.warning`;
- a count in the canvas banner (*12 landings unanswered — no car answers those calls in this run*);
- a sentence in `describeFrame`, naming the floors, so the non-sighted reader gets the same thing.

**`✗` and not `⊘`.** `⊘` already marks a floor no shaft physically serves (`RV-08`), on the label
gutter. That is geometry. This is an outcome — a call the run left unanswered — and they are
different claims about the same building. Different glyph, different gutter.

**Computed by the caller, not by the renderer.** `SceneInput.unansweredCallFloorIds` is derived in
`dev/main.ts` from the `landingAssignmentsAt` list it already maintains, for the reason
`SceneInput.overlay` is: `drawScene` stays a pure function of its inputs, and a renderer that ran a
recording-wide scan of its own would be a second opinion about the same instant.

**The `promisedCarId` exclusion is load-bearing.** Under `destination-dispatch` a passenger still
standing at the horizon has `answeredByCarId === undefined` but *was* told which car to take. Marking
that landing would report a dispatcher failure that did not happen — the falsehood
`frame/overlay.ts` version 4 exists to remove. The derivation skips any call with a promise.

**Known consequence.** At the drain horizon of a timed-out run, every remaining call is by
definition unanswered, so the count is large (22 on Vertical City seed 42). That is true, and the
banner already leads with `TIMED-OUT — 119 undelivered`, so the two agree rather than compete. It
is *not* noise mid-run: `answeredByCarId` is forward-looking off the record, so a call that will be
answered in five seconds is not marked.

## T29-4 — `U1`: the editor's floor lists are ordered by `index`, not by reversing the array

The owner's report: the form listed `G, 2, 3, 4, 5, 6` downward while the preview beside it drew
`6` at the top. Two views of one building, on one screen, reading in opposite directions.

Three orderings were candidates, and only one is right on every shipped building:

| Candidate | Verdict |
|---|---|
| Leave it | The defect |
| Reverse the declaration array | **Wrong on `midtown-office.json`**, which declares index `0` before index `-1`. Reversed, its basement draws *above* the lobby in the form and below it in the picture — the same defect on one building instead of five, which is worse, because it looks fixed |
| Sort by `index`, descending | Correct. `index` is what a building means by *which floor is above which*; `expandFloors` sorts its output by it, `resolveBuilding` re-sorts by it, and `buildLayout` places rows by the height `index` is required to agree with |

`floorsInBuildingOrder` lives in `editor/editorPreview.ts` — not in `dev/editor.ts` — because
`dev/editor.ts`'s own docstring says everything with a decision in it lives in `editor*.ts` and is
tested under Node, and a sort is a decision. Its test compares the list order against the pixel `y`
`buildLayout` assigns each floor, on every shipped building, so the list and the picture cannot be
wrong in the same direction.

### The ↑/↓ buttons: a wart made honest rather than removed

`moveFloor` moves a floor within the **declaration array** and deliberately renumbers neither
`index` nor `heightM` — its docstring gives a good reason, which is that the loader fails a
building whose two disagree (`floor-height-order`) and an editor that silently rewrote either would
settle a modelling error by fiat.

Which means those two buttons never moved a floor *in the building*; they reformat the JSON. Under
the old array-ordered table that was invisible, because the two orders coincided on four of five
buildings. Under an `index`-ordered table it is visible: pressing ⇧ changes the Document textarea
and not the row above it.

Three options were weighed:

1. **Repurpose them to swap `index`/`heightM`.** Rejected — it is exactly the fiat `moveFloor`'s
   docstring forbids, and it would have needed a new edit operation.
2. **Delete them.** That leaves `moveFloor` with no non-test caller, which is the repository's
   signature defect, so the honest version of "delete them" is "delete `moveFloor` too" — a larger
   change than `U1` asked for, and it removes a real if minor authoring feature.
3. **Keep them and say what they do.** Taken. The glyphs are now `⇧`/`⇩` and the titles read *move
   floor 30 earlier in the JSON declaration list (does not change its index or height)*.

**Handback.** The floors table and the declaration list are two different orders sharing one
widget. A later change should either give the declaration its own view, or drop `moveFloor` and let
the `index` field be the only control over ordering. Recorded rather than resolved here, because
resolving it is a scope decision the owner should make.

### What else was audited, and what was left alone

Every floor-ordered surface in the editor was enumerated. See the delivery report for the full
list; the two deliberate non-changes are:

- **Access-zone floor lists** (`zone.floors.join(' ')`) — a single-line text field bound to the
  document's own array, read left-to-right. Not a vertical column of floors, so there is no
  direction to disagree with; and reordering it on display would mean committing a rewritten
  document the next time the field changed.
- **The access-zone rows themselves** — a list of *credentials*, keyed by zone id, not by height. A
  zone's floors are an arbitrary set, so "the zone's lowest floor" is a weak sort key that would
  make rows jump while the reader types into them.

- **The Document (JSON) textarea** keeps declaration order, necessarily: it is the file.

## T29-5 — `D11`: one building, one tab, one URL

Two independent defects with one cause — nothing owned "which building, which surface".

1. `syncUrl` wrote five keys and not the tab, so `selectTab` never recorded where the reader was.
2. The editor opened `resources.entries[0]` and nothing ever told it otherwise, so
   `?building=secure-tower` + **Building editor** opened Garden Apartments.

Now: `currentTab` is held once in `boot`, written into the URL as `tab`, and read back on load.
`selectTab('editor')` hands the viewer's building to `EditorHandle.showBuilding`, and
`EditorOptions.onOpen` moves the viewer's selector when a shipped building is opened in the editor.

**`showBuilding` declines silently in three cases**, and each is deliberate: the editor already
holds that building; there is an **unsaved edit** — following a tab switch is not worth discarding
work, and a modal on every tab switch is worse than the mismatch, so `ED-23`'s guarantee is
untouched; or no shipped entry has that id, which is what a blank or imported document looks like.

**`onOpen` does not fire for Start-from-blank or Import.** Neither produces a document the viewer's
`<select>` can hold, and pointing it at a stale id would be the same mismatch with the arrow
reversed. Both paths now clear the editor's own open-file selector instead of leaving it claiming a
`data/` file the open document is no longer from.

**A second, smaller bug fixed on the way.** The "discard and open?" cancel path did
`openSelect.value = history.current.id` — but that control's option values are **file names**, not
ids, so declining an open left the selector showing the first option while the editor held a
different building. It now restores the tracked open file.

**Known consequence, accepted.** Undo-ing an editor back to clean and then switching tabs will let
the viewer's building win. That follows directly from "declines while dirty" and is the same rule
read forwards; the alternative is a stickiness flag, which is another piece of state that can
disagree with the URL.

## T29-6 — what was checked and found already correct

The brief said the reviewer had confirmed no other render site leaks, and asked for that to be
checked rather than trusted. Checked. In `viz`, correct everywhere:

- `frame/overlay.ts` `rollingMeanWaitS` and the per-bank `meanWaitS` — both `suppressed ? undefined : …`.
- `render/overlay.ts` — draws `SUPPRESSED` and the reason from `OverlayMetrics.suppressed`.
- `dev/main.ts` `statusLine` — gated, and now through the shared predicate.
- `render/describeFrame.ts` — gated, and was in fact *more* honest than the picture, which is how
  the defect was provable from one DOM node.

`Frame.runningMeanWaitS` itself is untouched. It is a true statement about the recording and the
contract keeps it; the change is about what a *viewer* may print, which is `UX.md` § A.3's business
and not the contract's.

## T29-7 — `D1` again, in `elevator-sim watch`

The check above did **not** come out clean outside `viz`. `packages/cli/src/commands/watch.ts`
printed the running mean unconditionally on **both** of its render paths — `mean wait so far
41.5 s` in the TTY frame, and a `mean wait` column of figures in the piped/too-small fallback — for
the whole of a run, with no suppression anywhere on the screen. `printRunReport` then said
`AWT  SUPPRESSED` about the same run, on the same terminal, seconds later.

`run` and `compare` were clean: both go through `renderAwt`, which has refused since it was
written.

The fix is the CLI's own idiom rather than the viewer's. `format.ts` gains `renderRunningMean`,
returning the module's existing `RenderedMetric` shape, so the refusal reads `SUPPRESSED` — the
word `renderAwt` already uses — and carries no digits. Both `watch` call sites go through it, and
the reason is now printed *in the frame* (and above the fallback's table) rather than waiting for
the report at the end of playback: a column of `SUPPRESSED` with no reason beside it explains
nothing.

Measured on Vertical City seed 42 (`summary.saturated`, so `awtIsValid` false):

```
before   0:21   0   1        1.8      # …and no suppression notice anywhere on screen
after    0:21   0   1 SUPPRESSED      # under "AWT suppressed — Queue length rose by 211.6 persons…"
```

**Honest limit.** The fallback path was driven end to end (`--plain`). The TTY frame path was not
driven in a real terminal; both paths call the same `renderRunningMean`, which is unit-tested and
mutation-checked three ways, but "driven on a TTY" is not claimed.
