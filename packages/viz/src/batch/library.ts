/**
 * **The dispatcher library one batch resolves its arms against** — GitHub issues #167 (§ 3.1 (4))
 * and #228, [§ D443](../../../../DECISIONS.md).
 *
 * ## The defect this closes, stated as the wire rather than as the complaint
 *
 * A player builds a dispatcher in the workshop; `dev/dispatcherEditor.ts#save` appends it to
 * `ViewerState.savedDispatchers` and `persist/` writes it to the session. Every **single**-run
 * surface then works, because `dev/state.ts#drivingProfileOf` carries the profile *object* into
 * `SimulationConfig`. Every **batch** surface fails, because a batch crosses a `postMessage`
 * boundary carrying an *id*, and `dev/batchWorker.ts` calls `loadBrowserResources()` on the far
 * side — which loads `data/` and nothing the player ever authored. `batch/runBatch.ts#armProfile`
 * then refuses:
 *
 * > dispatcher profile "yours-1" for arm "candidate" is not in this build's data/. A batch cannot
 * > run an arm it cannot resolve.
 *
 * That one line is the whole of *"both surfaces point at a locked door"*: Compare, the suite, the
 * Lab, the Everyday bench and the gauntlet all run through that function, so **the thing the
 * workshop exists for** — proving a dispatcher you built beats the ones that shipped — was
 * unreachable from the surface that builds it.
 *
 * The Everyday bench is the sharpest case and is why this is a defect rather than a gap:
 * `everyday/benchScreen.ts` lists `host.dispatchers()`, which **is** `allDispatchers(...)` and has
 * carried saved profiles since it was written. So the bench offered a saved dispatcher, let a
 * reader put it in the field, and failed at *Run the suite* with an engine sentence about `data/`.
 * A control that cannot be honoured being offered anyway is `docs/16` S7 inverted.
 *
 * ## Why the library is a **resource** and not a field of `BatchRequest`
 *
 * `BatchRequest` is *what to run* and it names things by id — a building id, a profile id per arm.
 * `BatchResources` is *"the resolved objects a batch needs. Assembled by the caller; never fetched
 * here."* A dispatcher the player authored is a resolution, not an instruction: it is the same
 * kind of thing `resources.building` is, arriving by the same route and for the same reason. So
 * the player's shelf rides on {@link BatchWorkerRequest.savedProfiles}, the worker folds it into
 * `BatchResources.dispatcherProfiles` through this module, and **`runBatch` is unchanged** —
 * `armProfile` was already reading the library rather than a shipped list, and the library was
 * simply short.
 *
 * Keeping it off the request also keeps a request replayable-by-description: a stored
 * `BatchRequest` that named `yours-1` *and* embedded a copy of it would be two sources for one
 * dispatcher, and the copy is the one that goes stale.
 *
 * ## CLAUDE.md invariant 7, and the refusals that keep it
 *
 * *"Anything tunable is data, not code."* A player's dispatcher is therefore **not** a special
 * kind of arm the batch learns about. It is one more entry in `data/dispatcher-profiles.json`'s
 * own shape, and the way it earns that is by surviving the file's own parser. Nothing here
 * re-implements a check; both refusals are `core`'s, by call — and the third one drafted for this
 * list turned out to be one of them, which is the entry worth reading:
 *
 * 1. **A shadowed id.** Refused *by name*, and this one is load-bearing rather than tidy.
 *    `armProfile` resolves with `.find`, which takes the **first** match, and
 *    `dispatch/policy.ts#weightSetSourceFrom` builds `weightsByProfileId` with `Map.set`, which
 *    keeps the **last**. A saved profile sharing a shipped id would therefore be silently ignored
 *    by one and silently obeyed by the other: the report would name the shipped dispatcher while
 *    a weight-set arm ran the player's. Neither surface would look wrong.
 * 2. **A document `parseDispatcherProfiles` will not have.** The whole merged file is parsed, and
 *    the refusal is `core`'s own schema message rather than a second opinion written here.
 *
 *    **Which half of the product this actually guards was measured rather than assumed, and it is
 *    not the half it was written for.** A *restored* profile cannot reach here unparseable:
 *    `persist/validate.ts#dispatcherIssue` already runs the same parser over each shelf entry and
 *    **drops** the ones that fail, entry by entry, naming them. What has no such check is the
 *    other producer — `dev/dispatcherEditor.ts#save` calls `profileFromSpec` and writes the result
 *    straight to `savedDispatchers`, catching only what that conversion *throws*. So this refusal
 *    exists for the editor's own output, and **the single-run path has no equivalent at all**: an
 *    unauthorable saved profile would reach `resolveDispatchConfig` and throw mid-run. That is
 *    worth fixing at the editor and is not this lane's file, so it is reported rather than patched
 *    here — a second validator written at a batch would be the two-answers defect this module is
 *    otherwise avoiding.
 * 3. **A weight naming a term the cost-term library does not declare** — which is check 2 rather
 *    than a third check, and finding that out is why there is no third check here. A
 *    `resolveWeights` call was written for it, on the reasoning that `weights` is
 *    `z.record(identifier, z.number())` and a misspelling is a valid identifier. It never fired:
 *    `dispatcherProfilesSchema` cross-checks every weight against the file's own `terms` array,
 *    and `core`'s `policy.test.ts` asserts `DECLARED_TERM_IDS` **equals** that array — so on any
 *    library this function can be handed, the parse refuses first and with the better message
 *    (*"unknown cost term … Declared terms: …"*). A guard that cannot fire is decoration, and
 *    `src/index.ts` names deleting it rather than keeping it as this package's habit. What the
 *    parse does **not** catch is a weight on a term the engine declares and will not read under
 *    this profile's own call type; that is § D112's defect, it is the editor's to draw
 *    (`authoring/dispatcherSpec.ts#inertTerms`), and a batch is not where it is discovered.
 *
 * ## Two properties this module is written to have, and both are asserted rather than argued
 *
 * - **Identity when nothing is carried.** `saved.length === 0` returns the loaded file *object*,
 *   not a copy that happens to be equal. That is `dev/state.ts#dispatcherProfilesWithSelector`'s
 *   own criterion (§ D153) and the reason it is a criterion: closing a seam must cost nothing
 *   while nothing opts in.
 * - **The shipped half is never re-parsed into the run.** The merged document is parsed to
 *   *validate*, and then the library is rebuilt as the loaded file's own profile objects plus the
 *   **parsed** saved ones. A player carrying a dispatcher must not be able to move the arm they
 *   are comparing against; `library.test.ts` runs a shipped-versus-shipped batch with and without
 *   a saved profile riding along and requires the legs to be identical, which is the only form of
 *   that promise this repository accepts.
 */

import {
  parseDispatcherProfiles,
  type DispatcherProfile,
  type DispatcherProfiles,
} from '@elevator-sim/core/browser';

/**
 * The merged library, or the reason there is not one.
 *
 * An outcome rather than a throw, for `controls/editedProfile.ts`'s reason exactly: a refusal has
 * to be sayable at the control *and* survivable inside the worker, and an exception crossing a
 * thread boundary is flattened to a string by `dev/batchWorker.ts` — which is how a reader ends up
 * being told a batch failed without being told which dispatcher was at fault.
 *
 * **The sentences are written for a player and not for this file's author**, which is a correction
 * rather than a style note: their loudest renderer is `everyday/benchScreen.ts`, a Casual screen,
 * and the first draft said things like *"which this build's data/dispatcher-profiles.json already
 * ships"* — a file path on a surface whose reader has never seen one. What each of them names now
 * is the dispatcher and the move that clears it. The **parse** refusal still quotes `core`'s schema
 * message verbatim, notation and all, and says whose message it is: that is `editedProfile.ts`'s
 * own rule — *"whatever `core` refuses, this refuses, with `core`'s own message"* — and a second,
 * friendlier paraphrase of a loader error is how two answers to *why not* come to disagree.
 */
export type BatchLibraryOutcome =
  | { readonly ok: true; readonly library: DispatcherProfiles }
  | { readonly ok: false; readonly reason: string };

/**
 * The shipped file with the player's own dispatchers folded in, validated by `core`.
 *
 * The **same function on both sides of the worker boundary**: the panels call it before they
 * enable *Run* (so a shelf that cannot run is refused where the reader is, with the offending
 * dispatcher named), and `dev/batchWorker.ts` calls it to build the resources the batch actually
 * resolves against. Two implementations of *"may this dispatcher run"* would be two answers, and
 * the pre-flight would eventually pass something the run rejects.
 */
export function batchLibraryOf(
  shipped: DispatcherProfiles,
  saved: readonly DispatcherProfile[],
): BatchLibraryOutcome {
  // Identity, deliberately. See the docstring: a seam closed must cost nothing while unused.
  if (saved.length === 0) return { ok: true, library: shipped };

  const shippedIds = new Set(shipped.profiles.map((profile) => profile.id));
  const seen = new Set<string>();
  for (const profile of saved) {
    if (shippedIds.has(profile.id)) {
      return {
        ok: false,
        reason:
          `“${profile.name}” shares an id with a dispatcher this build already ships. Two ` +
          `dispatchers under one id cannot both be run — a comparison would name whichever it ` +
          `found first — so it is refused rather than guessed at. Save it again under a new name ` +
          `in the workshop and it can go through.`,
      };
    }
    if (seen.has(profile.id)) {
      return {
        ok: false,
        reason:
          `two of the dispatchers you have saved share one id. A comparison names its arms by id, ` +
          `so it could not say which of the two it ran. Save one of them again under a new name ` +
          `and it can go through.`,
      };
    }
    seen.add(profile.id);
  }

  let parsed: DispatcherProfiles;
  try {
    parsed = parseDispatcherProfiles({
      ...shipped,
      profiles: [...shipped.profiles, ...saved],
    });
  } catch (error) {
    return {
      ok: false,
      reason:
        `one of the dispatchers you have saved is not one this build can run, and the reason is ` +
        `the loader's own: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  /*
   * The parsed **tail**, over the loaded file's own head. See the docstring's second property:
   * the arm a player compares against must be the object the shipped batch would have run, not a
   * round-trip of it, or carrying a dispatcher could move the baseline.
   */
  const validated = parsed.profiles.slice(shipped.profiles.length);

  return {
    ok: true,
    library: { ...shipped, profiles: [...shipped.profiles, ...validated] },
  };
}

/**
 * A shelf of saved dispatchers as the profile documents {@link BatchWorkerRequest.savedProfiles}
 * carries — one expression of it, for the five surfaces that post a batch.
 *
 * Structurally typed rather than importing `dev/state.ts#SavedDispatcher`, for the reason
 * `dispatch/policy.ts#WeightSetLibrarySource` is: `batch/` may not depend on `dev/`, and stating
 * the one field this needs is a more honest declaration than a type import would be. It takes the
 * viewer's `state.savedDispatchers` and `everyday/host.ts`'s `savedDispatchers()` unchanged.
 *
 * A function rather than five inline `.map`s so that *"what does a surface send"* has one answer
 * and one name to grep for. Adding a sixth batch surface should be a call to this, and a sixth
 * inline map is the thing that eventually forgets.
 */
export function savedProfilesOf(
  saved: readonly { readonly profile: DispatcherProfile }[],
): readonly DispatcherProfile[] {
  return saved.map((entry) => entry.profile);
}

/* -------------------------------------------------------------------------- *
 * What a picker calls the two halves
 * -------------------------------------------------------------------------- */

/**
 * The `<optgroup>` label for `data/dispatcher-profiles.json`'s own profiles.
 *
 * Here rather than in each panel because three pickers draw the same two groups, and a label
 * retyped three times is three labels. It is the batch surfaces' vocabulary for the split this
 * module *is* — a library with a shipped half and a player's half — so the words live beside the
 * function that makes it.
 */
export const SHIPPED_GROUP_LABEL = 'THIS BUILD SHIPS';

/**
 * The `<optgroup>` label for the reader's own saved dispatchers.
 *
 * **`YOURS`, because that is the word the product already uses for them.**
 * `dev/dispatcherEditor.ts` tags a saved profile `YOURS` in its controller list and
 * `everyday/workshopModel.ts` heads its shelf `YOURS`; a picker that said *"custom"* or *"mine"*
 * would be a third name for one thing, and a reader who saved a dispatcher under one heading has
 * to find it under the same heading somewhere else.
 */
export const YOURS_GROUP_LABEL = 'YOURS';
