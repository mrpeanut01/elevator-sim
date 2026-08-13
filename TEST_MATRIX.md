# TEST_MATRIX

Scenario coverage for the Everyday + Engineer wave. Status: `planned` → `owned` → `passing`.
Unit/property coverage colocates with source (`*.test.ts`); this matrix tracks the *journeys*.

| # | Flow | Type | Scenario | Owner | Status |
|---|---|---|---|---|---|
| T1 | Menu → door → brief → stage → report → week | browser (driven) | happy path, day closed, figures consistent | A0 | planned |
| T2 | Stage entry | browser | enters paused at 06:00, first frame drawn, speed = player default (never inherited) | A2 | planned |
| T3 | Intervention | unit + browser | park-the-cars at 09:14: figures before identical, after changed; replay reproduces | A2 | planned |
| T4 | Levers/terms | unit | lever moves its terms; term updates its lever; maths line prints the same vector | A1 | planned |
| T5 | Rules | unit + browser | queue > 12 rule visibly parks a car; fallback line always printed | A3 | planned |
| T6 | Detector | unit | classifies last *judge* seconds, honours *hold* and *margin*; noon transition renames the pill | A3 | planned |
| T7 | Ghost picker | browser | all five options; `none` = one line, no band, no verdict | A3 | planned |
| T8 | Campaign day | unit | four tests evaluated at close; 26 vs cap 25 → missed; calendar draws × | A4 | planned |
| T9 | Shop/works | unit | booked money leaves purse; works day takes a car out; `works run past the contract` refused | A4 | planned |
| T10 | Fix-a-building | unit + browser | pass = paired runs; before/after rows match fresh run; nothing clickable but repairs/editor/primary | A5 | planned |
| T11 | Bench | unit | 10 vs 200 reps: different interval widths; zero inside → *Too close to call*; field of 3 → no pairwise verdict | A6 | planned |
| T12 | Spectator | browser | `you` appears nowhere; watched away figure at 19:00 equals board row; interventions disabled | A7 | planned |
| T13 | Gauntlet | unit + browser | dirty dispatcher refused with reason; forty cases run; ladder shows new rating | A7 | planned |
| T14 | Boards | unit | one board a day; no player-settable parameter in a key; reference rows labelled | A7 | planned |
| T15 | Withheld matrix | property | every combination of day-open · replay · sandbox · noPost across week/board/ladder/percentile/report renders `—`/labelled | A8 | planned |
| T16 | API absent | browser | every screen complete; *world figures unavailable*; no zero-as-unknown | A8 | planned |
| T17 | Honesty corpus | property | sweep enumerates § 18 states; corpus measured once post-integration, both tiers | WS-I | planned |
| T18 | Engineer parity of information | grep + review | every figure/qualifier/refusal on the old Engineer surface survives the restyle (§ D299) | B0 | planned |
| T19 | Engineer challenges | unit + browser | each challenge runs, scores from runs, refuses dishonest states | B lanes | planned |
| T20 | Keyboard/exit | browser | Escape, focus order, action-bar table § 3.3 per screen | A0 | planned |
| T21 | Regression | suite | root `npm test` + `tsc -b` green at every integration point | WS-I | planned |
