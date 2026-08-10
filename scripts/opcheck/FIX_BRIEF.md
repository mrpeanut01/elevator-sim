# Fix brief — remediation of the UI readiness audit

Read [`../../UI_READINESS_AUDIT.md`](../../UI_READINESS_AUDIT.md) first; it is the finding list and
the evidence. This brief is how the fixes are to be made.

## You are working in an isolated git worktree

Your changes will be merged by the coordinator. **Stay inside your lane's file ownership** — it is
listed in your task. If a fix genuinely requires touching a file another lane owns, do not edit it:
say so in your report and describe the change you would have made. A merge conflict costs more than
a deferred fix.

### Bootstrap, first thing, before anything else

A fresh worktree has no `node_modules`, and the naive fix (symlinking the root one) makes
`@elevator-sim/*` resolve to the **main checkout** — so you would be testing code you did not
write. The repo ships a script that does it correctly:

```bash
bash /Users/nrene/Development/04-personal-projects/elevator-sim/.worktree-setup.sh /Users/nrene/Development/04-personal-projects/elevator-sim "$PWD"
```

The audit harness is untracked in the main tree, so copy it in — you need it to verify your fix:

```bash
mkdir -p "$PWD/scripts" && cp -r /Users/nrene/Development/04-personal-projects/elevator-sim/scripts/opcheck "$PWD/scripts/"
cp /Users/nrene/Development/04-personal-projects/elevator-sim/UI_READINESS_AUDIT.md "$PWD/"
```

Copy the audit too, not just the harness — the harness's markdown links to it, and
`validation/citations.test.ts` fails on a dangling link. Both files are untracked, so neither
merges.

Then `npm run build` and confirm you are testing your own tree: `readlink node_modules/@elevator-sim/core`
must point inside your worktree, not into the main checkout. **Check this — every measurement you
report depends on it.**

## The rules that bind this repository, and therefore you

From `CLAUDE.md`, and every one of them has teeth here:

1. **Do not weaken an acceptance criterion to make something pass. Raise it instead.**
2. **A behaviour with no non-test caller is a dead seam.** If you add a mechanism, name the shipped
   code path that reaches it. A barrel re-export and a `{@link}` are not callers.
3. **Move the control and require the run to change, compared on the legs** — not on a window
   statistic. If you claim your fix changes behaviour, show two runs whose leg records differ.
4. **A check that cannot fail is not evidence.** Every test you add must be shown to fail against
   the unfixed code. State that you did this.
5. **A stated mechanism goes stale.** If you fix code that a docstring or a `notes` field describes,
   fix the prose in the same commit. Several findings in this audit *are* stale prose.
6. **If you publish a number, pin it to the run that produced it.**
7. Invariants: `estimateCost` pure · no global RNG · no wall-clock in `core/` · deterministic tie
   breaks · every record carries its seed · `core/` never imports `viz/` · tunables are data, not
   code · every tunable declares its schema.

## Before you claim done

```bash
npm run build && npm test
```

Both must pass. Then:

```bash
node scripts/opcheck/baseline.mjs check scripts/opcheck/baseline.json
```

`baseline.json` pins how all 13 dispatchers operate in all 8 buildings at 3 seeds — who boarded,
which car, which bank, how far each car drove. **It will report differences if your fix changes
dispatch behaviour, and for some lanes that is the whole point.** What is required is that you can
*account for every cell that moved*: which buildings, which dispatchers, and why your change
produced exactly that. An unexplained movement is a regression. Do **not** re-pin the baseline —
the coordinator does that once, after merging.

Also run the operational sweep on whatever you changed:

```bash
node scripts/opcheck/opcheck.mjs --building <b> --dispatcher <d> --seed 20260810 --pretty
```

## Watch for pinned figures

`packages/experiments/src/benchmark/published.ts` holds measured intervals pinned to specific runs,
and `packages/experiments/src/validation/documentation.test.ts` asserts claims made in prose. A
dispatch-semantics change can invalidate both. If your change moves a published figure, **do not
quietly re-pin it** — report it, with the old and new values and the run that produced each.

## Decisions

`DECISIONS.md` is 1.5 MB and shared; **do not edit it**. Write your proposed entry — the argument,
the measurement, the verdict — to a file named for your lane under the scratch directory
"slash tmp slash fix-decisions" (written out rather than as a path, because
`validation/citations.test.ts` checks that every path-shaped token in a markdown file resolves to
something that exists in the repo — and this one deliberately does not). The coordinator will merge
it. Follow the house style: state what was measured, not what was assumed.

## Report back

1. **What you changed**, file by file, and why.
2. **The evidence it works** — leg-level where behaviour changed, the failing-test-before/passing-
   test-after for each test you added.
3. **What moved in the baseline**, cell by cell, and your account of each.
4. **What you did not fix**, and why — scope, risk, or another lane's ownership.
5. **Any new defect you found** while in there.

Be exact about uncertainty. A fix you believe in but could not measure is reported as such.
