/**
 * Validating an edited building — against the **existing** schema, which already validates.
 *
 * `UX.md` § 4 is explicit that the editor adds no new schema, and this module is where that is
 * kept honest: every issue it reports comes out of `buildingConfigSchema`, `expandFloors`,
 * `resolveCar` or `resolveBuilding`, all of them in `@elevator-sim/core`. Nothing here decides
 * what is legal. A second opinion about legality is how an editor comes to accept a document the
 * loader will reject, which is precisely the failure `ED-T8` ("one control goes from a valid edit
 * to a run") is designed to make impossible.
 *
 * ## Every issue at once
 *
 * `ConfigError` carries `issues`, plural, deliberately — `parse.ts`'s own docstring says a caller
 * fixing a building config should not have to re-run the loader once per typo — and `UX.md`
 * `ED-20`/`RV-18` make showing only the first a **regression against the loader's own contract**.
 *
 * Getting that right is not automatic, because the two stages throw separately: a document that
 * fails the *schema* never reaches `resolveBuilding`, so schema issues and cross-reference issues
 * cannot both be collected in one pass. What this module does is report every issue of the
 * furthest stage reached, and say which stage that was, so the reader knows whether more may
 * follow. Pretending otherwise — running the resolver on a document the schema rejected — would
 * produce cascades of nonsense from the fields the schema already told us were the wrong type.
 *
 * ## Warnings are separate, and never block
 *
 * `ED-T7`: every `ConfigWarning` listed separately as suspicious-not-fatal, and `UX.md` § C.3's
 * warning-only state keeps **Run enabled**. A blocked run for a warning teaches the reader to
 * ignore warnings.
 *
 * ## One refusal that is the viewer's, not the schema's
 *
 * A landing call type — per-floor destination panels, GitHub issue #437 — is legal in core since
 * § D553, and this module still refuses it, which is the single exception to *nothing here decides
 * what is legal*. It is not a second opinion about the document: the loader and the CLI accept it
 * and run it. It is a refusal about **what this viewer can show**. A building whose landings take
 * different calls runs as the `hybrid` passenger model, and the viewer's disclosure, pinned-queue
 * overlay and report still describe every rider taking whichever car answers while the riders at a
 * panel landing are held to one car. So each declaration is one located issue, the document still
 * opens so the field can be removed, and Run stays disabled. `validateBuilding` is the one door a
 * player's building enters the viewer by — the editor's pasted text and file import, its form
 * edits, and `persist/validate.ts`'s library restore — which is why the refusal lives here and in
 * no caller. Stage 2 deletes it on the commit that teaches the viewer hybrid runs (§ D553 clause 9).
 */

import {
  ConfigError,
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type ConfigIssue,
  type ConfigWarning,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';

/** How far validation got before it stopped. */
export type ValidationStage = 'json' | 'schema' | 'resolve';

export interface ValidationReport {
  /** No fatal issues. Warnings may still be present. */
  readonly valid: boolean;
  /**
   * The furthest stage reached.
   *
   * `'schema'` with issues means the document never reached cross-referencing, so fixing these
   * may reveal more. The UI says so rather than implying the list is exhaustive.
   */
  readonly stage: ValidationStage;
  /** Every fatal issue of the furthest stage reached, located by file and JSON path. */
  readonly issues: readonly ConfigIssue[];
  readonly warnings: readonly ConfigWarning[];
  /** The parsed document, when the schema accepted it. */
  readonly building: BuildingConfig | undefined;
  /** The resolved building, when everything passed. Feeds the preview and the Run control. */
  readonly resolved: ResolvedBuilding | undefined;
}

export interface ValidateOptions {
  readonly file?: string;
  /** Declared traffic-profile ids, so `trafficProfile` is cross-checked as the loader does. */
  readonly trafficProfileIds?: ReadonlySet<string> | undefined;
}

/**
 * Parse JSON text, then validate it. `ED-18`: a parse error carries its position.
 *
 * Separate from {@link validateBuilding} because a text editor and a form editor fail
 * differently: only the text path can produce invalid JSON at all.
 */
export function validateBuildingText(
  text: string,
  specs: ElevatorSpecs,
  options: ValidateOptions = {},
): ValidationReport {
  const file = options.file ?? '<edited building>';
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      stage: 'json',
      issues: [{ file, path: '(document)', message, code: 'invalid-json' }],
      warnings: [],
      building: undefined,
      resolved: undefined,
    };
  }
  return validateBuilding(data, specs, options);
}

/** Validate an already-parsed document. Never throws; every failure becomes issues. */
export function validateBuilding(
  data: unknown,
  specs: ElevatorSpecs,
  options: ValidateOptions = {},
): ValidationReport {
  const file = options.file ?? '<edited building>';

  let building: BuildingConfig;
  try {
    building = parseBuilding(data, file);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return {
      valid: false,
      stage: 'schema',
      issues: error.issues,
      warnings: [],
      building: undefined,
      resolved: undefined,
    };
  }

  const refusals = landingPanelRefusals(building, file);
  try {
    const resolved = resolveBuilding(building, specs, {
      file,
      trafficProfileIds: options.trafficProfileIds,
    });
    if (refusals.length > 0) {
      // Everything core checks passed, so these are every issue of the furthest stage reached.
      return {
        valid: false,
        stage: 'resolve',
        issues: refusals,
        warnings: resolved.warnings,
        building,
        resolved: undefined,
      };
    }
    return {
      valid: true,
      stage: 'resolve',
      issues: [],
      // `ResolvedBuilding.warnings` is where the resolver puts its non-fatal diagnostics; a
      // successful resolve still has plenty to say (population mismatch, a car outside its
      // class envelope, double-deck declared but not simulated).
      warnings: resolved.warnings,
      building,
      resolved,
    };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return {
      valid: false,
      stage: 'resolve',
      issues: [...error.issues, ...refusals],
      warnings: [],
      building,
      resolved: undefined,
    };
  }
}

/** The issue code a landing call type is refused under — § D553 clause 9. */
const LANDING_PANEL_REFUSAL_CODE = 'landing-call-type-not-playable';

const LANDING_PANEL_REFUSAL =
  'per-floor destination panels are not playable in the viewer yet (GitHub issue #437). ' +
  'A landing that takes its own kind of call can make the run hybrid, holding the riders at some ' +
  'landings to one car, and this viewer would still show every rider taking whichever car answers. ' +
  'Remove this field to run the building here.';

/**
 * One located issue per floor and per floor range that declares a landing call type, floors first,
 * each in document order. Any declaration is refused, including one naming the dispatcher's own
 * call type: the dispatcher is chosen separately in the viewer, so a declaration that is uniform
 * under one dispatcher is a hybrid under the next.
 */
function landingPanelRefusals(building: BuildingConfig, file: string): readonly ConfigIssue[] {
  const declared = [
    ...(building.floors ?? []).map((floor, index) => ({
      at: `floors[${String(index)}]`,
      callType: floor.landingCallType,
    })),
    ...(building.floorRanges ?? []).map((range, index) => ({
      at: `floorRanges[${String(index)}]`,
      callType: range.landingCallType,
    })),
  ];
  return declared.flatMap(({ at, callType }) =>
    callType === undefined
      ? []
      : [
          {
            file,
            path: `${at}.landingCallType`,
            message: LANDING_PANEL_REFUSAL,
            code: LANDING_PANEL_REFUSAL_CODE,
          },
        ],
  );
}

/**
 * Whether the report says more issues may appear once these are fixed.
 *
 * The UI shows this next to the list, because "3 problems" that becomes "3 different problems"
 * after a fix reads as the editor lying unless it said the list was a stage rather than a total.
 */
export function issuesMayBeIncomplete(report: ValidationReport): boolean {
  return report.issues.length > 0 && report.stage !== 'resolve';
}

/** A one-line summary for a status region. Reads correctly in all four states. */
export function summariseReport(report: ValidationReport): string {
  const warnings = report.warnings.length;
  const warningText =
    warnings === 0 ? '' : ` · ${String(warnings)} warning${warnings === 1 ? '' : 's'}`;
  if (report.valid) return `valid${warningText}`;
  const count = report.issues.length;
  const more = issuesMayBeIncomplete(report)
    ? ` (${report.stage === 'json' ? 'JSON' : 'schema'} stage — more may appear once these are fixed)`
    : '';
  return `${String(count)} problem${count === 1 ? '' : 's'}${more}${warningText}`;
}
