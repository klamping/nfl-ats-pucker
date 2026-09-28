# Retrospective Current-Season Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the local comparison dashboard for a completed current-season game using its nflverse closing home spread and leakage-safe pregame team features.

**Architecture:** Extend the existing gatherer with an explicit retrospective mode rather than creating a second pipeline. A source-aware market metadata shape distinguishes live Odds API snapshots from retrospective nflverse closing-line snapshots; comparator validation and dashboard copy handle both sources without exposing raw market records.

**Tech Stack:** Node.js CommonJS, node:test, local loopback dashboard, nflverse schedule/team-stat clients.

**Spec:** `docs/superpowers/specs/2026-09-28-retrospective-dashboard-design.md`

## Global Constraints

- Retrospective mode supports only the active NFL season and targets already completed at invocation time.
- It uses the finite nflverse `spread_line` as the home-team closing spread: positive is home underdog; negative is home favorite.
- Target team features may use only completed games with kickoff strictly before target kickoff.
- Retrospective mode must not load credentials, instantiate/call The Odds API client, or write a raw odds capture.
- Live mode remains future-only and preserves its present Odds API validation and transactional raw-capture behavior.
- Dashboard remains loopback-only and must not expose raw market rows, provider URLs, credentials, or local file paths.

## Review Focus

- **Current-season boundary:** a completed prior-season target must reject even if its schedule row has a closing line; test in Task 2.
- **Future retrospective target:** a target after the injected clock must reject before any weekly-stat or odds work; test in Task 2.
- **No completed market:** absent final result/score or non-finite `spread_line` must reject without writing a snapshot; test in Task 2.
- **No live dependency:** retrospective CLI must work when credential loading and Odds API construction would throw; test in Task 3.
- **Source-specific snapshot validation:** a malformed nflverse market metadata object must reject while an existing live snapshot remains valid; test in Task 1.

---

### Task 1: Source-Aware Snapshot Market Validation

**Files:**
- Modify: `src/compare-historical.js:114-132`
- Modify: `src/dashboard-server.js:20-46`
- Modify: `public/dashboard/app.js:60-66`
- Test: `test/compare-historical.test.js`
- Test: `test/dashboard-server.test.js`
- Test: `test/dashboard-client.test.js`

**Interfaces:**
- Consumes: gathered snapshots with `currentOdds` market metadata.
- Produces: comparator acceptance for either a live `{ provider: 'the-odds-api', retrievedAt, contributingBooks, homeSpreads, consensusSpreadHome }` object or retrospective `{ provider: 'nflverse', retrievedAt, consensusSpreadHome }` object.

- [ ] **Step 1: Write failing validation and presentation tests**

Add tests proving an nflverse market object with a matching finite consensus line is accepted; missing/mismatched consensus is rejected; and the dashboard scope identifies nflverse closing-line data rather than books. Keep the existing live-provider validation case green.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test test/compare-historical.test.js test/dashboard-server.test.js test/dashboard-client.test.js`

Expected: FAIL because comparator accepts only `the-odds-api` and dashboard always renders book count.

- [ ] **Step 3: Implement source-aware market validation and safe dashboard projection**

Extract the `currentOdds` checks in `validateInput()` into a source-specific validator. Require `retrievedAt` and a matching finite consensus line for both sources; retain finite `homeSpreads` and a positive integer book count only for `the-odds-api`. Project only the safe fields needed by the dashboard, and branch scope copy on `provider`.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `node --test test/compare-historical.test.js test/dashboard-server.test.js test/dashboard-client.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compare-historical.js src/dashboard-server.js public/dashboard/app.js test/compare-historical.test.js test/dashboard-server.test.js test/dashboard-client.test.js
git commit -m "feat: support retrospective market snapshots"
```

### Task 2: Leakage-Safe Retrospective Gatherer

**Files:**
- Modify: `src/gather-pregame.js:13-121`
- Test: `test/gather-pregame.test.js`

**Interfaces:**
- Consumes: `gatherPregame({ season, gameId, retrospective: true, now, nflverseClient, fileSystem })`.
- Produces: a snapshot whose `closingSpreadHome` and `currentOdds` come from the target’s nflverse closing line; returns `{ snapshot, snapshotPath, rawPaths: [] }`.

- [ ] **Step 1: Write failing retrospective gatherer tests**

Build fixtures for a completed current-season target with a positive or negative `spread_line`. Assert that retrospective gathering produces a valid snapshot, preserves its home-team closing-line sign, writes no raw odds capture, derives target features from only earlier kickoff records, and never invokes an odds client. Add rejection cases for future, incomplete, line-less, and prior-season targets.

- [ ] **Step 2: Run the gatherer tests to verify they fail**

Run: `node --test test/gather-pregame.test.js`

Expected: FAIL because past targets are unconditionally rejected and an odds client is always required.

- [ ] **Step 3: Implement retrospective branching in `gatherPregame()`**

Add `retrospective = false` to the function options. In retrospective mode, require a completed target and finite schedule `spread_line`; construct the target market from that line while retaining featureless target score markers. Use an injected-clock `currentNflSeason(now)` helper (January/February belong to the prior NFL season) to reject non-current seasons. Skip odds-client validation/download and return no raw paths. Keep existing live control flow unchanged.

- [ ] **Step 4: Run the gatherer tests to verify they pass**

Run: `node --test test/gather-pregame.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gather-pregame.js test/gather-pregame.test.js
git commit -m "feat: gather retrospective pregame snapshots"
```

### Task 3: CLI and Game-Dashboard Retrospective Routing

**Files:**
- Modify: `src/gather-pregame.js:127-160`
- Modify: `src/run-game-dashboard.js:4-30`
- Test: `test/gather-pregame.test.js`
- Test: `test/run-game-dashboard.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `--retrospective` as a valueless flag alongside required `--season` and `--game-id` options.
- Produces: `npm run game:dashboard -- --season YYYY --game-id ID --retrospective` forwarding the flag to gather then launching the dashboard from the returned snapshot path.

- [ ] **Step 1: Write failing CLI and wrapper tests**

Assert the gather CLI accepts exactly one `--retrospective` flag, does not create/load an odds dependency in that mode, and rejects duplicates or a value after the flag. Assert the game-dashboard wrapper forwards the flag and still refuses dashboard launch when retrospective gathering fails.

- [ ] **Step 2: Run the CLI and wrapper tests to verify they fail**

Run: `node --test test/gather-pregame.test.js test/run-game-dashboard.test.js`

Expected: FAIL because both parsers currently accept only paired `--season`/`--game-id` options.

- [ ] **Step 3: Implement strict flag parsing and dependency selection**

Teach both parsers to recognize one valueless `--retrospective` flag, preserve strict validation for all other options, and forward it as `retrospective: true`. In gather CLI, defer credential loading and Odds API client construction unless live mode is selected. Document one live and one retrospective dashboard command plus the closing-line/no-line-movement limitation.

- [ ] **Step 4: Run the CLI and wrapper tests to verify they pass**

Run: `node --test test/gather-pregame.test.js test/run-game-dashboard.test.js`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test && git diff --check`

Expected: all tests pass and no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add src/gather-pregame.js src/run-game-dashboard.js test/gather-pregame.test.js test/run-game-dashboard.test.js README.md
git commit -m "feat: launch retrospective game dashboards"
```
