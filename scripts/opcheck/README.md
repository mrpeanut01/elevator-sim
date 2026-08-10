# opcheck — operational-health harness

Answers one question about a (building × dispatcher × traffic × template) cell: **does the lift
group actually operate?** Cars move, banks serve, floors get visited, riders board, transfers
complete, escalators carry, decks pair, nothing throws.

It is **not** a performance harness. It never compares dispatchers on AWT and never declares one
better than another — `packages/experiments` is where that belongs, under the statistical discipline
CLAUDE.md sets out. A saturated building is not a finding here; a car parked while its own riders
stand is, saturated or not.

## Files

| file | what it is |
|---|---|
| `opcheck.mjs` | runs one cell and checks it; exports `checkCell(cell)` and `config()` |
| `matrix.mjs` | writes the cell matrix, sliced for parallel workers |
| `report.mjs` | aggregates NDJSON into a triage report |
| `baseline.mjs` | pins / re-checks how every dispatcher operates in every building |
| `baseline.json` | the pin, 312 cells (8 × 13 × 3 seeds) |
| `BRIEF.md` | the shared brief the investigation lanes worked from |
| `probes/` | two throwaway probes kept as evidence for the vertical-city findings |

## Use

```bash
node scripts/opcheck/opcheck.mjs --building vertical-city --dispatcher collective --seed 42 --pretty
```

```bash
node scripts/opcheck/matrix.mjs /tmp/opcheck --slices 10 --set all
```

```bash
for i in $(seq 0 9); do node scripts/opcheck/opcheck.mjs --cells /tmp/opcheck/slice-$i.json --out /tmp/opcheck/slice-$i.ndjson & done; wait
node scripts/opcheck/report.mjs /tmp/opcheck
```

A cell is `{building, dispatcher, traffic?, template?, seed?, durationS?, demand?, patience?,
doorObstructionProbability?, serviceEvents?, label?, group?}`. `serviceEvents` takes a literal
schedule or the sugar `{withdraw: N, atS, restoreAtS?, mode?}`. Requires `npm run build` first.

## Regression check

`baseline.json` records *operation* and never quality — who boarded, which car, which bank, how far
each car drove. A dispatcher that gets faster is not a regression; a bank that stops serving is.

```bash
node scripts/opcheck/baseline.mjs check scripts/opcheck/baseline.json
```

Exits 1 on any difference and prints what moved. A difference is not automatically a bug — it is
automatically something a human has to have decided to do. Re-pin with `write` once the decision is
made.

## The rule this harness is held to

**A check that cannot fail is not evidence.** Seven of its twenty-three checks were once incapable
of firing — a car-id namespace mismatch resolved 0 of 79 cars — and the sweep reported everything
clean. Every check has since been shown to go red on an injected fault and stay green on a clean
control. If you add a check, add the fault that trips it.

Findings and the full audit: [`UI_READINESS_AUDIT.md`](../../UI_READINESS_AUDIT.md).
