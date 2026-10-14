# NFLelo Game-Detail Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display current NFLelo game projections and team ratings on local game-detail dashboards without changing analysis or recommendation behavior.

**Architecture:** A focused server-side NFLelo module downloads and validates the two public CSV exports once per dashboard-server start, then produces a minimal safe context for each target snapshot. Both standalone and weekly dashboard servers attach that context to their existing comparison payloads. The browser renders a responsive text/table card from that safe contract, including an explicit unavailable state.

**Tech Stack:** Node.js 18 CommonJS, built-in `node:test`, `csv-parse/sync`, native `fetch`, vanilla browser JavaScript/CSS.

**Spec:** `docs/superpowers/specs/2026-10-14-nfelo-game-detail-context-design.md`

## Global Constraints

- Fetch `elo_snapshot.csv` and `nfelo_games.csv` once, concurrently, on each dashboard server startup; never fetch NFLelo from the browser.
- Use only current target-game/team context; historical tracker/result exports and the weekly-slate UI are out of scope.
- NFLelo failures are best effort: network, schema, matching, and validation failures must not stop a dashboard or hide an otherwise ready game.
- Use existing franchise alias definitions to require unambiguous home/away franchise matches; never guess identities or values.
- Permit only finite numeric projection/rating values and select team ratings from the target season at or before its week.
- API responses must exclude raw CSVs/rows, source URLs, filesystem paths, arbitrary upstream errors, and unrelated NFLelo columns.
- Preserve the negative-home-spread-is-home-favored convention and label NFLelo as third-party informational context, not a pick, confidence input, or ranking input.
- Keep CommonJS style and use Node’s built-in test runner; run `npm test` before completion.

## Review Focus

- Non-OK/throwing fetch for either CSV yields one safe unavailable context and the normal dashboard still starts — Task 1 and Task 2.
- An NFLelo `OAK`/`SD` identifier against an NFLverse `LV`/`LAC` target resolves only through a known franchise alias, not textual coincidence — Task 1.
- Duplicate or reverse-side game rows cannot silently select the wrong matchup — Task 1.
- A rating from a later week, a different season, or a non-finite numeric field is not displayed as current context — Task 1.
- Serialized responses and static assets never leak NFLelo URLs, raw CSV text, raw columns, or injected upstream-error text — Task 2 and Task 3.

---

### Task 1: NFLelo startup data and safe context module

**Files:**
- Create: `src/nfelo-client.js`
- Create: `test/nfelo-client.test.js`

**Interfaces:**
- Consumes: `fetchImpl(url)` returning a Fetch-compatible response; `now()` returning a valid `Date`; `findFranchiseAliasAnySeason(teamAlias)` from `src/franchise-aliases.js`.
- Produces: `loadNfeloData({ fetchImpl, now }) -> Promise<{ retrievedAt, games, ratings }>` for server-only use; `buildNfeloContext({ input, nfeloData }) -> NfeloContext` for safe payload attachment.
- `NfeloContext` is either `{ status: 'ready', retrievedAt, projection: { homeSpread, awaySpread, homeWinProbability, homeCoverProbability, awayCoverProbability, marketDifference }, teams: { home: TeamRating, away: TeamRating } }` or `{ status: 'unavailable', reason: 'source_unavailable' | 'invalid_data' | 'game_unavailable' | 'team_unavailable' }`; `TeamRating` contains exactly `team`, `nfelo`, `base`, `qbAdjustment`, and `pointsVsAverage`.

- [ ] **Step 1: Write failing unit tests for successful concurrent source loading and target projection**

In `test/nfelo-client.test.js`, inject a fetch double serving minimal `elo_snapshot.csv` and `nfelo_games.csv` fixtures. Assert both URLs are requested before either is awaited, `retrievedAt` is deterministic, a `2026_03_CHI_PHI` target produces exactly the safe ready contract, `nfelo_home_line_close` is the home spread, the away spread is its negation, and `marketDifference` is `homeSpread - input.currentOdds.consensusSpreadHome`.

- [ ] **Step 2: Run the new unit test to verify it fails**

Run: `node --test test/nfelo-client.test.js`

Expected: FAIL because `src/nfelo-client.js` does not exist.

- [ ] **Step 3: Implement `loadNfeloData({ fetchImpl = globalThis.fetch, now = () => new Date() })` and `buildNfeloContext({ input, nfeloData })` in `src/nfelo-client.js`**

Use `csv-parse/sync` with `columns: true` and fail the load on non-OK responses, parse failures, missing required headers, or invalid row shapes. Start both fixed raw GitHub CSV requests with `Promise.all`; retain parsed internal rows only. Normalize source and target aliases through `findFranchiseAliasAnySeason`, select exactly one same-season/week/home/away game row, select each team’s latest valid target-season rating at or before the target week, and return only the allow-listed safe fields above. Catch no exception inside the pure projection function; callers convert any loader failure to the fixed unavailable context.

- [ ] **Step 4: Add failing-path and identity tests**

Add tests that assert: one non-OK/throwing source request rejects `loadNfeloData`; malformed CSV/header and non-finite required value reject it; an `OAK` source row matches a `LV` target through the franchise alias; reverse-side or duplicate matching game rows return `game_unavailable`; later-week/different-season/missing ratings return `team_unavailable`; and a ready context does not include URL, raw-row, or unallowlisted properties.

- [ ] **Step 5: Run the focused NFLelo module tests**

Run: `node --test test/nfelo-client.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the NFLelo data module**

```bash
git add src/nfelo-client.js test/nfelo-client.test.js
git commit -m "feat: load NFLelo game context"
```

### Task 2: Attach best-effort NFLelo context at dashboard startup

**Files:**
- Modify: `src/dashboard-server.js:23-96,173-232`
- Modify: `src/week-dashboard-server.js:80-141`
- Modify: `test/dashboard-server.test.js`
- Modify: `test/week-dashboard-server.test.js`

**Interfaces:**
- Consumes: `loadNfeloData({ fetchImpl, now })` and `buildNfeloContext({ input, nfeloData })` from `src/nfelo-client.js`.
- Produces: every detail `/api/comparison` payload has `nfelo: NfeloContext`; standalone and weekly servers make at most one two-file NFLelo load per server construction.

- [ ] **Step 1: Write failing server tests for a safe ready NFLelo payload**

Extend standalone and weekly server fixtures with an injected `nfeloClient` test double. Assert the client is loaded once at server construction, each detail payload has the exact `nfelo` contract returned by the context builder, query-driven historical-distance recomputation retains that same context, and `/api/slate` remains unchanged without NFLelo fields.

- [ ] **Step 2: Run the focused server tests to verify they fail**

Run: `node --test test/dashboard-server.test.js test/week-dashboard-server.test.js`

Expected: FAIL because comparison payloads do not yet expose `nfelo` and constructors do not accept the injected client.

- [ ] **Step 3: Integrate best-effort NFLelo initialization in `src/dashboard-server.js` and `src/week-dashboard-server.js`**

Add optional `nfeloClient` and `now` dependencies to both server factories. Await one `loadNfeloData` attempt during startup, hold its result privately, and call `buildNfeloContext` while creating each comparison payload. On loader rejection or builder rejection, attach only `{ status: 'unavailable', reason: 'source_unavailable' }` or the builder’s fixed safe unavailable result; do not log or expose upstream error text. Update `buildDashboardPayload(input, comparison, nfeloContext)` to project the supplied safe object verbatim through a strict allow-list rather than spreading it.

- [ ] **Step 4: Add failure-isolation and response-redaction tests**

Make the injected NFLelo loader reject with a URL/path/error-containing message. Verify both server types start, preserve existing payload/slate behavior, return only the unavailable status/reason, and never serialize the secret message, source URL, raw CSV marker, or unallowlisted fields. Verify the weekly server shares one loaded dataset across multiple ready game details.

- [ ] **Step 5: Run the focused server tests**

Run: `node --test test/dashboard-server.test.js test/week-dashboard-server.test.js`

Expected: PASS.

- [ ] **Step 6: Commit server integration**

```bash
git add src/dashboard-server.js src/week-dashboard-server.js test/dashboard-server.test.js test/week-dashboard-server.test.js
git commit -m "feat: add NFLelo context to dashboard payloads"
```

### Task 3: Render accessible NFLelo model context

**Files:**
- Modify: `public/dashboard/index.html:31-40`
- Modify: `public/dashboard/app.js:49-105`
- Modify: `public/dashboard/styles.css:45-55,86-102,140-154`
- Modify: `test/dashboard-client.test.js`
- Modify: `test/week-dashboard-browser.test.js`

**Interfaces:**
- Consumes: `data.nfelo` in the Task 2 `NfeloContext` contract.
- Produces: an `#nfelo-context` region that renders safe ready data or a non-sensitive unavailable state on standalone and `/games/<game-id>/` detail pages.

- [ ] **Step 1: Write failing client tests for ready and unavailable NFLelo rendering**

Extend the dashboard-client DOM fixture with `nfelo-context`. Add a ready `nfelo` sample and assert the rendered text includes the `NFLelo model context` heading, home/away projected spreads, rounded win/cover percentages, model-versus-market value, both team labels, four rating metrics, retrieval label, and informational-source copy. Add an unavailable sample and assert it renders a concise unavailable message without stale ready values. Add an asset assertion that no remote NFLelo URL occurs in HTML, JavaScript, or CSS.

- [ ] **Step 2: Run client tests to verify they fail**

Run: `node --test test/dashboard-client.test.js test/week-dashboard-browser.test.js`

Expected: FAIL because the NFLelo region and renderer do not exist.

- [ ] **Step 3: Add the accessible NFLelo region and renderer**

Add a section after the target panel with `id="nfelo-context"`, a heading, `aria-live="polite"`, and an HTML table whose columns preserve away/home orientation. Implement `renderNfelo()` in `public/dashboard/app.js`, called from the normal data render path. Use existing `spread()` and `percent()` formatting plus fixed decimal formatting for ratings, signed QB adjustment/points-versus-average, and a guarded retrieval-time display. Render the ready contract only when every expected safe value is finite; otherwise use the unavailable copy. Do not add a chart, browser fetch, pick language, or mutation of comparison/selection state.

- [ ] **Step 4: Style the card responsively without affecting weekly slate cards**

Add locally scoped `.nfelo-section` styles matching existing white-card/table presentation, tabular numerals, and a one-column small-screen layout. Preserve horizontal overflow for the rating table and existing visible focus/reduced-motion behavior. Confirm the shared detail stylesheet works identically for standalone and weekly-detail routes.

- [ ] **Step 5: Run client and browser tests**

Run: `node --test test/dashboard-client.test.js test/week-dashboard-browser.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the game-detail card**

```bash
git add public/dashboard/index.html public/dashboard/app.js public/dashboard/styles.css test/dashboard-client.test.js test/week-dashboard-browser.test.js
git commit -m "feat: display NFLelo model context"
```

### Task 4: Document startup-refresh behavior and verify the complete feature

**Files:**
- Modify: `README.md:121-149`

**Interfaces:**
- Consumes: the finished detail API/UI behavior from Tasks 1–3.
- Produces: user-facing documentation of the NFLelo source, startup-refresh lifecycle, displayed fields, spread orientation, unavailable behavior, and informational-only scope.

- [ ] **Step 1: Write the README NFLelo game-context section**

Near the local analysis board documentation, state that each dashboard server startup downloads NFLelo’s public `elo_snapshot.csv` and `nfelo_games.csv` once on the server, detail pages show current projection/rating context only, browser requests remain local, and source/match failures show unavailable without stopping the dashboard. List the displayed projection and rating fields, repeat negative-home-spread orientation, and state the context does not alter picks, confidence, rankings, or historical comparisons.

- [ ] **Step 2: Run all automated tests**

Run: `npm test`

Expected: PASS with zero failures.

- [ ] **Step 3: Perform a manual local smoke test**

Run: `npm run game:dashboard -- --season 2026 --game-id 2026_03_PHI_CHI --port 0`

Expected: a printed loopback URL on an OS-assigned port; open only that URL and verify the detail page shows either a fully formatted NFLelo card or its explicit unavailable state while all existing comparison content remains usable. Stop only this dashboard process afterward.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain NFLelo dashboard context"
```
