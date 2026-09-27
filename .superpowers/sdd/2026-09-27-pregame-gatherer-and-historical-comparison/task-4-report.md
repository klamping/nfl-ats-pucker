# Task 4 Report: Historical Similarity Comparator

## Status

Implemented and committed as Task 4. The comparator validates gathered snapshots, loads only the accepted historical matchup JSONL through the published manifest, applies same-game-type/week-window/spread-band and complete-feature filters, and ranks eligible games using normalized weighted distance contributions. The default window is Week 3's Weeks 2–5; callers can override it with start/end offsets. ATS outcomes use `homeScore - awayScore - closingSpreadHome`, including pushes. The CLI emits JSON and is read-only.

## Verification

- `node --test test/compare-historical.test.js` — 8 passed.
- `npm test` — 99 passed.
- `git diff --check` — passed.

## Concern

The brief did not specify a default spread-band width; the implementation selects and documents a three-point band. The normalized distance uses equal weights across 20 home/away feature deltas and spread, with each delta scaled by its maximum among the filtered candidate set.

## Review Finding Fix: Require Snapshot `gameId`

- Updated comparator snapshot validation to require a non-empty `input.gameId`.
- Added a regression test that deletes the snapshot ID and verifies validation rejects before the historical-matchup comparison starts.
- TDD evidence: the new test failed before the validation change (`Missing expected exception`), then passed after it.
- `node --test test/compare-historical.test.js` — 9 passed.
- `npm test` — 100 passed.
- `git diff --check` — passed.
