# SportsGameOdds Pinnacle Line Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Node.js ingestion command that retrieves finalized NFL events from SportsGameOdds, selects Pinnacle opening and closing point spreads, and writes raw and normalized historical-market records.

**Architecture:** A small dependency-free CommonJS application separates credential loading and HTTP requests, provider-response normalization, and the CLI ingestion workflow. Fixtures drive unit tests without network access; an optional smoke command uses the locally stored API key only to verify the live provider contract before full collection.

**Tech Stack:** Node.js 18+ built-in `fetch`, `node:test`, CommonJS, JSON/JSON Lines files.

**Spec:** `docs/superpowers/specs/2026-09-26-sportsgameodds-pinnacle-ingestion-design.md`

## Global Constraints

- Read the SportsGameOdds API key from the `sportsgameodds` variable in `~/Sites/.env`.
- Do not copy the key into the repository, source code, committed configuration, generated reports, or logs.
- Begin with representative validation samples from 2005, 2010, 2015, 2020, and 2025 before full historical ingestion.
- Use Pinnacle as the only selected bookmaker.
- Preserve raw provider responses in an ignored local directory.
- Do not build prediction, picking, player, roster, or play-by-play features in this slice.

## Review Focus

- Missing or blank `sportsgameodds` variables must stop before any request is made; test in Task 1.
- API failures must not write a partial normalized dataset; test in Task 1 and Task 3.
- A response without a Pinnacle row or without both spreads must be emitted as an explicit rejected record, not silently accepted; test in Task 2.
- Home/away spread orientation must remain explicit and line movement must use the same team-side convention; test in Task 2.
- Re-running a bounded season import must produce deterministic output paths without overwriting a raw response from another request; test in Task 3.

---

## File Structure

- `package.json` — Node version, test script, and CLI scripts.
- `.gitignore` — excludes local raw API captures, normalized data, and local environment files.
- `src/config.js` — loads exactly one named variable from `~/Sites/.env`.
- `src/sportsgameodds-client.js` — creates finalized-event requests and validates HTTP/JSON responses without exposing credentials.
- `src/normalize-pinnacle.js` — converts a provider event into accepted normalized records or explicit rejection records.
- `src/ingest-nfl-lines.js` — CLI orchestration for a bounded date range, raw-response persistence, JSONL output, and sample validation mode.
- `test/fixtures/sportsgameodds-event.json` — sanitized representative provider payload.
- `test/config.test.js`, `test/sportsgameodds-client.test.js`, `test/normalize-pinnacle.test.js`, `test/ingest-nfl-lines.test.js` — unit and workflow tests.
- `README.md` — setup, validation sample, full-ingestion, and data-schema instructions.

### Task 1: Project Setup and Safe Provider Client

**Files:**
- Modify: `package.json`
- Create: `.gitignore`
- Create: `src/config.js`
- Create: `src/sportsgameodds-client.js`
- Create: `test/config.test.js`
- Create: `test/sportsgameodds-client.test.js`

**Interfaces:**
- Produces: `loadSportsGameOddsKey(envFilePath: string): string`
- Produces: `createSportsGameOddsClient(apiKey: string, fetchImpl?: typeof fetch): { fetchFinalizedNflEvents(filters: EventFilters): Promise<unknown> }`
- `EventFilters` contains `startsAfter`, `startsBefore`, and `cursor` strings plus optional `limit` number.

- [ ] **Step 1: Write failing configuration tests**

```js
test('loads the sportsgameodds key without returning other .env values', () => {
  assert.equal(loadSportsGameOddsKey(fixturePath), 'test-key');
});

test('rejects a missing or blank sportsgameodds variable', () => {
  assert.throws(() => loadSportsGameOddsKey(missingKeyFixture), /sportsgameodds/);
});
```

- [ ] **Step 2: Write failing provider-client tests**

```js
test('requests finalized NFL events with Pinnacle and no API key in the URL', async () => {
  await client.fetchFinalizedNflEvents({ startsAfter: '2025-09-01', startsBefore: '2026-02-20' });
  assert.match(capturedUrl, /leagueID=NFL/);
  assert.match(capturedUrl, /finalized=true/);
  assert.equal(capturedHeaders['x-api-key'], 'test-key');
  assert.doesNotMatch(capturedUrl, /test-key/);
});

test('rejects non-success responses before returning data', async () => {
  await assert.rejects(client.fetchFinalizedNflEvents(filters), /SportsGameOdds.*503/);
});
```

- [ ] **Step 3: Run the focused tests to verify they fail**

Run: `node --test test/config.test.js test/sportsgameodds-client.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement configuration and client interfaces**

Use Node’s `os.homedir()` to resolve `~/Sites/.env`; parse only `sportsgameodds` without logging values. Request `https://api.sportsgameodds.com/v2/events` with the key in the `x-api-key` header, NFL/finalized filters, and `bookmakerID=pinnacle`. Keep API query construction in this module so later code does not know request details.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `node --test test/config.test.js test/sportsgameodds-client.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/config.js src/sportsgameodds-client.js test/config.test.js test/sportsgameodds-client.test.js
git commit -m "feat: add SportsGameOdds client"
```

### Task 2: Pinnacle Spread Normalization

**Files:**
- Create: `src/normalize-pinnacle.js`
- Create: `test/fixtures/sportsgameodds-event.json`
- Create: `test/normalize-pinnacle.test.js`

**Interfaces:**
- Consumes: one finalized provider event from `fetchFinalizedNflEvents`.
- Produces: `normalizePinnacleEvent(event: unknown): { accepted?: NormalizedGame; rejected?: RejectedGame }`.
- `NormalizedGame` includes the fields specified in the design: provider event ID, game metadata, scores, Pinnacle open/close spreads and timestamps, explicit orientation, line movement, provider ID, and bookmaker ID.
- `RejectedGame` includes provider event ID, team/date metadata if present, and a machine-readable rejection reason.

- [ ] **Step 1: Write failing normalization tests from a sanitized fixture**

```js
test('normalizes Pinnacle opening and closing away-team spreads with explicit orientation', () => {
  const result = normalizePinnacleEvent(fixtureEvent);
  assert.equal(result.accepted.spreadTeam, fixtureEvent.awayTeam.name);
  assert.equal(result.accepted.openingSpread, 3.5);
  assert.equal(result.accepted.closingSpread, 2.5);
  assert.equal(result.accepted.lineMovement, -1);
});

test('rejects an event without Pinnacle or without both spreads', () => {
  assert.deepEqual(normalizePinnacleEvent(noPinnacleEvent).rejected.reason, 'missing_pinnacle_spread');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/normalize-pinnacle.test.js`

Expected: FAIL because `normalizePinnacleEvent` does not exist.

- [ ] **Step 3: Implement `normalizePinnacleEvent(event)` in `src/normalize-pinnacle.js`**

Use only the Pinnacle entry returned in `byBookmaker`. Normalize all spread values to the away-team perspective, retain source-provided open/close timestamps, and calculate `closingSpread - openingSpread`. Return a rejection object for missing required game or market fields; never substitute a consensus or another bookmaker.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test test/normalize-pinnacle.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize-pinnacle.js test/fixtures/sportsgameodds-event.json test/normalize-pinnacle.test.js
git commit -m "feat: normalize Pinnacle spread records"
```

### Task 3: Bounded Ingestion CLI, Sample Validation, and Documentation

**Files:**
- Create: `src/ingest-nfl-lines.js`
- Create: `test/ingest-nfl-lines.test.js`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadSportsGameOddsKey`, `createSportsGameOddsClient`, and `normalizePinnacleEvent`.
- Produces: `runIngestion({ season: number, startsAfter: string, startsBefore: string, outputRoot: string, client }): Promise<IngestionSummary>`.
- `IngestionSummary` includes counts of fetched, accepted, rejected, and raw-response files written.
- CLI commands: `npm run validate:market-data` for sample seasons and `npm run ingest:market-data -- --season YYYY` for one bounded season.

- [ ] **Step 1: Write failing ingestion tests**

```js
test('writes a uniquely named raw response and JSONL accepted/rejected outputs', async () => {
  const summary = await runIngestion({ season: 2025, outputRoot: tempDir, client: fixtureClient });
  assert.equal(summary.accepted, 1);
  assert.equal(summary.rejected, 1);
  assert.match(await readFile(rawPath, 'utf8'), /eventID/);
});

test('does not create normalized output when the provider client rejects', async () => {
  await assert.rejects(runIngestion({ season: 2025, outputRoot: tempDir, client: failingClient }));
  assert.equal(existsSync(normalizedPath), false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/ingest-nfl-lines.test.js`

Expected: FAIL because `runIngestion` does not exist.

- [ ] **Step 3: Implement the ingestion workflow and CLI**

Write each fetched raw response under `data/raw/sportsgameodds/nfl/<season>/` using a request-derived unique filename. Write accepted and rejected JSONL files separately under `data/normalized/nfl/`; leave both directories ignored. Require a successful complete provider response before creating normalized output. Add validation mode for the five specified sample seasons, with a concise count summary that never prints the API key.

- [ ] **Step 4: Document setup and API-contract smoke validation in `README.md`**

Document the required `~/Sites/.env` variable name, Node version, bounded sample-validation command, one-season ingestion command, output paths, normalized schema, and the procedure for inspecting a provider sample before the full 2005-onward collection. Do not include the API key or an example that embeds it.

- [ ] **Step 5: Run focused and full tests to verify they pass**

Run: `node --test`

Expected: PASS.

- [ ] **Step 6: Run the live sample validation command after the API key is available**

Run: `npm run validate:market-data`

Expected: a count summary for 2005, 2010, 2015, 2020, and 2025, with accepted/rejected records and no exposed credential. Stop before full ingestion if any sample does not return both Pinnacle opening and closing spreads.

- [ ] **Step 7: Commit**

```bash
git add package.json src/ingest-nfl-lines.js test/ingest-nfl-lines.test.js README.md
git commit -m "feat: add historical market ingestion CLI"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–3 cover credential protection, bounded API retrieval, raw-response retention, Pinnacle-only normalization, required normalized fields, sample validation, incomplete-data reporting, and the stated scope boundary.
- **Type consistency:** The client returns provider JSON; normalization returns accepted/rejected records; the ingestion workflow consumes both and returns `IngestionSummary`.
- **Review focus coverage:** Missing credentials and provider failures are tested in Task 1/3; required market fields and spread orientation in Task 2; deterministic raw output in Task 3.
- **Scope:** The plan excludes modeling and nflverse integration as required by the design.
