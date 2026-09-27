# SDD ledger — plan: docs/superpowers/plans/2026-09-27-nflverse-team-data.md

Baseline: `npm install` succeeded; `npm test` passed (19 tests, 0 failures).

## Pre-flight compatibility scan

| Tasks / scope | Produced vs. consumed interface or shared file | Finding |
|---|---|---|
| Task 1 → Task 2 | Parsed team metadata rows and source metadata feed identity normalization | Compatible; Task 2 consumes the documented row fields. |
| Task 1 → Task 3 | Weekly stats rows/source metadata feed postgame normalization | Compatible; required source columns are specified. |
| Task 2 → Task 3 | Season/team franchise lookup resolves source aliases | Compatible; lookup key format is explicit. |
| Task 3 → Task 4 | Team postgame records are ordered into pregame records | Compatible; game/team/franchise and kickoff fields are required. |
| Task 4 → Task 5 | Pregame records and market game IDs feed matchup join and publisher | Compatible; Task 5 coordinates published ranges. |
| Task 1 ↔ Task 5 | Both handle raw downloads | Compatible; Task 1 returns raw CSV, Task 5 owns ignored persistence. |
| Task 1 self-consistency | CSV validation happens before parsed result returns | Compatible; red/green tests specify source failure. |
| Task 2 self-consistency | Alias continuity and unknown identities reject | Compatible; source mapping is auditable. |
| Task 3 self-consistency | Two rows per game, paired opponent-derived metrics, explicit rejections | Compatible; tests cover invalid pairs. |
| Task 4 self-consistency | Snapshot emitted before current postgame accumulator update | Compatible; tests pin leakage boundary. |
| Task 5 self-consistency | Immutable runs plus one manifest pointer preserve prior pair | Compatible; failure tests own this behavior. |

Task 1: initial review note: metadata-specific non-success and malformed-CSV paths lacked direct tests; final review follow-up below adds both regressions.
Task 1: complete (commits 5b21154..0b62f25, review clean)
Task 2: complete (commits 0b62f25..40d3869, review clean)
Task 3: initial review note: fixture omitted `sack_yards_lost`; final review follow-up below adds the signed live-style column and regression coverage.
Task 3: complete (commits 40d3869..0f79793, review clean)
Task 4: fix round 1/5 (2 addressed — nested kickoff/weather sanitization and market/pregame metadata validation; commits 387ffd0..49340c0)
Task 4: fix round 2/5 (1 addressed — scalar-only copied market metadata; commits 49340c0..18309a0)
Task 4: complete (commits 0f79793..18309a0, review clean)
Task 5: fix round 1/5 (2 addressed — historical source alias reconciliation and accepted-market-only matchup inputs; commits 8430895..99fd50f)
Task 5: complete (commits 18309a0..99fd50f, review clean)
Task 1: complete (commit 0b62f25856335bde706cdbd0a754605021d4197e, tests: node --test test/nflverse-team-client.test.js && npm test → focused 5/5 pass, full 24/24 pass)

## Final review follow-up

- Task 1 metadata-specific failure-test gap addressed: `test/nflverse-team-client.test.js` now verifies a failed public metadata response is rejected before reading the body, and malformed/missing branding schema is rejected.
- Task 3 fixture/source-shape gap addressed: weekly stats fixture now includes negative `sack_yards_lost` plus live `passing_interceptions` and `fumbles_lost_total` fields; the postgame regression covers negative live sack loss, defensive YPP, turnover aliases, and corrected values flowing into pregame net YPP.
- Identity metadata source gap addressed with the public nflverse `teams_colors_logos.csv` release. Branding joins by stable team ID plus exact abbreviation because historical aliases share IDs. Both source URLs and raw captures are preserved; identity normalization rejects missing requested metadata.
- Final focused tests (including pregame derivation): 38 passed. Final full suite: 67 passed. Live validation passed for 2005, 2010, 2015, 2020, and 2025 with no identity/postgame/pregame/matchup rejections; all 32 identities have all required metadata, and all accepted sample postgame rows have non-null YPP and turnover margin.
