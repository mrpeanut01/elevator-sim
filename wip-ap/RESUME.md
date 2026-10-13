# Wave AP, paused on 2026-10-13 at the owner's request

The owner paused the studio so a separate agent can work on the Main Menu without collisions. Nothing here is merged. **Remove `wip-ap/` and `wip-dt1/` before this branch merges.**

## State
- **Base:** main at `5228fab` (wave AO whole), plus `7d9e85e`, which opens wave AP's reservation **D1445–D1540**. No lane has written a decision heading yet.
- **Four lane commits, one per lane, each a WIP snapshot.** Each commit message lists what is done, what is started and what remains. The combined tree passes `tsc -b packages/viz`; no test project was run on it.
  - `wip(AP-D1)` the stage's play defects (block D1445–D1450). Brief: `brief-d1.md`.
  - `wip(AP-D2)` true lines in the career, the sandbox and the copy (D1451–D1458). Brief: `brief-d2.md`.
  - `wip(DT-2)` rows that teach, and the held top (D1471–D1480). Brief: `brief-dt2.md`.
  - `wip(DT-1)` days that can be won (D1459–D1470). Brief: `brief-dt1.md`. **It stops Midtown dealing weeks 2 to 4 until `data/week-pool.json` is filled.** The census checkpoint is `wip-dt1/week-pool-census.jsonl` (91 rows: Monday, Tuesday and part of Wednesday), resumed by `wip-dt1/census.sh`.
- **Not started:** DT-3, the need ladder (D1481–D1488), which waits on DT-1's pool.
- **Swarm DT's reconciled ruling** is `ruling-dt.md`; every lane's common rules are `preamble.md`. Where they name a base commit (`ed379f9`), read this branch's head instead: `ed379f9` is `14e18c9` plus the reservation, the same tree as `5228fab` plus `7d9e85e`.

## To resume
1. Merge `main` into this branch (the Main Menu work lands there first) and resolve any collision.
2. Relaunch each lane from this branch's head with its brief and the remaining list in its commit message.
3. When all four are in: close the reservation, re-run the call-bands sweep if admission changed, measure the always-on corpus, write the wave's `docs/44`, `CLAUDE.md` and roadmap rows, remove `wip-ap/` and `wip-dt1/`, then open the merge.
4. After the merge, a three-seat panel (P1 to P4, honesty) scores the game against `docs/43` § 4.
