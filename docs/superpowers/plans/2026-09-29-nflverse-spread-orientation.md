# NFLverse Spread Orientation Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize nflverse historical spreads into the repository's conventional home-team betting orientation.

**Architecture:** Convert nflverse's source-oriented `spread_line` exactly once in `normalizeNflverseGame()` by negating it into `closingSpreadHome`. Downstream ATS, comparison, dashboard, and Odds API code keeps its current normalized contract; tests and README establish the source-versus-normalized distinction and prescribe rebuilding published data.

**Tech Stack:** Node.js 18+, CommonJS, `node:test`, `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-09-29-nflverse-spread-orientation-design.md`

## Global Constraints

- `closingSpreadHome` remains a conventional home-team spread: negative means home favored; positive means home underdog.
- nflverse `spread_line` is source-oriented: positive means home favored; negative means away favored.
- Do not alter The Odds API’s current home-spread convention or its consensus calculation.
- Do not add a raw source-spread field or mutate/delete immutable prior ingestion runs.
- Correct historical data only through a fresh market ingestion followed by team-data ingestion.

## Review Focus

- Positive nflverse source line: persist the negated home-team value; Task 1 adds normalizer and JSONL assertions.
- Negative nflverse source line: persist the negated home-team value; Task 1 adds a paired normalizer assertion.
- Missing/non-numeric source spread: preserve rejection rather than negating or defaulting it; Task 1 keeps explicit rejection coverage.
- Retrospective completed target: derive its nflverse market from the corrected normalized sign and never call Odds API; Task 2 adds assertions for both signs.
- Live upcoming target: retain The Odds API’s supplied conventional home sign; Task 2 retains and runs the existing live snapshot assertion.

---

### Task 1: Normalize and Persist the Corrected NFLverse Spread

**Files:**
- Modify: `src/normalize-nflverse-game.js:57-69`
- Modify: `test/normalize-nflverse-game.test.js:40-98`
- Modify: `test/ingest-nflverse-lines.test.js:56-99`

**Interfaces:**
- Consumes: raw nflverse game rows with `spread_line` using nflverse’s source sign convention.
- Produces: `normalizeNflverseGame(row, metadata)` accepted records with `closingSpreadHome` in conventional home-team betting orientation and `spreadOrientation: 'home_team'`.

- [ ] **Step 1: Update the normalizer tests to describe the source and normalized signs**

Replace the direct-copy expectation with `spread_line: '2.5'` producing `closingSpreadHome: -2.5`, and update the signed table-driven test to assert `'2.5' -> -2.5` and `'-3.5' -> 3.5`. Keep `spreadOrientation === 'home_team'` and the missing/non-numeric source-spread rejection cases.

- [ ] **Step 2: Run the normalizer test to verify it fails**

Run: `node --test test/normalize-nflverse-game.test.js`

Expected: FAIL because the implementation still copies `spread_line` without negating it.

- [ ] **Step 3: Negate the parsed NFLverse source line in `extractGame(row)`**

In `src/normalize-nflverse-game.js`, parse `row.spread_line` once and assign its negation to `closingSpreadHome` only when the parsed value is finite; retain the existing missing-spread validation behavior for blank and invalid values.

- [ ] **Step 4: Run the normalizer test to verify it passes**

Run: `node --test test/normalize-nflverse-game.test.js`

Expected: PASS.

- [ ] **Step 5: Assert the ingestion JSONL contract uses the corrected value**

In `test/ingest-nflverse-lines.test.js`, change the accepted persisted fixture expectation from `closingSpreadHome: 2.5` to `-2.5`; retain the source CSV capture assertion so the test distinguishes raw data from normalized output.

- [ ] **Step 6: Run the ingestion test to verify it passes**

Run: `node --test test/ingest-nflverse-lines.test.js`

Expected: PASS, including the accepted JSONL assertion for `-2.5`.

- [ ] **Step 7: Commit the source-boundary correction**

```bash
git add src/normalize-nflverse-game.js test/normalize-nflverse-game.test.js test/ingest-nflverse-lines.test.js
git commit -m "fix: normalize nflverse spread orientation"
```

### Task 2: Carry Corrected Signs into Retrospective Snapshots and Documentation

**Files:**
- Modify: `test/gather-pregame.test.js:145-165`
- Modify: `README.md:1-4, 43-45, 107-113`

**Interfaces:**
- Consumes: the Task 1 `normalizeNflverseGame()` contract and a completed retrospective target’s nflverse source row.
- Produces: retrospective `snapshot.closingSpreadHome` and `currentOdds.consensusSpreadHome` using conventional home-team signs; user-facing source convention and regeneration instructions.

- [ ] **Step 1: Update the retrospective gathering test for both source signs**

Change the retrospective fixture loop to use source values `[2.5, -4.5]` and expected normalized values `[-2.5, 4.5]`. Assert both `snapshot.closingSpreadHome` and `snapshot.currentOdds.consensusSpreadHome` equal the normalized expected value, while retaining assertions that no Odds API call or raw odds capture occurs.

- [ ] **Step 2: Run the retrospective gathering test to verify it passes**

Run: `node --test test/gather-pregame.test.js`

Expected: PASS after Task 1 because gathering already uses the normalizer. The existing live test remains a regression check that The Odds API home spread `-3` remains `-3`.

- [ ] **Step 3: Correct README source-orientation wording and regeneration guidance**

State that nflverse `spread_line` is positive for a home favorite and negative for an away favorite. State that the application negates it into `closingSpreadHome`, where negative means home favorite and positive means home underdog. In the historical-output and retrospective sections, distinguish source values from normalized values and instruct users to rerun market ingestion followed by team-data ingestion to correct published historical comparisons.

- [ ] **Step 4: Run focused regression tests**

Run: `node --test test/normalize-nflverse-game.test.js test/ingest-nflverse-lines.test.js test/gather-pregame.test.js`

Expected: PASS.

- [ ] **Step 5: Commit retrospective and documentation updates**

```bash
git add test/gather-pregame.test.js README.md
git commit -m "docs: clarify nflverse spread orientation"
```

### Task 3: Verify the Repository and Regenerate Local Research Data

**Files:**
- Modify: generated, ignored `data/raw/` and `data/normalized/` artifacts only when the operator chooses to rebuild local datasets.

**Interfaces:**
- Consumes: corrected market ingestion and existing team-data CLI commands.
- Produces: verified source code and, when local datasets are present, corrected published market/team-matchup manifests.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Check the working tree contains only intended tracked changes**

Run: `git status --short`

Expected: no unintended edits from this work; preserve pre-existing user changes and ignored/generated data.

- [ ] **Step 3: Regenerate local historical artifacts when the operator needs corrected comparisons**

Run:

```bash
npm run ingest:market-data -- --start-season 2005 --end-season 2025
npm run ingest:team-data -- --start-season 2005 --end-season 2025
```

Expected: new immutable normalized runs and updated manifests, with old immutable runs retained. Do not commit the ignored artifacts.

- [ ] **Step 4: Commit verification-only changes if any were deliberately added**

Do not create an empty commit. If no tracked files changed in this task, verification is complete after the successful commands.
