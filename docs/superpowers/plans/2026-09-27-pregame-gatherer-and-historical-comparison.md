# Pregame Gatherer and Historical Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gather an upcoming NFL matchup with a free current consensus spread and leakage-safe pregame features, then rank comparable historical matchups with ATS outcomes.

**Architecture:** A The Odds API client supplies current U.S. spread quotes, while existing public nflverse source/normalization modules build the target’s pregame features from completed prior games. The gatherer writes timestamped ignored snapshots; the comparator reads a snapshot and the historical matchup manifest to filter/rank candidates without modifying data.

**Tech Stack:** Node.js 18+, CommonJS, built-in `fetch`/`node:test`, `csv-parse`, JSON Lines.

**Spec:** `docs/superpowers/specs/2026-09-27-pregame-gatherer-and-historical-comparison-design.md`

## Global Constraints

- Use public nflverse and The Odds API only; no paid service, scraping, historical provider odds, player data, or play-by-play data.
- Read `theoddsapi` only from `~/Sites/.env`; never log, return, persist, or commit it.
- The Odds API is current/future U.S. `spreads` only; raw responses stay in ignored local storage.
- The current line is a median home-team consensus and must never be described as historical closing data.
- Target pregame features use completed games before kickoff only; no target-game leakage.
- Comparator is research-only: no picks, confidence labels, or writes.

## Review Focus

- A missing/blank API key or provider failure must not expose a key or create a snapshot; test in Task 1 and Task 3.
- A provider event with reversed teams, mismatched kickoff, or no valid home quotes must fail closed; test in Task 1.
- Same-week later or simultaneous games must not influence gathered pregame fields; test in Task 2.
- The default Week 3 window must be Weeks 2–5, while an explicit offset override is honored; test in Task 4.
- ATS grading must use `homeScore - awayScore - closingSpreadHome`, including pushes; test in Task 4.

---

## File Structure

- `src/odds-api-client.js` — loads the key safely, requests/matches current NFL spread events, and computes consensus.
- `src/gather-pregame.js` — resolves a target schedule game, builds target pregame records, writes raw/provider and JSON snapshots.
- `src/compare-historical.js` — validates snapshot input, loads historical matchup records, filters/ranks candidates, and grades ATS outcomes.
- `test/fixtures/odds-api-response.json` — provider response fixture with multiple books/quotes.
- `test/odds-api-client.test.js`, `test/gather-pregame.test.js`, `test/compare-historical.test.js` — coverage.
- `package.json`, `README.md` — CLI scripts and operating documentation.

## Task 1: Safe Current-Odds Client

**Files:**
- Create: `src/odds-api-client.js`
- Create: `test/fixtures/odds-api-response.json`
- Create: `test/odds-api-client.test.js`

**Interfaces:**

```js
loadTheOddsApiKey({ envPath = path.join(os.homedir(), 'Sites', '.env') } = {})
// => string

createOddsApiClient({ apiKey, fetchImpl = globalThis.fetch })
// => { fetchNflSpreads(): Promise<{ response, retrievedAt, source: 'the-odds-api' }> }

findConsensusHomeSpread({ response, target })
// => { provider, retrievedAt, contributingBooks, homeSpreads, consensusSpreadHome }
```

- [ ] Write failing tests for `theoddsapi` loading without leaking other `.env` values; API request construction for `americanfootball_nfl`, `us`, and `spreads`; median home spread; and clear rejection for reversed/mismatched events or invalid/no quotes.
- [ ] Run `node --test test/odds-api-client.test.js`; expect failure because the module does not exist.
- [ ] Implement safe `.env` parsing and the client. The provider requires query authentication; construct it only in-memory, redact it from errors/source metadata, and never save a request URL containing the key. Match canonical teams plus kickoff; median-sort finite home points.
- [ ] Run `node --test test/odds-api-client.test.js && npm test`; expect pass.
- [ ] Commit: `git add src/odds-api-client.js test/fixtures/odds-api-response.json test/odds-api-client.test.js && git commit -m "feat: add current odds client"`.

## Task 2: Target Pregame Feature Assembly

**Files:**
- Create: `src/gather-pregame.js`
- Create: `test/gather-pregame.test.js`

**Interfaces:**

```js
gatherPregame({ season, gameId, outputRoot, nflverseClient, oddsClient, fileSystem })
// => Promise<{ snapshot, snapshotPath, rawPaths }>
```

- [ ] Write failing tests with injected schedule, team-stat, identity, and odds clients. Assert the target resolves by ID; only final games earlier than target kickoff create historical postgame input; simultaneous/later games do not count; output has the exact historical matchup feature schema plus `currentOdds`; and failures write neither snapshot nor provider raw data.
- [ ] Run `node --test test/gather-pregame.test.js`; expect failure.
- [ ] Implement target resolution and reuse existing identity/postgame/pregame components. Validate target `REG`/`POST` kickoff, derive pregame snapshots from prior final games, request/match consensus odds, and choose the target home/away records. Write a unique raw provider JSON capture and timestamped `data/current/<gameId>-<timestamp>.json` only after all validation succeeds.
- [ ] Run `node --test test/gather-pregame.test.js && npm test`; expect pass.
- [ ] Commit: `git add src/gather-pregame.js test/gather-pregame.test.js && git commit -m "feat: gather upcoming pregame matchup"`.

## Task 3: Gatherer CLI and Documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/gather-pregame.js`
- Modify: `test/gather-pregame.test.js`

- [ ] Write a failing CLI test for `gather:pregame -- --season 2026 --game-id 2026_03_DAL_PHI`, required options, count-only/safe console output, and no secret exposure.
- [ ] Run the focused test; expect failure.
- [ ] Add `gather:pregame` CLI argument parsing and script. Document `theoddsapi` setup, no paid plan requirement, source/consensus semantics, output location, raw capture behavior, and failure modes.
- [ ] Run focused/full tests; use a mocked provider for CLI validation, not a real key.
- [ ] Commit: `git add package.json README.md src/gather-pregame.js test/gather-pregame.test.js && git commit -m "feat: add pregame gather command"`.

## Task 4: Historical Similarity Comparator

**Files:**
- Create: `src/compare-historical.js`
- Create: `test/compare-historical.test.js`
- Modify: `package.json`, `README.md`

**Interfaces:**

```js
compareHistorical({ input, historicalMatchups, weekWindow, spreadBand, limit })
// => { filters, candidates, summary }

runComparisonCli({ inputPath, output = console, fileSystem })
// => Promise<ComparisonResult>
```

- [ ] Write failing tests for valid snapshot validation; default Week 3 window of 2–5; explicit offsets; same-game-type/spread-band filtering; weighted normalized ranking with distance contributions; home ATS win/away ATS win/push grading; aggregates; no-candidate response; and read-only behavior.
- [ ] Run `node --test test/compare-historical.test.js`; expect failure.
- [ ] Implement comparison. Load only accepted historical matchup records from a manifest once; require finite selected features; normalize feature deltas against the filtered candidate set; sum documented weights for home and away features plus spread; sort ascending score; grade outcomes with `homeScore - awayScore - closingSpreadHome`.
- [ ] Add `compare:historical -- --input <snapshot>` script and README examples. Output machine-readable JSON to stdout without modifying datasets.
- [ ] Run `npm test`; expect pass.
- [ ] Commit: `git add src/compare-historical.js test/compare-historical.test.js package.json README.md && git commit -m "feat: compare historical matchups"`.

## Plan Self-Review

- **Spec coverage:** Task 1 handles key safety/current spreads; Task 2 creates leakage-safe snapshots; Task 3 exposes safe gathering; Task 4 filters/ranks historical records and grades ATS.
- **Type consistency:** Task 1 returns consensus consumed by Task 2; Task 2 writes the snapshot consumed by Task 4; Task 3 only wraps Task 2; Task 4 reads the existing historical manifest.
- **Review focus:** Credential/provider safety is Task 1/2; timing leakage is Task 2; default/override windows and ATS math are Task 4.
- **Scope:** No task adds historical provider odds, a paid plan, scraping, player/PBP data, training, picks, or confidence recommendations.
