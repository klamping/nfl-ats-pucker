# nflverse Team Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public nflverse franchise identity, postgame team performance, leakage-safe pregame team features, and a market matchup join for 2005 onward.

**Architecture:** Download the public team metadata CSV and one weekly team-stat CSV per requested season. Normalize those sources against the published market-game records, resolve stable franchise identities, then derive pregame records in kickoff order before atomically publishing each accepted/rejected output pair. A separate matchup publisher joins only pregame records to market games.

**Tech Stack:** Node.js 18+, CommonJS, built-in `fetch`, `node:test`, `csv-parse`, JSON Lines.

**Spec:** `docs/superpowers/specs/2026-09-27-nflverse-team-data-design.md`

## Global Constraints

- Use only public nflverse sources; no credentials, paid data, web scraping, opening lines, player data, or play-by-play data.
- Support 2005 onward, regular season and postseason; reject preseason and unsupported types explicitly.
- Preserve raw downloaded sources locally under ignored `data/raw/nflverse/` paths.
- Publish identity, postgame, pregame, and matchup accepted/rejected pairs using immutable runs and one atomic manifest pointer per pair.
- Preserve a continuous `franchiseId` through relocations/rebrands, including `STL`/`LA`, `OAK`/`LV`, `SD`/`LAC`, and Washington aliases.
- Pregame features use only earlier completed games in the same season; no prior-season baseline or imputation.
- A record’s own postgame data must never be present in its pregame feature record or the matchup dataset.

## Review Focus

- A valid CSV missing required columns must fail before raw or normalized files are written; test in Task 1.
- A historical relocation alias must resolve to the same franchise as its later alias; test in Task 2.
- One missing, duplicate, or opponent-mismatched team-stat row must reject the game pair rather than yield partial facts; test in Task 3.
- A team’s week-N pregame values must exclude its week-N postgame result while postseason can include preceding regular season; test in Task 4.
- A failed output write or manifest publication must leave the prior accepted/rejected pair visible; test in Task 5.

---

## File Structure

- `src/nflverse-team-client.js` — downloads/parses current team metadata and per-season weekly team statistics.
- `src/franchise-aliases.js` — version-controlled canonical franchise IDs and relocation/rebrand aliases.
- `src/normalize-team-identity.js` — emits stable franchise identity records and a season/team lookup.
- `src/normalize-team-postgame.js` — pairs team-stat rows with market games, calculates core factual metrics, and rejects invalid pairs.
- `src/derive-team-pregame.js` — derives same-season, kickoff-ordered pregame features.
- `src/join-team-matchups.js` — adds home/away pregame objects to market games.
- `src/ingest-nflverse-team-data.js` — validates ranges, loads market manifests, coordinates all downloads/derivations, and atomically publishes pairs.
- `test/fixtures/nflverse-teams.csv`, `test/fixtures/nflverse-team-stats-2005.csv` — minimal source fixtures.
- `test/nflverse-team-client.test.js`, `test/normalize-team-identity.test.js`, `test/normalize-team-postgame.test.js`, `test/derive-team-pregame.test.js`, `test/join-team-matchups.test.js`, `test/ingest-nflverse-team-data.test.js` — regression coverage.
- `package.json`, `README.md` — commands and operator documentation.

## Task 1: Public Team Source Client

**Files:**
- Create: `src/nflverse-team-client.js`
- Create: `test/fixtures/nflverse-teams.csv`
- Create: `test/fixtures/nflverse-team-stats-2005.csv`
- Create: `test/nflverse-team-client.test.js`

**Interfaces:**

```js
downloadNflverseTeams(fetchImpl = globalThis.fetch)
// => Promise<{ csv, rows, sourceUrl, retrievedAt }>

downloadNflverseWeeklyTeamStats({ seasons, fetchImpl = globalThis.fetch })
// => Promise<Array<{ season, csv, rows, sourceUrl, retrievedAt }>>
```

- [ ] **Step 1: Write failing source-client tests**

Test the exact metadata URL and exact per-season URL pattern; assert `accept: text/csv`, no authentication header, source metadata, required-column validation, and a non-success or schedule-shaped-invalid response rejection before a result is returned.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `node --test test/nflverse-team-client.test.js`

Expected: FAIL because the source-client module does not exist.

- [ ] **Step 3: Implement source downloads and parsing**

Use `csv-parse/sync` with headers. Require metadata columns `season`, `team`, `nfl_team_id`, `full`, `location`, and `nickname`. Require weekly-stat columns `season`, `week`, `team`, `season_type`, `game_id`, `opponent_team`, `attempts`, `carries`, `passing_yards`, `rushing_yards`, `passing_epa`, `rushing_epa`, and `sacks_suffered`. Reject before returning parsed rows when any required column is absent.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/nflverse-team-client.test.js && npm test`

Expected: focused tests pass; note any unrelated baseline failure in the task report.

- [ ] **Step 5: Commit**

```bash
git add src/nflverse-team-client.js test/fixtures/nflverse-teams.csv test/fixtures/nflverse-team-stats-2005.csv test/nflverse-team-client.test.js
git commit -m "feat: add nflverse team source client"
```

## Task 2: Franchise Identity and Alias Resolution

**Files:**
- Create: `src/franchise-aliases.js`
- Create: `src/normalize-team-identity.js`
- Create: `test/normalize-team-identity.test.js`

**Interfaces:**

```js
buildTeamIdentity({ teamRows, startSeason, endSeason, sourceUrl, retrievedAt })
// => { accepted: FranchiseIdentity[], rejected: RejectedIdentity[], lookup: Map<string, FranchiseAlias> }
```

`lookup` keys are `<season>:<teamAlias>`. A `FranchiseIdentity` has `franchiseId`, `nflTeamId`, current identity metadata, and dated aliases. `FranchiseAlias` contains `franchiseId`, `teamAlias`, and the valid season.

- [ ] **Step 1: Write failing identity tests**

Assert source rows for `STL` in 2015 and `LA` in 2025 resolve to the same stable franchise ID, and likewise test one Raiders or Chargers transition. Assert missing/unknown aliases create machine-readable rejection records rather than a guessed franchise.

- [ ] **Step 2: Run focused test to verify failure**

Run: `node --test test/normalize-team-identity.test.js`

Expected: FAIL because the identity functions do not exist.

- [ ] **Step 3: Implement aliases and identity normalization**

Create a version-controlled alias table covering all 2005-onward team codes and explicit relocation/rebrand continuity. Validate the supplied `nfl_team_id` against the canonical franchise mapping. Group accepted seasonal source rows into one franchise identity record, preserve source metadata, and build the lookup map. Reject duplicates, conflicts, and missing required identity fields.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/normalize-team-identity.test.js && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/franchise-aliases.js src/normalize-team-identity.js test/normalize-team-identity.test.js
git commit -m "feat: normalize continuous team identities"
```

## Task 3: Postgame Team-Game Normalization

**Files:**
- Create: `src/normalize-team-postgame.js`
- Create: `test/normalize-team-postgame.test.js`

**Interfaces:**

```js
normalizeTeamPostgame({ marketGames, weeklyStats, franchiseLookup, sourceMetadata })
// => { accepted: TeamPostgame[], rejected: RejectedTeamPostgame[] }
```

Each accepted game produces two records, one per team. `TeamPostgame` includes `gameId`, season/week/type/kickoff, team/opponent/franchise IDs, points for/against, and core factual metrics. Compute offensive yards per play as `(passingYards - sackYardsLost + rushingYards) / (attempts + carries + sacksSuffered)` when its denominator is positive. Use the paired opponent row for defensive equivalents. Preserve raw source fields under `rawStats`.

- [ ] **Step 1: Write failing postgame tests**

Use one market game plus two team-stat rows. Assert exactly two records, correct points from the market game, correct offensive and opponent-derived defensive values, and source metadata. Add failures for one missing row, duplicate rows, mismatched opponent, unsupported `season_type`, and zero denominator.

- [ ] **Step 2: Run focused test to verify failure**

Run: `node --test test/normalize-team-postgame.test.js`

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Implement paired team-game normalization**

Index market games and weekly rows by game ID, validate both sides before accepting either side, resolve aliases through the Task 2 lookup, and emit a rejection record with a machine-readable reason for every invalid pair. Derive turnover margin from source fumbles/interceptions lost and opponent equivalents; retain absent or non-computable metric values as `null`, never invented values.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/normalize-team-postgame.test.js && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize-team-postgame.js test/normalize-team-postgame.test.js
git commit -m "feat: normalize team postgame statistics"
```

## Task 4: Leakage-Safe Pregame Features and Matchup Join

**Files:**
- Create: `src/derive-team-pregame.js`
- Create: `src/join-team-matchups.js`
- Create: `test/derive-team-pregame.test.js`
- Create: `test/join-team-matchups.test.js`

**Interfaces:**

```js
deriveTeamPregame(postgameRecords)
// => { accepted: TeamPregame[], rejected: RejectedTeamPregame[] }

joinTeamPregameToMarkets({ marketGames, pregameRecords })
// => { accepted: TeamMatchup[], rejected: RejectedTeamMatchup[] }
```

- [ ] **Step 1: Write failing feature and join tests**

Assert Week 1 metrics are `null`; Week 2 reflects only Week 1; a postseason game includes earlier regular-season results; and a later game never changes an earlier feature. Assert one matchup contains exactly one `homePregame` and one `awayPregame`, with no postgame fields, and rejects a missing/duplicate side.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `node --test test/derive-team-pregame.test.js test/join-team-matchups.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement ordered derivation and join**

Sort records by season, kickoff date/time, and game ID. Maintain per-franchise, per-season accumulators; emit the pregame snapshot before adding the current postgame record. Compute the exact core aggregates in the spec; set features to `null` when no prior valid games exist. Join records only on `gameId` and the market home/away teams, exposing pregame feature objects only.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/derive-team-pregame.test.js test/join-team-matchups.test.js && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/derive-team-pregame.js src/join-team-matchups.js test/derive-team-pregame.test.js test/join-team-matchups.test.js
git commit -m "feat: derive team pregame matchup features"
```

## Task 5: Team Data Ingestion, Atomic Publication, and Documentation

**Files:**
- Create: `src/ingest-nflverse-team-data.js`
- Create: `test/ingest-nflverse-team-data.test.js`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**

```js
runNflverseTeamIngestion({ startSeason, endSeason, outputRoot, client, fileSystem })
// => Promise<{ identity, postgame, pregame, matchup }>
```

The return values expose counts plus `rawPaths`, `manifestPath`, `acceptedPath`, and `rejectedPath` for their respective dataset. CLI commands are `validate:team-data` and `ingest:team-data`.

- [ ] **Step 1: Write failing workflow tests**

Inject fixture downloads and a fixture market manifest. Assert one raw identity capture plus one raw weekly-stat capture per season; four separate published accepted/rejected pairs; inclusive season filtering; exactly five validation seasons (2005, 2010, 2015, 2020, 2025); and previous published pairs survive a write or pointer-publication failure.

- [ ] **Step 2: Run focused test to verify failure**

Run: `node --test test/ingest-nflverse-team-data.test.js`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement orchestration and atomic pair publisher**

Load the existing market manifest once per requested range, download team metadata once and weekly stats once per requested season, write unique raw captures, then invoke Tasks 2–4. Reuse or extract the immutable-run plus atomic-manifest publication pattern without duplicating incompatible implementations. Publish predictable prefixes: `nflverse-team-identity-<start>-<end>`, `nflverse-team-postgame-<start>-<end>`, `nflverse-team-pregame-<start>-<end>`, and `nflverse-team-matchups-<start>-<end>`.

- [ ] **Step 4: Add CLI scripts and README documentation**

Add `npm run validate:team-data` and `npm run ingest:team-data -- --start-season 2005 --end-season 2025`. Document sources, no-credential setup, franchise continuity, all published pointers, core postgame versus pregame data, null early-season values, rejection behavior, and the requirement to ingest market data before the team matchup join.

- [ ] **Step 5: Run focused, full, and live sample validation**

Run: `npm test && npm run validate:team-data`

Expected: PASS. Inspect sample counts and accepted/rejected records for 2005, 2010, 2015, 2020, and 2025 before full ingestion.

- [ ] **Step 6: Commit**

```bash
git add src/ingest-nflverse-team-data.js test/ingest-nflverse-team-data.test.js package.json README.md
git commit -m "feat: ingest nflverse team data"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 implement public sources and continuous identity; Task 3 implements factual postgame rows; Task 4 implements leakage-safe features and the market join; Task 5 handles storage, publication, CLI, docs, and sample validation.
- **Type consistency:** Task 1 returns parsed source metadata; Task 2 produces the franchise lookup consumed by Task 3; Task 3 produces team-game records consumed by Task 4; Task 4 produces matchups published by Task 5.
- **Review focus coverage:** Source shape is tested in Task 1, relocation continuity in Task 2, invalid pairs in Task 3, leakage/timing in Task 4, and atomic publication in Task 5.
- **Scope:** No task adds a paid provider, web scraper, opening lines, player/PBP data, a model, picks, or a UI.
