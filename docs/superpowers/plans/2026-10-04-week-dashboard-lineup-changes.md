# Weekly Dashboard Lineup Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gather official NFL availability/transactions and projected depth-chart changes during a weekly-dashboard build, then display safe, labeled team context for every game.

**Architecture:** Add independently testable source clients/parsers for NFL.com and Ourlads, then a lineup-context service that persists immutable raw captures and normalized per-team snapshots. The weekly CLI invokes that service once per unique slate team and passes its safe results into the existing weekly server, which projects them through `/api/slate` for local rendering.

**Tech Stack:** Node.js 18 CommonJS, built-in `fetch`/`fs/promises`/`path`, `node:test`, `cheerio` for fixture-backed HTML parsing, existing built-in `http` server, static HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-04-week-dashboard-lineup-changes-design.md`

## Global Constraints

- NFL.com current injury rows are labeled as official statuses observed at build time; do not invent individual publication dates.
- Include only NFL.com transaction records dated in the 14 calendar days before the build clock.
- Ourlads is a projected depth chart; compare only rank-one and rank-two players at each position.
- Collect context before the weekly server listens; the browser never requests either external source.
- Source failures are per-team/per-source and must not make an otherwise successful game unavailable or overwrite a prior valid snapshot.
- Capture raw source responses and normalized snapshots locally only; never expose raw HTML, paths, request details, or provider URLs in the API.
- The feature is informational only: no pick, confidence, ranking, or automatic player-impact inference.

## Review Focus

- An NFL.com transaction exactly 14 days old is included, while one 14 days plus one millisecond old is excluded; Task 1 adds boundary assertions.
- A source document that omits a required team/player/position field fails closed rather than producing a partial trusted record; Task 1 adds malformed-fixture cases.
- A same-timestamp or future snapshot is never selected as a depth-chart baseline; Task 2 adds selection tests.
- Two games involving one team invoke lineup gathering once and share the resulting context; Task 3 adds a duplicate-team orchestration test.
- The serialized slate never leaks an Ourlads/NFL.com URL, raw capture path, or source error internals; Task 4 adds a forbidden-string API assertion.

---

## File map

| File | Responsibility |
| --- | --- |
| `package.json` | Add `cheerio` as the HTML parser dependency. |
| `src/nfl-lineup-client.js` | Download the official NFL.com injury/transaction documents and parse/filter normalized official entries. |
| `src/ourlads-depth-chart-client.js` | Map nflverse aliases to Ourlads codes, download one team chart, and parse rank-one/rank-two slots. |
| `src/lineup-context.js` | Persist captures/snapshots, select the prior valid snapshot, diff depth slots, and isolate source failures per team. |
| `src/week-dashboard.js` | Gather lineup context once per unique target team and pass it to the server. |
| `src/week-dashboard-server.js` | Safely project per-game home/away lineup context into the slate payload. |
| `public/week-dashboard/index.html` | Add a labeled Lineup changes table column/region. |
| `public/week-dashboard/app.js` | Render official/current statuses, 14-day transactions, projected changes, baseline, and unavailable states as text. |
| `README.md` | Document the sources, timing, baseline behavior, and failure semantics. |
| `test/fixtures/nfl-lineup-*.html` | Static source documents for NFL.com parser tests. |
| `test/fixtures/ourlads-depth-chart-*.html` | Static source documents for Ourlads parser tests. |
| `test/nfl-lineup-client.test.js` | NFL.com download, strict parsing, team filtering, build-time injury labeling, and transaction-window tests. |
| `test/ourlads-depth-chart-client.test.js` | Alias mapping, strict depth-slot parsing, and HTTP failure tests. |
| `test/lineup-context.test.js` | Capture persistence, baseline selection, rank-one/rank-two diffs, and failure isolation tests. |
| `test/week-dashboard.test.js` | Weekly orchestration and once-per-team lineup gathering tests. |
| `test/week-dashboard-server.test.js` | Safe lineup API projection tests. |
| `test/week-dashboard-client.test.js` | Labeled client rendering tests. |

### Task 1: Add strict source clients and fixture-backed parsers

**Files:**
- Modify: `package.json`
- Create: `src/nfl-lineup-client.js`
- Create: `src/ourlads-depth-chart-client.js`
- Create: `test/fixtures/nfl-lineup-injuries.html`
- Create: `test/fixtures/nfl-lineup-transactions.html`
- Create: `test/fixtures/ourlads-depth-chart-ARI.html`
- Create: `test/nfl-lineup-client.test.js`
- Create: `test/ourlads-depth-chart-client.test.js`

**Interfaces:**
- Produces `createNflLineupClient({ fetchImpl, now })`, with `fetchOfficial({ team, now })` returning `{ source: 'nfl.com', retrievedAt, injuries, transactions, rawCaptures }`.
- Produces `createOurladsDepthChartClient({ fetchImpl, now })`, with `fetchDepthChart({ team })` returning `{ source: 'ourlads', retrievedAt, sourceUpdatedAt, slots, rawCapture }`.
- `injuries` contain `{ player, position, status, observedAt }`; `transactions` contain `{ date, player, position, detail }`; `slots` contain `{ position, rank: 1 | 2, player }`.

- [ ] **Step 1: Add failing NFL.com client/parser tests and source fixtures**

```js
test('returns current official injury statuses and only team transactions in the 14-day window', async () => {
  const client = createNflLineupClient({ fetchImpl: fixtureFetch, now: () => new Date('2026-10-04T12:00:00Z') });
  const result = await client.fetchOfficial({ team: 'ARI' });
  assert.deepEqual(result.injuries, [{ player: 'Example Player', position: 'QB', status: 'Questionable', observedAt: '2026-10-04T12:00:00.000Z' }]);
  assert.deepEqual(result.transactions, [{ date: '2026-09-20', player: 'Example Player', position: 'QB', detail: 'Signed' }]);
});
```

Include boundary, malformed-markup, non-OK response, and unmapped-team assertions. Use fixture HTML that mirrors the selectors/data attributes actually present in current NFL.com injury and transaction pages.

- [ ] **Step 2: Run the NFL client tests to verify they fail**

Run: `node --test test/nfl-lineup-client.test.js`

Expected: FAIL because `src/nfl-lineup-client.js` does not exist.

- [ ] **Step 3: Add `cheerio` and implement `createNflLineupClient`**

Use exact NFL.com report URLs for the requested/current report and all transaction categories necessary to cover the current and preceding calendar month. Fetch with an HTML `Accept` header, reject non-OK/empty responses, retain each `{ sourceUrl, body }` as a raw capture, parse only expected structural selectors, map official abbreviations to nflverse aliases, and filter transactions with inclusive UTC calendar-date boundaries. Fail if a requested team cannot be uniquely parsed; do not synthesize dates for injury entries.

- [ ] **Step 4: Run the NFL client tests to verify they pass**

Run: `node --test test/nfl-lineup-client.test.js`

Expected: PASS.

- [ ] **Step 5: Add failing Ourlads client/parser tests and source fixture**

```js
test('maps nflverse aliases and retains only the first two players per depth position', async () => {
  const result = await createOurladsDepthChartClient({ fetchImpl: fixtureFetch }).fetchDepthChart({ team: 'LA' });
  assert.deepEqual(result.slots, [
    { position: 'QB', rank: 1, player: 'Starter Name' },
    { position: 'QB', rank: 2, player: 'Backup Name' },
  ]);
});
```

Cover the Rams `LA` → `RAM` URL mapping, no-third-string leakage, missing update/slot markup, and non-OK source responses.

- [ ] **Step 6: Run the Ourlads client tests to verify they fail**

Run: `node --test test/ourlads-depth-chart-client.test.js`

Expected: FAIL because `src/ourlads-depth-chart-client.js` does not exist.

- [ ] **Step 7: Implement `createOurladsDepthChartClient`**

Define the complete current nflverse-alias-to-Ourlads-code map in `src/ourlads-depth-chart-client.js`. Request exactly `https://www.ourlads.com/nfldepthcharts/depthchart/<code>`, parse its reported update timestamp and offense/defense/special-team depth rows with Cheerio, normalize player display names, and retain only nonempty rank-one/rank-two cells. Require at least one valid slot and a valid source update timestamp.

- [ ] **Step 8: Run focused and full tests, then commit**

Run: `node --test test/nfl-lineup-client.test.js test/ourlads-depth-chart-client.test.js && npm test`

Expected: PASS.

```bash
git add package.json package-lock.json src/nfl-lineup-client.js src/ourlads-depth-chart-client.js test/fixtures/nfl-lineup-injuries.html test/fixtures/nfl-lineup-transactions.html test/fixtures/ourlads-depth-chart-ARI.html test/nfl-lineup-client.test.js test/ourlads-depth-chart-client.test.js
git commit -m "feat: add lineup source clients"
```

### Task 2: Persist and diff per-team lineup snapshots

**Files:**
- Create: `src/lineup-context.js`
- Create: `test/lineup-context.test.js`

**Interfaces:**
- Consumes `nflClient.fetchOfficial({ team, now })` and `depthChartClient.fetchDepthChart({ team })` from Task 1.
- Produces `gatherLineupContext({ team, outputRoot, fileSystem, now, nflClient, depthChartClient })` resolving to `{ team, official, depthChart }`.
- `official` is `{ status, source: 'nfl.com', retrievedAt, injuries, transactions }`; `depthChart` is `{ status, source: 'ourlads', retrievedAt, sourceUpdatedAt, baseline, changes }`.

- [ ] **Step 1: Write failing persistence, baseline, and diff tests**

```js
test('writes successful source captures, compares rank one and two to the latest earlier snapshot, and reports entrants/removals', async () => {
  const result = await gatherLineupContext({ team: 'ARI', outputRoot: ROOT, fileSystem, now, nflClient, depthChartClient });
  assert.deepEqual(result.depthChart.changes, [
    { position: 'QB', rank: 1, outgoingPlayer: 'Old Starter', incomingPlayer: 'New Starter' },
    { position: 'WR', rank: 2, outgoingPlayer: null, incomingPlayer: 'New Reserve' },
  ]);
});
```

Add tests for initial baseline (`baseline: 'unavailable'`, no changes), same/future timestamp exclusion, unchanged slots, rank-three non-effect, a source failure leaving the other source usable, and a write failure preserving the preexisting latest snapshot.

- [ ] **Step 2: Run the context tests to verify they fail**

Run: `node --test test/lineup-context.test.js`

Expected: FAIL because `src/lineup-context.js` does not exist.

- [ ] **Step 3: Implement `gatherLineupContext` and its pure helpers**

Write raw source bodies to `data/raw/lineups/<team>/<timestamp>-<source>-capture.html` and normalized snapshots to `data/current/lineups/<team>-<timestamp>.json`, using a unique timestamp suffix pattern consistent with `gather-pregame.js`. Read candidate snapshots only from that team’s directory, validate their normalized shape, and select the latest `retrievedAt` strictly before the new depth capture. Build changes from the union of `(position, rank)` keys, sorted position then rank. Write a source snapshot only after its raw captures and normalization have succeeded. Represent expected source errors as that source’s `{ status: 'unavailable' }`, without swallowing programmer/filesystem contract errors.

- [ ] **Step 4: Run the context tests to verify they pass**

Run: `node --test test/lineup-context.test.js`

Expected: PASS.

- [ ] **Step 5: Run full tests and commit**

Run: `npm test`

Expected: PASS.

```bash
git add src/lineup-context.js test/lineup-context.test.js
git commit -m "feat: persist and diff lineup context"
```

### Task 3: Add lineup gathering to weekly orchestration

**Files:**
- Modify: `src/week-dashboard.js`
- Modify: `test/week-dashboard.test.js`

**Interfaces:**
- Consumes `gatherLineupContext({ team, outputRoot, now, ... })` from Task 2.
- Extends `runWeekDashboardCli(argv, output, dependencies)` with injectable `gatherLineupContext` and `lineupDependencies`.
- Passes each successful game to `createWeekDashboardServer` as `{ ...snapshot, lineup: { home, away } }`.

- [ ] **Step 1: Write failing weekly orchestration tests**

```js
test('gathers lineup context once per unique slate team before serving and preserves a game when a lineup source is unavailable', async () => {
  await runWeekDashboardCli(argv, output, { gatherPregame, gatherLineupContext, createWeekDashboardServer, now });
  assert.deepEqual(lineupTeams.sort(), ['AWY', 'HME']);
  assert.equal(serverOptions.games[0].lineup.home.official.status, 'unavailable');
  assert.equal(serverOptions.games[0].gameId, 'future');
});
```

Use two scheduled games sharing a team to prove deduplication; verify lineup gathering runs after target filtering and before server creation. Verify a rejected/unsupported schedule row produces no lineup call.

- [ ] **Step 2: Run the weekly tests to verify they fail**

Run: `node --test test/week-dashboard.test.js`

Expected: FAIL because no lineup context is gathered or passed through.

- [ ] **Step 3: Extend `runWeekDashboardCli`**

After targets are resolved, create one promise/result per unique home/away alias with `gatherLineupContext`; await and memoize it before entering ordinary per-game gather work. Convert a thrown team-level lineup gather into a fully unavailable `{ official, depthChart }` context for that team, then attach the home/away contexts to every successful `snapshot`. Preserve existing schedule download counts, retrospective/live decisions, game failure isolation, and server options for callers that do not inject lineup dependencies.

- [ ] **Step 4: Run focused and full tests, then commit**

Run: `node --test test/week-dashboard.test.js && npm test`

Expected: PASS.

```bash
git add src/week-dashboard.js test/week-dashboard.test.js
git commit -m "feat: gather weekly lineup context"
```

### Task 4: Safely expose lineup context through the weekly slate API

**Files:**
- Modify: `src/week-dashboard-server.js`
- Modify: `test/week-dashboard-server.test.js`

**Interfaces:**
- Consumes each snapshot’s `lineup: { home, away }` from Task 3.
- Produces a `lineup` slate field with `{ home, away }`, each containing only `{ team, official, depthChart }` safe projections.

- [ ] **Step 1: Write failing server projection tests**

```js
assert.deepEqual(slate.games[0].lineup.home, {
  team: 'HME',
  official: { status: 'ready', source: 'nfl.com', retrievedAt: '2026-10-04T12:00:00.000Z', injuries: [{ player: 'Example', position: 'QB', status: 'Questionable', observedAt: '2026-10-04T12:00:00.000Z' }], transactions: [] },
  depthChart: { status: 'ready', source: 'ourlads', retrievedAt: '2026-10-04T12:00:00.000Z', sourceUpdatedAt: '2026-10-04T11:00:00.000Z', baseline: 'available', changes: [] },
});
```

Include unavailable-source contexts and assert the serialized response excludes fixture raw HTML, source URLs, capture paths, and caught-error text.

- [ ] **Step 2: Run the server tests to verify they fail**

Run: `node --test test/week-dashboard-server.test.js`

Expected: FAIL because the slate row has no lineup projection.

- [ ] **Step 3: Add `projectLineupContext` and integrate it into `projectSlateGame`**

Validate/clone only the Task 2 safe fields. If legacy tests/callers omit lineup data, return deterministic unavailable contexts for both teams rather than throwing or changing the game’s ready status. Never serialize raw capture objects, paths, source URLs, stack traces, or arbitrary extra keys.

- [ ] **Step 4: Run focused and full tests, then commit**

Run: `node --test test/week-dashboard-server.test.js && npm test`

Expected: PASS.

```bash
git add src/week-dashboard-server.js test/week-dashboard-server.test.js
git commit -m "feat: expose safe weekly lineup context"
```

### Task 5: Render labeled lineup changes in the slate dashboard

**Files:**
- Modify: `public/week-dashboard/index.html`
- Modify: `public/week-dashboard/app.js`
- Modify: `public/dashboard/styles.css`
- Modify: `test/week-dashboard-client.test.js`

**Interfaces:**
- Consumes the `game.lineup.home` and `game.lineup.away` API projection from Task 4.
- Produces text-only DOM content with source/status labels; no browser-side external request.

- [ ] **Step 1: Write failing client rendering tests**

```js
assert.match(elements['slate-body'].textContent,
  /Official — NFL\.com.*Current status as of build.*Questionable.*Transactions \(14 days\).*Projected depth chart — Ourlads.*QB starter: Old Starter → New Starter/);
assert.match(elements['slate-body'].textContent, /No prior depth chart baseline/);
assert.match(elements['slate-body'].textContent, /Official source unavailable/);
```

Use API fixture data with a ready team, initial-baseline team, and unavailable source. Assert that the only fetch remains `/api/slate`, that all dynamic text is assigned via `textContent`, and that no pick/confidence wording appears in lineup content.

- [ ] **Step 2: Run the client test to verify it fails**

Run: `node --test test/week-dashboard-client.test.js`

Expected: FAIL because the markup and renderer do not consume lineup data.

- [ ] **Step 3: Add the accessible lineup area and renderer helpers**

Add a “Lineup changes” column or a linked semantically labeled detail row per game that keeps the slate table keyboard-usable. Render each team’s `Official — NFL.com` section with “Current status as of build” for injuries and “Transactions (14 days)” for transactions. Render `Projected depth chart — Ourlads` separately, formatting rank one as “starter” and rank two as “second string,” followed by outgoing/incoming names. Render explicit no-change, no-baseline, and unavailable states. Use existing `element()`/`textContent` construction only; do not use `innerHTML`.

- [ ] **Step 4: Run focused and full tests, then commit**

Run: `node --test test/week-dashboard-client.test.js && npm test`

Expected: PASS.

```bash
git add public/week-dashboard/index.html public/week-dashboard/app.js public/dashboard/styles.css test/week-dashboard-client.test.js
git commit -m "feat: render weekly lineup changes"
```

### Task 6: Document build-time lineup context and verify the workflow

**Files:**
- Modify: `README.md`
- Modify: `test/week-dashboard.test.js`

**Interfaces:**
- Documents the completed `npm run week:dashboard -- --season YYYY --week N` contract from Tasks 1–5.

- [ ] **Step 1: Add a failing CLI-level workflow test**

```js
test('waits for lineup gathering before printing the local dashboard URL', async () => {
  // Hold the injected lineup promise; assert no URL is logged until it resolves.
});
```

- [ ] **Step 2: Run the weekly test to verify it fails or exposes a timing gap**

Run: `node --test test/week-dashboard.test.js`

Expected: FAIL until the URL logging is demonstrably sequenced after lineup context completion.

- [ ] **Step 3: Make any minimal sequencing correction and update the README**

Document the NFL.com/Ourlads source labels, current injury status “as of build” semantics, 14-day transaction filter, first-/second-string comparison baseline, local-only captures, first-run baseline state, and per-source failure isolation. Do not claim that either source proves a complete roster-health picture or affects recommendations.

- [ ] **Step 4: Run the complete verification suite and commit**

Run: `npm test && git diff --check`

Expected: PASS with no whitespace errors.

```bash
git add README.md test/week-dashboard.test.js src/week-dashboard.js
git commit -m "docs: explain weekly lineup context"
```

## Self-review

- **Spec coverage:** Tasks 1–2 implement source capture, normalization, dated/undated semantics, persistence, baseline selection, and failure behavior. Task 3 implements build-time slate integration. Task 4 protects the API boundary. Task 5 implements labeled dashboard states. Task 6 documents and verifies the end-to-end sequencing. No gaps found.
- **Step scan:** Every task has a focused failing test, a failing run, one named implementation unit, a passing run, and a commit. No implementation body is prescribed where fixtures/signatures determine it.
- **Type consistency:** The source client result fields feed `gatherLineupContext`, which feeds snapshot `lineup.home/away`, then `projectLineupContext`, then the browser’s `game.lineup.home/away` renderer.
- **Review focus:** Boundary dates, strict parsing, baseline ordering, duplicate-team fan-out, and API leakage each have named tests in Tasks 1–5.
- **Proportion:** The plan specifies boundaries and contracts without encoding parser/diff implementations line-by-line.
