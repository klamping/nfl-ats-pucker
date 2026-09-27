# nflverse Closing-Line Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement task-by-task.

**Goal:** Replace paid Pinnacle ingestion with a no-cost nflverse schedule download and normalized historical NFL closing-line dataset from 2005 onward.

**Architecture:** A source client downloads the public nflverse `games.csv` with no credential. A normalizer accepts only regular-season and postseason rows, preserves nflverse's documented home-team spread orientation, and emits explicit rejection records for incomplete market data. A CLI saves the raw CSV and accepted/rejected JSONL outputs.

**Tech stack:** Node.js 18+, CommonJS, built-in `fetch` and `node:test`, `csv-parse`, JSON Lines.

**Spec:** `docs/superpowers/specs/2026-09-26-nflverse-closing-line-ingestion-design.md`

## Global Constraints

- Use nflverse public schedule data as the sole historical market source.
- Treat `spread_line` as the closing spread, explicitly oriented to the home team.
- Do not use SportsGameOdds, Pinnacle, credentials, paid providers, scraping, or unverified odds data.
- Include 2005-onward `REG` and `POST` games only.
- Reject missing closing spreads; never impute a value.
- Preserve raw source data under an ignored directory and produce normalized data separately.
- Historical opening spreads and line movement are out of scope.
- Do not add a model, picks, or player/play-by-play features.

## File Structure

- `package.json` — replace paid ingestion scripts; add `csv-parse`.
- `src/nflverse-client.js` — download and parse public `games.csv`.
- `src/normalize-nflverse-game.js` — normalize or reject one schedule row.
- `src/ingest-nflverse-lines.js` — validation/range CLI, raw persistence, JSONL writing.
- `test/fixtures/nflverse-games.csv` — controlled CSV fixture.
- `test/nflverse-client.test.js`, `test/normalize-nflverse-game.test.js`, `test/ingest-nflverse-lines.test.js` — tests.
- `README.md` — no-cost setup, commands, data schema, and limitations.
- Remove the SportsGameOdds/Pinnacle source, normalizer, CLI, fixtures, and tests.

## Task 1: Download and Parse nflverse Schedules

**Files:**
- Modify: `package.json`
- Create: `src/nflverse-client.js`
- Create: `test/fixtures/nflverse-games.csv`
- Create: `test/nflverse-client.test.js`
- Delete: `src/config.js`, `src/sportsgameodds-client.js`, `test/config.test.js`, `test/sportsgameodds-client.test.js`

**Interface:**

```js
downloadNflverseGames(fetchImpl = globalThis.fetch)
// => Promise<{ csv, rows, retrievedAt, sourceUrl }>
```

`sourceUrl` must be `https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`.

- [ ] Write failing tests that verify a successful CSV download is parsed into rows, returns its raw text/source URL/ISO retrieval timestamp, sends no authentication, and rejects non-2xx responses before returning rows.
- [ ] Run `node --test test/nflverse-client.test.js`; confirm failure because the implementation does not exist.
- [ ] Add `csv-parse` and implement the client. Fetch the fixed URL with `accept: text/csv`; reject non-success statuses; parse headers and rows; reject malformed CSV. Do not read environment variables.
- [ ] Run `node --test test/nflverse-client.test.js`; expect pass.
- [ ] Commit:

```bash
git add package.json src/nflverse-client.js test/fixtures/nflverse-games.csv test/nflverse-client.test.js
git rm src/config.js src/sportsgameodds-client.js test/config.test.js test/sportsgameodds-client.test.js
git commit -m "feat: add nflverse schedule client"
```

## Task 2: Normalize Closing-Line Records

**Files:**
- Create: `src/normalize-nflverse-game.js`
- Create: `test/normalize-nflverse-game.test.js`
- Delete: `src/normalize-pinnacle.js`, `test/normalize-pinnacle.test.js`

**Interface:**

```js
normalizeNflverseGame(row, { retrievedAt, sourceUrl })
// => { accepted: ClosingLineGame } | { rejected: RejectedGame }
```

`ClosingLineGame` includes game ID, season/week/game type/kickoff, teams/scores, `closingSpreadHome`, `spreadOrientation: 'home_team'`, closing total, available spread prices, rest/context fields, source URL, and retrieval timestamp.

- [ ] Write failing tests that verify `spread_line` becomes numeric `closingSpreadHome` without sign inversion; `spreadOrientation` is `home_team`; `REG` and `POST` are accepted; `PRE` and other types reject with `unsupported_game_type`; and missing game identity, scores, teams, season, or spread rejects with a machine-readable reason.
- [ ] Run `node --test test/normalize-nflverse-game.test.js`; confirm failure.
- [ ] Implement normalization. Preserve source numeric values only; do not create opening-spread or line-movement fields. Include available `total_line`, spread odds, rest, venue, division, and weather fields without fabricating missing values.
- [ ] Run `node --test test/normalize-nflverse-game.test.js`; expect pass.
- [ ] Commit:

```bash
git add src/normalize-nflverse-game.js test/normalize-nflverse-game.test.js
git rm src/normalize-pinnacle.js test/normalize-pinnacle.test.js
git commit -m "feat: normalize nflverse closing lines"
```

## Task 3: CLI, Storage, and Documentation

**Files:**
- Create: `src/ingest-nflverse-lines.js`
- Create: `test/ingest-nflverse-lines.test.js`
- Modify: `package.json`, `README.md`
- Delete: `src/ingest-nfl-lines.js`, `test/ingest-nfl-lines.test.js`

**Interface:**

```js
runNflverseIngestion({ startSeason, endSeason, outputRoot, client })
// => Promise<{ fetchedRows, inRangeRows, accepted, rejected, rawPath }>
```

- [ ] Write failing tests that inject a fixture client and verify: inclusive range filtering; one raw CSV capture; separate, sorted accepted/rejected JSONL outputs; explicit missing-spread rejections; source timestamp metadata; and no normalized outputs after a failed source download.
- [ ] Run `node --test test/ingest-nflverse-lines.test.js`; confirm failure.
- [ ] Implement the workflow. Download once, filter inclusive season bounds, normalize every in-range row, sort records by `gameId`, and write raw files under `data/raw/nflverse/` using a retrieval timestamp filename. Write deterministic accepted/rejected JSONL filenames under `data/normalized/nfl/`. Download failures must occur before any writes.
- [ ] Implement CLI commands:
  - `npm run validate:market-data` validates only 2005, 2010, 2015, 2020, and 2025 and reports counts only.
  - `npm run ingest:market-data -- --start-season 2005 --end-season 2025` ingests an inclusive range.
- [ ] Replace README paid-provider setup with nflverse source attribution, home-team spread orientation, output paths, commands, sample-first workflow, missing-data behavior, and the absence of historical opening-line/line-movement fields.
- [ ] Run `npm test`; expect pass.
- [ ] Run `npm run validate:market-data`; inspect summaries for the five sample years before bulk ingest.
- [ ] Commit:

```bash
git add package.json README.md src/ingest-nflverse-lines.js test/ingest-nflverse-lines.test.js
git rm src/ingest-nfl-lines.js test/ingest-nfl-lines.test.js
git commit -m "feat: ingest nflverse closing lines"
```

## Review Checklist

- Download failures and malformed CSV must not replace normalized data.
- `spread_line` must always be labeled `home_team` orientation, including negative values.
- Missing market or identity fields must be rejected, never substituted.
- Only `REG` and `POST` rows can be accepted.
- Timestamp metadata must be present while JSONL record ordering remains deterministic.
- The codebase and README must contain no SportsGameOdds/Pinnacle/API-key dependency after migration.
