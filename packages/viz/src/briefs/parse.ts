/**
 * **The six engineering briefs, as data** — `docs/21-engineer-reimagined-contract.md` § 4, GitHub
 * issue **#227**, and the schema the product owner's 2026-09-06 rescope of that issue put them on.
 *
 * ## What moved, and why this file is a decoder rather than a second schema
 *
 * § 4 specifies `data/engineering-briefs.json` with *"one entry per brief"* and its own six `kind`s.
 * Issue #227's third comment then rescoped it, and the sentence that governs this module is:
 *
 * > *"The six briefs survive whole. Their schema and their home do not. … `data/engineering-briefs.json`
 * > as its own file, and `dev/briefsPanel.ts` as its own Engineer panel, are the parts that move.
 * > The briefs are authored as scenarios in the technical register and reached from Scenario."*
 *
 * [§ D525](../../../../DECISIONS.md) clause 1 and [`docs/38`](../../../../docs/38-what-the-game-is.md)
 * § 2.1 say what they are authored *to*: *"`data/campaign.json`'s stage record already carries
 * everything but the budget … That record, plus a budget, is the scenario schema"*, and the six
 * Engineer challenges are one of that schema's four authors. `campaign/types.ts#CampaignStage`
 * already carries the budget (#365) and `campaign/parse.ts` is already titled *the scenario schema*.
 *
 * **So there is no second schema here and there deliberately is not one.** A brief is a
 * `CampaignStage` — validated by `parseCampaign`, against `data/scenario-goals.json`,
 * `collectSearchSpace()`, `data/buildings/` and `data/price-schedule.json` — plus one field the
 * campaign record has no use for: which of § 4's six challenges it is. Everything below is that one
 * field and the refusals that keep an unbuildable challenge from shipping as an inert one.
 *
 * ### Why the briefs are still a file of their own rather than rows in `data/campaign.json`
 *
 * Because that array is Career's ordered ten — `campaign/stageSequence.ts` walks it as a
 * progression and `validation/contentPlan.test.ts` counts it as *campaign-stages*. Appending six
 * briefs to it would put them **in** the Career ladder, which is the one thing the rescope does not
 * say. One file per source, one schema across the sources, is what `docs/38` § 2.1 describes; the
 * physical merge of the four sources is #365's successor and not this issue.
 *
 * ## The two trip-wires § 4 binds every brief to
 *
 * 1. **A batch-judged bar must already be measured.** `campaign/judge.ts#judgeStage` refuses to
 *    judge against a bar that does not reproduce (`met: null`, so the stage can never clear), and
 *    the bars live in `data/scenario-goals.json` per stage id. Every brief here therefore ships with
 *    its measured row, regenerated through the scenario regeneration path — `scenario/candidates.ts`
 *    holds the configuration and `scenario/regenerate.test-helper.ts` runs it, so
 *    `scenario/goalRates.test.ts` re-derives a brief's counts on every run exactly as it does the
 *    ten stages'. Nothing here writes a bar and nothing here could: `parseCampaign` refuses a stage
 *    with no published row, which is the trip-wire enforced rather than described.
 * 2. **Anything speaking of required n or resolvable effects rides § 3.7's declared new seam, with
 *    its caveat sentence, or does not speak of them.** No brief here speaks of them, and no string
 *    in this module or in `data/engineering-briefs.json` names a replication count, a resolution
 *    limit or a required n. That is the *does not* half taken deliberately: `compareCell`,
 *    `replicationsToResolve` and `smallestDetectableEffect` still have no viz caller, so a brief
 *    quoting one would be building an export path through `experiments/browser.ts` — and § 3.7 (2)
 *    requires Compare's own *"running it again until it separates chooses the answer"* caveat to
 *    travel with the figure. `briefs.test.ts` asserts the absence rather than trusting it.
 *
 * ## Four of the six are refused at load, and the refusal is the point
 *
 * {@link BRIEF_KIND_SEAM} names, per kind, the seam a brief of that kind would need and does not
 * have. A brief of a refused kind **does not load**. That is `CLAUDE.md`'s standing requirement —
 * *name the non-test caller* — arriving before the work rather than after it: this repository has
 * shipped a behaviour with no caller eleven times in code and twice in `data/`, and an authored
 * brief that cannot reach a run would be the twelfth, authored, validated, listed on a screen and
 * unable to change a single leg.
 *
 * **Each refusal's premise is derived rather than asserted.** `parse.test.ts` checks every one
 * against the tree — the arm count, the building's home on the request, and the goal bucket every
 * scenario carries — so a seam that opens later turns the refusal red instead of leaving it to be
 * rediscovered. That is § D227's rule in the direction that catches a stale refusal: a control that
 * writes something may not claim it writes nothing.
 *
 * ## No `DECISIONS.md` entry, and the reason rather than a note that one is owed
 *
 * [§ D405](../../../../DECISIONS.md): an entry is owed when a decision **reaches past the module
 * that took it**, and otherwise the docstring is the record. The schema this file is on was not
 * decided here — it is [§ D525](../../../../DECISIONS.md) clause 1 and the owner's own rescope of
 * issue #227, applied. What *was* decided here is which kinds a brief may carry and where the file
 * lives, and both are this module's, checked by `parse.test.ts` rather than argued. The one thing a
 * later reader might expect an entry for — the four refusals — is deliberately code and not prose:
 * a refusal recorded in `DECISIONS.md` cannot go red when its seam opens, and this one can.
 */

import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign, CampaignStage } from '../campaign/types.js';

/* -------------------------------------------------------------------------- *
 * The six kinds
 * -------------------------------------------------------------------------- */

/**
 * § 4's six challenges, in the document's own order.
 *
 * Five of the six ids are § 4's own `kind` strings, quoted from its `Data:` lines. **E5's is not**:
 * § 4 gives E5 *"a `CampaignStage`-shaped entry"* and never a `kind`, because under § 4's original
 * shape E5 was the one brief that already was a stage. Under the rescoped schema every brief is a
 * stage, so E5 needs an id like the rest and `meet-the-target` is it — chosen here, and said to be
 * chosen rather than quoted.
 */
export const BRIEF_KINDS = [
  'commission',
  'design-to-interval',
  'diagnose',
  'what-moved',
  'meet-the-target',
  'trade-study',
] as const;

export type BriefKind = (typeof BRIEF_KINDS)[number];

/**
 * Why a brief of this kind cannot be authored to the scenario schema today, or `null` where it can.
 *
 * Every sentence names a **seam** — a specific function, type or rule in this tree — rather than a
 * quantity of work, because a refusal that says *"not built yet"* is a refusal nobody can check.
 * `parse.test.ts` checks each premise against the tree.
 */
export const BRIEF_KIND_SEAM: Readonly<Record<BriefKind, string | null>> = Object.freeze({
  /*
   * E1 and E2 share one seam and it is a statistical one rather than a missing parameter.
   * `batch/types.ts#BatchArmRequest` says it in terms: the dispatcher is *"the one field the
   * passenger trace is not a function of, so two arms may differ here and only here without
   * breaking CRN"*. A commissioned or a designed building is a different building, so the two arms
   * would be two populations and the paired interval between them arithmetic on unrelated runs.
   * `campaign/stageRun.ts#batchRequestForStage` takes `buildingId` from the stage for that reason.
   */
  commission:
    'E1 asks the player to commission a building and then prove the choice on a batch. A ' +
    'scenario run puts the building on the request — campaign/stageRun.ts#batchRequestForStage ' +
    'reads stage.building — and batch/types.ts#BatchArmRequest lets two arms differ on the ' +
    'dispatcher and only on the dispatcher, because that is the one field the passenger trace is ' +
    'not a function of. Two arms on two buildings are two populations, so the paired interval ' +
    'between them would be arithmetic on unrelated runs. Until a scenario carries a building ' +
    'edit, an authored commission brief could not change a leg.',
  'design-to-interval':
    'E2 asks the player to design a bank to a closed-form interval and then hold it on a crowd. ' +
    'The crowd half meets commission’s seam exactly — the designed bank is a different building — ' +
    'and the closed-form half is a judge over core/analytical with no run at all, so it has no ' +
    'goal, no bar and nothing for judgeStage to judge. Both halves are real; neither is a ' +
    'scenario.',
  diagnose: null,
  /*
   * E4 is refused by the schema itself rather than by a missing seam, which is why its sentence
   * points at `campaign/parse.ts` instead of at a signature. Its verdict is binary — named the
   * dimension or did not — so it declares no goal; and every published scenario's `goals` bucket
   * holds `beat-the-baseline`, which `parse.ts` requires a stage to declare. A goal-less brief
   * cannot be authored to this schema, and a brief that declared `beat-the-baseline` to satisfy
   * the schema would be claiming a comparison the challenge does not make.
   */
  'what-moved':
    'E4 is a reading exercise whose verdict is binary — the dimension was named or it was not — ' +
    'so it declares no goal and claims no interval. campaign/parse.ts requires a stage to declare ' +
    'every kind in its published goals bucket, and beat-the-baseline is in every bucket there is, ' +
    'so a goal-less brief cannot be authored to the scenario schema and one that declared ' +
    'beat-the-baseline would be claiming a comparison the challenge never makes.',
  'meet-the-target': null,
  /*
   * **E6's blocker is not the one `docs/21` § 4 names, and the correction is worth more than the
   * refusal.** That section says E6 needs *"a typed change to `SuiteField`"*, widening the suite's
   * field *"from exactly-two to the brief's candidate list"*. Checked against the tree rather than
   * quoted: `batch/suite.ts#SuiteField` is already
   * `readonly [BatchArmRequest, BatchArmRequest, ...(readonly BatchArmRequest[])]` — at least two,
   * no ceiling — and its own docstring records the widening as done, for the Everyday bench. So the
   * change § 4 asks for has landed and the sentence asking for it went stale, which is this
   * repository's named class (§ D227) arriving on a contract rather than on a control.
   *
   * What actually refuses E6 here is the schema, exactly as it refuses E4: a front over a candidate
   * set has no goal, no bar and no `judgeStage` verdict, so there is no `CampaignStage` to author.
   * `parse.test.ts` asserts both halves — that a third arm types, and that a goal-less brief cannot
   * parse — so the day somebody builds the front, this sentence goes red rather than being believed.
   */
  'trade-study':
    'E6 delivers a front over a candidate set, not a verdict over two arms, so like what-moved it ' +
    'declares no goal and there is no CampaignStage to author it as. The typed widening docs/21 ' +
    '§ 4 asks for is NOT the blocker and that clause is stale: batch/suite.ts’s SuiteField already ' +
    'takes at least two arms with no ceiling. What is missing is the front itself — a domination ' +
    'computation over the suite’s own rows whose every membership claim is interval-backed — and a ' +
    'screen to deliver it on, neither of which is a scenario.',
});

/* -------------------------------------------------------------------------- *
 * The parsed shape
 * -------------------------------------------------------------------------- */

/** One brief: which challenge it is, and the scenario it is. */
export interface EngineeringBrief {
  readonly kind: BriefKind;
  /** Validated by `campaign/parse.ts` — the scenario schema, not a second one. */
  readonly stage: CampaignStage;
}

/** `data/engineering-briefs.json`, parsed. */
export interface EngineeringBriefs {
  /** Where the file came from, so a stale brief has an owner. */
  readonly generatedBy: string;
  readonly contract: string;
  readonly briefs: readonly EngineeringBrief[];
  /**
   * The scenarios, as a `Campaign`, so a caller that already draws stages needs no second path.
   *
   * The same objects as {@link briefs}' `stage` fields rather than copies: two lists that could
   * drift apart is the defect this whole directory exists on the far side of.
   */
  readonly asScenarios: Campaign;
}

/** Raised when `data/engineering-briefs.json` cannot be read as briefs at all. */
export class EngineeringBriefsError extends Error {
  override readonly name = 'EngineeringBriefsError';
  /** Every violation found, not just the first — `CampaignError`'s shape, deliberately. */
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`the engineering briefs are not valid:\n  ${violations.join('\n  ')}`);
    this.violations = violations;
  }
}

/* -------------------------------------------------------------------------- *
 * Parsing
 * -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read `data/engineering-briefs.json` and validate it.
 *
 * Two passes, in this order and for a stated reason. **The kinds first**, because a brief of a
 * refused kind is refused whether or not its scenario is well formed — a well-formed inert brief is
 * the worse of the two failures, and validating the scenario first would report it as sound.
 * **Then the scenario half, by `parseCampaign`**, so every rule the ten campaign stages are held to
 * holds here with no second copy: the measured bar, the goal bucket in both directions, the seeds'
 * derived disjointness, the levers, the budget against `data/price-schedule.json`.
 *
 * @throws EngineeringBriefsError carrying every violation this module found.
 * @throws CampaignError carrying every violation the scenario schema found.
 */
export function parseEngineeringBriefs(
  raw: unknown,
  context: CampaignContext,
): EngineeringBriefs {
  const violations: string[] = [];
  if (!isRecord(raw)) throw new EngineeringBriefsError(['the briefs file is not a JSON object.']);

  const entries = raw['briefs'];
  if (!Array.isArray(entries)) {
    throw new EngineeringBriefsError(['the briefs file has no "briefs" array.']);
  }

  const kinds: BriefKind[] = [];
  const seenKind = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const at = `briefs[${String(index)}]`;
    if (!isRecord(entry)) {
      violations.push(`${at}: is not an object.`);
      continue;
    }
    const id = typeof entry['id'] === 'string' ? entry['id'] : at;
    const kind = entry['kind'];
    if (typeof kind !== 'string') {
      violations.push(`brief "${id}": has no "kind". § 4 names six, and a brief is one of them.`);
      continue;
    }
    if (!(BRIEF_KINDS as readonly string[]).includes(kind)) {
      violations.push(
        `brief "${id}": kind "${kind}" is not one of docs/21 § 4's six: ${BRIEF_KINDS.join(', ')}.`,
      );
      continue;
    }
    const narrowed = kind as BriefKind;
    if (seenKind.has(narrowed)) {
      violations.push(
        `brief "${id}": a second brief of kind "${narrowed}". § 4 declares one challenge per kind, ` +
          'and two would make the kind a category rather than the challenge it names.',
      );
      continue;
    }
    seenKind.add(narrowed);
    const seam = BRIEF_KIND_SEAM[narrowed];
    if (seam !== null) {
      violations.push(`brief "${id}": kind "${narrowed}" cannot reach a scenario run. ${seam}`);
      continue;
    }
    kinds.push(narrowed);
  }

  if (violations.length > 0) throw new EngineeringBriefsError(violations);

  /*
   * The scenario half, through the shipped validator. `stages` rather than `briefs` is the key
   * `parseCampaign` reads, and handing it the same objects means a brief is checked as the scenario
   * it is rather than as a copy of one.
   */
  const asScenarios = parseCampaign(
    {
      generatedBy: raw['generatedBy'],
      contract: raw['contract'],
      stages: entries,
    },
    context,
  );

  const briefs = asScenarios.stages.map((stage, index) => ({
    /*
     * `parseCampaign` preserves order and drops nothing once it has thrown on nothing, so the
     * index is the same index the kind was read at. Asserted rather than assumed: a mismatch here
     * would label a brief with another brief's challenge.
     */
    kind: kinds[index] ?? BRIEF_KINDS[0],
    stage,
  }));
  if (briefs.length !== kinds.length) {
    throw new EngineeringBriefsError([
      `the scenario schema returned ${String(briefs.length)} stages for ${String(kinds.length)} ` +
        'briefs, so a kind would be attached to the wrong scenario.',
    ]);
  }

  return {
    generatedBy: typeof raw['generatedBy'] === 'string' ? raw['generatedBy'] : '',
    contract: typeof raw['contract'] === 'string' ? raw['contract'] : '',
    briefs,
    asScenarios,
  };
}
